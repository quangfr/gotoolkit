const ALLOWED_ORIGINS = [
  "https://gotoolkit.fr",
  "https://gotoolkit.workers.dev"
];

const DEFAULT_CHAR_LIMIT = 950000;
const CUSTOM_METRIC_TYPE = "custom.googleapis.com/gotoolkit/googletts/characters";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const TOKEN_SCOPE = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/monitoring.read",
  "https://www.googleapis.com/auth/monitoring.write"
].join(" ");

const VOICE_TYPES = [
  { key: "chirp3_hd", label: "Chirp 3 HD" },
  { key: "studio", label: "Studio" },
  { key: "neural2", label: "Neural2" }
];

const DEFAULT_VOICES = {
  chirp3_hd: { "fr-FR": "", "en-US": "" },
  studio: { "fr-FR": "", "en-US": "" },
  neural2: { "fr-FR": "fr-FR-Neural2-A", "en-US": "en-US-Neural2-F" }
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
    "Access-Control-Allow-Headers": "Content-Type,x-client-id"
  };
  if (!allowLocal) headers.Vary = "Origin";
  return { origin: rawOrigin, allowLocal, corsOrigin, headers };
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
      for (const lang of ["fr-FR", "en-US"]) {
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
  const usage = { chirp3_hd: 0, studio: 0, neural2: 0 };
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
  const next = {
    chirp3_hd: Number(existing.chirp3_hd || 0),
    studio: Number(existing.studio || 0),
    neural2: Number(existing.neural2 || 0)
  };
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
  const usage = { chirp3_hd: 0, studio: 0, neural2: 0 };
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

function chooseTier(usage, charLimit, voiceMap, languageCode) {
  for (const tier of VOICE_TYPES) {
    const voiceName = voiceMap?.[tier.key]?.[languageCode] || "";
    if (!voiceName) continue;
    if (Number(usage[tier.key] || 0) < charLimit) {
      return { tier: tier.key, voiceName };
    }
  }
  return null;
}

async function synthesize(token, text, languageCode, voiceName) {
  const payload = {
    input: { text },
    voice: {
      languageCode,
      name: voiceName
    },
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
    if (!corsMeta.allowLocal && !ALLOWED_ORIGINS.includes(corsMeta.origin)) {
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
      const token = await getGoogleAccessToken(env);
      const { startIso, endIso, monthKey } = monthBoundsIso(new Date());
      const monitoring = await getMonitoringUsage(token, projectId, startIso, endIso).catch(() => ({
        chirp3_hd: 0,
        studio: 0,
        neural2: 0
      }));
      const kv = await getKvUsage(env, monthKey);
      const merged = {
        chirp3_hd: Math.max(Number(monitoring.chirp3_hd || 0), Number(kv.chirp3_hd || 0)),
        studio: Math.max(Number(monitoring.studio || 0), Number(kv.studio || 0)),
        neural2: Math.max(Number(monitoring.neural2 || 0), Number(kv.neural2 || 0))
      };
      return new Response(
        JSON.stringify({
          month: monthKey,
          charLimit: Number(env.GOOGLE_TTS_CHAR_LIMIT || DEFAULT_CHAR_LIMIT),
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

    const text = String(payload?.text || "").trim();
    const languageCode = payload?.languageCode === "en-US" ? "en-US" : "fr-FR";
    if (!text) {
      return jsonError(corsMeta.headers, 400, "EMPTY_TEXT", "Text is required.");
    }

    const charLimit = Number(env.GOOGLE_TTS_CHAR_LIMIT || DEFAULT_CHAR_LIMIT);
    const voiceMap = resolveVoiceMap(env);
    const { startIso, endIso, monthKey } = monthBoundsIso(new Date());

    let token;
    try {
      token = await getGoogleAccessToken(env);
    } catch (error) {
      return jsonError(corsMeta.headers, 500, "GOOGLE_AUTH_FAILED", "Unable to authenticate to Google TTS.");
    }

    const monitoringUsage = await getMonitoringUsage(token, projectId, startIso, endIso).catch(() => ({
      chirp3_hd: 0,
      studio: 0,
      neural2: 0
    }));
    const kvUsage = await getKvUsage(env, monthKey);
    const mergedUsage = {
      chirp3_hd: Math.max(Number(monitoringUsage.chirp3_hd || 0), Number(kvUsage.chirp3_hd || 0)),
      studio: Math.max(Number(monitoringUsage.studio || 0), Number(kvUsage.studio || 0)),
      neural2: Math.max(Number(monitoringUsage.neural2 || 0), Number(kvUsage.neural2 || 0))
    };

    let tierSelection = chooseTier(mergedUsage, charLimit, voiceMap, languageCode);
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
        mergedUsage[tierSelection.tier] = charLimit;
        tierSelection = chooseTier(mergedUsage, charLimit, voiceMap, languageCode);
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

    const selectedTier = tierSelection?.tier || Array.from(attemptedTiers).pop() || "neural2";
    await addKvUsage(env, monthKey, selectedTier, text.length);
    await writeMonitoringUsage(token, projectId, text.length, selectedTier, languageCode).catch(() => {});

    return new Response(
      JSON.stringify({
        audioContent: synthesisData.audioContent,
        audioConfig: { audioEncoding: "MP3" },
        meta: {
          languageCode,
          voiceType: selectedTier,
          chars: text.length,
          month: monthKey,
          charLimit
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
