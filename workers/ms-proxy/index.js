const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.workers.dev"
];

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const SESSION_COOKIE_NAME = "gt_ms_sid";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const OAUTH_PROVIDER = "microsoft";
const DEFAULT_SCOPE = "offline_access User.Read Mail.ReadWrite";

function normalizeOrigin(origin) {
  return (origin || "").trim();
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  return origin.startsWith("http://localhost")
    || origin.startsWith("http://127.")
    || origin.startsWith("http://192.168.");
}

function corsMeta(request) {
  const origin = normalizeOrigin(request.headers.get("Origin"));
  const allowLocal = isLocalOrigin(origin);
  const defaultOrigin = ALLOWED_ORIGINS[0];
  const corsOrigin = allowLocal
    ? origin || "*"
    : ALLOWED_ORIGINS.includes(origin) ? origin : defaultOrigin;
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
  if (!allowLocal) headers["Vary"] = "Origin";
  return { origin, allowLocal, headers };
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

function getDeviceKey(deviceId) {
  return `microsoft-session:${deviceId}`;
}

function generateOpaqueSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
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

async function readToken(env, sessionId) {
  if (!env?.OAUTH_DB || !sessionId) return null;
  const key = getDeviceKey(sessionId);
  let raw = null;
  try {
    const row = await env.OAUTH_DB
      .prepare("SELECT payload FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2 LIMIT 1")
      .bind(OAUTH_PROVIDER, key)
      .first();
    raw = row?.payload ? String(row.payload) : null;
  } catch (err) {
    console.warn("microsoft oauth d1 read failed", err);
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
  const key = getDeviceKey(sessionId);
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
    console.warn("microsoft oauth d1 write failed", err);
  }
}

async function clearToken(env, sessionId) {
  if (!env?.OAUTH_DB || !sessionId) return;
  const key = getDeviceKey(sessionId);
  try {
    await env.OAUTH_DB
      .prepare("DELETE FROM oauth_sessions WHERE provider = ?1 AND session_key = ?2")
      .bind(OAUTH_PROVIDER, key)
      .run();
  } catch (err) {
    console.warn("microsoft oauth d1 delete failed", err);
  }
}

async function exchangeCodeForToken(request, env, code) {
  const form = new URLSearchParams();
  form.set("client_id", env.MICROSOFT_CLIENT_ID || "");
  form.set("client_secret", env.MICROSOFT_CLIENT_SECRET || "");
  form.set("grant_type", "authorization_code");
  form.set("code", code || "");
  form.set("redirect_uri", getRedirectUri(request));
  form.set("scope", DEFAULT_SCOPE);

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Token exchange failed: ${detail}`);
  }
  return payload;
}

async function refreshAccessToken(request, env, refreshToken) {
  const form = new URLSearchParams();
  form.set("client_id", env.MICROSOFT_CLIENT_ID || "");
  form.set("client_secret", env.MICROSOFT_CLIENT_SECRET || "");
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken || "");
  form.set("redirect_uri", getRedirectUri(request));
  form.set("scope", DEFAULT_SCOPE);

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Token refresh failed: ${detail}`);
  }
  return payload;
}

function normalizeStoredToken(raw) {
  const token = raw && typeof raw === "object" ? raw : {};
  return {
    access_token: String(token.access_token || "").trim(),
    refresh_token: String(token.refresh_token || "").trim(),
    token_type: String(token.token_type || "Bearer").trim() || "Bearer",
    scope: String(token.scope || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE,
    expires_at: Number(token.expires_at || 0),
    user_email: String(token.user_email || "").trim(),
    user_name: String(token.user_name || "").trim()
  };
}

async function graphApiFetch(accessToken, path, options = {}) {
  const response = await fetch(`${GRAPH_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = payload?.error?.message || payload?.error_description || `Microsoft Graph error (${response.status})`;
    throw new Error(msg);
  }
  return payload;
}

async function getValidAccessToken(request, env, sessionId) {
  const stored = normalizeStoredToken(await readToken(env, sessionId));
  if (!stored.access_token) return null;
  if (stored.expires_at > Date.now() + 30_000) {
    return stored;
  }
  if (!stored.refresh_token) return null;
  const refreshed = await refreshAccessToken(request, env, stored.refresh_token);
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
    source: "gotoolkit-microsoft-oauth",
    ok,
    error: ok ? "" : safe
  });
  const normalizedTargetOrigin = String(targetOrigin || "").trim() || "*";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Microsoft OAuth</title></head><body><script>
  (function () {
    try {
      if (window.opener) {
        window.opener.postMessage(${payload}, ${JSON.stringify(normalizedTargetOrigin)});
      }
    } catch (err) {}
    window.close();
    document.body.textContent = ${JSON.stringify(ok ? "Connexion Outlook terminee." : `Erreur: ${safe}`)};
  })();
  </script></body></html>`;
}

async function handleOAuthStart(request, env) {
  const url = new URL(request.url);
  const origin = (url.searchParams.get("origin") || "").trim();
  const sessionId = getSessionIdFromRequest(request) || generateOpaqueSessionId();

  const state = encodeState({ sessionId, origin });
  const authUrl = new URL(MICROSOFT_AUTH_URL);
  authUrl.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID || "");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", DEFAULT_SCOPE);
  authUrl.searchParams.set("state", state);
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
  const sessionId = String(state.sessionId || "").trim() || getSessionIdFromRequest(request);
  const targetOrigin = String(state.origin || "").trim();

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
      throw new Error("Token Microsoft introuvable");
    }
    let profile = {};
    try {
      profile = await graphApiFetch(accessToken, "/me", { method: "GET" });
    } catch (err) {
      profile = {};
    }
    const nextToken = {
      access_token: accessToken,
      refresh_token: String(tokenPayload.refresh_token || "").trim(),
      token_type: String(tokenPayload.token_type || "Bearer").trim() || "Bearer",
      scope: String(tokenPayload.scope || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE,
      expires_at: Date.now() + (Number(tokenPayload.expires_in || 3600) * 1000),
      user_email: String(profile?.mail || profile?.userPrincipalName || "").trim(),
      user_name: String(profile?.displayName || "").trim()
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

function normalizeHtmlInput(html, text) {
  const rawHtml = String(html || "");
  if (rawHtml.trim()) return rawHtml;
  const rawText = String(text || "");
  if (!rawText.trim()) return "";
  return `<pre>${rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;
}

function normalizeInlineImageAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  const allowedMime = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif"]);
  const attachments = [];
  for (const item of rawAttachments.slice(0, 24)) {
    const mimeType = String(item?.mimeType || "").trim().toLowerCase();
    const contentBase64 = String(item?.contentBase64 || "").replace(/\s+/g, "");
    if (!allowedMime.has(mimeType) || !contentBase64) continue;
    const defaultExt = mimeType === "image/png" ? "png" : (mimeType === "image/gif" ? "gif" : "jpg");
    const fileName = String(item?.fileName || `image-${attachments.length + 1}.${defaultExt}`).replace(/[\r\n]+/g, " ").trim() || `image-${attachments.length + 1}.${defaultExt}`;
    const contentId = String(item?.contentId || `gotoolkit-img-${Date.now()}-${attachments.length}@local`).replace(/[\r\n]+/g, " ").trim();
    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: fileName,
      contentType: mimeType,
      contentBytes: contentBase64,
      isInline: true,
      contentId,
    });
  }
  return attachments;
}

export default {
  async fetch(request, env) {
    const cors = corsMeta(request);
    if (!cors.allowLocal && !ALLOWED_ORIGINS.includes(cors.origin)) {
      return new Response("Forbidden origin", { status: 403, headers: cors.headers });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors.headers });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    if (request.method === "GET" && path === "/oauth/start") {
      if (!env?.MICROSOFT_CLIENT_ID || !env?.MICROSOFT_CLIENT_SECRET) {
        return new Response("Microsoft OAuth env missing", { status: 500 });
      }
      return handleOAuthStart(request, env);
    }

    if (request.method === "GET" && path === "/oauth/callback") {
      return handleOAuthCallback(request, env);
    }

    if (request.method === "POST" && path === "/auth/status") {
      await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request);
      if (!sessionId) return jsonResponse(cors.headers, { connected: false, accountEmail: "", accountName: "" });
      const token = await getValidAccessToken(request, env, sessionId).catch(() => null);
      if (!token?.access_token) {
        return jsonResponse(cors.headers, { connected: false, accountEmail: "", accountName: "" });
      }
      return jsonResponse(cors.headers, {
        connected: true,
        accountEmail: token.user_email || "",
        accountName: token.user_name || ""
      }, 200, { "Set-Cookie": buildSessionCookie(sessionId) });
    }

    if (request.method === "POST" && path === "/auth/disconnect") {
      await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request);
      if (!sessionId) return jsonResponse(cors.headers, { connected: false }, 200, { "Set-Cookie": buildSessionCookie("", 0) });
      await clearToken(env, sessionId);
      return jsonResponse(cors.headers, { connected: false }, 200, { "Set-Cookie": buildSessionCookie("", 0) });
    }

    if (request.method === "POST" && path === "/mail/draft/create") {
      const body = await request.json().catch(() => ({}));
      const sessionId = resolveSessionId(request);
      const subject = String(body?.subject || "Document").trim() || "Document";
      const html = normalizeHtmlInput(body?.html, body?.text);
      const attachments = normalizeInlineImageAttachments(body?.attachments);
      if (!sessionId) return errorResponse(cors.headers, 401, "session requise");
      if (!html.trim()) return errorResponse(cors.headers, 400, "Contenu HTML requis");

      const token = await getValidAccessToken(request, env, sessionId).catch(() => null);
      if (!token?.access_token) return errorResponse(cors.headers, 401, "Connexion Outlook requise");

      try {
        const draft = await graphApiFetch(token.access_token, "/me/messages", {
          method: "POST",
          body: {
            subject,
            body: {
              contentType: "HTML",
              content: html
            },
            ...(attachments.length ? { attachments } : {})
          }
        });
        const draftId = String(draft?.id || "").trim();
        const draftUrl = String(draft?.webLink || "").trim() || (draftId ? `https://outlook.office.com/mail/id/${encodeURIComponent(draftId)}` : "");
        if (!draftId && !draftUrl) {
          return errorResponse(cors.headers, 502, "Création du brouillon échouée");
        }
        return jsonResponse(cors.headers, {
          ok: true,
          draftId,
          draftUrl,
          webUrl: draftUrl
        });
      } catch (err) {
        return errorResponse(cors.headers, 502, err?.message || "Création du brouillon Outlook impossible");
      }
    }

    return new Response("Not found", { status: 404, headers: cors.headers });
  }
};
