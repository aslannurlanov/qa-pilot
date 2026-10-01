import { z } from "zod";
import {
  IdSchema,
  RequiredTextSchema,
  SourceRefSchema,
  TextListSchema,
  TimestampSchema,
  TitleSchema,
} from "./common";

export const MAX_PLAN_CHECKS = 20;
export const PLAN_SCHEMA_VERSION = "1";

export const CheckTypeSchema = z.enum(["positive", "negative", "boundary", "regression"]);

export const CheckContentSchema = z.strictObject({
  title: TitleSchema,
  type: CheckTypeSchema,
  steps: TextListSchema.min(1),
  testData: TextListSchema,
  expectedResult: RequiredTextSchema,
  reason: RequiredTextSchema,
  basis: z.enum(["requirement", "assumption"]),
});

const GeneratedCheckSchema = CheckContentSchema.extend({
  id: IdSchema,
  position: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sourceRefs: z.array(SourceRefSchema).max(20).optional(),
  // Persisted review may exclude checks before the plan is frozen.
  excludedAt: TimestampSchema.nullable().default(null),
});

export const TestCheckSchema = GeneratedCheckSchema.extend({
  origin: z.enum(["GENERATED", "MANUAL"]).default("GENERATED"),
  editedAt: TimestampSchema.nullable().default(null),
});

export const PlanMetadataSchema = z.strictObject({
  schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
  promptVersion: RequiredTextSchema.max(100),
  provider: RequiredTextSchema.max(100),
  model: RequiredTextSchema.max(100),
});

const PlanContentSchema = z.strictObject({
  summary: RequiredTextSchema,
  risks: TextListSchema,
  questions: TextListSchema,
  checks: z.array(GeneratedCheckSchema).max(MAX_PLAN_CHECKS),
  metadata: PlanMetadataSchema,
});

function validatePlanContent(
  plan: z.infer<typeof PlanContentSchema>,
  context: z.RefinementCtx,
) {
  const ids = new Set<string>();
  const positions = new Set<number>();

  plan.checks.forEach((check, index) => {
    if (ids.has(check.id)) {
      context.addIssue({ code: "custom", path: ["checks", index, "id"], message: "Check IDs must be unique within a plan." });
    }
    if (positions.has(check.position)) {
      context.addIssue({ code: "custom", path: ["checks", index, "position"], message: "Check positions must be unique within a plan." });
    }
    ids.add(check.id);
    positions.add(check.position);
  });

  if (plan.checks.length === 0 && plan.questions.length === 0) {
    context.addIssue({ code: "custom", path: ["questions"], message: "A plan without checks must explain what information is missing." });
  }
}

export const GeneratedTestPlanSchema = PlanContentSchema.superRefine(validatePlanContent)
  .superRefine((plan, context) => {
    plan.checks.forEach((check, index) => {
      if (check.excludedAt !== null) {
        context.addIssue({ code: "custom", path: ["checks", index, "excludedAt"], message: "A provider cannot exclude generated checks." });
      }
    });
  });

export const TestPlanSchema = PlanContentSchema.extend({
  checks: z.array(TestCheckSchema).max(MAX_PLAN_CHECKS),
  id: IdSchema,
  sessionId: IdSchema,
  createdAt: TimestampSchema,
}).superRefine(validatePlanContent);

export type CheckType = z.infer<typeof CheckTypeSchema>;
export type TestCheck = z.infer<typeof TestCheckSchema>;
export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;
export type GeneratedTestPlan = z.infer<typeof GeneratedTestPlanSchema>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
