import { expect, test } from "@playwright/test";
import {
  COLL_PRESET_DATA,
  ZBLL_PRESET_DATA,
  ZBLS_F2L_PRESET_DATA,
  ZBLS_PRESET_DATA,
} from "../../src/presetData.generated.js";

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];

async function openNetInput(page) {
  await page.goto("/");
  if (await page.getByTestId("preset-category-OLL").isVisible().catch(() => false)) return;
  await page.getByTestId("input-mode-pattern").click();
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
  for (const family of ["H", "Pi", "U", "T", "L", "S", "AS"]) {
    await page.getByTestId(`coll-group-${family}`).click();
    const expected = COLL_PRESET_DATA.filter((record) => record.family === family).length;
    await expect(page.locator('[data-testid^="preset-case-coll-"]')).toHaveCount(expected);
    total += expected;
  }
  return total;
}

async function sumZbllCases(page) {
  let total = 0;
  for (const family of ["H", "Pi", "U", "T", "L", "S", "AS"]) {
    await page.getByTestId(`zbll-family-${family}`).click();
    const collCases = COLL_PRESET_DATA.filter((record) => record.family === family);
    await expect(page.locator('[data-testid^="zbll-coll-"]')).toHaveCount(collCases.length);
    for (const coll of collCases) {
      await page.getByTestId(`zbll-coll-${coll.id}`).click();
      const expected = ZBLL_PRESET_DATA.filter((record) => record.coll === coll.name).length;
      await expect(page.locator('[data-testid^="preset-case-zbll-"]')).toHaveCount(expected);
      total += expected;
    }
  }
  return total;
}

async function sumZblsCases(page) {
  let total = 0;
  await expect(page.locator('[data-testid^="zbls-f2l-"]')).toHaveCount(42);
  for (const group of ZBLS_F2L_PRESET_DATA) {
    const button = page.getByTestId(`zbls-f2l-${group.id}`);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const count = await visibleCaseCount(page);
    expect(count, group.id).toBe(group.caseCount);
    total += count;
    await button.click();
  }
  return total;
}

function stateToPattern(state) {
  return Object.fromEntries(FACE_ORDER.map((face, faceIndex) => [
    face,
    state.slice(faceIndex * 9, faceIndex * 9 + 9).split(""),
  ]));
}

async function expectCubeState(page, state) {
  await expect(page.getByTestId("cube-editor")).toHaveAttribute("data-pattern-state", state);
}

function lastLayerPreviewColors(state) {
  const pattern = stateToPattern(state);
  return [
    pattern.B[2], pattern.B[1], pattern.B[0],
    pattern.L[0], pattern.U[0], pattern.U[1], pattern.U[2], pattern.R[2],
    pattern.L[1], pattern.U[3], pattern.U[4], pattern.U[5], pattern.R[1],
    pattern.L[2], pattern.U[6], pattern.U[7], pattern.U[8], pattern.R[0],
    pattern.F[0], pattern.F[1], pattern.F[2],
  ];
}

function collPreviewColors(state) {
  const colors = lastLayerPreviewColors(state);
  for (const index of [1, 5, 8, 9, 11, 12, 15, 19]) colors[index] = colors[index] === "U" ? "U" : "X";
  return colors;
}

function collFamilyPreviewColors(state) {
  const colors = collPreviewColors(state);
  for (const index of [0, 2, 3, 4, 6, 7, 13, 14, 16, 17, 18, 20]) {
    colors[index] = colors[index] === "U" ? "U" : "X";
  }
  return colors;
}

async function expectPreviewColors(tile, expected) {
  await expect(tile.locator("[data-color]")).toHaveCount(expected.length);
  expect(await tile.locator("[data-color]").evaluateAll((elements) => elements.map((element) => element.dataset.color))).toEqual(expected);
}

test("case preset hierarchy exposes all exact sets", async ({ page }) => {
  test.setTimeout(60000);
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

test("nested preset icons and applied cube states use the generated color arrays", async ({ page }) => {
  const coll = COLL_PRESET_DATA[0];
  await openPresetPanel(page, "COLL");
  await expectPreviewColors(page.getByTestId(`coll-group-${coll.family}`), collFamilyPreviewColors(coll.state));
  await page.getByTestId(`coll-group-${coll.family}`).click();
  const collTile = page.getByTestId(`preset-case-${coll.id}`);
  await expectPreviewColors(collTile, collPreviewColors(coll.state));
  await collTile.click();
  await expectCubeState(page, coll.state);

  const zbll = ZBLL_PRESET_DATA[0];
  const zbllColl = COLL_PRESET_DATA.find((record) => record.name === zbll.coll);
  await openPresetPanel(page, "ZBLL");
  await page.getByTestId(`zbll-family-${zbll.family}`).click();
  const zbllCollTile = page.getByTestId(`zbll-coll-${zbllColl.id}`);
  await expectPreviewColors(zbllCollTile, collPreviewColors(zbllColl.state));
  await zbllCollTile.click();
  const zbllTile = page.getByTestId(`preset-case-${zbll.id}`);
  await expectPreviewColors(zbllTile, lastLayerPreviewColors(zbll.state));
  await zbllTile.click();
  await expectCubeState(page, zbll.state);

  const zbls = ZBLS_PRESET_DATA[0];
  await openPresetPanel(page, "ZBLS");
  await page.getByTestId(`zbls-f2l-${zbls.f2l}`).click();
  const zblsTile = page.getByTestId(`preset-case-${zbls.id}`);
  await expect(zblsTile.locator("[data-zbls-cube-preview]")).toHaveCount(1);
  await expect(zblsTile.locator("[data-preview-face]")).toHaveCount(3);
  const zblsPattern = stateToPattern(zbls.state);
  await expectPreviewColors(zblsTile, [...zblsPattern.U, ...zblsPattern.F, ...zblsPattern.R]);
  await zblsTile.click();
  await expectCubeState(page, zbls.state);
});

test("dark-only pattern input supports camera orbit, bottom body rotation, and cube clicking", async ({ page }) => {
  await openNetInput(page);
  await expect(page.locator(".dark-mode")).toHaveCount(1);

  await page.getByRole("button", { name: "menu" }).click();
  await expect(page.getByText("ダークモード")).toHaveCount(0);
  await expect(page.getByText("手数を表示")).toHaveCount(0);
  await expect(page.getByText("URL共有")).toHaveCount(0);
  await expect(page.getByText("保存済み")).toHaveCount(0);
  await page.getByRole("button", { name: "close menu" }).click();

  await expect(page.getByText("状態プリセット", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("pattern-editor-net")).toHaveCount(0);
  await expect(page.getByTestId("pattern-editor-cube")).toHaveCount(0);
  await expect(page.locator(".quick-picks")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "状態" })).toBeVisible();
  await expect(page.getByLabel("必須パターン")).toBeVisible();
  await expect(page.getByLabel("禁止パターン")).toBeVisible();
  await expect(page.getByRole("button", { name: "探索", exact: true })).toBeVisible();
  await expect(page.getByTestId("cube-editor")).toBeVisible();
  const cubeCanvas = page.getByTestId("cube-canvas");
  await expect(cubeCanvas).toBeVisible();
  await expect(cubeCanvas).toHaveAttribute("data-interaction", "azimuth-elevation");
  await expect(cubeCanvas).toHaveAttribute("data-drag-target", "camera");
  await expect(cubeCanvas).toHaveAttribute("data-body-local-bottom", "D");
  await expect(cubeCanvas).toHaveAttribute("data-body-local-front", "F");
  const initialBox = await cubeCanvas.boundingBox();
  await page.mouse.move(initialBox.x + initialBox.width * 0.5, initialBox.y + initialBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + initialBox.width * 0.65, initialBox.y + initialBox.height * 0.5, { steps: 4 });
  await page.mouse.up();
  await expect(cubeCanvas).not.toHaveAttribute("data-azimuth", "0.0000");
  await expect(cubeCanvas).toHaveAttribute("data-elevation", "0.0000");
  const horizontalAzimuth = await cubeCanvas.getAttribute("data-azimuth");

  await page.mouse.move(initialBox.x + initialBox.width * 0.65, initialBox.y + initialBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + initialBox.width * 0.65, initialBox.y + initialBox.height * 0.6, { steps: 4 });
  await page.mouse.up();
  await expect(cubeCanvas).toHaveAttribute("data-azimuth", horizontalAzimuth);
  await expect(cubeCanvas).not.toHaveAttribute("data-elevation", "0.0000");
  await expect(cubeCanvas).toHaveAttribute("data-roll", "0.0000");

  await expect(page.getByTestId("bottom-color-D")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("bottom-color-U").click();
  await expect(page.getByTestId("bottom-color-U")).toHaveAttribute("aria-pressed", "true");
  await expect(cubeCanvas).toHaveAttribute("data-animating", "true");
  await expect(cubeCanvas).toHaveAttribute("data-animating", "false", { timeout: 1500 });
  await expect(cubeCanvas).toHaveAttribute("data-azimuth", "0.0000");
  await expect(cubeCanvas).toHaveAttribute("data-elevation", "0.0000");
  await expect(cubeCanvas).toHaveAttribute("data-body-local-bottom", "U");
  await expect(cubeCanvas).toHaveAttribute("data-body-local-front", "F");
  await expect(page.getByTestId("cube-editor")).toHaveAttribute("data-display-bottom-color", "D");
  await page.getByTestId("bottom-color-D").click();
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-animating", "false", { timeout: 1500 });
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-body-local-bottom", "D");

  await page.getByTestId("color-X").click();
  const box = await cubeCanvas.boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.58);
  await expect.poll(async () => (await page.getByTestId("cube-editor").getAttribute("data-pattern-state")).split("X").length - 1).toBe(1);
});

test("bottom color leaves the editor painted until a preset is selected", async ({ page }) => {
  const zbls = ZBLS_PRESET_DATA[0];
  await openPresetPanel(page, "ZBLS");
  await page.getByTestId(`zbls-f2l-${zbls.f2l}`).click();
  const zblsTile = page.getByTestId(`preset-case-${zbls.id}`);
  await expect(zblsTile.locator('[data-color="D"]').first()).toBeVisible();

  await page.getByTestId("bottom-color-U").click();
  await expect(page.getByTestId("cube-editor")).toHaveAttribute("data-display-bottom-color", "D");
  await expect(zblsTile.locator('[data-color="D"][data-display-color="U"]').first()).toBeVisible();

  await zblsTile.click();
  await expectCubeState(page, zbls.state);
  await expect(page.getByTestId("cube-editor")).toHaveAttribute("data-display-bottom-color", "U");
});
