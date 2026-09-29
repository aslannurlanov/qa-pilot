import { z } from "zod";
import { IdSchema, TimestampSchema } from "./common";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const AttachmentMetadataSchema = z.strictObject({
  id: IdSchema,
  resultId: IdSchema,
  storageKey: z.string().max(200).regex(/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  createdAt: TimestampSchema,
});

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>;
