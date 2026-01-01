; (function (global) {
    var STORAGE_KEYS = {
        API_KEY: "go-toolkit-api-key",
        OPENAI_MODEL: "go-toolkit-openai-model",
        OLLAMA_MODEL: "go-toolkit-ollama-model",
        OLLAMA_URL: "go-toolkit-ollama-url",
        OLLAMA_API_KEY: "go-toolkit-ollama-api-key",
        WEBLLM_MODEL: "go-toolkit-webllm-model",
        CONTEXT_WINDOW: "go-toolkit-context-window"
    };
    var STORAGE_KEYS_BACKEND = "go-toolkit-ai-backend";
    var STORAGE_KEYS_OPENROUTER = {
        API_KEY: "go-toolkit-openrouter-key",
        MODEL: "go-toolkit-openrouter-model",
        DATA_COLLECTION: "go-toolkit-openrouter-data-collection",
        MAX_PRICE_PROMPT: "go-toolkit-openrouter-max-price-prompt",
        MAX_PRICE_COMPLETION: "go-toolkit-openrouter-max-price-completion",
        SORT: "go-toolkit-openrouter-sort"
    };

    var DEFAULTS = {
        OPENAI_MODEL: "gpt-5-nano",
        OLLAMA_MODEL: "gemma3",
        OLLAMA_URL: "http://localhost:11434",
        OLLAMA_API_KEY: "",
        WEBLLM_MODEL: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
        CONTEXT_WINDOW: "0",
        OPENROUTER_MODEL: "openai/gpt-oss-120b:free",
        OPENROUTER_DATA_COLLECTION: "allow",
        OPENROUTER_MAX_PRICE_PROMPT: "0",
        OPENROUTER_MAX_PRICE_COMPLETION: "0",
        OPENROUTER_SORT: "price"
    };

    var OPENAI_MODELS = ["gpt-5-nano", "gpt-5-mini"];
    var OLLAMA_MODELS = ["gpt-oss:latest", "gemma3", "ministral-3:latest", "deepseek-r1"];
    var OPENROUTER_MODELS = [
        "openai/gpt-oss-120b:free",
        "openai/gpt-oss-20b:free",
        "meta-llama/llama-3.1-405b-instruct:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "xiaomi/mimo-v2-flash:free",
        "mistralai/mistral-7b-instruct:free",
        "mistralai/mistral-small-3.1-24b-instruct:free",
        "google/gemma-3n-e4b-it:free",
        "google/gemma-3-12b-it:free",
        "google/gemma-3-27b-it:free",
        "openai/gpt-5-mini",
        "openai/gpt-5-nano"
    ];
    function isAllowedWebllmModelId(id) {
        return typeof id === "string" && /q4f16/i.test(id);
    }

    function filterAllowedWebllmModels(list, idSelector) {
        return (list || []).filter(function (entry) {
            var id = idSelector ? idSelector(entry) : entry && entry.id;
            return isAllowedWebllmModelId(id);
        });
    }

    var WEBLLM_MODELS = filterAllowedWebllmModels([
        { id: "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5-Coder-0.5B-q4f16" },
        { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama-3.2-1B-q4f16" },
        { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama-3.2-3B-q4f16" },
        { id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC", label: "DeepSeek-R1-Qwen-7B-q4f16" },
        { id: "Qwen2-7B-Instruct-q4f16_1-MLC", label: "Qwen2-7B-q4f16" },
        { id: "Qwen2-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2-1.5B-q4f16" },
        { id: "Qwen2-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2-0.5B-q4f16" },
        { id: "Phi-3-mini-4k-instruct-q4f16_1-MLC", label: "Phi-3-mini-4k-q4f16" },
        { id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC", label: "TinyLlama-1.1B-q4f16" }
        // Keep list to supported/prebuilt <=7B engines
    ]);

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

    var OLLAMA_GENERATE_PATH = "/api/generate";
    var OLLAMA_CHAT_PATH = "/api/generate";
    var OLLAMA_PING_PATH = "/api/tags";

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

    (function sanitizeWebllmStoredModel() {
        try {
            var stored = safeStorageRead(STORAGE_KEYS.WEBLLM_MODEL) || "";
            var supported = WEBLLM_MODELS.some(function (entry) { return entry.id === stored; });
            if (!supported) {
                safeStorageWrite(STORAGE_KEYS.WEBLLM_MODEL, DEFAULTS.WEBLLM_MODEL);
            }
        } catch (err) { /* ignore */ }
    })();

    var GoToolkitIAConfig = {
        OPENAI_MODELS: OPENAI_MODELS,
        OLLAMA_MODELS: OLLAMA_MODELS,
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
        getOllamaModel: function () {
            var model = safeStorageRead(STORAGE_KEYS.OLLAMA_MODEL);
            return model || DEFAULTS.OLLAMA_MODEL;
        },
        setOllamaModel: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OLLAMA_MODEL;
            }
            safeStorageWrite(STORAGE_KEYS.OLLAMA_MODEL, normalized);
        },
        getOllamaUrl: function () {
            var stored = safeStorageRead(STORAGE_KEYS.OLLAMA_URL);
            var normalized = normalizeUrl(stored);
            return normalized || DEFAULTS.OLLAMA_URL;
        },
        setOllamaUrl: function (value) {
            var normalized = normalizeUrl(value);
            if (!normalized) {
                normalized = DEFAULTS.OLLAMA_URL;
            }
            safeStorageWrite(STORAGE_KEYS.OLLAMA_URL, normalized);
        },
        getOllamaApiKey: function () {
            return (safeStorageRead(STORAGE_KEYS.OLLAMA_API_KEY) || "").trim();
        },
        setOllamaApiKey: function (value) {
            safeStorageWrite(STORAGE_KEYS.OLLAMA_API_KEY, (value || "").trim());
        },
        getWebllmModel: function () {
            var model = safeStorageRead(STORAGE_KEYS.WEBLLM_MODEL);
            if (!model || !WEBLLM_MODELS.find(function (entry) { return entry.id === model; })) {
                return DEFAULTS.WEBLLM_MODEL;
            }
            return model;
        },
        setWebllmModel: function (value) {
            var normalized = (value || "").trim();
            if (!normalized || !WEBLLM_MODELS.find(function (entry) { return entry.id === normalized; })) {
                normalized = DEFAULTS.WEBLLM_MODEL;
            }
            safeStorageWrite(STORAGE_KEYS.WEBLLM_MODEL, normalized);
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
        getOpenRouterDataCollectionOption: function () {
            var stored = safeStorageRead(STORAGE_KEYS_OPENROUTER.DATA_COLLECTION);
            return stored || DEFAULTS.OPENROUTER_DATA_COLLECTION;
        },
        getOpenRouterDataCollection: function () {
            var stored = safeStorageRead(STORAGE_KEYS_OPENROUTER.DATA_COLLECTION);
            if (!stored) {
                stored = DEFAULTS.OPENROUTER_DATA_COLLECTION;
            }
            var parts = stored.split("-");
            return (parts && parts[0]) || DEFAULTS.OPENROUTER_DATA_COLLECTION;
        },
        setOpenRouterDataCollection: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENROUTER_DATA_COLLECTION;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.DATA_COLLECTION, normalized);
        },
        getOpenRouterZdr: function () {
            var stored = safeStorageRead(STORAGE_KEYS_OPENROUTER.DATA_COLLECTION);
            if (!stored) {
                stored = DEFAULTS.OPENROUTER_DATA_COLLECTION;
            }
            return stored.includes("zdr");
        },
        getOpenRouterMaxPricePrompt: function () {
            var stored = safeStorageRead(STORAGE_KEYS_OPENROUTER.MAX_PRICE_PROMPT);
            return stored || DEFAULTS.OPENROUTER_MAX_PRICE_PROMPT;
        },
        setOpenRouterMaxPricePrompt: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENROUTER_MAX_PRICE_PROMPT;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.MAX_PRICE_PROMPT, normalized);
        },
        getOpenRouterMaxPriceCompletion: function () {
            var stored = safeStorageRead(STORAGE_KEYS_OPENROUTER.MAX_PRICE_COMPLETION);
            return stored || DEFAULTS.OPENROUTER_MAX_PRICE_COMPLETION;
        },
        setOpenRouterMaxPriceCompletion: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENROUTER_MAX_PRICE_COMPLETION;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.MAX_PRICE_COMPLETION, normalized);
        },
        getOpenRouterSort: function () {
            var stored = safeStorageRead(STORAGE_KEYS_OPENROUTER.SORT);
            var trimmed = (stored || "").trim();
            return trimmed || DEFAULTS.OPENROUTER_SORT;
        },
        setOpenRouterSort: function (value) {
            var normalized = (value || "").trim();
            if (!normalized) {
                normalized = DEFAULTS.OPENROUTER_SORT;
            }
            safeStorageWrite(STORAGE_KEYS_OPENROUTER.SORT, normalized);
        },
        getBackend: function () {
            return safeStorageRead(STORAGE_KEYS_BACKEND) || "openrouter";
        },
        setBackend: function (value) {
            var v = (value || "").trim().toLowerCase();
            if (!v) v = "openrouter";
            safeStorageWrite(STORAGE_KEYS_BACKEND, v);
        },
        normalizeOllamaUrl: normalizeUrl,
        DEFAULTS: DEFAULTS,
        OPENAI_ENDPOINTS: OPENAI_ENDPOINTS,
        PROXY_ENDPOINTS: PROXY_ENDPOINTS,
        WEBLLM_MODELS: WEBLLM_MODELS,
        OPENROUTER_MODELS: OPENROUTER_MODELS,
        OPENROUTER_ENDPOINT: OPENROUTER_ENDPOINT,
        OPENROUTER_PROXY_ENDPOINT: OPENROUTER_PROXY_ENDPOINT
    };

    var GoToolkitAIBackend = (function () {
        var ongoingProbe = null;
        var lastProbeUrl = "";
        var lastProbeResult = false;

        function isLocalOllama(url) {
            if (!url || typeof url !== "string") return false;
            return /^https?:\/\/(localhost|127(?:\.\d+){3})(:\d+)?/i.test(url.trim());
        }

        function buildOllamaHeaders(url) {
            var headers = {};
            if (GoToolkitIAConfig && typeof GoToolkitIAConfig.getOllamaApiKey === "function") {
                var key = GoToolkitIAConfig.getOllamaApiKey();
                if (key && !isLocalOllama(url)) {
                    headers.Authorization = "Bearer " + key;
                    headers["Ollama-Api-Key"] = key;
                    headers["X-Ollama-Api-Key"] = key;
                }
            }
            return headers;
        }

        function probeOllama(url) {
            if (!url) {
                return Promise.resolve(false);
            }
            if (ongoingProbe && ongoingProbe.url === url) {
                return ongoingProbe.promise;
            }
            var controller = new AbortController();
            var promise = (async function () {
                var timeoutId = setTimeout(function () {
                    controller.abort();
                }, 1800);
                try {
                    var response = await fetch(url + OLLAMA_PING_PATH, {
                        method: "GET",
                        headers: buildOllamaHeaders(url),
                        signal: controller.signal,
                        cache: "no-cache"
                    });
                    var ok = response.ok;
                    console.info(`[GoToolkitIA] Ollama ping ${url + OLLAMA_PING_PATH} -> ${response.status}`);
                    lastProbeResult = ok;
                    lastProbeUrl = url;
                    return ok;
                } catch (err) {
                    lastProbeResult = false;
                    lastProbeUrl = url;
                    return false;
                } finally {
                    clearTimeout(timeoutId);
                    ongoingProbe = null;
                }
            })();
            ongoingProbe = { url: url, promise: promise };
            return promise;
        }

        function resolveOllamaPath(reqType) {
            return reqType === "generate" ? OLLAMA_GENERATE_PATH : OLLAMA_CHAT_PATH;
        }

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
                var dataCollection = GoToolkitIAConfig.getOpenRouterDataCollection();
                var maxPrompt = GoToolkitIAConfig.getOpenRouterMaxPricePrompt();
                var maxCompletion = GoToolkitIAConfig.getOpenRouterMaxPriceCompletion();
                var openrouterSort = GoToolkitIAConfig.getOpenRouterSort();
                var openrouterZdr = GoToolkitIAConfig.getOpenRouterZdr();
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
                    dataCollection: dataCollection,
                    sort: openrouterSort,
                    maxPrice: {
                        prompt: maxPrompt,
                        completion: maxCompletion
                    },
                    zdr: openrouterZdr,
                    edit: openrouterHasKey,
                    hasOpenRouterKey: openrouterHasKey
                };
            }

            // Ollama is intentionally disabled in the launcher UI.
            // If a stale selection remains in localStorage, fall back to OpenRouter.
            if (selected === "ollama") {
                selected = "openrouter";
                safeStorageWrite(STORAGE_KEYS_BACKEND, selected);
                try { global.GoToolkitSelectedAIBackend = selected; } catch (err) { /* ignore */ }
            }

            if (selected === "webllm") {
                return {
                    type: "webllm",
                    endpoint: "",
                    apiKey: "",
                    model: GoToolkitIAConfig.getWebllmModel()
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
            getBackend: getBackend,
            isOllamaAvailable: function () {
                return lastProbeResult;
            },
            getLastProbeInfo: function () {
                return { url: lastProbeUrl, available: lastProbeResult };
            }
        };
    })();

    var WEBLLM_MODULE_URL = "https://esm.sh/@mlc-ai/web-llm";

    var GoToolkitWebLLM = (function () {
        var modulePromise = null;
        var engine = null;
        var modelId = "";
        var installPromise = null;
        var progressHandler = null;
        var swRegistrationPromise = null;
        var cachedAppConfig = null;
        var lastEngineKind = "";

        function isSupportedModel(modelId) {
            if (!isAllowedWebllmModelId(modelId)) {
                return false;
            }
            return !!(cachedAppConfig?.model_list?.find(function (entry) { return entry.model_id === modelId; }) || WEBLLM_MODELS.find(function (entry) { return entry.id === modelId; }));
        }

        function dispatchProgress(value) {
            try {
                if (typeof progressHandler === "function") {
                    progressHandler(value || { progress: 0 });
                }
            } catch (err) {
                console.warn("GoToolkit WebLLM progress hook failed", err);
            }
        }

        function normalizeModel(value) {
            var trimmed = (value || "").trim();
            if (!trimmed) {
                trimmed = DEFAULTS.WEBLLM_MODEL;
            }
            if (!isSupportedModel(trimmed)) {
                trimmed = DEFAULTS.WEBLLM_MODEL;
                try {
                    GoToolkitIAConfig.setWebllmModel(trimmed);
                } catch (err) { /* ignore */ }
            }
            return trimmed;
        }

        function prepareWebllmEnvironment() {
            try {
                // Force browser-only env so WebLLM avoids Node-specific paths.
                global.process = { versions: {}, browser: true };
            } catch (err) { /* ignore */ }
            try {
                var urlShim = {
                    fileURLToPath: function (value) { return value; },
                    URL: global.URL || function (u) { return u; }
                };
                var pathShim = {
                    dirname: function (v) { return v; },
                    normalize: function (v) { return v; },
                    join: function () { return Array.prototype.join.call(arguments, "/"); },
                    resolve: function () { return Array.prototype.join.call(arguments, "/"); },
                    basename: function (p) { return p; },
                    extname: function () { return ""; },
                    sep: "/"
                };
                global.require = function (moduleName) {
                    if (moduleName === "url") return urlShim;
                    if (moduleName === "path") return pathShim;
                    return {};
                };
            } catch (err) { /* ignore */ }
            if (typeof global.createRequire !== "function") {
                try {
                    global.createRequire = function () {
                        return function (moduleName) {
                            if (moduleName === "url") {
                                return {
                                    fileURLToPath: function (value) { return value; },
                                    URL: global.URL || function (u) { return u; }
                                };
                            }
                            if (moduleName === "path") {
                                return {
                                    dirname: function (v) { return v; },
                                    normalize: function (v) { return v; },
                                    join: function () { return Array.prototype.join.call(arguments, "/"); },
                                    resolve: function () { return Array.prototype.join.call(arguments, "/"); },
                                    basename: function (p) { return p; },
                                    extname: function () { return ""; },
                                    sep: "/"
                                };
                            }
                            return {};
                        };
                    };
                } catch (err) {
                    /* ignore */
                }
            }
        }

        function loadModule() {
            if (modulePromise) {
                return modulePromise;
            }
            prepareWebllmEnvironment();
            modulePromise = import(WEBLLM_MODULE_URL).catch(function (err) {
                modulePromise = null;
                throw err;
            });
            return modulePromise;
        }

        async function getAppConfig() {
            if (cachedAppConfig) return cachedAppConfig;
            var mod = await loadModule();
            var prebuilt = mod.prebuiltAppConfig || (mod.default && mod.default.prebuiltAppConfig) || null;
            if (prebuilt && prebuilt.model_list) {
                prebuilt = Object.assign({}, prebuilt, {
                    model_list: filterAllowedWebllmModels(prebuilt.model_list, function (entry) { return entry.model_id; })
                });
            }
            cachedAppConfig = prebuilt;
            return cachedAppConfig;
        }

        function createWebWorkerInstance() {
            if (!global.Worker) return null;
            try {
                return new Worker("/js/webllm-worker.js", { type: "module" });
            } catch (err) {
                console.warn("[GoToolkit WebLLM] Worker creation failed", err);
                return null;
            }
        }

        function registerServiceWorker() {
            if (swRegistrationPromise || !(global.navigator && navigator.serviceWorker)) {
                return swRegistrationPromise;
            }
            swRegistrationPromise = (async function () {
                try {
                    const reg = await navigator.serviceWorker.register("/js/webllm-sw.js", {
                        type: "module",
                        updateViaCache: "none",
                        scope: "/"
                    });
                    return reg;
                } catch (err) {
                    console.warn("[GoToolkit WebLLM] SW register failed", err);
                    return null;
                }
            })();
            return swRegistrationPromise;
        }

        function resetEngine() {
            engine = null;
            modelId = "";
            installPromise = null;
            progressHandler = null;
        }

        async function ensureEngine(value, onProgress) {
            var normalized = normalizeModel(value);
            if (engine && modelId === normalized) {
                if (typeof onProgress === "function") {
                    onProgress({ progress: 1 });
                }
                return engine;
            }
            if (installPromise && modelId === normalized) {
                return installPromise;
            }
            progressHandler = typeof onProgress === "function" ? onProgress : null;
            modelId = normalized;
            installPromise = (async function () {
                try {
                    var module = await loadModule();
                    var CreateMLCEngine = module.CreateMLCEngine || (module.default && module.default.CreateMLCEngine);
                    var CreateServiceWorkerMLCEngine = module.CreateServiceWorkerMLCEngine || (module.default && module.default.CreateServiceWorkerMLCEngine);
                    if (!CreateMLCEngine && !CreateServiceWorkerMLCEngine) {
                        throw new Error("WebLLM non disponible");
                    }
                    var appConfig = await getAppConfig();
                    var engineConfig = {};
                    if (appConfig) {
                        engineConfig.appConfig = Object.assign({}, appConfig, { useIndexedDBCache: true });
                    } else {
                        engineConfig.appConfig = { useIndexedDBCache: true };
                    }
                    if (typeof onProgress === "function") {
                        engineConfig.initProgressCallback = function (progress) {
                            dispatchProgress(progress || { progress: 0 });
                        };
                    }
                    var nextEngine;
                    // 1) Prefer Service Worker engine if controller is active
                    if (CreateServiceWorkerMLCEngine && global.navigator && navigator.serviceWorker && navigator.serviceWorker.controller) {
                        try {
                            await registerServiceWorker();
                            await navigator.serviceWorker.ready;
                            nextEngine = await CreateServiceWorkerMLCEngine(normalized, engineConfig);
                            lastEngineKind = "service-worker";
                        } catch (swErr) {
                            console.warn("[GoToolkit WebLLM] SW engine fallback", swErr);
                        }
                    }
                    // 2) Otherwise prefer WebWorker engine
                    if (!nextEngine && (module.CreateWebWorkerMLCEngine || (module.default && module.default.CreateWebWorkerMLCEngine))) {
                        const worker = createWebWorkerInstance();
                        if (worker) {
                            try {
                                var CreateWebWorkerMLCEngine = module.CreateWebWorkerMLCEngine || (module.default && module.default.CreateWebWorkerMLCEngine);
                                nextEngine = await CreateWebWorkerMLCEngine(worker, normalized, engineConfig);
                                lastEngineKind = "web-worker";
                            } catch (wwErr) {
                                console.warn("[GoToolkit WebLLM] WebWorker engine fallback", wwErr);
                            }
                        }
                    }
                    // 3) Fallback to main-thread engine
                    if (!nextEngine) {
                        nextEngine = await CreateMLCEngine(normalized, engineConfig);
                        lastEngineKind = "main-thread";
                    }
                    engine = nextEngine;
                    dispatchProgress({ progress: 1 });
                    return engine;
                } catch (err) {
                    resetEngine();
                    throw err;
                } finally {
                    progressHandler = null;
                    installPromise = null;
                }
            })();
            return installPromise;
        }

        async function verifyModel(value) {
            var normalized = normalizeModel(value);
            var engineInstance = await ensureEngine(normalized);
            await engineInstance.chat.completions.create({
                messages: [
                    { role: "system", content: "Tu es un assistant concis." },
                    { role: "user", content: "Confirme que tu peux répondre." }
                ],
                temperature: 0.3,
                max_tokens: 16,
                stream: false
            });
            return normalized;
        }

        return {
            installModel: ensureEngine,
            verifyModel: verifyModel,
            ensureEngine: ensureEngine,
            getModelId: function () {
                return modelId;
            },
            resetEngine: resetEngine,
            getAppConfig: getAppConfig,
            getEngineKind: function () {
                return lastEngineKind;
            }
        };
    })();

    global.GoToolkitIAConfig = global.GoToolkitIAConfig || GoToolkitIAConfig;
    global.GoToolkitAIBackend = global.GoToolkitAIBackend || GoToolkitAIBackend;
    global.GoToolkitWebLLM = global.GoToolkitWebLLM || GoToolkitWebLLM;
})(window);
