import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    browserName: "chromium",
    baseURL: process.env.E2E_BASE ?? "http://localhost:3123",
    timezoneId: "America/Denver",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
  },
});
