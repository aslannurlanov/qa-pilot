import { z } from "zod";
import { IdSchema, TimestampSchema, TitleSchema } from "./common";

export const TaskInputSchema = z.strictObject({
  title: TitleSchema,
  description: z.string().trim().min(1).max(20_000),
});

export const GenerationStatusSchema = z.enum(["IDLE", "RUNNING", "SUCCEEDED", "FAILED"]);

export const TestSessionSchema = TaskInputSchema.extend({
  id: IdSchema,
  generationStatus: GenerationStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type TaskInput = z.infer<typeof TaskInputSchema>;
export type TestSession = z.infer<typeof TestSessionSchema>;
