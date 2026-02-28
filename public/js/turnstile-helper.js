(function (global) {
    const TURNSTILE_API_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    const DEFAULT_SITE_KEY = "0x4AAAAAACjmeCdEpb5qa3dL";
    const PROTECTED_HOSTS = new Set([
        "openrouter.gotoolkit.workers.dev",
        "googletts.gotoolkit.workers.dev",
        "assemblyai.gotoolkit.workers.dev"
    ]);

    let loadPromise = null;

    function getSiteKey() {
        return String(global.GO_TOOLKIT_TURNSTILE_SITE_KEY || DEFAULT_SITE_KEY || "").trim();
    }

    function normalizeUrl(input) {
        const raw = String(input || "").trim();
        if (!raw) return null;
        try {
            return new URL(raw, global.location?.href || "https://gotoolkit.fr/");
        } catch (err) {
            return null;
        }
    }

    function shouldProtectUrl(input) {
        const url = normalizeUrl(input);
        if (!url) return false;
        return PROTECTED_HOSTS.has(String(url.hostname || "").trim().toLowerCase());
    }

    function deriveAction(input, fallbackAction) {
        const fallback = String(fallbackAction || "").trim().toLowerCase();
        if (fallback) return fallback.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "request";
        const url = normalizeUrl(input);
        const host = String(url?.hostname || "").toLowerCase();
        if (host === "openrouter.gotoolkit.workers.dev") return "openrouter";
        if (host === "googletts.gotoolkit.workers.dev") return "googletts";
        if (host === "assemblyai.gotoolkit.workers.dev") return "assemblyai";
        return "request";
    }

    function waitForTurnstileReady(resolve, reject, startTime) {
        if (global.turnstile && typeof global.turnstile.execute === "function") {
            resolve(global.turnstile);
            return;
        }
        if (Date.now() - startTime > 15000) {
            reject(new Error("TURNSTILE_LOAD_TIMEOUT"));
            return;
        }
        global.setTimeout(function () {
            waitForTurnstileReady(resolve, reject, startTime);
        }, 50);
    }

    function ensureTurnstileLoaded() {
        if (loadPromise) return loadPromise;
        loadPromise = new Promise(function (resolve, reject) {
            if (global.turnstile && typeof global.turnstile.execute === "function") {
                resolve(global.turnstile);
                return;
            }
            const existing = document.querySelector('script[data-go-toolkit-turnstile="1"]');
            if (existing) {
                waitForTurnstileReady(resolve, reject, Date.now());
                return;
            }
            const script = document.createElement("script");
            script.src = TURNSTILE_API_SRC;
            script.async = true;
            script.defer = true;
            script.dataset.goToolkitTurnstile = "1";
            script.onload = function () {
                waitForTurnstileReady(resolve, reject, Date.now());
            };
            script.onerror = function () {
                reject(new Error("TURNSTILE_LOAD_FAILED"));
            };
            document.head.appendChild(script);
        }).catch(function (error) {
            loadPromise = null;
            throw error;
        });
        return loadPromise;
    }

    async function getTokenForUrl(input, action) {
        const siteKey = getSiteKey();
        if (!siteKey || !shouldProtectUrl(input)) return "";
        const turnstile = await ensureTurnstileLoaded();
        const token = await turnstile.execute(siteKey, {
            action: deriveAction(input, action)
        });
        return String(token || "").trim();
    }

    async function getHeadersForUrl(input, action) {
        const token = await getTokenForUrl(input, action);
        if (!token) return {};
        return { "X-Turnstile-Token": token };
    }

    global.GoToolkitTurnstile = {
        getSiteKey,
        shouldProtectUrl,
        getTokenForUrl,
        getHeadersForUrl
    };
})(window);
