const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.workers.dev"
];

const DEFAULT_CHAR_LIMIT = 950000;
const DEFAULT_CHAR_LIMITS = {
  chirp3_hd: 950000,
  studio: 950000,
  polyglot: 950000,
  neural2: 950000,
  wavenet: 3800000,
  standard: 3800000
};
const CUSTOM_METRIC_TYPE = "custom.googleapis.com/gotoolkit/googletts/characters";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_SCOPE = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/monitoring.read",
  "https://www.googleapis.com/auth/monitoring.write"
].join(" ");

const VOICE_TYPES = [
  { key: "chirp3_hd", label: "Chirp 3 HD" },
  { key: "studio", label: "Studio" },
  { key: "polyglot", label: "Polyglot" },
  { key: "neural2", label: "Neural2" },
  { key: "wavenet", label: "WaveNet" },
  { key: "standard", label: "Standard" }
];

const DEFAULT_VOICES = {
  chirp3_hd: { "fr-FR": "fr-FR-Chirp3-HD-Leda", "en-US": "", "vi-VN": "" },
  studio: { "fr-FR": "fr-FR-Studio-A", "en-US": "", "vi-VN": "" },
  polyglot: { "fr-FR": "", "en-US": "", "vi-VN": "" },
  neural2: { "fr-FR": "fr-FR-Neural2-A", "en-US": "en-US-Neural2-F", "vi-VN": "" },
  wavenet: { "fr-FR": "fr-FR-Wavenet-A", "en-US": "en-US-Wavenet-F", "vi-VN": "vi-VN-Wavenet-A" },
  standard: { "fr-FR": "fr-FR-Standard-A", "en-US": "en-US-Standard-F", "vi-VN": "vi-VN-Standard-A" }
};

let cachedToken = { token: "", expiresAt: 0 };

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

function getHostnameFromOrigin(origin) {
  const candidate = String(origin || "").trim();
  if (!candidate) return "";
  try {
    return String(new URL(candidate).hostname || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function parseTurnstileAllowedHostnames(env) {
  const fromEnv = String(env?.TURNSTILE_ALLOWED_HOSTNAMES || "")
    .split(",")
    .map(host => String(host || "").trim().toLowerCase())
    .filter(Boolean);
  const fromOrigins = ALLOWED_ORIGINS
    .map(origin => getHostnameFromOrigin(origin))
    .filter(Boolean);
  return new Set([...fromOrigins, ...fromEnv]);
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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-client-id,X-Turnstile-Token,CF-Turnstile-Response"
  };
  headers.Vary = "Origin";
  return { origin: rawOrigin, allowLocal, corsOrigin, headers, allowed: allowedOrigin };
}

function jsonError(corsHeaders, status, code, message, extra) {
  return new Response(
    JSON.stringify({ error: { code, message, ...(extra || {}) } }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    }
  );
}

function formatErrorDetails(error) {
  const raw = String(error?.message || error || "unknown_error");
  return raw.slice(0, 400);
}

function getTurnstileSecret(env) {
  return String(env?.TURNSTILE_SECRET_KEY || env?.CF_TURNSTILE_SECRET_KEY || "").trim();
}

function getTurnstileToken(request, payload) {
  const headerToken = String(
    request.headers.get("X-Turnstile-Token")
    || request.headers.get("CF-Turnstile-Response")
    || ""
  ).trim();
  if (headerToken) return headerToken;
  return String(
    payload?.turnstileToken
    || payload?.cfTurnstileResponse
    || payload?.["cf-turnstile-response"]
    || ""
  ).trim();
}

async function enforceTurnstile(request, corsMeta, env, payload, action) {
  const secret = getTurnstileSecret(env);
  if (!secret) {
    if (corsMeta.allowLocal) return null;
    return jsonError(corsMeta.headers, 500, "MISSING_ENV", "Turnstile secret missing.");
  }
  const token = getTurnstileToken(request, payload);
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
    console.warn("[googletts-proxy] turnstile rejected", {
      action,
      status: response.status,
      errors: result?.["error-codes"] || []
    });
    return jsonError(corsMeta.headers, 403, "TURNSTILE_FAILED", "Turnstile verification failed.");
  }
  const allowedHostnames = parseTurnstileAllowedHostnames(env);
  const verifiedHostname = String(result?.hostname || "").trim().toLowerCase();
  if (allowedHostnames.size > 0 && (!verifiedHostname || !allowedHostnames.has(verifiedHostname))) {
    console.warn("[googletts-proxy] turnstile hostname mismatch", {
      action,
      verifiedHostname,
      allowedHostnames: Array.from(allowedHostnames)
    });
    return jsonError(corsMeta.headers, 403, "TURNSTILE_FAILED", "Turnstile verification failed.");
  }
  const expectedAction = String(action || "").trim().toLowerCase();
  const verifiedAction = String(result?.action || "").trim().toLowerCase();
  if (expectedAction && verifiedAction !== expectedAction) {
    console.warn("[googletts-proxy] turnstile action mismatch", {
      expectedAction,
      verifiedAction: verifiedAction || null
    });
    return jsonError(corsMeta.headers, 403, "TURNSTILE_FAILED", "Turnstile verification failed.");
  }
  return null;
}

function toBase64Url(input) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signJwt(assertionHeader, assertionPayload, privateKeyPem) {
  const data = `${toBase64Url(JSON.stringify(assertionHeader))}.${toBase64Url(JSON.stringify(assertionPayload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(data)
  );
  const sigBinary = String.fromCharCode(...new Uint8Array(signature));
  return `${data}.${toBase64Url(sigBinary)}`;
}

function parseServiceAccount(env) {
  try {
    const raw = env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON || "";
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.client_email || !parsed?.private_key || !parsed?.project_id) {
      return null;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.token && cachedToken.expiresAt - 60 > now) {
    return cachedToken.token;
  }

  // Service account JWT mode (recommended for backend workers).
  const sa = parseServiceAccount(env);
  if (!sa) throw new Error("MISSING_OR_INVALID_SERVICE_ACCOUNT");

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: TOKEN_SCOPE,
    aud: TOKEN_AUDIENCE,
    exp: now + 3600,
    iat: now
  };

  const assertion = await signJwt(header, payload, sa.private_key);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  }).toString();

  const resp = await fetch(TOKEN_AUDIENCE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`TOKEN_FETCH_FAILED:${resp.status}:${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const token = data?.access_token || "";
  const expiresIn = Number(data?.expires_in || 3600);
  if (!token) throw new Error("MISSING_ACCESS_TOKEN");

  cachedToken = { token, expiresAt: now + expiresIn };
  return token;
}

function resolveProjectId(env) {
  if (env.GOOGLE_CLOUD_PROJECT_ID) return String(env.GOOGLE_CLOUD_PROJECT_ID).trim();
  const sa = parseServiceAccount(env);
  return sa?.project_id || "";
}

function resolveVoiceMap(env) {
  const out = JSON.parse(JSON.stringify(DEFAULT_VOICES));
  try {
    const raw = env.GOOGLE_TTS_VOICES_JSON || "";
    if (!raw) return out;
    const custom = JSON.parse(raw);
    for (const tier of Object.keys(out)) {
      if (!custom[tier] || typeof custom[tier] !== "object") continue;
      for (const lang of ["fr-FR", "en-US", "vi-VN"]) {
        if (typeof custom[tier][lang] === "string") out[tier][lang] = custom[tier][lang];
      }
    }
  } catch (err) {
    // ignore invalid override
  }
  return out;
}

function monthBoundsIso(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  return { startIso: start.toISOString(), endIso: end.toISOString(), monthKey };
}

async function getKvUsage(env, monthKey) {
  const usage = Object.fromEntries(VOICE_TYPES.map((tier) => [tier.key, 0]));
  if (!env.USAGE_KV || typeof env.USAGE_KV.get !== "function") return usage;
  const key = `usage:${monthKey}`;
  const raw = await env.USAGE_KV.get(key, "json");
  if (!raw || typeof raw !== "object") return usage;
  for (const t of Object.keys(usage)) {
    usage[t] = Number(raw[t] || 0);
  }
  return usage;
}

async function addKvUsage(env, monthKey, tier, chars) {
  if (!env.USAGE_KV || typeof env.USAGE_KV.get !== "function" || typeof env.USAGE_KV.put !== "function") return;
  const key = `usage:${monthKey}`;
  const existing = (await env.USAGE_KV.get(key, "json")) || {};
  const next = Object.fromEntries(
    VOICE_TYPES.map((voiceType) => [voiceType.key, Number(existing[voiceType.key] || 0)])
  );
  next[tier] = next[tier] + Number(chars || 0);
  await env.USAGE_KV.put(key, JSON.stringify(next));
}

async function writeMonitoringUsage(token, projectId, chars, tier, lang) {
  const payload = {
    timeSeries: [
      {
        metric: {
          type: CUSTOM_METRIC_TYPE,
          labels: {
            voice_type: tier,
            language: lang
          }
        },
        resource: {
          type: "global",
          labels: { project_id: projectId }
        },
        points: [
          {
            interval: {
              endTime: new Date().toISOString()
            },
            value: {
              doubleValue: Number(chars)
            }
          }
        ]
      }
    ]
  };

  await fetch(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

async function getMonitoringUsage(token, projectId, startIso, endIso) {
  const usage = Object.fromEntries(VOICE_TYPES.map((tier) => [tier.key, 0]));
  const filter = [
    `metric.type="${CUSTOM_METRIC_TYPE}"`,
    `resource.type="global"`
  ].join(" AND ");
  const qs = new URLSearchParams({
    filter,
    view: "FULL",
    "interval.startTime": startIso,
    "interval.endTime": endIso,
    "aggregation.alignmentPeriod": "3600s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
    "aggregation.groupByFields": "metric.labels.voice_type"
  });

  const resp = await fetch(
    `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${qs.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!resp.ok) return usage;
  const data = await resp.json();
  const series = Array.isArray(data?.timeSeries) ? data.timeSeries : [];
  for (const item of series) {
    const tier = item?.metric?.labels?.voice_type;
    if (!Object.prototype.hasOwnProperty.call(usage, tier)) continue;
    const points = Array.isArray(item?.points) ? item.points : [];
    let sum = 0;
    for (const point of points) {
      const raw = point?.value?.int64Value ?? point?.value?.doubleValue ?? 0;
      sum += Number(raw || 0);
    }
    usage[tier] = sum;
  }
  return usage;
}

function resolveCharLimits(env) {
  const limits = { ...DEFAULT_CHAR_LIMITS };
  const legacyLimit = Number(env.GOOGLE_TTS_CHAR_LIMIT || 0);
  if (legacyLimit > 0) {
    for (const tier of VOICE_TYPES) limits[tier.key] = legacyLimit;
  }
  try {
    const raw = env.GOOGLE_TTS_CHAR_LIMITS_JSON || "";
    if (raw) {
      const custom = JSON.parse(raw);
      for (const tier of VOICE_TYPES) {
        const value = Number(custom?.[tier.key] || 0);
        if (value > 0) limits[tier.key] = value;
      }
    }
  } catch (err) {
    // ignore invalid override
  }
  return limits;
}

function chooseTier(usage, charLimits, voiceMap, languageCode) {
  for (const tier of VOICE_TYPES) {
    const voiceName = voiceMap?.[tier.key]?.[languageCode] || "";
    const charLimit = Number(charLimits?.[tier.key] || 0);
    if (!charLimit) continue;
    if (Number(usage[tier.key] || 0) < charLimit) {
      return { tier: tier.key, voiceName };
    }
  }
  return null;
}

async function synthesize(token, text, languageCode, voiceName) {
  const voicePayload = {
    languageCode
  };
  if (voiceName) {
    voicePayload.name = voiceName;
  }
  const payload = {
    input: { text },
    voice: voicePayload,
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1
    }
  };

  const resp = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = data?.error?.message || "TTS_SYNTHESIS_FAILED";
    throw new Error(message);
  }
  return data;
}

async function enforceRateLimit(request, corsMeta, env) {
  if (corsMeta.allowLocal) return null;
  if (!env?.MY_RATE_LIMITER || typeof env.MY_RATE_LIMITER.limit !== "function") return null;
  const ipAddress = request.headers.get("cf-connecting-ip") || normalizeClientIp(request);
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
      return new Response(null, { headers: corsMeta.headers });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, "");

    if (pathname.endsWith("/usage") && request.method === "GET") {
      const projectId = resolveProjectId(env);
      if (!projectId) {
        return jsonError(corsMeta.headers, 500, "MISSING_PROJECT_ID", "Google Cloud project id missing.");
      }
      let token;
      try {
        token = await getGoogleAccessToken(env);
      } catch (error) {
        return jsonError(
          corsMeta.headers,
          500,
          "GOOGLE_AUTH_FAILED",
          "Unable to authenticate to Google APIs.",
          { details: formatErrorDetails(error) }
        );
      }
      const { startIso, endIso, monthKey } = monthBoundsIso(new Date());
      const monitoring = await getMonitoringUsage(token, projectId, startIso, endIso).catch(() => ({
        chirp3_hd: 0,
        studio: 0,
        polyglot: 0,
        neural2: 0,
        wavenet: 0,
        standard: 0
      }));
      const kv = await getKvUsage(env, monthKey);
      const merged = Object.fromEntries(
        VOICE_TYPES.map((tier) => [
          tier.key,
          Math.max(Number(monitoring[tier.key] || 0), Number(kv[tier.key] || 0))
        ])
      );
      const charLimits = resolveCharLimits(env);
      return new Response(
        JSON.stringify({
          month: monthKey,
          charLimit: Number(env.GOOGLE_TTS_CHAR_LIMIT || DEFAULT_CHAR_LIMIT),
          charLimits,
          usage: merged,
          sources: { monitoring, kv }
        }),
        {
          headers: {
            ...corsMeta.headers,
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!(pathname.endsWith("/speak") && request.method === "POST")) {
      return new Response("Not found", {
        status: 404,
        headers: {
          ...corsMeta.headers,
          Allow: "GET,POST,OPTIONS"
        }
      });
    }

    const limitResponse = await enforceRateLimit(request, corsMeta, env);
    if (limitResponse) return limitResponse;

    const projectId = resolveProjectId(env);
    if (!projectId) {
      return jsonError(corsMeta.headers, 500, "MISSING_PROJECT_ID", "Google Cloud project id missing.");
    }

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return jsonError(corsMeta.headers, 400, "BAD_JSON", "Invalid JSON payload.");
    }

    const turnstileResponse = await enforceTurnstile(request, corsMeta, env, payload, "speak");
    if (turnstileResponse) return turnstileResponse;

    const text = String(payload?.text || "").trim();
    const requestedLanguageCode = String(payload?.languageCode || "").trim();
    const languageCode = requestedLanguageCode === "en-US" || requestedLanguageCode === "vi-VN"
      ? requestedLanguageCode
      : "fr-FR";
    if (!text) {
      return jsonError(corsMeta.headers, 400, "EMPTY_TEXT", "Text is required.");
    }

    const charLimit = Number(env.GOOGLE_TTS_CHAR_LIMIT || DEFAULT_CHAR_LIMIT);
    const charLimits = resolveCharLimits(env);
    const voiceMap = resolveVoiceMap(env);
    const { startIso, endIso, monthKey } = monthBoundsIso(new Date());

    let token;
    try {
      token = await getGoogleAccessToken(env);
    } catch (error) {
      return jsonError(
        corsMeta.headers,
        500,
        "GOOGLE_AUTH_FAILED",
        "Unable to authenticate to Google TTS.",
        { details: formatErrorDetails(error) }
      );
    }

    const monitoringUsage = await getMonitoringUsage(token, projectId, startIso, endIso).catch(() => ({
      chirp3_hd: 0,
      studio: 0,
      polyglot: 0,
      neural2: 0,
      wavenet: 0,
      standard: 0
    }));
    const kvUsage = await getKvUsage(env, monthKey);
    const mergedUsage = Object.fromEntries(
      VOICE_TYPES.map((tier) => [
        tier.key,
        Math.max(Number(monitoringUsage[tier.key] || 0), Number(kvUsage[tier.key] || 0))
      ])
    );

    let tierSelection = chooseTier(mergedUsage, charLimits, voiceMap, languageCode);
    if (!tierSelection) {
      return jsonError(
        corsMeta.headers,
        409,
        "VOICE_TIERS_EXHAUSTED",
        "All Google TTS tiers are at or above monthly threshold; fallback to Web Speech."
      );
    }

    let synthesisData = null;
    let lastError = "";
    const attemptedTiers = new Set();
    while (!synthesisData && tierSelection && !attemptedTiers.has(tierSelection.tier)) {
      attemptedTiers.add(tierSelection.tier);
      try {
        synthesisData = await synthesize(token, text, languageCode, tierSelection.voiceName);
      } catch (error) {
        lastError = String(error?.message || error);
        mergedUsage[tierSelection.tier] = Number(charLimits[tierSelection.tier] || 0);
        tierSelection = chooseTier(mergedUsage, charLimits, voiceMap, languageCode);
      }
    }

    if (!synthesisData?.audioContent) {
      return jsonError(
        corsMeta.headers,
        502,
        "TTS_SYNTHESIS_FAILED",
        "Google TTS synthesis failed.",
        { details: lastError || "No audio content returned." }
      );
    }

    const selectedTier = tierSelection?.tier || Array.from(attemptedTiers).pop() || "standard";
    await addKvUsage(env, monthKey, selectedTier, text.length);
    await writeMonitoringUsage(token, projectId, text.length, selectedTier, languageCode).catch(() => {});

    return new Response(
      JSON.stringify({
        audioContent: synthesisData.audioContent,
        audioConfig: { audioEncoding: "MP3" },
        meta: {
          languageCode,
          voiceType: selectedTier,
          voiceName: tierSelection?.voiceName || "",
          attemptedVoiceTypes: Array.from(attemptedTiers),
          configuredVoiceOrder: VOICE_TYPES.map((tier) => tier.key),
          chars: text.length,
          month: monthKey,
          charLimit,
          tierCharLimit: Number(charLimits[selectedTier] || 0)
        }
      }),
      {
        headers: {
          ...corsMeta.headers,
          "Content-Type": "application/json"
        }
      }
    );
  }
};
