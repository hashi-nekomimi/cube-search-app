import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { FACE_ORDER, stateFromSolution } from "../../scripts/cube-state.mjs";

function stateToPattern(state) {
  return Object.fromEntries(FACE_ORDER.map((face, faceIndex) => [
    face,
    state.slice(faceIndex * 9, faceIndex * 9 + 9).split(""),
  ]));
}

function encodeShareState(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

test("search results show regrip counts and can be sorted by metrics", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("既存の手順を入力…").fill("R U R' U'");
  await page.getByLabel("生成系").fill("R U");
  await page.getByLabel("手数上限").fill("6");
  await page.getByRole("button", { name: "手順から探索" }).click();

  await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("metric-regrip").first()).toContainText(/リグリップ\s*[0-9—]/);
  await expect(page.getByTestId("solution-list")).not.toHaveClass(/md:grid-cols-2/);

  for (const sortKey of ["symbol", "quarter", "regrip", "effective"]) {
    await page.getByTestId(`sort-${sortKey}`).click();
    await expect(page.getByTestId(`sort-${sortKey}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("solution-card").first()).toBeVisible();
  }
});

test("pattern search treats double turns as one searchable symbol move", async ({ page }) => {
  const hash = encodeShareState({
    showNetInput: true,
    targetPattern: stateToPattern(stateFromSolution("R2")),
    searchMovesText: "R",
    maxSymbolDepth: 1,
    showMoveCounts: true,
    solutionSortKey: "symbol",
    language: "ja",
  });

  await page.goto(`/#s=${hash}`);
  await page.getByRole("button", { name: "展開図から探索" }).click();

  await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("solution-alg").first()).toHaveText("R2");
});
