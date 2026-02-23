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
  const PBKDF2_ITERATIONS = 310000;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const assetBlobCache = new Map();
  const spaceKeyCache = new Map();

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
    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
    }
    return response;
  }

  async function uploadAssetWithBase(base, uploadPayload) {
    const url = `${base}/${API_VERSION}/assets/upload`;
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(uploadPayload || {})
      });
    } catch (error) {
      throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || "Upload asset impossible");
    }
    const data = await response.json().catch(() => ({}));
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

  async function fetchSharePayload(collection, token) {
    assertReady();
    return withWorkerFallback(async base => {
      const response = await fetchWithBase(base, collection, token, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
      const hydratedPayload = decryptedPayload && (collection === "pages")
        ? await hydratePayloadAssetUrls(decryptedPayload, base, {
          spaceId: String(decryptedPayload?.spaceId || payload?.spaceId || "golive").trim().toLowerCase()
        })
        : decryptedPayload;
      return {
        payload: hydratedPayload,
        meta: data.meta || null
      };
    });
  }

  async function deleteSharePayload(collection, token) {
    assertReady();
    return withWorkerFallback(async base => {
      const response = await fetchWithBase(base, collection, token, {
        method: "DELETE",
        headers: {
          Accept: "application/json"
        }
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

  async function listShares(collection) {
    assertReady();
    return withWorkerFallback(async base => {
      const response = await fetchWithBase(base, collection, null, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
        const hydratedPayload = decryptedPayload && (collection === "pages")
          ? await hydratePayloadAssetUrls(decryptedPayload, base, {
            spaceId: String(decryptedPayload?.spaceId || payload?.spaceId || "golive").trim().toLowerCase()
          })
          : decryptedPayload;
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
      const preparedPayload = shouldInlineAssets
        ? await processPayloadInlineAssets(payload, base, {
          assetScope: options.assetScope || collection,
          collection,
          spaceId
        })
        : payload;
      const encryptedPayload = await encryptPagePayload(preparedPayload, collection, spaceId);
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ payload: encryptedPayload })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de sauvegarder le partage");
      }
      const data = await response.json();
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
        const encryptedPayload = await encryptPagePayload(payload, collection, spaceId);
        preparedWrites.push({
          id: entry.id,
          payload: encryptedPayload
        });
      }
      let response;
      try {
        response = await fetch(buildShareBatchUrl(base, collection), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ writes: preparedWrites })
        });
      } catch (error) {
        throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de sauvegarder le lot");
      }
      return await response.json().catch(() => ({ count: normalizedWrites.length, results: [] }));
    });
  }

  async function fetchSharePayloadBatch(collection, ids) {
    assertReady();
    const normalizedIds = Array.isArray(ids)
      ? ids.map(id => String(id || "").trim()).filter(Boolean)
      : [];
    if (!normalizedIds.length) {
      return { count: 0, documents: [] };
    }
    return withWorkerFallback(async base => {
      let response;
      try {
        response = await fetch(buildShareBatchGetUrl(base, collection), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ ids: normalizedIds })
        });
      } catch (error) {
        throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de récupérer le lot");
      }
      const data = await response.json().catch(() => ({ documents: [] }));
      const docs = Array.isArray(data?.documents) ? data.documents : [];
      const hydratedDocs = await Promise.all(docs.map(async doc => {
        const payload = doc?.payload || null;
        const decryptedPayload = await decryptPagePayload(payload, collection).catch(err => {
          console.warn("E2EE page: déchiffrement impossible", err);
          return payload;
        });
        const hydratedPayload = decryptedPayload && (collection === "pages")
          ? await hydratePayloadAssetUrls(decryptedPayload, base, {
            spaceId: String(decryptedPayload?.spaceId || payload?.spaceId || "golive").trim().toLowerCase()
          })
          : decryptedPayload;
        return {
          id: doc?.id,
          payload: hydratedPayload,
          meta: doc?.meta || null
        };
      }));
      return {
        count: Number(data?.count || normalizedIds.length),
        documents: hydratedDocs
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
      let response;
      try {
        response = await fetch(buildShareBatchDeleteUrl(base, collection), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ ids: normalizedIds })
        });
      } catch (error) {
        throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de supprimer le lot");
      }
      return await response.json().catch(() => ({ count: normalizedIds.length, results: [] }));
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
        const encryptedContentPayload = await encryptPagePayload(contentPayload, collection, spaceId);
        preparedWrites.push({
          id: entry.id,
          contentPayload: encryptedContentPayload,
          metaPayload: entry.metaPayload
        });
      }
      let response;
      try {
        response = await fetch(buildShareBatchCreateUrl(base, collection), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ writes: preparedWrites })
        });
      } catch (error) {
        throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de créer le lot");
      }
      return await response.json().catch(() => ({ count: normalizedWrites.length, results: [] }));
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
      let response;
      try {
        response = await fetch(url, {
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
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de récupérer l'arborescence");
      }
      const data = await response.json().catch(() => ({}));
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
        response = await fetch(url, {
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
    deleteSharePayload,
    listShares,
    listShareTree,
    uploadAsset,
    deleteAsset,
    probePagePayloadJoinCode,
    buildAssetUrl: assetId => buildAssetUrl(workerBases[0], assetId)
  };
})();
