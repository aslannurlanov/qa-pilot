import { z } from "zod";
import { IdSchema, RequiredTextSchema, TimestampSchema } from "./common";

export const CheckOutcomeSchema = z.enum(["PASS", "FAIL", "BLOCKED"]);
export const RunStatusSchema = z.enum(["IN_PROGRESS", "COMPLETED"]);

export const TestRunSchema = z.strictObject({
  id: IdSchema,
  planId: IdSchema,
  status: RunStatusSchema,
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
}).superRefine((run, context) => {
  if ((run.status === "COMPLETED") !== (run.completedAt !== null)) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Only a completed run must have a completion timestamp." });
  }
  if (run.completedAt && Date.parse(run.completedAt) < Date.parse(run.startedAt)) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Completion cannot precede the start." });
  }
});

const ResultFields = {
  id: IdSchema,
  runId: IdSchema,
  planId: IdSchema,
  checkId: IdSchema,
  recordedAt: TimestampSchema,
  comment: z.string().trim().max(5_000).optional(),
};

export const CheckResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ ...ResultFields, outcome: z.literal(CheckOutcomeSchema.enum.PASS) }),
  z.strictObject({ ...ResultFields, outcome: z.literal(CheckOutcomeSchema.enum.FAIL), actualResult: RequiredTextSchema }),
  z.strictObject({ ...ResultFields, outcome: z.literal(CheckOutcomeSchema.enum.BLOCKED), reason: RequiredTextSchema }),
]);

export const CheckResultsSchema = z.array(CheckResultSchema).superRefine((results, context) => {
  const keys = new Set<string>();
  results.forEach((result, index) => {
    const key = JSON.stringify([result.runId, result.checkId]);
    if (keys.has(key)) {
      context.addIssue({ code: "custom", path: [index], message: "Only one result is allowed per run/check." });
    }
    keys.add(key);
  });
});

export type CheckOutcome = z.infer<typeof CheckOutcomeSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type TestRun = z.infer<typeof TestRunSchema>;
