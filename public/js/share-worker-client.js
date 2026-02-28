(function () {
  const DEFAULT_WORKER_URLS = ["https://share.gotoolkit.workers.dev/"];
  const configuredUrls = [];
  if (Array.isArray(window.GO_TOOLKIT_SHARE_API_URLS)) {
    configuredUrls.push(...window.GO_TOOLKIT_SHARE_API_URLS);
  }
  if (window.GO_TOOLKIT_SHARE_API_URL) {
    configuredUrls.push(window.GO_TOOLKIT_SHARE_API_URL);
  }
  configuredUrls.push(...DEFAULT_WORKER_URLS);
  const workerBases = Array.from(
    new Set(
      configuredUrls
        .map(url => (typeof url === "string" ? url.trim() : ""))
        .filter(Boolean)
        .map(url => url.replace(/\/+$/g, ""))
    )
  );
  const API_VERSION = "v1";
  const isReady = workerBases.length > 0;
  const E2EE_ASSET_MIME = "application/x-gotoolkit-e2ee+json";
  const PAGE_PAYLOAD_REF_TYPE = "page-payload-ref";
  const PAGE_PAYLOAD_REF_VERSION = 1;
  const PAGE_PAYLOAD_OFFLOAD_THRESHOLD_BYTES = 350 * 1024;
  const SHARE_DEBUG_PREFIX = "[MemoCloudDebug]";
  const CLOUD_SYNC_DEBUG_ENABLED = window.GO_TOOLKIT_DEBUG_CLOUD_SYNC === true;
  const BATCH_IDS_CHUNK_SIZE = 60;
  const BATCH_WRITES_CHUNK_SIZE = 40;
  const PBKDF2_ITERATIONS = 310000;
  const SYNC_SESSION_TTL_MS = 15 * 60 * 1000;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const assetBlobCache = new Map();
  const spaceKeyCache = new Map();
  const spaceAuthTokenCache = new Map();
  const oauthIdentityCache = new Map();
  const tokenSpaceIdCache = new Map();
  let syncSessionState = null;
  let syncClockOffsetMs = 0;

  function logShareDebug(event, payload) {
    if (!CLOUD_SYNC_DEBUG_ENABLED) return;
    try {
      console.log(SHARE_DEBUG_PREFIX, event, payload || {});
    } catch (err) {
      // ignore
    }
  }

  function payloadLikelyHasVideo(payload) {
    try {
      const raw = JSON.stringify(payload || {});
      return raw.includes("data:video/")
        || raw.includes("<video")
        || raw.includes("videoEmbed")
        || raw.includes("video/mp4")
        || raw.includes("video/webm");
    } catch (err) {
      return false;
    }
  }

  function randomToken(size = 16) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function getActiveSyncSession() {
    const now = Date.now();
    if (syncSessionState && Number(syncSessionState.expiresAt || 0) > now) {
      return syncSessionState;
    }
    syncSessionState = {
      id: `sync-${randomToken(12)}`,
      createdAt: now,
      expiresAt: now + SYNC_SESSION_TTL_MS
    };
    return syncSessionState;
  }

  function getSyncHeaders() {
    const session = getActiveSyncSession();
    return {
      "X-Sync-Session": session.id,
      "X-Sync-JTI": randomToken(16),
      "X-Sync-TS": String(Date.now() + syncClockOffsetMs)
    };
  }

  function mergeSyncHeaders(baseHeaders) {
    return Object.assign({}, getSyncHeaders(), baseHeaders || {});
  }

  function updateSyncClockOffsetFromResponse(response) {
    if (!response?.headers?.get) return;
    const serverDateRaw = String(response.headers.get("date") || "").trim();
    if (!serverDateRaw) return;
    const serverTs = Date.parse(serverDateRaw);
    if (!Number.isFinite(serverTs)) return;
    syncClockOffsetMs = serverTs - Date.now();
  }

  async function fetchWithSyncRetry(url, options = {}) {
    const requestOptions = Object.assign({}, options || {});
    const baseHeaders = Object.assign({}, requestOptions.headers || {});
    delete baseHeaders["X-Sync-Session"];
    delete baseHeaders["X-Sync-JTI"];
    delete baseHeaders["X-Sync-TS"];
    requestOptions.headers = mergeSyncHeaders(baseHeaders);

    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
    }

    updateSyncClockOffsetFromResponse(response);
    if (response.status !== 401) return response;

    const errorText = await response.clone().text().catch(() => "");
    if (!/horodatage sync invalide/i.test(errorText)) {
      return response;
    }

    requestOptions.headers = mergeSyncHeaders(baseHeaders);
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
    }
    updateSyncClockOffsetFromResponse(response);
    return response;
  }

  function chunkArray(items, chunkSize) {
    const list = Array.isArray(items) ? items : [];
    const size = Math.max(1, Number(chunkSize) || 1);
    const chunks = [];
    for (let i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks;
  }

  function normalizeSpaceJoinCode(value) {
    if (window.GoToolkitSpaces?.normalizeSpaceJoinCode) {
      return window.GoToolkitSpaces.normalizeSpaceJoinCode(value);
    }
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    return raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getSpaceById(spaceId) {
    const api = window.GoToolkitSpaces;
    if (!api?.getSpaceById) return null;
    return api.getSpaceById(spaceId) || null;
  }

  function getOauthProviders() {
    return [
      { id: "microsoft", api: window.GoToolkitMicrosoftPublish },
      { id: "gmail", api: window.GoToolkitGmailPublish }
    ];
  }

  async function getOauthIdentityAssertion() {
    const now = Date.now();
    for (const provider of getOauthProviders()) {
      const cached = oauthIdentityCache.get(provider.id);
      if (cached?.identityToken && Number(cached.expiresAt || 0) > now + 10_000) {
        return cached;
      }
      const api = provider.api;
      if (!api?.getIdentity) continue;
      try {
        const payload = await api.getIdentity();
        const identityToken = String(payload?.identityToken || "").trim();
        const accountEmail = String(payload?.accountEmail || "").trim().toLowerCase();
        const expiresAt = Number(payload?.expiresAt || 0);
        if (!identityToken || !accountEmail || !Number.isFinite(expiresAt)) continue;
        const next = {
          provider: provider.id,
          identityToken,
          accountEmail,
          accountName: String(payload?.accountName || "").trim(),
          expiresAt
        };
        oauthIdentityCache.set(provider.id, next);
        return next;
      } catch (err) {
        oauthIdentityCache.delete(provider.id);
      }
    }
    return null;
  }

  function toBase64FromBytes(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  function bytesFromBase64(base64) {
    const normalized = normalizeBase64(base64);
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function deriveSpaceKey(spaceId, joinCodeRaw) {
    const normalizedJoinCode = normalizeSpaceJoinCode(joinCodeRaw);
    const normalizedSpaceId = String(spaceId || "").trim().toLowerCase();
    if (!normalizedSpaceId || !normalizedJoinCode) return null;
    const cacheKey = `${normalizedSpaceId}::${normalizedJoinCode}`;
    if (spaceKeyCache.has(cacheKey)) {
      return spaceKeyCache.get(cacheKey);
    }
    const keyPromise = (async () => {
      const baseKey = await crypto.subtle.importKey(
        "raw",
        textEncoder.encode(normalizedJoinCode),
        "PBKDF2",
        false,
        ["deriveKey"]
      );
      return crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          iterations: PBKDF2_ITERATIONS,
          salt: textEncoder.encode(`gotoolkit:space:${normalizedSpaceId}`)
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })();
    spaceKeyCache.set(cacheKey, keyPromise);
    return keyPromise;
  }

  async function encryptAssetPayload(contentBase64, mimeType, fileName, spaceId, joinCode) {
    const key = await deriveSpaceKey(spaceId, joinCode);
    if (!key) {
      return { mimeType, contentBase64, fileName };
    }
    const plainBytes = bytesFromBase64(contentBase64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plainBytes
    );
    const wrapper = {
      gtke: 1,
      alg: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      spaceId: String(spaceId || "").trim().toLowerCase(),
      iv: toBase64FromBytes(iv),
      ciphertext: toBase64FromBytes(new Uint8Array(cipherBuffer)),
      mimeType: String(mimeType || "application/octet-stream").trim() || "application/octet-stream",
      fileName: String(fileName || "").trim() || "asset.bin"
    };
    const wrapperBytes = textEncoder.encode(JSON.stringify(wrapper));
    return {
      mimeType: E2EE_ASSET_MIME,
      contentBase64: toBase64FromBytes(wrapperBytes),
      fileName: `${wrapper.fileName}.gtke`
    };
  }

  function isEncryptedPagePayload(payload) {
    return Boolean(
      payload &&
      typeof payload === "object" &&
      Number(payload.gtke) === 1 &&
      String(payload.type || "").trim() === "page-payload" &&
      typeof payload.ciphertext === "string" &&
      typeof payload.iv === "string"
    );
  }

  async function encryptPagePayload(payload, collection, spaceId) {
    if (String(collection || "").trim().toLowerCase() !== "pages") return payload;
    if (!payload || typeof payload !== "object") return payload;
    if (isEncryptedPagePayload(payload)) return payload;
    const space = getSpaceById(spaceId);
    const joinCode = normalizeSpaceJoinCode(space?.spaceJoinCode || "");
    if (!joinCode) return payload;
    const key = await deriveSpaceKey(spaceId, joinCode);
    if (!key) return payload;
    const plainBytes = textEncoder.encode(JSON.stringify(payload));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plainBytes
    );
    return {
      gtke: 1,
      type: "page-payload",
      alg: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      spaceId: String(spaceId || "golive").trim().toLowerCase() || "golive",
      iv: toBase64FromBytes(iv),
      ciphertext: toBase64FromBytes(new Uint8Array(cipherBuffer))
    };
  }

  async function decryptPagePayload(payload, collection) {
    if (String(collection || "").trim().toLowerCase() !== "pages") return payload;
    if (!isEncryptedPagePayload(payload)) return payload;
    const effectiveSpaceId = String(payload.spaceId || "golive").trim().toLowerCase() || "golive";
    const space = getSpaceById(effectiveSpaceId);
    const joinCode = normalizeSpaceJoinCode(space?.spaceJoinCode || "");
    console.log("[SSO Debug] decrypt page payload start", {
      spaceId: effectiveSpaceId,
      hasJoinCode: Boolean(joinCode),
      joinCodePreview: joinCode ? `${joinCode.slice(0, 2)}***${joinCode.slice(-2)}` : "",
      payloadType: String(payload?.type || "").trim(),
      isEncrypted: true
    });
    if (!joinCode) {
      throw new Error(`Phrase d'accès manquante pour l'espace ${effectiveSpaceId}`);
    }
    const key = await deriveSpaceKey(effectiveSpaceId, joinCode);
    if (!key) {
      throw new Error("Clé de déchiffrement indisponible");
    }
    const iv = bytesFromBase64(payload.iv || "");
    const ciphertext = bytesFromBase64(payload.ciphertext || "");
    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const plainText = textDecoder.decode(plainBuffer);
    const parsed = JSON.parse(plainText);
    console.log("[SSO Debug] decrypt page payload success", {
      spaceId: effectiveSpaceId,
      payloadKeys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 12) : [],
      tabCount: Array.isArray(parsed?.tabs) ? parsed.tabs.length : 0
    });
    return parsed && typeof parsed === "object" ? parsed : payload;
  }

  async function decryptAssetEnvelope(rawBytes, spaceId) {
    const payloadText = textDecoder.decode(rawBytes);
    let wrapper = null;
    try {
      wrapper = JSON.parse(payloadText);
    } catch (error) {
      return null;
    }
    if (!wrapper || Number(wrapper.gtke) !== 1) return null;
    const effectiveSpaceId = String(spaceId || wrapper.spaceId || "").trim().toLowerCase();
    const space = getSpaceById(effectiveSpaceId);
    const joinCode = normalizeSpaceJoinCode(space?.spaceJoinCode || "");
    if (!joinCode) {
      throw new Error(`Clé d'accès manquante pour l'espace ${effectiveSpaceId || "inconnu"}`);
    }
    const key = await deriveSpaceKey(effectiveSpaceId, joinCode);
    if (!key) {
      throw new Error("Clé de déchiffrement indisponible");
    }
    const iv = bytesFromBase64(wrapper.iv || "");
    const ciphertext = bytesFromBase64(wrapper.ciphertext || "");
    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return {
      bytes: new Uint8Array(plainBuffer),
      mimeType: String(wrapper.mimeType || "application/octet-stream").trim() || "application/octet-stream"
    };
  }

  function shouldEncryptMedia(collection, spaceId) {
    const normalizedCollection = String(collection || "").trim().toLowerCase();
    if (normalizedCollection !== "pages") return false;
    const space = getSpaceById(spaceId);
    const joinCode = normalizeSpaceJoinCode(space?.spaceJoinCode || "");
    return Boolean(joinCode);
  }

  function resolveSpaceIdForPayload(payload, options = {}) {
    const candidate = String(options?.spaceId || payload?.spaceId || "golive").trim().toLowerCase();
    return candidate || "golive";
  }

  function extractAssetIdFromUrl(base, assetUrl) {
    try {
      const parsed = new URL(assetUrl, base);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length < 3) return "";
      if (parts[0] !== API_VERSION || parts[1] !== "assets") return "";
      return decodeURIComponent(parts[2] || "");
    } catch (error) {
      return "";
    }
  }

  async function resolveAssetBlobUrl(base, assetUrl, spaceId) {
    const assetId = extractAssetIdFromUrl(base, assetUrl);
    if (!assetId) return assetUrl;
    const cacheKey = `${base}::${spaceId || ""}::${assetId}`;
    if (assetBlobCache.has(cacheKey)) {
      return assetBlobCache.get(cacheKey);
    }
    let response;
    try {
      response = await fetch(buildAssetUrl(base, assetId), {
        method: "GET",
        cache: "force-cache"
      });
    } catch (error) {
      return assetUrl;
    }
    if (!response.ok) return assetUrl;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    let blob = null;
    if (contentType.includes(E2EE_ASSET_MIME) || (bytes.length && bytes[0] === 123)) {
      try {
        const decrypted = await decryptAssetEnvelope(bytes, spaceId);
        if (decrypted?.bytes?.length) {
          blob = new Blob([decrypted.bytes], { type: decrypted.mimeType });
        }
      } catch (error) {
        console.warn("E2EE média: déchiffrement impossible", error);
        return assetUrl;
      }
    }
    if (!blob) {
      blob = new Blob([bytes], { type: contentType || "application/octet-stream" });
    }
    const blobUrl = URL.createObjectURL(blob);
    assetBlobCache.set(cacheKey, blobUrl);
    return blobUrl;
  }

  async function hydrateHtmlAssetUrls(html, base, options = {}) {
    if (typeof html !== "string" || !html.includes("/v1/assets/") || typeof DOMParser === "undefined") {
      return html;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html), "text/html");
    if (!doc?.body) return html;
    const spaceId = String(options?.spaceId || "").trim().toLowerCase();
    const srcNodes = Array.from(doc.querySelectorAll("img[src],video[src],audio[src],source[src]"));
    for (const node of srcNodes) {
      const src = String(node.getAttribute("src") || "").trim();
      if (!src || !src.includes("/v1/assets/")) continue;
      const blobUrl = await resolveAssetBlobUrl(base, src, spaceId);
      if (!blobUrl || blobUrl === src) continue;
      node.setAttribute("src", blobUrl);
    }
    return doc.body.innerHTML;
  }

  async function hydratePayloadAssetUrls(payload, base, options = {}) {
    async function walk(value) {
      if (typeof value === "string") {
        return hydrateHtmlAssetUrls(value, base, options);
      }
      if (Array.isArray(value)) {
        return Promise.all(value.map(item => walk(item)));
      }
      if (!value || typeof value !== "object") return value;
      const next = {};
      for (const [key, entry] of Object.entries(value)) {
        next[key] = await walk(entry);
      }
      return next;
    }
    return walk(payload);
  }

  function buildShareUrl(base, collection, token) {
    const encodedCollection = encodeURIComponent(collection);
    if (!token || token === "undefined" || token === "null") {
      return `${base}/${API_VERSION}/shares/${encodedCollection}`;
    }
    const encodedToken = encodeURIComponent(token);
    return `${base}/${API_VERSION}/shares/${encodedCollection}/${encodedToken}`;
  }

  function buildCollectionQueryUrl(base, collection, query) {
    const url = new URL(buildShareUrl(base, collection, null));
    const params = query && typeof query === "object" ? query : {};
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const text = String(value).trim();
      if (!text) return;
      url.searchParams.set(String(key), text);
    });
    return url.toString();
  }

  function buildShareBatchUrl(base, collection) {
    const encodedCollection = encodeURIComponent(collection);
    return `${base}/${API_VERSION}/shares/${encodedCollection}:batch`;
  }

  function buildShareBatchGetUrl(base, collection) {
    const encodedCollection = encodeURIComponent(collection);
    return `${base}/${API_VERSION}/shares/${encodedCollection}:batchGet`;
  }

  function buildShareBatchDeleteUrl(base, collection) {
    const encodedCollection = encodeURIComponent(collection);
    return `${base}/${API_VERSION}/shares/${encodedCollection}:batchDelete`;
  }

  function buildShareBatchCreateUrl(base, collection) {
    const encodedCollection = encodeURIComponent(collection);
    return `${base}/${API_VERSION}/shares/${encodedCollection}:batchCreate`;
  }

  function buildAssetUrl(base, assetId) {
    const encodedId = encodeURIComponent(assetId);
    return `${base}/${API_VERSION}/assets/${encodedId}`;
  }

  function normalizeBase64(input) {
    let value = String(input || "").trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const rem = value.length % 4;
    if (rem) {
      value += "=".repeat(4 - rem);
    }
    return value;
  }

  function parseImageDataUrl(dataUrl) {
    const raw = String(dataUrl || "").trim();
    const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) return null;
    return {
      mimeType: String(match[1] || "").toLowerCase(),
      contentBase64: normalizeBase64(match[2] || "")
    };
  }

  function shouldProcessHtml(value) {
    if (typeof value !== "string") return false;
    if (!value.includes("<img")) return false;
    return value.includes("data:image/");
  }

  function isPageCollection(collection) {
    return String(collection || "").trim().toLowerCase() === "pages";
  }

  function isPagePayloadReference(payload) {
    return Boolean(
      payload
      && typeof payload === "object"
      && Number(payload.gtkr2) === 1
      && String(payload.type || "").trim() === PAGE_PAYLOAD_REF_TYPE
      && (typeof payload.assetId === "string" || typeof payload.assetUrl === "string")
    );
  }

  function encodeTextToBase64(text) {
    const bytes = textEncoder.encode(String(text || ""));
    return {
      bytes,
      base64: toBase64FromBytes(bytes)
    };
  }

  async function maybeOffloadPagePayload(base, collection, payload, options = {}) {
    if (!isPageCollection(collection)) return payload;
    if (!payload || typeof payload !== "object") return payload;
    if (isPagePayloadReference(payload)) return payload;

    let serialized = "";
    try {
      serialized = JSON.stringify(payload);
    } catch (err) {
      return payload;
    }
    if (!serialized) return payload;

    const encoded = encodeTextToBase64(serialized);
    if (!encoded.bytes?.length || encoded.bytes.length < PAGE_PAYLOAD_OFFLOAD_THRESHOLD_BYTES) {
      return payload;
    }

    logShareDebug("page-payload-offload:start", {
      collection,
      spaceId: resolveSpaceIdForPayload(payload, options),
      bytes: encoded.bytes.length,
      threshold: PAGE_PAYLOAD_OFFLOAD_THRESHOLD_BYTES,
      hasVideo: payloadLikelyHasVideo(payload)
    });

    const scope = String(options.assetScope || options.scope || "pages-payload").trim() || "pages-payload";
    const spaceId = resolveSpaceIdForPayload(payload, options);
    const fileName = `page-payload-${Date.now()}.json`;
    const shouldEncrypt = shouldEncryptMedia(collection, spaceId);
    const uploadPayload = shouldEncrypt
      ? await encryptAssetPayload(
        encoded.base64,
        "application/json",
        fileName,
        spaceId,
        getSpaceById(spaceId)?.spaceJoinCode || ""
      )
      : {
        mimeType: "application/json",
        contentBase64: encoded.base64,
        fileName
      };
    const uploadResult = await uploadAssetWithBase(base, {
      scope,
      fileName: uploadPayload.fileName,
      mimeType: uploadPayload.mimeType,
      contentBase64: uploadPayload.contentBase64
    });
    const assetId = String(uploadResult?.asset?.id || "").trim();
    if (!assetId) return payload;

    logShareDebug("page-payload-offload:done", {
      collection,
      spaceId,
      assetId,
      bytes: encoded.bytes.length,
      hasVideo: payloadLikelyHasVideo(payload)
    });

    return {
      gtkr2: 1,
      type: PAGE_PAYLOAD_REF_TYPE,
      version: PAGE_PAYLOAD_REF_VERSION,
      assetId,
      assetUrl: buildAssetUrl(base, assetId),
      size: encoded.bytes.length,
      spaceId,
      updatedAt: new Date().toISOString()
    };
  }

  async function resolvePagePayloadReference(base, collection, payload) {
    if (!isPageCollection(collection)) return payload;
    if (!isPagePayloadReference(payload)) return payload;

    const assetId = String(payload.assetId || "").trim()
      || extractAssetIdFromUrl(base, String(payload.assetUrl || "").trim());
    if (!assetId) return payload;

    logShareDebug("page-payload-load-from-r2:start", {
      collection,
      assetId,
      spaceId: String(payload.spaceId || "golive").trim().toLowerCase() || "golive"
    });

    let response;
    try {
      response = await fetchWithSyncRetry(buildAssetUrl(base, assetId), {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      });
    } catch (error) {
      throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
    }
    if (!response.ok) {
      logShareDebug("page-payload-load-from-r2:error", {
        collection,
        assetId,
        status: response.status
      });
      return payload;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const rawBytes = new Uint8Array(await response.arrayBuffer());
    let payloadBytes = rawBytes;

    const effectiveSpaceId = String(payload.spaceId || "golive").trim().toLowerCase() || "golive";
    const looksLikeEncryptedEnvelope = rawBytes.length > 2 && rawBytes[0] === 123 && rawBytes[1] === 34;
    if (contentType.includes(E2EE_ASSET_MIME) || looksLikeEncryptedEnvelope) {
      try {
        const decrypted = await decryptAssetEnvelope(rawBytes, effectiveSpaceId);
        if (decrypted?.bytes?.length) {
          payloadBytes = decrypted.bytes;
        }
      } catch (error) {
        if (contentType.includes(E2EE_ASSET_MIME)) {
          console.warn("Impossible de déchiffrer le payload de page offloadé", error);
        }
      }
    }

    try {
      const text = textDecoder.decode(payloadBytes);
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        logShareDebug("page-payload-load-from-r2:done", {
          collection,
          assetId,
          bytes: payloadBytes.length,
          hasVideo: payloadLikelyHasVideo(parsed)
        });
        return parsed;
      }
      return payload;
    } catch (error) {
      console.warn("Payload de page offloadé invalide", error);
      logShareDebug("page-payload-load-from-r2:parse-error", {
        collection,
        assetId,
        message: String(error?.message || error || "")
      });
      return payload;
    }
  }

  function markNetworkFailure(error) {
    if (error && typeof error === "object") {
      error.__goToolkitShareNetworkFailure = true;
    }
    return error;
  }

  function isNetworkFailure(error) {
    return Boolean(error && error.__goToolkitShareNetworkFailure);
  }

  async function withWorkerFallback(task) {
    let lastNetworkError = null;
    for (const base of workerBases) {
      try {
        return await task(base);
      } catch (error) {
        if (isNetworkFailure(error)) {
          lastNetworkError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastNetworkError || new Error("Service de partage indisponible");
  }

  async function fetchWithBase(base, collection, token, options) {
    const requestOptions = Object.assign({}, options || {});
    const method = String(requestOptions.method || "GET").toUpperCase();
    let url = buildShareUrl(base, collection, token);
    if (method === "GET") {
      const parsed = new URL(url);
      parsed.searchParams.set("_ts", String(Date.now()));
      url = parsed.toString();
      requestOptions.cache = "no-store";
    }
    return fetchWithSyncRetry(url, requestOptions);
  }

  async function uploadAssetWithBase(base, uploadPayload) {
    const url = `${base}/${API_VERSION}/assets/upload`;
    logShareDebug("r2-asset-upload:start", {
      scope: uploadPayload?.scope || "",
      fileName: uploadPayload?.fileName || "",
      mimeType: uploadPayload?.mimeType || "",
      contentBase64Length: String(uploadPayload?.contentBase64 || "").length
    });
    const response = await fetchWithSyncRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(uploadPayload || {})
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logShareDebug("r2-asset-upload:error", {
        status: response.status,
        message: body || "Upload asset impossible"
      });
      throw new Error(body || "Upload asset impossible");
    }
    const data = await response.json().catch(() => ({}));
    logShareDebug("r2-asset-upload:done", {
      assetId: data?.asset?.id || "",
      size: data?.asset?.size || 0,
      mimeType: data?.asset?.mimeType || ""
    });
    return data;
  }

  async function processHtmlInlineAssets(html, base, options = {}) {
    if (!shouldProcessHtml(html)) return html;
    if (typeof DOMParser === "undefined") return html;
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html), "text/html");
    if (!doc || !doc.body) return html;

    const scope = String(options.assetScope || options.scope || "shared").trim() || "shared";
    const imgNodes = Array.from(doc.querySelectorAll("img[src^='data:image/']"));
    if (!imgNodes.length) return html;

    for (const img of imgNodes) {
      const src = String(img.getAttribute("src") || "").trim();
      const parsed = parseImageDataUrl(src);
      if (!parsed?.contentBase64) continue;
      const mimeType = parsed.mimeType;
      if (!["image/png", "image/jpeg", "image/jpg", "image/gif"].includes(mimeType)) continue;
      const fileNameAttr = String(img.getAttribute("data-file-name") || img.getAttribute("title") || "").trim();
      const ext = mimeType === "image/png" ? "png" : mimeType === "image/gif" ? "gif" : "jpg";
      const fileName = fileNameAttr || `image.${ext}`;
      const shouldEncrypt = shouldEncryptMedia(options?.collection || "", options?.spaceId);
      const encryptedAsset = shouldEncrypt
        ? await encryptAssetPayload(
          parsed.contentBase64,
          mimeType,
          fileName,
          options?.spaceId,
          getSpaceById(options?.spaceId)?.spaceJoinCode || ""
        )
        : { mimeType, contentBase64: parsed.contentBase64, fileName };
      const uploadResult = await uploadAssetWithBase(base, {
        scope,
        fileName: encryptedAsset.fileName,
        mimeType: encryptedAsset.mimeType,
        contentBase64: encryptedAsset.contentBase64
      });
      const assetId = String(uploadResult?.asset?.id || "").trim();
      if (!assetId) continue;
      img.setAttribute("src", buildAssetUrl(base, assetId));
      img.setAttribute("data-gt-asset-id", assetId);
    }

    return doc.body.innerHTML;
  }

  async function processPayloadInlineAssets(payload, base, options = {}) {
    async function walk(value) {
      if (typeof value === "string") {
        return processHtmlInlineAssets(value, base, options);
      }
      if (Array.isArray(value)) {
        const items = await Promise.all(value.map(item => walk(item)));
        return items;
      }
      if (!value || typeof value !== "object") {
        return value;
      }
      const next = {};
      for (const [key, entry] of Object.entries(value)) {
        next[key] = await walk(entry);
      }
      return next;
    }
    return walk(payload);
  }

  function assertReady() {
    if (!isReady) {
      throw new Error("Le service de partage Cloudflare n'est pas configuré.");
    }
  }

  async function fetchSharePayload(collection, token, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        Accept: "application/json"
      }), {
        method: "GET",
        collection,
        spaceId: resolveRequestSpaceId(collection, token, options)
      });
      const response = await fetchWithBase(base, collection, token, {
        method: "GET",
        headers: authHeaders
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Accès impossible au partage");
      }
      const data = await response.json();
      const payload = data.payload || null;
      const decryptedPayload = await decryptPagePayload(payload, collection).catch(err => {
        console.warn("E2EE page: déchiffrement impossible", err);
        return payload;
      });
      const resolvedPayload = await resolvePagePayloadReference(base, collection, decryptedPayload);
      const hydratedPayload = resolvedPayload && (collection === "pages")
        ? await hydratePayloadAssetUrls(resolvedPayload, base, {
          spaceId: String(resolvedPayload?.spaceId || decryptedPayload?.spaceId || payload?.spaceId || "golive").trim().toLowerCase()
        })
        : resolvedPayload;
      return {
        payload: hydratedPayload,
        meta: data.meta || null
      };
    });
  }

  async function deleteSharePayload(collection, token, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        Accept: "application/json"
      }), {
        method: "DELETE",
        collection,
        spaceId: resolveRequestSpaceId(collection, token, options)
      });
      const response = await fetchWithBase(base, collection, token, {
        method: "DELETE",
        headers: authHeaders
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de supprimer le partage");
      }
      return true;
    });
  }

  async function listShares(collection, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      const query = {};
      if ((collection === "pages" || collection === "pages-meta") && options?.spaceId) {
        query.spaceId = options.spaceId;
      }
      const url = Object.keys(query).length ? buildCollectionQueryUrl(base, collection, query) : buildShareUrl(base, collection, null);
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        Accept: "application/json"
      }), {
        method: "GET",
        collection,
        spaceId: resolveRequestSpaceId(collection, "", options)
      });
      const response = await fetchWithSyncRetry(url, {
        method: "GET",
        headers: authHeaders
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de récupérer la liste");
      }
      const data = await response.json();
      const docs = Array.isArray(data.documents) ? data.documents : [];
      return Promise.all(docs.map(async doc => {
        const payload = doc?.payload || null;
        const decryptedPayload = await decryptPagePayload(payload, collection).catch(err => {
          console.warn("E2EE page: déchiffrement impossible", err);
          return payload;
        });
        const resolvedPayload = await resolvePagePayloadReference(base, collection, decryptedPayload);
        const hydratedPayload = resolvedPayload && (collection === "pages")
          ? await hydratePayloadAssetUrls(resolvedPayload, base, {
            spaceId: String(resolvedPayload?.spaceId || decryptedPayload?.spaceId || payload?.spaceId || "golive").trim().toLowerCase()
          })
          : resolvedPayload;
        return {
          id: doc.id,
          payload: hydratedPayload,
          meta: doc.meta || null
        };
      }));
    });
  }

  async function saveSharePayload(collection, token, payload, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      const normalizedToken =
        !token || token === "undefined" || token === "null" ? null : token;
      const url = buildShareUrl(base, collection, normalizedToken);
      const method = normalizedToken ? "PUT" : "POST";
      const shouldInlineAssets = Boolean(options && options.inlineAssets);
      const spaceId = resolveSpaceIdForPayload(payload, options);
      const preparedInlinePayload = shouldInlineAssets
        ? await processPayloadInlineAssets(payload, base, {
          assetScope: options.assetScope || collection,
          collection,
          spaceId
        })
        : payload;
      const preparedPayload = await maybeOffloadPagePayload(base, collection, preparedInlinePayload, {
        assetScope: options.assetScope || collection,
        scope: options.scope,
        spaceId
      });
      const encryptedPayload = await encryptPagePayload(preparedPayload, collection, spaceId);
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        "Content-Type": "application/json",
        Accept: "application/json"
      }), {
        method,
        collection,
        spaceId
      });
      const response = await fetchWithSyncRetry(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({ payload: encryptedPayload })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de sauvegarder le partage");
      }
      const data = await response.json();
      if (normalizedToken) {
        rememberTokenSpaceId(collection, normalizedToken, spaceId);
      }
      return data.meta || data;
    });
  }

  async function saveSharePayloadBatch(collection, writes) {
    assertReady();
    const normalizedWrites = Array.isArray(writes)
      ? writes
        .map(entry => ({
          id: String(entry?.id || "").trim(),
          payload: entry?.payload
        }))
        .filter(entry => entry.id)
      : [];
    if (!normalizedWrites.length) {
      return { count: 0, results: [] };
    }
    return withWorkerFallback(async base => {
      const preparedWrites = [];
      for (const entry of normalizedWrites) {
        const payload = entry?.payload;
        const spaceId = resolveSpaceIdForPayload(payload || {}, {});
        const preparedPayload = await maybeOffloadPagePayload(base, collection, payload, {
          assetScope: collection,
          spaceId
        });
        const encryptedPayload = await encryptPagePayload(preparedPayload, collection, spaceId);
        preparedWrites.push({
          id: entry.id,
          payload: encryptedPayload
        });
      }
      const uniqueSpaceIds = Array.from(new Set(preparedWrites.map(entry => resolveSpaceIdForPayload(entry?.payload || {}, {}))));
      if (uniqueSpaceIds.length !== 1) {
        throw new Error("Le lot doit cibler un seul spaceId");
      }
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        "Content-Type": "application/json",
        Accept: "application/json"
      }), {
        method: "POST",
        collection,
        spaceId: uniqueSpaceIds[0]
      });
      const results = [];
      for (const chunkWrites of chunkArray(preparedWrites, BATCH_WRITES_CHUNK_SIZE)) {
        const response = await fetchWithSyncRetry(buildShareBatchUrl(base, collection), {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ writes: chunkWrites })
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(body || "Impossible de sauvegarder le lot");
        }
        const data = await response.json().catch(() => ({ count: chunkWrites.length, results: [] }));
        if (Array.isArray(data?.results)) {
          results.push(...data.results);
        }
      }
      for (const entry of preparedWrites) {
        rememberTokenSpaceId(collection, entry?.id, uniqueSpaceIds[0]);
      }
      return { count: preparedWrites.length, results };
    });
  }

  async function fetchSharePayloadBatch(collection, ids, options = {}) {
    assertReady();
    const normalizedIds = Array.isArray(ids)
      ? ids.map(id => String(id || "").trim()).filter(Boolean)
      : [];
    if (!normalizedIds.length) {
      return { count: 0, documents: [] };
    }
    return withWorkerFallback(async base => {
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        "Content-Type": "application/json",
        Accept: "application/json"
      }), {
        method: "POST",
        collection,
        spaceId: resolveRequestSpaceId(collection, "", options)
      });
      const docs = [];
      for (const chunkIds of chunkArray(normalizedIds, BATCH_IDS_CHUNK_SIZE)) {
        const response = await fetchWithSyncRetry(buildShareBatchGetUrl(base, collection), {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ ids: chunkIds })
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(body || "Impossible de récupérer le lot");
        }
        const data = await response.json().catch(() => ({ documents: [] }));
        const chunkDocs = Array.isArray(data?.documents) ? data.documents : [];
        for (const item of chunkDocs) {
          rememberTokenSpaceId(collection, item?.id, options?.spaceId || item?.payload?.spaceId || "golive");
        }
        docs.push(...chunkDocs);
      }
      const shouldHydrateAssets = options?.hydrateAssets !== false;
      const hydratedDocs = await Promise.all(docs.map(async doc => {
        const payload = doc?.payload || null;
        const decryptedPayload = await decryptPagePayload(payload, collection).catch(err => {
          console.warn("E2EE page: déchiffrement impossible", err);
          return payload;
        });
        const resolvedPayload = await resolvePagePayloadReference(base, collection, decryptedPayload);
        const hydratedPayload = shouldHydrateAssets && resolvedPayload && (collection === "pages")
          ? await hydratePayloadAssetUrls(resolvedPayload, base, {
            spaceId: String(resolvedPayload?.spaceId || decryptedPayload?.spaceId || payload?.spaceId || "golive").trim().toLowerCase()
          })
          : resolvedPayload;
        return {
          id: doc?.id,
          payload: hydratedPayload,
          meta: doc?.meta || null
        };
      }));
      return {
        count: normalizedIds.length,
        documents: hydratedDocs
      };
    });
  }

  function normalizeSpaceId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  }

  function rememberTokenSpaceId(collection, token, spaceId) {
    const normalizedCollection = String(collection || "").trim().toLowerCase();
    const normalizedToken = String(token || "").trim();
    const normalizedSpaceId = normalizeSpaceId(spaceId || "");
    if (!normalizedCollection || !normalizedToken || !normalizedSpaceId) return;
    tokenSpaceIdCache.set(`${normalizedCollection}:${normalizedToken}`, normalizedSpaceId);
  }

  function resolveRequestSpaceId(collection, token, options = {}) {
    const explicit = normalizeSpaceId(options?.spaceId || "");
    if (explicit) return explicit;
    const normalizedCollection = String(collection || "").trim().toLowerCase();
    const normalizedToken = String(token || "").trim();
    if (normalizedCollection && normalizedToken) {
      const cached = normalizeSpaceId(tokenSpaceIdCache.get(`${normalizedCollection}:${normalizedToken}`) || "");
      if (cached) return cached;
    }
    if (normalizedCollection === "pages" || normalizedCollection === "pages-meta") {
      const spacesApi = window.GoToolkitSpaces;
      const allSpaces = typeof spacesApi?.readSpaces === "function" ? spacesApi.readSpaces() : [];
      const withCode = (Array.isArray(allSpaces) ? allSpaces : [])
        .filter(item => {
          const hasJoinCode = Boolean(normalizeSpaceJoinCode(item?.spaceJoinCode || ""));
          const hasManagedAccess = Boolean(item?.accessManaged) && String(item?.accessMode || "").trim().toLowerCase() === "oauth";
          return normalizeSpaceId(item?.id || "") && (hasJoinCode || hasManagedAccess);
        })
        .map(item => normalizeSpaceId(item?.id || ""));
      if (withCode.length === 1) return withCode[0];
      if (withCode.includes("golive")) return "golive";
      if (withCode.length > 1) {
        const nonDefault = withCode.find(id => id !== "golive");
        if (nonDefault) return nonDefault;
      }
      return "golive";
    }
    return "";
  }

  async function authenticateSpaceWithCode(base, spaceId, spaceCodeRaw) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const spaceCode = normalizeSpaceJoinCode(spaceCodeRaw);
    if (!normalizedSpaceId || !spaceCode) return null;
    const requestBody = {
      spaceId: normalizedSpaceId,
      spaceCode
    };
    const response = await fetchWithSyncRetry(`${base}/${API_VERSION}/spaces/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || "Auth espace impossible");
    }
    const data = await response.json().catch(() => ({}));
    const token = String(data?.token || "").trim();
    const expiresAt = Number(data?.expiresAt || 0);
    if (!token || !Number.isFinite(expiresAt)) {
      throw new Error("Token espace invalide");
    }
    spaceAuthTokenCache.set(normalizedSpaceId, { token, expiresAt });
    return token;
  }

  async function authenticateSpaceWithOauth(base, spaceId) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    if (!normalizedSpaceId) return null;
    const identity = await getOauthIdentityAssertion();
    if (!identity?.identityToken) return null;
    const response = await fetchWithSyncRetry(`${base}/${API_VERSION}/spaces/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        spaceId: normalizedSpaceId,
        identityToken: identity.identityToken
      })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || "Auth espace OAuth impossible");
    }
    const data = await response.json().catch(() => ({}));
    const token = String(data?.token || "").trim();
    const expiresAt = Number(data?.expiresAt || 0);
    if (!token || !Number.isFinite(expiresAt)) {
      throw new Error("Token espace invalide");
    }
    spaceAuthTokenCache.set(normalizedSpaceId, { token, expiresAt });
    return token;
  }

  async function getSpaceAuthToken(base, spaceId) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    if (!normalizedSpaceId) return null;
    const now = Date.now();
    const cached = spaceAuthTokenCache.get(normalizedSpaceId);
    if (cached && cached.token && Number(cached.expiresAt || 0) > now + 10_000) {
      return cached.token;
    }
    const space = getSpaceById(normalizedSpaceId);
    const spaceCode = normalizeSpaceJoinCode(space?.spaceJoinCode || "");
    if (spaceCode) {
      return authenticateSpaceWithCode(base, normalizedSpaceId, spaceCode);
    }
    return authenticateSpaceWithOauth(base, normalizedSpaceId);
  }

  async function rotateSpaceJoinCode(spaceId, currentSpaceCodeRaw, nextSpaceCodeRaw) {
    assertReady();
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const currentSpaceCode = normalizeSpaceJoinCode(currentSpaceCodeRaw);
    const nextSpaceCode = normalizeSpaceJoinCode(nextSpaceCodeRaw);
    if (!normalizedSpaceId) {
      throw new Error("spaceId manquant");
    }
    if (!currentSpaceCode || !nextSpaceCode) {
      throw new Error("Code espace manquant");
    }
    if (currentSpaceCode === nextSpaceCode) {
      return { ok: true, rotated: false };
    }
    return withWorkerFallback(async base => {
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        "Content-Type": "application/json",
        Accept: "application/json"
      }), {
        method: "POST",
        collection: "pages",
        spaceId: normalizedSpaceId
      });
      const response = await fetchWithSyncRetry(`${base}/${API_VERSION}/spaces/auth/rotate`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          spaceId: normalizedSpaceId,
          currentSpaceCode,
          nextSpaceCode
        })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de mettre à jour le code espace");
      }
      const data = await response.json().catch(() => ({}));
      const token = String(data?.token || "").trim();
      const expiresAt = Number(data?.expiresAt || 0);
      if (token && Number.isFinite(expiresAt)) {
        spaceAuthTokenCache.set(normalizedSpaceId, { token, expiresAt });
      } else {
        spaceAuthTokenCache.delete(normalizedSpaceId);
      }
      return {
        ok: true,
        rotated: Boolean(data?.rotated),
        token,
        expiresAt
      };
    });
  }

  async function withSpaceAuthHeaders(base, headers, options = {}) {
    const method = String(options?.method || "GET").toUpperCase();
    const collection = String(options?.collection || "").trim().toLowerCase();
    const shouldAuth = Boolean(
      method !== "OPTIONS"
      && (collection === "pages" || collection === "pages-meta")
    );
    if (!shouldAuth) return headers || {};
    const spaceId = normalizeSpaceId(options?.spaceId || "");
    if (!spaceId) {
      throw new Error("spaceId requis pour cette opération");
    }
    const token = await getSpaceAuthToken(base, spaceId);
    if (!token) {
      throw new Error("Code d'accès espace requis");
    }
    return Object.assign({}, headers || {}, {
      "X-Space-Id": spaceId,
      "X-Space-Auth": token
    });
  }

  async function verifySpaceCredentials(spaceId, spaceCodeRaw) {
    assertReady();
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const normalizedSpaceCode = normalizeSpaceJoinCode(spaceCodeRaw);
    if (!normalizedSpaceId || !normalizedSpaceCode) {
      throw new Error("spaceId et code d'accès requis");
    }
    return withWorkerFallback(async base => {
      await authenticateSpaceWithCode(base, normalizedSpaceId, normalizedSpaceCode);
      return { ok: true, spaceId: normalizedSpaceId };
    });
  }

  function collectAssetIdsFromPayload(payload) {
    const ids = new Set();
    const walk = value => {
      if (typeof value === "string") {
        for (const m of value.matchAll(/\/v1\/assets\/([A-Za-z0-9_-]+)/g)) ids.add(m[1]);
        for (const m of value.matchAll(/data-gt-asset-id=["']([A-Za-z0-9_-]+)["']/g)) ids.add(m[1]);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(payload);
    return Array.from(ids);
  }

  async function prefetchAssets(assetIds, options = {}) {
    assertReady();
    const normalizedIds = Array.isArray(assetIds)
      ? Array.from(new Set(assetIds.map(id => String(id || "").trim()).filter(Boolean)))
      : [];
    if (!normalizedIds.length) {
      return { count: 0, prefetched: 0, failed: 0 };
    }
    const spaceId = String(options?.spaceId || "golive").trim().toLowerCase() || "golive";
    return withWorkerFallback(async base => {
      let prefetched = 0;
      let failed = 0;
      for (const assetId of normalizedIds) {
        const key = `${base}::${spaceId}::${assetId}`;
        if (assetBlobCache.has(key)) continue;
        try {
          const assetUrl = buildAssetUrl(base, assetId);
          const resolved = await resolveAssetBlobUrl(base, assetUrl, spaceId);
          if (resolved && resolved !== assetUrl) {
            prefetched += 1;
          }
        } catch (err) {
          failed += 1;
        }
      }
      return { count: normalizedIds.length, prefetched, failed };
    });
  }

  async function materializePayloadAssets(collection, payload, options = {}) {
    assertReady();
    if (!payload || typeof payload !== "object") {
      return { payload, changed: false, uploadedAssets: 0 };
    }
    return withWorkerFallback(async base => {
      const spaceId = resolveSpaceIdForPayload(payload, options);
      const before = JSON.stringify(payload || {});
      const processed = await processPayloadInlineAssets(payload, base, {
        assetScope: options.assetScope || collection,
        collection,
        spaceId
      });
      const after = JSON.stringify(processed || {});
      const changed = before !== after;
      const uploadedAssets = changed
        ? Math.max(0, collectAssetIdsFromPayload(processed).length - collectAssetIdsFromPayload(payload).length)
        : 0;
      return {
        payload: processed,
        changed,
        uploadedAssets
      };
    });
  }

  async function deleteSharePayloadBatch(collection, ids) {
    assertReady();
    const normalizedIds = Array.isArray(ids)
      ? ids.map(id => String(id || "").trim()).filter(Boolean)
      : [];
    if (!normalizedIds.length) {
      return { count: 0, results: [] };
    }
    return withWorkerFallback(async base => {
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        "Content-Type": "application/json",
        Accept: "application/json"
      }), {
        method: "POST",
        collection,
        spaceId: resolveRequestSpaceId(collection, "", {})
      });
      const results = [];
      for (const chunkIds of chunkArray(normalizedIds, BATCH_IDS_CHUNK_SIZE)) {
        const response = await fetchWithSyncRetry(buildShareBatchDeleteUrl(base, collection), {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ ids: chunkIds })
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(body || "Impossible de supprimer le lot");
        }
        const data = await response.json().catch(() => ({ count: chunkIds.length, results: [] }));
        if (Array.isArray(data?.results)) {
          results.push(...data.results);
        }
      }
      return { count: normalizedIds.length, results };
    });
  }

  async function createSharePayloadBatch(collection, writes) {
    assertReady();
    const normalizedWrites = Array.isArray(writes)
      ? writes
        .map(entry => ({
          id: String(entry?.id || "").trim(),
          contentPayload: entry?.contentPayload,
          metaPayload: entry?.metaPayload
        }))
        .filter(entry => entry.id && entry.contentPayload && entry.metaPayload)
      : [];
    if (!normalizedWrites.length) {
      return { count: 0, results: [] };
    }
    return withWorkerFallback(async base => {
      const preparedWrites = [];
      for (const entry of normalizedWrites) {
        const contentPayload = entry?.contentPayload;
        const spaceId = resolveSpaceIdForPayload(contentPayload || {}, {});
        const preparedContentPayload = await maybeOffloadPagePayload(base, collection, contentPayload, {
          assetScope: collection,
          spaceId
        });
        const encryptedContentPayload = await encryptPagePayload(preparedContentPayload, collection, spaceId);
        preparedWrites.push({
          id: entry.id,
          contentPayload: encryptedContentPayload,
          metaPayload: entry.metaPayload
        });
      }
      const uniqueSpaceIds = Array.from(new Set(preparedWrites.map(entry => resolveSpaceIdForPayload(entry?.contentPayload || {}, {}))));
      if (uniqueSpaceIds.length !== 1) {
        throw new Error("Le lot doit cibler un seul spaceId");
      }
      const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
        "Content-Type": "application/json",
        Accept: "application/json"
      }), {
        method: "POST",
        collection,
        spaceId: uniqueSpaceIds[0]
      });
      const results = [];
      for (const chunkWrites of chunkArray(preparedWrites, BATCH_WRITES_CHUNK_SIZE)) {
        const response = await fetchWithSyncRetry(buildShareBatchCreateUrl(base, collection), {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ writes: chunkWrites })
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(body || "Impossible de créer le lot");
        }
        const data = await response.json().catch(() => ({ count: chunkWrites.length, results: [] }));
        if (Array.isArray(data?.results)) {
          results.push(...data.results);
        }
      }
      return { count: preparedWrites.length, results };
    });
  }

  async function listShareTree(collection, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      const url = buildCollectionQueryUrl(base, collection, {
        view: "tree",
        spaceId: options?.spaceId,
        includeArchived: options?.includeArchived ? "1" : ""
      });
      console.log("[SSO Debug] fetch share tree start", {
        collection,
        spaceId: resolveRequestSpaceId(collection, "", options),
        url
      });
      let response;
      try {
        const authHeaders = await withSpaceAuthHeaders(base, mergeSyncHeaders({
          Accept: "application/json"
        }), {
          method: "GET",
          collection,
          spaceId: resolveRequestSpaceId(collection, "", options)
        });
        response = await fetchWithSyncRetry(url, {
          method: "GET",
          cache: "no-store",
          headers: authHeaders
        });
      } catch (error) {
        throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de récupérer l'arborescence");
      }
      const data = await response.json().catch(() => ({}));
      console.log("[SSO Debug] fetch share tree success", {
        collection,
        spaceId: resolveRequestSpaceId(collection, "", options),
        count: Array.isArray(data.documents) ? data.documents.length : 0,
        watermark: String(data.watermark || "").trim()
      });
      return {
        documents: Array.isArray(data.documents) ? data.documents : [],
        watermark: String(data.watermark || "").trim()
      };
    });
  }

  async function uploadAsset(payload, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      const scope = String(options.assetScope || options.scope || "shared").trim() || "shared";
      const spaceId = String(options?.spaceId || "golive").trim().toLowerCase() || "golive";
      let finalPayload = Object.assign({}, payload || {}, { scope });
      if (shouldEncryptMedia(String(options?.collection || "pages"), spaceId)) {
        const encryptedAsset = await encryptAssetPayload(
          String(payload?.contentBase64 || ""),
          String(payload?.mimeType || "application/octet-stream"),
          String(payload?.fileName || "asset.bin"),
          spaceId,
          getSpaceById(spaceId)?.spaceJoinCode || ""
        );
        finalPayload = Object.assign({}, finalPayload, encryptedAsset);
      }
      const data = await uploadAssetWithBase(base, finalPayload);
      if (data?.asset?.id) {
        data.asset.url = buildAssetUrl(base, data.asset.id);
      }
      return data;
    });
  }

  async function deleteAsset(assetId) {
    assertReady();
    return withWorkerFallback(async base => {
      const url = buildAssetUrl(base, assetId);
      let response;
      try {
        response = await fetchWithSyncRetry(url, {
          method: "DELETE",
          headers: { Accept: "application/json" }
        });
      } catch (error) {
        throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
      }
      if (!response.ok && response.status !== 404) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Suppression asset impossible");
      }
      return true;
    });
  }

  async function probePagePayloadJoinCode(payload, spaceId, joinCodeRaw) {
    if (!isEncryptedPagePayload(payload)) return false;
    const normalizedSpaceId = String(spaceId || payload?.spaceId || "").trim().toLowerCase();
    const joinCode = normalizeSpaceJoinCode(joinCodeRaw);
    if (!normalizedSpaceId || !joinCode) return false;
    try {
      const key = await deriveSpaceKey(normalizedSpaceId, joinCode);
      if (!key) return false;
      const iv = bytesFromBase64(payload.iv || "");
      const ciphertext = bytesFromBase64(payload.ciphertext || "");
      const plainBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      const plainText = textDecoder.decode(plainBuffer);
      const parsed = JSON.parse(plainText);
      return Boolean(parsed && typeof parsed === "object");
    } catch (error) {
      return false;
    }
  }

  window.goToolkitShareWorker = window.goToolkitShareWorker || {
    baseUrl: workerBases[0] || "",
    fallbackBaseUrls: workerBases.slice(1),
    version: API_VERSION,
    isReady,
    fetchSharePayload,
    fetchSharePayloadBatch,
    createSharePayloadBatch,
    deleteSharePayloadBatch,
    saveSharePayload,
    saveSharePayloadBatch,
    materializePayloadAssets,
    prefetchAssets,
    deleteSharePayload,
    listShares,
    listShareTree,
    uploadAsset,
    deleteAsset,
    rotateSpaceJoinCode,
    verifySpaceCredentials,
    probePagePayloadJoinCode,
    buildAssetUrl: assetId => buildAssetUrl(workerBases[0], assetId)
  };
})();
