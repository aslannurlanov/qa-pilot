import { randomUUID } from "node:crypto";
import { BugReportSchema, CheckResultSchema, IdSchema, TestCheckSchema } from "@/domain/schemas";
import { BugReportForResultSchema } from "@/domain/rules/bug-report";
import type { PrismaClient } from "@/generated/prisma/client";

function scopedResult(sessionId: string, resultId: string) {
  return { id: resultId, outcome: "FAIL" as const, run: { plan: { sessionId } }, check: { plan: { sessionId } } };
}

function readReport(stored: {
  id: string; resultId: string; title: string; preconditionsJson: string; stepsToReproduceJson: string;
  testDataJson: string; actualResult: string; expectedResult: string; comment: string | null;
  environment: string | null; attachmentIdsJson: string; createdAt: Date;
}) {
  return BugReportSchema.parse({
    id: stored.id, resultId: stored.resultId, title: stored.title,
    preconditions: JSON.parse(stored.preconditionsJson), stepsToReproduce: JSON.parse(stored.stepsToReproduceJson),
    testData: JSON.parse(stored.testDataJson), actualResult: stored.actualResult, expectedResult: stored.expectedResult,
    comment: stored.comment, environment: stored.environment, attachmentIds: JSON.parse(stored.attachmentIdsJson), createdAt: stored.createdAt.toISOString(),
  });
}

export async function findBugReport(db: PrismaClient, sessionId: string, resultId: string) {
  if (!IdSchema.safeParse(sessionId).success || !IdSchema.safeParse(resultId).success) return null;
  const source = await db.checkResult.findFirst({
    where: scopedResult(sessionId, resultId),
    include: { bug: true, check: true, run: { include: { plan: { include: { session: true } } } } },
  });
  if (!source?.bug) return null;
  return { report: readReport(source.bug), taskTitle: source.run.plan.session.title, checkId: source.check.id, checkType: source.check.type };
}

export async function createOrOpenBugReport(db: PrismaClient, sessionId: string, resultId: string) {
  if (!IdSchema.safeParse(sessionId).success || !IdSchema.safeParse(resultId).success) return null;
  try {
    return await db.$transaction(async (tx) => {
      const source = await tx.checkResult.findFirst({ where: scopedResult(sessionId, resultId), include: { bug: true, check: true } });
      if (!source) return null;
      if (source.bug) return readReport(source.bug);
      const check = TestCheckSchema.parse({
        id: source.check.id, position: source.check.position, type: source.check.type, title: source.check.title,
        steps: JSON.parse(source.check.stepsJson), testData: JSON.parse(source.check.testDataJson),
        expectedResult: source.check.expectedResult, reason: source.check.reason, basis: source.check.basis,
        ...(source.check.sourceRefsJson ? { sourceRefs: JSON.parse(source.check.sourceRefsJson) } : {}),
        excludedAt: source.check.excludedAt?.toISOString() ?? null,
        origin: source.check.origin, editedAt: source.check.editedAt?.toISOString() ?? null,
      });
      const result = CheckResultSchema.parse({
        id: source.id, runId: source.runId, planId: source.planId, checkId: source.checkId,
        outcome: source.outcome, actualResult: source.actualResult, recordedAt: source.recordedAt.toISOString(),
        ...(source.comment ? { comment: source.comment } : {}),
      });
      const report = BugReportSchema.parse({
        id: randomUUID(), resultId: source.id, title: `[Ошибка] ${check.title}`.slice(0, 200),
        preconditions: [], stepsToReproduce: check.steps, testData: check.testData,
        actualResult: source.actualResult, expectedResult: check.expectedResult, comment: source.comment,
        environment: null, attachmentIds: [], createdAt: new Date().toISOString(),
      });
      BugReportForResultSchema.parse({ report, result, existingReports: [] });
      const stored = await tx.bugReport.create({ data: {
        id: report.id, resultId: report.resultId, title: report.title,
        preconditionsJson: JSON.stringify(report.preconditions), stepsToReproduceJson: JSON.stringify(report.stepsToReproduce),
        testDataJson: JSON.stringify(report.testData), actualResult: report.actualResult, expectedResult: report.expectedResult,
        comment: report.comment, environment: null, attachmentIdsJson: "[]", createdAt: new Date(report.createdAt),
      } });
      return readReport(stored);
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = await findBugReport(db, sessionId, resultId);
      if (existing) return existing.report;
    }
    throw error;
  }
}
