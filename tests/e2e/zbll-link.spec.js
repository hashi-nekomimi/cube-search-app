import { expect, test } from "@playwright/test";
import { ZBLL_PRESET_DATA } from "../../src/presetData.generated.js";

test("opens the linked ZBLL in the net search without running a search", async ({ page }) => {
  const record = ZBLL_PRESET_DATA.find((item) => item.id === "zbll-zbll-u-13");
  expect(record).toBeTruthy();
  await page.goto(`/?zbll=${record.id}`);
  await expect(page.getByTestId("cube-editor")).toHaveAttribute("data-pattern-state", record.state);
  await expect(page.getByTestId("input-mode-pattern")).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByTestId("cube-editor")).toHaveAttribute("data-pattern-state", record.state);
});

test("an unknown linked pattern is reported and the editor remains available", async ({ page }) => {
  await page.goto("/?zbll=unknown-case");
  await expect(page.getByText("The linked ZBLL pattern was not found.")).toBeVisible();
  await expect(page.getByTestId("cube-editor")).toBeVisible();
});
