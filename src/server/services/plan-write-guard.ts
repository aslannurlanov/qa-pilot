import type { Prisma } from "@/generated/prisma/client";

// This must be the transaction's FIRST statement. SQLite's writer serialization
// protects subsequent scope reads from an edit/start race across separate clients.
export async function acquirePlanWriteGuard(tx: Prisma.TransactionClient, sessionId: string) {
  return await tx.$executeRaw`
    UPDATE "TestPlan" SET "summary" = "summary"
    WHERE "sessionId" = ${sessionId}
      AND EXISTS (SELECT 1 FROM "TestSession" WHERE "id" = ${sessionId} AND "generationStatus" = 'SUCCEEDED')
      AND NOT EXISTS (SELECT 1 FROM "TestRun" WHERE "planId" = "TestPlan"."id")
  `;
}

export function isPlanWriteBusy(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { code?: string; message?: string; cause?: unknown; meta?: { driverAdapterError?: unknown } };
  return ["P1008", "P2028", "P2034"].includes(value.code ?? "")
    || /SQLITE_BUSY|database is locked|SocketTimeout/.test(value.message ?? "")
    || isPlanWriteBusy(value.cause) || isPlanWriteBusy(value.meta?.driverAdapterError);
}

export class PlanStartError extends Error {
  constructor(public readonly code: "empty-scope" | "busy") { super(code); }
}
