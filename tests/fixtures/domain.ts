import type { BugReport, CheckResult, TestPlan, TestRun } from "@/domain/schemas";
import { usernamePlan } from "@/server/ai/fixtures/username-plan";

export const timestamp = "2026-01-01T12:00:00.000Z";

export function makePlan(): TestPlan {
  return { ...structuredClone(usernamePlan), id: "plan-1", sessionId: "session-1", createdAt: timestamp };
}

export function makeResult(): CheckResult & { outcome: "FAIL" } {
  return {
    id: "result-1", runId: "run-1", planId: "plan-1", checkId: "username-positive",
    outcome: "FAIL", actualResult: "A valid username was rejected.", recordedAt: timestamp,
  };
}

export function makeRun(): TestRun {
  return { id: "run-1", planId: "plan-1", status: "IN_PROGRESS", startedAt: timestamp, completedAt: null };
}

export function makeBug(): BugReport {
  return {
    id: "bug-1", resultId: "result-1", title: "Valid username rejected on registration",
    preconditions: [], stepsToReproduce: ["Register with pilot123 and valid account details."],
    testData: ["Username: pilot123"], actualResult: "A valid username was rejected.",
    expectedResult: "Registration succeeds.", environment: null, attachmentIds: [], createdAt: timestamp,
  };
}
