"use strict";

(function (global) {
    const SCRIPT_MARK = "data-go-cdn-loader";
    const STYLE_MARK = "data-go-cdn-loader-style";

    const LIBS = {
        mermaid: {
            key: "mermaid",
            test: () => Boolean(global.mermaid && typeof global.mermaid.render === "function"),
            src: "https://cdn.jsdelivr.net/npm/mermaid@11.12.1/dist/mermaid.min.js",
            integrity: "sha384-LlKSgo4Eo5GuF/ZrstLti44dE+GC5XAJ7TSu0Nw9Q3vIZF2QMnkRcK7BUoLabYLF"
        },
        excalidraw: {
            key: "excalidraw",
            test: () => Boolean(global.ExcalidrawLib),
            beforeLoad: () => {
                // Excalidraw export code appends `/dist/excalidraw-assets/` itself for font URLs.
                global.EXCALIDRAW_ASSET_PATH = "/vendor/excalidraw/0.17.6";
            },
            src: "/vendor/excalidraw/0.17.6/dist/excalidraw.production.min.js"
        },
        // Optional dependency removed: invalid package/version caused 404+MIME errors.
        // `memo-source-modal` already falls back to textarea view when JSONViewer is unavailable.
        jsonViewer: null
    };

    const pending = new Map();

    function ensureStylesheet(lib) {
        if (!lib.styleHref) return;
        const selector = `link[${STYLE_MARK}="${lib.key}"]`;
        if (document.querySelector(selector)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = lib.styleHref;
        link.setAttribute(STYLE_MARK, lib.key);
        document.head.appendChild(link);
    }

    function ensureScript(lib) {
        return new Promise((resolve, reject) => {
            const selector = `script[${SCRIPT_MARK}="${lib.key}"]`;
            const existing = document.querySelector(selector);
            if (existing) {
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", (err) => reject(err), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = lib.src;
            script.defer = true;
            script.crossOrigin = "anonymous";
            script.setAttribute(SCRIPT_MARK, lib.key);
            if (lib.integrity) {
                script.integrity = lib.integrity;
            }
            script.onload = () => resolve();
            script.onerror = (err) => reject(err || new Error(`Failed to load ${lib.key}`));
            document.head.appendChild(script);
        });
    }

    function loadLib(lib) {
        if (!lib) return Promise.resolve(null);
        if (lib.test()) return Promise.resolve(true);
        if (pending.has(lib.key)) return pending.get(lib.key);
        const job = Promise.resolve()
            .then(() => {
                if (typeof lib.beforeLoad === "function") lib.beforeLoad();
                ensureStylesheet(lib);
                return ensureScript(lib);
            })
            .then(() => {
                if (!lib.test()) throw new Error(`${lib.key} loaded but unavailable`);
                return true;
            })
            .finally(() => {
                pending.delete(lib.key);
            });
        pending.set(lib.key, job);
        return job;
    }

    function scheduleIdlePrefetch() {
        const run = () => {
            loadLib(LIBS.mermaid).catch(() => { });
            loadLib(LIBS.excalidraw).catch(() => { });
        };
        if (typeof global.requestIdleCallback === "function") {
            global.requestIdleCallback(() => run(), { timeout: 4000 });
            return;
        }
        global.setTimeout(run, 1200);
    }

    global.GoToolkitLazyCdn = Object.freeze({
        loadMermaid: () => loadLib(LIBS.mermaid),
        loadExcalidraw: () => loadLib(LIBS.excalidraw),
        loadJsonViewer: () => loadLib(LIBS.jsonViewer),
        prefetchIdle: scheduleIdlePrefetch
    });

    if (document.readyState === "complete") {
        scheduleIdlePrefetch();
    } else {
        global.addEventListener("load", scheduleIdlePrefetch, { once: true });
    }
})(window);
