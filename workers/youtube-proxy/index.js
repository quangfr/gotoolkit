const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.web.app",
  "https://gotoolkit.workers.dev"
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_CAPTIONS_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/captions";
const SESSION_COOKIE_NAME = "gt_youtube_sid";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const OAUTH_PROVIDER = "youtube";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SCOPE = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl"
].join(" ");

function normalizeOrigin(origin) {
  return String(origin || "").trim();
}

function isLocalOrigin(origin) {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(origin);
}

function corsMeta(request) {
  const origin = normalizeOrigin(request.headers.get("Origin"));
  const allowLocal = isLocalOrigin(origin);
  const allowed = allowLocal || ALLOWED_ORIGINS.includes(origin);
  const corsOrigin = allowed ? origin : "null";
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
  headers["Vary"] = "Origin";
  return { origin, allowLocal, allowed, headers };
}

function jsonResponse(corsHeaders, payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}

function errorResponse(corsHeaders, status, message) {
  return jsonResponse(corsHeaders, { error: { message } }, status);
}

function getRedirectUri(request) {
  const url = new URL(request.url);
  return `${url.origin}/oauth/callback`;
}

function getTokenKey(deviceId) {
  return `yt-session:${deviceId}`;
}

function getSelectedChannelKey(deviceId) {
  return `yt-channel-session:${deviceId}`;
}

function generateOpaqueSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

function generateOAuthNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

function getOAuthStateKey(nonce) {
  return `youtube-oauth-state:${nonce}`;
}

function normalizeTargetOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) return ALLOWED_ORIGINS[0] || "";
  if (isLocalOrigin(value)) return value;
  if (ALLOWED_ORIGINS.includes(value)) return value;
  return ALLOWED_ORIGINS[0] || "";
}

function parseCookies(request) {
  const raw = String(request.headers.get("Cookie") || "");
  const out = {};
  if (!raw) return out;
  const entries = raw.split(";");
  for (const entry of entries) {
    const [k, ...rest] = entry.split("=");
    const key = String(k || "").trim();
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join("=").trim());
  }
  return out;
}

function getSessionIdFromRequest(request) {
  const cookies = parseCookies(request);
  return String(cookies?.[SESSION_COOKIE_NAME] || "").trim();
}

function buildSessionCookie(sessionId, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const safeSid = String(sessionId || "").trim();
  const maxAge = Number.isFinite(maxAgeSeconds) ? Math.max(0, Math.floor(maxAgeSeconds)) : 0;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(safeSid)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${maxAge}`
  ];
  return parts.join("; ");
}

function resolveSessionId(request) {
  const cookieSid = getSessionIdFromRequest(request);
  if (cookieSid) return cookieSid;
  return "";
}

function normalizeLanguage(raw) {
  const value = String(raw || "").trim().toLowerCase().replace("_", "-");
  const root = value.split("-")[0];
  return root || "fr";
}

async function getStoredToken(env, sessionId) {
  if (!env?.OAUTH_DB || !sessionId) return null;
  const key = getTokenKey(sessionId);
  let raw = null;
  try {
    const row = await env.OAUTH_DB
      .prepare("SELECT payload FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2 LIMIT 1")
      .bind(OAUTH_PROVIDER, key)
      .first();
    raw = row?.payload ? String(row.payload) : null;
  } catch (err) {
    console.warn("youtube oauth d1 read failed", err);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function storeToken(env, sessionId, token) {
  if (!env?.OAUTH_DB || !sessionId || !token) return;
  const key = getTokenKey(sessionId);
  const payload = JSON.stringify(token);
  try {
    await env.OAUTH_DB
      .prepare(`INSERT INTO oauth_sessions (provider, session_key, payload, updated_at, expires_at)
                VALUES (?1, ?2, ?3, ?4, NULL)
                ON CONFLICT(provider, session_key)
                DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
      .bind(OAUTH_PROVIDER, key, payload, new Date().toISOString())
      .run();
  } catch (err) {
    console.warn("youtube oauth d1 write failed", err);
  }
}

async function clearToken(env, sessionId) {
  if (!env?.OAUTH_DB || !sessionId) return;
  const key = getTokenKey(sessionId);
  try {
    await env.OAUTH_DB
      .prepare("DELETE FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2")
      .bind(OAUTH_PROVIDER, key)
      .run();
  } catch (err) {
    console.warn("youtube oauth d1 delete failed", err);
  }
}

async function writeOAuthState(env, nonce, value) {
  if (!env?.OAUTH_DB || !nonce || !value) return false;
  const key = getOAuthStateKey(nonce);
  const payload = JSON.stringify(value);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  try {
    await env.OAUTH_DB
      .prepare(`INSERT INTO oauth_sessions (provider, session_key, payload, updated_at, expires_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ON CONFLICT(provider, session_key)
                DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
      .bind(OAUTH_PROVIDER, key, payload, new Date().toISOString(), expiresAt)
      .run();
    return true;
  } catch (err) {
    console.warn("youtube oauth state write failed", err);
    return false;
  }
}

async function consumeOAuthState(env, nonce) {
  if (!env?.OAUTH_DB || !nonce) return null;
  const key = getOAuthStateKey(nonce);
  let raw = null;
  try {
    const row = await env.OAUTH_DB
      .prepare("SELECT payload FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2 LIMIT 1")
      .bind(OAUTH_PROVIDER, key)
      .first();
    raw = row?.payload ? String(row.payload) : null;
  } catch (err) {
    console.warn("youtube oauth state read failed", err);
    return null;
  }
  try {
    await env.OAUTH_DB
      .prepare("DELETE FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2")
      .bind(OAUTH_PROVIDER, key)
      .run();
  } catch (err) {
    console.warn("youtube oauth state delete failed", err);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function getSelectedChannelId(env, sessionId) {
  if (!env?.OAUTH_DB || !sessionId) return "";
  const key = getSelectedChannelKey(sessionId);
  let raw = "";
  try {
    const row = await env.OAUTH_DB
      .prepare("SELECT payload FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2 LIMIT 1")
      .bind(OAUTH_PROVIDER, key)
      .first();
    raw = row?.payload ? String(row.payload) : "";
  } catch (err) {
    console.warn("youtube oauth d1 read channel failed", err);
  }
  return raw.trim();
}

async function setSelectedChannelId(env, sessionId, channelId) {
  if (!env?.OAUTH_DB || !sessionId) return;
  const key = getSelectedChannelKey(sessionId);
  const normalized = String(channelId || "").trim();
  if (!normalized) {
    try {
      await env.OAUTH_DB
        .prepare("DELETE FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2")
        .bind(OAUTH_PROVIDER, key)
        .run();
    } catch (err) {
      console.warn("youtube oauth d1 clear channel failed", err);
    }
    return;
  }
  try {
    await env.OAUTH_DB
      .prepare(`INSERT INTO oauth_sessions (provider, session_key, payload, updated_at, expires_at)
                VALUES (?1, ?2, ?3, ?4, NULL)
                ON CONFLICT(provider, session_key)
                DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
      .bind(OAUTH_PROVIDER, key, normalized, new Date().toISOString())
      .run();
  } catch (err) {
    console.warn("youtube oauth d1 write channel failed", err);
  }
}

async function listOwnedChannels(accessToken) {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "50");
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Channels fetch failed (${response.status})`;
    throw new Error(message);
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map(item => ({
    id: String(item?.id || "").trim(),
    title: String(item?.snippet?.title || "").trim(),
    thumbnailUrl:
      item?.snippet?.thumbnails?.default?.url
      || item?.snippet?.thumbnails?.medium?.url
      || item?.snippet?.thumbnails?.high?.url
      || ""
  })).filter(ch => ch.id);
}

async function exchangeCodeForToken(request, env, code) {
  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", env.YOUTUBE_CLIENT_ID || "");
  body.set("client_secret", env.YOUTUBE_CLIENT_SECRET || "");
  body.set("redirect_uri", getRedirectUri(request));
  body.set("grant_type", "authorization_code");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Token exchange failed: ${detail}`);
  }
  return payload;
}

async function refreshAccessToken(request, env, refreshToken) {
  const body = new URLSearchParams();
  body.set("client_id", env.YOUTUBE_CLIENT_ID || "");
  body.set("client_secret", env.YOUTUBE_CLIENT_SECRET || "");
  body.set("refresh_token", refreshToken || "");
  body.set("grant_type", "refresh_token");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Token refresh failed: ${detail}`);
  }
  return payload;
}

async function getValidAccessToken(request, env, sessionId) {
  const stored = await getStoredToken(env, sessionId);
  if (!stored?.refresh_token) return null;
  const now = Date.now();
  if (stored.access_token && Number(stored.expires_at || 0) > now + 30_000) {
    return stored.access_token;
  }
  const refreshed = await refreshAccessToken(request, env, stored.refresh_token);
  const merged = {
    ...stored,
    access_token: refreshed.access_token,
    expires_at: now + (Number(refreshed.expires_in || 3600) * 1000)
  };
  await storeToken(env, sessionId, merged);
  return merged.access_token;
}

function getMimeBoundary() {
  return `gotoolkit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function encodeText(text) {
  return new TextEncoder().encode(text);
}

function concatUint8Arrays(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

async function buildMultipartRelated(metadata, fileBlob, fileContentType) {
  const boundary = getMimeBoundary();
  const preamble = encodeText(
    `--${boundary}\r\n`
    + "Content-Type: application/json; charset=UTF-8\r\n\r\n"
    + `${JSON.stringify(metadata)}\r\n`
    + `--${boundary}\r\n`
    + `Content-Type: ${fileContentType}\r\n\r\n`
  );
  const fileBytes = new Uint8Array(await fileBlob.arrayBuffer());
  const trailer = encodeText(`\r\n--${boundary}--`);
  return {
    boundary,
    body: concatUint8Arrays([preamble, fileBytes, trailer])
  };
}

async function uploadVideo(accessToken, payload) {
  const { title, description, categoryId, privacyStatus, madeForKids, videoFile } = payload;
  const metadata = {
    snippet: {
      title: title || "Document",
      description: description || "",
      categoryId: categoryId || "28",
      defaultLanguage: "fr"
    },
    status: {
      privacyStatus: privacyStatus || "unlisted",
      selfDeclaredMadeForKids: Boolean(madeForKids)
    }
  };
  const type = videoFile?.type || "video/webm";
  const multipart = await buildMultipartRelated(metadata, videoFile, type);
  const url = `${YOUTUBE_UPLOAD_URL}?uploadType=multipart&part=snippet,status`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${multipart.boundary}`
    },
    body: multipart.body
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Upload failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

async function uploadCaptions(accessToken, payload) {
  const { videoId, language, captionsFile } = payload;
  const metadata = {
    snippet: {
      videoId,
      language: normalizeLanguage(language),
      name: "Sous-titres",
      isDraft: false
    }
  };
  const multipart = await buildMultipartRelated(metadata, captionsFile, "text/vtt");
  const url = `${YOUTUBE_CAPTIONS_UPLOAD_URL}?uploadType=multipart&part=snippet`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${multipart.boundary}`
    },
    body: multipart.body
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Captions upload failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

async function handleOAuthStart(request, env) {
  const url = new URL(request.url);
  const origin = (url.searchParams.get("origin") || "").trim();
  if (!env?.OAUTH_DB) {
    console.warn("youtube oauth start failed: missing OAUTH_DB binding");
    return new Response("OAuth state storage unavailable: missing OAUTH_DB binding", { status: 500 });
  }
  const sessionId = getSessionIdFromRequest(request) || generateOpaqueSessionId();
  const targetOrigin = normalizeTargetOrigin(origin);
  const nonce = generateOAuthNonce();
  const stateStored = await writeOAuthState(env, nonce, {
    sessionId,
    targetOrigin,
    issuedAt: Date.now()
  });
  if (!stateStored) {
    return new Response("OAuth state storage unavailable: failed to persist state in D1 (youtube)", { status: 500 });
  }
  const statePayload = {
    nonce
  };
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", env.YOUTUBE_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DEFAULT_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", btoa(JSON.stringify(statePayload)));
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": buildSessionCookie(sessionId)
    }
  });
}

function renderOAuthCallbackPage(ok, message, targetOrigin) {
  const safe = String(message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const payload = JSON.stringify({
    source: "gotoolkit-youtube-oauth",
    ok,
    error: ok ? "" : safe
  });
  const normalizedTargetOrigin = normalizeTargetOrigin(targetOrigin);
  return `<!doctype html><html><head><meta charset="utf-8"><title>YouTube OAuth</title></head><body><script>
  (function () {
    try {
      if (window.opener) {
        window.opener.postMessage(${payload}, ${JSON.stringify(normalizedTargetOrigin)});
      }
    } catch (err) {}
    window.close();
    document.body.textContent = ${JSON.stringify(ok ? "Connexion YouTube terminee." : `Erreur: ${safe}`)};
  })();
  </script></body></html>`;
}

function decodeState(rawState) {
  try {
    const text = atob(rawState || "");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim();
  const state = decodeState(url.searchParams.get("state") || "");
  const nonce = String(state.nonce || "").trim();
  const storedState = await consumeOAuthState(env, nonce);
  const cookieSessionId = getSessionIdFromRequest(request);
  const storedSessionId = String(storedState?.sessionId || "").trim();
  const issuedAt = Number(storedState?.issuedAt || 0);
  const stateExpired = !issuedAt || (Date.now() - issuedAt > OAUTH_STATE_TTL_MS);
  const sessionMismatch = cookieSessionId && storedSessionId && cookieSessionId !== storedSessionId;
  const sessionId = cookieSessionId || storedSessionId;
  const targetOrigin = normalizeTargetOrigin(storedState?.targetOrigin || "");

  if (!storedState || stateExpired || sessionMismatch) {
    return new Response(renderOAuthCallbackPage(false, "State OAuth invalide ou expiré", targetOrigin), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  if (!code || !sessionId) {
    return new Response(renderOAuthCallbackPage(false, "Code OAuth manquant", targetOrigin), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  try {
    const tokenPayload = await exchangeCodeForToken(request, env, code);
    const token = {
      refresh_token: tokenPayload.refresh_token || "",
      access_token: tokenPayload.access_token || "",
      expires_at: Date.now() + (Number(tokenPayload.expires_in || 3600) * 1000),
      token_type: tokenPayload.token_type || "Bearer",
      scope: tokenPayload.scope || DEFAULT_SCOPE
    };
    const previous = await getStoredToken(env, sessionId);
    if (!token.refresh_token && previous?.refresh_token) {
      token.refresh_token = previous.refresh_token;
    }
    await storeToken(env, sessionId, token);
    return new Response(renderOAuthCallbackPage(true, "OK", targetOrigin), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": buildSessionCookie(sessionId)
      }
    });
  } catch (err) {
    return new Response(renderOAuthCallbackPage(false, err?.message || "OAuth echoue", targetOrigin), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}

export default {
  async fetch(request, env) {
    const cors = corsMeta(request);
    if (!cors.allowed) {
      return new Response("Forbidden origin", { status: 403, headers: cors.headers });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors.headers });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    if (request.method === "GET" && path === "/oauth/start") {
      if (!env?.YOUTUBE_CLIENT_ID || !env?.YOUTUBE_CLIENT_SECRET) {
        return new Response("YouTube OAuth env missing", { status: 500 });
      }
      return handleOAuthStart(request, env);
    }

    if (request.method === "GET" && path === "/oauth/callback") {
      return handleOAuthCallback(request, env);
    }

    if (request.method === "POST" && path === "/auth/status") {
      await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request);
      if (!sessionId) {
        return jsonResponse(cors.headers, { connected: false, hasChannel: false, channels: [], selectedChannelId: "" });
      }
      const accessToken = await getValidAccessToken(request, env, sessionId).catch(() => null);
      if (!accessToken) {
        await setSelectedChannelId(env, sessionId, "");
        return jsonResponse(cors.headers, {
          connected: false,
          hasChannel: false,
          channels: [],
          selectedChannelId: ""
        });
      }
      const channels = await listOwnedChannels(accessToken).catch(() => []);
      let selectedChannelId = await getSelectedChannelId(env, sessionId);
      if (selectedChannelId && !channels.some(ch => ch.id === selectedChannelId)) {
        selectedChannelId = "";
      }
      if (!selectedChannelId && channels.length) {
        selectedChannelId = channels[0].id;
      }
      await setSelectedChannelId(env, sessionId, selectedChannelId);
      return jsonResponse(cors.headers, {
        connected: true,
        hasChannel: channels.length > 0,
        channels,
        selectedChannelId
      }, 200, { "Set-Cookie": buildSessionCookie(sessionId) });
    }

    if (request.method === "POST" && path === "/auth/channels") {
      await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request);
      if (!sessionId) {
        return jsonResponse(cors.headers, { connected: false, hasChannel: false, channels: [], selectedChannelId: "" });
      }
      const accessToken = await getValidAccessToken(request, env, sessionId).catch(() => null);
      if (!accessToken) {
        await setSelectedChannelId(env, sessionId, "");
        return jsonResponse(cors.headers, {
          connected: false,
          hasChannel: false,
          channels: [],
          selectedChannelId: ""
        });
      }
      const channels = await listOwnedChannels(accessToken).catch(() => []);
      let selectedChannelId = await getSelectedChannelId(env, sessionId);
      if (selectedChannelId && !channels.some(ch => ch.id === selectedChannelId)) {
        selectedChannelId = "";
      }
      if (!selectedChannelId && channels.length) {
        selectedChannelId = channels[0].id;
      }
      await setSelectedChannelId(env, sessionId, selectedChannelId);
      return jsonResponse(cors.headers, {
        connected: true,
        hasChannel: channels.length > 0,
        channels,
        selectedChannelId
      }, 200, { "Set-Cookie": buildSessionCookie(sessionId) });
    }

    if (request.method === "POST" && path === "/auth/channel/select") {
      const body = await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request);
      const channelId = String(body?.channelId || "").trim();
      if (!sessionId) return errorResponse(cors.headers, 401, "session requise");
      if (!channelId) return errorResponse(cors.headers, 400, "channelId requis");
      const accessToken = await getValidAccessToken(request, env, sessionId).catch(() => null);
      if (!accessToken) return errorResponse(cors.headers, 401, "Connexion YouTube requise");
      const channels = await listOwnedChannels(accessToken);
      if (!channels.some(ch => ch.id === channelId)) {
        return errorResponse(cors.headers, 400, "Chaîne invalide pour cet utilisateur");
      }
      await setSelectedChannelId(env, sessionId, channelId);
      return jsonResponse(cors.headers, {
        connected: true,
        hasChannel: channels.length > 0,
        channels,
        selectedChannelId: channelId
      }, 200, { "Set-Cookie": buildSessionCookie(sessionId) });
    }

    if (request.method === "POST" && path === "/auth/disconnect") {
      await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request);
      if (!sessionId) return jsonResponse(cors.headers, { connected: false }, 200, { "Set-Cookie": buildSessionCookie("", 0) });
      await clearToken(env, sessionId);
      await setSelectedChannelId(env, sessionId, "");
      return jsonResponse(cors.headers, { connected: false }, 200, { "Set-Cookie": buildSessionCookie("", 0) });
    }

    if (request.method === "POST" && path === "/videos/upload") {
      const form = await request.formData().catch(() => null);
      if (!form) return errorResponse(cors.headers, 400, "Corps invalide");
      const sessionId = resolveSessionId(request);
      if (!sessionId) return errorResponse(cors.headers, 401, "session requise");
      const accessToken = await getValidAccessToken(request, env, sessionId).catch(() => null);
      if (!accessToken) return errorResponse(cors.headers, 401, "Connexion YouTube requise");
      const channels = await listOwnedChannels(accessToken).catch(() => []);
      if (!channels.length) {
        return errorResponse(cors.headers, 400, "Aucune chaîne YouTube disponible");
      }
      const selectedChannelId = (String(form.get("channelId") || "").trim() || await getSelectedChannelId(env, sessionId));
      if (selectedChannelId && !channels.some(ch => ch.id === selectedChannelId)) {
        return errorResponse(cors.headers, 400, "Chaîne YouTube non disponible");
      }
      const videoFile = form.get("video");
      if (!videoFile || typeof videoFile.arrayBuffer !== "function") {
        return errorResponse(cors.headers, 400, "Video manquante");
      }
      try {
        const videoResp = await uploadVideo(accessToken, {
          title: String(form.get("title") || "Document"),
          description: String(form.get("description") || ""),
          categoryId: String(form.get("categoryId") || "28"),
          privacyStatus: String(form.get("privacyStatus") || "unlisted"),
          madeForKids: String(form.get("madeForKids") || "true") === "true",
          videoFile
        });
        const videoId = videoResp?.id || "";
        let captions = null;
        const captionsFile = form.get("captions");
        if (videoId && captionsFile && typeof captionsFile.arrayBuffer === "function") {
          captions = await uploadCaptions(accessToken, {
            videoId,
            language: String(form.get("language") || "fr"),
            captionsFile
          });
        }
        return jsonResponse(cors.headers, {
          videoId,
          videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
          captionsId: captions?.id || ""
        });
      } catch (err) {
        return errorResponse(cors.headers, 502, err?.message || "Publication impossible");
      }
    }

    return new Response("Not found", { status: 404, headers: cors.headers });
  }
};
