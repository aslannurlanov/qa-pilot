import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "./config";

// No connection is opened at import time. Callers own the client's lifecycle.
export function createDatabaseClient(url = getDatabaseUrl()) {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}
