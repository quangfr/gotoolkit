import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  timeout: 60 * 1000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 30 * 1000,
    navigationTimeout: 30 * 1000
  },
  webServer: {
    command: "npm start",
    port: 5000,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
