import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";
import { createDatabaseClient } from "@/server/db";
import { analyzeTestSession } from "@/server/services/analyze-test-session";
import { recordCheckResult, startOrResumeRun, getExecution } from "@/server/services/execute-test-plan";
import { createOrOpenBugReport, findBugReport } from "@/server/services/bug-reports";
import { applyTestMigrations } from "../helpers/sqlite";

let db: PrismaClient;
let directory: string;
let sessionId: string;
let url: string;

async function failedResult() {
  await recordCheckResult(db, sessionId, { checkId: usernamePlan.checks[0]!.id, outcome: "FAIL", actualResult: "Получена ошибка регистрации.", comment: "Повторено дважды." });
  return db.checkResult.findFirstOrThrow({ where: { run: { plan: { sessionId } } } });
}

beforeEach(async () => {
  mkdirSync(resolve(".runtime"), { recursive: true });
  directory = mkdtempSync(join(resolve(".runtime"), "bug-test-"));
  const path = join(directory, "test.db");
  applyTestMigrations(path);
  url = `file:${path.replaceAll("\\", "/")}`;
  db = createDatabaseClient(url);
  sessionId = randomUUID();
  await analyzeTestSession(db, new FakeAIProvider(), sessionId, usernameTask);
  await startOrResumeRun(db, sessionId);
});
afterEach(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

describe("deterministic bug reports", () => {
  it("creates an explicit FAIL-only snapshot with all reproduction details and one report", async () => {
    const result = await failedResult();
    expect(await db.bugReport.count()).toBe(0);
    const report = await createOrOpenBugReport(db, sessionId, result.id);
    expect(report).toMatchObject({
      resultId: result.id, title: `[Ошибка] ${usernamePlan.checks[0]!.title}`,
      preconditions: [], stepsToReproduce: usernamePlan.checks[0]!.steps, testData: usernamePlan.checks[0]!.testData,
      actualResult: result.actualResult, expectedResult: usernamePlan.checks[0]!.expectedResult,
      comment: result.comment, environment: null, attachmentIds: [],
    });
    expect(await createOrOpenBugReport(db, sessionId, result.id)).toEqual(report);
    expect(await db.bugReport.count()).toBe(1);
    expect((await getExecution(db, sessionId))?.bugResultIds).toEqual([result.id]);
  });
  it.each(["PASS", "BLOCKED"] as const)("rejects %s without creating a report", async (outcome) => {
    await recordCheckResult(db, sessionId, outcome === "PASS" ? { checkId: usernamePlan.checks[0]!.id, outcome } : { checkId: usernamePlan.checks[0]!.id, outcome, reason: "Нет доступа", comment: "" });
    const result = await db.checkResult.findFirstOrThrow();
    expect(await createOrOpenBugReport(db, sessionId, result.id)).toBeNull();
    expect(await findBugReport(db, sessionId, result.id)).toBeNull();
    expect(await db.bugReport.count()).toBe(0);
  });
  it("rejects cross-session IDs, run IDs in place of result IDs, missing and malformed IDs", async () => {
    const result = await failedResult();
    const otherId = randomUUID();
    await analyzeTestSession(db, new FakeAIProvider(), otherId, usernameTask);
    await startOrResumeRun(db, otherId);
    for (const [session, id] of [[otherId, result.id], [sessionId, result.runId], [sessionId, "missing"], ["bad/id", result.id]]) {
      expect(await createOrOpenBugReport(db, session!, id!)).toBeNull();
    }
    await createOrOpenBugReport(db, sessionId, result.id);
    expect(await findBugReport(db, otherId, result.id)).toBeNull();
    expect(await findBugReport(db, sessionId, "missing")).toBeNull();
  });
  it("retains the persisted report after source changes and a new connection", async () => {
    const result = await failedResult();
    const report = await createOrOpenBugReport(db, sessionId, result.id);
    await db.testCheck.update({ where: { planId_id: { planId: result.planId, id: result.checkId } }, data: { title: "Изменённый заголовок", stepsJson: '["Изменённый шаг"]', testDataJson: "[]", expectedResult: "Другой результат" } });
    await db.checkResult.update({ where: { id: result.id }, data: { actualResult: "Изменено", comment: "Изменено" } });
    const other = createDatabaseClient(url);
    try {
      expect((await findBugReport(other, sessionId, result.id))?.report).toEqual(report);
      expect(await createOrOpenBugReport(other, sessionId, result.id)).toEqual(report);
    } finally { await other.$disconnect(); }
  });
  it("handles concurrent creation without duplicate reports", async () => {
    const result = await failedResult();
    const reports = await Promise.all([createOrOpenBugReport(db, sessionId, result.id), createOrOpenBugReport(db, sessionId, result.id)]);
    expect(reports[0]?.id).toBe(reports[1]?.id);
    expect(await db.bugReport.count()).toBe(1);
  });
  it("adds the nullable comment column without losing existing rows", () => {
    const sql = new DatabaseSync(join(directory, "old.db"));
    try {
      sql.exec(readFileSync(resolve("prisma/migrations/20260929112600_init/migration.sql"), "utf8"));
      sql.exec(`
        INSERT INTO TestSession (id, title, description, generationStatus, updatedAt) VALUES ('old-session', 'Задача', 'Описание', 'SUCCEEDED', CURRENT_TIMESTAMP);
        INSERT INTO TestPlan (id, sessionId, summary, risksJson, questionsJson, schemaVersion, promptVersion, provider, model) VALUES ('old-plan', 'old-session', 'План', '[]', '[]', '1', 'fixture-v1', 'fake', 'fixture');
        INSERT INTO TestCheck (id, planId, position, type, title, stepsJson, testDataJson, expectedResult, reason, basis) VALUES ('old-check', 'old-plan', 0, 'positive', 'Проверка', '["Шаг"]', '[]', 'Успех', 'Требование', 'requirement');
        INSERT INTO TestRun (id, planId) VALUES ('old-run', 'old-plan');
        INSERT INTO CheckResult (id, runId, planId, checkId, outcome, actualResult) VALUES ('old-result', 'old-run', 'old-plan', 'old-check', 'FAIL', 'Ошибка');
      `);
      sql.prepare("INSERT INTO BugReport (id, resultId, title, preconditionsJson, stepsToReproduceJson, testDataJson, actualResult, expectedResult, attachmentIdsJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run("old-bug", "old-result", "Старый отчёт", "[]", '["Шаг"]', "[]", "Ошибка", "Успех", "[]");
      sql.exec(readFileSync(resolve("prisma/migrations/20260930120000_bug_report_comment/migration.sql"), "utf8"));
      expect(sql.prepare("SELECT title, comment FROM BugReport WHERE id = ?").get("old-bug")).toMatchObject({ title: "Старый отчёт", comment: null });
      expect(sql.prepare("SELECT title FROM TestSession WHERE id = 'old-session'").get()).toMatchObject({ title: "Задача" });
    } finally { sql.close(); }
  });
});
