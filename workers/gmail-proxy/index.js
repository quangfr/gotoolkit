const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.web.app"
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const SESSION_COOKIE_NAME = "gt_gmail_sid";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const OAUTH_PROVIDER = "gmail";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SCOPE = [
  "https://www.googleapis.com/auth/gmail.compose",
  "openid",
  "email",
  "profile"
].join(" ");

function normalizeOrigin(origin) {
  return (origin || "").trim();
}

function isLocalOrigin(origin) {
  if (!origin) return false;
  return /^http:\/\/localhost(?::\d+)?$/i.test(origin)
    || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
}

function corsMeta(request) {
  const origin = normalizeOrigin(request.headers.get("Origin"));
  const hasOrigin = Boolean(origin);
  const allowLocal = isLocalOrigin(origin);
  const allowListed = ALLOWED_ORIGINS.includes(origin);
  const isAllowedOrigin = allowLocal || allowListed;
  const defaultOrigin = ALLOWED_ORIGINS[0];
  const corsOrigin = isAllowedOrigin ? origin : defaultOrigin;
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
  if (!allowLocal) headers["Vary"] = "Origin";
  return { origin, hasOrigin, isAllowedOrigin, headers };
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
  return `gmail-session:${deviceId}`;
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
  return `gmail-oauth-state:${nonce}`;
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

function resolveSessionId(request, body = null) {
  const cookieSid = getSessionIdFromRequest(request);
  if (cookieSid) return cookieSid;
  return "";
}

function encodeState(payload) {
  return btoa(JSON.stringify(payload || {}));
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

function base64UrlEncode(raw) {
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function encodeQuotedPrintableUtf8(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b === 13) {
      out += "\r";
      continue;
    }
    if (b === 10) {
      out += "\n";
      continue;
    }
    if ((b >= 33 && b <= 60) || (b >= 62 && b <= 126) || b === 9 || b === 32) {
      out += String.fromCharCode(b);
      continue;
    }
    out += `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

function sanitizeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function chunkBase64(base64) {
  const clean = String(base64 || "").replace(/\s+/g, "");
  const lines = [];
  for (let i = 0; i < clean.length; i += 76) {
    lines.push(clean.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function normalizeAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  const allowedMime = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif"]);
  const result = [];
  for (const item of rawAttachments.slice(0, 24)) {
    const mimeType = String(item?.mimeType || "").trim().toLowerCase();
    const contentBase64 = String(item?.contentBase64 || "").replace(/\s+/g, "");
    if (!allowedMime.has(mimeType) || !contentBase64) continue;
    const defaultExt = mimeType === "image/png" ? "png" : (mimeType === "image/gif" ? "gif" : "jpg");
    const fileName = sanitizeHeaderValue(item?.fileName || `image-${result.length + 1}.${defaultExt}`) || `image-${result.length + 1}.${defaultExt}`;
    const contentId = sanitizeHeaderValue(item?.contentId || `gotoolkit-img-${Date.now()}-${result.length}@local`);
    result.push({
      fileName,
      mimeType,
      contentBase64,
      contentId,
    });
  }
  return result;
}

function normalizeStoredToken(raw) {
  const token = raw && typeof raw === "object" ? raw : {};
  return {
    access_token: String(token.access_token || "").trim(),
    refresh_token: String(token.refresh_token || "").trim(),
    token_type: String(token.token_type || "Bearer").trim() || "Bearer",
    scope: String(token.scope || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE,
    expires_at: Number(token.expires_at || 0),
    account_email: String(token.account_email || "").trim(),
    account_name: String(token.account_name || "").trim()
  };
}

async function readToken(env, sessionId) {
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
    console.warn("gmail oauth d1 read failed", err);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function writeToken(env, sessionId, value) {
  if (!env?.OAUTH_DB || !sessionId || !value) return;
  const key = getTokenKey(sessionId);
  const payload = JSON.stringify(value);
  try {
    await env.OAUTH_DB
      .prepare(`INSERT INTO oauth_sessions (provider, session_key, payload, updated_at, expires_at)
                VALUES (?1, ?2, ?3, ?4, NULL)
                ON CONFLICT(provider, session_key)
                DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
      .bind(OAUTH_PROVIDER, key, payload, new Date().toISOString())
      .run();
  } catch (err) {
    console.warn("gmail oauth d1 write failed", err);
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
    console.warn("gmail oauth d1 delete failed", err);
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
    console.warn("gmail oauth state write failed", err);
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
    console.warn("gmail oauth state read failed", err);
    return null;
  }
  try {
    await env.OAUTH_DB
      .prepare("DELETE FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2")
      .bind(OAUTH_PROVIDER, key)
      .run();
  } catch (err) {
    console.warn("gmail oauth state delete failed", err);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function exchangeCodeForToken(request, env, code) {
  const body = new URLSearchParams();
  body.set("code", code || "");
  body.set("client_id", env.GMAIL_CLIENT_ID || "");
  body.set("client_secret", env.GMAIL_CLIENT_SECRET || "");
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

async function refreshAccessToken(env, refreshToken) {
  const body = new URLSearchParams();
  body.set("client_id", env.GMAIL_CLIENT_ID || "");
  body.set("client_secret", env.GMAIL_CLIENT_SECRET || "");
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

async function fetchGoogleProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { email: "", name: "" };
  }
  return {
    email: String(payload?.email || "").trim(),
    name: String(payload?.name || payload?.given_name || "").trim()
  };
}

async function getValidToken(env, sessionId) {
  const stored = normalizeStoredToken(await readToken(env, sessionId));
  if (!stored.access_token) return null;
  if (stored.expires_at > Date.now() + 30_000) {
    return stored;
  }
  if (!stored.refresh_token) return null;
  const refreshed = await refreshAccessToken(env, stored.refresh_token);
  const next = {
    ...stored,
    access_token: String(refreshed.access_token || "").trim(),
    refresh_token: String(refreshed.refresh_token || stored.refresh_token || "").trim(),
    token_type: String(refreshed.token_type || stored.token_type || "Bearer").trim() || "Bearer",
    scope: String(refreshed.scope || stored.scope || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE,
    expires_at: Date.now() + (Number(refreshed.expires_in || 3600) * 1000)
  };
  await writeToken(env, sessionId, next);
  return next;
}

function renderOAuthCallbackPage(ok, message, targetOrigin) {
  const safe = String(message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const payload = JSON.stringify({
    source: "gotoolkit-gmail-oauth",
    ok,
    error: ok ? "" : safe
  });
  const normalizedTargetOrigin = normalizeTargetOrigin(targetOrigin);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Gmail OAuth</title></head><body><script>
  (function () {
    try {
      if (window.opener) {
        window.opener.postMessage(${payload}, ${JSON.stringify(normalizedTargetOrigin)});
      }
    } catch (err) {}
    window.close();
    document.body.textContent = ${JSON.stringify(ok ? "Connexion Gmail terminee." : `Erreur: ${safe}`)};
  })();
  </script></body></html>`;
}

async function handleOAuthStart(request, env) {
  const url = new URL(request.url);
  const origin = (url.searchParams.get("origin") || "").trim();
  if (!env?.OAUTH_DB) {
    console.warn("gmail oauth start failed: missing OAUTH_DB binding");
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
    return new Response("OAuth state storage unavailable: failed to persist state in D1 (gmail)", { status: 500 });
  }
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", env.GMAIL_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DEFAULT_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", encodeState({ nonce }));
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": buildSessionCookie(sessionId)
    }
  });
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim();
  const oauthError = (url.searchParams.get("error_description") || url.searchParams.get("error") || "").trim();
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

  if (oauthError) {
    return new Response(renderOAuthCallbackPage(false, oauthError, targetOrigin), {
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
    const accessToken = String(tokenPayload.access_token || "").trim();
    if (!accessToken) {
      throw new Error("Token Gmail introuvable");
    }
    const profile = await fetchGoogleProfile(accessToken).catch(() => ({ email: "", name: "" }));
    const nextToken = {
      access_token: accessToken,
      refresh_token: String(tokenPayload.refresh_token || "").trim(),
      token_type: String(tokenPayload.token_type || "Bearer").trim() || "Bearer",
      scope: String(tokenPayload.scope || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE,
      expires_at: Date.now() + (Number(tokenPayload.expires_in || 3600) * 1000),
      account_email: profile.email || "",
      account_name: profile.name || ""
    };
    const previous = normalizeStoredToken(await readToken(env, sessionId));
    if (!nextToken.refresh_token && previous.refresh_token) {
      nextToken.refresh_token = previous.refresh_token;
    }
    await writeToken(env, sessionId, nextToken);
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

function buildMimeMessage(options = {}) {
  const from = String(options?.from || "").trim();
  const subject = String(options?.subject || "Document").trim() || "Document";
  const html = String(options?.html || "").trim();
  const text = String(options?.text || htmlToText(html || "")).trim();
  const attachments = normalizeAttachments(options?.attachments);
  const hasAttachments = attachments.length > 0;
  const boundary = `gotoolkit-alt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const mixedBoundary = `gotoolkit-mixed-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const lines = [];
  if (from) lines.push(`From: ${from}`);
  lines.push("To: ");
  lines.push(`Subject: =?UTF-8?B?${base64UrlEncode(subject).replace(/-/g, "+").replace(/_/g, "/")}?=`);
  lines.push("MIME-Version: 1.0");
  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary=\"${mixedBoundary}\"`);
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary=\"${boundary}\"`);
  }
  lines.push("");
  if (hasAttachments) {
    lines.push(`--${mixedBoundary}`);
    lines.push(`Content-Type: multipart/alternative; boundary=\"${boundary}\"`);
    lines.push("");
  }
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: quoted-printable");
  lines.push("");
  lines.push(encodeQuotedPrintableUtf8(text));
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/html; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: quoted-printable");
  lines.push("");
  lines.push(encodeQuotedPrintableUtf8(html));
  lines.push("");
  lines.push(`--${boundary}--`);
  lines.push("");

  if (hasAttachments) {
    for (const attachment of attachments) {
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${attachment.mimeType}; name="${attachment.fileName}"`);
      lines.push(`Content-Disposition: inline; filename="${attachment.fileName}"`);
      lines.push("Content-Transfer-Encoding: base64");
      if (attachment.contentId) {
        lines.push(`Content-ID: <${attachment.contentId}>`);
      }
      lines.push("");
      lines.push(chunkBase64(attachment.contentBase64));
      lines.push("");
    }
    lines.push(`--${mixedBoundary}--`);
    lines.push("");
  }
  return lines.join("\r\n");
}

async function createGmailDraft(accessToken, payload = {}) {
  const response = await fetch(`${GMAIL_API_BASE}/drafts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Gmail error (${response.status})`;
    throw new Error(message);
  }
  return body;
}

function buildGmailDraftUrls(draft = {}) {
  const draftId = String(draft?.id || "").trim();
  const draftMessageId = String(draft?.message?.id || "").trim();
  const composeCandidates = [draftMessageId, draftId].filter(Boolean);
  const urls = composeCandidates.map((value) => `https://mail.google.com/mail/u/0/#drafts?compose=${encodeURIComponent(value)}`);
  return {
    draftId,
    draftMessageId,
    draftUrl: urls[0] || "",
    draftUrls: urls
  };
}

export default {
  async fetch(request, env) {
    const cors = corsMeta(request);
    if (request.method === "OPTIONS") {
      if (!cors.hasOrigin || !cors.isAllowedOrigin) {
        return new Response("Forbidden origin", { status: 403, headers: cors.headers });
      }
      return new Response(null, { headers: cors.headers });
    }
    if (cors.hasOrigin && !cors.isAllowedOrigin) {
      return new Response("Forbidden origin", { status: 403, headers: cors.headers });
    }
    if (!cors.hasOrigin && request.method !== "GET") {
      return new Response("Origin header required", { status: 403, headers: cors.headers });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    if (request.method === "GET" && path === "/oauth/start") {
      if (!env?.GMAIL_CLIENT_ID || !env?.GMAIL_CLIENT_SECRET) {
        return new Response("Gmail OAuth env missing", { status: 500 });
      }
      return handleOAuthStart(request, env);
    }

    if (request.method === "GET" && path === "/oauth/callback") {
      return handleOAuthCallback(request, env);
    }

    if (request.method === "POST" && path === "/auth/status") {
      const body = await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request, body);
      if (!sessionId) {
        return jsonResponse(cors.headers, { connected: false, accountEmail: "", accountName: "" });
      }
      const token = await getValidToken(env, sessionId).catch(() => null);
      if (!token?.access_token) {
        return jsonResponse(cors.headers, { connected: false, accountEmail: "", accountName: "" });
      }
      return jsonResponse(cors.headers, {
        connected: true,
        accountEmail: token.account_email || "",
        accountName: token.account_name || ""
      }, 200, { "Set-Cookie": buildSessionCookie(sessionId) });
    }

    if (request.method === "POST" && path === "/auth/disconnect") {
      const body = await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request, body);
      if (!sessionId) return jsonResponse(cors.headers, { connected: false });
      await clearToken(env, sessionId);
      return jsonResponse(cors.headers, { connected: false }, 200, { "Set-Cookie": buildSessionCookie("", 0) });
    }

    if (request.method === "POST" && path === "/mail/draft/create") {
      const body = await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request, body);
      const subject = String(body?.subject || "Document").trim() || "Document";
      const html = String(body?.html || "");
      const text = String(body?.text || "");
      const attachments = normalizeAttachments(body?.attachments);
      if (!sessionId) return errorResponse(cors.headers, 401, "session requise");
      if (!String(html || "").trim()) return errorResponse(cors.headers, 400, "Contenu HTML requis");

      const token = await getValidToken(env, sessionId).catch(() => null);
      if (!token?.access_token) return errorResponse(cors.headers, 401, "Connexion Gmail requise");

      try {
        const rawMime = buildMimeMessage({
          from: token.account_email || "",
          subject,
          html,
          text,
          attachments
        });
        const draft = await createGmailDraft(token.access_token, {
          message: { raw: base64UrlEncode(rawMime) }
        });
        const draftLinks = buildGmailDraftUrls(draft);
        if (!draftLinks.draftId && !draftLinks.draftMessageId) {
          return errorResponse(cors.headers, 502, "ID de brouillon Gmail introuvable");
        }
        return jsonResponse(cors.headers, {
          ok: true,
          draftId: draftLinks.draftId,
          draftMessageId: draftLinks.draftMessageId,
          draftUrl: draftLinks.draftUrl,
          draftUrls: draftLinks.draftUrls,
          webUrl: draftLinks.draftUrl
        });
      } catch (err) {
        return errorResponse(cors.headers, 502, err?.message || "Création du brouillon Gmail impossible");
      }
    }

    return new Response("Not found", { status: 404, headers: cors.headers });
  }
};
