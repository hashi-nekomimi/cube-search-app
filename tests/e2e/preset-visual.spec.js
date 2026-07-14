import { expect, test } from "@playwright/test";

async function openZblsPresets(page) {
  await page.goto("/");
  if (!(await page.getByTestId("preset-category-ZBLS").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "menu" }).click();
    await page.getByTestId("toggle-net-input").click();
    await page.getByRole("button", { name: "close menu" }).click();
  }
  await page.getByTestId("preset-category-ZBLS").click();
  await page.getByTestId("zbls-f2l-f2l-1").click();
}

test("ZBLS preset chooser renders cleanly on desktop and mobile", async ({ page }, testInfo) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openZblsPresets(page);
  await expect(page.getByTestId("preset-case-zbls-f2l-1-1")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("zbls-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("preset-panel")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("zbls-mobile.png"), fullPage: true });

  expect(consoleErrors).toEqual([]);
});
