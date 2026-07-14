import { expect, test } from "@playwright/test";

test("search results show regrip counts and can be sorted by metrics", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("既存の手順を入力…").fill("R U R' U'");
  await page.getByLabel("生成系").fill("R U");
  await page.getByLabel("手数上限").fill("6");
  await page.getByLabel("表示件数").fill("5");
  await page.getByRole("button", { name: "手順から探索" }).click();

  await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("metric-regrip").first()).toContainText(/リグリップ\s*[0-9—]/);

  for (const sortKey of ["symbol", "quarter", "regrip", "effective"]) {
    await page.getByTestId(`sort-${sortKey}`).click();
    await expect(page.getByTestId(`sort-${sortKey}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("solution-card").first()).toBeVisible();
  }
});
