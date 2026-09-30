import { expect, test } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { usernameTask } from "../../src/server/ai/fixtures/username-plan";

test("manual execution survives refresh and resume, validates details, and completes once", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Новая проверка" }).click();
  await page.getByLabel("Название задачи", { exact: true }).fill(usernameTask.title);
  await page.getByLabel("Описание задачи", { exact: true }).fill(usernameTask.description);
  await page.getByRole("button", { name: "Проанализировать задачу" }).click();
  await expect(page.getByRole("heading", { name: "План тестирования", level: 1 })).toBeVisible();
  const planUrl = page.url();
  const sessionId = new URL(planUrl).pathname.split("/").at(-1)!;

  await page.getByRole("button", { name: "Начать тестирование" }).click();
  await expect(page).toHaveURL(`/sessions/${sessionId}/run`);
  await expect(page.getByRole("heading", { name: "Проверка 1 из 4" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Выполнено проверок" })).toHaveAttribute("value", "0");
  await expect(page.getByRole("heading", { name: "Почему нужна эта проверка?" })).toBeVisible();
  await expect(page.getByText("Выберите результат текущей проверки. Результат сохранится в этом запуске тестирования.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("heading", { name: "Ожидаемый результат" })).toBeVisible();
  await page.getByRole("button", { name: "ПРОЙДЕНО" }).click();
  await expect(page.getByRole("heading", { name: "Проверка 2 из 4" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Выполнено проверок" })).toHaveAttribute("value", "1");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Проверка 2 из 4" })).toBeVisible();

  await page.getByRole("button", { name: "ОШИБКА" }).click();
  await expect(page.getByRole("button", { name: "ОШИБКА", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Выбрано: ОШИБКА. Результат ещё не сохранён.", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Выполнено проверок" })).toHaveAttribute("value", "1");
  await expect(page.getByText("После сохранения откроется следующая проверка.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Зафиксировать ошибку и перейти дальше" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Укажите фактический результат.");
  await expect(page.getByRole("heading", { name: "Проверка 2 из 4" })).toBeVisible();
  await page.getByLabel("Фактический результат").fill("Имя пользователя принято без проверки длины.");
  await page.getByLabel("Комментарий").fill("Повторено в Chrome.");
  await page.getByRole("button", { name: "Зафиксировать ошибку и перейти дальше" }).click();
  await expect(page.getByRole("heading", { name: "Проверка 3 из 4" })).toBeVisible();

  await page.getByRole("navigation", { name: "Навигация по проверке" }).getByRole("link", { name: "Главная" }).click();
  const resume = page.getByRole("link", { name: `Продолжить тестирование: ${usernameTask.title}` });
  await expect(resume).toContainText("Тестирование идёт");
  await resume.click();
  await expect(page.getByRole("heading", { name: "Проверка 3 из 4" })).toBeVisible();
  await page.getByRole("button", { name: "ЗАБЛОКИРОВАНО" }).click();
  await expect(page.getByRole("button", { name: "ЗАБЛОКИРОВАНО", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Выбрано: ЗАБЛОКИРОВАНО. Результат ещё не сохранён.", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Выполнено проверок" })).toHaveAttribute("value", "2");
  await page.getByRole("button", { name: "Сохранить блокировку и перейти дальше" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Укажите причину блокировки.");
  await page.getByLabel("Причина блокировки").fill("Тестовая среда недоступна.");
  await page.getByLabel("Комментарий").fill("Ожидаем доступ.");
  await page.getByRole("button", { name: "Сохранить блокировку и перейти дальше" }).click();
  await expect(page.getByRole("heading", { name: "Проверка 4 из 4" })).toBeVisible();
  await page.getByRole("button", { name: "ПРОЙДЕНО" }).click();

  await expect(page.getByRole("heading", { name: "Тестирование завершено" })).toBeVisible();
  const summary = page.getByRole("region", { name: "Тестирование завершено" });
  await expect(summary).toContainText("Всего проверок4");
  await expect(summary).toContainText("Пройдено2");
  await expect(summary).toContainText("Ошибок1");
  await expect(summary).toContainText("Заблокировано1");
  await expect(page.getByText("Имя пользователя принято без проверки длины.")).toBeVisible();
  await expect(page.getByText("Повторено в Chrome.")).toBeVisible();
  await expect(page.getByText("Тестовая среда недоступна.")).toBeVisible();
  await expect(page.getByText("Ожидаем доступ.")).toBeVisible();
  await page.getByRole("link", { name: "План тестирования" }).click();
  await expect(page.getByRole("link", { name: "Открыть тестирование" })).toBeVisible();
  await page.getByRole("link", { name: "Открыть тестирование" }).click();
  await expect(page.getByRole("heading", { name: "Тестирование завершено" })).toBeVisible();
  await page.getByRole("navigation", { name: "Навигация по проверке" }).getByRole("link", { name: "Главная" }).click();
  await page.getByRole("link", { name: `Посмотреть результаты: ${usernameTask.title}` }).click();
  await expect(page.getByRole("heading", { name: "Тестирование завершено" })).toBeVisible();

  const path = process.env.QA_PILOT_E2E_DATABASE;
  if (!path) throw new Error("Missing isolated browser-test database.");
  const database = new DatabaseSync(path);
  try {
    const plan = database.prepare("SELECT id FROM TestPlan WHERE sessionId = ?").get(sessionId) as { id: string };
    const run = database.prepare("SELECT id FROM TestRun WHERE planId = ?").get(plan.id) as { id: string };
    expect(database.prepare("SELECT count(*) AS count FROM TestRun WHERE planId = ?").get(plan.id)).toMatchObject({ count: 1 });
    expect(database.prepare("SELECT count(*) AS count FROM CheckResult WHERE runId = ?").get(run.id)).toMatchObject({ count: 4 });
  } finally {
    database.close();
  }
});
