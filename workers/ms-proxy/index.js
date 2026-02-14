const ALLOWED_ORIGINS = [
  "https://gotoolkit.web.app",
  "https://gotoolkit.workers.dev",
  "https://sherpa-5938b.firebaseapp.com"
];

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
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
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (!allowLocal) headers["Vary"] = "Origin";
  return { origin, allowLocal, headers };
}

function jsonResponse(corsHeaders, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
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
  return `microsoft-device:${deviceId}`;
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

async function readToken(env, deviceId) {
  if (!env?.MICROSOFT_OAUTH || !deviceId) return null;
  const raw = await env.MICROSOFT_OAUTH.get(getDeviceKey(deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function writeToken(env, deviceId, value) {
  if (!env?.MICROSOFT_OAUTH || !deviceId || !value) return;
  await env.MICROSOFT_OAUTH.put(getDeviceKey(deviceId), JSON.stringify(value));
}

async function clearToken(env, deviceId) {
  if (!env?.MICROSOFT_OAUTH || !deviceId) return;
  await env.MICROSOFT_OAUTH.delete(getDeviceKey(deviceId));
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

async function getValidAccessToken(request, env, deviceId) {
  const stored = normalizeStoredToken(await readToken(env, deviceId));
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
  await writeToken(env, deviceId, next);
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
  const deviceId = (url.searchParams.get("deviceId") || "").trim();
  const origin = (url.searchParams.get("origin") || "").trim();
  if (!deviceId) return new Response("Missing deviceId", { status: 400 });

  const state = encodeState({ deviceId, origin });
  const authUrl = new URL(MICROSOFT_AUTH_URL);
  authUrl.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID || "");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", DEFAULT_SCOPE);
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim();
  const oauthError = (url.searchParams.get("error_description") || url.searchParams.get("error") || "").trim();
  const state = decodeState(url.searchParams.get("state") || "");
  const deviceId = String(state.deviceId || "").trim();
  const targetOrigin = String(state.origin || "").trim();

  if (oauthError) {
    return new Response(renderOAuthCallbackPage(false, oauthError, targetOrigin), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  if (!code || !deviceId) {
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
    const previous = normalizeStoredToken(await readToken(env, deviceId));
    if (!nextToken.refresh_token && previous.refresh_token) {
      nextToken.refresh_token = previous.refresh_token;
    }
    await writeToken(env, deviceId, nextToken);
    return new Response(renderOAuthCallbackPage(true, "OK", targetOrigin), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
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
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const token = await getValidAccessToken(request, env, deviceId).catch(() => null);
      if (!token?.access_token) {
        return jsonResponse(cors.headers, { connected: false, accountEmail: "", accountName: "" });
      }
      return jsonResponse(cors.headers, {
        connected: true,
        accountEmail: token.user_email || "",
        accountName: token.user_name || ""
      });
    }

    if (request.method === "POST" && path === "/auth/disconnect") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      await clearToken(env, deviceId);
      return jsonResponse(cors.headers, { connected: false });
    }

    if (request.method === "POST" && path === "/mail/draft/create") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      const subject = String(body?.subject || "Document").trim() || "Document";
      const html = normalizeHtmlInput(body?.html, body?.text);
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      if (!html.trim()) return errorResponse(cors.headers, 400, "Contenu HTML requis");

      const token = await getValidAccessToken(request, env, deviceId).catch(() => null);
      if (!token?.access_token) return errorResponse(cors.headers, 401, "Connexion Outlook requise");

      try {
        const draft = await graphApiFetch(token.access_token, "/me/messages", {
          method: "POST",
          body: {
            subject,
            body: {
              contentType: "HTML",
              content: html
            }
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
