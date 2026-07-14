import { expect, test } from "@playwright/test";
import { FACE_ORDER, patternMatchesState, stateFromSolution } from "../../scripts/cube-state.mjs";
import { ZBLS_PRESET_DATA } from "../../src/presetData.generated.js";

function stateToPattern(state) {
  return Object.fromEntries(FACE_ORDER.map((face, faceIndex) => [
    face,
    state.slice(faceIndex * 9, faceIndex * 9 + 9).split(""),
  ]));
}

async function openPatternInput(page) {
  await page.goto("/");
  await page.getByTestId("input-mode-pattern").click();
}

async function fillSearchConditions(page, generator, depth) {
  await page.getByLabel("生成系").fill(generator);
  await page.getByLabel("手数上限").fill(String(depth));
}

async function setNetPattern(page, state) {
  const pattern = stateToPattern(state);
  for (const color of FACE_ORDER) {
    const stickers = [];
    for (const face of FACE_ORDER) {
      for (let index = 0; index < 9; index += 1) {
        if (index !== 4 && pattern[face][index] === color && color !== face) {
          stickers.push({ face, index });
        }
      }
    }
    if (!stickers.length) continue;
    await page.getByTestId(`color-${color}`).click();
    for (const sticker of stickers) {
      await page.getByTestId(`net-${sticker.face}-${sticker.index}`).click();
    }
  }
}

test("search results show regrip counts and can be sorted by metrics", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("既存の手順を入力…").fill("R U R' U'");
  await page.getByLabel("生成系").fill("R U");
  await page.getByLabel("手数上限").fill("6");
  await page.getByRole("button", { name: "手順から探索" }).click();

  await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("metric-effective").first()).toContainText(/STM\s*[0-9]/);
  await expect(page.getByTestId("metric-symbol").first()).toContainText(/HTM\s*[0-9]/);
  await expect(page.getByTestId("metric-quarter").first()).toContainText(/QTM\s*[0-9]/);
  await expect(page.getByTestId("metric-regrip").first()).toContainText(/リグリップ\s*[0-9—]/);
  await expect(page.getByTestId("solution-list")).not.toHaveClass(/md:grid-cols-2/);
  await expect(page.getByTestId("sort-effective")).toHaveText("STM");
  await expect(page.getByTestId("sort-symbol")).toHaveText("HTM");
  await expect(page.getByTestId("sort-quarter")).toHaveText("QTM");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);

  for (const sortKey of ["symbol", "quarter", "regrip", "effective"]) {
    await page.getByTestId(`sort-${sortKey}`).click();
    await expect(page.getByTestId(`sort-${sortKey}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("solution-card").first()).toBeVisible();
  }
});

test("pattern search treats double turns as one searchable symbol move", async ({ page }) => {
  await openPatternInput(page);
  await setNetPattern(page, stateFromSolution("R2"));
  await fillSearchConditions(page, "R", 1);
  await page.getByRole("button", { name: "展開図から探索" }).click();

  await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("solution-alg").first()).toHaveText("R2");
});

test("V perm preset search returns the same eight RUD solutions", async ({ page }) => {
  const displayedVPerm = "R' U R' U' R D' R' D R' ( U D' ) R2 U' R2 D R2";
  await openPatternInput(page);
  await fillSearchConditions(page, "R U D", 16);
  await page.getByTestId("preset-category-PLL").click();
  await page.getByTestId("preset-case-pll-19-v").click();
  await page.getByRole("button", { name: "展開図から探索" }).click();

  await expect(page.getByTestId("solution-card")).toHaveCount(8, { timeout: 30000 });
  await expect(page.getByTestId("solution-alg").filter({ hasText: displayedVPerm })).toHaveCount(1);
});

test("four and five generator searches finish quickly with verified solutions", async ({ page }) => {
  test.setTimeout(30000);
  const vPerm = "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2";
  const expectedState = stateFromSolution(vPerm);

  for (const searchMovesText of ["R U D F", "R U D F L"]) {
    await page.goto("/");
    await page.getByPlaceholder("既存の手順を入力…").fill(vPerm);
    await fillSearchConditions(page, searchMovesText, 16);
    await expect(page.getByRole("textbox", { name: /生成系/ })).toHaveValue(searchMovesText);
    const searchButton = page.getByRole("button", { name: "手順から探索" });
    const startedAt = Date.now();
    await searchButton.click();
    await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 3000 });
    await expect(searchButton).toHaveText("手順から探索", { timeout: 12000 });
    expect(Date.now() - startedAt).toBeLessThan(12000);

    const solutions = await page.getByTestId("solution-alg").allTextContents();
    expect(solutions.length).toBeGreaterThanOrEqual(8);
    for (const solution of solutions) expect(stateFromSolution(solution)).toBe(expectedState);
  }
});

test("targets that use every selected face also take the fast path", async ({ page }) => {
  test.setTimeout(30000);
  const cases = [
    { targetAlg: "R U F D R' U2 F' D2", searchMovesText: "R U F D", maxSymbolDepth: 8 },
    { targetAlg: "R U F D L R' U2 F' D2 L'", searchMovesText: "R U F D L", maxSymbolDepth: 10 },
  ];

  for (const searchCase of cases) {
    const expectedState = stateFromSolution(searchCase.targetAlg);

    await page.goto("/");
    await page.getByPlaceholder("既存の手順を入力…").fill(searchCase.targetAlg);
    await fillSearchConditions(page, searchCase.searchMovesText, searchCase.maxSymbolDepth);
    const searchButton = page.getByRole("button", { name: "手順から探索" });
    const startedAt = Date.now();
    await searchButton.click();
    await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 3000 });
    await expect(searchButton).toHaveText("手順から探索", { timeout: 12000 });
    expect(Date.now() - startedAt).toBeLessThan(12000);

    const solutions = await page.getByTestId("solution-alg").allTextContents();
    expect(solutions.length).toBeGreaterThan(0);
    for (const solution of solutions) expect(stateFromSolution(solution)).toBe(expectedState);
  }
});

test("five generator PLL preset search uses the verified preset seed", async ({ page }) => {
  test.setTimeout(20000);
  const vPerm = "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2";
  const expectedState = stateFromSolution(vPerm);
  await openPatternInput(page);
  await fillSearchConditions(page, "R U D F L", 16);
  await page.getByTestId("preset-category-PLL").click();
  await page.getByTestId("preset-case-pll-19-v").click();
  const searchButton = page.getByRole("button", { name: "展開図から探索" });
  await searchButton.click();
  await expect(searchButton).toHaveText("展開図から探索", { timeout: 12000 });

  const solutions = await page.getByTestId("solution-alg").allTextContents();
  expect(solutions.length).toBeGreaterThanOrEqual(8);
  for (const solution of solutions) expect(stateFromSolution(solution)).toBe(expectedState);
});

for (const presetId of ["zbls-f2l-1-1", "zbls-f2l-25-1", "zbls-f2l-31-1", "zbls-f2l-37-1"]) {
  test(`five generator ZBLS search verifies ${presetId}`, async ({ page }) => {
    test.setTimeout(20000);
    const preset = ZBLS_PRESET_DATA.find((candidate) => candidate.id === presetId);
    await openPatternInput(page);
    await fillSearchConditions(page, "R U D F L", 16);
    await page.getByTestId("preset-category-ZBLS").click();
    await page.getByTestId(`zbls-f2l-${preset.f2l}`).click();
    await page.getByTestId(`preset-case-${preset.id}`).click();
    const searchButton = page.getByRole("button", { name: "展開図から探索" });
    await searchButton.click();
    await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 12000 });
    await expect(searchButton).toHaveText("展開図から探索", { timeout: 12000 });

    const solutions = await page.getByTestId("solution-alg").allTextContents();
    expect(solutions.length).toBeGreaterThan(0);
    for (const solution of solutions) {
      expect(patternMatchesState(preset.state, stateFromSolution(solution))).toBe(true);
    }
  });
}
