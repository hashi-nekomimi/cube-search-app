import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const localBaseURL = "http://127.0.0.1:4173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 2,
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: localBaseURL,
    reuseExistingServer: false,
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
