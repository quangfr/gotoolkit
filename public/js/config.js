;(function (global) {
    const configPath = (global.GoToolkitSiteConfigPath || "config.json").trim();
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
        configPromise = fetch(resolveUrl(configPath), { cache: "no-store" })
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
