var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var API_VERSION = "v1";
var COLLECTION = "feedback";
var FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
var FIREBASE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var DEFAULT_PROJECT_ID = "gotoolkit";
var MAX_REQUEST_SIZE = 140 * 1024 * 1024;
var MAX_MEDIA_FILES = 6;
var MAX_MEDIA_BASE64_SIZE = 140 * 1024 * 1024;
var FEEDBACK_MEDIA_SEGMENT = "media";



var FEEDBACK_TYPES = /* @__PURE__ */ new Set([
    "bug-general",
    "bug-assist",
    "bug-canvas",
    "bug-draw",
    "bug-grid",
    "bug-timeline",
    "bug-voice",
    "suggestion"
]);

var textEncoder = new TextEncoder();
var serviceAccountConfig = null;
var signingKeyPromise = null;
var accessTokenCache = { token: null, expiresAt: 0 };

var index_default = {
    async fetch(request, env) {
        try {
            const { pathname } = new URL(request.url);

            if (request.method === "OPTIONS") {
                return handleOptions(request, env);
            }

            const normalizedPath = pathname.replace(/\/+/g, "/");
            const mediaPath = parseMediaPath(normalizedPath);
            if (mediaPath) {
                if (request.method !== "GET") {
                    return jsonResponse({ error: "Méthode non autorisée" }, 405, request, env, { Allow: "GET,OPTIONS" });
                }
                const mediaResult = await readFeedbackMedia(env, mediaPath.id);
                if (!mediaResult) {
                    return jsonResponse({ error: "Ressource introuvable" }, 404, request, env);
                }
                const headers = {
                    ...corsHeaders(request, env),
                    "Content-Type": mediaResult.object.httpMetadata?.contentType || "application/octet-stream",
                    "Cache-Control": "public, max-age=31536000, immutable"
                };
                if (typeof mediaResult.object.size === "number") {
                    headers["Content-Length"] = String(mediaResult.object.size);
                }
                return new Response(mediaResult.object.body, { status: 200, headers });
            }
            if (!normalizedPath.startsWith(`/${API_VERSION}/feedback`)) {
                return jsonResponse({ error: "Ressource introuvable" }, 404, request, env);
            }

            // Debug (optionnel): /v1/feedback/debug-ip
            if (request.method === "GET" && normalizedPath === `/${API_VERSION}/feedback/debug-ip`) {
                const ip = getClientIp(request);
                const authError = requireAdmin(request, env);
                return jsonResponse(
                    {
                        ip,
                        adminByToken: !authError,
                        adminByIp: isAdminIp(request),
                        cf: request.headers.get("CF-Connecting-IP"),
                        xff: request.headers.get("X-Forwarded-For"),
                        ray: request.headers.get("CF-Ray"),
                        country: request.headers.get("CF-IPCountry")
                    },
                    200,
                    request,
                    env
                );
            }

            // GET: public (tu renvoies juste canEdit selon token)
            if (request.method === "GET") {
                const list = await listFeedback(env);
                const canEdit = !requireAdmin(request, env); // admin si bearer token ok
                return jsonResponse({ items: list.items, counts: list.counts, canEdit }, 200, request, env);
            }

            // PUT: admin-only via Bearer token
            if (request.method === "PUT") {
                const id = normalizedPath.split("/").filter(Boolean).pop();
                if (!id) {
                    return jsonResponse({ error: "ID manquant" }, 400, request, env);
                }

                const authError = requireAdmin(request, env);
                if (authError) {
                    return jsonResponse({ error: authError }, 403, request, env);
                }

                const payload2 = await readJson(request);
                const validationError2 = validateUpdatePayload(payload2);
                if (validationError2) {
                    return jsonResponse({ error: validationError2 }, 400, request, env);
                }

                const stored2 = await updateFeedback(env, id, payload2);
                return jsonResponse({ status: "ok", id: stored2?.name || id }, 200, request, env);
            }

            // DELETE: admin-only via Bearer token
            if (request.method === "DELETE") {
                const id = normalizedPath.split("/").filter(Boolean).pop();
                if (!id) {
                    return jsonResponse({ error: "ID manquant" }, 400, request, env);
                }

                const authError = requireAdmin(request, env);
                if (authError) {
                    return jsonResponse({ error: authError }, 403, request, env);
                }

                await deleteFeedback(env, id);
                return jsonResponse({ status: "ok", id }, 200, request, env);
            }

            // POST: public + rate limit KV
            if (request.method !== "POST") {
                return jsonResponse({ error: "Méthode non autorisée" }, 405, request, env, {
                    Allow: "GET,POST,PUT,DELETE,OPTIONS"
                });
            }

            const quotaError = await enforceRateLimit(request, env);
            if (quotaError) return quotaError;

            const payload = await readJson(request);
            const validationError = validatePayload(payload);
            if (validationError) {
                return jsonResponse({ error: validationError }, 400, request, env);
            }

            const stored = await saveFeedback(env, payload, request);
            return jsonResponse({ status: "ok", id: stored?.name || null }, 200, request, env);
        } catch (err) {
            console.error("Feedback worker error", err);
            return jsonResponse({ error: "Erreur interne" }, 500, request, env);
        }
    }
};

function parseMediaPath(pathname) {
    const segments = String(pathname || "").split("/").filter(Boolean);
    if (segments.length !== 3) return null;
    if (segments[0] !== API_VERSION || segments[1] !== FEEDBACK_MEDIA_SEGMENT) return null;
    return { id: decodeURIComponent(segments[2] || "") };
}
__name(parseMediaPath, "parseMediaPath");

function toBase64UrlString(text) {
    return btoa(String(text || "")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(toBase64UrlString, "toBase64UrlString");

function fromBase64UrlString(text) {
    const normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
    const padLength = normalized.length % 4;
    const withPadding = normalized + (padLength ? "=".repeat(4 - padLength) : "");
    return atob(withPadding);
}
__name(fromBase64UrlString, "fromBase64UrlString");

function resolveFeedbackMediaBucket(env) {
    if (!env?.FEEDBACK_MEDIA_BUCKET || typeof env.FEEDBACK_MEDIA_BUCKET.put !== "function") {
        throw new Error("Binding R2 FEEDBACK_MEDIA_BUCKET manquant");
    }
    return env.FEEDBACK_MEDIA_BUCKET;
}
__name(resolveFeedbackMediaBucket, "resolveFeedbackMediaBucket");

function parseAllowedOrigins(env) {
    const raw = env?.SHARE_ALLOWED_ORIGINS;
    if (!raw) return null;
    return raw.split(",").map((o) => o.trim()).filter(Boolean);
}
__name(parseAllowedOrigins, "parseAllowedOrigins");

function corsHeaders(request, env) {
    const allowedOrigins = parseAllowedOrigins(env);
    const origin = request.headers.get("Origin");
    const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

    const headers = {
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Origin":
            isLocalhost ? origin : allowedOrigins && origin && allowedOrigins.includes(origin) ? origin : "*"
    };

    if (allowedOrigins) {
        headers["Vary"] = "Origin";
    }
    return headers;
}
__name(corsHeaders, "corsHeaders");

function handleOptions(request, env) {
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders(request, env)
        }
    });
}
__name(handleOptions, "handleOptions");

function jsonResponse(body, status, request, env, extra = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders(request, env),
            ...extra
        }
    });
}
__name(jsonResponse, "jsonResponse");

async function readJson(request) {
    const text = await request.text();
    if (!text || text.length > MAX_REQUEST_SIZE) {
        throw new Error("Payload trop volumineux ou vide");
    }
    return JSON.parse(text);
}
__name(readJson, "readJson");

// Admin auth via Bearer token (secret Worker: ADMIN_TOKEN)
function requireAdmin(request, env) {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return "Token manquant";
    const token = auth.slice(7).trim();
    if (!env?.ADMIN_TOKEN) return "ADMIN_TOKEN manquant côté serveur";
    if (token !== env.ADMIN_TOKEN) return "Token invalide";
    return null;
}
__name(requireAdmin, "requireAdmin");

function validatePayload(payload) {
    if (!payload || typeof payload !== "object") return "Payload invalide";
    if (payload.website) return "Payload invalide"; // honeypot
    const rawType = String(payload.type || "").trim().toLowerCase();
    const type = rawType || "bug-general";
    const message = String(payload.message || "").trim();
    const subject = payload.subject ? String(payload.subject).trim() : "";
    const shareUrl = payload.shareUrl ? String(payload.shareUrl).trim() : "";
    const mediaValidation = normalizeMediaPayload(payload.media);

    if (!type) return "Type requis";
    if (!message) return "Message requis";
    if (message.length > 4e3) return "Message trop long";
    if (!FEEDBACK_TYPES.has(type)) return "Type invalide";
    if (subject.length > 400) return "Sujet trop long";
    if (shareUrl.length > 2048) return "Lien partagé trop long";
    if (shareUrl && !/^https?:\/\//i.test(shareUrl)) return "Lien partagé invalide";
    if (mediaValidation.error) return mediaValidation.error;
    return null;
}
__name(validatePayload, "validatePayload");

function validateUpdatePayload(payload) {
    if (!payload || typeof payload !== "object") return "Payload invalide";
    const status = String(payload.status || "").trim() || "recue";
    const message = String(payload.message || "").trim();
    const rawType = String(payload.type || "").trim().toLowerCase();
    const type = rawType || "bug-general";
    if (!message) return "Message requis";
    if (!["recue", "traitee", "planifiee", "reportee"].includes(status)) return "Statut invalide";
    if (!FEEDBACK_TYPES.has(type)) return "Type invalide";
    if (message.length > 4e3) return "Message trop long";
    return null;
}
__name(validateUpdatePayload, "validateUpdatePayload");

function normalizeMediaPayload(input) {
    if (input == null) return { media: [] };
    if (!Array.isArray(input)) return { error: "Media invalide" };
    if (input.length > MAX_MEDIA_FILES) return { error: `Maximum ${MAX_MEDIA_FILES} médias` };
    const media = [];
    for (let i = 0; i < input.length; i++) {
        const raw = input[i];
        if (!raw || typeof raw !== "object") return { error: "Media invalide" };
        const fileName = String(raw.fileName || "").trim();
        const mimeType = String(raw.mimeType || "").trim().toLowerCase();
        const contentBase64 = String(raw.contentBase64 || "").trim();
        if (!fileName || fileName.length > 200) return { error: "Nom de média invalide" };
        if (!mimeType || (!mimeType.startsWith("image/") && !mimeType.startsWith("video/"))) return { error: "Type de média invalide" };
        if (!contentBase64) return { error: "Média vide" };
        if (contentBase64.length > MAX_MEDIA_BASE64_SIZE) return { error: "Média trop volumineux" };
        if (!/^[A-Za-z0-9+/=]+$/.test(contentBase64)) return { error: "Média invalide" };
        media.push({ fileName, mimeType, contentBase64 });
    }
    return { media };
}
__name(normalizeMediaPayload, "normalizeMediaPayload");

function decodeBase64ToBytes(base64) {
    const normalized = String(base64 || "").replace(/-/g, "+").replace(/_/g, "/");
    const padLength = normalized.length % 4;
    const withPadding = normalized + (padLength ? "=".repeat(4 - padLength) : "");
    const binary = atob(withPadding);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
__name(decodeBase64ToBytes, "decodeBase64ToBytes");

function bytesToHex(bytes) {
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");

async function sha256Hex(bytes) {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(hash));
}
__name(sha256Hex, "sha256Hex");

function detectMediaExtension(mimeType, fileName) {
    const mime = String(mimeType || "").toLowerCase();
    if (mime === "image/png") return "png";
    if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
    if (mime === "image/gif") return "gif";
    if (mime === "image/webp") return "webp";
    if (mime === "video/mp4") return "mp4";
    if (mime === "video/webm") return "webm";
    if (mime === "video/quicktime") return "mov";
    const lower = String(fileName || "").toLowerCase();
    if (lower.endsWith(".png")) return "png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
    if (lower.endsWith(".gif")) return "gif";
    if (lower.endsWith(".webp")) return "webp";
    if (lower.endsWith(".mp4")) return "mp4";
    if (lower.endsWith(".webm")) return "webm";
    if (lower.endsWith(".mov")) return "mov";
    return "bin";
}
__name(detectMediaExtension, "detectMediaExtension");

function sanitizeMediaName(fileName, fallbackExt) {
    const base = String(fileName || "")
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (!base) return `media.${fallbackExt}`;
    return base;
}
__name(sanitizeMediaName, "sanitizeMediaName");

async function uploadFeedbackMedia(env, mediaItems) {
    const bucket = resolveFeedbackMediaBucket(env);
    const now = new Date();
    const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const uploaded = [];
    for (const media of mediaItems) {
        const bytes = decodeBase64ToBytes(media.contentBase64);
        const hash = await sha256Hex(bytes);
        const ext = detectMediaExtension(media.mimeType, media.fileName);
        const safeName = sanitizeMediaName(media.fileName, ext);
        const objectName = `feedback/${prefix}/${hash}-${safeName}`;
        await bucket.put(objectName, bytes, {
            httpMetadata: {
                contentType: media.mimeType
            }
        });
        uploaded.push({
            id: toBase64UrlString(objectName),
            objectName,
            fileName: media.fileName,
            mimeType: media.mimeType,
            size: bytes.length
        });
    }
    return uploaded;
}
__name(uploadFeedbackMedia, "uploadFeedbackMedia");

async function readFeedbackMedia(env, mediaId) {
    const bucket = resolveFeedbackMediaBucket(env);
    let objectName = "";
    try {
        objectName = fromBase64UrlString(mediaId);
    } catch (err) {
        return null;
    }
    if (!objectName) return null;
    const object = await bucket.get(objectName);
    if (!object) return null;
    return { objectName, object };
}
__name(readFeedbackMedia, "readFeedbackMedia");

// (Optionnel) IP helpers, conservés (utile pour rate-limit / debug)
function getClientIp(request) {
    const cf = request.headers.get("CF-Connecting-IP");
    if (cf && cf !== "unknown") return cf.trim();
    const xff = request.headers.get("X-Forwarded-For");
    if (xff) {
        const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length) return parts[0];
    }
    return "unknown";
}
__name(getClientIp, "getClientIp");

function isAdminIp(request) {
    const ip = getClientIp(request);
    return ADMIN_IPS.has(ip);
}
__name(isAdminIp, "isAdminIp");

async function enforceRateLimit(request, env) {
    if (!env?.MY_RATE_LIMITER || typeof env.MY_RATE_LIMITER.limit !== "function") return null;
    const ipAddress = getClientIp(request) || "";
    const { success } = await env.MY_RATE_LIMITER.limit({ key: ipAddress });
    if (!success) {
        return jsonResponse({ error: "Attends quelques secondes avant un nouvel envoi" }, 429, request, env);
    }
    return null;
}
__name(enforceRateLimit, "enforceRateLimit");

async function readCounter(kv, key) {
    const stored = await kv.get(key);
    if (!stored) return 0;
    const value = parseInt(stored, 10);
    return Number.isNaN(value) ? 0 : value;
}
__name(readCounter, "readCounter");

async function writeCounter(kv, key, value, ttlSeconds) {
    await kv.put(key, String(value), { expirationTtl: ttlSeconds });
}
__name(writeCounter, "writeCounter");

function getServiceAccount(env) {
    if (serviceAccountConfig) return serviceAccountConfig;
    const raw = env?.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        throw new Error("Clé de service Firebase manquante");
    }
    serviceAccountConfig = JSON.parse(raw);
    if (!serviceAccountConfig.client_email || !serviceAccountConfig.private_key) {
        throw new Error("Clé de service incomplète");
    }
    return serviceAccountConfig;
}
__name(getServiceAccount, "getServiceAccount");

function pemToArrayBuffer(pem) {
    const cleaned = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const binary = atob(cleaned);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        buffer[i] = binary.charCodeAt(i);
    }
    return buffer.buffer;
}
__name(pemToArrayBuffer, "pemToArrayBuffer");

function base64UrlEncode(buffer) {
    let string = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
        string += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(string);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncode, "base64UrlEncode");

async function getSigningKey(env) {
    if (signingKeyPromise) return signingKeyPromise;
    const account = getServiceAccount(env);
    const binary = pemToArrayBuffer(account.private_key);
    signingKeyPromise = crypto.subtle.importKey(
        "pkcs8",
        binary,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
    return signingKeyPromise;
}
__name(getSigningKey, "getSigningKey");

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
__name(getAccessToken, "getAccessToken");

function getFirestoreBaseUrl(env) {
    const account = getServiceAccount(env);
    const projectId = env?.FIREBASE_PROJECT_ID || account.project_id || DEFAULT_PROJECT_ID;
    if (!projectId) throw new Error("projectId manquant");
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}
__name(getFirestoreBaseUrl, "getFirestoreBaseUrl");

async function saveFeedback(env, payload, request) {
    const accessToken = await getAccessToken(env);
    const base = getFirestoreBaseUrl(env);
    const url = `${base}/${COLLECTION}`;

    const mediaValidation = normalizeMediaPayload(payload.media);
    if (mediaValidation.error) {
        throw new Error(mediaValidation.error);
    }
    const uploadedMedia = await uploadFeedbackMedia(env, mediaValidation.media);
    const body = {
        fields: toFields({
            type: payload.type,
            message: payload.message,
            name: payload.name || null,
            subject: payload.subject || null,
            status: "recue",
            page: payload.page || "index",
            shareUrl: payload.shareUrl || null,
            mediaJson: uploadedMedia.length ? JSON.stringify(uploadedMedia) : null,
            userAgent: payload.userAgent || request.headers.get("User-Agent") || "",
            createdAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() },
            updatedAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
        })
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore error ${response.status}: ${text}`);
    }
    return response.json();
}
__name(saveFeedback, "saveFeedback");

function toFields(data) {
    const fields = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === void 0) continue;
        if (value && value.timestampValue) {
            fields[key] = value;
            continue;
        }
        if (value === null || value === "") {
            fields[key] = { nullValue: null };
            continue;
        }
        fields[key] = { stringValue: String(value) };
    }
    return fields;
}
__name(toFields, "toFields");

function fromFields(doc) {
    const result = {};
    const fields = doc.fields || {};
    const getString = /* @__PURE__ */ __name((key) => {
        const value = fields[key];
        if (!value) return "";
        if (value.stringValue != null) return String(value.stringValue);
        if (value.integerValue != null) return String(value.integerValue);
        if (value.nullValue != null) return "";
        return "";
    }, "getString");

    result.id = (doc.name || "").split("/").pop();
    result.type = getString("type") || "bug";
    result.message = getString("message") || "";
    result.subject = getString("subject") || "";
    result.name = getString("name") || "";
    result.page = getString("page") || "";
    result.status = getString("status") || "recue";
    result.createdAt = fields.createdAt?.timestampValue || fields.createdAt?.stringValue || "";
    result.updatedAt = fields.updatedAt?.timestampValue || fields.updatedAt?.stringValue || "";
    result.shareUrl = getString("shareUrl") || "";
    result.media = [];
    const mediaJson = getString("mediaJson");
    if (mediaJson) {
        try {
            const parsed = JSON.parse(mediaJson);
            if (Array.isArray(parsed)) {
                result.media = parsed.map((item) => ({
                    id: String(item?.id || ""),
                    fileName: String(item?.fileName || ""),
                    mimeType: String(item?.mimeType || ""),
                    size: Number(item?.size || 0),
                    url: item?.id ? `/${API_VERSION}/${FEEDBACK_MEDIA_SEGMENT}/${encodeURIComponent(String(item.id))}` : ""
                }));
            }
        } catch (err) {
            result.media = [];
        }
    }
    return result;
}
__name(fromFields, "fromFields");

async function listFeedback(env) {
    const accessToken = await getAccessToken(env);
    const base = getFirestoreBaseUrl(env);
    const url = `${base}/${COLLECTION}?orderBy=createdAt%20desc`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore list error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const docs = Array.isArray(data.documents) ? data.documents : [];
    const items = docs.map(fromFields);

    const counts = items.reduce((acc, item) => {
        const key = item.status || "recue";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return { items, counts };
}
__name(listFeedback, "listFeedback");

async function updateFeedback(env, id, payload) {
    const accessToken = await getAccessToken(env);
    const base = getFirestoreBaseUrl(env);

    const updateData = {
        subject: payload.subject || null,
        message: payload.message || "",
        status: payload.status || "recue",
        type: payload.type || "bug-general",
        name: payload.name || null,
        updatedAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
    };

    if (Object.prototype.hasOwnProperty.call(payload, "shareUrl")) {
        updateData.shareUrl = payload.shareUrl || null;
    }

    const fields = toFields(updateData);
    const mask = Object.keys(fields)
        .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
        .join("&");

    const url = `${base}/${COLLECTION}/${encodeURIComponent(id)}${mask ? "?" + mask : ""}`;

    const response = await fetch(url, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore update error ${response.status}: ${text}`);
    }
    return response.json();
}
__name(updateFeedback, "updateFeedback");

async function deleteFeedback(env, id) {
    const accessToken = await getAccessToken(env);
    const base = getFirestoreBaseUrl(env);
    const url = `${base}/${COLLECTION}/${encodeURIComponent(id)}`;

    const response = await fetch(url, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Firestore delete error ${response.status}: ${text}`);
    }
    return true;
}
__name(deleteFeedback, "deleteFeedback");

export { index_default as default };
//# sourceMappingURL=index.js.map
