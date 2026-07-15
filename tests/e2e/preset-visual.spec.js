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
  await page.getByTestId("pattern-editor-cube").click();
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

test("azimuth-elevation Three.js cube renders nonblank on desktop and mobile", async ({ page }, testInfo) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openCubeEditor(page);
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-projection", "isometric");
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-interaction", "azimuth-elevation");
  await expect(page.getByTestId("cube-canvas")).toHaveAttribute("data-cube-rotation", "fixed");
  await expectThreeCanvasPixels(page);
  await page.screenshot({ path: testInfo.outputPath("three-cube-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("cube-canvas")).toBeVisible();
  await expectThreeCanvasPixels(page);
  await page.screenshot({ path: testInfo.outputPath("three-cube-mobile.png"), fullPage: true });

  expect(consoleErrors).toEqual([]);
});
