import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { FakeAIProvider } from "@/server/ai/fake-ai-provider";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";
import { createDatabaseClient } from "@/server/db";
import { findSessionReview, findTestSession, listTestSessions } from "@/server/repositories/test-sessions";
import { AnalysisInProgressError, analyzeTestSession } from "@/server/services/analyze-test-session";
import { applyTestMigrations } from "../helpers/sqlite";
import { OpenAIProvider } from "@/server/ai/openai-provider";
import { createAIProvider } from "@/server/ai/create-provider";
import { responseBody, jsonResponse, wirePlan } from "../fixtures/openai-responses";

let db: PrismaClient;
let directory: string;
let id: string;

beforeEach(() => {
  mkdirSync(resolve(".runtime"), { recursive: true });
  directory = mkdtempSync(join(resolve(".runtime"), "session-test-"));
  const path = join(directory, "test.db");
  applyTestMigrations(path);
  db = createDatabaseClient(`file:${path.replaceAll("\\", "/")}`);
  id = randomUUID();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

describe("task analysis and persisted plan review", () => {
  it.each([
    ["Zod-invalid", { ...wirePlan(), summary: "" }],
    ["duplicate IDs", { ...wirePlan(), checks: wirePlan().checks.map((check) => ({ ...check, id: "same" })) }],
    ["duplicate positions", { ...wirePlan(), checks: wirePlan().checks.map((check) => ({ ...check, position: 0 })) }],
    ["too many checks", { ...wirePlan(), checks: Array.from({ length: 21 }, (_, position) => ({ ...wirePlan().checks[0]!, id: `check-${position}`, position })) }],
  ])("persists no partial plan for mocked OpenAI %s output", async (_name, wire) => {
    vi.stubEnv("OPENAI_API_KEY", "test-placeholder-never-a-real-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
    const transport = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(responseBody(wire)));
    await expect(analyzeTestSession(db, new OpenAIProvider(transport), id, usernameTask)).rejects.toMatchObject({ code: "invalid_output" });
    expect(await db.testPlan.count()).toBe(0);
    expect(await db.testCheck.count()).toBe(0);
    expect((await findTestSession(db, id))?.generationStatus).toBe("FAILED");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("retries a failed mocked OpenAI attempt and preserves provenance when mode changes", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-placeholder-never-a-real-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Unavailable" } }, 503))
      .mockResolvedValueOnce(jsonResponse(responseBody()));
    const provider = new OpenAIProvider(transport);
    await expect(analyzeTestSession(db, provider, id, usernameTask)).rejects.toMatchObject({ code: "server" });
    expect(await db.testPlan.count()).toBe(0);
    await analyzeTestSession(db, provider, id, usernameTask);
    vi.stubEnv("AI_PROVIDER", "fake");
    const review = await findSessionReview(db, id);
    expect(review?.plan?.metadata).toMatchObject({ provider: "openai", model: "gpt-5.4-mini", promptVersion: "qa-plan-v1" });
    await analyzeTestSession(db, provider, id, usernameTask);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await db.testPlan.count()).toBe(1);
  });

  it("saves configuration failure and reuses a successful fake plan without requiring OpenAI credentials", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(analyzeTestSession(db, createAIProvider(), id, usernameTask)).rejects.toMatchObject({ code: "configuration" });
    expect((await findTestSession(db, id))?.generationStatus).toBe("FAILED");
    vi.stubEnv("AI_PROVIDER", "fake");
    await analyzeTestSession(db, createAIProvider(), id, usernameTask);
    vi.stubEnv("AI_PROVIDER", "openai");
    await analyzeTestSession(db, createAIProvider(), id, usernameTask);
    expect((await findSessionReview(db, id))?.plan?.metadata.provider).toBe("fake");
    expect(await db.testPlan.count()).toBe(1);
  });
  it("saves the trimmed task and complete validated plan and reads it through a new connection", async () => {
    const provider = new FakeAIProvider();
    const generate = vi.spyOn(provider, "generateTestPlan");
    await analyzeTestSession(db, provider, id, { title: ` ${usernameTask.title} `, description: ` ${usernameTask.description} ` });
    expect(generate).toHaveBeenCalledWith(usernameTask);
    const other = createDatabaseClient(`file:${join(directory, "test.db").replaceAll("\\", "/")}`);
    try {
      const review = await findSessionReview(other, id);
      expect(review?.session).toMatchObject({ ...usernameTask, generationStatus: "SUCCEEDED" });
      expect(review?.plan).toMatchObject({ ...usernamePlan, sessionId: id });
      expect(review?.plan?.checks.map((check) => check.id)).toEqual(usernamePlan.checks.map((check) => check.id));
    } finally {
      await other.$disconnect();
    }
    expect(await db.testRun.count()).toBe(0);
    expect(await db.testSession.count()).toBe(1);
    expect(await db.testPlan.count()).toBe(1);
    expect(await db.testCheck.count()).toBe(4);
    expect(new Set((await db.testCheck.findMany({ where: { plan: { sessionId: id } } })).map((check) => check.type)))
      .toEqual(new Set(["positive", "negative", "boundary", "regression"]));
    expect((await db.testCheck.findMany()).every((check) => check.reason.trim().length > 0)).toBe(true);
  });

  it("rejects invalid input before creating a session or calling the provider", async () => {
    const generateTestPlan = vi.fn();
    await expect(analyzeTestSession(db, { generateTestPlan }, id, { title: " ", description: " " })).rejects.toThrow();
    expect(generateTestPlan).not.toHaveBeenCalled();
    expect(await db.testSession.count()).toBe(0);
  });

  it("does not store a malformed provider plan and marks the saved session failed", async () => {
    const malformed = { ...usernamePlan, checks: [{ ...usernamePlan.checks[0], reason: "" }] };
    await expect(analyzeTestSession(db, { generateTestPlan: async () => malformed }, id, usernameTask)).rejects.toThrow();
    expect(await db.testSession.findUniqueOrThrow({ where: { id } })).toMatchObject({ generationStatus: "FAILED", ...usernameTask });
    expect(await db.testPlan.count()).toBe(0);
    expect(await db.testCheck.count()).toBe(0);
  });

  it("handles provider failure and retries the same session with updated task input", async () => {
    await expect(analyzeTestSession(db, { generateTestPlan: async () => { throw new Error("Unavailable"); } }, id, usernameTask)).rejects.toThrow("Unavailable");
    await analyzeTestSession(db, new FakeAIProvider(), id, { ...usernameTask, title: "Retry task" });
    expect(await db.testSession.count()).toBe(1);
    expect(await db.testPlan.count()).toBe(1);
    expect(await db.testCheck.count()).toBe(4);
    expect((await findSessionReview(db, id))?.session.title).toBe("Retry task");
  });

  it("reuses a successful session on repeated submission without generating again", async () => {
    const provider = new FakeAIProvider();
    const generate = vi.spyOn(provider, "generateTestPlan");
    await analyzeTestSession(db, provider, id, usernameTask);
    const first = await findSessionReview(db, id);
    await analyzeTestSession(db, provider, id, { ...usernameTask, title: "Repeated submission" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await findSessionReview(db, id)).toEqual(first);
    expect(await db.testPlan.count()).toBe(1);
  });

  it("does not call another provider while the same session is running", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const first = analyzeTestSession(db, { generateTestPlan: async () => { started(); await gate; return usernamePlan; } }, id, usernameTask);
    await entered;
    const generateTestPlan = vi.fn();
    try {
      await expect(analyzeTestSession(db, { generateTestPlan }, id, usernameTask)).rejects.toBeInstanceOf(AnalysisInProgressError);
      expect(generateTestPlan).not.toHaveBeenCalled();
    } finally {
      release();
      await first;
    }
    expect(await db.testPlan.count()).toBe(1);
  });

  it("rolls back all plan/check writes if persisting a check fails", async () => {
    // Inject a real SQLite constraint failure after the session was created.
    // The provider output itself is valid; this verifies transaction rollback.
    const { DatabaseSync } = await import("node:sqlite");
    const sql = new DatabaseSync(join(directory, "test.db"));
    sql.exec("CREATE TRIGGER reject_check BEFORE INSERT ON TestCheck BEGIN SELECT RAISE(ABORT, 'test persistence failure'); END;");
    sql.close();
    await expect(analyzeTestSession(db, new FakeAIProvider(), id, usernameTask)).rejects.toThrow();
    expect(await db.testPlan.count()).toBe(0);
    expect(await db.testCheck.count()).toBe(0);
    expect((await findSessionReview(db, id))?.session.generationStatus).toBe("FAILED");
  });

  it("round-trips optional sources, metadata, and sorted positions", async () => {
    const plan = structuredClone(usernamePlan);
    plan.checks.reverse();
    const response = {
      ...plan,
      checks: plan.checks.map((check) => ({ ...check, sourceRefs: [{ kind: "requirement", reference: "REQ-1", label: "Username rules" }] })),
    };
    await analyzeTestSession(db, { generateTestPlan: async () => response }, id, usernameTask);
    const review = await findSessionReview(db, id);
    expect(review?.plan?.checks.map((check) => check.position)).toEqual([0, 1, 2, 3]);
    expect(review?.plan?.checks[0]?.sourceRefs).toEqual(response.checks[0]?.sourceRefs);
    expect(review?.plan?.metadata).toEqual(usernamePlan.metadata);
  });

  it("supports a clarification-only plan without creating checks", async () => {
    await analyzeTestSession(db, { generateTestPlan: async () => ({ ...usernamePlan, checks: [] }) }, id, usernameTask);
    const review = await findSessionReview(db, id);
    expect(review?.plan?.checks).toEqual([]);
    expect(review?.plan?.questions).toEqual(usernamePlan.questions);
    expect(review?.session.generationStatus).toBe("SUCCEEDED");
  });

  it("returns null for missing or invalid IDs and rejects corrupt stored plan data", async () => {
    expect(await findSessionReview(db, "unknown-session")).toBeNull();
    expect(await findSessionReview(db, "invalid/id")).toBeNull();
    await analyzeTestSession(db, new FakeAIProvider(), id, usernameTask);
    await db.testPlan.update({ where: { sessionId: id }, data: { risksJson: '[123]' } });
    await expect(findSessionReview(db, id)).rejects.toThrow();
  });

  it("lists saved sessions in creation order with validated status and timestamps", async () => {
    expect(await listTestSessions(db)).toEqual([]);
    await db.testSession.create({ data: { id, ...usernameTask, generationStatus: "FAILED", createdAt: new Date("2026-09-28T10:00:00Z") } });
    await db.testSession.create({ data: { id: "later", ...usernameTask, title: "Later task", generationStatus: "RUNNING", createdAt: new Date("2026-09-29T10:00:00Z") } });
    expect((await listTestSessions(db)).map((session) => [session.id, session.generationStatus, session.createdAt])).toEqual([
      ["later", "RUNNING", "2026-09-29T10:00:00.000Z"],
      [id, "FAILED", "2026-09-28T10:00:00.000Z"],
    ]);
    expect((await findTestSession(db, id))?.generationStatus).toBe("FAILED");
    expect(await findTestSession(db, "not-here")).toBeNull();
  });
});
