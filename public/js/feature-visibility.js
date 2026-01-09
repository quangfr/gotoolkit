;(function (global) {
    const doc = global.document;
    if (!doc) return;

    const configApi = global.GoToolkitSiteConfig;

    function resolveFrom(obj, path) {
        if (!obj) return undefined;
        const keys = String(path || "").split(".");
        let cursor = obj;
        for (const key of keys) {
            if (!cursor || typeof cursor !== "object") return undefined;
            if (!Object.prototype.hasOwnProperty.call(cursor, key)) return undefined;
            cursor = cursor[key];
        }
        return cursor;
    }

    function getFlag(path, fallback) {
        if (configApi && typeof configApi.get === "function") {
            const value = configApi.get(path);
            if (value !== undefined) return Boolean(value);
        }
        if (configApi && typeof configApi.getData === "function") {
            const value = resolveFrom(configApi.getData(), path);
            if (value !== undefined) return Boolean(value);
        }
        return fallback;
    }

    function applyVisibility() {
        const hideTimeline = getFlag("features.hideTimeline", false);
        const hideVoice = getFlag("features.hideVoice", false);
        const hideAssist = getFlag("features.hideAssist", false);

        if (hideTimeline) {
            doc.querySelectorAll('[data-app="timeline"]').forEach(el => {
                el.hidden = true;
            });
        }
        if (hideVoice) {
            doc.querySelectorAll('[data-app="voice"]').forEach(el => {
                el.hidden = true;
            });
        }
        if (hideAssist) {
            doc.querySelectorAll('[data-app="assist"]').forEach(el => {
                el.hidden = true;
            });
        }
    }

    function run() {
        applyVisibility();
        const promise = global.GoToolkitSiteConfigPromise;
        if (promise && typeof promise.then === "function") {
            promise.then(() => applyVisibility()).catch(() => {});
        }
    }

    run();
})(window);
