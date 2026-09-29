import { IdSchema, TaskInputSchema } from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AIProvider } from "@/server/ai/provider";
import { saveGeneratedPlan } from "@/server/repositories/test-sessions";
import { generateTestPlan } from "./generate-test-plan";

export class AnalysisInProgressError extends Error {}

export async function analyzeTestSession(
  db: PrismaClient,
  provider: AIProvider,
  sessionId: string,
  task: unknown,
): Promise<string> {
  const id = IdSchema.parse(sessionId);
  const input = TaskInputSchema.parse(task);
  // A stable ID per form makes resubmissions reuse the saved session/plan.
  const session = await db.testSession.upsert({
    where: { id },
    create: { id, ...input },
    update: {},
  });
  if (session.generationStatus === "SUCCEEDED") return id;

  const claimed = await db.testSession.updateMany({
    where: { id, generationStatus: { in: ["IDLE", "FAILED"] } },
    data: { ...input, generationStatus: "RUNNING" },
  });
  if (claimed.count === 0) {
    // Another submission may have completed between the read and the claim.
    const current = await db.testSession.findUniqueOrThrow({ where: { id } });
    if (current.generationStatus === "SUCCEEDED") return id;
    throw new AnalysisInProgressError("This session is already being analyzed.");
  }

  try {
    const plan = await generateTestPlan(input, provider);
    await saveGeneratedPlan(db, id, plan);
    return id;
  } catch (error) {
    await db.testSession.updateMany({
      where: { id, generationStatus: "RUNNING" },
      data: { generationStatus: "FAILED" },
    });
    throw error;
  }
}
