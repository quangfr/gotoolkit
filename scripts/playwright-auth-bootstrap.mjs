import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const profileDir = path.join(rootDir, ".tmp", "playwright-profile");
const storageStatePath = path.join(rootDir, ".tmp", "playwright-storage-state.json");
const targetUrl = process.env.PW_BOOTSTRAP_URL || "http://127.0.0.1:5000/index.html";

fs.mkdirSync(profileDir, { recursive: true });
fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1280, height: 720 }
});

const page = context.pages()[0] || await context.newPage();
await page.goto(targetUrl, { waitUntil: "load" });

console.log(`Bootstrap browser opened at ${targetUrl}`);
console.log("Complete SSO/login in the browser, then press Enter here to save storage state and close.");

await new Promise((resolve) => {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.once("data", () => resolve());
});

await context.storageState({ path: storageStatePath });
await context.close();

console.log(`Saved storage state to ${storageStatePath}`);
