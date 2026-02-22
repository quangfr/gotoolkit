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

  function buildShareSyncUrl(base, collection) {
    const encodedCollection = encodeURIComponent(collection);
    return `${base}/${API_VERSION}/shares/${encodedCollection}:sync`;
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

      const uploadResult = await uploadAssetWithBase(base, {
        scope,
        fileName,
        mimeType,
        contentBase64: parsed.contentBase64
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
      return {
        payload: data.payload || null,
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
      return (data.documents || []).map(doc => ({
        id: doc.id,
        payload: doc.payload || null,
        meta: doc.meta || null
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
      const preparedPayload = shouldInlineAssets
        ? await processPayloadInlineAssets(payload, base, {
          assetScope: options.assetScope || collection
        })
        : payload;
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ payload: preparedPayload })
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
      let response;
      try {
        response = await fetch(buildShareBatchUrl(base, collection), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ writes: normalizedWrites })
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
      return {
        count: Number(data?.count || normalizedIds.length),
        documents: Array.isArray(data?.documents) ? data.documents : []
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
      let response;
      try {
        response = await fetch(buildShareBatchCreateUrl(base, collection), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ writes: normalizedWrites })
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

  async function syncShareTree(collection, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      let response;
      try {
        response = await fetch(buildShareSyncUrl(base, collection), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            since: options?.since,
            spaceId: options?.spaceId,
            includeArchived: options?.includeArchived ? true : false,
            includeContent: options?.includeContent !== false
          })
        });
      } catch (error) {
        throw markNetworkFailure(error instanceof Error ? error : new Error(String(error)));
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de synchroniser l'arborescence");
      }
      const data = await response.json().catch(() => ({}));
      return {
        mode: String(data.mode || "").trim().toLowerCase() || "full",
        since: String(data.since || "").trim(),
        watermark: String(data.watermark || "").trim(),
        documents: Array.isArray(data.documents) ? data.documents : [],
        contents: Array.isArray(data.contents) ? data.contents : []
      };
    });
  }

  async function uploadAsset(payload, options = {}) {
    assertReady();
    return withWorkerFallback(async base => {
      const scope = String(options.assetScope || options.scope || "shared").trim() || "shared";
      const data = await uploadAssetWithBase(base, Object.assign({}, payload || {}, { scope }));
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
    syncShareTree,
    uploadAsset,
    deleteAsset,
    buildAssetUrl: assetId => buildAssetUrl(workerBases[0], assetId)
  };
})();
