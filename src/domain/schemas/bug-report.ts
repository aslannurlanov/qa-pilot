import { z } from "zod";
import { IdSchema, RequiredTextSchema, TextListSchema, TimestampSchema, TitleSchema } from "./common";

export const BugReportSchema = z.strictObject({
  id: IdSchema,
  resultId: IdSchema,
  title: TitleSchema,
  preconditions: TextListSchema,
  stepsToReproduce: TextListSchema.min(1),
  testData: TextListSchema,
  actualResult: RequiredTextSchema,
  expectedResult: RequiredTextSchema,
  comment: RequiredTextSchema.nullable().default(null),
  environment: RequiredTextSchema.nullable(),
  attachmentIds: z.array(IdSchema).max(3),
  createdAt: TimestampSchema,
});

export const BugReportsSchema = z.array(BugReportSchema).superRefine((reports, context) => {
  const resultIds = new Set<string>();
  reports.forEach((report, index) => {
    if (resultIds.has(report.resultId)) {
      context.addIssue({ code: "custom", path: [index, "resultId"], message: "Only one bug report is allowed per failed result." });
    }
    resultIds.add(report.resultId);
  });
});

export type BugReport = z.infer<typeof BugReportSchema>;
