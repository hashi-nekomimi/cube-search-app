import { expect, test } from "@playwright/test";

async function openPresetPanel(page, category) {
  if (!(await page.getByTestId("preset-category-OLL").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "menu" }).click();
    await page.locator("button").filter({ hasText: "入力方式" }).click();
    await page.getByRole("button", { name: "close menu" }).click();
  }
  await page.getByTestId(`preset-category-${category}`).click();
}

async function expectPresetCount(page, category, count) {
  await openPresetPanel(page, category);
  const panel = page.getByTestId("preset-panel");
  await expect(panel.locator("button")).toHaveCount(count);
}

test("case preset buttons expose the expected full sets", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "手順探索" })).toBeVisible();

  await expectPresetCount(page, "OLL", 57);
  await expectPresetCount(page, "PLL", 21);
  await expectPresetCount(page, "ZBLL", 493);
  await expectPresetCount(page, "ZBLS", 302);
});

test("COLL groups expose all 42 cases", async ({ page }) => {
  await page.goto("/");
  await openPresetPanel(page, "COLL");

  const expectedGroups = ["H", "Pi", "U", "T", "L", "S", "AS"];
  for (const group of expectedGroups) {
    await page.getByTestId(`coll-group-${group}`).click();
    await expect(page.locator(".border-t button")).toHaveCount(6);
  }
});
