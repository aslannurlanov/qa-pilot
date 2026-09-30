import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const baseURL = "http://127.0.0.1:3100";
// Inherit the same unique file in workers; never run write tests on the dev DB.
const databasePath = process.env.QA_PILOT_E2E_DATABASE ??= resolve(".runtime", `e2e-${randomUUID()}.db`);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // The browser suite shares one isolated SQLite file and checks its empty state.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --port 3100",
    // This route does not query SQLite; global setup migrates before tests visit Home.
    url: `${baseURL}/sessions/new`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`, AI_PROVIDER: "fake", OPENAI_API_KEY: "" },
  },
});
