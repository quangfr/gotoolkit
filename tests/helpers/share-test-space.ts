import fs from "node:fs";
import path from "node:path";

const envLocalPath = path.resolve(process.cwd(), ".env.local");

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
      return trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // ignore
  }
  return "";
}

export const PW_TEST_SPACE_ID = String(
  process.env.PW_TEST_SPACE_ID || readEnvLocalValue("PW_TEST_SPACE_ID") || "gotoolkit"
).trim().toLowerCase() || "gotoolkit";
export const PW_TEST_SPACE_CODE = String(
  process.env.PW_TEST_SPACE_CODE || readEnvLocalValue("PW_TEST_SPACE_CODE") || "gotoolkit"
).trim().toLowerCase() || "gotoolkit";
export const EPICONCEPT_SPACE_ID = "epiconcept";
export const EPICONCEPT_SPACE_CODE = String(
  process.env.EPICONCEPT_SPACE_CODE || readEnvLocalValue("EPICONCEPT_SPACE_CODE") || ""
).trim().toLowerCase();
