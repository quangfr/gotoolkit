;(function (global) {
    const configPath = (global.GoToolkitSiteConfigPath || "data/config.json").trim();
    let cachedConfig = normalizeConfig(
        global.GoToolkitSiteConfig?.getData?.() ||
            global.GoToolkitSiteConfigData ||
            global.GoToolkitSiteConfig?.data
    );
    let configPromise = null;

    function normalizeConfig(value) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return value;
        }
        return {};
    }

    function resolveUrl(path) {
        try {
            return new URL(path, global.location.href).href;
        } catch (err) {
            return path;
        }
    }

    function getCacheBuster() {
        try {
            const script = document.currentScript;
            if (script && script.src) {
                const url = new URL(script.src, global.location.href);
                return url.searchParams.get("v") || "";
            }
        } catch (err) {
            // ignore
        }
        return "";
    }

    function appendCacheBuster(path, cacheBuster) {
        if (!cacheBuster) return path;
        if (path.includes("?")) {
            return `${path}&v=${cacheBuster}`;
        }
        return `${path}?v=${cacheBuster}`;
    }

    function setConfig(value) {
        cachedConfig = normalizeConfig(value);
        return cachedConfig;
    }

    function loadConfig() {
        if (configPromise) return configPromise;
        if (typeof fetch !== "function") {
            configPromise = Promise.resolve(setConfig(cachedConfig));
            return configPromise;
        }
        const cacheBuster = getCacheBuster();
        const resolvedPath = resolveUrl(appendCacheBuster(configPath, cacheBuster));
        configPromise = fetch(resolvedPath, { cache: "no-store" })
            .then(response => {
                if (!response.ok) {
                    throw new Error("Config fetch failed");
                }
                return response.json();
            })
            .catch(() => ({}))
            .then(setConfig);
        return configPromise;
    }

    function reloadConfig() {
        configPromise = null;
        return loadConfig();
    }

    function getConfig(path, fallback) {
        if (!path) {
            return cachedConfig;
        }
        const keys = String(path).split(".");
        let pointer = cachedConfig;
        for (const key of keys) {
            if (pointer && typeof pointer === "object" && Object.prototype.hasOwnProperty.call(pointer, key)) {
                pointer = pointer[key];
            } else {
                return fallback;
            }
        }
        return pointer !== undefined ? pointer : fallback;
    }

    const api = global.GoToolkitSiteConfig && typeof global.GoToolkitSiteConfig === "object"
        ? global.GoToolkitSiteConfig
        : {};

    api.getData = () => cachedConfig;
    api.get = getConfig;
    api.reload = reloadConfig;

    global.GoToolkitSiteConfig = api;

    if (global.GoToolkitSiteConfigPromise && typeof global.GoToolkitSiteConfigPromise.then === "function") {
        configPromise = global.GoToolkitSiteConfigPromise;
        configPromise.then(setConfig).catch(() => {});
    } else {
        global.GoToolkitSiteConfigPromise = loadConfig();
    }
})(window);
