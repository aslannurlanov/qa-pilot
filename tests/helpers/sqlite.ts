import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function applyTestMigrations(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    const root = resolve("prisma/migrations");
    const migrations = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const migration of migrations) {
      database.exec(readFileSync(join(root, migration.name, "migration.sql"), "utf8"));
    }
  } finally {
    database.close();
  }
}
