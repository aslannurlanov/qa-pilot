import { expect, test } from "@playwright/test";

test("the production application renders its home page", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("QA Pilot");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: "Что именно нужно протестировать?", level: 1 })).toBeVisible();
  await expect(page.getByText("Превратите задачу или требование в структурированный план ручного тестирования.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Проверок пока нет" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Новая проверка" })).toBeVisible();
});
