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

  async function saveSharePayload(collection, token, payload) {
    assertReady();
    return withWorkerFallback(async base => {
      const normalizedToken =
        !token || token === "undefined" || token === "null" ? null : token;
      const url = buildShareUrl(base, collection, normalizedToken);
      const method = normalizedToken ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ payload })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || "Impossible de sauvegarder le partage");
      }
      const data = await response.json();
      return data.meta || data;
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
    listShares
  };
})();
