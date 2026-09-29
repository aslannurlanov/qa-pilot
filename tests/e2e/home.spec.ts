import { expect, test } from "@playwright/test";

test("the production application renders its foundation page", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("QA Pilot");
  await expect(page.getByRole("heading", { name: "QA Pilot", level: 1 })).toBeVisible();
  await expect(page.getByText("Manual QA test planning assistant", { exact: true })).toBeVisible();
  await expect(page.getByText("MVP v0.1", { exact: true })).toBeVisible();
});
