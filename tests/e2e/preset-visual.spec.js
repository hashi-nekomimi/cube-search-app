import { expect, test } from "@playwright/test";

async function openZblsPresets(page) {
  await page.goto("/");
  if (!(await page.getByTestId("preset-category-ZBLS").isVisible().catch(() => false))) {
    await page.getByTestId("input-mode-pattern").click();
  }
  await page.getByTestId("preset-category-ZBLS").click();
  await page.getByTestId("zbls-f2l-f2l-1").click();
}

async function openCubeEditor(page) {
  await page.goto("/");
  if (!(await page.getByTestId("preset-category-ZBLS").isVisible().catch(() => false))) {
    await page.getByTestId("input-mode-pattern").click();
  }
  await expect(page.getByTestId("cube-canvas")).toBeVisible();
}

async function expectThreeCanvasPixels(page) {
  const stats = await page.getByTestId("cube-canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { width: 0, height: 0, nonBackground: 0, bright: 0 };
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let nonBackground = 0;
    let bright = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      if (Math.abs(r - 39) + Math.abs(g - 39) + Math.abs(b - 42) > 30) nonBackground += 1;
      if (r > 120 || g > 120 || b > 120) bright += 1;
    }
    return { width, height, nonBackground, bright };
  });
  expect(stats.width).toBeGreaterThan(250);
  expect(stats.height).toBeGreaterThan(250);
  expect(stats.nonBackground).toBeGreaterThan(1000);
  expect(stats.bright).toBeGreaterThan(500);
}

async function expectMobilePresetLayout(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  await page.getByTestId("input-mode-pattern").click();

  const categoryTabs = page.locator('[data-testid^="preset-category-"]');
  await expect(categoryTabs).toHaveCount(5);
  const tabBoxes = await categoryTabs.evaluateAll((tabs) => tabs.map((tab) => {
    const rect = tab.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top };
  }));
  expect(Math.max(...tabBoxes.map((box) => box.top)) - Math.min(...tabBoxes.map((box) => box.top))).toBeLessThan(2);
  expect(Math.min(...tabBoxes.map((box) => box.left))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...tabBoxes.map((box) => box.right))).toBeLessThanOrEqual(width);

  for (const category of ["OLL", "PLL", "COLL", "ZBLL", "ZBLS"]) {
    await page.getByTestId(`preset-category-${category}`).click();
    const panel = page.getByTestId("preset-panel");
    await expect(panel).toBeVisible();
    const tile = panel.locator(".preset-tile").first();
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute("aria-label", /.+/);
    await expect(tile.locator(":scope > span")).toHaveCount(0);
    const [panelBox, tileBox] = await Promise.all([panel.boundingBox(), tile.boundingBox()]);
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    expect(tileBox.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(tileBox.x + tileBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
    expect(tileBox.width).toBeGreaterThanOrEqual(60);
    expect(Math.abs(tileBox.width - tileBox.height)).toBeLessThanOrEqual(1);
  }

  await page.getByTestId("zbls-f2l-f2l-1").click();
  await expect(page.getByTestId("preset-case-zbls-f2l-1-1")).toBeVisible();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
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

test("all preset categories fit 320px and 390px mobile widths", async ({ page }, testInfo) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const width of [320, 390]) {
    await expectMobilePresetLayout(page, width);
    await page.screenshot({ path: testInfo.outputPath(`presets-${width}.png`), fullPage: true });
  }

  expect(consoleErrors).toEqual([]);
});

test("mobile form controls stay above the iOS focus-zoom threshold", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const algorithmInputSize = await page.getByTestId("algorithm-target").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(algorithmInputSize).toBeGreaterThanOrEqual(16);

  await page.getByTestId("input-mode-pattern").click();
  const inputSizes = await page.locator(".field input").evaluateAll((elements) => elements.map((element) => parseFloat(getComputedStyle(element).fontSize)));
  expect(inputSizes.length).toBeGreaterThan(0);
  expect(Math.min(...inputSizes)).toBeGreaterThanOrEqual(16);
});

test("algorithm target stays a compact single-line input", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const input = page.getByTestId("algorithm-target");
    await expect(input).toHaveJSProperty("tagName", "INPUT");
    const box = await input.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeLessThanOrEqual(48);
  }
});

test("azimuth-elevation Three.js cube renders nonblank on desktop and mobile", async ({ page }, testInfo) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openCubeEditor(page);
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-projection", "isometric");
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-interaction", "azimuth-elevation");
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-drag-target", "camera");
  await expectThreeCanvasPixels(page);
  await page.screenshot({ path: testInfo.outputPath("three-cube-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("cube-canvas")).toBeVisible();
  await expectThreeCanvasPixels(page);
  await page.screenshot({ path: testInfo.outputPath("three-cube-mobile.png"), fullPage: true });

  expect(consoleErrors).toEqual([]);
});
