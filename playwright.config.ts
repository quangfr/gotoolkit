import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const persistProfile = process.env.PW_PERSIST_PROFILE === "1";
const profileDir = path.resolve(".tmp/playwright-profile");
const storageStatePath = path.resolve(".tmp/playwright-storage-state.json");

if (persistProfile) {
  fs.mkdirSync(profileDir, { recursive: true });
}

export default defineConfig({
  testDir: "tests",
  fullyParallel: !persistProfile,
  workers: persistProfile ? 1 : undefined,
  timeout: 60 * 1000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 30 * 1000,
    navigationTimeout: 30 * 1000,
    launchOptions: persistProfile
      ? {
          args: [`--user-data-dir=${profileDir}`]
        }
      : undefined,
    storageState: fs.existsSync(storageStatePath) ? storageStatePath : undefined
  },
  webServer: {
    command: "npm run start:test",
    port: 5000,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
