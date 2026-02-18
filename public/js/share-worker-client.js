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
    const url = buildShareUrl(base, collection, token);
    let response;
    try {
      response = await fetch(url, options);
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
    saveSharePayload,
    deleteSharePayload,
    listShares,
    uploadAsset,
    deleteAsset,
    buildAssetUrl: assetId => buildAssetUrl(workerBases[0], assetId)
  };
})();
