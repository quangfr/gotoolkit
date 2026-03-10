import fs from "node:fs";
import path from "node:path";

const storageStatePath = path.resolve(".tmp/playwright-storage-state.json");
const msAuthStatePath = path.resolve(".tmp/playwright-ms-auth-state.json");
const legacyMsAuthStatePath = path.resolve("playwright/.auth/ms.json");
const effectiveStorageStatePath = path.resolve(".tmp/playwright-effective-storage-state.json");
const appOrigin = "http://127.0.0.1:5000";
const docsTourSeenKey = "go-toolkit-docs-tour-seen.v1";
const connectionPromptKey = "go-toolkit-connection-prompt-v1";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state || { cookies: [], origins: [] }));
}

function upsertLocalStorageEntry(entries, name, value) {
  const nextEntries = Array.isArray(entries) ? entries : [];
  const existing = nextEntries.find(entry => String(entry?.name || "") === name);
  if (existing) {
    existing.value = value;
    return nextEntries;
  }
  nextEntries.push({ name, value });
  return nextEntries;
}

export default async function globalSetup() {
  const baseState = cloneState(
    readJson(msAuthStatePath)
    || readJson(legacyMsAuthStatePath)
    || readJson(storageStatePath)
    || { cookies: [], origins: [] }
  );

  const origins = Array.isArray(baseState.origins) ? baseState.origins : [];
  let appState = origins.find(entry => String(entry?.origin || "") === appOrigin);
  if (!appState) {
    appState = { origin: appOrigin, localStorage: [] };
    origins.push(appState);
  }

  appState.localStorage = upsertLocalStorageEntry(
    appState.localStorage,
    docsTourSeenKey,
    "1"
  );
  appState.localStorage = upsertLocalStorageEntry(
    appState.localStorage,
    connectionPromptKey,
    JSON.stringify({
      lastPromptAt: Date.now(),
      neverRemind: true
    })
  );

  baseState.origins = origins;
  fs.mkdirSync(path.dirname(effectiveStorageStatePath), { recursive: true });
  fs.writeFileSync(effectiveStorageStatePath, `${JSON.stringify(baseState, null, 2)}\n`, "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await globalSetup();
}
