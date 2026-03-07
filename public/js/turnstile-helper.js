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
    let interactiveWidgetPromise = null;
    let interactiveWidgetId = null;
    let executeChain = Promise.resolve();
    let widgetTokenResolver = null;
    let widgetTokenRejecter = null;
    let interactiveChallengeActive = false;
    let lastAttemptSummary = null;
    const WIDGET_CONTAINER_ID = "go-toolkit-turnstile-container";
    const INTERACTIVE_OVERLAY_ID = "go-toolkit-turnstile-overlay";
    const INTERACTIVE_CONTAINER_ID = "go-toolkit-turnstile-interactive";
    const DIAGNOSTIC_LIMIT = 50;
    const INTERACTIVE_TRIGGER_DELAY_MS = 600;
    const INTERACTIVE_TIMEOUT_MS = 120000;
    let interactiveWidgetPrewarmPromise = null;

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

    function setLastAttemptSummary(summary) {
        lastAttemptSummary = summary && typeof summary === "object"
            ? {
                at: new Date().toISOString(),
                ...summary
            }
            : null;
    }

    function readLastAttemptSummary() {
        return lastAttemptSummary ? { ...lastAttemptSummary } : null;
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
        const pageOrigin = normalizeUrl(global.location?.href || "");
        if (pageOrigin && isLocalOrigin(pageOrigin.origin)) {
            return false;
        }
        return PROTECTED_HOSTS.has(String(url.hostname || "").trim().toLowerCase());
    }

    function isLocalOrigin(origin) {
        const normalized = String(origin || "").trim();
        if (!normalized) return false;
        return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(normalized);
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
        container.style.left = "-10000px";
        container.style.top = "0";
        // Keep a valid render box for Turnstile even though it remains off-screen.
        container.style.width = "320px";
        container.style.height = "70px";
        container.style.opacity = "0";
        container.style.pointerEvents = "none";
        container.style.zIndex = "-1";
        document.body.appendChild(container);
        return container;
    }

    function ensureInteractiveOverlay() {
        let overlay = document.getElementById(INTERACTIVE_OVERLAY_ID);
        if (overlay) {
            return {
                overlay,
                container: overlay.querySelector("#" + INTERACTIVE_CONTAINER_ID)
            };
        }
        overlay = document.createElement("div");
        overlay.id = INTERACTIVE_OVERLAY_ID;
        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.display = "none";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.background = "rgba(15, 23, 42, 0.65)";
        overlay.style.zIndex = "2147483647";

        const card = document.createElement("div");
        card.style.width = "min(92vw, 420px)";
        card.style.padding = "16px";
        card.style.borderRadius = "14px";
        card.style.background = "#ffffff";
        card.style.boxShadow = "0 24px 64px rgba(15, 23, 42, 0.28)";
        card.style.color = "#0f172a";
        card.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

        const title = document.createElement("div");
        title.textContent = "Vérification humaine";
        title.style.fontSize = "16px";
        title.style.fontWeight = "700";
        title.style.marginBottom = "8px";
        card.appendChild(title);

        const text = document.createElement("div");
        text.textContent = "Pour continuer, confirmez rapidement que vous n'êtes pas un robot.";
        text.style.fontSize = "13px";
        text.style.lineHeight = "1.45";
        text.style.marginBottom = "12px";
        card.appendChild(text);

        const container = document.createElement("div");
        container.id = INTERACTIVE_CONTAINER_ID;
        container.style.minHeight = "70px";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        card.appendChild(container);

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        return { overlay, container };
    }

    function showInteractiveOverlay() {
        const parts = ensureInteractiveOverlay();
        if (parts?.overlay) {
            parts.overlay.style.display = "flex";
            pushDiagnostic("interactive-overlay-shown");
        }
        return parts;
    }

    function hideInteractiveOverlay() {
        const overlay = document.getElementById(INTERACTIVE_OVERLAY_ID);
        if (overlay) {
            overlay.style.display = "none";
            overlay.setAttribute("aria-hidden", "true");
            pushDiagnostic("interactive-overlay-hidden");
        }
    }

    function closeInteractiveChallenge(reason) {
        interactiveChallengeActive = false;
        hideInteractiveOverlay();
        const activeElement = document.activeElement;
        if (activeElement && typeof activeElement.blur === "function") {
            try {
                activeElement.blur();
            } catch (err) {
                // ignore blur failures
            }
        }
        if (interactiveWidgetId !== null && interactiveWidgetId !== undefined && global.turnstile && typeof global.turnstile.reset === "function") {
            try {
                global.turnstile.reset(interactiveWidgetId);
                pushDiagnostic("interactive-widget-closed", {
                    widgetId: String(interactiveWidgetId),
                    reason: String(reason || "unknown")
                });
            } catch (error) {
                pushDiagnostic("interactive-widget-close-error", {
                    widgetId: String(interactiveWidgetId),
                    reason: String(reason || "unknown"),
                    error: String(error?.message || error || "")
                });
            }
        }
    }

    function ensureInteractiveElements() {
        const parts = ensureInteractiveOverlay();
        return parts?.container ? parts : null;
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
                    const normalizedToken = String(token || "").trim();
                    if (!normalizedToken) {
                        pushDiagnostic("widget-callback-empty-token");
                        return;
                    }
                    if (interactiveChallengeActive) {
                        pushDiagnostic("widget-callback-used-during-interactive", {
                            hasToken: true,
                            tokenLength: normalizedToken.length
                        });
                    } else {
                        pushDiagnostic("widget-callback", { hasToken: true });
                    }
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
            void prewarmInteractiveWidget().catch(function () {
                // ignore prewarm failures; interactive path can still render on demand
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

    async function prewarmInteractiveWidget() {
        if (interactiveWidgetId !== null && interactiveWidgetId !== undefined) {
            return interactiveWidgetId;
        }
        if (interactiveWidgetPromise) {
            const existing = await interactiveWidgetPromise;
            return existing?.widgetId || null;
        }
        if (interactiveWidgetPrewarmPromise) return interactiveWidgetPrewarmPromise;
        interactiveWidgetPrewarmPromise = ensureTurnstileLoaded().then(function (turnstile) {
            const parts = ensureInteractiveElements();
            const container = parts?.container;
            if (!container) return null;
            if (interactiveWidgetId !== null && interactiveWidgetId !== undefined) {
                return interactiveWidgetId;
            }
            const renderedId = turnstile.render(container, {
                sitekey: getSiteKey(),
                appearance: "always",
                size: "normal",
                callback: function (token) {
                    const normalizedToken = String(token || "").trim();
                    if (!normalizedToken) {
                        pushDiagnostic("interactive-callback-empty-token");
                        return;
                    }
                    pushDiagnostic("interactive-callback", {
                        hasToken: true,
                        tokenLength: normalizedToken.length
                    });
                    setLastAttemptSummary({
                        stage: "interactive-token",
                        hasToken: true,
                        tokenLength: normalizedToken.length,
                        widgetId: String(renderedId)
                    });
                    closeInteractiveChallenge("interactive-token");
                    settleTokenResolver(null, token);
                },
                "expired-callback": function () {
                    pushDiagnostic("interactive-expired");
                    setLastAttemptSummary({
                        stage: "interactive-expired",
                        widgetId: String(renderedId)
                    });
                },
                "error-callback": function () {
                    pushDiagnostic("interactive-error");
                    setLastAttemptSummary({
                        stage: "interactive-error",
                        error: "TURNSTILE_INTERACTIVE_FAILED",
                        widgetId: String(renderedId)
                    });
                    closeInteractiveChallenge("interactive-error");
                    settleTokenResolver(new Error("TURNSTILE_INTERACTIVE_FAILED"));
                },
                "timeout-callback": function () {
                    pushDiagnostic("interactive-timeout-callback");
                    setLastAttemptSummary({
                        stage: "interactive-timeout-callback",
                        widgetId: String(renderedId)
                    });
                }
            });
            interactiveWidgetId = renderedId;
            pushDiagnostic("interactive-widget-rendered", {
                widgetId: String(renderedId),
                siteKey: getSiteKey().slice(0, 8),
                prewarmed: true
            });
            return renderedId;
        }).finally(function () {
            interactiveWidgetPrewarmPromise = null;
        });
        return interactiveWidgetPrewarmPromise;
    }

    async function ensureInteractiveWidget() {
        const turnstile = await ensureTurnstileLoaded();
        const parts = showInteractiveOverlay();
        const container = parts?.container;
        if (!container) {
            throw new Error("TURNSTILE_INTERACTIVE_CONTAINER_MISSING");
        }

        if (interactiveWidgetId !== null && interactiveWidgetId !== undefined) {
            try {
                if (typeof turnstile.reset === "function") {
                    pushDiagnostic("interactive-reset", { widgetId: String(interactiveWidgetId) });
                    turnstile.reset(interactiveWidgetId);
                }
            } catch (error) {
                pushDiagnostic("interactive-reset-error", { error: String(error?.message || error || "") });
            }
            pushDiagnostic("interactive-widget-reused", { widgetId: String(interactiveWidgetId) });
            return { turnstile, widgetId: interactiveWidgetId };
        }

        if (interactiveWidgetPromise) {
            return interactiveWidgetPromise;
        }

        interactiveWidgetPromise = Promise.resolve().then(function () {
            return prewarmInteractiveWidget().then(function (renderedId) {
                if (renderedId === null || renderedId === undefined) {
                    throw new Error("TURNSTILE_INTERACTIVE_CONTAINER_MISSING");
                }
                return { turnstile, widgetId: renderedId };
            });
        }).catch(function (error) {
            interactiveWidgetId = null;
            closeInteractiveChallenge("interactive-widget-error-final");
            pushDiagnostic("interactive-widget-error-final", { error: String(error?.message || error || "") });
            throw error;
        }).finally(function () {
            interactiveWidgetPromise = null;
        });

        return interactiveWidgetPromise;
    }

    async function getTokenForUrl(input, action) {
        const siteKey = getSiteKey();
        if (!siteKey || !shouldProtectUrl(input)) return "";
        setLastAttemptSummary({
            stage: "start",
            host: String(normalizeUrl(input)?.hostname || ""),
            action: deriveAction(input, action),
            siteKeyConfigured: Boolean(siteKey)
        });
        const rendered = await ensureWidget();
        const runExecute = async function () {
            const normalizedHost = String(normalizeUrl(input)?.hostname || "");
            const actionName = deriveAction(input, action);
            setLastAttemptSummary({
                stage: "executing",
                host: normalizedHost,
                action: actionName,
                widgetId: String(rendered.widgetId)
            });
            pushDiagnostic("execute-start", {
                host: normalizedHost,
                action: actionName,
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
            const token = await new Promise(function (resolve, reject) {
                let interactiveTimeoutId = 0;
                let interactiveStarted = false;
                let settled = false;
                function finalizeResolve(nextToken) {
                    if (settled) return;
                    settled = true;
                    global.clearTimeout(timeoutId);
                    if (interactiveTimeoutId) {
                        global.clearTimeout(interactiveTimeoutId);
                        interactiveTimeoutId = 0;
                    }
                    closeInteractiveChallenge("finalize-resolve");
                    setLastAttemptSummary({
                        stage: "token",
                        host: normalizedHost,
                        action: actionName,
                        widgetId: String(rendered.widgetId),
                        hasToken: Boolean(String(nextToken || "").trim())
                    });
                    resolve(nextToken);
                }
                function finalizeReject(error) {
                    if (settled) return;
                    settled = true;
                    global.clearTimeout(timeoutId);
                    if (interactiveTimeoutId) {
                        global.clearTimeout(interactiveTimeoutId);
                        interactiveTimeoutId = 0;
                    }
                    closeInteractiveChallenge("finalize-reject");
                    setLastAttemptSummary({
                        stage: "reject",
                        host: normalizedHost,
                        action: actionName,
                        widgetId: String(rendered.widgetId),
                        error: String(error?.message || error || "")
                    });
                    reject(error);
                }
                const timeoutId = global.setTimeout(function () {
                    if (settled) return;
                    if (interactiveStarted) return;
                    interactiveStarted = true;
                    interactiveChallengeActive = true;
                    setLastAttemptSummary({
                        stage: "interactive-required",
                        host: normalizedHost,
                        action: actionName,
                        widgetId: String(rendered.widgetId),
                        error: "TURNSTILE_EXECUTE_TIMEOUT"
                    });
                    pushDiagnostic("interactive-required", {
                        host: normalizedHost,
                        action: actionName,
                        widgetId: String(rendered.widgetId)
                    });
                    interactiveTimeoutId = global.setTimeout(function () {
                        if (settled) return;
                        setLastAttemptSummary({
                            stage: "timeout",
                            host: normalizedHost,
                            action: actionName,
                            widgetId: String(rendered.widgetId),
                            error: "TURNSTILE_EXECUTE_TIMEOUT"
                        });
                        closeInteractiveChallenge("interactive-timeout");
                        settleTokenResolver(new Error("TURNSTILE_EXECUTE_TIMEOUT"));
                    }, INTERACTIVE_TIMEOUT_MS);
                    void ensureInteractiveWidget().catch(function (error) {
                        if (settled) return;
                        setLastAttemptSummary({
                            stage: "interactive-failed",
                            host: normalizedHost,
                            action: actionName,
                            widgetId: String(rendered.widgetId),
                            error: String(error?.message || error || "")
                        });
                        if (interactiveTimeoutId) {
                            global.clearTimeout(interactiveTimeoutId);
                            interactiveTimeoutId = 0;
                        }
                        closeInteractiveChallenge("interactive-failed");
                        settleTokenResolver(error);
                    });
                }, INTERACTIVE_TRIGGER_DELAY_MS);
                widgetTokenResolver = finalizeResolve;
                widgetTokenRejecter = finalizeReject;
                try {
                    rendered.turnstile.execute(rendered.widgetId, {
                        action: actionName
                    });
                    pushDiagnostic("execute-dispatched", {
                        action: actionName,
                        widgetId: String(rendered.widgetId)
                    });
                    // Do not use getResponse() shortcut here: it can return a stale token
                    // right after reset(), which then fails server verification as duplicate.
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

        let token = "";
        try {
            token = await executeChain.then(runExecute, runExecute);
        } catch (error) {
            setLastAttemptSummary({
                stage: "failed",
                host: String(normalizeUrl(input)?.hostname || ""),
                action: deriveAction(input, action),
                error: String(error?.message || error || "")
            });
            throw error;
        }
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
        getLastAttemptSummary: function () {
            return readLastAttemptSummary();
        },
        getFailureSummary: function () {
            const latest = readLastAttemptSummary();
            if (!latest) return "";
            const parts = [];
            if (latest.stage) parts.push("etape=" + latest.stage);
            if (latest.error) parts.push("erreur=" + latest.error);
            if (latest.action) parts.push("action=" + latest.action);
            if (latest.host) parts.push("hote=" + latest.host);
            if (latest.widgetId) parts.push("widget=" + latest.widgetId);
            if (typeof latest.hasToken === "boolean") parts.push("token=" + (latest.hasToken ? "oui" : "non"));
            return parts.join(", ");
        },
        getDiagnostics: function () {
            return Array.isArray(global.__goToolkitTurnstileDiagnostics)
                ? global.__goToolkitTurnstileDiagnostics.slice()
                : [];
        },
        clearDiagnostics: function () {
            global.__goToolkitTurnstileDiagnostics = [];
            lastAttemptSummary = null;
        }
    };
})(window);
