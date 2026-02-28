const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "https://gotoolkit.fr",
  "https://www.gotoolkit.fr",
  "https://gotoolkit.workers.dev"
]);
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function normalizeOriginValue(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  try {
    return new URL(candidate).origin;
  } catch {
    return candidate.replace(/\/+$/, "");
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
  return { origin, corsOrigin, allowed, allowedOrigins };
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    || ""
  );
}

function getTurnstileSecret(env) {
  return String(env?.TURNSTILE_SECRET_KEY || env?.CF_TURNSTILE_SECRET_KEY || "").trim();
}

function getTurnstileToken(request) {
  return String(
    request.headers.get("X-Turnstile-Token")
    || request.headers.get("CF-Turnstile-Response")
    || ""
  ).trim();
}

async function enforceTurnstile(request, env, corsOrigin, action) {
  const secret = getTurnstileSecret(env);
  if (!secret) return null;
  const token = getTurnstileToken(request);
  if (!token) {
    return jsonError(corsOrigin, 403, "TURNSTILE_REQUIRED", "Turnstile token required.");
  }
  let response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: getClientIp(request) || undefined,
        idempotency_key: crypto.randomUUID()
      })
    });
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return jsonError(corsOrigin, 502, "TURNSTILE_UNAVAILABLE", "Turnstile verification unavailable.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    console.warn("Turnstile rejected request", {
      action,
      status: response.status,
      errors: result?.["error-codes"] || []
    });
    return jsonError(corsOrigin, 403, "TURNSTILE_FAILED", "Turnstile verification failed.");
  }
  return null;
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const isEmbeddingsRoute = requestUrl.pathname.includes("/embeddings");
    const corsMeta = resolveCors(request, env);
    const corsOrigin = corsMeta.corsOrigin;

    if (!corsMeta.allowed) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
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
          Allow: "GET, POST, OPTIONS",
          Vary: "Origin"
        }
      });
    }

    const turnstileResponse = await enforceTurnstile(request, env, corsOrigin, isEmbeddingsRoute ? "embeddings" : "chat");
    if (turnstileResponse) {
      return turnstileResponse;
    }

    const ipAddress = request.headers.get("cf-connecting-ip") || "";
    if (env?.MY_RATE_LIMITER && typeof env.MY_RATE_LIMITER.limit === "function") {
      const { success } = await env.MY_RATE_LIMITER.limit({ key: ipAddress });
      if (!success) {
        return jsonError(
          corsOrigin,
          429,
          "RATE_LIMIT_EXCEEDED",
          "Too many requests, please wait a bit."
        );
      }
    }

    return forwardToOpenRouter(request, env, corsOrigin, { embeddings: isEmbeddingsRoute });
  }
};

async function forwardToOpenRouter(request, env, corsOrigin, options = {}) {
  const raw = await request.text();
  const maxBytes = 2_500_000;

  if (raw.length > maxBytes) {
    return jsonError(corsOrigin, 413, "PAYLOAD_TOO_LARGE", "Payload too large.");
  }

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return jsonError(corsOrigin, 400, "BAD_JSON", "Invalid JSON payload.");
  }

  if (!env.OPENROUTER_API_KEY) {
    return jsonError(corsOrigin, 500, "MISSING_ENV", "OpenRouter API key missing.");
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
    console.error("OpenRouter fetch failed", error);
    return jsonError(
      corsOrigin,
      502,
      "UPSTREAM_UNAVAILABLE",
      "OpenRouter upstream unavailable."
    );
  }

  const headers = new Headers(upstreamResponse.headers);
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Origin");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers
  });
}

async function forwardToOpenRouterModelsUser(request, env, corsOrigin) {
  if (!env.OPENROUTER_API_KEY) {
    return jsonError(corsOrigin, 500, "MISSING_ENV", "OpenRouter API key missing.");
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
    console.error("OpenRouter models fetch failed", error);
    return jsonError(
      corsOrigin,
      502,
      "UPSTREAM_UNAVAILABLE",
      "OpenRouter upstream unavailable."
    );
  }
  const headers = new Headers(upstreamResponse.headers);
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Origin");
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers
  });
}

function jsonError(origin, status, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin"
    }
  });
}
