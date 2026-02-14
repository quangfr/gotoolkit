const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.workers.dev"
];

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
  if (!origin) return "";
  return origin.trim();
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  return (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.") ||
    origin.startsWith("http://192.168.")
  );
}

function computeCorsHeaders(request) {
  const rawOrigin = normalizeOrigin(request.headers.get("Origin"));
  const allowLocal = isLocalOrigin(rawOrigin);
  const defaultOrigin = ALLOWED_ORIGINS[0];
  const corsOrigin = allowLocal
    ? rawOrigin || "*"
    : ALLOWED_ORIGINS.includes(rawOrigin)
      ? rawOrigin
      : defaultOrigin;
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,X-AssemblyAI-Key,Content-Type"
  };
  if (!allowLocal) {
    headers["Vary"] = "Origin";
  }
  return {
    origin: rawOrigin,
    allowLocal,
    corsOrigin,
    headers
  };
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

const ASSEMBLY_API_BASE_URL = "https://api.assemblyai.com/v2";
const STREAMING_TOKEN_URL = "https://streaming.assemblyai.com/v3/token";

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
    if (!corsMeta.allowLocal && !ALLOWED_ORIGINS.includes(corsMeta.origin)) {
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
      return proxyAssemblyRequest(request, corsMeta, env, "/upload");
    }

    if (request.method === "POST" && pathname.endsWith("/transcript")) {
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

    if (request.method === "GET" && pathname.endsWith("/token")) {
      return proxyTokenRequest(request, corsMeta, env);
    }

    const headers = {
      ...corsMeta.headers,
      Allow: "GET,POST,OPTIONS"
    };
    return new Response("Not found", {
      status: 404,
      headers
    });
  }
};
