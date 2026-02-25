; (function (global) {
    var STORAGE_KEYS = {
        API_KEY: "go-toolkit-api-key",
        OPENAI_MODEL: "go-toolkit-openai-model",
        CONTEXT_WINDOW: "go-toolkit-context-window"
    };
    var STORAGE_KEYS_BACKEND = "go-toolkit-ai-backend";
    var STORAGE_KEYS_OPENROUTER = {
        API_KEY: "go-toolkit-openrouter-key",
        MODEL: "go-toolkit-openrouter-model",
        OCR_MODEL: "go-toolkit-openrouter-ocr-model",
        EMBEDDINGS_MODEL: "go-toolkit-openrouter-embeddings-model",
        REASONING_EFFORT: "go-toolkit-openrouter-reasoning-effort"
    };

    var DEFAULTS = {
        OPENAI_MODEL: "gpt-5-nano",
        CONTEXT_WINDOW: "0",
        OPENROUTER_MODEL: "openai/gpt-oss-120b",
        OPENROUTER_OCR_MODEL: "qwen/qwen2.5-vl-72b-instruct",
        OPENROUTER_EMBEDDINGS_MODEL: "qwen/qwen3-embedding-8b",
        OPENROUTER_REASONING_EFFORT: "low"
    };

    var OPENAI_MODELS = ["gpt-5-nano", "gpt-5-mini"];
    var OPENROUTER_MODELS = [
        "openai/gpt-oss-120b",
    ];

    var OPENAI_ENDPOINTS = {
        responses: "https://api.openai.com/v1/responses",
        chat: "https://api.openai.com/v1/chat/completions"
    };

    var PROXY_ENDPOINTS = {
        responses: "https://openai.gotoolkit.workers.dev/v1/responses",
        chat: "https://openai.gotoolkit.workers.dev/v1/chat/completions"
    };

    var OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
    var OPENROUTER_PROXY_ENDPOINT = "https://openrouter.gotoolkit.workers.dev/api/v1/chat/completions";
    var OPENROUTER_EMBEDDINGS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
    var OPENROUTER_EMBEDDINGS_PROXY_ENDPOINT = "https://openrouter.gotoolkit.workers.dev/api/v1/embeddings";


    function safeStorageRead(key) {
        if (!global || !global.localStorage) {
            return "";
        }
        try {
            return global.localStorage.getItem(key) || "";
        } catch (err) {
            console.warn("GoToolkit IA config read failed", err);
            return "";
        }
    }

    function safeStorageWrite(key, value) {
        if (!global || !global.localStorage) {
            return;
        }
        try {
            if (value) {
                global.localStorage.setItem(key, value);
            } else {
                global.localStorage.removeItem(key);
            }
        } catch (err) {
            console.warn("GoToolkit IA config write failed", err);
        }
    }

    function normalizeUrl(value) {
        var trimmed = (value || "").trim();
        if (!trimmed) {
            return "";
        }
        if (!/^https?:\/\//i.test(trimmed)) {
            trimmed = "http://" + trimmed;
        }
        return trimmed.replace(/\/+$/, "");
    }

    var GoToolkitIAConfig = {
        OPENAI_MODELS: OPENAI_MODELS,
        getApiKey: function () {
            return (safeStorageRead(STORAGE_KEYS.API_KEY) || "").trim();
        },
        setApiKey: function (value) {
            safeStorageWrite(STORAGE_KEYS.API_KEY, (value || "").trim());
        },
        getOpenAiModel: function () {
            var model = safeStorageRead(STORAGE_KEYS.OPENAI_MODEL);
            return model || DEFAULTS.OPENAI_MODEL;
        },
        setOpenAiModel: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENAI_MODEL;
            }
            safeStorageWrite(STORAGE_KEYS.OPENAI_MODEL, normalized);
        },
        getContextWindow: function () {
            var val = (safeStorageRead(STORAGE_KEYS.CONTEXT_WINDOW) || "").trim();
            if (!val) return DEFAULTS.CONTEXT_WINDOW;
            return val;
        },
        setContextWindow: function (value) {
            var normalized = String(value || "").trim();
            if (!/^\d+$/.test(normalized)) {
                normalized = DEFAULTS.CONTEXT_WINDOW;
            }
            safeStorageWrite(STORAGE_KEYS.CONTEXT_WINDOW, normalized);
        },
        getOpenRouterApiKey: function () {
            return (safeStorageRead(STORAGE_KEYS_OPENROUTER.API_KEY) || "").trim();
        },
        setOpenRouterApiKey: function (value) {
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.API_KEY, (value || "").trim());
        },
        getOpenRouterModel: function () {
            var model = safeStorageRead(STORAGE_KEYS_OPENROUTER.MODEL);
            if (!model) {
                model = DEFAULTS.OPENROUTER_MODEL;
            }
            return model;
        },
        setOpenRouterModel: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENROUTER_MODEL;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.MODEL, normalized);
        },
        getOpenRouterOcrModel: function () {
            var model = safeStorageRead(STORAGE_KEYS_OPENROUTER.OCR_MODEL);
            if (!model) {
                model = DEFAULTS.OPENROUTER_OCR_MODEL;
            }
            return model;
        },
        setOpenRouterOcrModel: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENROUTER_OCR_MODEL;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.OCR_MODEL, normalized);
        },
        getOpenRouterEmbeddingsModel: function () {
            var model = safeStorageRead(STORAGE_KEYS_OPENROUTER.EMBEDDINGS_MODEL);
            if (!model) {
                model = DEFAULTS.OPENROUTER_EMBEDDINGS_MODEL;
            }
            return model;
        },
        setOpenRouterEmbeddingsModel: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENROUTER_EMBEDDINGS_MODEL;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.EMBEDDINGS_MODEL, normalized);
        },
        getOpenRouterReasoningEffort: function () {
            var effort = (safeStorageRead(STORAGE_KEYS_OPENROUTER.REASONING_EFFORT) || "").trim().toLowerCase();
            if (!effort) {
                effort = DEFAULTS.OPENROUTER_REASONING_EFFORT;
            }
            if (!/^(minimal|low|medium|high)$/.test(effort)) {
                effort = DEFAULTS.OPENROUTER_REASONING_EFFORT;
            }
            return effort;
        },
        setOpenRouterReasoningEffort: function (value) {
            var normalized = (value || "").trim().toLowerCase();
            if (!/^(minimal|low|medium|high)$/.test(normalized)) {
                normalized = DEFAULTS.OPENROUTER_REASONING_EFFORT;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.REASONING_EFFORT, normalized);
        },
        isOpenRouterAvailable: function () {
            return Boolean(GoToolkitIAConfig.getOpenRouterApiKey() || OPENROUTER_PROXY_ENDPOINT);
        },
        getBackend: function () {
            return safeStorageRead(STORAGE_KEYS_BACKEND) || "openrouter";
        },
        setBackend: function (value) {
            var v = (value || "").trim().toLowerCase();
            if (!v) v = "openrouter";
            safeStorageWrite(STORAGE_KEYS_BACKEND, v);
        },
        DEFAULTS: DEFAULTS,
        OPENAI_ENDPOINTS: OPENAI_ENDPOINTS,
        PROXY_ENDPOINTS: PROXY_ENDPOINTS,
        OPENROUTER_MODELS: OPENROUTER_MODELS,
        OPENROUTER_ENDPOINT: OPENROUTER_ENDPOINT,
        OPENROUTER_PROXY_ENDPOINT: OPENROUTER_PROXY_ENDPOINT,
        OPENROUTER_EMBEDDINGS_ENDPOINT: OPENROUTER_EMBEDDINGS_ENDPOINT,
        OPENROUTER_EMBEDDINGS_PROXY_ENDPOINT: OPENROUTER_EMBEDDINGS_PROXY_ENDPOINT
    };

    var GoToolkitAIBackend = (function () {
        async function getBackend(endpointType, options) {
            var type = endpointType === "chat" ? "chat" : "responses";
            options = options || {};
            var forceProxy = options.forceProxy === true;
            var forceOpenRouterProxy = options.forceOpenRouterProxy === true || Boolean(global?.GoToolkitForceOpenRouterProxy);
            // respect explicit force to use the public proxy
            if (forceProxy) {
                return {
                    type: "proxy",
                    endpoint: PROXY_ENDPOINTS[type],
                    apiKey: "",
                    model: GoToolkitIAConfig.getOpenAiModel()
                };
            }
            // Check selected backend preference (global flag or storage)
            var selected = (global.GoToolkitSelectedAIBackend && String(global.GoToolkitSelectedAIBackend)) || safeStorageRead(STORAGE_KEYS_BACKEND) || "openrouter";

            if (selected === "openai") {
                var apiKey = GoToolkitIAConfig.getApiKey();
                if (apiKey) {
                    return {
                        type: "openai",
                        endpoint: OPENAI_ENDPOINTS[type],
                        apiKey: apiKey,
                        model: GoToolkitIAConfig.getOpenAiModel()
                    };
                }
                // no key -> fall back to proxy when OpenAI selected
                return {
                    type: "proxy",
                    endpoint: PROXY_ENDPOINTS[type],
                    apiKey: "",
                    model: GoToolkitIAConfig.getOpenAiModel()
                };
            }

            if (selected === "openrouter") {
                var openrouterKey = GoToolkitIAConfig.getOpenRouterApiKey();
                var openrouterModel = GoToolkitIAConfig.getOpenRouterModel();
                var useProxy = forceOpenRouterProxy || !openrouterKey;
                var targetEndpoint = useProxy ? OPENROUTER_PROXY_ENDPOINT : OPENROUTER_ENDPOINT;
                var backendType = useProxy ? "openrouter-proxy" : "openrouter";
                var apiKeyValue = useProxy ? "" : openrouterKey;
                var openrouterHasKey = !useProxy;
                return {
                    type: backendType,
                    endpoint: targetEndpoint,
                    apiKey: apiKeyValue,
                    model: openrouterModel,
                    dataCollection: "deny",
                    zdr: true,
                    edit: openrouterHasKey,
                    hasOpenRouterKey: openrouterHasKey
                };
            }

            // default behavior: prefer API key, then proxy
            var apiKey = GoToolkitIAConfig.getApiKey();
            if (apiKey) {
                return {
                    type: "openai",
                    endpoint: OPENAI_ENDPOINTS[type],
                    apiKey: apiKey,
                    model: GoToolkitIAConfig.getOpenAiModel()
                };
            }
            return {
                type: "proxy",
                endpoint: PROXY_ENDPOINTS[type],
                apiKey: "",
                model: GoToolkitIAConfig.getOpenAiModel()
            };
        }

        return {
            getBackend: getBackend
        };
    })();

    global.GoToolkitIAConfig = global.GoToolkitIAConfig || GoToolkitIAConfig;
    global.GoToolkitAIBackend = global.GoToolkitAIBackend || GoToolkitAIBackend;
})(window);
