import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";
import { createDatabaseClient } from "@/server/db";
import { analyzeTestSession } from "@/server/services/analyze-test-session";
import { getExecution, recordCheckResult, ResultInputSchema, startOrResumeRun } from "@/server/services/execute-test-plan";
import { applyTestMigrations } from "../helpers/sqlite";

let db: PrismaClient;
let directory: string;
let url: string;
let sessionId: string;

beforeEach(async () => {
  mkdirSync(resolve(".runtime"), { recursive: true });
  directory = mkdtempSync(join(resolve(".runtime"), "execution-test-"));
  const path = join(directory, "test.db");
  applyTestMigrations(path);
  url = `file:${path.replaceAll("\\", "/")}`;
  db = createDatabaseClient(url);
  sessionId = randomUUID();
  await analyzeTestSession(db, new FakeAIProvider(), sessionId, usernameTask);
});

afterEach(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

describe("manual execution", () => {
  it("creates one run, resumes it, and persists progress in a new connection", async () => {
    const first = await startOrResumeRun(db, sessionId);
    const resumed = await startOrResumeRun(db, sessionId);
    expect(first?.id).toBe(resumed?.id);
    expect(await db.testRun.count()).toBe(1);
    expect((await getExecution(db, sessionId))?.current?.id).toBe(usernamePlan.checks[0]?.id);
    const other = createDatabaseClient(url);
    try {
      expect((await getExecution(other, sessionId))?.run?.id).toBe(first?.id);
    } finally {
      await other.$disconnect();
    }
  });

  it("keeps one run and one result when start and PASS are submitted concurrently", async () => {
    const starts = await Promise.allSettled([startOrResumeRun(db, sessionId), startOrResumeRun(db, sessionId)]);
    expect(starts.every((entry) => entry.status === "fulfilled")).toBe(true);
    expect(await db.testRun.count()).toBe(1);
    const checkId = usernamePlan.checks[0]!.id;
    const results = await Promise.allSettled([
      recordCheckResult(db, sessionId, { checkId, outcome: "PASS" }),
      recordCheckResult(db, sessionId, { checkId, outcome: "PASS" }),
    ]);
    expect(results.every((entry) => entry.status === "fulfilled")).toBe(true);
    expect(await db.checkResult.count()).toBe(1);
    expect((await getExecution(db, sessionId))?.progress.done).toBe(1);
  });

  it("rejects missing FAIL/BLOCKED detail, saves valid details and comments, and skips completed checks", async () => {
    await startOrResumeRun(db, sessionId);
    const positive = usernamePlan.checks[0]!;
    const negative = usernamePlan.checks[1]!;
    const boundary = usernamePlan.checks[2]!;
    expect(ResultInputSchema.safeParse({ checkId: negative.id, outcome: "FAIL", actualResult: " ", comment: "" }).success).toBe(false);
    expect(ResultInputSchema.safeParse({ checkId: boundary.id, outcome: "BLOCKED", reason: " ", comment: "" }).success).toBe(false);
    expect(await db.checkResult.count()).toBe(0);
    expect(await recordCheckResult(db, sessionId, { checkId: positive.id, outcome: "PASS" })).toBe("recorded");
    expect(await recordCheckResult(db, sessionId, { checkId: positive.id, outcome: "PASS" })).toBe("already-recorded");
    expect(await db.checkResult.count()).toBe(1);
    expect((await db.checkResult.findFirstOrThrow()).actualResult).toBeNull();
    expect((await getExecution(db, sessionId))?.current?.id).toBe(negative.id);
    expect(await recordCheckResult(db, sessionId, { checkId: negative.id, outcome: "FAIL", actualResult: "Кнопка не сработала", comment: "Повторено дважды" })).toBe("recorded");
    expect(await recordCheckResult(db, sessionId, { checkId: boundary.id, outcome: "BLOCKED", reason: "Нет доступа", comment: "Нужен тестовый аккаунт" })).toBe("recorded");
    const other = createDatabaseClient(url);
    try {
      const state = await getExecution(other, sessionId);
      expect(state?.current?.id).toBe(usernamePlan.checks[3]?.id);
      expect(state?.progress).toMatchObject({ total: 4, done: 3, PASS: 1, FAIL: 1, BLOCKED: 1 });
      expect(state?.results.find((result) => result.outcome === "FAIL")).toMatchObject({ actualResult: "Кнопка не сработала", comment: "Повторено дважды" });
      expect(state?.results.find((result) => result.outcome === "BLOCKED")).toMatchObject({ reason: "Нет доступа", comment: "Нужен тестовый аккаунт" });
      expect(state?.run?.status).toBe("IN_PROGRESS");
    } finally {
      await other.$disconnect();
    }
  });

  it("allows only the first unresolved check and completes after the final result", async () => {
    await startOrResumeRun(db, sessionId);
    const first = usernamePlan.checks[0]!;
    const second = usernamePlan.checks[1]!;
    const third = usernamePlan.checks[2]!;
    const fourth = usernamePlan.checks[3]!;
    expect(await recordCheckResult(db, sessionId, { checkId: second.id, outcome: "PASS" })).toBe("stale-check");
    expect(await db.checkResult.count()).toBe(0);
    for (const check of [first, second, third]) await recordCheckResult(db, sessionId, { checkId: check.id, outcome: "PASS" });
    expect((await getExecution(db, sessionId))?.run?.status).toBe("IN_PROGRESS");
    await recordCheckResult(db, sessionId, { checkId: fourth.id, outcome: "BLOCKED", reason: "Среда недоступна", comment: "" });
    const state = await getExecution(db, sessionId);
    expect(state?.current).toBeNull();
    expect(state?.progress).toMatchObject({ total: 4, done: 4, PASS: 3, FAIL: 0, BLOCKED: 1 });
    expect(state?.run?.status).toBe("COMPLETED");
    expect(state?.run?.completedAt).toBeTruthy();
    expect((await startOrResumeRun(db, sessionId))?.id).toBe(state?.run?.id);
    expect(await recordCheckResult(db, sessionId, { checkId: fourth.id, outcome: "BLOCKED", reason: "Другая причина", comment: "" })).toBe("already-recorded");
    expect(await db.checkResult.count()).toBe(4);
  });
});
