import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const localBaseURL = "http://127.0.0.1:5173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run dev -- --host 127.0.0.1",
    url: localBaseURL,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
