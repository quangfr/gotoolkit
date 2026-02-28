; (function (global) {
    var STORAGE_KEYS = {
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
    var STORAGE_KEYS_SERVICES = {
        GOOGLE_TTS_API_KEY: "go-toolkit-googletts-key"
    };

    var DEFAULTS = {
        CONTEXT_WINDOW: "0",
        OPENROUTER_MODEL: "openai/gpt-oss-120b",
        OPENROUTER_OCR_MODEL: "nvidia/nemotron-nano-12b-v2-vl",
        OPENROUTER_EMBEDDINGS_MODEL: "qwen/qwen3-embedding-8b",
        OPENROUTER_REASONING_EFFORT: "low"
    };

    var OPENROUTER_MODELS = [
        "openai/gpt-oss-120b",
    ];

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

    var GoToolkitIAConfig = {
        getApiKey: function () {
            // OpenAI keys are no longer supported.
            return "";
        },
        setApiKey: function (value) {
            // Remove legacy key if still present.
            safeStorageWrite("go-toolkit-api-key", "");
        },
        getOpenAiModel: function () {
            // OpenAI model selection is no longer supported.
            return "";
        },
        setOpenAiModel: function (value) {
            // Remove legacy model if still present.
            safeStorageWrite("go-toolkit-openai-model", "");
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
        getGoogleTtsApiKey: function () {
            return (safeStorageRead(STORAGE_KEYS_SERVICES.GOOGLE_TTS_API_KEY) || "").trim();
        },
        setGoogleTtsApiKey: function (value) {
            safeStorageWrite(STORAGE_KEYS_SERVICES.GOOGLE_TTS_API_KEY, (value || "").trim());
        },
        isOpenRouterAvailable: function () {
            return Boolean(GoToolkitIAConfig.getOpenRouterApiKey() || OPENROUTER_PROXY_ENDPOINT);
        },
        getBackend: function () {
            return "openrouter";
        },
        setBackend: function (value) {
            // Keep storage normalized to openrouter to clear legacy values.
            safeStorageWrite(STORAGE_KEYS_BACKEND, "openrouter");
        },
        DEFAULTS: DEFAULTS,
        OPENROUTER_MODELS: OPENROUTER_MODELS,
        OPENROUTER_ENDPOINT: OPENROUTER_ENDPOINT,
        OPENROUTER_PROXY_ENDPOINT: OPENROUTER_PROXY_ENDPOINT,
        OPENROUTER_EMBEDDINGS_ENDPOINT: OPENROUTER_EMBEDDINGS_ENDPOINT,
        OPENROUTER_EMBEDDINGS_PROXY_ENDPOINT: OPENROUTER_EMBEDDINGS_PROXY_ENDPOINT
    };

    var GoToolkitAIBackend = (function () {
        async function getBackend(endpointType, options) {
            options = options || {};
            var forceOpenRouterProxy = options.forceOpenRouterProxy === true || Boolean(global?.GoToolkitForceOpenRouterProxy);
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

        return {
            getBackend: getBackend
        };
    })();

    global.GoToolkitIAConfig = global.GoToolkitIAConfig || GoToolkitIAConfig;
    global.GoToolkitAIBackend = global.GoToolkitAIBackend || GoToolkitAIBackend;
})(window);
