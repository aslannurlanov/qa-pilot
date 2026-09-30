import { ZodError } from "zod";
import { IdSchema } from "@/domain/schemas";
import { buildTestingReport, ReportIntegrityError, type TestingReport } from "@/domain/rules/testing-report";
import type { PrismaClient } from "@/generated/prisma/client";
import { getExecution } from "./execute-test-plan";

export type TestingReportState =
  | { status: "ready"; report: TestingReport }
  | { status: "not-found" | "not-started" | "unfinished" | "invalid" | "unavailable" };

export async function getTestingReport(db: PrismaClient, sessionId: string): Promise<TestingReportState> {
  if (!IdSchema.safeParse(sessionId).success) return { status: "not-found" };
  try {
    // One read transaction reuses the scoped execution queries, including bug associations.
    // No write or per-bug query is performed; a later explicit bug creation appears on refresh.
    return await db.$transaction(async (tx): Promise<TestingReportState> => {
      const execution = await getExecution(tx, sessionId);
      if (!execution) return { status: "not-found" };
      if (!execution.run) return { status: "not-started" };
      if (execution.run.status !== "COMPLETED") return { status: "unfinished" };
      const { session, plan, run, results, bugResultIds } = execution;
      return { status: "ready", report: buildTestingReport({ session, plan, run, results, bugResultIds }, sessionId) };
    });
  } catch (error) {
    return { status: error instanceof ZodError || error instanceof SyntaxError || error instanceof ReportIntegrityError ? "invalid" : "unavailable" };
  }
}
