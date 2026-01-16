const API_VERSION = "v1";
const SHARES_SEGMENT = "shares";
const VALID_COLLECTIONS = new Set([
  "slides",
  "timelines",
  "diagrams",
  "grids",
  "voices", // voice module capsules
  "memos",
  "template-memos"
]);
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const FIREBASE_TOKEN_URL = "https://oauth2.googleapis.com/token";
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
  const headers = {
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
  const kv = env?.RATE_LIMIT;
  if (!kv?.get || !kv?.put) {
    return null;
  }
  const ip = getClientIp(request);
  const today = new Date().toISOString().slice(0, 10);
  const minuteWindow = Math.floor(Date.now() / 60_000);
  const dailyKey = `share-write:${ip}:day:${today}`;
  const minuteKey = `share-write:${ip}:min:${minuteWindow}`;
  const dailyLimit = 200;
  const minuteLimit = 12;

  const dailyCount = await readCounter(kv, dailyKey);
  if (dailyCount >= dailyLimit) {
    return errorResponse(
      "Quota quotidien atteint, revenez demain",
      429,
      request,
      env
    );
  }

  const minuteCount = await readCounter(kv, minuteKey);
  if (minuteCount >= minuteLimit) {
    return errorResponse(
      "Trop de requêtes d'écriture, réessayez dans un instant",
      429,
      request,
      env
    );
  }

  await writeCounter(kv, dailyKey, dailyCount + 1, 27 * 60 * 60);
  await writeCounter(kv, minuteKey, minuteCount + 1, 90);
  return null;
}

async function readCounter(kv, key) {
  const stored = await kv.get(key);
  if (!stored) {
    return 0;
  }
  const value = parseInt(stored, 10);
  return Number.isNaN(value) ? 0 : value;
}

async function writeCounter(kv, key, value, ttlSeconds) {
  await kv.put(key, String(value), { expirationTtl: ttlSeconds });
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
        scope: FIRESTORE_SCOPE,
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
  const url = `${baseUrl}/${collection}?pageSize=100`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${await getAccessToken(env)}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Erreur Firestore: ${response.status} ${body}`);
  }
  const data = await response.json();
  const documents = (data.documents || []).map(doc => {
    // extract document ID from name path
    const nameSegments = doc.name.split("/");
    const id = nameSegments[nameSegments.length - 1];
    return {
      id,
      payload: extractPayload(doc),
      meta: extractMeta(doc)
    };
  });
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
  const path = parseSharePath(request);
  if (!path) {
    return notFoundResponse(request, env);
  }
  if (request.method === "GET") {
    if (!path.documentId) {
      const docs = await listShareDocuments(env, path.collection);
      return jsonResponse({ documents: docs }, 200, request, env);
    }
    const doc = await fetchShareDocument(env, path.collection, path.documentId);
    if (!doc) {
      return jsonResponse({ payload: null }, 404, request, env);
    }
    return jsonResponse({ payload: doc.payload, meta: doc.meta }, 200, request, env);
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
