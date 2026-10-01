import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CheckOutcome } from "@/domain/schemas";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";
import { createDatabaseClient } from "@/server/db";
import { analyzeTestSession } from "@/server/services/analyze-test-session";
import { startOrResumeRun, recordCheckResult } from "@/server/services/execute-test-plan";
import { createOrOpenBugReport } from "@/server/services/bug-reports";
import { getTestingReport } from "@/server/services/testing-report";
import { applyTestMigrations } from "../helpers/sqlite";

let db: PrismaClient;
let directory: string;
let url: string;
let sessionId: string;
beforeEach(async () => {
  mkdirSync(resolve(".runtime"), { recursive: true });
  directory = mkdtempSync(join(resolve(".runtime"), "report-test-"));
  const path = join(directory, "test.db");
  applyTestMigrations(path);
  url = `file:${path.replaceAll("\\", "/")}`;
  db = createDatabaseClient(url);
  sessionId = randomUUID();
  await analyzeTestSession(db, new FakeAIProvider(), sessionId, usernameTask);
});
afterEach(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

async function complete(outcomes: CheckOutcome[] = ["PASS", "FAIL", "BLOCKED", "PASS"]) {
  await startOrResumeRun(db, sessionId);
  for (const [index, outcome] of outcomes.entries()) {
    await recordCheckResult(db, sessionId, {
      checkId: usernamePlan.checks[index]!.id,
      ...(outcome === "PASS" ? { outcome } : outcome === "FAIL" ? { outcome, actualResult: "Ошибка\nВторая строка", comment: "Комментарий ошибки" } : { outcome, reason: "Нет доступа", comment: "" }),
    });
  }
}

async function persistedRecords() {
  return { sessions: await db.testSession.findMany(), plans: await db.testPlan.findMany(), checks: await db.testCheck.findMany(), runs: await db.testRun.findMany(), results: await db.checkResult.findMany(), bugs: await db.bugReport.findMany(), attachments: await db.attachment.findMany() };
}

describe("read-only final reports", () => {
  it("retrieves persisted completion, preserves details, performs no writes, and sees a later explicit bug", async () => {
    await complete();
    const before = await persistedRecords();
    const state = await getTestingReport(db, sessionId);
    expect(state.status).toBe("ready");
    if (state.status !== "ready") throw new Error("Report missing");
    expect(state.report.totals).toEqual({ total: 4, pass: 2, fail: 1, blocked: 1, recorded: 4, unresolved: 0 });
    expect(state.report.entries[1]).toMatchObject({ result: { actualResult: "Ошибка\nВторая строка", comment: "Комментарий ошибки" }, bugUrl: null });
    expect(state.report.entries[2]).toMatchObject({ result: { reason: "Нет доступа" } });
    expect(await persistedRecords()).toEqual(before);
    const other = createDatabaseClient(url);
    try { expect(await getTestingReport(other, sessionId)).toEqual(state); } finally { await other.$disconnect(); }
    expect(await persistedRecords()).toEqual(before);
    const result = state.report.entries[1]!.result;
    await createOrOpenBugReport(db, sessionId, result.id);
    const afterBug = await persistedRecords();
    const refreshed = await getTestingReport(db, sessionId);
    expect(refreshed.status).toBe("ready");
    if (refreshed.status === "ready") expect(refreshed.report.entries[1]?.bugUrl).toBe(`/sessions/${sessionId}/run/bugs/${result.id}`);
    expect(await persistedRecords()).toEqual(afterBug);
  });
  it("handles unknown IDs, missing runs, unfinished runs, and zero-check clarification plans", async () => {
    expect(await getTestingReport(db, "bad/id")).toEqual({ status: "not-found" });
    expect(await getTestingReport(db, "unknown")).toEqual({ status: "not-found" });
    expect(await getTestingReport(db, sessionId)).toEqual({ status: "not-started" });
    await startOrResumeRun(db, sessionId);
    expect(await getTestingReport(db, sessionId)).toEqual({ status: "unfinished" });
    const clarificationId = randomUUID();
    await analyzeTestSession(db, { generateTestPlan: async () => ({ ...usernamePlan, checks: [] }) }, clarificationId, usernameTask);
    await expect(startOrResumeRun(db, clarificationId)).rejects.toMatchObject({ code: "empty-scope" });
    expect(await getTestingReport(db, clarificationId)).toEqual({ status: "not-started" });
  });
  it("does not leak another session's outcomes or bugs", async () => {
    await complete();
    const otherId = randomUUID();
    await analyzeTestSession(db, new FakeAIProvider(), otherId, { ...usernameTask, title: "Другая задача" });
    await startOrResumeRun(db, otherId);
    for (const check of usernamePlan.checks) await recordCheckResult(db, otherId, { checkId: check.id, outcome: "PASS" });
    const state = await getTestingReport(db, otherId);
    if (state.status !== "ready") throw new Error("Report missing");
    expect(state.report.session.id).toBe(otherId);
    expect(state.report.totals.fail).toBe(0);
    expect(state.report.entries.every(({ result, bugUrl }) => result.runId === state.report.run.id && result.planId === state.report.plan.id && bugUrl === null)).toBe(true);
  });
  it("rejects completed data with missing results or corrupt stored content safely", async () => {
    const run = await startOrResumeRun(db, sessionId);
    await db.testRun.update({ where: { id: run!.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    expect(await getTestingReport(db, sessionId)).toEqual({ status: "invalid" });
    await db.testPlan.update({ where: { sessionId }, data: { risksJson: "not JSON" } });
    expect(await getTestingReport(db, sessionId)).toEqual({ status: "invalid" });
  });
  it("reports a BLOCKED-only run as recorded but never passed", async () => {
    await complete(["BLOCKED", "BLOCKED", "BLOCKED", "BLOCKED"]);
    const state = await getTestingReport(db, sessionId);
    if (state.status !== "ready") throw new Error("Report missing");
    expect(state.report.totals).toMatchObject({ pass: 0, fail: 0, blocked: 4, recorded: 4, unresolved: 0 });
    expect(state.report.conclusion).toBe("Ошибки не зафиксированы; часть проверок заблокирована.");
  });
  it("respects excluded checks without introducing an exclusion operation", async () => {
    const plan = await db.testPlan.findUniqueOrThrow({ where: { sessionId } });
    await db.testCheck.update({ where: { planId_id: { planId: plan.id, id: usernamePlan.checks[3]!.id } }, data: { excludedAt: new Date() } });
    await complete(["PASS", "FAIL", "BLOCKED"]);
    const state = await getTestingReport(db, sessionId);
    if (state.status !== "ready") throw new Error("Report missing");
    expect(state.report.totals.total).toBe(3);
    expect(state.report.entries).toHaveLength(3);
  });
});
