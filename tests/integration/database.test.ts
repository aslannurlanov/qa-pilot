import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createDatabaseClient } from "@/server/db";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";

let client: PrismaClient;
let directory: string;

async function createPlan(suffix: string) {
  return client.testPlan.create({
    data: {
      id: `plan-${suffix}`,
      session: { create: { id: `session-${suffix}`, ...usernameTask } },
      summary: usernamePlan.summary,
      risksJson: JSON.stringify(usernamePlan.risks),
      questionsJson: JSON.stringify(usernamePlan.questions),
      ...usernamePlan.metadata,
      checks: {
        create: usernamePlan.checks.map(({ steps, testData, ...check }) => ({
          ...check, stepsJson: JSON.stringify(steps), testDataJson: JSON.stringify(testData),
        })),
      },
    },
  });
}

async function createFailedResult() {
  await client.testRun.create({ data: { id: "run-1", planId: "plan-1" } });
  return client.checkResult.create({
    data: { id: "result-1", runId: "run-1", planId: "plan-1", checkId: "username-positive", outcome: "FAIL", actualResult: "Registration was rejected." },
  });
}

const bugData = {
  resultId: "result-1", title: "Valid registration rejected", preconditionsJson: "[]",
  stepsToReproduceJson: '["Submit valid registration details."]', testDataJson: "[]",
  actualResult: "Rejected", expectedResult: "Accepted", attachmentIdsJson: "[]",
};

beforeEach(async () => {
  const runtimeRoot = resolve(".runtime");
  mkdirSync(runtimeRoot, { recursive: true });
  directory = mkdtempSync(join(runtimeRoot, "database-test-"));
  const path = join(directory, "test.db");
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    const migrations = resolve("prisma/migrations");
    for (const migration of readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      database.exec(readFileSync(join(migrations, migration.name, "migration.sql"), "utf8"));
    }
  } finally {
    database.close();
  }
  client = createDatabaseClient(`file:${path.replaceAll("\\", "/")}`);
  await createPlan("1");
});

afterEach(async () => {
  if (client) await client.$disconnect();
  // The only removed path is the unique temporary directory created by this test.
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("SQLite migration and Prisma adapter", () => {
  it("persists the plan, metadata, and check ordering using the actual adapter", async () => {
    const plan = await client.testPlan.findUniqueOrThrow({ where: { id: "plan-1" }, include: { checks: { orderBy: { position: "asc" } } } });
    expect(plan.provider).toBe("fake");
    expect(plan.schemaVersion).toBe("1");
    expect(plan.checks.map((check) => check.id)).toEqual(usernamePlan.checks.map((check) => check.id));
    expect(JSON.parse(plan.checks[0]?.stepsJson ?? "null")).toEqual(usernamePlan.checks[0]?.steps);
    expect(plan.checks.every((check) => check.sourceRefsJson === null && check.excludedAt === null)).toBe(true);
  });

  it("allows the same fixture IDs in another plan", async () => {
    await createPlan("2");
    expect(await client.testCheck.count()).toBe(8);
  });

  it("rejects duplicate check IDs within a plan", async () => {
    const check = await client.testCheck.findUniqueOrThrow({ where: { planId_id: { planId: "plan-1", id: "username-positive" } } });
    await expect(client.testCheck.create({ data: { ...check, position: 99 } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a second result for the same run/check", async () => {
    const result = await createFailedResult();
    await expect(client.checkResult.create({ data: { ...result, id: "result-2" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a second bug report for the same result", async () => {
    await createFailedResult();
    await client.bugReport.create({ data: { ...bugData, id: "bug-1" } });
    await expect(client.bugReport.create({ data: { ...bugData, id: "bug-2" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a result attached to a check in another plan", async () => {
    await createPlan("2");
    await client.testRun.create({ data: { id: "run-1", planId: "plan-1" } });
    await expect(client.checkResult.create({ data: { id: "result-1", runId: "run-1", planId: "plan-2", checkId: "username-positive", outcome: "PASS" } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("enforces one plan per session and one run per plan", async () => {
    const plan = await client.testPlan.findUniqueOrThrow({ where: { id: "plan-1" } });
    await expect(client.testPlan.create({ data: { ...plan, id: "another-plan" } })).rejects.toMatchObject({ code: "P2002" });
    await client.testRun.create({ data: { id: "run-1", planId: "plan-1" } });
    await expect(client.testRun.create({ data: { id: "run-2", planId: "plan-1" } })).rejects.toMatchObject({ code: "P2002" });
  });
});
