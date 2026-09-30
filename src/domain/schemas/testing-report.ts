import { z } from "zod";
import { IdSchema } from "./common";
import { TestSessionSchema } from "./task";
import { TestPlanSchema } from "./plan";
import { TestRunSchema, CheckResultsSchema } from "./execution";

export const TestingReportSourceSchema = z.strictObject({
  session: TestSessionSchema,
  plan: TestPlanSchema,
  run: TestRunSchema,
  results: CheckResultsSchema,
  bugResultIds: z.array(IdSchema),
});

export type TestingReportSource = z.infer<typeof TestingReportSourceSchema>;
