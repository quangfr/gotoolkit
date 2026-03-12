const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "https://gotoolkit.fr",
  "https://gotoolkit.web.app",
  "https://www.gotoolkit.fr",
  "https://gotoolkit.workers.dev"
]);

function buildRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

function normalizeOriginValue(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  try {
    return new URL(candidate).origin;
  } catch {
    return candidate.replace(/\/+$/, "");
  }
}

function getHostnameFromOrigin(origin) {
  const candidate = String(origin || "").trim();
  if (!candidate) return "";
  try {
    return String(new URL(candidate).hostname || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function parseAllowedOrigins(env) {
  const fromEnv = String(env?.SHARE_ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => normalizeOriginValue(origin))
    .filter(Boolean);
  const merged = new Set([
    ...DEFAULT_ALLOWED_ORIGINS.map(origin => normalizeOriginValue(origin)),
    ...fromEnv
  ]);
  return Array.from(merged);
}

function isLocalAllowedOrigin(origin) {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(origin);
}

function resolveCors(request, env) {
  const allowedOrigins = parseAllowedOrigins(env);
  const origin = normalizeOriginValue(request.headers.get("Origin"));
  const allowLocal = isLocalAllowedOrigin(origin);
  const allowListed = Boolean(origin && allowedOrigins.includes(origin));
  const allowed = allowLocal || allowListed;
  const corsOrigin = allowed ? origin : "null";
  return { origin, corsOrigin, allowed, allowLocal, allowedOrigins };
}

export default {
  async fetch(request, env) {
    const requestId = String(request.headers.get("X-Debug-Request-Id") || "").trim() || buildRequestId();
    const requestUrl = new URL(request.url);
    const isEmbeddingsRoute = requestUrl.pathname.includes("/embeddings");
    const corsMeta = resolveCors(request, env);
    const corsOrigin = corsMeta.corsOrigin;

    if (!corsMeta.allowed) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "X-Debug-Request-Id": requestId,
          "Vary": "Origin"
        }
      });
    }

    if (request.method === "OPTIONS") {
      const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": requestedHeaders && requestedHeaders.trim()
            ? requestedHeaders
            : "Content-Type, x-app-token, x-client-id",
          "X-Debug-Request-Id": requestId,
          "Vary": "Origin"
        }
      });
    }

    if (request.method === "GET") {
      return forwardToOpenRouterModelsUser(request, env, corsOrigin);
    }

    if (request.method !== "POST") {
      return new Response("Only POST", {
        status: 405,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-app-token, x-client-id",
          "X-Debug-Request-Id": requestId,
          Allow: "GET, POST, OPTIONS",
          Vary: "Origin"
        }
      });
    }

    const ipAddress = request.headers.get("cf-connecting-ip") || "";
    if (env?.MY_RATE_LIMITER && typeof env.MY_RATE_LIMITER.limit === "function") {
      const { success } = await env.MY_RATE_LIMITER.limit({ key: ipAddress });
      if (!success) {
        return jsonError(
          corsOrigin,
          429,
          "RATE_LIMIT_EXCEEDED",
          "Too many requests, please wait a bit.",
          requestId
        );
      }
    }

    return forwardToOpenRouter(request, env, corsOrigin, { embeddings: isEmbeddingsRoute, requestId });
  }
};

async function forwardToOpenRouter(request, env, corsOrigin, options = {}) {
  const requestId = String(options?.requestId || "").trim() || buildRequestId();
  const raw = await request.text();
  const maxBytes = 2_500_000;

  if (raw.length > maxBytes) {
    return jsonError(corsOrigin, 413, "PAYLOAD_TOO_LARGE", "Payload too large.", requestId);
  }

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return jsonError(corsOrigin, 400, "BAD_JSON", "Invalid JSON payload.", requestId);
  }

  if (!env.OPENROUTER_API_KEY) {
    return jsonError(corsOrigin, 500, "MISSING_ENV", "OpenRouter API key missing.", requestId);
  }

  let upstreamResponse;
  const wantsStream = Boolean(payload && payload.stream);
  const acceptHeader = request.headers.get("Accept");
  const targetUrl = options.embeddings
    ? "https://openrouter.ai/api/v1/embeddings"
    : "https://openrouter.ai/api/v1/chat/completions";
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        ...(
          !options.embeddings && (wantsStream || acceptHeader)
            ? { Accept: acceptHeader || "text/event-stream" }
            : {}
        )
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("OpenRouter fetch failed", { requestId, error: String(error?.message || error || "") });
    return jsonError(
      corsOrigin,
      502,
      "UPSTREAM_UNAVAILABLE",
      "OpenRouter upstream unavailable.",
      requestId
    );
  }

  const headers = new Headers(upstreamResponse.headers);
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Debug-Request-Id", requestId);
  headers.set("Vary", "Origin");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers
  });
}

async function forwardToOpenRouterModelsUser(request, env, corsOrigin) {
  const requestId = String(request.headers.get("X-Debug-Request-Id") || "").trim() || buildRequestId();
  if (!env.OPENROUTER_API_KEY) {
    return jsonError(corsOrigin, 500, "MISSING_ENV", "OpenRouter API key missing.", requestId);
  }
  let upstreamResponse;
  try {
    upstreamResponse = await fetch("https://openrouter.ai/api/v1/models/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`
      }
    });
  } catch (error) {
    console.error("OpenRouter models fetch failed", { requestId, error: String(error?.message || error || "") });
    return jsonError(
      corsOrigin,
      502,
      "UPSTREAM_UNAVAILABLE",
      "OpenRouter upstream unavailable.",
      requestId
    );
  }
  const headers = new Headers(upstreamResponse.headers);
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Debug-Request-Id", requestId);
  headers.set("Vary", "Origin");
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers
  });
}

function jsonError(origin, status, code, message, requestId = "", extra = null) {
  const body = JSON.stringify(Object.assign({
    error: { code, message },
    requestId: requestId || undefined
  }, extra && typeof extra === "object" ? extra : {}));
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "X-Debug-Request-Id": requestId || "",
      Vary: "Origin"
    }
  });
}
