import { resolve } from "node:path";
import { z } from "zod";

const DatabaseUrlSchema = z.string().startsWith("file:").min(6);

export function getDatabaseUrl(): string {
  const url = DatabaseUrlSchema.parse(process.env.DATABASE_URL ?? "file:./data/qa-pilot.db");
  // Prisma CLI and the runtime adapter must resolve relative paths identically.
  return `file:${resolve(url.slice("file:".length)).replaceAll("\\", "/")}`;
}
