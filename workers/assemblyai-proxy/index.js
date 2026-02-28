const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.workers.dev"
];
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function normalizeClientIp(request) {
  const raw =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "";
  const first = raw.split(",")[0].trim();
  if (!first) return "unknown";
  const withoutBrackets = first.replace(/^\[/, "").replace(/]$/, "");
  const [hostPart] = withoutBrackets.split(":");
  return hostPart || "unknown";
}

function normalizeOrigin(origin) {
  return String(origin || "").trim();
}

function isLocalOrigin(origin) {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(origin);
}

function computeCorsHeaders(request) {
  const rawOrigin = normalizeOrigin(request.headers.get("Origin"));
  const allowLocal = isLocalOrigin(rawOrigin);
  const allowedOrigin = allowLocal || ALLOWED_ORIGINS.includes(rawOrigin);
  const corsOrigin = allowedOrigin ? rawOrigin : "null";
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,X-AssemblyAI-Key,Content-Type,X-Turnstile-Token,CF-Turnstile-Response"
  };
  headers["Vary"] = "Origin";
  return {
    origin: rawOrigin,
    allowLocal,
    corsOrigin,
    headers,
    allowed: allowedOrigin
  };
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

async function enforceTurnstile(request, corsMeta, env, action) {
  const secret = getTurnstileSecret(env);
  if (!secret) return null;
  const token = getTurnstileToken(request);
  if (!token) {
    return jsonError(corsMeta.headers, 403, "TURNSTILE_REQUIRED", "Turnstile token required.");
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
        remoteip: normalizeClientIp(request) || undefined,
        idempotency_key: crypto.randomUUID()
      })
    });
  } catch (error) {
    return jsonError(corsMeta.headers, 502, "TURNSTILE_UNAVAILABLE", "Turnstile verification unavailable.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    console.warn("[assemblyai-proxy] turnstile rejected", {
      action,
      status: response.status,
      errors: result?.["error-codes"] || []
    });
    return jsonError(corsMeta.headers, 403, "TURNSTILE_FAILED", "Turnstile verification failed.");
  }
  return null;
}

function resolveAssemblyKey(request, env) {
  const explicitKey = request.headers.get("X-AssemblyAI-Key")?.trim();
  if (explicitKey) {
    return explicitKey;
  }
  const authHeader = request.headers.get("Authorization")?.trim();
  if (authHeader) {
    return authHeader;
  }
  return env?.ASSEMBLY_KEY?.trim() || "";
}

const ASSEMBLY_API_BASE_URL = "https://api.eu.assemblyai.com/v2";
const STREAMING_TOKEN_URL = "https://streaming.eu.assemblyai.com/v3/token";

function jsonError(corsHeaders, status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

async function enforceRateLimitForToken(request, corsMeta, env) {
  if (corsMeta.allowLocal) {
    return null;
  }
  if (!env?.MY_RATE_LIMITER || typeof env.MY_RATE_LIMITER.limit !== "function") {
    return null;
  }

  const ipAddress = request.headers.get("cf-connecting-ip") || "";
  const { success } = await env.MY_RATE_LIMITER.limit({ key: ipAddress });
  if (!success) {
    return jsonError(
      corsMeta.headers,
      429,
      "RATE_LIMIT_EXCEEDED",
      "Too many requests, please wait a bit."
    );
  }

  return null;
}

async function wrapAssemblyResponse(upstreamResponse, corsHeaders, label = "proxy") {
  const body = await upstreamResponse.text();
  const preview = body.slice(0, 400);
  console.log(`[assemblyai-proxy] response ${label}`, {
    status: upstreamResponse.status,
    length: body.length,
    preview: preview || undefined
  });
  const responseHeaders = new Headers(corsHeaders);
  const responseContentType = upstreamResponse.headers.get("Content-Type");
  if (responseContentType) {
    responseHeaders.set("Content-Type", responseContentType);
  }
  return new Response(body, {
    status: upstreamResponse.status,
    headers: responseHeaders
  });
}

async function proxyAssemblyRequest(request, corsMeta, env, path) {
  const assemblyKey = resolveAssemblyKey(request, env);
  if (!assemblyKey) {
    return new Response("AssemblyAI key missing", {
      status: 400,
      headers: corsMeta.headers
    });
  }

  const upstreamUrl = new URL(`${ASSEMBLY_API_BASE_URL}${path}`);
  upstreamUrl.search = new URL(request.url).search;

  const headers = {
    Authorization: assemblyKey
  };
  const contentType = request.headers.get("Content-Type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  let upstreamResponse;
  try {
    console.log(`[assemblyai-proxy] request ${request.method} ${path}`, {
      url: upstreamUrl.toString(),
      origin: corsMeta.origin,
      hasKey: Boolean(assemblyKey)
    });
    upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" ? null : request.body
    });
  } catch (error) {
    return new Response("AssemblyAI proxy fetch failed", {
      status: 502,
      headers: corsMeta.headers
    });
  }

  return wrapAssemblyResponse(upstreamResponse, corsMeta.headers, path);
}

async function proxyTokenRequest(request, corsMeta, env) {
  const assemblyKey = resolveAssemblyKey(request, env);
  if (!assemblyKey) {
    return new Response("AssemblyAI key missing", {
      status: 400,
      headers: corsMeta.headers
    });
  }

  const upstreamUrl = new URL(STREAMING_TOKEN_URL);
  const incomingUrl = new URL(request.url);
  upstreamUrl.search = incomingUrl.search;

  let upstreamResponse;
  try {
    console.log("[assemblyai-proxy] token request", {
      url: upstreamUrl.toString(),
      origin: corsMeta.origin,
      hasKey: Boolean(assemblyKey)
    });
    upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: {
        Authorization: assemblyKey
      }
    });
  } catch (error) {
    return new Response("AssemblyAI token fetch failed", {
      status: 502,
      headers: corsMeta.headers
    });
  }

  return wrapAssemblyResponse(upstreamResponse, corsMeta.headers, "token");
}

export default {
  async fetch(request, env) {
    const corsMeta = computeCorsHeaders(request);
    if (!corsMeta.allowed) {
      return new Response("Forbidden origin", {
        status: 403,
        headers: corsMeta.headers
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsMeta.headers
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, "");
    const segments = pathname.split("/").filter(Boolean);

    if (request.method === "GET" && pathname.endsWith("/token")) {
      const limitResponse = await enforceRateLimitForToken(request, corsMeta, env);
      if (limitResponse) {
        return limitResponse;
      }
    }

    if (request.method === "POST" && pathname.endsWith("/upload")) {
      const turnstileResponse = await enforceTurnstile(request, corsMeta, env, "upload");
      if (turnstileResponse) return turnstileResponse;
      return proxyAssemblyRequest(request, corsMeta, env, "/upload");
    }

    if (request.method === "POST" && pathname.endsWith("/transcript")) {
      const turnstileResponse = await enforceTurnstile(request, corsMeta, env, "transcript");
      if (turnstileResponse) return turnstileResponse;
      return proxyAssemblyRequest(request, corsMeta, env, "/transcript");
    }

    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "transcript" &&
      segments[2] === "vtt"
    ) {
      return proxyAssemblyRequest(request, corsMeta, env, `/transcript/${segments[1]}/vtt`);
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "transcript") {
      return proxyAssemblyRequest(request, corsMeta, env, `/transcript/${segments[1]}`);
    }

    if (request.method === "DELETE" && segments.length === 2 && segments[0] === "transcript") {
      return proxyAssemblyRequest(request, corsMeta, env, `/transcript/${segments[1]}`);
    }

    if (request.method === "GET" && pathname.endsWith("/token")) {
      const turnstileResponse = await enforceTurnstile(request, corsMeta, env, "token");
      if (turnstileResponse) return turnstileResponse;
      return proxyTokenRequest(request, corsMeta, env);
    }

    const headers = {
      ...corsMeta.headers,
      Allow: "GET,POST,DELETE,OPTIONS"
    };
    return new Response("Not found", {
      status: 404,
      headers
    });
  }
};
