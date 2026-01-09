; (function (global) {
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

    function hideElements(root, selector) {
        if (!root) return;
        if (root.matches && root.matches(selector)) {
            root.style.display = "none";
        }
        if (root.querySelectorAll) {
            root.querySelectorAll(selector).forEach(el => {
                el.style.display = "none";
            });
        }
    }

    function applyVisibility() {
        const hideTimeline = getFlag("features.hideTimeline", false);
        const hideVoice = getFlag("features.hideVoice", false);
        const hideAssist = getFlag("features.hideAssist", false);

        if (hideTimeline) {
            hideElements(doc, '[data-app="timeline"]');
        }
        if (hideVoice) {
            hideElements(doc, '[data-app="voice"]');
        }
        if (hideAssist) {
            hideElements(doc, '[data-app="assist"]');
        }

        if (hideTimeline || hideVoice || hideAssist) {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (!(node instanceof Element)) return;
                        if (hideTimeline) hideElements(node, '[data-app="timeline"]');
                        if (hideVoice) hideElements(node, '[data-app="voice"]');
                        if (hideAssist) hideElements(node, '[data-app="assist"]');
                    });
                });
            });
            observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
        }
    }

    function run() {
        const promise = global.GoToolkitSiteConfigPromise;
        if (promise && typeof promise.then === "function") {
            promise.then(() => {
                applyVisibility();
            }).catch(() => {
                applyVisibility();
            });
        } else {
            applyVisibility();
        }
    }

    run();
})(window);
