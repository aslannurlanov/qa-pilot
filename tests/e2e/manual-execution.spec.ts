import { expect, test } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { usernamePlan, usernameTask } from "../../src/server/ai/fixtures/username-plan";

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

  await page.getByRole("link", { name: "Открыть отчёт о тестировании" }).click();
  await expect(page).toHaveURL(`/sessions/${sessionId}/run/report`);
  const reportUrl = page.url();
  await expect(page.getByRole("heading", { name: "Отчёт о тестировании", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Итоги", exact: true }).getByRole("definition")).toHaveText(["4", "2", "1", "1"]);
  await expect(page.getByRole("region", { name: "Ошибки", exact: true })).toContainText("Имя пользователя принято без проверки длины.");
  await expect(page.getByRole("region", { name: "Ошибки", exact: true })).toContainText("Баг-репорт не создан");
  await expect(page.getByRole("region", { name: "Блокировки", exact: true })).toContainText("Тестовая среда недоступна.");
  await page.getByRole("navigation", { name: "Навигация по отчёту" }).getByRole("link", { name: "Результаты тестирования" }).click();

  const resultCards = page.getByRole("region", { name: "Записанные результаты" }).getByRole("listitem");
  await expect(resultCards.filter({ hasText: "ПРОЙДЕНО" }).getByRole("button", { name: "Создать баг-репорт" })).toHaveCount(0);
  await expect(resultCards.filter({ hasText: "ЗАБЛОКИРОВАНО" }).getByRole("button", { name: "Создать баг-репорт" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Создать баг-репорт" })).toHaveCount(1);
  await page.getByRole("button", { name: "Создать баг-репорт" }).click();
  await expect(page.getByRole("heading", { name: "Баг-репорт", exact: true })).toBeVisible();
  const bugUrl = page.url();
  await expect(page.getByRole("region", { name: "Заголовок", exact: true })).toContainText(`[Ошибка] ${usernamePlan.checks[1]!.title}`);
  await expect(page.getByRole("region", { name: "Предусловия", exact: true })).toContainText("Не указаны.");
  await expect(page.getByRole("region", { name: "Шаги воспроизведения", exact: true }).getByRole("listitem")).toHaveText(usernamePlan.checks[1]!.steps);
  await expect(page.getByRole("region", { name: "Тестовые данные", exact: true }).getByRole("listitem")).toHaveText(usernamePlan.checks[1]!.testData);
  await expect(page.getByRole("region", { name: "Ожидаемый результат", exact: true })).toContainText(usernamePlan.checks[1]!.expectedResult);
  await expect(page.getByRole("region", { name: "Фактический результат", exact: true })).toContainText("Имя пользователя принято без проверки длины.");
  await expect(page.getByRole("region", { name: "Дополнительная информация", exact: true })).toContainText("Повторено в Chrome.");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Скопировать баг-репорт" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Баг-репорт скопирован");
  const copiedText = await page.evaluate(() => navigator.clipboard.readText());
  // Windows clipboard converts LF to CRLF; the report content must be identical.
  expect(copiedText.replaceAll("\r\n", "\n")).toContain("Дополнительная информация:\nПовторено в Chrome.");
  await page.getByRole("link", { name: "Результаты тестирования" }).click();
  await expect(page.getByRole("button", { name: "Создать баг-репорт" })).toHaveCount(0);
  await page.getByRole("link", { name: "Открыть баг-репорт" }).click();
  await expect(page).toHaveURL(bugUrl);
  await page.reload();
  await expect(page.getByRole("region", { name: "Дополнительная информация", exact: true })).toContainText("Повторено в Chrome.");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard denied"); } } }));
  await page.getByRole("button", { name: "Скопировать баг-репорт" }).click();
  await expect(page.getByLabel("Текст баг-репорта")).toHaveValue(/Имя пользователя принято без проверки длины/);

  await page.goto(reportUrl);
  await page.reload();
  await expect(page.getByRole("region", { name: "Ошибки", exact: true }).getByRole("link", { name: "Открыть баг-репорт" })).toHaveAttribute("href", new URL(bugUrl).pathname);
  await page.getByRole("button", { name: "Скопировать отчёт", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Отчёт скопирован");
  const reportText = await page.evaluate(() => navigator.clipboard.readText());
  expect(reportText.replaceAll("\r\n", "\n")).toContain("Всего проверок: 4\nПройдено: 2\nОшибок: 1\nЗаблокировано: 1");
  expect(reportText).toContain("Тестовая среда недоступна.");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
  await page.getByRole("button", { name: "Скопировать отчёт", exact: true }).click();
  await expect(page.getByLabel("Текст отчёта", { exact: true })).toHaveValue(/Комментарий:\nПовторено в Chrome/);
  await page.getByRole("region", { name: "Ошибки", exact: true }).getByRole("link", { name: "Открыть баг-репорт" }).click();
  await expect(page).toHaveURL(bugUrl);
  await page.goto("/");
  await page.getByRole("link", { name: `Отчёт о тестировании: ${usernameTask.title}` }).click();
  await expect(page).toHaveURL(reportUrl);
  await expect(page.getByRole("region", { name: "Итоги", exact: true }).getByRole("definition")).toHaveText(["4", "2", "1", "1"]);

  const path = process.env.QA_PILOT_E2E_DATABASE;
  if (!path) throw new Error("Missing isolated browser-test database.");
  const database = new DatabaseSync(path);
  try {
    const plan = database.prepare("SELECT id FROM TestPlan WHERE sessionId = ?").get(sessionId) as { id: string };
    const run = database.prepare("SELECT id FROM TestRun WHERE planId = ?").get(plan.id) as { id: string };
    expect(database.prepare("SELECT count(*) AS count FROM TestRun WHERE planId = ?").get(plan.id)).toMatchObject({ count: 1 });
    expect(database.prepare("SELECT count(*) AS count FROM CheckResult WHERE runId = ?").get(run.id)).toMatchObject({ count: 4 });
    expect(database.prepare("SELECT count(*) AS count FROM BugReport WHERE resultId IN (SELECT id FROM CheckResult WHERE runId = ?)").get(run.id)).toMatchObject({ count: 1 });
  } finally {
    database.close();
  }
});
