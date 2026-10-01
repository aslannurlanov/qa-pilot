import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AddManualCheckSchema, SetCheckExcludedSchema, UpdateCheckSchema } from "@/domain/schemas/plan-review";
import { CheckContentSchema, MAX_PLAN_CHECKS } from "@/domain/schemas/plan";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { acquirePlanWriteGuard, isPlanWriteBusy } from "./plan-write-guard";

export type ReviewResult = { status: "saved" | "unchanged"; checkId?: string }
  | { status: "validation"; fields: string[] }
  | { status: "not-found" | "missing-plan" | "frozen" | "limit" | "busy" | "unavailable" };

async function mutate<T extends { sessionId: string }>(db: PrismaClient, schema: z.ZodType<T>, raw: unknown,
  operation: (tx: Prisma.TransactionClient, planId: string, input: T) => Promise<ReviewResult>): Promise<ReviewResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { status: "validation", fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] === "content" ? issue.path[1] : issue.path[0])))] };
  try {
    return await db.$transaction(async (tx) => {
      const acquired = await acquirePlanWriteGuard(tx, parsed.data.sessionId);
      const plan = await tx.testPlan.findUnique({ where: { sessionId: parsed.data.sessionId }, include: { run: true } });
      if (!plan) return { status: "missing-plan" };
      if (plan.run) return { status: "frozen" };
      if (!acquired) return { status: "missing-plan" };
      return operation(tx, plan.id, parsed.data);
    });
  } catch (error) { return { status: isPlanWriteBusy(error) ? "busy" : "unavailable" }; }
}

export function updateCheck(db: PrismaClient, raw: unknown) {
  return mutate(db, UpdateCheckSchema, raw, async (tx, planId, input) => {
    const check = await tx.testCheck.findUnique({ where: { planId_id: { planId, id: input.checkId } } });
    if (!check) return { status: "not-found" };
    const before = CheckContentSchema.parse({ title: check.title, type: check.type, steps: JSON.parse(check.stepsJson),
      testData: JSON.parse(check.testDataJson), expectedResult: check.expectedResult, reason: check.reason, basis: check.basis });
    if (JSON.stringify(before) === JSON.stringify(input.content)) return { status: "unchanged" };
    const { steps, testData, ...content } = input.content;
    await tx.testCheck.update({ where: { planId_id: { planId, id: input.checkId } },
      data: { ...content, stepsJson: JSON.stringify(steps), testDataJson: JSON.stringify(testData), editedAt: new Date() } });
    return { status: "saved" };
  });
}

export function addManualCheck(db: PrismaClient, raw: unknown) {
  return mutate(db, AddManualCheckSchema, raw, async (tx, planId, input) => {
    const checks = await tx.testCheck.findMany({ where: { planId }, select: { position: true } });
    if (checks.length >= MAX_PLAN_CHECKS) return { status: "limit" };
    const position = checks.length ? Math.max(...checks.map((check) => check.position)) + 1 : 0;
    if (!Number.isSafeInteger(position)) return { status: "unavailable" };
    const id = randomUUID();
    const { steps, testData, ...content } = input.content;
    await tx.testCheck.create({ data: { ...content, id, planId, position, stepsJson: JSON.stringify(steps), testDataJson: JSON.stringify(testData),
      sourceRefsJson: null, excludedAt: null, origin: "MANUAL", editedAt: null } });
    return { status: "saved", checkId: id };
  });
}

export function setCheckExcluded(db: PrismaClient, raw: unknown) {
  return mutate(db, SetCheckExcludedSchema, raw, async (tx, planId, input) => {
    const check = await tx.testCheck.findUnique({ where: { planId_id: { planId, id: input.checkId } } });
    if (!check) return { status: "not-found" };
    if ((check.excludedAt !== null) === input.excluded) return { status: "unchanged" };
    await tx.testCheck.update({ where: { planId_id: { planId, id: input.checkId } }, data: { excludedAt: input.excluded ? new Date() : null } });
    return { status: "saved" };
  });
}
