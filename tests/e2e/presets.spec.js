import { expect, test } from "@playwright/test";

async function openNetInput(page) {
  await page.goto("/");
  if (await page.getByTestId("preset-category-OLL").isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "menu" }).click();
  await page.getByTestId("toggle-net-input").click();
  await page.getByRole("button", { name: "close menu" }).click();
}

async function openPresetPanel(page, category) {
  await openNetInput(page);
  await page.getByTestId(`preset-category-${category}`).click();
  await expect(page.getByTestId("preset-panel")).toBeVisible();
}

async function visibleCaseCount(page) {
  return page.getByTestId("preset-panel").locator('[data-testid^="preset-case-"]').count();
}

async function sumCollCases(page) {
  let total = 0;
  for (const group of ["H", "Pi", "U", "T", "L", "S", "AS"]) {
    await page.getByTestId(`coll-group-${group}`).click();
    const expected = group === "H" ? 4 : 6;
    await expect(page.locator('[data-testid^="preset-case-coll-"]')).toHaveCount(expected);
    total += expected;
  }
  return total;
}

async function sumZbllCases(page) {
  let total = 0;
  for (const family of ["H", "Pi", "U", "T", "L", "S", "AS"]) {
    await page.getByTestId(`zbll-family-${family}`).click();
    const collButtons = page.locator(`[data-testid^="zbll-coll-coll-${family.toLowerCase()}-"]`);
    const collCount = family === "H" ? 4 : 6;
    await expect(collButtons).toHaveCount(collCount);
    for (let i = 0; i < collCount; i += 1) {
      await collButtons.nth(i).click();
      const expected = family === "H" && i >= 2 ? 8 : 12;
      await expect(page.locator('[data-testid^="preset-case-zbll-"]')).toHaveCount(expected);
      total += expected;
    }
  }
  return total;
}

async function sumZblsCases(page) {
  let total = 0;
  const f2lButtons = page.locator('[data-testid^="zbls-f2l-"]');
  await expect(f2lButtons).toHaveCount(42);
  for (let i = 0; i < 42; i += 1) {
    await f2lButtons.nth(i).scrollIntoViewIfNeeded();
    await f2lButtons.nth(i).click();
    const count = await visibleCaseCount(page);
    expect(count).toBeGreaterThan(0);
    total += count;
  }
  return total;
}

test("case preset hierarchy exposes the expected sets", async ({ page }) => {
  await openPresetPanel(page, "OLL");
  await expect(page.locator('[data-testid^="preset-case-oll-"]')).toHaveCount(57);

  await openPresetPanel(page, "PLL");
  await expect(page.locator('[data-testid^="preset-case-pll-"]')).toHaveCount(21);

  await openPresetPanel(page, "COLL");
  expect(await sumCollCases(page)).toBe(40);

  await openPresetPanel(page, "ZBLL");
  expect(await sumZbllCases(page)).toBe(472);

  await openPresetPanel(page, "ZBLS");
  expect(await sumZblsCases(page)).toBe(302);
});

test("nested presets apply their color arrays to the net", async ({ page }) => {
  await openPresetPanel(page, "COLL");
  await page.getByTestId("coll-group-H").click();
  await page.locator('[data-testid^="preset-case-coll-h-"]').first().click();
  await expect(page.getByTestId("net-U-0")).toHaveAttribute("data-color", /[RFLB]/);

  await openPresetPanel(page, "ZBLL");
  await page.getByTestId("zbll-family-U").click();
  await page.getByTestId("zbll-coll-coll-u-1").click();
  await page.locator('[data-testid^="preset-case-zbll-u-1-"]').first().click();
  await expect(page.getByTestId("net-U-1")).toHaveAttribute("data-color", /[URFLB]/);

  await openPresetPanel(page, "ZBLS");
  await page.getByTestId("zbls-f2l-f2l-1").click();
  await page.locator('[data-testid^="preset-case-zbls-f2l-1-"]').first().click();
  await expect(page.getByTestId("net-F-8")).toHaveAttribute("data-color", /[DFR]/);
});
