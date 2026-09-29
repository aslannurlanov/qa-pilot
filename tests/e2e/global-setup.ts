import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyTestMigrations } from "../helpers/sqlite";

export default function setup() {
  const path = process.env.QA_PILOT_E2E_DATABASE;
  const root = resolve(".runtime");
  // Only a unique test database directly under .runtime may be created/removed.
  if (!path || dirname(path) !== root || !/^e2e-[a-f0-9-]+\.db$/.test(path.slice(root.length + 1))) {
    throw new Error("Missing or unsafe isolated browser-test database path.");
  }
  applyTestMigrations(path);
  return () => {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${path}${suffix}`, { force: true });
  };
}
