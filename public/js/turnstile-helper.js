(function (global) {
    const TURNSTILE_API_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    const DEFAULT_SITE_KEY = "0x4AAAAAACjmeCdEpb5qa3dL";
    const PROTECTED_HOSTS = new Set([
        "openrouter.gotoolkit.workers.dev",
        "googletts.gotoolkit.workers.dev",
        "assemblyai.gotoolkit.workers.dev"
    ]);

    let loadPromise = null;
    let widgetPromise = null;
    let widgetId = null;
    let executeChain = Promise.resolve();
    let widgetTokenResolver = null;
    let widgetTokenRejecter = null;
    const WIDGET_CONTAINER_ID = "go-toolkit-turnstile-container";
    const DIAGNOSTIC_LIMIT = 50;

    function pushDiagnostic(event, details) {
        try {
            const entry = {
                at: new Date().toISOString(),
                event: String(event || "").trim() || "unknown",
                details: details && typeof details === "object" ? details : {}
            };
            if (!Array.isArray(global.__goToolkitTurnstileDiagnostics)) {
                global.__goToolkitTurnstileDiagnostics = [];
            }
            global.__goToolkitTurnstileDiagnostics.push(entry);
            if (global.__goToolkitTurnstileDiagnostics.length > DIAGNOSTIC_LIMIT) {
                global.__goToolkitTurnstileDiagnostics.splice(0, global.__goToolkitTurnstileDiagnostics.length - DIAGNOSTIC_LIMIT);
            }
        } catch (err) {
            // ignore diagnostics failures
        }
    }

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
                pushDiagnostic("script-already-ready");
                resolve(global.turnstile);
                return;
            }
            const existing = document.querySelector('script[data-go-toolkit-turnstile="1"]');
            if (existing) {
                pushDiagnostic("script-existing-tag-found");
                waitForTurnstileReady(resolve, reject, Date.now());
                return;
            }
            const script = document.createElement("script");
            script.src = TURNSTILE_API_SRC;
            script.async = true;
            script.defer = true;
            script.dataset.goToolkitTurnstile = "1";
            script.onload = function () {
                pushDiagnostic("script-loaded");
                waitForTurnstileReady(resolve, reject, Date.now());
            };
            script.onerror = function () {
                pushDiagnostic("script-load-failed", { src: TURNSTILE_API_SRC });
                reject(new Error("TURNSTILE_LOAD_FAILED"));
            };
            pushDiagnostic("script-appended", { src: TURNSTILE_API_SRC });
            document.head.appendChild(script);
        }).catch(function (error) {
            loadPromise = null;
            pushDiagnostic("script-load-error", { error: String(error?.message || error || "") });
            throw error;
        });
        return loadPromise;
    }

    function ensureWidgetContainer() {
        let container = document.getElementById(WIDGET_CONTAINER_ID);
        if (container) return container;
        container = document.createElement("div");
        container.id = WIDGET_CONTAINER_ID;
        container.setAttribute("aria-hidden", "true");
        container.style.position = "fixed";
        container.style.right = "0";
        container.style.bottom = "0";
        container.style.width = "1px";
        container.style.height = "1px";
        container.style.opacity = "0";
        container.style.pointerEvents = "none";
        container.style.zIndex = "-1";
        document.body.appendChild(container);
        return container;
    }

    function settleTokenResolver(error, token) {
        const resolve = widgetTokenResolver;
        const reject = widgetTokenRejecter;
        widgetTokenResolver = null;
        widgetTokenRejecter = null;
        if (error) {
            pushDiagnostic("token-rejected", { error: String(error?.message || error || "") });
            if (typeof reject === "function") {
                reject(error);
            }
            return;
        }
        pushDiagnostic("token-resolved", { hasToken: Boolean(String(token || "").trim()) });
        if (typeof resolve === "function") {
            resolve(String(token || "").trim());
        }
    }

    async function ensureWidget() {
        if (widgetPromise) return widgetPromise;
        widgetPromise = ensureTurnstileLoaded().then(function (turnstile) {
            if (widgetId !== null && widgetId !== undefined) {
                pushDiagnostic("widget-reused", { widgetId: String(widgetId) });
                return { turnstile, widgetId };
            }
            const container = ensureWidgetContainer();
            const renderedId = turnstile.render(container, {
                sitekey: getSiteKey(),
                execution: "execute",
                appearance: "interaction-only",
                size: "normal",
                callback: function (token) {
                    pushDiagnostic("widget-callback", { hasToken: Boolean(String(token || "").trim()) });
                    settleTokenResolver(null, token);
                },
                "expired-callback": function () {
                    pushDiagnostic("widget-expired");
                    settleTokenResolver(new Error("TURNSTILE_TOKEN_EXPIRED"));
                },
                "error-callback": function () {
                    pushDiagnostic("widget-error");
                    settleTokenResolver(new Error("TURNSTILE_EXECUTE_FAILED"));
                },
                "timeout-callback": function () {
                    pushDiagnostic("widget-timeout-callback");
                    settleTokenResolver(new Error("TURNSTILE_EXECUTE_TIMEOUT"));
                }
            });
            widgetId = renderedId;
            pushDiagnostic("widget-rendered", {
                widgetId: String(renderedId),
                siteKey: getSiteKey().slice(0, 8)
            });
            return { turnstile, widgetId: renderedId };
        }).catch(function (error) {
            widgetPromise = null;
            widgetId = null;
            pushDiagnostic("widget-error-final", { error: String(error?.message || error || "") });
            throw error;
        });
        return widgetPromise;
    }

    async function getTokenForUrl(input, action) {
        const siteKey = getSiteKey();
        if (!siteKey || !shouldProtectUrl(input)) return "";
        const rendered = await ensureWidget();
        const runExecute = async function () {
            pushDiagnostic("execute-start", {
                host: String(normalizeUrl(input)?.hostname || ""),
                action: deriveAction(input, action),
                widgetId: String(rendered.widgetId)
            });
            if (widgetTokenResolver || widgetTokenRejecter) {
                settleTokenResolver(new Error("TURNSTILE_EXECUTE_CANCELLED"));
            }
            try {
                if (typeof rendered.turnstile.reset === "function") {
                    pushDiagnostic("widget-reset", { widgetId: String(rendered.widgetId) });
                    rendered.turnstile.reset(rendered.widgetId);
                }
            } catch (err) {
                pushDiagnostic("widget-reset-error", { error: String(err?.message || err || "") });
                // ignore reset issues and attempt execution anyway
            }
            const actionName = deriveAction(input, action);
            const token = await new Promise(function (resolve, reject) {
                const timeoutId = global.setTimeout(function () {
                    settleTokenResolver(new Error("TURNSTILE_EXECUTE_TIMEOUT"));
                }, 15000);
                widgetTokenResolver = function (nextToken) {
                    global.clearTimeout(timeoutId);
                    resolve(nextToken);
                };
                widgetTokenRejecter = function (error) {
                    global.clearTimeout(timeoutId);
                    reject(error);
                };
                try {
                    rendered.turnstile.execute(rendered.widgetId, {
                        action: actionName
                    });
                    pushDiagnostic("execute-dispatched", {
                        action: actionName,
                        widgetId: String(rendered.widgetId)
                    });
                    const immediateToken = typeof rendered.turnstile.getResponse === "function"
                        ? String(rendered.turnstile.getResponse(rendered.widgetId) || "").trim()
                        : "";
                    if (immediateToken) {
                        pushDiagnostic("execute-immediate-token", { hasToken: true });
                        settleTokenResolver(null, immediateToken);
                    }
                } catch (error) {
                    settleTokenResolver(error);
                }
            });
            pushDiagnostic("execute-finished", {
                action: actionName,
                hasToken: Boolean(String(token || "").trim())
            });
            return String(token || "").trim();
        };

        const token = await executeChain.then(runExecute, runExecute);
        executeChain = Promise.resolve(token).catch(function () {
            return "";
        });
        return token;
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
        getHeadersForUrl,
        getDiagnostics: function () {
            return Array.isArray(global.__goToolkitTurnstileDiagnostics)
                ? global.__goToolkitTurnstileDiagnostics.slice()
                : [];
        },
        clearDiagnostics: function () {
            global.__goToolkitTurnstileDiagnostics = [];
        }
    };
})(window);
