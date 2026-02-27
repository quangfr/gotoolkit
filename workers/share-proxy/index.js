const API_VERSION = "v1";
const SHARES_SEGMENT = "shares";
const ASSETS_SEGMENT = "assets";
const SPACES_SEGMENT = "spaces";
const VALID_COLLECTIONS = new Set([
  "grids",
  "pages",
  "pages-meta",
  "template-memos",
  "handoffs",
  "codes_map"
]);
const GOOGLE_API_SCOPE = [
  "https://www.googleapis.com/auth/datastore"
].join(" ");
const FIREBASE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ALLOWED_ASSET_MIME_PREFIXES = ["image/", "video/", "audio/"];
const ALLOWED_ASSET_MIME_TYPES = new Set([
  "application/x-gotoolkit-e2ee+json",
  "application/json"
]);
const SYNC_REPLAY_TTL_SECONDS = 10 * 60;
const SYNC_SKEW_MS = 10 * 60 * 1000;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const LOCAL_SYNC_REVOKE_CACHE_TTL_MS = 60 * 1000;
const LOCAL_SYNC_JTI_CACHE_TTL_MS = 2 * 60 * 1000;
const LOCAL_SYNC_CACHE_MAX_ENTRIES = 5000;
let serviceAccountConfig = null;
let signingKeyPromise = null;
let accessTokenCache = { token: null, expiresAt: 0 };
const syncSessionRevokedCache = new Map();
const syncReplayLocalCache = new Map();

const textEncoder = new TextEncoder();

function normalizePathname(pathname) {
  return pathname.replace(/\/+/g, "/").replace(/\/\/$/, "");
}

function parseSharePath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length < 3) {
    return null;
  }
  if (segments[0] !== API_VERSION || segments[1] !== SHARES_SEGMENT) {
    return null;
  }
  const collection = segments[2];
  const documentId = segments[3];
  if (!collection || !VALID_COLLECTIONS.has(collection)) {
    return null;
  }
  return {
    collection,
    documentId: documentId ? decodeURIComponent(documentId) : null
  };
}

function parseShareBatchPath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length !== 3) {
    return null;
  }
  if (segments[0] !== API_VERSION || segments[1] !== SHARES_SEGMENT) {
    return null;
  }
  const rawCollection = String(segments[2] || "");
  const match = rawCollection.match(/^(.+):batch$/);
  if (!match) {
    return null;
  }
  const collection = decodeURIComponent(match[1] || "");
  if (!collection || !VALID_COLLECTIONS.has(collection)) {
    return null;
  }
  return { collection };
}

function parseShareBatchGetPath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length !== 3) {
    return null;
  }
  if (segments[0] !== API_VERSION || segments[1] !== SHARES_SEGMENT) {
    return null;
  }
  const rawCollection = String(segments[2] || "");
  const match = rawCollection.match(/^(.+):batchGet$/);
  if (!match) {
    return null;
  }
  const collection = decodeURIComponent(match[1] || "");
  if (!collection || !VALID_COLLECTIONS.has(collection)) {
    return null;
  }
  return { collection };
}

function parseShareBatchDeletePath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length !== 3) {
    return null;
  }
  if (segments[0] !== API_VERSION || segments[1] !== SHARES_SEGMENT) {
    return null;
  }
  const rawCollection = String(segments[2] || "");
  const match = rawCollection.match(/^(.+):batchDelete$/);
  if (!match) {
    return null;
  }
  const collection = decodeURIComponent(match[1] || "");
  if (!collection || !VALID_COLLECTIONS.has(collection)) {
    return null;
  }
  return { collection };
}

function parseShareBatchCreatePath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length !== 3) {
    return null;
  }
  if (segments[0] !== API_VERSION || segments[1] !== SHARES_SEGMENT) {
    return null;
  }
  const rawCollection = String(segments[2] || "");
  const match = rawCollection.match(/^(.+):batchCreate$/);
  if (!match) {
    return null;
  }
  const collection = decodeURIComponent(match[1] || "");
  if (!collection || !VALID_COLLECTIONS.has(collection)) {
    return null;
  }
  return { collection };
}

function parseShareRepairPath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length !== 3) {
    return null;
  }
  if (segments[0] !== API_VERSION || segments[1] !== SHARES_SEGMENT) {
    return null;
  }
  const rawCollection = String(segments[2] || "");
  const match = rawCollection.match(/^(.+):repair$/);
  if (!match) {
    return null;
  }
  const collection = decodeURIComponent(match[1] || "");
  if (!collection || !VALID_COLLECTIONS.has(collection)) {
    return null;
  }
  return { collection };
}

function parseShareControlPath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length !== 3) {
    return null;
  }
  if (segments[0] !== API_VERSION || segments[1] !== SHARES_SEGMENT) {
    return null;
  }
  const action = String(segments[2] || "").trim().toLowerCase();
  if (action !== "sync:revoke" && action !== "sync:unrevoke") {
    return null;
  }
  return { action };
}

function parseAssetPath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length < 2) return null;
  if (segments[0] !== API_VERSION || segments[1] !== ASSETS_SEGMENT) {
    return null;
  }
  return {
    action: segments[2] ? decodeURIComponent(segments[2]) : null
  };
}

function parseSpaceAuthPath(request) {
  const url = new URL(request.url);
  const segments = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean);
  if (segments.length !== 3 && segments.length !== 4) return null;
  if (segments[0] !== API_VERSION || segments[1] !== SPACES_SEGMENT) {
    return null;
  }
  const action = String(segments[2] || "").trim().toLowerCase();
  if (action !== "auth") return null;
  const operation = String(segments[3] || "").trim().toLowerCase();
  if (!operation) return { action, operation: "issue" };
  if (operation !== "rotate") return null;
  return { action, operation };
}

function toBase64UrlString(text) {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64UrlString(text) {
  const normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const withPadding = normalized + (padLength ? "=".repeat(4 - padLength) : "");
  return atob(withPadding);
}

function normalizeSpaceId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function normalizeSpaceJoinCode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveR2MediaBucket(env) {
  if (!env?.SHARE_MEDIA_BUCKET || typeof env.SHARE_MEDIA_BUCKET.put !== "function") {
    throw new Error("Binding R2 SHARE_MEDIA_BUCKET manquant");
  }
  return env.SHARE_MEDIA_BUCKET;
}

function safeAssetScope(raw) {
  const value = String(raw || "").trim().toLowerCase();
  const clean = value
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "shared";
}

function isAllowedAssetMime(mimeType) {
  const mime = String(mimeType || "").trim().toLowerCase();
  return ALLOWED_ASSET_MIME_PREFIXES.some(prefix => mime.startsWith(prefix)) || ALLOWED_ASSET_MIME_TYPES.has(mime);
}

function detectAssetExtension(mimeType, fileName) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav";
  if (mime === "audio/webm") return "webm";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "application/json") return "json";
  const lowerName = String(fileName || "").toLowerCase();
  if (lowerName.endsWith(".png")) return "png";
  if (lowerName.endsWith(".gif")) return "gif";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "jpg";
  if (lowerName.endsWith(".webp")) return "webp";
  if (lowerName.endsWith(".mp4")) return "mp4";
  if (lowerName.endsWith(".webm")) return "webm";
  if (lowerName.endsWith(".mov")) return "mov";
  if (lowerName.endsWith(".mp3")) return "mp3";
  if (lowerName.endsWith(".wav")) return "wav";
  if (lowerName.endsWith(".ogg")) return "ogg";
  if (lowerName.endsWith(".json")) return "json";
  return "bin";
}

function sanitizeAssetName(fileName, fallbackExt) {
  const raw = String(fileName || "").trim();
  const base = raw
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return `asset.${fallbackExt}`;
  return base;
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  return {
    mimeType: String(match[1] || "").toLowerCase(),
    contentBase64: String(match[2] || "").replace(/\s+/g, "")
  };
}

function parseAssetUploadBody(body) {
  const payload = body && typeof body === "object" ? body : {};
  const inline = parseDataUrl(payload.dataUrl);
  const mimeType = String(payload.mimeType || inline?.mimeType || "").trim().toLowerCase();
  const contentBase64 = String(payload.contentBase64 || inline?.contentBase64 || "").replace(/\s+/g, "");
  const fileName = String(payload.fileName || "").trim();
  const scope = safeAssetScope(payload.scope || payload.documentId || payload.collection || "shared");
  if (!isAllowedAssetMime(mimeType)) {
    throw new Error("Type de fichier non autorisé");
  }
  if (!contentBase64) {
    throw new Error("Image base64 manquante");
  }
  return { mimeType, contentBase64, fileName, scope };
}

function decodeBase64ToBytes(base64) {
  const normalized = String(base64 || "").replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const withPadding = normalized + (padLength ? "=".repeat(4 - padLength) : "");
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(hash));
}

function parseAllowedOrigins(env) {
  const raw = env?.SHARE_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

function isLocalAllowedOrigin(origin) {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(origin);
}

function corsHeaders(request, env) {
  const allowedOrigins = parseAllowedOrigins(env);
  const origin = request.headers.get("Origin");
  const isLocalhost = isLocalAllowedOrigin(origin);
  const isExplicitlyAllowed = Boolean(origin && allowedOrigins.includes(origin));
  const allowOrigin = isLocalhost || isExplicitlyAllowed;
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  const allowHeaders = requestedHeaders && requestedHeaders.trim()
    ? requestedHeaders
    : "Content-Type,Authorization,Cache-Control,X-Admin-Token,X-Sync-Session,X-Sync-JTI,X-Sync-TS";
  const headers = {
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Origin": allowOrigin ? origin : "null"
  };
  headers["Vary"] = "Origin";
  return headers;
}

function jsonResponse(body, status, request, env, extraHeaders = {}) {
  const headers = Object.assign(
    {
      "Content-Type": "application/json; charset=utf-8"
    },
    corsHeaders(request, env),
    extraHeaders
  );
  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}

function errorResponse(message, status, request, env) {
  return jsonResponse({ error: message }, status, request, env);
}

function isOriginAllowed(request, env) {
  const origin = String(request.headers.get("Origin") || "").trim();
  if (!origin) return false;
  if (isLocalAllowedOrigin(origin)) return true;
  const allowedOrigins = parseAllowedOrigins(env);
  return allowedOrigins.includes(origin);
}

function notFoundResponse(request, env) {
  return errorResponse("Ressource introuvable", 404, request, env);
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isSyncProtectionEnabled(env) {
  return String(env?.SHARE_SYNC_ENFORCE || "").trim() === "1";
}

function shouldCheckSyncRevoke(env) {
  return String(env?.SHARE_SYNC_CHECK_REVOKE || "").trim() === "1";
}

function getSyncReplayStore(env) {
  const kv = env?.SYNC_REPLAY_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return null;
  }
  return kv;
}

function getSpaceAuthStore(env) {
  const kv = env?.SYNC_REPLAY_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return null;
  }
  return kv;
}

function getSpaceAuthDb(env) {
  const db = env?.SPACE_AUTH_DB;
  if (!db || typeof db.prepare !== "function") return null;
  return db;
}

async function readSpaceCodeHash(env, spaceId) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  if (!normalizedSpaceId) return "";
  const db = getSpaceAuthDb(env);
  if (db) {
    try {
      const row = await db
        .prepare("SELECT code_hash FROM space_code_hashes WHERE space_id = ?1 LIMIT 1")
        .bind(normalizedSpaceId)
        .first();
      return String(row?.code_hash || "").trim();
    } catch (err) {
      console.warn("space auth d1 read failed", err);
      throw new Error("Stockage auth espace indisponible");
    }
  }
  const kv = getSpaceAuthStore(env);
  if (!kv) return "";
  const hashKey = `space:codehash:${normalizedSpaceId}`;
  return String(await kv.get(hashKey) || "").trim();
}

async function writeSpaceCodeHash(env, spaceId, codeHash) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedHash = String(codeHash || "").trim();
  if (!normalizedSpaceId || !normalizedHash) return;
  const db = getSpaceAuthDb(env);
  if (db) {
    try {
      await db
        .prepare(`INSERT INTO space_code_hashes (space_id, code_hash, updated_at)
          VALUES (?1, ?2, ?3)
          ON CONFLICT(space_id) DO UPDATE SET code_hash = excluded.code_hash, updated_at = excluded.updated_at`)
        .bind(normalizedSpaceId, normalizedHash, new Date().toISOString())
        .run();
      return;
    } catch (err) {
      console.warn("space auth d1 write failed", err);
      throw new Error("Stockage auth espace indisponible");
    }
  }
  const kv = getSpaceAuthStore(env);
  if (!kv) throw new Error("Stockage auth espace indisponible");
  const hashKey = `space:codehash:${normalizedSpaceId}`;
  await kv.put(hashKey, normalizedHash);
}

function getSpaceAuthSecret(env) {
  const secret = String(env?.SHARE_SPACE_AUTH_SECRET || "").trim();
  return secret;
}

async function getSpaceAuthSigningKey(env) {
  const secret = getSpaceAuthSecret(env);
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSpaceAuthPayload(env, payload) {
  const key = await getSpaceAuthSigningKey(env);
  if (!key) return "";
  const raw = JSON.stringify(payload || {});
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(raw));
  return `${toBase64UrlString(raw)}.${toBase64UrlString(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function verifySpaceAuthToken(env, token, expectedSpaceId) {
  const key = await getSpaceAuthSigningKey(env);
  if (!key) return { ok: false, error: "Secret auth manquant" };
  const rawToken = String(token || "").trim();
  const dot = rawToken.lastIndexOf(".");
  if (dot <= 0) return { ok: false, error: "Token invalide" };
  const payloadPart = rawToken.slice(0, dot);
  const sigPart = rawToken.slice(dot + 1);
  let payloadRaw = "";
  try {
    payloadRaw = fromBase64UrlString(payloadPart);
  } catch (err) {
    return { ok: false, error: "Token invalide" };
  }
  let sigBytes;
  try {
    const sigRaw = fromBase64UrlString(sigPart);
    sigBytes = new Uint8Array(sigRaw.length);
    for (let i = 0; i < sigRaw.length; i += 1) sigBytes[i] = sigRaw.charCodeAt(i);
  } catch (err) {
    return { ok: false, error: "Signature invalide" };
  }
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, textEncoder.encode(payloadRaw));
  if (!valid) return { ok: false, error: "Signature invalide" };
  let payload = null;
  try {
    payload = JSON.parse(payloadRaw);
  } catch (err) {
    return { ok: false, error: "Payload token invalide" };
  }
  const spaceId = normalizeSpaceId(payload?.spaceId || "");
  const expected = normalizeSpaceId(expectedSpaceId || "");
  const exp = Number(payload?.exp || 0);
  if (!spaceId || !expected || spaceId !== expected) return { ok: false, error: "Token hors scope" };
  if (!Number.isFinite(exp) || Date.now() >= exp) return { ok: false, error: "Token expiré" };
  return { ok: true, payload };
}

function getLocalSyncRevokeCacheTtlMs(env) {
  const configured = Number(env?.SHARE_SYNC_REVOKE_CACHE_TTL_MS || 0);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(5 * 1000, Math.min(10 * 60 * 1000, Math.floor(configured)));
  }
  return LOCAL_SYNC_REVOKE_CACHE_TTL_MS;
}

function getLocalSyncJtiCacheTtlMs(env) {
  const configured = Number(env?.SHARE_SYNC_LOCAL_JTI_CACHE_TTL_MS || 0);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(5 * 1000, Math.min(10 * 60 * 1000, Math.floor(configured)));
  }
  return LOCAL_SYNC_JTI_CACHE_TTL_MS;
}

function trimCacheMap(cache, now, maxEntries) {
  for (const [key, expiresAt] of cache.entries()) {
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      cache.delete(key);
    }
  }
  if (cache.size <= maxEntries) {
    return;
  }
  const overflow = cache.size - maxEntries;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

function readSyncEnvelope(request) {
  return {
    sessionId: String(request.headers.get("X-Sync-Session") || "").trim(),
    jti: String(request.headers.get("X-Sync-JTI") || "").trim(),
    timestampRaw: String(request.headers.get("X-Sync-TS") || "").trim()
  };
}

function resolveSyncCheckContext(request, path, batchPath, batchGetPath, batchDeletePath, batchCreatePath, repairPath) {
  if (repairPath) return null;
  if (batchPath) return { operation: "write", collection: batchPath.collection };
  if (batchGetPath) return { operation: "read", collection: batchGetPath.collection };
  if (batchDeletePath) return { operation: "delete", collection: batchDeletePath.collection };
  if (batchCreatePath) return { operation: "write", collection: batchCreatePath.collection };
  if (!path) return null;
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET") return { operation: "read", collection: path.collection };
  if (method === "DELETE") return { operation: "delete", collection: path.collection };
  if (method === "POST" || method === "PUT") return { operation: "write", collection: path.collection };
  return null;
}

async function enforceSyncEnvelope(request, env, context) {
  if (!context || !isSyncProtectionEnabled(env)) {
    return null;
  }
  const kv = getSyncReplayStore(env);
  if (!kv) {
    return errorResponse("SYNC_REPLAY_KV manquant", 500, request, env);
  }
  const envelope = readSyncEnvelope(request);
  const timestamp = Number(envelope.timestampRaw || 0);
  const now = Date.now();
  if (!envelope.sessionId || !envelope.jti || !Number.isFinite(timestamp)) {
    return errorResponse("En-têtes sync requis (session/jti/ts)", 401, request, env);
  }
  if (Math.abs(now - timestamp) > SYNC_SKEW_MS) {
    return errorResponse("Horodatage sync invalide", 401, request, env);
  }

  if (shouldCheckSyncRevoke(env)) {
    const revokedKey = `sync:revoked:${envelope.sessionId}`;
    const nowTs = Date.now();
    const revokeCacheTtlMs = getLocalSyncRevokeCacheTtlMs(env);
    const cachedRevokeExpiry = Number(syncSessionRevokedCache.get(revokedKey) || 0);
    if (cachedRevokeExpiry > nowTs) {
      return errorResponse("Session sync révoquée", 403, request, env);
    }
    if (cachedRevokeExpiry) {
      syncSessionRevokedCache.delete(revokedKey);
    }
    const revoked = await kv.get(revokedKey);
    if (revoked) {
      syncSessionRevokedCache.set(revokedKey, nowTs + revokeCacheTtlMs);
      trimCacheMap(syncSessionRevokedCache, nowTs, LOCAL_SYNC_CACHE_MAX_ENTRIES);
      return errorResponse("Session sync révoquée", 403, request, env);
    }
  }

  if (context.operation !== "read") {
    const nowTs = Date.now();
    const jtiCacheTtlMs = getLocalSyncJtiCacheTtlMs(env);
    const replayKey = `sync:replay:${envelope.sessionId}:${envelope.jti}`;
    const cachedReplayExpiry = Number(syncReplayLocalCache.get(replayKey) || 0);
    if (cachedReplayExpiry > nowTs) {
      return errorResponse("Requête rejouée", 409, request, env);
    }
    if (cachedReplayExpiry) {
      syncReplayLocalCache.delete(replayKey);
    }
    const seen = await kv.get(replayKey);
    if (seen) {
      syncReplayLocalCache.set(replayKey, nowTs + jtiCacheTtlMs);
      trimCacheMap(syncReplayLocalCache, nowTs, LOCAL_SYNC_CACHE_MAX_ENTRIES);
      return errorResponse("Requête rejouée", 409, request, env);
    }
    syncReplayLocalCache.set(replayKey, nowTs + jtiCacheTtlMs);
    trimCacheMap(syncReplayLocalCache, nowTs, LOCAL_SYNC_CACHE_MAX_ENTRIES);
    await kv.put(
      replayKey,
      JSON.stringify({
        ts: now,
        op: context.operation,
        collection: String(context.collection || "")
      }),
      { expirationTtl: SYNC_REPLAY_TTL_SECONDS }
    );
  }
  return null;
}

async function enforceWriteRateLimit(request, env) {
  if (!env?.MY_RATE_LIMITER || typeof env.MY_RATE_LIMITER.limit !== "function") {
    return null;
  }
  const ip = getClientIp(request);
  try {
    const { success } = await env.MY_RATE_LIMITER.limit({ key: ip });
    if (success) {
      return null;
    }
    return errorResponse(
      "Trop de requêtes d'écriture, réessayez dans un instant",
      429,
      request,
      env
    );
  } catch (_) {
    return null;
  }
}

function getDocumentUrl(env, collection, documentId) {
  const baseUrl = getFirestoreBaseUrl(env);
  const encodedId = encodeURIComponent(documentId);
  return `${baseUrl}/${collection}/${encodedId}`;
}

function getFirestoreBaseUrl(env) {
  const account = getServiceAccount(env);
  const projectId = env?.FIREBASE_PROJECT_ID || account.project_id;
  if (!projectId) {
    throw new Error("Identifiant de projet Firebase manquant");
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function getServiceAccount(env) {
  if (serviceAccountConfig) {
    return serviceAccountConfig;
  }
  const raw = env?.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("Clé de service Firebase manquante");
  }
  try {
    serviceAccountConfig = JSON.parse(raw);
  } catch (err) {
    throw new Error("Impossible de parser la clé de service Firebase");
  }
  if (!serviceAccountConfig.client_email || !serviceAccountConfig.private_key) {
    throw new Error("La clé de service Firebase est incomplète");
  }
  return serviceAccountConfig;
}

async function getSigningKey(env) {
  if (signingKeyPromise) {
    return signingKeyPromise;
  }
  const account = getServiceAccount(env);
  const pem = account.private_key;
  const binary = pemToArrayBuffer(pem);
  signingKeyPromise = crypto.subtle.importKey(
    "pkcs8",
    binary,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  return signingKeyPromise;
}

function pemToArrayBuffer(pem) {
  const cleaned = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

function base64UrlEncode(buffer) {
  let string = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    string += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(string);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getAccessToken(env) {
  const now = Date.now();
  if (accessTokenCache.token && now < accessTokenCache.expiresAt - 6e4) {
    return accessTokenCache.token;
  }

  const account = getServiceAccount(env);
  const iat = Math.floor(now / 1e3);
  const exp = iat + 3600;

  const header = base64UrlEncode(textEncoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64UrlEncode(
    textEncoder.encode(
      JSON.stringify({
        iss: account.client_email,
        scope: GOOGLE_API_SCOPE,
        aud: FIREBASE_TOKEN_URL,
        exp,
        iat
      })
    )
  );

  const toSign = `${header}.${payload}`;
  const key = await getSigningKey(env);
  const signature = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, textEncoder.encode(toSign));
  const jwt = `${toSign}.${base64UrlEncode(signature)}`;

  const form = new URLSearchParams();
  form.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.append("assertion", jwt);

  const response = await fetch(FIREBASE_TOKEN_URL, { method: "POST", body: form });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Auth Firebase échouée: ${response.status} ${body}`);
  }

  const data = await response.json();
  accessTokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1e3
  };
  return accessTokenCache.token;
}

function convertFields(fields) {
  const result = {};
  Object.keys(fields || {}).forEach(key => {
    result[key] = convertValue(fields[key]);
  });
  return result;
}

function convertValue(value) {
  if (!value) {
    return null;
  }
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.booleanValue !== undefined) {
    return value.booleanValue;
  }
  if (value.integerValue !== undefined) {
    return Number(value.integerValue);
  }
  if (value.doubleValue !== undefined) {
    return Number(value.doubleValue);
  }
  if (value.timestampValue !== undefined) {
    return value.timestampValue;
  }
  if (value.arrayValue?.values) {
    return value.arrayValue.values.map(convertValue);
  }
  if (value.mapValue?.fields) {
    return convertFields(value.mapValue.fields);
  }
  if (value.nullValue !== undefined) {
    return null;
  }
  return null;
}

function extractPayload(doc) {
  if (!doc?.fields) {
    return null;
  }
  const payloadField = doc.fields.payload;
  if (payloadField?.stringValue) {
    try {
      return JSON.parse(payloadField.stringValue);
    } catch (err) {
      return null;
    }
  }
  return convertFields(doc.fields);
}

function extractMeta(doc) {
  const metaField = doc?.fields?.meta?.mapValue?.fields;
  if (!metaField) {
    return {};
  }
  return convertFields(metaField);
}

function buildShareSummary(entry) {
  const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  const firstTab = Array.isArray(payload?.tabs) ? payload.tabs[0] : null;
  const status = String(payload?.status || "active").trim().toLowerCase() || "active";
  const parsedPosition = Number(payload?.position);
  const position = Number.isFinite(parsedPosition) ? parsedPosition : null;
  return {
    id: String(entry?.id || "").trim(),
    title: String(payload?.title || firstTab?.title || "Document partagé").trim(),
    description: String(payload?.description || firstTab?.description || "").trim(),
    superpowers: Array.isArray(firstTab?.superpowers) ? firstTab.superpowers : [],
    icon: String(payload?.icon || "file-symlink").trim() || "file-symlink",
    parentId: String(payload?.parentId || "").trim(),
    spaceId: String(payload?.spaceId || "golive").trim().toLowerCase() || "golive",
    updatedAt: String(entry?.meta?.updatedAt || entry?.meta?.updatedDate || "").trim(),
    status,
    position
  };
}

function isArchivedPayload(payload) {
  const status = String(payload?.status || "active").trim().toLowerCase();
  return status === "archived";
}

function mapStorageObjectToAsset(objectName, upload) {
  return {
    id: toBase64UrlString(objectName),
    objectName,
    bucket: "share-media",
    mimeType: String(upload?.mimeType || ""),
    size: Number(upload?.size || 0),
    generation: ""
  };
}

async function uploadAssetToStorage(env, upload) {
  const bucket = resolveR2MediaBucket(env);
  const bytes = decodeBase64ToBytes(upload.contentBase64);
  if (!bytes.length) {
    throw new Error("Image vide");
  }
  if (bytes.length > MAX_ASSET_BYTES) {
    throw new Error("Image trop volumineuse");
  }
  const hash = await sha256Hex(bytes);
  const ext = detectAssetExtension(upload.mimeType, upload.fileName);
  const baseFileName = sanitizeAssetName(upload.fileName, ext);
  const objectName = `assets/${upload.scope}/${hash}-${baseFileName}`;
  await bucket.put(objectName, bytes, {
    httpMetadata: {
      contentType: upload.mimeType
    }
  });
  return {
    hash,
    asset: mapStorageObjectToAsset(objectName, { mimeType: upload.mimeType, size: bytes.length })
  };
}

async function readAssetFromStorage(env, assetId) {
  const bucket = resolveR2MediaBucket(env);
  let objectName = "";
  try {
    objectName = fromBase64UrlString(assetId);
  } catch (err) {
    return null;
  }
  if (!objectName) return null;
  const object = await bucket.get(objectName);
  if (!object) return null;
  return { objectName, object };
}

async function deleteAssetFromStorage(env, assetId) {
  const bucket = resolveR2MediaBucket(env);
  let objectName = "";
  try {
    objectName = fromBase64UrlString(assetId);
  } catch (err) {
    return false;
  }
  if (!objectName) return false;
  await bucket.delete(objectName);
  return true;
}

async function fetchShareDocument(env, collection, documentId) {
  const url = getDocumentUrl(env, collection, documentId);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${await getAccessToken(env)}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Erreur Firestore: ${response.status} ${body}`);
  }
  const data = await response.json();
  return {
    payload: extractPayload(data),
    meta: extractMeta(data)
  };
}

async function listShareDocuments(env, collection) {
  const baseUrl = getFirestoreBaseUrl(env);
  const token = await getAccessToken(env);
  const documents = [];
  let pageToken = "";
  let pageCount = 0;
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const url = `${baseUrl}/${collection}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Erreur Firestore: ${response.status} ${body}`);
    }
    const data = await response.json();
    const pageDocs = (data.documents || []).map(doc => {
      // extract document ID from name path
      const nameSegments = doc.name.split("/");
      const id = nameSegments[nameSegments.length - 1];
      return {
        id,
        payload: extractPayload(doc),
        meta: extractMeta(doc)
      };
    });
    documents.push(...pageDocs);
    pageToken = String(data.nextPageToken || "").trim();
    pageCount += 1;
    if (pageCount >= 50) {
      break;
    }
  } while (pageToken);
  return documents;
}

async function deleteShareDocument(env, collection, documentId) {
  const url = getDocumentUrl(env, collection, documentId);
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${await getAccessToken(env)}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) {
    return true;
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Erreur Firestore: ${response.status} ${body}`);
  }
  return true;
}

async function createShareDocument(env, collection, payload, request) {
  const url = `${getFirestoreBaseUrl(env)}/${collection}`;
  const now = new Date().toISOString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken(env)}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ fields: buildDocumentFields(payload, now) })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Erreur Firestore: ${response.status} ${body}`);
  }
  let createdId = null;
  try {
    const data = await response.json();
    if (data?.name) {
      const segments = data.name.split("/");
      createdId = segments[segments.length - 1];
    }
  } catch (err) {
    createdId = null;
  }
  return {
    payload,
    meta: {
      updatedAt: now
    },
    id: createdId
  };
}

function buildDocumentFields(payload, updatedAt) {
  return {
    payload: {
      stringValue: JSON.stringify(payload)
    },
    meta: {
      mapValue: {
        fields: {
          updatedAt: {
            stringValue: updatedAt
          }
        }
      }
    }
  };
}

function normalizeMemosMetaPayloadFromContent(contentPayload, fallbackTitle = "Document partagé") {
  const payload = contentPayload && typeof contentPayload === "object" ? contentPayload : {};
  const firstTab = Array.isArray(payload?.tabs) ? payload.tabs[0] : null;
  const title = String(payload?.title || firstTab?.title || fallbackTitle).trim() || fallbackTitle;
  const description = String(payload?.description || firstTab?.description || "").trim();
  const superpowers = Array.isArray(firstTab?.superpowers) ? firstTab.superpowers : [];
  const icon = String(payload?.icon || "file-symlink").trim() || "file-symlink";
  const parentId = String(payload?.parentId || "").trim();
  const spaceId = String(payload?.spaceId || "golive").trim().toLowerCase() || "golive";
  const status = String(payload?.status || "active").trim().toLowerCase() || "active";
  const positionNum = Number(payload?.position);
  const metaPayload = {
    title,
    description,
    superpowers,
    icon,
    parentId,
    spaceId,
    status
  };
  if (Number.isFinite(positionNum)) {
    metaPayload.position = positionNum;
  } else {
    metaPayload.position = Date.now();
  }
  return metaPayload;
}

function buildEmptyMemosContentPayloadFromMeta(metaPayload) {
  const payload = metaPayload && typeof metaPayload === "object" ? metaPayload : {};
  const title = String(payload?.title || "Document partagé").trim() || "Document partagé";
  const description = String(payload?.description || "").trim();
  const superpowers = Array.isArray(payload?.superpowers) ? payload.superpowers : [];
  const tabId = `tab-${crypto.randomUUID()}`;
  return {
    tabs: [{
      id: tabId,
      title,
      description,
      superpowers,
      content: "",
      metadata: {}
    }],
    activeTabId: tabId,
    promptPresetId: "edit",
    title,
    description,
    icon: String(payload?.icon || "file-symlink").trim() || "file-symlink",
    parentId: String(payload?.parentId || "").trim(),
    spaceId: String(payload?.spaceId || "golive").trim().toLowerCase() || "golive",
    position: Number.isFinite(Number(payload?.position)) ? Number(payload.position) : Date.now(),
    status: String(payload?.status || "active").trim().toLowerCase() || "active"
  };
}

function buildArchivedMemosMetaPayload(metaPayload, contentPayload, options = {}) {
  const baseMeta = metaPayload && typeof metaPayload === "object" ? metaPayload : {};
  const normalizedFromContent = normalizeMemosMetaPayloadFromContent(
    contentPayload && typeof contentPayload === "object" ? contentPayload : {},
    "Document archivé"
  );
  const base = Object.keys(baseMeta).length ? baseMeta : normalizedFromContent;
  const archivedAt = String(options?.archivedAt || new Date().toISOString()).trim() || new Date().toISOString();
  return {
    title: String(base?.title || normalizedFromContent?.title || "Document archivé").trim() || "Document archivé",
    description: String(base?.description || normalizedFromContent?.description || "").trim(),
    superpowers: Array.isArray(base?.superpowers) ? base.superpowers : (Array.isArray(normalizedFromContent?.superpowers) ? normalizedFromContent.superpowers : []),
    icon: String(base?.icon || normalizedFromContent?.icon || "file-symlink").trim() || "file-symlink",
    parentId: String(base?.parentId || normalizedFromContent?.parentId || "").trim(),
    spaceId: String(base?.spaceId || normalizedFromContent?.spaceId || "golive").trim().toLowerCase() || "golive",
    status: "archived",
    position: Number.isFinite(Number(base?.position))
      ? Number(base.position)
      : (Number.isFinite(Number(normalizedFromContent?.position)) ? Number(normalizedFromContent.position) : Date.now()),
    archivedAt,
    archivedReason: String(options?.reason || "delete").trim() || "delete"
  };
}

function resolveContentMetaCollections(contentCollection) {
  const collection = String(contentCollection || "").trim().toLowerCase();
  if (collection === "pages") return { content: "pages", meta: "pages-meta" };
  return null;
}

function resolveConsistencyCollections(collection) {
  const normalized = String(collection || "").trim().toLowerCase();
  if (normalized === "pages" || normalized === "pages-meta") {
    return { content: "pages", meta: "pages-meta" };
  }
  return null;
}

async function reconcileMemosConsistency(env, request, options = {}) {
  const dryRun = Boolean(options?.dryRun);
  const targetCollections = resolveConsistencyCollections(options?.collection || "pages") || { content: "pages", meta: "pages-meta" };
  const [memosDocs, metaDocs] = await Promise.all([
    listShareDocuments(env, targetCollections.content),
    listShareDocuments(env, targetCollections.meta)
  ]);
  const memosById = new Map(
    (memosDocs || [])
      .map(doc => [String(doc?.id || "").trim(), doc])
      .filter(([id]) => Boolean(id))
  );
  const metaById = new Map(
    (metaDocs || [])
      .map(doc => [String(doc?.id || "").trim(), doc])
      .filter(([id]) => Boolean(id))
  );
  const contentOnly = [];
  const metaOnly = [];
  const metaOnlyActive = [];
  const metaOnlyArchived = [];
  const repairedMeta = [];
  const removedMeta = [];

  for (const id of memosById.keys()) {
    if (!metaById.has(id)) contentOnly.push(id);
  }
  for (const id of metaById.keys()) {
    if (!memosById.has(id)) metaOnly.push(id);
  }
  for (const id of metaOnly) {
    const metaDoc = metaById.get(id);
    const payload = metaDoc?.payload && typeof metaDoc.payload === "object" ? metaDoc.payload : {};
    if (isArchivedPayload(payload)) metaOnlyArchived.push(id);
    else metaOnlyActive.push(id);
  }

  if (!dryRun) {
    for (const id of contentOnly) {
      const contentDoc = memosById.get(id);
      const metaPayload = normalizeMemosMetaPayloadFromContent(contentDoc?.payload || {}, "Document partagé");
      await upsertShareDocument(env, targetCollections.meta, id, metaPayload, request);
      repairedMeta.push(id);
    }
    for (const id of metaOnlyActive) {
      await deleteShareDocument(env, targetCollections.meta, id);
      removedMeta.push(id);
    }
  }

  return {
    success: true,
    dryRun,
    totals: {
      content: memosById.size,
      meta: metaById.size
    },
    mismatches: {
      contentOnlyCount: contentOnly.length,
      metaOnlyCount: metaOnly.length,
      metaOnlyActiveCount: metaOnlyActive.length,
      metaOnlyArchivedCount: metaOnlyArchived.length
    },
    repaired: {
      metaCreatedFromContent: dryRun ? 0 : repairedMeta.length,
      contentCreatedFromMeta: 0,
      metaRemovedWithoutContent: dryRun ? 0 : removedMeta.length
    },
    samples: {
      contentOnly: contentOnly.slice(0, 50),
      metaOnly: metaOnly.slice(0, 50),
      metaOnlyActive: metaOnlyActive.slice(0, 50),
      metaOnlyArchived: metaOnlyArchived.slice(0, 50)
    }
  };
}

async function upsertShareDocument(env, collection, documentId, payload, request) {
  const url = getDocumentUrl(env, collection, documentId);
  const now = new Date().toISOString();
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${await getAccessToken(env)}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ fields: buildDocumentFields(payload, now) })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Erreur Firestore: ${response.status} ${body}`);
  }
  return {
    payload,
    meta: {
      updatedAt: now
    }
  };
}

async function handleRequest(request, env) {
  if (request.method !== "OPTIONS" && !isOriginAllowed(request, env)) {
    return errorResponse("Origin non autorisee", 403, request, env);
  }
  if (request.method === "OPTIONS") {
    if (!isOriginAllowed(request, env)) {
      return errorResponse("Origin non autorisee", 403, request, env);
    }
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const assetPath = parseAssetPath(request);
  const spaceAuthPath = parseSpaceAuthPath(request);
  if (spaceAuthPath) {
    if (request.method !== "POST") {
      return errorResponse("Méthode non autorisée", 405, request, env);
    }
    if (!getSpaceAuthDb(env) && !getSpaceAuthStore(env)) {
      return errorResponse("Stockage auth espace manquant", 500, request, env);
    }
    const secret = getSpaceAuthSecret(env);
    if (!secret) return errorResponse("SHARE_SPACE_AUTH_SECRET manquant", 500, request, env);
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse("Payload JSON attendu", 400, request, env);
    }
    const spaceId = normalizeSpaceId(body?.spaceId || "");
    if (!spaceId) {
      return errorResponse("spaceId manquant", 400, request, env);
    }
    if (spaceAuthPath.operation === "rotate") {
      const currentSpaceCode = normalizeSpaceJoinCode(
        body?.currentSpaceCode || body?.currentSpaceJoinCode || body?.spaceCode || body?.spaceJoinCode || ""
      );
      const nextSpaceCode = normalizeSpaceJoinCode(
        body?.nextSpaceCode || body?.nextSpaceJoinCode || body?.newSpaceCode || body?.newSpaceJoinCode || ""
      );
      if (!currentSpaceCode || !nextSpaceCode) {
        return errorResponse("currentSpaceCode/nextSpaceCode manquants", 400, request, env);
      }
      if (currentSpaceCode === nextSpaceCode) {
        return errorResponse("Le nouveau code doit être différent", 400, request, env);
      }
      const existingHash = await readSpaceCodeHash(env, spaceId);
      if (!existingHash) {
        return errorResponse("Aucun code existant pour cet espace", 404, request, env);
      }
      const currentHash = await sha256Hex(textEncoder.encode(`${spaceId}:${currentSpaceCode}`));
      if (existingHash !== currentHash) {
        return errorResponse("Code espace actuel invalide", 403, request, env);
      }
      const providedToken = String(
        request.headers.get("X-Space-Auth")
        || request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
        || ""
      ).trim();
      if (!providedToken) {
        return errorResponse("Authentification espace requise", 401, request, env);
      }
      const verification = await verifySpaceAuthToken(env, providedToken, spaceId);
      if (!verification.ok) {
        return errorResponse(verification.error || "Token espace invalide", 401, request, env);
      }
      const nextHash = await sha256Hex(textEncoder.encode(`${spaceId}:${nextSpaceCode}`));
      await writeSpaceCodeHash(env, spaceId, nextHash);
      const now = Date.now();
      const expiresAt = now + (10 * 60 * 1000);
      const token = await signSpaceAuthPayload(env, {
        typ: "space-auth",
        spaceId,
        iat: now,
        exp: expiresAt
      });
      if (!token) return errorResponse("Impossible de signer le token", 500, request, env);
      return jsonResponse({ ok: true, rotated: true, token, spaceId, expiresAt }, 200, request, env, {
        "Cache-Control": "no-store, max-age=0"
      });
    }

    const createIfMissing = body?.createIfMissing === true;
    const spaceCode = normalizeSpaceJoinCode(body?.spaceCode || body?.spaceJoinCode || "");
    if (!spaceCode) {
      return errorResponse("spaceCode manquant", 400, request, env);
    }
    const codeHash = await sha256Hex(textEncoder.encode(`${spaceId}:${spaceCode}`));
    const existingHash = await readSpaceCodeHash(env, spaceId);
    if (createIfMissing && existingHash) {
      return errorResponse("Ce spaceId existe déjà", 409, request, env);
    }
    if (existingHash && existingHash !== codeHash) {
      return errorResponse("Code espace invalide", 403, request, env);
    }
    if (!existingHash) {
      await writeSpaceCodeHash(env, spaceId, codeHash);
    }
    const now = Date.now();
    const expiresAt = now + (10 * 60 * 1000);
    const token = await signSpaceAuthPayload(env, {
      typ: "space-auth",
      spaceId,
      iat: now,
      exp: expiresAt
    });
    if (!token) return errorResponse("Impossible de signer le token", 500, request, env);
    return jsonResponse({ ok: true, token, spaceId, expiresAt }, 200, request, env, {
      "Cache-Control": "no-store, max-age=0"
    });
  }
  if (assetPath) {
    if (request.method === "GET") {
      if (!assetPath.action || assetPath.action === "upload") {
        return errorResponse("Identifiant d'asset manquant", 400, request, env);
      }
      const result = await readAssetFromStorage(env, assetPath.action);
      if (!result) {
        return notFoundResponse(request, env);
      }
      const contentType = result.object.httpMetadata?.contentType || "application/octet-stream";
      const streamHeaders = Object.assign({}, corsHeaders(request, env), {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      if (typeof result.object.size === "number") {
        streamHeaders["Content-Length"] = String(result.object.size);
      }
      return new Response(result.object.body, {
        status: 200,
        headers: streamHeaders
      });
    }

    if (request.method === "POST") {
      if (assetPath.action !== "upload") {
        return errorResponse("Route assets invalide", 404, request, env);
      }
      const rateLimitResponse = await enforceWriteRateLimit(request, env);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      let body = null;
      try {
        body = await request.json();
      } catch (err) {
        return errorResponse("Payload JSON attendu", 400, request, env);
      }
      let parsed;
      try {
        parsed = parseAssetUploadBody(body);
      } catch (err) {
        return errorResponse(err?.message || "Payload image invalide", 400, request, env);
      }
      const uploaded = await uploadAssetToStorage(env, parsed);
      return jsonResponse({
        ok: true,
        hash: uploaded.hash,
        asset: uploaded.asset,
        url: `/v1/assets/${encodeURIComponent(uploaded.asset.id)}`
      }, 200, request, env);
    }

    if (request.method === "DELETE") {
      if (!assetPath.action || assetPath.action === "upload") {
        return errorResponse("Identifiant d'asset manquant", 400, request, env);
      }
      const rateLimitResponse = await enforceWriteRateLimit(request, env);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      await deleteAssetFromStorage(env, assetPath.action);
      return jsonResponse({ ok: true }, 200, request, env);
    }

    const headers = Object.assign({ Allow: "GET,POST,DELETE,OPTIONS" }, corsHeaders(request, env));
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
    });
  }

  const path = parseSharePath(request);
  const batchPath = parseShareBatchPath(request);
  const batchGetPath = parseShareBatchGetPath(request);
  const batchDeletePath = parseShareBatchDeletePath(request);
  const batchCreatePath = parseShareBatchCreatePath(request);
  const repairPath = parseShareRepairPath(request);
  const controlPath = parseShareControlPath(request);
  const method = String(request.method || "GET").toUpperCase();
  const authCollection = String(
    path?.collection
    || batchPath?.collection
    || batchCreatePath?.collection
    || ""
  ).trim().toLowerCase();
  const authProtectedCollection = authCollection === "pages"
    || authCollection === "pages-meta";
  const requiresSpaceAuth = Boolean(
    (path || batchPath || batchCreatePath)
    && authProtectedCollection
    && (method === "PUT" || method === "POST")
  );
  if (requiresSpaceAuth) {
    const headerSpaceId = normalizeSpaceId(request.headers.get("X-Space-Id") || "");
    const providedToken = String(
      request.headers.get("X-Space-Auth")
      || request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
      || ""
    ).trim();
    if (!headerSpaceId || !providedToken) {
      return errorResponse("Authentification espace requise", 401, request, env);
    }
    const verification = await verifySpaceAuthToken(env, providedToken, headerSpaceId);
    if (!verification.ok) {
      return errorResponse(verification.error || "Token espace invalide", 401, request, env);
    }
  }

  if (controlPath) {
    if (request.method !== "POST") {
      const headers = Object.assign({ Allow: "POST,OPTIONS" }, corsHeaders(request, env));
      return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
        status: 405,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
      });
    }
    const kv = getSyncReplayStore(env);
    if (!kv) {
      return errorResponse("SYNC_REPLAY_KV manquant", 500, request, env);
    }
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse("Payload JSON attendu", 400, request, env);
    }
    const sessionId = String(body?.sessionId || "").trim();
    if (!sessionId) {
      return errorResponse("sessionId manquant", 400, request, env);
    }
    const revokedKey = `sync:revoked:${sessionId}`;
    if (controlPath.action === "sync:revoke") {
      const ttl = Math.max(60, Math.min(7 * 24 * 60 * 60, Number(body?.ttlSeconds || 24 * 60 * 60) || 24 * 60 * 60));
      await kv.put(revokedKey, JSON.stringify({ revokedAt: new Date().toISOString() }), { expirationTtl: ttl });
      syncSessionRevokedCache.set(revokedKey, Date.now() + getLocalSyncRevokeCacheTtlMs(env));
      return jsonResponse({ ok: true, sessionId, revoked: true, ttlSeconds: ttl }, 200, request, env);
    }
    if (typeof kv.delete === "function") {
      await kv.delete(revokedKey);
    } else {
      await kv.put(revokedKey, "", { expirationTtl: 1 });
    }
    syncSessionRevokedCache.delete(revokedKey);
    return jsonResponse({ ok: true, sessionId, revoked: false }, 200, request, env);
  }

  const syncCheckContext = resolveSyncCheckContext(
    request,
    path,
    batchPath,
    batchGetPath,
    batchDeletePath,
    batchCreatePath,
    repairPath
  );
  const syncEnvelopeError = await enforceSyncEnvelope(request, env, syncCheckContext);
  if (syncEnvelopeError) {
    return syncEnvelopeError;
  }
  if (!path && batchPath) {
    if (request.method !== "POST") {
      const headers = Object.assign({ Allow: "POST,OPTIONS" }, corsHeaders(request, env));
      return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
        status: 405,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
      });
    }
    const rateLimitResponse = await enforceWriteRateLimit(request, env);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse("Payload JSON attendu", 400, request, env);
    }
    const writes = Array.isArray(body?.writes) ? body.writes : null;
    if (!writes || !writes.length) {
      return errorResponse("writes[] manquant", 400, request, env);
    }
    if (writes.length > 200) {
      return errorResponse("writes[] dépasse la limite (200)", 400, request, env);
    }
    const results = [];
    for (const entry of writes) {
      const id = String(entry?.id || "").trim();
      if (!id) {
        return errorResponse("Chaque write doit contenir un id", 400, request, env);
      }
      if (!Object.prototype.hasOwnProperty.call(entry || {}, "payload")) {
        return errorResponse(`Payload manquant pour ${id}`, 400, request, env);
      }
      const result = await upsertShareDocument(env, batchPath.collection, id, entry.payload, request);
      results.push({
        id,
        meta: result?.meta || { updatedAt: new Date().toISOString() }
      });
    }
    return jsonResponse({
      success: true,
      count: results.length,
      results
    }, 200, request, env);
  }
  if (!path && batchGetPath) {
    if (request.method !== "POST") {
      const headers = Object.assign({ Allow: "POST,OPTIONS" }, corsHeaders(request, env));
      return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
        status: 405,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
      });
    }
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse("Payload JSON attendu", 400, request, env);
    }
    const ids = Array.isArray(body?.ids)
      ? body.ids.map(id => String(id || "").trim()).filter(Boolean)
      : [];
    if (!ids.length) {
      return errorResponse("ids[] manquant", 400, request, env);
    }
    if (ids.length > 200) {
      return errorResponse("ids[] dépasse la limite (200)", 400, request, env);
    }
    const documents = [];
    for (const id of ids) {
      const doc = await fetchShareDocument(env, batchGetPath.collection, id);
      documents.push({
        id,
        payload: doc?.payload || null,
        meta: doc?.meta || null
      });
    }
    return jsonResponse({
      success: true,
      count: documents.length,
      documents
    }, 200, request, env, {
      "Cache-Control": "no-store, max-age=0"
    });
  }
  if (!path && batchDeletePath) {
    if (request.method !== "POST") {
      const headers = Object.assign({ Allow: "POST,OPTIONS" }, corsHeaders(request, env));
      return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
        status: 405,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
      });
    }
    const rateLimitResponse = await enforceWriteRateLimit(request, env);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse("Payload JSON attendu", 400, request, env);
    }
    const ids = Array.isArray(body?.ids)
      ? body.ids.map(id => String(id || "").trim()).filter(Boolean)
      : [];
    if (!ids.length) {
      return errorResponse("ids[] manquant", 400, request, env);
    }
    if (ids.length > 200) {
      return errorResponse("ids[] dépasse la limite (200)", 400, request, env);
    }
    const collections = resolveContentMetaCollections(batchDeletePath.collection);
    if (!collections) {
      return errorResponse("Route de suppression groupée supportée uniquement pour pages", 400, request, env);
    }
    const results = [];
    for (const id of ids) {
      const [existingContent, existingMeta] = await Promise.all([
        fetchShareDocument(env, collections.content, id),
        fetchShareDocument(env, collections.meta, id)
      ]);
      const archivedMetaPayload = buildArchivedMemosMetaPayload(
        existingMeta?.payload || null,
        existingContent?.payload || null,
        { reason: "delete", archivedAt: new Date().toISOString() }
      );
      await Promise.all([
        deleteShareDocument(env, collections.content, id),
        upsertShareDocument(env, collections.meta, id, archivedMetaPayload, request)
      ]);
      results.push({
        id,
        archived: true,
        deleted: { content: true },
        kept: { meta: true }
      });
    }
    return jsonResponse({
      success: true,
      count: results.length,
      results
    }, 200, request, env);
  }
  if (!path && batchCreatePath) {
    if (request.method !== "POST") {
      const headers = Object.assign({ Allow: "POST,OPTIONS" }, corsHeaders(request, env));
      return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
        status: 405,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
      });
    }
    const rateLimitResponse = await enforceWriteRateLimit(request, env);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse("Payload JSON attendu", 400, request, env);
    }
    const writes = Array.isArray(body?.writes) ? body.writes : [];
    if (!writes.length) {
      return errorResponse("writes[] manquant", 400, request, env);
    }
    if (writes.length > 200) {
      return errorResponse("writes[] dépasse la limite (200)", 400, request, env);
    }
    const collections = resolveContentMetaCollections(batchCreatePath.collection);
    if (!collections) {
      return errorResponse("Route de création groupée supportée uniquement pour pages", 400, request, env);
    }
    const results = [];
    for (const entry of writes) {
      const id = String(entry?.id || "").trim();
      if (!id) {
        return errorResponse("Chaque write doit contenir un id", 400, request, env);
      }
      const contentPayload = entry?.contentPayload;
      const metaPayload = entry?.metaPayload;
      if (!contentPayload || typeof contentPayload !== "object") {
        return errorResponse(`contentPayload manquant pour ${id}`, 400, request, env);
      }
      if (!metaPayload || typeof metaPayload !== "object") {
        return errorResponse(`metaPayload manquant pour ${id}`, 400, request, env);
      }
      const [contentResult, metaResult] = await Promise.all([
        upsertShareDocument(env, collections.content, id, contentPayload, request),
        upsertShareDocument(env, collections.meta, id, metaPayload, request)
      ]);
      results.push({
        id,
        meta: {
          updatedAt: String(metaResult?.meta?.updatedAt || contentResult?.meta?.updatedAt || new Date().toISOString()).trim()
        }
      });
    }
    return jsonResponse({
      success: true,
      count: results.length,
      results
    }, 200, request, env);
  }
  if (!path && repairPath) {
    if (request.method !== "POST") {
      const headers = Object.assign({ Allow: "POST,OPTIONS" }, corsHeaders(request, env));
      return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
        status: 405,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers)
      });
    }
    const collections = resolveContentMetaCollections(repairPath.collection);
    if (!collections) {
      return errorResponse("Route de réparation supportée uniquement pour pages", 400, request, env);
    }
    const url = new URL(request.url);
    const dryRun = ["1", "true", "yes"].includes(String(url.searchParams.get("dryRun") || "").trim().toLowerCase());
    const report = await reconcileMemosConsistency(env, request, { dryRun, collection: collections.content });
    return jsonResponse(report, 200, request, env, {
      "Cache-Control": "no-store, max-age=0"
    });
  }
  if (!path) {
    return notFoundResponse(request, env);
  }
  if (request.method === "GET") {
    const requestUrl = new URL(request.url);
    const ensureConsistency = ["1", "true", "yes"].includes(
      String(requestUrl.searchParams.get("ensureConsistency") || "").trim().toLowerCase()
    );
    const consistencyCollections = resolveConsistencyCollections(path.collection);
    if (ensureConsistency && consistencyCollections) {
      await reconcileMemosConsistency(env, request, { dryRun: false, collection: consistencyCollections.content });
    }
    if (!path.documentId) {
      const view = String(requestUrl.searchParams.get("view") || "").trim().toLowerCase();
      const includeArchived = ["1", "true", "yes"].includes(
        String(requestUrl.searchParams.get("includeArchived") || "").trim().toLowerCase()
      );
      if (view === "tree") {
        const spaceFilter = String(requestUrl.searchParams.get("spaceId") || "").trim().toLowerCase();
        const docs = await listShareDocuments(env, path.collection);
        const summaries = docs
          .map(buildShareSummary)
          .filter(item => item.id)
          .filter(item => includeArchived || item.status !== "archived")
          .filter(item => !spaceFilter || item.spaceId === spaceFilter)
          .sort((a, b) => {
            const ap = Number.isFinite(Number(a?.position)) ? Number(a.position) : Number.POSITIVE_INFINITY;
            const bp = Number.isFinite(Number(b?.position)) ? Number(b.position) : Number.POSITIVE_INFINITY;
            if (ap !== bp) return ap - bp;
            return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
          });
        const watermark = summaries[0]?.updatedAt || "";
        return jsonResponse({ documents: summaries, watermark }, 200, request, env, {
          "Cache-Control": "no-store, max-age=0"
        });
      }
      const docs = await listShareDocuments(env, path.collection);
      const filtered = includeArchived ? docs : docs.filter(doc => !isArchivedPayload(doc?.payload || {}));
      return jsonResponse({ documents: filtered }, 200, request, env, {
        "Cache-Control": "no-store, max-age=0"
      });
    }
    const doc = await fetchShareDocument(env, path.collection, path.documentId);
    if (!doc) {
      return jsonResponse({ payload: null }, 404, request, env, {
        "Cache-Control": "no-store, max-age=0"
      });
    }
    return jsonResponse({ payload: doc.payload, meta: doc.meta }, 200, request, env, {
      "Cache-Control": "no-store, max-age=0"
    });
  }
  if (request.method === "DELETE") {
    if (!path.documentId) {
      return errorResponse("Identifiant de document manquant", 400, request, env);
    }
    await deleteShareDocument(env, path.collection, path.documentId);
    return jsonResponse({ success: true }, 200, request, env);
  }
  if (request.method === "PUT" || request.method === "POST") {
    const rateLimitResponse = await enforceWriteRateLimit(request, env);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    if (request.method === "PUT" && !path.documentId) {
      return errorResponse("Identifiant de document manquant", 400, request, env);
    }
    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse("Payload JSON attendu", 400, request, env);
    }
    if (!body || !Object.prototype.hasOwnProperty.call(body, "payload")) {
      return errorResponse("Payload manquant", 400, request, env);
    }
    if (request.method === "POST") {
      if (path.documentId) {
        return errorResponse("POST ne prend pas d'identifiant", 400, request, env);
      }
      const result = await createShareDocument(env, path.collection, body.payload, request);
      return jsonResponse(result, 200, request, env);
    }
    const result = await upsertShareDocument(env, path.collection, path.documentId, body.payload, request);
    return jsonResponse(result, 200, request, env);
  }
  const headers = Object.assign({ Allow: "GET,PUT,POST,DELETE" }, corsHeaders(request, env));
  return errorResponse("Méthode non autorisée", 405, request, env, headers);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error(err);
      return errorResponse(err.message || "Erreur serveur", 500, request, env);
    }
  }
};
