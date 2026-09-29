import { z } from "zod";
import { BugReportSchema, BugReportsSchema, CheckResultSchema } from "../schemas";

// Use at a future bug-creation boundary; a report alone cannot prove its parent failed.
export const BugReportForResultSchema = z.strictObject({
  report: BugReportSchema,
  result: CheckResultSchema,
  existingReports: BugReportsSchema,
}).superRefine(({ report, result, existingReports }, context) => {
  if (result.outcome !== "FAIL") {
    context.addIssue({ code: "custom", path: ["result", "outcome"], message: "Bug reports require a failed result." });
  }
  if (report.resultId !== result.id) {
    context.addIssue({ code: "custom", path: ["report", "resultId"], message: "The report must reference the supplied result." });
  }
  if (existingReports.some((existing) => existing.resultId === report.resultId)) {
    context.addIssue({ code: "custom", path: ["report", "resultId"], message: "This result already has a bug report." });
  }
});
