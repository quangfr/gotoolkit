const API_VERSION = "v1";
const SHARES_SEGMENT = "shares";
const ASSETS_SEGMENT = "assets";
const VALID_COLLECTIONS = new Set([
  "grids",
  "memos",
  "memos-meta",
  "template-memos",
  "handoffs",
  "codes_map"
]);
const GOOGLE_API_SCOPE = [
  "https://www.googleapis.com/auth/datastore"
].join(" ");
const FIREBASE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ALLOWED_ASSET_MIME_PREFIXES = ["image/", "video/", "audio/"];
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
let serviceAccountConfig = null;
let signingKeyPromise = null;
let accessTokenCache = { token: null, expiresAt: 0 };

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

function toBase64UrlString(text) {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64UrlString(text) {
  const normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const withPadding = normalized + (padLength ? "=".repeat(4 - padLength) : "");
  return atob(withPadding);
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
  return ALLOWED_ASSET_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
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
  if (!raw) return null;
  return raw
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const allowedOrigins = parseAllowedOrigins(env);
  const origin = request.headers.get("Origin");
  const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  const allowHeaders = requestedHeaders && requestedHeaders.trim()
    ? requestedHeaders
    : "Content-Type,Authorization,Cache-Control";
  const headers = {
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Origin": isLocalhost
      ? origin
      : allowedOrigins && origin && allowedOrigins.includes(origin)
        ? origin
        : "*"
  };
  if (allowedOrigins) {
    headers["Vary"] = "Origin";
  }
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
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const assetPath = parseAssetPath(request);
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
  if (!path) {
    return notFoundResponse(request, env);
  }
  if (request.method === "GET") {
    if (!path.documentId) {
      const requestUrl = new URL(request.url);
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
