export default {
  async fetch(request, env) {
    const allowedOrigins = [
      "https://gotoolkit.fr",
      "https://gotoolkit.workers.dev"
    ];

    const origin = request.headers.get("Origin") || "";
    const allowLocal =
      !origin ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1") ||
      origin.startsWith("http://192.168.");

    const corsOrigin = allowLocal
      ? origin || "*"
      : allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0];

    // 1) Vérifier l'origine autorisée (autoriser localhost en dev)
    if (!allowLocal && !allowedOrigins.includes(origin)) {
      return new Response("Forbidden", {
        status: 403,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Vary": "Origin"
        }
      });
    }

    // 2) Préflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-app-token, x-client-id",
          "Vary": "Origin"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Only POST", {
        status: 405,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-app-token, x-client-id",
          "Allow": "POST, OPTIONS",
          "Vary": "Origin"
        }
      });
    }

    const clientIp = normalizeClientIp(request);
    const ipWhitelist = ["78.112.62.208"];

    // 3) IP whitelist → pas de quotas / rate limit, mais origine toujours contrôlée
    if (ipWhitelist.includes(clientIp)) {
      return forwardToOpenAI(request, env, corsOrigin);
    }

    // 4) Récupérer le clientId (ou fallback anonyme basé sur IP)
    let clientId = request.headers.get("x-client-id");
    if (!clientId || clientId.length > 100) {
      clientId = `anon:${clientIp}`;
    }

    // 5) Use Cloudflare Rate Limiter binding instead of KV per-minute counters
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

    // 7) Proxy vers OpenAI (avec limites de payload)
    return forwardToOpenAI(request, env, corsOrigin);
  }
};

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

function jsonError(origin, status, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin"
    }
  });
}
