import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const persistProfile = process.env.PW_PERSIST_PROFILE === "1";
const storageStatePath = path.resolve(".tmp/playwright-storage-state.json");
const envLocalPath = path.resolve(".env.local");

function readEnvLocalValue(key: string): string {
  if (!fs.existsSync(envLocalPath)) return "";
  try {
    const raw = fs.readFileSync(envLocalPath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) continue;
      const currentKey = trimmed.slice(0, eqIndex).trim();
      if (currentKey !== key) continue;
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      return value;
    }
  } catch {
    // ignore .env.local parse errors and fall back to defaults
  }
  return "";
}

const playwrightSpaceId = String(
  process.env.PW_TEST_SPACE_ID
  || readEnvLocalValue("PW_TEST_SPACE_ID")
  || "gotoolkit"
).trim().toLowerCase() || "gotoolkit";
const playwrightSpaceCode = String(
  process.env.PW_TEST_SPACE_CODE
  || readEnvLocalValue("PW_TEST_SPACE_CODE")
  || "gotoolkit"
).trim().toLowerCase() || "gotoolkit";

process.env.PW_TEST_SPACE_ID = playwrightSpaceId;
process.env.PW_TEST_SPACE_CODE = playwrightSpaceCode;

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
    storageState: fs.existsSync(storageStatePath) ? storageStatePath : undefined
  },
  webServer: {
    command: "npm run start:test",
    port: 5000,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
