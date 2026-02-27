#!/usr/bin/env node

/**
 * Migrate legacy pages-meta records from status=archived to status=deleted
 * for delete-origin documents (archivedReason=deleted).
 *
 * Usage:
 *   node scripts/migrate-archived-pages-to-deleted.mjs --dry-run
 *   node scripts/migrate-archived-pages-to-deleted.mjs --apply
 *   node scripts/migrate-archived-pages-to-deleted.mjs --apply --batch-size=100
 *   node scripts/migrate-archived-pages-to-deleted.mjs --apply --base-url=https://share.gotoolkit.workers.dev
 *   node scripts/migrate-archived-pages-to-deleted.mjs --apply --include-missing-reason
 */

const DEFAULT_BASE_URL = "https://share.gotoolkit.workers.dev";
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 200;
const SYNC_SESSION_ID = `migrate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function parseArgs(argv) {
  const args = {
    apply: false,
    dryRun: false,
    includeMissingReason: false,
    baseUrl: DEFAULT_BASE_URL,
    batchSize: DEFAULT_BATCH_SIZE
  };

  for (const raw of argv) {
    const arg = String(raw || "").trim();
    if (!arg) continue;
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--include-missing-reason") args.includeMissingReason = true;
    else if (arg.startsWith("--base-url=")) args.baseUrl = arg.split("=").slice(1).join("=");
    else if (arg.startsWith("--batch-size=")) {
      const parsed = Number(arg.split("=").slice(1).join("="));
      if (Number.isFinite(parsed) && parsed > 0) {
        args.batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(parsed)));
      }
    }
  }

  if (!args.apply && !args.dryRun) {
    args.dryRun = true;
  }
  if (args.apply && args.dryRun) {
    throw new Error("Use either --apply or --dry-run, not both.");
  }
  args.baseUrl = String(args.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/g, "");
  if (!args.baseUrl) throw new Error("Invalid --base-url");
  return args;
}

function isArchived(payload) {
  return String(payload?.status || "").trim().toLowerCase() === "archived";
}

function canMigrate(payload, includeMissingReason) {
  if (!isArchived(payload)) return false;
  const reason = String(payload?.archivedReason || "").trim().toLowerCase();
  if (reason === "deleted") return true;
  if (!reason && includeMissingReason) return true;
  return false;
}

function toDeletedPayload(payload) {
  const archivedAt = String(payload?.archivedAt || "").trim();
  const nowIso = new Date().toISOString();
  return {
    ...payload,
    status: "deleted",
    deletedAt: String(payload?.deletedAt || archivedAt || nowIso).trim() || nowIso
  };
}

async function requestJson(url, options = {}) {
  const headers = {
    Accept: "application/json",
    "X-Sync-Session": SYNC_SESSION_ID,
    "X-Sync-JTI": `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
    "X-Sync-TS": String(Date.now()),
    ...(options.headers || {})
  };
  const response = await fetch(url, {
    ...options,
    headers
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText} ${body}`.trim());
  }
  return response.json();
}

async function listAllMetaDocs(baseUrl) {
  const url = `${baseUrl}/v1/shares/pages-meta?includeArchived=true&_ts=${Date.now()}`;
  const data = await requestJson(url, {
    method: "GET",
    headers: { Accept: "application/json" }
  });
  return Array.isArray(data?.documents) ? data.documents : [];
}

async function batchWriteMeta(baseUrl, writes) {
  const url = `${baseUrl}/v1/shares/pages-meta:batch`;
  const data = await requestJson(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ writes })
  });
  return Array.isArray(data?.results) ? data.results : [];
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[migrate] mode=${args.apply ? "apply" : "dry-run"} base=${args.baseUrl} batchSize=${args.batchSize}`);
  console.log(`[migrate] includeMissingReason=${args.includeMissingReason ? "true" : "false"}`);

  const docs = await listAllMetaDocs(args.baseUrl);
  console.log(`[migrate] loaded pages-meta docs=${docs.length}`);

  const candidates = docs
    .map(doc => {
      const id = String(doc?.id || "").trim();
      const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : null;
      if (!id || !payload) return null;
      if (!canMigrate(payload, args.includeMissingReason)) return null;
      return {
        id,
        payload: toDeletedPayload(payload),
        reason: String(payload?.archivedReason || "").trim().toLowerCase() || "(missing)"
      };
    })
    .filter(Boolean);

  const reasonCount = candidates.reduce((acc, item) => {
    const key = item.reason;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(`[migrate] candidates=${candidates.length}`);
  if (Object.keys(reasonCount).length) {
    console.log("[migrate] candidates by archivedReason:");
    for (const [reason, count] of Object.entries(reasonCount).sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      console.log(`  - ${reason}: ${count}`);
    }
  }

  if (!candidates.length) {
    console.log("[migrate] nothing to migrate");
    return;
  }

  if (!args.apply) {
    const preview = candidates.slice(0, 10).map(item => item.id);
    console.log(`[migrate] dry-run sample ids (${preview.length}/${candidates.length}):`);
    preview.forEach(id => console.log(`  - ${id}`));
    return;
  }

  let migrated = 0;
  const batches = chunk(
    candidates.map(item => ({ id: item.id, payload: item.payload })),
    args.batchSize
  );

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const results = await batchWriteMeta(args.baseUrl, batch);
    migrated += results.length;
    console.log(`[migrate] batch ${i + 1}/${batches.length}: wrote=${results.length}`);
  }

  console.log(`[migrate] done migrated=${migrated} expected=${candidates.length}`);
  if (migrated !== candidates.length) {
    throw new Error(`Partial migration: migrated=${migrated} expected=${candidates.length}`);
  }
}

main().catch(err => {
  console.error(`[migrate] failed: ${String(err?.message || err || "unknown error")}`);
  process.exitCode = 1;
});
