import { z } from "zod";

export const IdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const TimestampSchema = z.iso.datetime({ offset: true });
export const RequiredTextSchema = z.string().trim().min(1).max(5_000);
export const TitleSchema = RequiredTextSchema.max(200);
export const TextListSchema = z.array(RequiredTextSchema).max(50);

export const SourceRefSchema = z.strictObject({
  kind: RequiredTextSchema.max(50),
  reference: RequiredTextSchema.max(500),
  label: TitleSchema.optional(),
});

export type SourceRef = z.infer<typeof SourceRefSchema>;
