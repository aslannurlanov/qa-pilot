import { IdSchema, TestPlanSchema, TestSessionSchema } from "@/domain/schemas";
import type { GeneratedTestPlan, TestSession } from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";

function toDomainSession(record: Pick<TestSession, "id" | "title" | "description" | "generationStatus"> & { createdAt: Date; updatedAt: Date }) {
  return TestSessionSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function listTestSessions(db: PrismaClient) {
  const records = await db.testSession.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return records.map(toDomainSession);
}

export async function findTestSession(db: PrismaClient, id: string) {
  if (!IdSchema.safeParse(id).success) return null;
  const record = await db.testSession.findUnique({ where: { id } });
  return record ? toDomainSession(record) : null;
}

export async function saveGeneratedPlan(db: PrismaClient, sessionId: string, plan: GeneratedTestPlan) {
  // The validated plan, checks, and success status are committed together.
  await db.$transaction(async (tx) => {
    await tx.testPlan.create({
      data: {
        sessionId,
        summary: plan.summary,
        risksJson: JSON.stringify(plan.risks),
        questionsJson: JSON.stringify(plan.questions),
        ...plan.metadata,
        checks: {
          create: plan.checks.map((check) => ({
            id: check.id,
            position: check.position,
            type: check.type,
            title: check.title,
            stepsJson: JSON.stringify(check.steps),
            testDataJson: JSON.stringify(check.testData),
            expectedResult: check.expectedResult,
            reason: check.reason,
            basis: check.basis,
            sourceRefsJson: check.sourceRefs === undefined ? null : JSON.stringify(check.sourceRefs),
            excludedAt: null,
          })),
        },
      },
    });
    await tx.testSession.update({ where: { id: sessionId }, data: { generationStatus: "SUCCEEDED" } });
  });
}

export async function findSessionReview(db: PrismaClient, id: string) {
  if (!IdSchema.safeParse(id).success) return null;
  const record = await db.testSession.findUnique({
    where: { id },
    include: { plan: { include: { checks: { orderBy: { position: "asc" } } } } },
  });
  if (!record) return null;

  const { plan: storedPlan, ...storedSession } = record;
  const session = toDomainSession(storedSession);
  const plan = storedPlan === null ? null : TestPlanSchema.parse({
    id: storedPlan.id,
    sessionId: storedPlan.sessionId,
    summary: storedPlan.summary,
    risks: JSON.parse(storedPlan.risksJson),
    questions: JSON.parse(storedPlan.questionsJson),
    metadata: {
      schemaVersion: storedPlan.schemaVersion,
      promptVersion: storedPlan.promptVersion,
      provider: storedPlan.provider,
      model: storedPlan.model,
    },
    createdAt: storedPlan.createdAt.toISOString(),
    checks: storedPlan.checks.map((check) => ({
      id: check.id,
      position: check.position,
      type: check.type,
      title: check.title,
      steps: JSON.parse(check.stepsJson),
      testData: JSON.parse(check.testDataJson),
      expectedResult: check.expectedResult,
      reason: check.reason,
      basis: check.basis,
      ...(check.sourceRefsJson === null ? {} : { sourceRefs: JSON.parse(check.sourceRefsJson) }),
      excludedAt: check.excludedAt?.toISOString() ?? null,
    })),
  });
  return { session, plan };
}
