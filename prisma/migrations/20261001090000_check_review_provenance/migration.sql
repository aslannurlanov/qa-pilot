-- Additive review provenance; preserve every existing check and relationship.
ALTER TABLE "TestCheck" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'GENERATED';
ALTER TABLE "TestCheck" ADD COLUMN "editedAt" DATETIME;
