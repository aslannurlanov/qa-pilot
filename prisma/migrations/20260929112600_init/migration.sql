-- CreateTable
CREATE TABLE "TestSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "generationStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TestPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "risksJson" TEXT NOT NULL,
    "questionsJson" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestPlan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCheck" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stepsJson" TEXT NOT NULL,
    "testDataJson" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "sourceRefsJson" TEXT,
    "excludedAt" DATETIME,

    PRIMARY KEY ("planId", "id"),
    CONSTRAINT "TestCheck_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TestPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "TestRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TestPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actualResult" TEXT,
    "reason" TEXT,
    "comment" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckResult_runId_planId_fkey" FOREIGN KEY ("runId", "planId") REFERENCES "TestRun" ("id", "planId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckResult_planId_checkId_fkey" FOREIGN KEY ("planId", "checkId") REFERENCES "TestCheck" ("planId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resultId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "CheckResult" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resultId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "preconditionsJson" TEXT NOT NULL,
    "stepsToReproduceJson" TEXT NOT NULL,
    "testDataJson" TEXT NOT NULL,
    "actualResult" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "environment" TEXT,
    "attachmentIdsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BugReport_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "CheckResult" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TestPlan_sessionId_key" ON "TestPlan"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCheck_planId_position_key" ON "TestCheck"("planId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TestRun_planId_key" ON "TestRun"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "TestRun_id_planId_key" ON "TestRun"("id", "planId");

-- CreateIndex
CREATE INDEX "CheckResult_planId_checkId_idx" ON "CheckResult"("planId", "checkId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckResult_runId_checkId_key" ON "CheckResult"("runId", "checkId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_resultId_idx" ON "Attachment"("resultId");

-- CreateIndex
CREATE UNIQUE INDEX "BugReport_resultId_key" ON "BugReport"("resultId");
