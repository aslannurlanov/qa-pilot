import { z } from "zod";
import { CheckTypeSchema, MAX_GENERATED_CHECKS } from "@/domain/schemas/plan";
import { IdSchema, RequiredTextSchema, TextListSchema, TitleSchema } from "@/domain/schemas/common";

// All wire fields are required. Application metadata and exclusion are not model output.
export const OpenAIPlanSchema = z.strictObject({
  summary: RequiredTextSchema,
  risks: TextListSchema,
  questions: TextListSchema,
  checks: z.array(z.strictObject({
    id: IdSchema,
    position: z.number().int().nonnegative(),
    type: CheckTypeSchema,
    title: TitleSchema,
    steps: TextListSchema.min(1),
    testData: TextListSchema,
    expectedResult: RequiredTextSchema,
    reason: RequiredTextSchema,
    basis: z.enum(["requirement", "assumption"]),
    sourceRefs: z.array(z.strictObject({
      kind: RequiredTextSchema.max(50),
      reference: RequiredTextSchema.max(500),
      label: TitleSchema.nullable(),
    })).max(20),
  })).max(MAX_GENERATED_CHECKS),
});
