import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { analyzeTask } from "@/app/sessions/new/actions";
import { retryAnalysis } from "@/app/sessions/[sessionId]/actions";
import { createDatabaseClient } from "@/server/db";
import { applyTestMigrations } from "../helpers/sqlite";
import { usernameTask } from "@/server/ai/fixtures/username-plan";

const isolated = vi.hoisted(() => ({ url: "" }));
vi.mock("@/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db")>();
  return { createDatabaseClient: () => actual.createDatabaseClient(isolated.url) };
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

let directory: string;
let db: PrismaClient;
beforeEach(() => {
  mkdirSync(resolve(".runtime"), { recursive: true });
  directory = mkdtempSync(join(resolve(".runtime"), "actions-test-"));
  const path = join(directory, "test.db");
  applyTestMigrations(path);
  isolated.url = `file:${path.replaceAll("\\", "/")}`;
  db = createDatabaseClient();
});
afterEach(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function taskForm(id: string) {
  const data = new FormData();
  data.set("sessionId", id);
  data.set("title", usernameTask.title);
  data.set("description", usernameTask.description);
  return data;
}

describe("configured generation actions", () => {
  it("preserves a task on missing OpenAI access, retries explicitly with fake, and never regenerates success", async () => {
    const id = randomUUID();
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(analyzeTask({}, taskForm(id))).rejects.toThrow(`REDIRECT:/sessions/${id}?generationError=configuration`);
    expect(await db.testPlan.count()).toBe(0);
    expect(await db.testSession.findUniqueOrThrow({ where: { id } })).toMatchObject({ ...usernameTask, generationStatus: "FAILED" });
    const retry = new FormData();
    retry.set("sessionId", id);
    expect(await retryAnalysis({}, retry)).toEqual({ message: "Для AI-анализа не настроен доступ. Обратитесь к администратору." });
    vi.stubEnv("AI_PROVIDER", "fake");
    await expect(retryAnalysis({}, retry)).rejects.toThrow(`REDIRECT:/sessions/${id}`);
    vi.stubEnv("AI_PROVIDER", "openai");
    await expect(analyzeTask({}, taskForm(id))).rejects.toThrow(`REDIRECT:/sessions/${id}`);
    await expect(retryAnalysis({}, retry)).rejects.toThrow(`REDIRECT:/sessions/${id}`);
    expect(await db.testPlan.count()).toBe(1);
    expect((await db.testPlan.findUniqueOrThrow({ where: { sessionId: id } })).provider).toBe("fake");
  });
  it("turns unknown provider into saved configuration failure rather than fake output", async () => {
    vi.stubEnv("AI_PROVIDER", "unknown-mode");
    const id = randomUUID();
    await expect(analyzeTask({}, taskForm(id))).rejects.toThrow(`REDIRECT:/sessions/${id}?generationError=configuration`);
    expect(await db.testPlan.count()).toBe(0);
    expect((await db.testSession.findUniqueOrThrow({ where: { id } })).generationStatus).toBe("FAILED");
  });
});
