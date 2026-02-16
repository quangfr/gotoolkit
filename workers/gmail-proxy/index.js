const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.workers.dev"
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
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

function getTokenKey(deviceId) {
  return `gmail-device:${deviceId}`;
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

async function readToken(env, deviceId) {
  if (!env?.GMAIL_OAUTH || !deviceId) return null;
  const raw = await env.GMAIL_OAUTH.get(getTokenKey(deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function writeToken(env, deviceId, value) {
  if (!env?.GMAIL_OAUTH || !deviceId || !value) return;
  await env.GMAIL_OAUTH.put(getTokenKey(deviceId), JSON.stringify(value));
}

async function clearToken(env, deviceId) {
  if (!env?.GMAIL_OAUTH || !deviceId) return;
  await env.GMAIL_OAUTH.delete(getTokenKey(deviceId));
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

async function getValidToken(env, deviceId) {
  const stored = normalizeStoredToken(await readToken(env, deviceId));
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
  await writeToken(env, deviceId, next);
  return next;
}

function renderOAuthCallbackPage(ok, message, targetOrigin) {
  const safe = String(message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const payload = JSON.stringify({
    source: "gotoolkit-gmail-oauth",
    ok,
    error: ok ? "" : safe
  });
  const normalizedTargetOrigin = String(targetOrigin || "").trim() || "*";
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
  const deviceId = (url.searchParams.get("deviceId") || "").trim();
  const origin = (url.searchParams.get("origin") || "").trim();
  if (!deviceId) {
    return new Response("Missing deviceId", { status: 400 });
  }
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", env.GMAIL_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DEFAULT_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", encodeState({ deviceId, origin }));
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

function buildMimeMessage(options = {}) {
  const from = String(options?.from || "").trim();
  const subject = String(options?.subject || "Document").trim() || "Document";
  const html = String(options?.html || "").trim();
  const text = String(options?.text || htmlToText(html || "")).trim();
  const boundary = `gotoolkit-alt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const lines = [];
  if (from) lines.push(`From: ${from}`);
  lines.push("To: ");
  lines.push(`Subject: =?UTF-8?B?${base64UrlEncode(subject).replace(/-/g, "+").replace(/_/g, "/")}?=`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/alternative; boundary=\"${boundary}\"`);
  lines.push("");
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
    if (!cors.allowLocal && !ALLOWED_ORIGINS.includes(cors.origin)) {
      return new Response("Forbidden origin", { status: 403, headers: cors.headers });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors.headers });
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
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const token = await getValidToken(env, deviceId).catch(() => null);
      if (!token?.access_token) {
        return jsonResponse(cors.headers, { connected: false, accountEmail: "", accountName: "" });
      }
      return jsonResponse(cors.headers, {
        connected: true,
        accountEmail: token.account_email || "",
        accountName: token.account_name || ""
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
      const html = String(body?.html || "");
      const text = String(body?.text || "");
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      if (!String(html || "").trim()) return errorResponse(cors.headers, 400, "Contenu HTML requis");

      const token = await getValidToken(env, deviceId).catch(() => null);
      if (!token?.access_token) return errorResponse(cors.headers, 401, "Connexion Gmail requise");

      try {
        const rawMime = buildMimeMessage({
          from: token.account_email || "",
          subject,
          html,
          text
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
