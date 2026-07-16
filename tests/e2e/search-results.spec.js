import { expect, test } from "@playwright/test";
import { patternMatchesState, stateFromSolution } from "../../scripts/cube-state.mjs";
import { ZBLS_PRESET_DATA } from "../../src/presetData.generated.js";

async function openPatternInput(page) {
  await page.goto("/");
  await page.getByTestId("input-mode-pattern").click();
}

async function fillSearchConditions(page, generator, depth) {
  await page.getByLabel("生成系").fill(generator);
  await page.getByLabel("HTM上限").fill(String(depth));
}

test("search results show regrip counts and can be sorted by metrics", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  await expect(page.getByTestId("solution-card")).toHaveCount(0);
  await expect(page.locator(".result-count")).toHaveCount(0);
  await expect(page.locator(".results-panel")).toHaveCount(0);
  await expect(page.locator(".results-placeholder")).toHaveCount(0);
  await expect(page.getByText("探索対象", { exact: true })).toHaveCount(0);

  await page.getByPlaceholder("既存の手順を入力…").fill("R U R' U'");
  await page.getByLabel("生成系").fill("R U");
  await page.getByLabel("HTM上限").fill("6");
  await page.getByRole("button", { name: "探索", exact: true }).click();

  await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("metric-ease").first()).toContainText(/EASE\s*[0-9]/);
  await expect(page.getByTestId("metric-symbol").first()).toContainText(/HTM\s*[0-9]/);
  await expect(page.getByTestId("metric-regrip").first()).toContainText(/リグリップ\s*[0-9—]/);
  await expect(page.getByTestId("metric-effective")).toHaveCount(0);
  await expect(page.getByTestId("metric-quarter")).toHaveCount(0);
  await expect(page.getByTestId("solution-list")).not.toHaveClass(/md:grid-cols-2/);
  const desktopLayout = await page.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    const input = document.querySelector(".input-panel").getBoundingClientRect();
    const results = document.querySelector(".results-panel").getBoundingClientRect();
    const solutionList = document.querySelector("[data-testid=solution-list]");
    return {
      workspaceColumns: getComputedStyle(workspace).gridTemplateColumns.split(/\s+/).length,
      solutionColumns: getComputedStyle(solutionList).gridTemplateColumns.split(/\s+/).length,
      resultsBelowInput: results.top >= input.bottom,
    };
  });
  expect(desktopLayout).toEqual({ workspaceColumns: 1, solutionColumns: 1, resultsBelowInput: true });
  await expect(page.getByTestId("solution-sort-select")).toHaveValue("symbol");
  await expect(page.getByTestId("solution-sort-select").locator("option")).toHaveText(["HTM", "EASE", "リグリップ"]);
  await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "コピー", exact: true })).toHaveCount(0);

  await page.getByTestId("metric-symbol").first().click();
  await expect(page.getByTestId("move-count-detail").first()).toContainText("STM");
  await expect(page.getByTestId("move-count-detail").first()).toContainText("HTM");
  await expect(page.getByTestId("move-count-detail").first()).toContainText("QTM");
  await page.getByTestId("metric-symbol").first().click();

  await page.getByTestId("metric-regrip").first().click();
  await expect(page.getByTestId("regrip-detail").first()).toBeVisible();
  expect(await page.getByTestId("regrip-detail").first().getByTestId("regrip-step").count()).toBeGreaterThan(0);
  await page.getByTestId("metric-regrip").first().click();

  await page.getByTestId("metric-ease").first().click();
  const easeDetail = page.getByTestId("ease-detail").first();
  await expect(easeDetail).toBeVisible();
  await expect(easeDetail.getByTestId("ease-adjustment-base")).toContainText("BASE100");
  await expect(easeDetail.getByTestId("ease-adjustment-htm")).toContainText("HTM-12");
  await expect(easeDetail.getByTestId("ease-adjustment-patterns")).toContainText("PATTERN+8");
  await expect(easeDetail.locator("p, code")).toHaveCount(0);
  await page.getByTestId("metric-ease").first().click();

  await expect(page.getByTestId("filter-auf")).toHaveCount(0);
  await expect(page.getByTestId("filter-regrip")).toHaveCount(0);
  await expect(page.getByTestId("filter-ease")).toHaveCount(0);
  await expect(page.getByText("絞り込み", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("filter-feature")).toHaveValue("all");
  await expect(page.getByTestId("filter-feature").locator("option")).toHaveText(["All", "Sexy Move", "Sune", "Commutator", "Sledgehammer"]);

  const defaultHighlight = page.getByTestId("solution-card").first().getByTestId("feature-highlight");
  await expect(defaultHighlight).toHaveText("R U R' U'");
  await expect(defaultHighlight).toHaveAttribute("data-feature-label", "Sexy");

  await page.getByTestId("filter-feature").selectOption("sexy");
  await expect(page.getByTestId("filter-feature")).toHaveClass(/is-active/);
  const highlightedFeature = page.getByTestId("solution-card").first().getByTestId("feature-highlight");
  await expect(highlightedFeature).toHaveText("R U R' U'");
  await expect(highlightedFeature).toHaveAttribute("data-feature-label", "Sexy");

  await page.setViewportSize({ width: 320, height: 844 });
  const controlBoxes = await page.locator(".solution-sort, .solution-pattern-filter").evaluateAll((controls) => controls.map((control) => {
    const rect = control.getBoundingClientRect();
    return { top: rect.top, left: rect.left, right: rect.right };
  }));
  expect(controlBoxes).toHaveLength(2);
  expect(Math.abs(controlBoxes[0].top - controlBoxes[1].top)).toBeLessThan(2);
  expect(Math.min(...controlBoxes.map((box) => box.left))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...controlBoxes.map((box) => box.right))).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.getByTestId("filter-feature").selectOption("sune");
  await expect(page.getByTestId("solution-card")).toHaveCount(0);
  await page.getByRole("button", { name: "リセット", exact: true }).click();
  await expect(page.getByTestId("solution-card").first()).toBeVisible();

  const firstAlgorithm = page.getByTestId("solution-alg").first();
  const copiedAlgorithm = await firstAlgorithm.getAttribute("data-alg");
  await firstAlgorithm.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(copiedAlgorithm);
  await expect(page.getByRole("status")).toHaveText("コピーしました");

  for (const sortKey of ["ease", "symbol", "regrip"]) {
    await page.getByTestId("solution-sort-select").selectOption(sortKey);
    await expect(page.getByTestId("solution-sort-select")).toHaveValue(sortKey);
    await expect(page.getByTestId("solution-card").first()).toBeVisible();
  }
});

test("search treats double turns as one HTM move", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("既存の手順を入力…").fill("R2");
  await fillSearchConditions(page, "R", 1);
  await page.getByRole("button", { name: "探索", exact: true }).click();

  await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("solution-alg").first()).toHaveText("R2");
});

test("required and forbidden move patterns filter emitted solutions", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("既存の手順を入力…").fill("R U R' U'");
  await fillSearchConditions(page, "R U", 4);
  await page.getByLabel("必須パターン").fill("R U R' U'");
  await page.getByRole("button", { name: "探索", exact: true }).click();
  await expect(page.getByTestId("solution-alg")).toHaveText(["R U R' U'"]);

  await page.getByLabel("禁止パターン").fill("R U R' U'");
  await page.getByRole("button", { name: "探索", exact: true }).click();
  await expect(page.getByTestId("solution-card")).toHaveCount(0);
});

test("V perm preset search returns the same eight RUD solutions", async ({ page }) => {
  const displayedVPerm = "R' U R' U' R D' R' D R' ( U D' ) R2 U' R2 D R2";
  await openPatternInput(page);
  await fillSearchConditions(page, "R U D", 16);
  await page.getByTestId("preset-category-PLL").click();
  await page.getByTestId("preset-case-pll-19-v").click();
  await page.getByRole("button", { name: "探索", exact: true }).click();

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
    const searchButton = page.getByRole("button", { name: "探索", exact: true });
    const startedAt = Date.now();
    await searchButton.click();
    await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 3000 });
    await expect(searchButton).toHaveText("探索", { timeout: 12000 });
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
    const searchButton = page.getByRole("button", { name: "探索", exact: true });
    const startedAt = Date.now();
    await searchButton.click();
    await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 3000 });
    await expect(searchButton).toHaveText("探索", { timeout: 12000 });
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
  const searchButton = page.getByRole("button", { name: "探索", exact: true });
  await searchButton.click();
  await expect(searchButton).toHaveText("探索", { timeout: 12000 });

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
    const searchButton = page.getByRole("button", { name: "探索", exact: true });
    await searchButton.click();
    await expect(page.getByTestId("solution-card").first()).toBeVisible({ timeout: 12000 });
    await expect(searchButton).toHaveText("探索", { timeout: 12000 });

    const solutions = await page.getByTestId("solution-alg").allTextContents();
    expect(solutions.length).toBeGreaterThan(0);
    for (const solution of solutions) {
      expect(patternMatchesState(preset.state, stateFromSolution(solution))).toBe(true);
    }
  });
}
