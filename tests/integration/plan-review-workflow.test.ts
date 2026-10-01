import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { CheckContentSchema } from "@/domain/schemas/plan";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";
import { analyzeTestSession } from "@/server/services/analyze-test-session";
import { addManualCheck, setCheckExcluded, updateCheck } from "@/server/services/review-test-plan";
import { getExecution, recordCheckResult, startOrResumeRun } from "@/server/services/execute-test-plan";
import { createOrOpenBugReport, findBugReport } from "@/server/services/bug-reports";
import { getTestingReport } from "@/server/services/testing-report";
import { findSessionReview } from "@/server/repositories/test-sessions";
import { acquirePlanWriteGuard } from "@/server/services/plan-write-guard";
import { applyTestMigrations } from "../helpers/sqlite";

let db: PrismaClient;
let directory: string;
let path: string;
let url: string;
let sessionId: string;
const clients: PrismaClient[] = [];
const content = () => { const c = usernamePlan.checks[0]!; return CheckContentSchema.parse({ title: c.title, type: c.type, steps: c.steps, testData: c.testData, expectedResult: c.expectedResult, reason: c.reason, basis: c.basis }); };
function client() { const c = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url, timeout: 0 }) }); clients.push(c); return c; }
const checkId = usernamePlan.checks[0]!.id;
async function stored(id = checkId) { const plan = await db.testPlan.findUniqueOrThrow({ where: { sessionId } }); return db.testCheck.findUniqueOrThrow({ where: { planId_id: { planId: plan.id, id } } }); }
beforeEach(async () => {
  mkdirSync(resolve(".runtime"), { recursive: true }); directory = mkdtempSync(join(resolve(".runtime"), "review-test-"));
  path = join(directory, "test.db"); applyTestMigrations(path); url = `file:${path.replaceAll("\\", "/")}`;
  db = client(); sessionId = randomUUID(); await analyzeTestSession(db, new FakeAIProvider(), sessionId, usernameTask);
});
afterEach(async () => { await Promise.all(clients.splice(0).map(c => c.$disconnect())); rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe("QA-controlled persisted review", () => {
  it("edits generated content, preserves refs/identity/order and records actual edits only", async () => {
    const before = await stored();
    await db.testCheck.update({ where: { planId_id: { planId: before.planId, id: checkId } }, data: { sourceRefsJson: '[{"kind":"requirement","reference":"R1"}]' } });
    expect(await updateCheck(db, { sessionId, checkId, content: content() })).toEqual({ status: "unchanged" });
    expect((await stored()).editedAt).toBeNull();
    expect(await updateCheck(db, { sessionId, checkId, content: { ...content(), expectedResult: "Reviewed expectation\nsecond line" } })).toEqual({ status: "saved" });
    const edited = await stored(); expect(edited).toMatchObject({ id: checkId, position: before.position, origin: "GENERATED", excludedAt: null, sourceRefsJson: '[{"kind":"requirement","reference":"R1"}]' }); expect(edited.editedAt).not.toBeNull();
    expect(await updateCheck(db, { sessionId, checkId, content: { ...content(), expectedResult: edited.expectedResult } })).toEqual({ status: "unchanged" });
    expect((await stored()).editedAt).toEqual(edited.editedAt);
    await updateCheck(db, { sessionId, checkId, content: content() }); expect((await stored()).editedAt).not.toBeNull();
    const reopened = await findSessionReview(client(), sessionId); expect(reopened?.plan?.checks[0]?.editedAt).not.toBeNull();
  });
  it("appends stable manual IDs after gaps, edits manual content and preserves exclusion provenance", async () => {
    const before = await stored(); await db.testCheck.update({ where: { planId_id: { planId: before.planId, id: checkId } }, data: { position: 9 } });
    const added = await addManualCheck(db, { sessionId, content: { ...content(), title: "Ручная проверка" } });
    expect(added.status).toBe("saved"); if (!("checkId" in added) || !added.checkId) throw Error("No manual ID");
    const manual = await stored(added.checkId); expect(manual.id).toMatch(/^[0-9a-f-]{36}$/); expect(manual).toMatchObject({ position: 10, origin: "MANUAL", editedAt: null, sourceRefsJson: null });
    await updateCheck(db, { sessionId, checkId: manual.id, content: { ...content(), title: "Ручная правка" } }); expect((await stored(manual.id)).origin).toBe("MANUAL");
    const edited = await stored(manual.id);
    expect(await setCheckExcluded(db, { sessionId, checkId: manual.id, excluded: true })).toEqual({ status: "saved" });
    const excluded = await stored(manual.id); expect(excluded.editedAt).toEqual(edited.editedAt);
    expect(await setCheckExcluded(db, { sessionId, checkId: manual.id, excluded: true })).toEqual({ status: "unchanged" }); expect((await stored(manual.id)).excludedAt).toEqual(excluded.excludedAt);
    await setCheckExcluded(db, { sessionId, checkId: manual.id, excluded: false }); expect(await stored(manual.id)).toMatchObject({ excludedAt: null, position: 10, origin: "MANUAL", editedAt: edited.editedAt });
  });
  it("excludes/restores untouched generation without marking it edited, and starts a manual-only scope", async () => {
    const before = await stored();
    await setCheckExcluded(db, { sessionId, checkId, excluded: true });
    expect(await stored()).toMatchObject({ editedAt: null, origin: "GENERATED", position: before.position });
    await setCheckExcluded(db, { sessionId, checkId, excluded: false });
    expect(await stored()).toMatchObject({ editedAt: null, excludedAt: null });
    const id = randomUUID();
    await analyzeTestSession(db, { generateTestPlan: async () => ({ ...usernamePlan, checks: [] }) }, id, usernameTask);
    const manual = await addManualCheck(db, { sessionId: id, content: content() });
    if (!("checkId" in manual)) throw Error("Missing manual check");
    await startOrResumeRun(db, id);
    expect((await getExecution(db, id))?.current).toMatchObject({ id: manual.checkId, origin: "MANUAL", position: 0 });
  });
  it("enforces 20 total including excluded under concurrent additions", async () => {
    for (let i = 4; i < 19; i++) expect((await addManualCheck(db, { sessionId, content: content() })).status).toBe("saved");
    await setCheckExcluded(db, { sessionId, checkId, excluded: true });
    const results = await Promise.all([addManualCheck(db, { sessionId, content: content() }), addManualCheck(client(), { sessionId, content: content() })]);
    expect(results.filter(r => r.status === "saved")).toHaveLength(1);
    expect(results.every(r => ["saved", "limit", "busy"].includes(r.status))).toBe(true);
    expect(await db.testCheck.count()).toBe(20); expect((await addManualCheck(db, { sessionId, content: content() })).status).toBe("limit");
  });
  it("rejects zero included start but allows review to restore or add checks", async () => {
    for (const c of usernamePlan.checks) await setCheckExcluded(db, { sessionId, checkId: c.id, excluded: true });
    await expect(startOrResumeRun(db, sessionId)).rejects.toMatchObject({ code: "empty-scope" }); expect(await db.testRun.count()).toBe(0);
    await setCheckExcluded(db, { sessionId, checkId, excluded: false }); expect(await startOrResumeRun(db, sessionId)).not.toBeNull();
  });
  it("rejects malformed/foreign IDs and client-owned fields without changing checks", async () => {
    const otherId = randomUUID(); await analyzeTestSession(db, new FakeAIProvider(), otherId, usernameTask);
    const manual = await addManualCheck(db, { sessionId: otherId, content: content() }); if (!("checkId" in manual)) throw Error("No ID");
    const before = await db.testCheck.findMany();
    expect((await updateCheck(db, { sessionId, checkId: manual.checkId, content: content() })).status).toBe("not-found");
    expect((await setCheckExcluded(db, { sessionId, checkId: manual.checkId, excluded: true })).status).toBe("not-found");
    expect((await addManualCheck(db, { sessionId: "../bad", content: content() })).status).toBe("validation");
    expect((await updateCheck(db, { sessionId, checkId: "../bad", content: content() })).status).toBe("validation");
    expect((await addManualCheck(db, { sessionId, content: content(), id: "client" })).status).toBe("validation");
    expect((await addManualCheck(db, { sessionId: "unknown", content: content() })).status).toBe("missing-plan");
    expect(await db.testCheck.findMany()).toEqual(before);
  });
  it("freezes every mutation and stale form after any run exists, and resumes the same run", async () => {
    const stale = { sessionId, checkId, content: { ...content(), title: "Stale edit" } }; const run = await startOrResumeRun(db, sessionId);
    const before = await db.testCheck.findMany();
    expect((await updateCheck(client(), stale)).status).toBe("frozen"); expect((await addManualCheck(db, { sessionId, content: content() })).status).toBe("frozen");
    expect((await setCheckExcluded(db, { sessionId, checkId, excluded: true })).status).toBe("frozen");
    expect((await startOrResumeRun(db, sessionId))?.id).toBe(run?.id); expect(await db.testCheck.findMany()).toEqual(before);
  });
  it("serializes concurrent edit/start across clients without permitting post-start edits", async () => {
    const editedContent = { ...content(), title: "Concurrent review" };
    const [edit, start] = await Promise.allSettled([updateCheck(db, { sessionId, checkId, content: editedContent }), startOrResumeRun(client(), sessionId)]);
    expect(edit.status).toBe("fulfilled");
    if (edit.status !== "fulfilled") throw Error("Unsafe edit failure");
    expect(["saved", "frozen", "busy"]).toContain(edit.value.status);
    if (start.status === "rejected") expect(start.reason).toMatchObject({ code: "busy" });
    const run = await startOrResumeRun(db, sessionId); expect(run).not.toBeNull();
    expect((await getExecution(db, sessionId))?.current?.title).toBe(edit.value.status === "saved" ? editedContent.title : content().title);
    const before = await stored(); expect((await updateCheck(client(), { sessionId, checkId, content: content() })).status).toBe("frozen"); expect(await stored()).toEqual(before);
  });
  it("returns busy while another connection holds the writer guard; never writes outside it", async () => {
    let release!: () => void; let acquired!: () => void;
    const gate = new Promise<void>(r => { release = r; }); const ready = new Promise<void>(r => { acquired = r; });
    const holding = db.$transaction(async tx => { await acquirePlanWriteGuard(tx, sessionId); acquired(); await gate; });
    await ready;
    try { expect((await updateCheck(client(), { sessionId, checkId, content: { ...content(), title: "Must not write" } })).status).toBe("busy"); }
    finally { release(); await holding; }
    expect((await stored()).title).toBe(content().title);
  });
  it("executes reviewed scope, snapshots reviewed FAIL and projects provenance without AI calls", async () => {
    const spy = vi.spyOn(FakeAIProvider.prototype, "generateTestPlan"); spy.mockClear();
    const reviewed = { ...content(), title: "Reviewed title", steps: ["Reviewed step\nline"], testData: ["Reviewed data"], expectedResult: "Reviewed expected" };
    await updateCheck(db, { sessionId, checkId, content: reviewed });
    const manual = await addManualCheck(db, { sessionId, content: { ...content(), title: "Manual last" } }); if (!("checkId" in manual)) throw Error("No ID");
    await setCheckExcluded(db, { sessionId, checkId: usernamePlan.checks[1]!.id, excluded: true });
    await startOrResumeRun(db, sessionId); expect((await getExecution(db, sessionId))?.current).toMatchObject(reviewed);
    await recordCheckResult(db, sessionId, { checkId, outcome: "FAIL", actualResult: "Observed", comment: "QA comment" });
    for (const id of [usernamePlan.checks[2]!.id, usernamePlan.checks[3]!.id, manual.checkId]) await recordCheckResult(db, sessionId, { checkId: id, outcome: "PASS" });
    const execution = await getExecution(db, sessionId); const result = execution!.results.find(r => r.checkId === checkId)!;
    const bug = await createOrOpenBugReport(db, sessionId, result.id); expect(bug).toMatchObject({ title: "[Ошибка] Reviewed title", stepsToReproduce: reviewed.steps, testData: reviewed.testData, expectedResult: reviewed.expectedResult });
    const report = await getTestingReport(client(), sessionId); if (report.status !== "ready") throw Error("No report");
    expect(report.report.totals).toMatchObject({ total: 4, fail: 1, pass: 3 }); expect(report.report.entries[0]?.check.editedAt).not.toBeNull(); expect(report.report.entries.at(-1)?.check.origin).toBe("MANUAL");
    expect(report.report.entries.some(e => e.check.id === usernamePlan.checks[1]!.id)).toBe(false); expect(spy).not.toHaveBeenCalled();
    expect((await updateCheck(db, { sessionId, checkId, content: content() })).status).toBe("frozen");
  });
  it("migrates populated Stage 1–6 records additively and preserves report/BugReport reads", async () => {
    await startOrResumeRun(db, sessionId);
    for (const [i, c] of usernamePlan.checks.entries()) await recordCheckResult(db, sessionId, i === 0 ? { checkId: c.id, outcome: "FAIL", actualResult: "Old actual", comment: "Old comment" } : { checkId: c.id, outcome: "PASS" });
    const result = (await getExecution(db, sessionId))!.results[0]!; await createOrOpenBugReport(db, sessionId, result.id);
    const priorReport = await getTestingReport(db, sessionId); const priorBug = await findBugReport(db, sessionId, result.id);
    await db.$disconnect();
    const sqlite = new DatabaseSync(path); sqlite.exec('ALTER TABLE "TestCheck" DROP COLUMN "editedAt"; ALTER TABLE "TestCheck" DROP COLUMN "origin";');
    const tables = ["TestSession", "TestPlan", "TestCheck", "TestRun", "CheckResult", "BugReport", "Attachment"];
    const old = tables.map(t => sqlite.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all());
    sqlite.exec(readFileSync(resolve("prisma/migrations/20261001090000_check_review_provenance/migration.sql"), "utf8"));
    for (const [i, t] of tables.entries()) { const rows = sqlite.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all(); if (t === "TestCheck") for (const row of rows) { expect(row.origin).toBe("GENERATED"); expect(row.editedAt).toBeNull(); delete row.origin; delete row.editedAt; } expect(rows).toEqual(old[i]); }
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]); sqlite.close();
    db = client(); expect(await getTestingReport(db, sessionId)).toEqual(priorReport); expect(await findBugReport(db, sessionId, result.id)).toEqual(priorBug);
  });
});
