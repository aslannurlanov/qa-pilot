import { describe, expect, it } from "vitest";
import { AttachmentMetadataSchema, MAX_ATTACHMENT_BYTES, PlanMetadataSchema, TaskInputSchema, TestSessionSchema } from "@/domain/schemas";
import { usernamePlan, usernameTask } from "@/server/ai/fixtures/username-plan";
import { timestamp } from "../fixtures/domain";

describe("other domain boundaries", () => {
  it("validates a session and trims task input", () => {
    expect(TaskInputSchema.parse({ ...usernameTask, title: "  Username validation  " }).title).toBe("Username validation");
    expect(TestSessionSchema.parse({ ...usernameTask, id: "session-1", generationStatus: "IDLE", createdAt: timestamp, updatedAt: timestamp }).generationStatus).toBe("IDLE");
    expect(TaskInputSchema.safeParse({ ...usernameTask, description: " " }).success).toBe(false);
  });

  it("requires provider metadata and a supported schema version", () => {
    expect(PlanMetadataSchema.safeParse({ ...usernamePlan.metadata, model: undefined }).success).toBe(false);
    expect(PlanMetadataSchema.safeParse({ ...usernamePlan.metadata, schemaVersion: "99" }).success).toBe(false);
  });

  it("accepts screenshot metadata and rejects paths, unsupported formats, and oversized files", () => {
    const attachment = { id: "attachment-1", resultId: "result-1", storageKey: "screenshot-1.png", originalName: "Screenshot.png", mimeType: "image/png", sizeBytes: 1024, createdAt: timestamp };
    expect(AttachmentMetadataSchema.parse(attachment).sizeBytes).toBe(1024);
    expect(AttachmentMetadataSchema.safeParse({ ...attachment, storageKey: "../../secret.png" }).success).toBe(false);
    expect(AttachmentMetadataSchema.safeParse({ ...attachment, mimeType: "image/svg+xml" }).success).toBe(false);
    expect(AttachmentMetadataSchema.safeParse({ ...attachment, sizeBytes: MAX_ATTACHMENT_BYTES + 1 }).success).toBe(false);
  });
});
