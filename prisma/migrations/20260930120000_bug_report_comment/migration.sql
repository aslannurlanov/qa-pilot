-- Preserve the original manual QA comment as part of the report snapshot.
ALTER TABLE "BugReport" ADD COLUMN "comment" TEXT;
