import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { usernamePlan, usernameTask } from "../../src/server/ai/fixtures/username-plan";

test.use({ timezoneId: "Asia/Qyzylorda" });

const checkTypeLabels = {
  positive: "Позитивный",
  negative: "Негативный",
  boundary: "Граничный",
  regression: "Регрессионный",
} as const;

test("home to task analysis to a persisted plan review", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Новая проверка" }).click();
  await expect(page).toHaveURL(/\/sessions\/new$/);
  await page.getByLabel("Название задачи", { exact: true }).fill(usernameTask.title);
  await page.getByLabel("Описание задачи", { exact: true }).fill(usernameTask.description);

  // Hold the outgoing action briefly with a deterministic gate, not a timeout.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/sessions/new", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Проанализировать задачу" }).click();
  try {
    await expect(page.getByRole("button", { name: "Анализируем…" })).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText("Анализируем задачу и сохраняем план…");
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/sessions\/[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: "План тестирования", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: usernameTask.title, exact: true })).toBeVisible();
  await expect(page.getByText(usernameTask.description, { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Демонстрационный анализ" })).toContainText("не создаются на основе вашего описания");
  await expect(page.getByRole("region", { name: "Что изменилось", exact: true })).toContainText(usernamePlan.summary);
  await expect(page.getByRole("region", { name: "Риски", exact: true }).getByRole("listitem")).toHaveCount(usernamePlan.risks.length);
  for (const question of usernamePlan.questions) {
    await expect(page.getByRole("region", { name: "Вопросы / Недостающая информация", exact: true })).toContainText(question);
  }
  await expect(page.getByRole("article")).toHaveCount(4);
  for (const check of usernamePlan.checks) {
    const article = page.getByRole("article", { name: check.title, exact: true });
    await expect(article).toContainText(checkTypeLabels[check.type]);
    await expect(article).toContainText(`ID проверки: ${check.id}`);
    await expect(article.getByText("Почему нужна эта проверка?", { exact: true })).toBeVisible();
    await expect(article).toContainText(`Основание: ${check.basis === "requirement" ? "Требование" : "Предположение"}`);
    await expect(article).toContainText(check.reason);
    await expect(article).toContainText(check.expectedResult);
    for (const step of check.steps) await expect(article).toContainText(step);
    for (const data of check.testData) await expect(article).toContainText(data);
  }
  await expect(page.getByText("Провайдер: fake", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Начать тестирование" })).toBeEnabled();
  const url = page.url();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(4);
  const reopened = await context.newPage();
  await reopened.goto(url);
  await expect(reopened.getByRole("heading", { name: usernameTask.title, exact: true })).toBeVisible();
  await expect(reopened.getByRole("article")).toHaveCount(4);
  await page.getByRole("link", { name: "На главную" }).click();
  await expect(page).toHaveURL(/\/$/);
  const saved = page.getByRole("link", { name: `Открыть проверку: ${usernameTask.title}` });
  await expect(saved).toContainText(usernameTask.title);
  await expect(saved).toContainText("Готово");
  await expect(saved.getByRole("time")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);
  await saved.click();
  await expect(page).toHaveURL(new URL(url).pathname);
  await expect(page.getByRole("article")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("server validation retains input and allows correction on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sessions/new");
  await page.getByRole("button", { name: "Проанализировать задачу" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Проверьте выделенные поля.");
  await expect(page.getByLabel("Название задачи", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Описание задачи", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Укажите название задачи длиной от 1 до 200 символов.")).toBeVisible();
  await expect(page.getByText("Укажите описание задачи длиной от 1 до 20 000 символов.")).toBeVisible();
  await page.getByLabel("Название задачи", { exact: true }).fill("Сохранить название задачи");
  await page.getByLabel("Описание задачи", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Проанализировать задачу" }).click();
  await expect(page.getByLabel("Название задачи", { exact: true })).toHaveValue("Сохранить название задачи");
  await expect(page.getByLabel("Описание задачи", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Описание задачи", { exact: true }).fill("Синтетическая задача с описанием ожидаемого поведения.");
  await page.getByRole("button", { name: "Проанализировать задачу" }).click();
  await expect(page).toHaveURL(/\/sessions\/[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: "Сохранить название задачи", exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("unknown session shows a useful not-found page", async ({ page }) => {
  await page.goto("/sessions/unknown-session");
  await expect(page.getByRole("heading", { name: "Проверка не найдена" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Новая проверка" }).click();
  await expect(page).toHaveURL(/\/sessions\/new$/);
});

test("a failed plan read shows a safe error and retry re-fetches repaired data", async ({ page }) => {
  const path = process.env.QA_PILOT_E2E_DATABASE;
  if (!path) throw new Error("Missing isolated browser-test database.");
  const sessionId = randomUUID();
  const database = new DatabaseSync(path);
  try {
    const now = Date.now();
    // Other browser workers may be saving their own independent sessions.
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    database.prepare('INSERT INTO TestSession (id, title, description, generationStatus, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sessionId, "Проверка восстановления", "Синтетическая задача для проверки восстановления.", "SUCCEEDED", now, now);
    database.prepare('INSERT INTO TestPlan (id, sessionId, summary, risksJson, questionsJson, schemaVersion, promptVersion, provider, model, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), sessionId, "Нужно уточнение.", "[123]", '["Уточните требования."]', "1", "fixture-v1", "fake", "username-fixture-v1", now);
    await page.goto(`/sessions/${sessionId}`);
    await expect(page.getByRole("heading", { name: "Не удалось загрузить проверку" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).not.toContainText("ZodError");
    database.prepare('UPDATE TestPlan SET risksJson = ? WHERE sessionId = ?').run("[]", sessionId);
    await page.getByRole("button", { name: "Повторить попытку", exact: true }).click();
    await expect(page.getByRole("heading", { name: "План тестирования", level: 1 })).toBeVisible();
    await expect(page.getByText("Риски не указаны.", { exact: true })).toBeVisible();
    await expect(page.getByText("Уточните требования.", { exact: true })).toBeVisible();
    await expect(page.getByText("Проверки не сформированы. Сначала уточните вопросы по задаче.", { exact: true })).toBeVisible();
  } finally {
    database.close();
  }
});

test("failed and generating sessions appear on Home; Retry reuses the failed session", async ({ page }) => {
  const path = process.env.QA_PILOT_E2E_DATABASE;
  if (!path) throw new Error("Missing isolated browser-test database.");
  const failedId = randomUUID();
  const runningId = randomUUID();
  const database = new DatabaseSync(path);
  try {
    const now = Date.UTC(2026, 8, 29, 18, 18);
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const insert = database.prepare('INSERT INTO TestSession (id, title, description, generationStatus, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run(failedId, "Повторить эту задачу", "Синтетическая задача с завершившимся ошибкой анализом.", "FAILED", now, now);
    insert.run(runningId, "Задача в анализе", "Синтетическая задача с продолжающимся анализом.", "RUNNING", now, now);
    await page.goto("/");
    const failedLink = page.getByRole("link", { name: "Открыть проверку: Повторить эту задачу" });
    await expect(failedLink).toContainText("Ошибка анализа");
    await expect(failedLink.getByRole("time")).toHaveText("29.09.2026, 23:18");
    await expect(page.getByRole("link", { name: "Открыть проверку: Задача в анализе" })).toContainText("Анализируется");
    await page.getByRole("link", { name: "Открыть проверку: Задача в анализе" }).click();
    await expect(page.getByRole("heading", { name: "Анализируется", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "На главную" }).click();
    await page.getByRole("link", { name: "Открыть проверку: Повторить эту задачу" }).click();
    await expect(page.getByRole("heading", { name: "Ошибка анализа" })).toBeVisible();
    await expect(page.getByText("Не удалось создать корректный план. Задача сохранена, а неполный план не записан.")).toBeVisible();
    await page.getByRole("button", { name: "Повторить анализ" }).click();
    await expect(page).toHaveURL(`/sessions/${failedId}`);
    await expect(page.getByRole("article")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Начать тестирование" })).toBeEnabled();
    expect(database.prepare('SELECT count(*) AS count FROM TestSession WHERE id = ?').get(failedId)).toMatchObject({ count: 1 });
    expect(database.prepare('SELECT count(*) AS count FROM TestPlan WHERE sessionId = ?').get(failedId)).toMatchObject({ count: 1 });
    expect(database.prepare('SELECT count(*) AS count FROM TestCheck WHERE planId = (SELECT id FROM TestPlan WHERE sessionId = ?)').get(failedId)).toMatchObject({ count: 4 });
    await page.getByRole("link", { name: "На главную" }).click();
    await expect(page.getByRole("link", { name: "Открыть проверку: Повторить эту задачу" })).toContainText("Готово");
  } finally {
    database.close();
  }
});
