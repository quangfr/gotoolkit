const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.workers.dev"
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_CAPTIONS_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/captions";
const DEFAULT_SCOPE = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl"
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
  return `yt-device:${deviceId}`;
}

function getSelectedChannelKey(deviceId) {
  return `yt-channel:${deviceId}`;
}

function normalizeLanguage(raw) {
  const value = String(raw || "").trim().toLowerCase().replace("_", "-");
  const root = value.split("-")[0];
  return root || "fr";
}

async function getStoredToken(env, deviceId) {
  if (!env?.YOUTUBE_OAUTH || !deviceId) return null;
  const raw = await env.YOUTUBE_OAUTH.get(getTokenKey(deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function storeToken(env, deviceId, token) {
  if (!env?.YOUTUBE_OAUTH || !deviceId || !token) return;
  await env.YOUTUBE_OAUTH.put(getTokenKey(deviceId), JSON.stringify(token));
}

async function clearToken(env, deviceId) {
  if (!env?.YOUTUBE_OAUTH || !deviceId) return;
  await env.YOUTUBE_OAUTH.delete(getTokenKey(deviceId));
}

async function getSelectedChannelId(env, deviceId) {
  if (!env?.YOUTUBE_OAUTH || !deviceId) return "";
  return String((await env.YOUTUBE_OAUTH.get(getSelectedChannelKey(deviceId))) || "").trim();
}

async function setSelectedChannelId(env, deviceId, channelId) {
  if (!env?.YOUTUBE_OAUTH || !deviceId) return;
  const normalized = String(channelId || "").trim();
  if (!normalized) {
    await env.YOUTUBE_OAUTH.delete(getSelectedChannelKey(deviceId));
    return;
  }
  await env.YOUTUBE_OAUTH.put(getSelectedChannelKey(deviceId), normalized);
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

async function getValidAccessToken(request, env, deviceId) {
  const stored = await getStoredToken(env, deviceId);
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
  await storeToken(env, deviceId, merged);
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
  const deviceId = (url.searchParams.get("deviceId") || "").trim();
  const origin = (url.searchParams.get("origin") || "").trim();
  if (!deviceId) {
    return new Response("Missing deviceId", { status: 400 });
  }
  const statePayload = {
    deviceId,
    origin
  };
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", env.YOUTUBE_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DEFAULT_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", btoa(JSON.stringify(statePayload)));
  return Response.redirect(authUrl.toString(), 302);
}

function renderOAuthCallbackPage(ok, message, targetOrigin) {
  const safe = String(message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const payload = JSON.stringify({
    source: "gotoolkit-youtube-oauth",
    ok,
    error: ok ? "" : safe
  });
  const normalizedTargetOrigin = (String(targetOrigin || "").trim() || "*");
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
  const deviceId = (state.deviceId || "").trim();
  const targetOrigin = (state.origin || "").trim();
  if (!code || !deviceId) {
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
    const previous = await getStoredToken(env, deviceId);
    if (!token.refresh_token && previous?.refresh_token) {
      token.refresh_token = previous.refresh_token;
    }
    await storeToken(env, deviceId, token);
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
      if (!env?.YOUTUBE_CLIENT_ID || !env?.YOUTUBE_CLIENT_SECRET) {
        return new Response("YouTube OAuth env missing", { status: 500 });
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
      const accessToken = await getValidAccessToken(request, env, deviceId).catch(() => null);
      if (!accessToken) {
        await setSelectedChannelId(env, deviceId, "");
        return jsonResponse(cors.headers, {
          connected: false,
          hasChannel: false,
          channels: [],
          selectedChannelId: ""
        });
      }
      const channels = await listOwnedChannels(accessToken).catch(() => []);
      let selectedChannelId = await getSelectedChannelId(env, deviceId);
      if (selectedChannelId && !channels.some(ch => ch.id === selectedChannelId)) {
        selectedChannelId = "";
      }
      if (!selectedChannelId && channels.length) {
        selectedChannelId = channels[0].id;
      }
      await setSelectedChannelId(env, deviceId, selectedChannelId);
      return jsonResponse(cors.headers, {
        connected: true,
        hasChannel: channels.length > 0,
        channels,
        selectedChannelId
      });
    }

    if (request.method === "POST" && path === "/auth/channels") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const accessToken = await getValidAccessToken(request, env, deviceId).catch(() => null);
      if (!accessToken) {
        await setSelectedChannelId(env, deviceId, "");
        return jsonResponse(cors.headers, {
          connected: false,
          hasChannel: false,
          channels: [],
          selectedChannelId: ""
        });
      }
      const channels = await listOwnedChannels(accessToken).catch(() => []);
      let selectedChannelId = await getSelectedChannelId(env, deviceId);
      if (selectedChannelId && !channels.some(ch => ch.id === selectedChannelId)) {
        selectedChannelId = "";
      }
      if (!selectedChannelId && channels.length) {
        selectedChannelId = channels[0].id;
      }
      await setSelectedChannelId(env, deviceId, selectedChannelId);
      return jsonResponse(cors.headers, {
        connected: true,
        hasChannel: channels.length > 0,
        channels,
        selectedChannelId
      });
    }

    if (request.method === "POST" && path === "/auth/channel/select") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      const channelId = String(body?.channelId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      if (!channelId) return errorResponse(cors.headers, 400, "channelId requis");
      const accessToken = await getValidAccessToken(request, env, deviceId).catch(() => null);
      if (!accessToken) return errorResponse(cors.headers, 401, "Connexion YouTube requise");
      const channels = await listOwnedChannels(accessToken);
      if (!channels.some(ch => ch.id === channelId)) {
        return errorResponse(cors.headers, 400, "Chaîne invalide pour cet utilisateur");
      }
      await setSelectedChannelId(env, deviceId, channelId);
      return jsonResponse(cors.headers, {
        connected: true,
        hasChannel: channels.length > 0,
        channels,
        selectedChannelId: channelId
      });
    }

    if (request.method === "POST" && path === "/auth/disconnect") {
      const body = await request.json().catch(() => ({}));
      const deviceId = String(body?.deviceId || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      await clearToken(env, deviceId);
      await setSelectedChannelId(env, deviceId, "");
      return jsonResponse(cors.headers, { connected: false });
    }

    if (request.method === "POST" && path === "/videos/upload") {
      const form = await request.formData().catch(() => null);
      if (!form) return errorResponse(cors.headers, 400, "Corps invalide");
      const deviceId = String(form.get("deviceId") || "").trim();
      if (!deviceId) return errorResponse(cors.headers, 400, "deviceId requis");
      const accessToken = await getValidAccessToken(request, env, deviceId).catch(() => null);
      if (!accessToken) return errorResponse(cors.headers, 401, "Connexion YouTube requise");
      const channels = await listOwnedChannels(accessToken).catch(() => []);
      if (!channels.length) {
        return errorResponse(cors.headers, 400, "Aucune chaîne YouTube disponible");
      }
      const selectedChannelId = (String(form.get("channelId") || "").trim() || await getSelectedChannelId(env, deviceId));
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
