import { z } from "zod";
import { IdSchema, TestRunSchema, CheckResultSchema } from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import { findSessionReview } from "@/server/repositories/test-sessions";

export const ResultInputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ checkId: IdSchema, outcome: z.literal("PASS") }),
  z.strictObject({ checkId: IdSchema, outcome: z.literal("FAIL"), actualResult: z.string().trim().min(1).max(5_000), comment: z.string().trim().max(5_000) }),
  z.strictObject({ checkId: IdSchema, outcome: z.literal("BLOCKED"), reason: z.string().trim().min(1).max(5_000), comment: z.string().trim().max(5_000) }),
]);

export type ResultInput = z.infer<typeof ResultInputSchema>;

export async function startOrResumeRun(db: PrismaClient, sessionId: string) {
  const id = IdSchema.parse(sessionId);
  const session = await db.testSession.findUnique({ where: { id }, include: { plan: { include: { checks: true } } } });
  if (!session?.plan || session.generationStatus !== "SUCCEEDED" || !session.plan.checks.some((check) => check.excludedAt === null)) return null;
  // The unique planId constraint is the final guard for concurrent starts.
  try {
    const run = await db.testRun.upsert({ where: { planId: session.plan.id }, create: { planId: session.plan.id }, update: {} });
    return TestRunSchema.parse({ ...run, startedAt: run.startedAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null });
  } catch (error) {
    if (isUniqueConflict(error)) {
      const run = await db.testRun.findUniqueOrThrow({ where: { planId: session.plan.id } });
      return TestRunSchema.parse({ ...run, startedAt: run.startedAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null });
    }
    throw error;
  }
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function getExecution(db: PrismaClient, sessionId: string) {
  const review = await findSessionReview(db, sessionId);
  if (!review?.plan) return null;
  const stored = await db.testRun.findUnique({
    where: { planId: review.plan.id },
    include: { results: { orderBy: { recordedAt: "asc" }, include: { bug: { select: { id: true } } } } },
  });
  if (!stored) return { ...review, run: null, results: [], bugResultIds: [], checks: [], current: null, progress: { total: 0, done: 0, PASS: 0, FAIL: 0, BLOCKED: 0 } };
  const run = TestRunSchema.parse({ id: stored.id, planId: stored.planId, status: stored.status, startedAt: stored.startedAt.toISOString(), completedAt: stored.completedAt?.toISOString() ?? null });
  const results = stored.results.map((result) => CheckResultSchema.parse({
    id: result.id, runId: result.runId, planId: result.planId, checkId: result.checkId,
    outcome: result.outcome, recordedAt: result.recordedAt.toISOString(),
    ...(result.outcome === "FAIL" ? { actualResult: result.actualResult } : {}),
    ...(result.outcome === "BLOCKED" ? { reason: result.reason } : {}),
    ...(result.comment ? { comment: result.comment } : {}),
  }));
  const checks = review.plan.checks.filter((check) => check.excludedAt === null);
  const resolved = new Set(results.map((result) => result.checkId));
  const current = checks.find((check) => !resolved.has(check.id)) ?? null;
  const progress = {
    total: checks.length, done: results.length,
    PASS: results.filter((result) => result.outcome === "PASS").length,
    FAIL: results.filter((result) => result.outcome === "FAIL").length,
    BLOCKED: results.filter((result) => result.outcome === "BLOCKED").length,
  };
  return { ...review, run, results, bugResultIds: stored.results.filter((result) => result.bug !== null).map((result) => result.id), checks, current, progress };
}

export async function recordCheckResult(db: PrismaClient, sessionId: string, raw: unknown) {
  const id = IdSchema.parse(sessionId);
  const input = ResultInputSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const session = await tx.testSession.findUnique({ where: { id }, include: { plan: { include: { checks: { orderBy: { position: "asc" } }, run: { include: { results: true } } } } } });
      const plan = session?.plan;
      const run = plan?.run;
      if (!run || !plan || session.generationStatus !== "SUCCEEDED") throw new Error("Run not found.");
      if (run.results.some((result) => result.checkId === input.checkId)) return "already-recorded" as const;
      if (run.status === "COMPLETED") return "completed" as const;
      const executable = plan.checks.filter((check) => check.excludedAt === null);
      const completed = new Set(run.results.map((result) => result.checkId));
      const next = executable.find((check) => !completed.has(check.id));
      if (next?.id !== input.checkId) return "stale-check" as const;
      await tx.checkResult.create({ data: {
        runId: run.id, planId: plan.id, checkId: input.checkId, outcome: input.outcome,
        ...(input.outcome === "FAIL" ? { actualResult: input.actualResult, comment: input.comment || null } : {}),
        ...(input.outcome === "BLOCKED" ? { reason: input.reason, comment: input.comment || null } : {}),
      } });
      if (completed.size + 1 === executable.length) {
        await tx.testRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      }
      return "recorded" as const;
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      const execution = await getExecution(db, id);
      if (execution?.results.some((result) => result.checkId === input.checkId)) return "already-recorded" as const;
    }
    throw error;
  }
}
