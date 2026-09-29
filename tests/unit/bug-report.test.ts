import { describe, expect, it } from "vitest";
import { BugReportForResultSchema } from "@/domain/rules/bug-report";
import { BugReportsSchema } from "@/domain/schemas";
import { makeBug, makeResult } from "../fixtures/domain";

describe("bug report relationships", () => {
  it("accepts a report for a failed result", () => {
    expect(BugReportForResultSchema.parse({ report: makeBug(), result: makeResult(), existingReports: [] }).report.resultId).toBe("result-1");
  });

  it("rejects a report linked to a different result", () => {
    expect(BugReportForResultSchema.safeParse({ report: makeBug(), result: { ...makeResult(), id: "another-result" }, existingReports: [] }).success).toBe(false);
  });

  it("rejects a report for a passing result", () => {
    const failed = makeResult();
    const passing = { id: failed.id, runId: failed.runId, planId: failed.planId, checkId: failed.checkId, recordedAt: failed.recordedAt, outcome: "PASS" };
    expect(BugReportForResultSchema.safeParse({ report: makeBug(), result: passing, existingReports: [] }).success).toBe(false);
  });

  it("rejects a second report for the same failed result", () => {
    const duplicate = { ...makeBug(), id: "bug-2" };
    expect(BugReportsSchema.safeParse([makeBug(), duplicate]).success).toBe(false);
    expect(BugReportForResultSchema.safeParse({ report: duplicate, result: makeResult(), existingReports: [makeBug()] }).success).toBe(false);
  });
});
