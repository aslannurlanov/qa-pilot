import { describe, expect, it } from "vitest";
import { CheckResultSchema, CheckResultsSchema, TestRunSchema } from "@/domain/schemas";
import { makeResult, makeRun } from "../fixtures/domain";

describe("check results", () => {
  it.each([undefined, "", "   "])("rejects FAIL without a meaningful actual result (%s)", (actualResult) => {
    expect(CheckResultSchema.safeParse({ ...makeResult(), actualResult }).success).toBe(false);
  });

  it.each([undefined, "", "   "])("rejects BLOCKED without a meaningful reason (%s)", (reason) => {
    const failed = makeResult();
    const blocked = { id: failed.id, runId: failed.runId, planId: failed.planId, checkId: failed.checkId, recordedAt: failed.recordedAt, outcome: "BLOCKED", reason };
    expect(CheckResultSchema.safeParse(blocked).success).toBe(false);
  });

  it("accepts PASS without any failure-specific data", () => {
    const result = makeResult();
    const pass = { id: result.id, runId: result.runId, planId: result.planId, checkId: result.checkId, recordedAt: result.recordedAt, outcome: "PASS" };
    expect(CheckResultSchema.parse(pass).outcome).toBe("PASS");
    expect(CheckResultSchema.safeParse({ ...pass, actualResult: "stale failure" }).success).toBe(false);
  });

  it("accepts valid FAIL and BLOCKED", () => {
    expect(CheckResultSchema.parse(makeResult()).outcome).toBe("FAIL");
    const result = makeResult();
    expect(CheckResultSchema.parse({ id: result.id, runId: result.runId, planId: result.planId, checkId: result.checkId, recordedAt: result.recordedAt, outcome: "BLOCKED", reason: "The test environment is unavailable." }).outcome).toBe("BLOCKED");
  });

  it("rejects a second result for the same run/check", () => {
    expect(CheckResultsSchema.safeParse([makeResult(), { ...makeResult(), id: "result-2" }]).success).toBe(false);
  });

  it("allows results for different checks or runs", () => {
    expect(CheckResultsSchema.parse([makeResult(), { ...makeResult(), id: "result-2", checkId: "username-negative" }, { ...makeResult(), id: "result-3", runId: "run-2" }])).toHaveLength(3);
  });
});

describe("run timestamps", () => {
  it("accepts an in-progress run without completion time", () => {
    expect(TestRunSchema.parse(makeRun()).status).toBe("IN_PROGRESS");
  });

  it("requires a completion timestamp for a completed run", () => {
    expect(TestRunSchema.safeParse({ ...makeRun(), status: "COMPLETED" }).success).toBe(false);
  });

  it("rejects completion before the run started", () => {
    expect(TestRunSchema.safeParse({ ...makeRun(), status: "COMPLETED", completedAt: "2025-01-01T00:00:00.000Z" }).success).toBe(false);
  });
});
