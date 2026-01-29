(function (global) {
    // Load configuration from config.json
    var globalConfig = {};
    global.GoToolkitAssistConfig = globalConfig;

    function storeGlobalConfig(value) {
        globalConfig = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        global.GoToolkitAssistConfig = globalConfig;
        return globalConfig;
    }

    function resolveConfigCacheBuster() {
        try {
            var script = document.currentScript;
            if (script && script.src) {
                var url = new URL(script.src, global.location.href);
                return url.searchParams.get("v") || "";
            }
        } catch (err) {
            // ignore
        }
        return "";
    }

    function buildConfigUrl() {
        var base = (global.GoToolkitSiteConfigPath || "config.json").trim();
        var cacheBuster = resolveConfigCacheBuster();
        if (!cacheBuster) return base;
        return base + (base.indexOf("?") >= 0 ? "&" : "?") + "v=" + cacheBuster;
    }

    async function loadGlobalConfig() {
        try {
            var response = await fetch(buildConfigUrl(), { cache: "no-store" });
            if (response.ok) {
                var json = await response.json();
                storeGlobalConfig(json);
            }
        } catch (err) {
            console.warn("Failed to load config.json:", err);
        }
        return globalConfig;
    }

    var GLOBAL_BUILD_VERSION = "2026.01.14.4";
    global.GoToolkitAssistVersion = GLOBAL_BUILD_VERSION;
    var globalConfigPromise;
    var siteConfigPromise = global.GoToolkitSiteConfigPromise;
    if (siteConfigPromise && typeof siteConfigPromise.then === "function") {
        globalConfigPromise = siteConfigPromise.then(function (config) {
            return storeGlobalConfig(config);
        }).catch(function () {
            var fallback = global.GoToolkitSiteConfig?.getData?.();
            return storeGlobalConfig(fallback);
        });
    } else {
        globalConfigPromise = loadGlobalConfig();
    }
    global.GoToolkitAssistConfigPromise = globalConfigPromise;

    function emitDocumentsDbStatus(status, detail) {
        try {
            document.dispatchEvent(new CustomEvent("goToolkitDocumentsDbStatus", {
                detail: Object.assign({ status: status }, detail || {})
            }));
        } catch (err) {
            // ignore
        }
    }

    // IndexedDB verification and repair function
    async function verifyAndRepairDocumentsDb() {
        try {
            return new Promise((resolve) => {
                let resolved = false;
                const finish = (ok) => {
                    if (resolved) return;
                    resolved = true;
                    emitDocumentsDbStatus(ok ? "ready" : "failed");
                    resolve(ok);
                };

                let testReq;
                try {
                    testReq = indexedDB.open("gotoolkit-documents", 6);
                } catch (openErr) {
                    console.warn("verifyAndRepairDocumentsDb open error:", openErr);
                    finish(false);
                    return;
                }

                testReq.onerror = () => {
                    emitDocumentsDbStatus("repairing");
                    repairDocumentsDb().then(finish);
                };

                testReq.onupgradeneeded = () => {
                    // Upgrade triggered; allow onsuccess to handle health check.
                };

                testReq.onsuccess = () => {
                    const db = testReq.result;
                    let needsRepair = false;
                    try {
                        const requiredStores = ["documents", "chunks", "keyword_meta", "memo_context_embeddings"];
                        const hasAllStores = requiredStores.every(store => db.objectStoreNames.contains(store));
                        if (!hasAllStores) {
                            needsRepair = true;
                        }
                    } catch (err) {
                        needsRepair = true;
                    }

                    if (needsRepair) {
                        try {
                            db.close();
                        } catch (err) {
                            // ignore
                        }
                        emitDocumentsDbStatus("repairing");
                        repairDocumentsDb().then(finish);
                        return;
                    }

                    try {
                        const tx = db.transaction("documents", "readonly");
                        const docStore = tx.objectStore("documents");
                        const countReq = docStore.count();
                        let isHealthy = true;

                        countReq.onerror = () => {
                            isHealthy = false;
                        };

                        tx.onerror = () => {
                            isHealthy = false;
                        };

                        tx.oncomplete = () => {
                            try {
                                db.close();
                            } catch (err) {
                                // ignore
                            }
                            if (isHealthy) {
                                emitDocumentsDbStatus("ready");
                                resolve(true);
                            } else {
                                emitDocumentsDbStatus("repairing");
                                repairDocumentsDb().then(finish);
                            }
                        };
                    } catch (err) {
                        try {
                            db.close();
                        } catch (closeErr) {
                            // ignore
                        }
                        emitDocumentsDbStatus("repairing");
                        repairDocumentsDb().then(finish);
                    }
                };
            });
        } catch (err) {
            console.warn("verifyAndRepairDocumentsDb error:", err);
            emitDocumentsDbStatus("failed");
            return false;
        }
    }

    function repairDocumentsDb() {
        return new Promise((resolve) => {
            try {
                emitDocumentsDbStatus("repairing");
                const deleteReq = indexedDB.deleteDatabase("gotoolkit-documents");

                deleteReq.onerror = () => {
                    emitDocumentsDbStatus("failed");
                    resolve(false);
                };

                deleteReq.onblocked = () => {
                    emitDocumentsDbStatus("failed");
                    resolve(false);
                };

                deleteReq.onsuccess = () => {
                    const recreateReq = indexedDB.open("gotoolkit-documents", 6);

                    recreateReq.onupgradeneeded = () => {
                        const db = recreateReq.result;
                        if (!db.objectStoreNames.contains("documents")) {
                            const docs = db.createObjectStore("documents", { keyPath: "id" });
                            docs.createIndex("conversationId", "conversationId", { unique: false });
                            docs.createIndex("fileHash", "fileHash", { unique: false });
                            docs.createIndex("memoId", "memoId", { unique: false });
                        }
                        if (!db.objectStoreNames.contains("chunks")) {
                            const chunks = db.createObjectStore("chunks", { keyPath: "id" });
                            chunks.createIndex("conversationId", "conversationId", { unique: false });
                            chunks.createIndex("docId", "docId", { unique: false });
                        }
                        if (!db.objectStoreNames.contains("keyword_meta")) {
                            db.createObjectStore("keyword_meta", { keyPath: "id" });
                        }
                        if (!db.objectStoreNames.contains("memo_context_embeddings")) {
                            const memoStore = db.createObjectStore("memo_context_embeddings", { keyPath: "id" });
                            memoStore.createIndex("memoId", "memoId", { unique: false });
                            memoStore.createIndex("docId", "docId", { unique: false });
                            memoStore.createIndex("fileHash", "fileHash", { unique: false });
                        }
                    };

                    recreateReq.onerror = () => {
                        emitDocumentsDbStatus("failed");
                        resolve(false);
                    };

                    recreateReq.onsuccess = () => {
                        emitDocumentsDbStatus("ready");
                        resolve(true);
                    };
                };
            } catch (err) {
                console.warn("repairDocumentsDb error:", err);
                emitDocumentsDbStatus("failed");
                resolve(false);
            }
        });
    }

    function formatFileSize(bytes) {
        var value = Number(bytes) || 0;
        if (value < 1024) return value + " o";
        var kb = value / 1024;
        if (kb < 1024) return kb.toFixed(1) + " Ko";
        var mb = kb / 1024;
        if (mb < 1024) return mb.toFixed(1) + " Mo";
        return (mb / 1024).toFixed(1) + " Go";
    }

    function truncateFilename(name) {
        var raw = (name || "").toString().trim();
        if (!raw) return "Document";
        var dotIndex = raw.lastIndexOf(".");
        if (dotIndex <= 0 || dotIndex === raw.length - 1) {
            return raw.length > 12 ? raw.slice(0, 12) + "..." : raw;
        }
        var base = raw.slice(0, dotIndex);
        var ext = raw.slice(dotIndex + 1);
        if (base.length <= 12) {
            return raw;
        }
        return base.slice(0, 12) + "..." + ext;
    }

    function truncateIndicatorFilename(name) {
        var raw = (name || "").toString().trim();
        if (!raw) return "Document";
        var dotIndex = raw.lastIndexOf(".");
        if (dotIndex <= 0 || dotIndex === raw.length - 1) {
            return raw.length > 8 ? raw.slice(0, 8) + "..." : raw;
        }
        var base = raw.slice(0, dotIndex);
        var ext = raw.slice(dotIndex + 1);
        if (base.length <= 8) {
            return raw;
        }
        return base.slice(0, 8) + "..." + ext;
    }

    verifyAndRepairDocumentsDb().catch(err => {
    });

    function getConfig(path, defaultValue) {
        var keys = path.split(".");
        var value = globalConfig;
        for (var i = 0; i < keys.length; i++) {
            if (value && typeof value === "object") {
                value = value[keys[i]];
            } else {
                return defaultValue;
            }
        }
        return value !== undefined ? value : defaultValue;
    }

    function resolveChatAppId() {
        try {
            var explicit = (global.GoToolkitChatAppId || "").toString().trim();
            if (explicit) return explicit;
        } catch (err) { /* ignore */ }
        try {
            var fromBody = (global.document?.body?.dataset?.goToolkitChatApp || "").toString().trim();
            if (fromBody) return fromBody;
        } catch (err) { /* ignore */ }
        try {
            var path = (new URL(global.location.href)).pathname || "";
            var lower = path.toLowerCase();
            if (!lower || lower === "/") return "index";
            if (lower.endsWith("/index.html")) return "index";
            if (lower.endsWith("/memo.html")) return "memo";
            if (lower.endsWith("/docs.html")) return "memo";
            var last = lower.split("/").filter(Boolean).slice(-1)[0] || "index";
            return last.replace(/\.html?$/, "") || "index";
        } catch (err) {
            return "index";
        }
    }

    var CHAT_APP_ID = resolveChatAppId();
    var CONVERSATION_ID = "chat:" + CHAT_APP_ID;

    function scopedKey(base) {
        return base + "." + CHAT_APP_ID;
    }

    var STORAGE_KEY = scopedKey("goToolkit.chat.conversation");
    var WIDTH_KEY = "goToolkit.chat.sidebarWidth";
    var OPEN_KEY = scopedKey("goToolkit.chat.sidebarOpen");
    var KNOWLEDGE_MODAL_OPEN_KEY = scopedKey("goToolkit.chat.knowledgeModalOpen");
    var DEFAULT_WIDTH = 300;
    var MIN_WIDTH = 200;
    var MAX_WIDTH = 800;
    var MAX_WIDTH_RATIO = 0.6;
    var PROMPT_PRESET_KEY = "goToolkit.chat.prompt.preset";
    // Hybrid retrieval tuning knobs (kwCandidateLimit / topK_kw / contextLimit).
    // KEYWORD_CANDIDATE_LIMIT and KEYWORD_RETRY_LIMIT keep the keyword pre-filter bucket manageable,
    // getRetrievalParamsForQuestion controls the vector topK (topK_kw), and CONTEXT_LIMIT_MIN/MAX cap the merged hits.
    var KEYWORD_CANDIDATE_LIMIT = 200;
    var KEYWORD_RETRY_LIMIT = 400;
    var CONTEXT_LIMIT_MIN = 6;
    var CONTEXT_LIMIT_MAX = 10;

    function clampWidth(value) {
        var viewportMax = Math.min(MAX_WIDTH, Math.floor(window.innerWidth * MAX_WIDTH_RATIO));
        return Math.max(MIN_WIDTH, Math.min(viewportMax, value));
    }

    function readWidth() {
        try {
            var stored = parseInt(global.localStorage.getItem(WIDTH_KEY), 10);
            if (Number.isFinite(stored)) {
                return clampWidth(stored);
            }
        } catch (err) {
            console.warn("Chat width read failed", err);
        }
        return clampWidth(DEFAULT_WIDTH);
    }

    function saveWidth(value) {
        try {
            global.localStorage.setItem(WIDTH_KEY, String(value));
        } catch (err) {
            console.warn("Chat width save failed", err);
        }
    }

    function safeParseConversation(raw) {
        try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.id === CONVERSATION_ID && Array.isArray(parsed.messages)) {
                return parsed;
            }
        } catch (err) {
            return null;
        }
        return null;
    }

    function loadConversation() {
        try {
            var stored = global.localStorage.getItem(STORAGE_KEY);
            var parsed = safeParseConversation(stored);
            if (parsed) return parsed;
        } catch (err) {
            console.warn("Chat conversation read failed", err);
        }
        return {
            id: CONVERSATION_ID,
            updatedAt: Date.now(),
            messages: []
        };
    }

    function loadOpenState() {
        if (window.innerWidth < 1200) return false;
        try {
            var stored = global.localStorage.getItem(OPEN_KEY);
            if (stored === "1") return true;
            if (stored === "0") return false;
        } catch (err) { /* ignore */ }
        return false;
    }

    function persistOpenState(isOpen) {
        try {
            global.localStorage.setItem(OPEN_KEY, isOpen ? "1" : "0");
        } catch (err) {
            console.warn("Chat open state save failed", err);
        }
    }

    function persistKnowledgeModalOpenState(isOpen) {
        try {
            global.localStorage.setItem(KNOWLEDGE_MODAL_OPEN_KEY, isOpen ? "1" : "0");
        } catch (err) {
            console.warn("Chat knowledge modal open state save failed", err);
        }
    }

    function clearKnowledgeModalOpenPreference() {
        try {
            global.localStorage.removeItem(KNOWLEDGE_MODAL_OPEN_KEY);
        } catch (err) { /* ignore */ }
    }

    var KNOWLEDGE_PROMPT_IDS = ["advice", "edit", "suggest"];

    function shouldIncludeKnowledgeForPreset(presetId) {
        return KNOWLEDGE_PROMPT_IDS.includes(presetId);
    }

    var AI_HISTORY_LIMIT = 20;
    var AI_IN_HISTORY_KEY = "__memoEditorAIInHistory";
    var AI_OUT_HISTORY_KEY = "__memoEditorAIOutHistory";

    function readDocumentContent() {
        try {
            if (typeof global.getMemoActiveTabContent === "function") {
                var memoTabContent = global.getMemoActiveTabContent();
                if (memoTabContent) {
                    return memoTabContent;
                }
            }
        } catch (err) { /* ignore */ }
        try {
            if (typeof global.getEditorMarkdown === "function") {
                var markdown = global.getEditorMarkdown();
                if (markdown) {
                    return markdown;
                }
            }
        } catch (err) { /* ignore */ }
        try {
            if (typeof global.getEditorContent === "function") {
                var content = global.getEditorContent();
                if (content) {
                    return content;
                }
            }
        } catch (err) { /* ignore */ }
        return "";
    }

    function getMemoTabContentById(tabId) {
        if (!tabId) return null;
        var state = window.__memoState;
        if (!state || !Array.isArray(state.tabs)) return null;
        var match = state.tabs.find(function (tab) {
            return tab && tab.id === tabId;
        });
        if (!match) return null;
        return typeof match.content === "string" ? match.content : "";
    }

    function extractInlineDocumentSnapshot(messages) {
        if (!Array.isArray(messages)) return "";
        for (var i = messages.length - 1; i >= 0; i--) {
            var msg = messages[i];
            if (!msg || msg.role !== "user" || typeof msg.content !== "string") continue;
            var content = msg.content;
            var docMatch = content.match(/DOCUMENT:\s*\n([\s\S]*?)(\n\nSELECTION:|\n\nASK:|$)/);
            if (docMatch && typeof docMatch[1] === "string") {
                return docMatch[1].trim();
            }
            var docMatchAlt = content.match(/DOCUMENT\s*\n([\s\S]*?)(\n\nSELECTION:|\n\nASK:|$)/);
            if (docMatchAlt && typeof docMatchAlt[1] === "string") {
                return docMatchAlt[1].trim();
            }
        }
        return "";
    }

    function cloneForHistory(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof global.structuredClone === "function") {
            try {
                return global.structuredClone(value);
            } catch (err) {
                // fallback to JSON.stringify
            }
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            return value;
        }
    }

    function ensureHistoryArray(key) {
        var list = global[key];
        if (!Array.isArray(list)) {
            list = [];
            global[key] = list;
        }
        return list;
    }

    function trimHistory(list) {
        while (list.length > AI_HISTORY_LIMIT) {
            list.pop();
        }
    }

    function pushHistoryEntry(key, entry) {
        if (!entry) return;
        try {
            var list = ensureHistoryArray(key);
            list.unshift(entry);
            trimHistory(list);
        } catch (err) {
            // ignore
        }
    }

    function recordChatAIInHistory(payload, conversationId) {
        if (!payload || typeof payload !== "object") return;
        try {
            var docContent = readDocumentContent() || "";
            var entry = {
                at: new Date().toISOString(),
                conversationId: conversationId || null,
                payload: cloneForHistory(payload),
                payload_messages: cloneForHistory(payload.messages),
                document_markdown: docContent.trim() || null
            };
            pushHistoryEntry(AI_IN_HISTORY_KEY, entry);
        } catch (err) {
            // ignore
        }
    }

    function recordChatAIOutHistory(details, conversationId) {
        if (!details || typeof details !== "object") return;
        try {
            var clone = cloneForHistory(details);
            var entry = Object.assign({
                at: new Date().toISOString(),
                conversationId: conversationId || null
            }, clone);
            if (!entry.full_payload && clone) {
                if (clone.sanitizedPayload) {
                    entry.full_payload = clone.sanitizedPayload;
                } else if (clone.parsedResponse) {
                    entry.full_payload = clone.parsedResponse;
                }
            }
            pushHistoryEntry(AI_OUT_HISTORY_KEY, entry);
        } catch (err) {
            // ignore
        }
    }

    function getAllowedPromptPresetIds() {
        if (CHAT_APP_ID === "memo") return ["edit", "advice", "suggest", "import", "draw"];
        if (CHAT_APP_ID === "index") return ["edit", "advice", "suggest"];
        return ["edit", "advice", "suggest"];
    }

    function readPromptPreset() {
        var allowed = getAllowedPromptPresetIds();
        try {
            var stored = global.localStorage.getItem(PROMPT_PRESET_KEY);
            if (stored && allowed.includes(stored)) {
                if (stored === "ask" || stored === "advice") {
                    if (allowed.includes("edit")) {
                        persistPromptPreset("edit");
                        return "edit";
                    }
                    return stored;
                }
                return stored;
            }
        } catch (err) {
            console.warn("Chat prompt preset read failed", err);
        }
        if (allowed.includes("edit")) {
            persistPromptPreset("edit");
            return "edit";
        }
        return allowed[0] || "advice";
    }

    function persistPromptPreset(value) {
        try {
            global.localStorage.setItem(PROMPT_PRESET_KEY, value);
        } catch (err) {
            console.warn("Chat prompt preset save failed", err);
        }
    }

    function safeReadLocalStorage(key) {
        try {
            return (global.localStorage?.getItem(key) || "").toString();
        } catch (err) {
            return "";
        }
    }

    function getPersistedPromptOrEmpty(key) {
        return (safeReadLocalStorage(key) || "").trim();
    }

    function persistConversation(conversation) {
        try {
            var payload = JSON.stringify(conversation);
            global.localStorage.setItem(STORAGE_KEY, payload);
        } catch (err) {
            console.warn("Chat conversation save failed", err);
        }
    }

    function throttle(fn, delay) {
        var lastCall = 0;
        var timeout;
        return function () {
            var now = Date.now();
            var args = arguments;
            if (now - lastCall >= delay) {
                lastCall = now;
                fn.apply(null, args);
                return;
            }
            clearTimeout(timeout);
            timeout = setTimeout(function () {
                lastCall = Date.now();
                fn.apply(null, args);
            }, delay);
        };
    }

    function createMessage(role, content) {
        return {
            id: "msg-" + Date.now() + "-" + Math.random().toString(16).slice(2),
            role: role,
            createdAt: Date.now(),
            content: content || "",
            docSnapshotId: null,
            docSnapshotContent: null,
            sources: []
        };
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function escapeRegex(value) {
        return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function copyTextToClipboard(text) {
        var value = String(text || "");
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            return navigator.clipboard.writeText(value);
        }
        return new Promise(function (resolve, reject) {
            try {
                var textarea = document.createElement("textarea");
                textarea.value = value;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.top = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                var ok = document.execCommand("copy");
                textarea.remove();
                if (ok) {
                    resolve();
                } else {
                    reject(new Error("Copy failed"));
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    function getPreCopyText(pre) {
        if (!pre) return "";
        var code = pre.querySelector("code");
        if (code) return code.textContent || "";
        var clone = pre.cloneNode(true);
        var btn = clone.querySelector(".chat-pre-copy-btn");
        if (btn) btn.remove();
        return clone.textContent || "";
    }

    function showCopyToast(message) {
        var text = String(message || "");
        if (!text) return;
        if (typeof window.GoToolkitMemoToast === "function") {
            window.GoToolkitMemoToast(text);
            return;
        }
        document.dispatchEvent(new CustomEvent("copyToast", { detail: { message: text } }));
    }

    function addCopyButtonsToChatContent(contentEl) {
        if (!contentEl) return;
        var preBlocks = contentEl.querySelectorAll("pre");
        preBlocks.forEach(function (pre) {
            if (pre.querySelector(".chat-pre-copy-btn")) return;
            pre.classList.add("chat-pre-has-copy");
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "chat-pre-copy-btn";
            btn.setAttribute("aria-label", "Copier");
            btn.innerHTML = '<i data-lucide="copy" style="width:12px;height:12px;"></i>';
            btn.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                var originalLabel = btn.getAttribute("aria-label") || "Copier";
                copyTextToClipboard(getPreCopyText(pre)).then(function () {
                    btn.setAttribute("aria-label", "Copié");
                    showCopyToast("Contenu copié");
                    setTimeout(function () {
                        btn.setAttribute("aria-label", originalLabel);
                    }, 1200);
                }).catch(function () {
                    btn.setAttribute("aria-label", "Erreur");
                    setTimeout(function () {
                        btn.setAttribute("aria-label", originalLabel);
                    }, 1200);
                });
            });
            pre.insertBefore(btn, pre.firstChild);
            if (window.lucide) window.lucide.createIcons({ props: { size: 12 } });
        });
    }

    function renderBotMarkdown(text) {
        if (global.GoToolkitMarkdown) {
            if (typeof global.GoToolkitMarkdown.renderDocument === "function") {
                return global.GoToolkitMarkdown.renderDocument(text);
            }
            if (typeof global.GoToolkitMarkdown.render === "function") {
                return global.GoToolkitMarkdown.render(text);
            }
        }
        return escapeHtml(text).replace(/\n/g, "<br>");
    }

    function renderDocumentMarkdown(text) {
        if (global.GoToolkitMarkdown && typeof global.GoToolkitMarkdown.renderDocument === "function") {
            return global.GoToolkitMarkdown.renderDocument(text);
        }
        return renderBotMarkdown(text);
    }

    function getFileExtension(fileName) {
        var parts = String(fileName || "").split(".");
        if (parts.length < 2) return "";
        return parts.pop().toLowerCase();
    }

    var MEDIA_AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "webm", "flac", "mp4"]);
    var MEDIA_VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi"]);
    var MEDIA_MAX_BYTES = 5 * 1024 * 1024 * 1024;
    var MEDIA_MAX_DURATION = 2 * 60 * 60;

    function isMediaFile(file) {
        if (!file) return false;
        var ext = getFileExtension(file.name || "");
        var mime = (file.type || "").toLowerCase();
        if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
        return MEDIA_AUDIO_EXTENSIONS.has(ext) || MEDIA_VIDEO_EXTENSIONS.has(ext);
    }

    function buildTranscriptFileName(fileName) {
        var base = String(fileName || "").replace(/\.[^/.]+$/, "");
        return (base || "transcription") + ".txt";
    }

    function getMediaDuration(file) {
        return new Promise(function (resolve, reject) {
            var mime = (file?.type || "").toLowerCase();
            var isVideo = mime.startsWith("video/") || MEDIA_VIDEO_EXTENSIONS.has(getFileExtension(file?.name || ""));
            var el = document.createElement(isVideo ? "video" : "audio");
            var url = URL.createObjectURL(file);
            var settled = false;
            var cleanup = function () {
                if (settled) return;
                settled = true;
                URL.revokeObjectURL(url);
                el.removeAttribute("src");
                el.load();
            };
            el.preload = "metadata";
            el.onloadedmetadata = function () {
                var duration = Number(el.duration);
                cleanup();
                if (!Number.isFinite(duration)) {
                    reject(new Error("Durée inconnue"));
                    return;
                }
                resolve(duration);
            };
            el.onerror = function () {
                cleanup();
                reject(new Error("Impossible de lire le fichier"));
            };
            el.src = url;
        });
    }

    async function validateMediaFile(file) {
        if (!file) return { ok: false, error: "Fichier manquant" };
        if (file.size > MEDIA_MAX_BYTES) {
            return { ok: false, error: "Fichier trop volumineux (max 5 Go)" };
        }
        try {
            var duration = await getMediaDuration(file);
            if (duration > MEDIA_MAX_DURATION) {
                return { ok: false, error: "Durée > 2h" };
            }
            return { ok: true, duration: duration };
        } catch (err) {
            return { ok: false, error: "Durée inconnue" };
        }
    }

    function estimateTokenCount(text) {
        var raw = (text || "").toString();
        if (!raw) return 0;
        return Math.max(1, Math.ceil(raw.length / 4));
    }

    function estimatePayloadTokens(payload) {
        if (!payload || !Array.isArray(payload.messages)) return 0;
        var total = 0;
        payload.messages.forEach(function (msg) {
            if (!msg) return;
            if (typeof msg.content === "string") {
                total += estimateTokenCount(msg.content);
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach(function (part) {
                    if (typeof part === "string") {
                        total += estimateTokenCount(part);
                    } else if (part && typeof part.text === "string") {
                        total += estimateTokenCount(part.text);
                    }
                });
            }
        });
        return total;
    }

    function clampDuration(value, minMs, maxMs) {
        var num = Number.isFinite(value) ? value : 0;
        return Math.min(Math.max(num, minMs), maxMs);
    }

    // Character counter toaster functions
    var aiCounterToasterState = {};

    function getAiCounterState(toasterId) {
        var id = toasterId || "aiRequestCounterToaster";
        if (!aiCounterToasterState[id]) {
            aiCounterToasterState[id] = {
                isRunning: false,
                timerId: null,
                remaining: 0,
                isLooping: false,
                originalDuration: 0,
                iconName: "bot",
                label: ""
            };
        }
        return aiCounterToasterState[id];
    }

    function ensureAiRequestToaster(toasterId) {
        if (typeof document === "undefined") return null;
        var id = toasterId || "aiRequestCounterToaster";
        var toasterEl = global.document?.getElementById(id);
        if (!toasterEl) {
            toasterEl = document.createElement("div");
            toasterEl.id = id;
            toasterEl.className = "ai-request-counter-toaster";
            toasterEl.setAttribute("role", "status");
            toasterEl.setAttribute("aria-live", "polite");
            toasterEl.setAttribute("aria-atomic", "true");
            toasterEl.style.display = "none";
            var span = document.createElement("span");
            span.id = id + "Text";
            span.innerHTML = '<i data-lucide="bot" class="lucide-spin" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> 00:00';
            toasterEl.appendChild(span);
            document.body.appendChild(toasterEl);
        }
        var textEl = global.document?.getElementById(id + "Text");
        if (!textEl && id === "aiRequestCounterToaster") {
            textEl = global.document?.getElementById("aiRequestCounterText");
        }
        return { toasterEl: toasterEl, textEl: textEl };
    }

    function startCharacterCounterToaster(tokenCount, options = {}) {
        if (typeof tokenCount !== 'number' || tokenCount < 0) {
            tokenCount = 0;
        }

        var toasterId = options.toasterId || "aiRequestCounterToaster";
        var iconName = (options.iconName || "bot").toString();
        var label = typeof options.label === "string" ? options.label : "";
        var toastNodes = ensureAiRequestToaster(toasterId);
        if (!toastNodes?.toasterEl) return;

        // Stop any existing timer
        stopCharacterCounterToaster(toasterId);

        var isImport = options.isImport || false;

        // Calculate duration: 15s to 90s (default token-based)
        var durationMs = Number.isFinite(options.durationMs) ? Math.max(1000, options.durationMs) : 0;
        if (!durationMs) {
            durationMs = 15000 + Math.round(tokenCount * 2.5);
            durationMs = Math.min(durationMs, 90000); // Max 1m30
        }

        var state = getAiCounterState(toasterId);
        state.isRunning = true;
        state.remaining = durationMs;
        state.isLooping = isImport;
        state.originalDuration = durationMs;
        state.iconName = iconName;
        state.label = label;

        toastNodes.toasterEl.classList.add("visible");
        toastNodes.toasterEl.style.display = "";

        var updateCounter = function () {
            if (!state.isRunning) return;

            var secondsRemaining = Math.ceil(state.remaining / 1000);
            var minutes = Math.floor(secondsRemaining / 60);
            var seconds = secondsRemaining % 60;
            var timeStr = (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;

            var iconHtml = `<i data-lucide="${state.iconName}" class="lucide-pulse" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>`;
            var textEl = toastNodes.textEl || global.document?.getElementById(toasterId + "Text");
            if (textEl) {
                textEl.innerHTML = iconHtml + " " + timeStr;
                if (window.lucide) window.lucide.createIcons();
            }

            state.remaining -= 1000;

            if (state.remaining < 0) {
                if (state.isLooping) {
                    state.remaining = state.originalDuration;
                    state.timerId = setTimeout(updateCounter, 1000);
                } else {
                    stopCharacterCounterToaster(toasterId);
                }
            } else {
                state.timerId = setTimeout(updateCounter, 1000);
            }
        };

        updateCounter();
    }

    function stopCharacterCounterToaster(toasterId) {
        var id = toasterId || "aiRequestCounterToaster";
        var toasterEl = global.document?.getElementById(id);
        if (toasterEl) {
            toasterEl.classList.remove("visible");
        }

        var state = getAiCounterState(id);
        if (state.timerId) {
            clearTimeout(state.timerId);
            state.timerId = null;
        }
        state.isRunning = false;
        state.remaining = 0;
    }

    global.GoToolkitAIRequestToaster = {
        start: startCharacterCounterToaster,
        stop: stopCharacterCounterToaster,
        startIcon: function (toasterId, iconName, label, durationMs) {
            startCharacterCounterToaster(0, {
                toasterId: toasterId,
                iconName: iconName,
                label: label,
                isImport: true,
                durationMs: durationMs
            });
        }
    };

    function isMarkdownDocument(doc, options) {
        var config = options || {};
        if (config.forceMarkdown) return true;
        var mime = "";
        if (typeof config.mime === "string") {
            mime = config.mime;
        } else if (doc && typeof doc.mime === "string") {
            mime = doc.mime;
        }
        if (mime && mime.toLowerCase().includes("markdown")) {
            return true;
        }
        var fileName = "";
        if (typeof config.fileName === "string") {
            fileName = config.fileName;
        } else if (doc && typeof doc.sourceFileName === "string") {
            fileName = doc.sourceFileName;
        } else if (doc && typeof doc.name === "string") {
            fileName = doc.name;
        }
        var normalized = (fileName || "").toLowerCase();
        return normalized.endsWith(".md") || normalized.endsWith(".markdown");
    }

    function isPdfDocument(doc, options) {
        var config = options || {};
        if (config.forcePdf) return true;
        var mime = "";
        if (typeof config.mime === "string") {
            mime = config.mime;
        } else if (doc && typeof doc.mime === "string") {
            mime = doc.mime;
        }
        if (mime && mime.toLowerCase().includes("pdf")) {
            return true;
        }
        var fileName = "";
        if (typeof config.fileName === "string") {
            fileName = config.fileName;
        } else if (doc && typeof doc.sourceFileName === "string") {
            fileName = doc.sourceFileName;
        } else if (doc && typeof doc.name === "string") {
            fileName = doc.name;
        }
        return (fileName || "").toLowerCase().endsWith(".pdf");
    }


    function normalizeReference(payload) {
        if (!payload || typeof payload !== "object") return null;
        var documentId = payload.documentId
            || payload.docId
            || payload.doc_id
            || payload.docid
            || payload.document_id
            || payload.documentid
            || payload.document
            || payload.doc
            || null;
        var chunkId = payload.chunkId
            || payload.chunk_id
            || payload.chunkid
            || payload.chunk
            || null;
        var abstractLabel = typeof payload.abstract === "string" ? payload.abstract.trim() : "";
        var line = typeof payload.line === "number" ? payload.line : null;

        // Support snippet as array (1-3 citations from AI) or string (backward compat)
        var snippetValue = null;
        if (Array.isArray(payload.snippet)) {
            snippetValue = payload.snippet.filter(Boolean);
        } else if (typeof payload.snippet === "string") {
            snippetValue = payload.snippet.trim();
        } else if (typeof payload.text === "string") {
            snippetValue = payload.text.trim();
        }

        return {
            documentId: documentId,
            chunkId: chunkId,
            abstract: abstractLabel,
            line: line,
            snippet: snippetValue
        };
    }

    function normalizeHighlightSnippet(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function normalizePageNumber(value) {
        if (value === null || value === undefined) return null;
        var numeric = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        return null;
    }

    function findHighlightSnippet(candidateSnippet, chunkText) {
        var chunkContent = normalizeHighlightSnippet(chunkText);
        if (!chunkContent) return "";
        var chunkLower = chunkContent.toLowerCase();
        var target = normalizeHighlightSnippet(candidateSnippet);
        if (!target) {
            return chunkContent.slice(0, 512);
        }
        var targetLower = target.toLowerCase();
        if (chunkLower.includes(targetLower)) {
            var idx = chunkLower.indexOf(targetLower);
            return chunkContent.substring(idx, idx + targetLower.length).slice(0, 512);
        }
        var tokens = targetLower.split(/\s+/).filter(Boolean);
        for (var len = tokens.length; len > 0; len--) {
            for (var start = 0; start <= tokens.length - len; start++) {
                var fragment = tokens.slice(start, start + len).join(" ");
                if (!fragment) continue;
                var matchIndex = chunkLower.indexOf(fragment);
                if (matchIndex >= 0) {
                    return chunkContent.substring(matchIndex, matchIndex + fragment.length).slice(0, 512);
                }
            }
        }
        return chunkContent.slice(0, 512);
    }

    function getChunkIdentifier(chunk) {
        if (!chunk) return "";
        if (chunk.chunkId) return chunk.chunkId;
        if (chunk.id) return chunk.id;
        if (chunk._id) return chunk._id;
        return "";
    }

    function getChunkIndex(chunk) {
        if (!chunk) return 0;
        var idx = Number(chunk.idx);
        if (Number.isFinite(idx)) return idx;
        var alt = Number(chunk.chunk);
        if (Number.isFinite(alt)) return alt;
        return 0;
    }

    var PREVIEW_CHUNK_OVERLAP_MIN = 16;
    var PREVIEW_CHUNK_OVERLAP_MAX = 512;

    function computeDocumentChunkOverlap(buffer, nextText) {
        if (!buffer || !nextText) return 0;
        var limit = Math.min(buffer.length, nextText.length, PREVIEW_CHUNK_OVERLAP_MAX);
        for (var len = limit; len >= PREVIEW_CHUNK_OVERLAP_MIN; len--) {
            if (buffer.slice(-len) === nextText.slice(0, len)) {
                return len;
            }
        }
        return 0;
    }

    function normalizeSpaces(value) {
        return String(value || "")
            .trim()
            .replace(/\s+/g, " ");
    }

    function highlightSnippetText(text, needle) {
        var normalizedNeedle = normalizeSpaces(needle);
        if (!normalizedNeedle) return escapeHtml(text);
        var lowerText = text.toLowerCase();
        var lowerNeedle = normalizedNeedle.toLowerCase();
        var parts = [];
        var lastIndex = 0;
        var needleLength = normalizedNeedle.length;
        while (true) {
            var idx = lowerText.indexOf(lowerNeedle, lastIndex);
            if (idx === -1) break;
            parts.push(escapeHtml(text.slice(lastIndex, idx)));
            parts.push("<span class=\"chat-doc-preview__text-match\">" +
                escapeHtml(text.slice(idx, idx + needleLength)) +
                "</span>");
            lastIndex = idx + needleLength;
        }
        parts.push(escapeHtml(text.slice(lastIndex)));
        if (!parts.length) return escapeHtml(text);
        return parts.join("");
    }

    function normalizePreviewChunks(chunks) {
        if (!Array.isArray(chunks) || !chunks.length) return [];
        var list = chunks.slice();
        list.sort(function (a, b) {
            var diff = getChunkIndex(a) - getChunkIndex(b);
            if (diff !== 0) return diff;
            var aKey = getChunkIdentifier(a);
            var bKey = getChunkIdentifier(b);
            if (aKey && bKey) return aKey.localeCompare(bKey);
            if (aKey) return -1;
            if (bKey) return 1;
            return 0;
        });
        var normalized = [];
        var tail = "";
        list.forEach(function (chunk) {
            var text = String(chunk?.text || "");
            if (!text) return;
            var overlap = computeDocumentChunkOverlap(tail, text);
            var trimmed = overlap ? text.slice(overlap) : text;
            if (!trimmed) return;
            normalized.push({
                text: trimmed,
                chunkKey: getChunkIdentifier(chunk)
            });
            tail += trimmed;
            if (tail.length > PREVIEW_CHUNK_OVERLAP_MAX) {
                tail = tail.slice(-PREVIEW_CHUNK_OVERLAP_MAX);
            }
        });
        return normalized;
    }

    AssistSidebar.prototype.buildMarkdownContent = function (chunks) {
        if (!Array.isArray(chunks) || !chunks.length) return "";
        var list = chunks.slice();
        list.sort(function (a, b) {
            return getChunkIndex(a) - getChunkIndex(b);
        });
        var parts = [];
        list.forEach(function (chunk) {
            var text = String(chunk?.text || "");
            if (text) {
                parts.push(text);
            }
        });
        return parts.join("\n\n");
    };

    function getSystemPrompt() {
        var persisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt");
        if (persisted) return persisted;
        var prompt = global.GoToolkitChatPrompt?.SYSTEM_PROMPT;
        if (prompt && typeof prompt === "string") {
            return prompt;
        }
        var fallback = global.GoToolkitChatPrompt?.DEFAULT_SYSTEM_PROMPT;
        if (fallback && typeof fallback === "string") {
            return fallback;
        }
        return "";
    }

    function createKnowledgeManifestStore() {
        var factory = global.goToolkitStorageService?.createStore;
        if (typeof factory !== "function") {
            return {
                read: async function () { return []; },
                write: async function (value) { return value || []; }
            };
        }
        return factory({
            storeName: "knowledge-manifest",
            localStorageKey: "goToolkit.knowledge.manifest",
            defaultValue: function () { return []; },
            normalize: function (value) {
                if (!Array.isArray(value)) return null;
                return value
                    .map(function (entry) {
                        if (typeof entry === "string") return entry.trim();
                        if (entry && typeof entry.fileName === "string") return entry.fileName.trim();
                        return "";
                    })
                    .filter(Boolean);
            },
            logPrefix: "goToolkit.knowledge.manifest"
        });
    }

    function createKnowledgeManifestCacheStore() {
        var factory = global.goToolkitStorageService?.createStore;
        if (typeof factory !== "function") {
            return {
                read: async function () { return []; },
                write: async function (value) { return value || []; }
            };
        }
        return factory({
            storeName: "knowledge-manifest-cache",
            localStorageKey: "goToolkit.knowledge.manifest.cache",
            defaultValue: function () { return []; },
            normalize: function (value) {
                if (!Array.isArray(value)) return null;
                return value
                    .map(function (entry) {
                        if (!entry || typeof entry !== "object") return null;
                        return {
                            path: entry.path || "",
                            name: entry.name || "",
                            abstract: entry.abstract || "",
                            updatedAt: entry.updatedAt || "",
                            fileName: entry.fileName || "",
                            source: entry.source || "Web"
                        };
                    })
                    .filter(function (entry) {
                        return entry.path && entry.fileName;
                    });
            },
            logPrefix: "goToolkit.knowledge.manifest.cache"
        });
    }

    function createKnowledgeOverridesStore() {
        var factory = global.goToolkitStorageService?.createStore;
        if (typeof factory !== "function") {
            return {
                read: async function () { return {}; },
                write: async function (value) { return value || {}; }
            };
        }
        return factory({
            storeName: "knowledge-overrides",
            localStorageKey: "goToolkit.knowledge.overrides",
            defaultValue: function () { return {}; },
            normalize: function (value) {
                if (!value || typeof value !== "object" || Array.isArray(value)) return null;
                return value;
            },
            logPrefix: "goToolkit.knowledge.overrides"
        });
    }

    function createKnowledgeDescriptionOverridesStore() {
        var factory = global.goToolkitStorageService?.createStore;
        if (typeof factory !== "function") {
            return {
                read: async function () { return {}; },
                write: async function (value) { return value || {}; }
            };
        }
        return factory({
            storeName: "knowledge-descriptions-overrides",
            localStorageKey: "goToolkit.knowledge.descriptions.overrides",
            defaultValue: function () { return {}; },
            normalize: function (value) {
                if (!value || typeof value !== "object" || Array.isArray(value)) return null;
                return value;
            },
            logPrefix: "goToolkit.knowledge.descriptions.overrides"
        });
    }

    function createKnowledgeLocalDocsStore() {
        var factory = global.goToolkitStorageService?.createStore;
        if (typeof factory !== "function") {
            return {
                read: async function () { return {}; },
                write: async function (value) { return value || {}; }
            };
        }
        return factory({
            storeName: "knowledge-local-docs",
            localStorageKey: "goToolkit.knowledge.localDocs",
            defaultValue: function () { return {}; },
            normalize: function (value) {
                if (!value || typeof value !== "object" || Array.isArray(value)) return null;
                return value;
            },
            logPrefix: "goToolkit.knowledge.localDocs"
        });
    }

    function createKnowledgeSelectionStore() {
        var factory = global.goToolkitStorageService?.createStore;
        if (typeof factory !== "function") {
            return {
                read: async function () { return []; },
                write: async function (value) { return value || []; }
            };
        }
        return factory({
            storeName: "knowledge-selection",
            localStorageKey: "goToolkit.knowledge.selection",
            defaultValue: function () { return []; },
            normalize: function (value) {
                if (!Array.isArray(value)) return null;
                return value
                    .map(function (entry) {
                        if (typeof entry === "string") return entry.trim();
                        return "";
                    })
                    .filter(Boolean);
            },
            logPrefix: "goToolkit.knowledge.selection"
        });
    }

    function AssistSidebar(root) {
        this.root = root;
        this.sidebar = null;
        this.toggleButton = null;
        this.messagesEl = null;
        this.textarea = null;
        this.sendButton = null;
        this.clearButton = null;
        this.scrollButton = null;
        this.page = null;
        this.sidebarWidth = readWidth();
        this.conversation = loadConversation();
        this.isOpen = loadOpenState();
        this.isStreaming = false;
        this.controller = null;
        this.messageNodes = {};
        this.throttledPersist = throttle(this.persist.bind(this), 500);
        this.docManager = global.GoToolkitDocumentManager;
        this.docCache = new Map();
        this.docsIndicatorButton = null;
        this.documentsFileInput = null;
        this.documentStatsWatcher = null;
        this.keywordIndexSizes = { context: 0, knowledge: 0 };
        this.documentChunkCount = 0;
        this.documentUploadStatus = "";
        this.pendingDocumentAttachments = [];
        this.pendingExcludedAttachments = new Set();
        this.attachmentsCompletedCount = 0;
        this.attachmentsCompletedSize = 0;
        this.attachmentsTotalSize = 0;
        this.attachmentsTotalCount = 0;
        this.attachmentsCompletedFiles = new Set();
        this.attachmentsFailedFiles = new Set();
        this.attachmentsFileSizes = new Map();
        this.mediaTranscriptFileSizes = new Map();
        this.memoContextAttachments = [];
        this.memoContextAttachmentRow = null;
        this.memoContextAttachmentList = null;
        this.pendingAttachmentRow = null;
        this.pendingAttachmentList = null;
        this.memoPendingAttachmentMemos = new Set();
        this.memoConfirmedAttachmentMemos = new Set();
        this.headerDocCountEl = null;
        this.knowledgeDocumentNames = [];
        this.headerDocCountTooltipDefault = "Base de connaissances";
        this.previewPanel = null;
        this.previewTitleEl = null;
        this.previewBodyEl = null;
        this.previewCloseBtn = null;
        this.previewIframeEl = null;
        this.previewPdfUrl = null;
        this.pendingPdfHighlight = null;
        this.currentPreviewDoc = null;
        this.promptPresetId = readPromptPreset();
        if (getAllowedPromptPresetIds().includes("edit")) {
            this.promptPresetId = "edit";
            persistPromptPreset("edit");
        }
        this.undoState = null;
        this.latestRestoreMessageId = null;
        this.inlinePromptDropdownButton = null;
        this.inlinePromptDropdownMenu = null;
        this.promptDropdown = null;
        this.promptDropdownButton = null;
        this.promptDropdownMenu = null;
        this.promptShortcutsButton = null;
        this.promptShortcutsOverlay = null;
        this.promptShortcutsModal = null;
        this.promptShortcutsTitleEl = null;
        this.promptShortcutsFilterEl = null;
        this.promptShortcutsGridEl = null;
        this.promptShortcutsCloseBtn = null;
        this.promptShortcutsPagerEl = null;
        this.promptShortcutsPagerLabelEl = null;
        this.promptShortcutsPagerPrevBtn = null;
        this.memoSelection = null;
        this.memoSelectionDetail = null;
        this.memoSelectionCoords = null;
        this.memoSelectionBlockCoords = null;
        this.memoSelectionOverlay = null;
        this.memoSelectionTrackingInit = false;
        this.memoSelectionFollowActive = true;
        this.memoSelectionFollowButton = null;
        this.memoSelectionIgnoreBlur = false;
        this.promptShortcutsPagerNextBtn = null;
        this.promptShortcutsActiveCategory = "ALL";
        this.promptShortcutsPageIndex = 0;
        this.promptShortcutsPageSize = 9;
        this.promptShortcutsTargetInput = null;
        this.promptShortcutsPrompts = [];
        this.documentCounts = { context: 0, gallery: 0 };
        this.knowledgeConversationId = global.GoToolkitKnowledgeConversationId || "knowledge";
        this.knowledgeDocumentNames = [];
        this.knowledgeDocumentCount = 0;
        this.knowledgeManifestStore = createKnowledgeManifestStore();
        this.knowledgeManifestCacheStore = createKnowledgeManifestCacheStore();
        this.knowledgeOverridesStore = createKnowledgeOverridesStore();
        this.knowledgeDescriptionOverridesStore = createKnowledgeDescriptionOverridesStore();
        this.knowledgeLocalDocsStore = createKnowledgeLocalDocsStore();
        this.knowledgeSelectionStore = createKnowledgeSelectionStore();
        this.knowledgeModal = null;
        this.knowledgeModalHeader = null;
        this.knowledgeModalListEl = null;
        this.knowledgeModalTitleEl = null;
        this.knowledgeModalCloseBtn = null;
        this.knowledgeModalAddBtn = null;
        this.knowledgeModalFileInput = null;
        this.knowledgeModalStatusMessage = "";
        this.knowledgeModalStatusIsError = false;
        this.knowledgeModalStatusTimer = null;
        this.knowledgeModalIndexingProgress = null;
        this.knowledgeEditOverlay = null;
        this.knowledgeEditNameInput = null;
        this.knowledgeEditAbstractInput = null;
        this.knowledgeEditSaveBtn = null;
        this.knowledgeEditCloseBtn = null;
        this.knowledgeEditTargetKey = null;
        this.knowledgeModalSelectionSet = new Set();
        this.knowledgeManifestEntries = [];
        this.contentManifestEntries = [];
        this.knowledgeIndexing = false;
        this.knowledgeModalSort = { column: "updatedAt", direction: "desc" };
        this.knowledgeLocalDocRefs = new Map();
        this.knowledgeChatDocRefs = new Map();
        this.knowledgeMemoDocRefs = new Map();
        this.knowledgeModalSourceFilter = null;
        this.mediaTranscriptionActive = false;
        this.deferSendButtonRestoreUntilAI = false;
        this.sendButtonSpinnerTimer = null;
        this.sendButtonBaseLabel = `<i data-lucide="send" style="width:16px;height:16px;"></i>`;
        this.mediaUploadCount = 0;
        this.mediaTranscribedCount = 0;
        this.mediaTotalCount = 0;
        this.mainApp = null;
        var restoredAttachments = this.conversation?.attachments;
        if (restoredAttachments && Array.isArray(restoredAttachments.names)) {
            this.pendingDocumentAttachments = restoredAttachments.names.filter(Boolean);
            if (Array.isArray(restoredAttachments.excluded)) {
                this.pendingExcludedAttachments = new Set(restoredAttachments.excluded.filter(Boolean));
            }
        }
    }

    AssistSidebar.prototype.persist = function () {
        this.conversation.updatedAt = Date.now();
        persistConversation(this.conversation);
    };

    AssistSidebar.prototype.persistPendingAttachments = function () {
        if (!this.conversation) return;
        this.conversation.attachments = {
            names: (this.pendingDocumentAttachments || []).filter(Boolean),
            excluded: Array.from(this.pendingExcludedAttachments || [])
        };
        this.persist();
    };

    AssistSidebar.prototype.setWidth = function (value) {
        var viewportWidth = window.innerWidth || this.sidebarWidth;
        var isMobile = viewportWidth <= 900;
        this.sidebarWidth = isMobile ? viewportWidth : clampWidth(value);
        if (this.sidebar) {
            this.sidebar.style.width = isMobile ? "100%" : this.sidebarWidth + "px";
        }
        if (this.isOpen) {
            this.applyPagePadding();
        }
        this.updateSidebarWidthVar();
    };

    AssistSidebar.prototype.applyPagePadding = function () {
        if (!this.page) return;
        var viewportWidth = window.innerWidth || 0;
        if (viewportWidth <= 900) {
            this.page.style.marginRight = "";
            this.page.style.paddingRight = "";
            return;
        }
        var isDrawer = viewportWidth < 1200;
        var offset = Math.max(0, this.sidebarWidth);
        this.page.style.marginRight = (this.isOpen && !isDrawer) ? offset + "px" : "";
        this.page.style.paddingRight = "";
    };

    AssistSidebar.prototype.updateSidebarWidthVar = function () {
        var doc = global.document;
        if (!doc || !doc.documentElement?.style) return;
        doc.documentElement.style.setProperty("--chat-sidebar-width", this.isOpen ? this.sidebarWidth + "px" : "0px");
    };

    AssistSidebar.prototype.open = function () {
        if (!this.sidebar) return;
        this.isOpen = true;
        this.sidebar.classList.add("chat-sidebar--open");
        this.applyPagePadding();
        this.updateSidebarWidthVar();
        if (this.toggleButton) {
            this.toggleButton.classList.add("active");
        }
        this.updateToggleIcon();
        persistOpenState(true);
        if (this.textarea) {
            this.textarea.focus();
        }
        this.syncKnowledgeModalVisibility();
        this.ensureKnowledgeIndexWarm();
    };

    AssistSidebar.prototype.syncKnowledgeModalVisibility = function () {
        if (!this.isOpen) return;
        if (this.promptPresetId === "advice") {
            // Keep knowledge modal as-is; avoid auto-opening.
            return;
        }
        this.closeKnowledgeModal(false);
    };

    AssistSidebar.prototype.closeActiveModals = function () {
        if (this.previewPanel && this.previewPanel.classList.contains("open")) {
            this.closePreviewPanel();
        }
        if (this.knowledgeModal && this.knowledgeModal.classList.contains("open")) {
            this.closeKnowledgeModal(false);
        }
    };

    AssistSidebar.prototype.close = function () {
        if (!this.sidebar) return;
        this.closeActiveModals();
        this.isOpen = false;
        this.sidebar.classList.remove("chat-sidebar--open");
        this.applyPagePadding();
        this.updateSidebarWidthVar();
        if (this.toggleButton) {
            this.toggleButton.classList.remove("active");
        }
        this.updateToggleIcon();
        persistOpenState(false);
    };

    AssistSidebar.prototype.toggle = function () {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    };

    AssistSidebar.prototype.updateToggleIcon = function () {
        if (!this.toggleButton) return;
        var icon = this.toggleButton.querySelector("i[data-lucide]");
        if (!icon) return;
        var nextIcon = this.isOpen ? "panel-right-close" : "panel-right-open";
        if (icon.getAttribute("data-lucide") === nextIcon) return;
        icon.setAttribute("data-lucide", nextIcon);
        if (global.lucide) global.lucide.createIcons();
    };

    AssistSidebar.prototype.abortStream = function () {
        if (this.controller) {
            try {
                this.controller.abort();
            } catch (err) { /* ignore */ }
            this.controller = null;
        }
        this.isStreaming = false;
        this.updateComposerState();
    };

    AssistSidebar.prototype.clearConversation = function () {
        this.abortStream();
        if (this.docManager) {
            this.docManager.deleteDocumentsBySourceTypes(this.conversation.id, ["context"]).catch(function () { /* ignore */ });
        }
        this.conversation = {
            id: CONVERSATION_ID,
            updatedAt: Date.now(),
            messages: []
        };
        this.messageNodes = {};
        this.setPendingDocumentAttachments([]);
        if (this.messagesEl) {
            this.messagesEl.innerHTML = "";
        }
        this.persist();
        clearKnowledgeModalOpenPreference();
        this.updateComposerState();
        this.setPromptPreset(getAllowedPromptPresetIds().includes("edit") ? "edit" : this.promptPresetId);
    };

    AssistSidebar.prototype.updateComposerState = function () {
        var hasText = Boolean(this.textarea && this.textarea.value.trim());
        if (this.sendButton) {
            this.sendButton.disabled = this.isStreaming || !hasText;
        }
        if (this.textarea) {
            this.textarea.readOnly = this.isStreaming;
        }
        if (this.clearButton) {
            this.clearButton.disabled = this.isStreaming;
        }
    };

    AssistSidebar.prototype.clearAttachments = function () {
        this.pendingDocumentAttachments = [];
        this.pendingExcludedAttachments = new Set();
        this.attachmentsTotalCount = 0;
        this.attachmentsParsedCount = 0;
        this.attachmentsCompletedCount = 0;
        this.attachmentsCompletedSize = 0;
        this.attachmentsTotalSize = 0;
        this.attachmentsCompletedFiles = new Set();
        this.attachmentsFailedFiles = new Set();
        this.attachmentsFileSizes = new Map();
        this.mediaTranscriptFileSizes = new Map();
        this.updateAttachmentIndicator();
        this.renderPendingDocumentAttachments();
        this.updateComposerState();
        this.persistPendingAttachments();
    };

    AssistSidebar.prototype.clearAttachmentProgress = function () {
        this.attachmentsTotalCount = 0;
        this.attachmentsParsedCount = 0;
        this.attachmentsCompletedCount = 0;
        this.attachmentsCompletedSize = 0;
        this.attachmentsTotalSize = 0;
        this.attachmentsCompletedFiles = new Set();
        this.attachmentsFailedFiles = new Set();
        this.attachmentsFileSizes = new Map();
        this.mediaTranscriptFileSizes = new Map();
        this.updateAttachmentIndicator();
        this.renderPendingDocumentAttachments();
        this.updateComposerState();
    };

    AssistSidebar.prototype.handleRemoveAttachedDocuments = function () {
        var names = (this.pendingDocumentAttachments || []).slice();
        if (!names.length) return;
        this.clearAttachments();
        var memoId = this.getActiveMemoId();
        if (memoId) {
            this.memoPendingAttachmentMemos.delete(memoId);
        }
        if (!this.docManager) return;
        var self = this;
        this.docManager.deleteDocumentsByNames(this.conversation.id, names)
            .then(function () {
                self.refreshDocumentStats();
                self.refreshMemoContextAttachments();
            })
            .catch(function (err) {
                console.warn("Suppression des documents attachés échouée", err);
            });
    };

    AssistSidebar.prototype.toggleListeningStyles = function (listening) {
        if (this.composer) {
            this.composer.classList.toggle("chat-composer--listening", Boolean(listening));
        }
        if (this.speechButton) {
            this.speechButton.classList.toggle("active", Boolean(listening));
        }
        if (this.textarea) {
            if (listening) {
                this.textarea.placeholder = "ok go, ok annule, ok efface";
            } else {
                this.updateInputPlaceholder();
            }
        }
    };

    AssistSidebar.prototype.handleSpeechToggle = function () {
        if (this.isListening) {
            this.stopSpeechRecognition();
            return;
        }
        this.startSpeechRecognition();
    };

    AssistSidebar.prototype.startSpeechRecognition = function () {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Reconnaissance vocale indisponible dans ce navigateur.");
            return;
        }
        this.stopSpeechRecognition();
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.lang = "fr-FR";
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.maxAlternatives = 1;
        this.speechStopRequested = false;
        this.isListening = true;
        this.lastSpeechHeardAt = Date.now();
        this.speechResultStartIndex = 0;
        this.toggleListeningStyles(true);
        const self = this;

        this.speechRecognition.onresult = function (event) {
            const results = Array.from(event.results);
            const startIndex = Math.max(0, self.speechResultStartIndex || 0);
            const transcript = results
                .slice(startIndex)
                .map(result => (result[0] ? result[0].transcript : ""))
                .join("");
            const finalTranscript = results
                .slice(startIndex)
                .filter(result => result.isFinal)
                .map(result => (result[0] ? result[0].transcript : ""))
                .join("");
            self.lastSpeechHeardAt = Date.now();
            const commandPattern = /\bok\s+(go|efface|annule)\s*$/i;
            const match = transcript.match(commandPattern);
            const finalMatch = finalTranscript.match(commandPattern);
            const command = (match && match[1]) ? match[1].toLowerCase() : null;
            const cleanedTranscript = transcript.replace(commandPattern, "").replace(/\s+/g, " ").trim();
            if (self.speechClearRequested && !command) {
                self.speechClearRequested = false;
                if (self.textarea) {
                    self.textarea.value = "";
                    self.handleInputResize();
                    self.updateComposerState();
                }
                return;
            }
            if (self.textarea) {
                self.textarea.value = cleanedTranscript;
                self.handleInputResize();
                self.updateComposerState();
            }
            if (command && finalMatch) {
                if (command === "go") {
                    self.speechClearRequested = true;
                    self.handleSend({ value: cleanedTranscript });
                    self.speechResultStartIndex = results.length;
                    try {
                        self.speechRecognition?.start?.();
                    } catch (err) { /* ignore */ }
                } else if (command === "efface") {
                    self.speechClearRequested = true;
                    if (self.textarea) {
                        self.textarea.value = "";
                        self.handleInputResize();
                        self.updateComposerState();
                    }
                    self.speechResultStartIndex = results.length;
                    try {
                        self.speechRecognition?.start?.();
                    } catch (err) { /* ignore */ }
                } else if (command === "annule") {
                    self.speechClearRequested = true;
                    const lastUserMessage = self.conversation?.messages
                        ? [...self.conversation.messages].reverse().find(function (message) {
                            return message && message.role === "user" && !message.isDocRestore;
                        })
                        : null;
                    if (lastUserMessage) {
                        self.handleUndoDocument(lastUserMessage);
                    }
                    self.speechResultStartIndex = results.length;
                    try {
                        self.speechRecognition?.start?.();
                    } catch (err) { /* ignore */ }
                }
            }
        };

        this.speechRecognition.onerror = function () {
            if (self.speechStopRequested) return;
            self.stopSpeechRecognition();
        };

        this.speechRecognition.onend = function () {
            if (self.speechStopRequested) {
                self.stopSpeechRecognition();
                return;
            }
            try {
                self.speechRecognition.start();
            } catch (err) {
                console.warn("Speech recognition restart failed", err);
                self.stopSpeechRecognition();
            }
        };

        try {
            this.speechRecognition.start();
        } catch (err) {
            console.warn("Speech recognition failed", err);
            self.stopSpeechRecognition();
        }
    };

    AssistSidebar.prototype.stopSpeechRecognition = function () {
        this.speechStopRequested = true;
        if (this.speechRecognition) {
            try {
                this.speechRecognition.stop();
            } catch (err) { /* ignore */ }
            this.speechRecognition = null;
        }
        this.isListening = false;
        this.toggleListeningStyles(false);
        this.updateComposerState();
    };

    AssistSidebar.prototype.scrollToBottom = function () {
        if (!this.messagesEl) return;
        requestAnimationFrame(function () {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight + 200;
        }.bind(this));
    };

    AssistSidebar.prototype.updateBotMessage = function (message) {
        var entry = this.messageNodes[message.id];
        if (!entry || !entry.contentEl) {
            console.warn("updateBotMessage: missing entry", message.id);
            this.appendMessage(message);
            entry = this.messageNodes[message.id];
        }
        if (!entry || !entry.contentEl) return;
        if (this.isStreaming) {
            entry.contentEl.textContent = message.content || "";
        } else {
            entry.contentEl.innerHTML = this.renderBotContent(message);
            addCopyButtonsToChatContent(entry.contentEl);
        }
        this.applyTechnicalHover(entry, message);
        this.syncBotExtras(entry, message);
        this.scrollToBottom();
    };

    AssistSidebar.prototype.buildTechnicalHover = function (message) {
        if (!message || message.role !== "bot") return "";
        var stats = message.techStats;
        if (!stats) return "";
        var parts = [];
        if (Number.isFinite(stats.responseMs)) {
            parts.push("Temps réponse: " + stats.responseMs + " ms");
        }
        if (Number.isFinite(stats.requestTokens)) {
            parts.push("Tokens requête : " + stats.requestTokens);
        }
        if (Number.isFinite(stats.responseTokens)) {
            parts.push("Tokens réponse : " + stats.responseTokens);
        }
        if (typeof stats.cost === "number" && stats.cost > 0) {
            parts.push("Coût : $" + stats.cost.toFixed(6));
        }
        return parts.join(" · ");
    };

    AssistSidebar.prototype.applyTechnicalHover = function (entry, message) {
        if (!entry || !entry.contentEl) return;
        var title = this.buildTechnicalHover(message);
        if (title) {
            entry.contentEl.title = title;
        } else {
            entry.contentEl.removeAttribute("title");
        }
    };

    AssistSidebar.prototype.updateUserMessage = function (message) {
        var entry = this.messageNodes[message.id];
        if (!entry || !entry.contentEl) return;
        entry.contentEl.innerHTML = escapeHtml(message.content || "").replace(/\n/g, "<br>");
        this.scrollToBottom();
    };

    AssistSidebar.prototype.appendMessage = function (message, options) {
        options = options || {};
        if (!this.messagesEl) return;
        if (this.latestRestoreMessageId && message.id !== this.latestRestoreMessageId) {
            this.removeRestoreRedoButton(this.latestRestoreMessageId);
            this.latestRestoreMessageId = null;
            this.undoState = null;
        }
        var wrapper = document.createElement("div");
        wrapper.className = "chat-message chat-message--" + message.role;

        // Stocker le selectionExcerpt dans le message pour la persistance
        if (message.role === "user" && options.selectionExcerpt) {
            message.selectionExcerpt = options.selectionExcerpt;
        }

        // Créer un conteneur flex pour le prepend et le bubble
        var contentWrapper = document.createElement("div");
        contentWrapper.className = "chat-content-wrapper";

        // Ajouter le prepend pour les messages utilisateurs avec contexte de sélection
        if (message.role === "user" && (options.selectionExcerpt || message.selectionExcerpt)) {
            var prepend = document.createElement("div");
            prepend.className = "chat-prepend";
            prepend.innerHTML = `<i data-lucide="corner-down-right" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>` + escapeHtml(options.selectionExcerpt || message.selectionExcerpt);
            contentWrapper.appendChild(prepend);
            if (window.lucide) window.lucide.createIcons({ props: { size: 12 } });
        }

        var bubbleRow = document.createElement("div");
        bubbleRow.className = "chat-bubble-row";

        if (message.role === "user") {
            if (message.isDocRestore) {
                if (message.id === this.latestRestoreMessageId && this.undoState) {
                    var redoBtn = document.createElement("button");
                    redoBtn.type = "button";
                    redoBtn.className = "chat-restore-redo-btn";
                    redoBtn.style.cursor = "pointer";
                    redoBtn.innerHTML = '<i data-lucide="redo"></i>';
                    redoBtn.setAttribute("title", "Rétablir");
                    redoBtn.addEventListener("click", function (event) {
                        event.stopPropagation();
                        this.handleRedoUndo(message);
                    }.bind(this));
                    bubbleRow.appendChild(redoBtn);
                }
            } else {
                var editBtn = document.createElement("button");
                editBtn.type = "button";
                editBtn.className = "chat-edit-btn";
                editBtn.style.cursor = "pointer";
                editBtn.innerHTML = '<i data-lucide="pen"></i>';
                editBtn.setAttribute("title", "Modifier le prompt");
                editBtn.addEventListener("click", function (event) {
                    event.stopPropagation();
                    this.handleEditPrompt(message);
                }.bind(this));
                bubbleRow.appendChild(editBtn);

                var undoBtn = document.createElement("button");
                undoBtn.type = "button";
                undoBtn.className = "chat-undo-btn";
                undoBtn.style.cursor = "pointer";
                undoBtn.innerHTML = '<i data-lucide="undo"></i>';
                undoBtn.setAttribute("title", "Restaurer le document");
                undoBtn.addEventListener("click", function (event) {
                    event.stopPropagation();
                    this.handleUndoDocument(message);
                }.bind(this));
                bubbleRow.appendChild(undoBtn);
            }
        }

        var bubble = document.createElement("div");
        bubble.className = "chat-bubble";
        bubbleRow.appendChild(bubble);
        contentWrapper.appendChild(bubbleRow);
        wrapper.appendChild(contentWrapper);

        var content = document.createElement("div");
        content.className = "chat-content";
        bubble.appendChild(content);

        if (message.role === "bot") {
            content.innerHTML = this.renderBotContent(message);
            addCopyButtonsToChatContent(content);
        } else {
            content.innerHTML = escapeHtml(message.content || "").replace(/\n/g, "<br>");
        }
        this.applyTechnicalHover({ contentEl: content }, message);

        if (message.role === "user" && Array.isArray(message.attachments) && message.attachments.length) {
            var attachmentList = document.createElement("div");
            attachmentList.className = "chat-attachment-list";
            message.attachments.forEach(function (name) {
                var tag = document.createElement("span");
                tag.className = "chat-attachment";
                tag.textContent = name;
                tag.addEventListener("click", function () {
                    this.openAttachmentPreview(name);
                }.bind(this));
                attachmentList.appendChild(tag);
            }, this);
            bubble.appendChild(attachmentList);
        }

        this.messagesEl.appendChild(wrapper);
        var entry = {
            wrapper: wrapper,
            contentWrapper: contentWrapper,
            contentEl: content,
            refsEl: null,
            suggestionsEl: null
        };
        if (message.role === "bot") {
            entry.refsEl = document.createElement("div");
            entry.refsEl.className = "chat-references";
            bubble.appendChild(entry.refsEl);
            entry.suggestionsEl = document.createElement("div");
            entry.suggestionsEl.className = "chat-suggestions";
            bubble.appendChild(entry.suggestionsEl);

            // Ajouter les boutons d'actions si output existe
            if (message.data && message.data.output && message.data.output !== null) {
                var actionsEl = document.createElement("div");
                actionsEl.className = "chat-bubble-actions";

                var keepAllBtn = document.createElement("button");
                keepAllBtn.type = "button";
                keepAllBtn.className = "chat-bubble-action-btn chat-bubble-action-keep";
                keepAllBtn.innerHTML = `<i data-lucide="check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Garder tout`;
                keepAllBtn.addEventListener("click", function () {
                    if (typeof window.setEditorMarkdown === 'function') {
                        window.setEditorMarkdown(message.data.output);
                    }
                    actionsEl.remove();
                });

                var rejectAllBtn = document.createElement("button");
                rejectAllBtn.type = "button";
                rejectAllBtn.className = "chat-bubble-action-btn chat-bubble-action-reject";
                rejectAllBtn.innerHTML = `<i data-lucide="x" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i> Refuser tout`;
                rejectAllBtn.addEventListener("click", function () {
                    actionsEl.remove();
                });

                actionsEl.appendChild(keepAllBtn);
                actionsEl.appendChild(rejectAllBtn);
                bubble.appendChild(actionsEl);
                if (window.lucide) window.lucide.createIcons({ props: { size: 14 } });
            }

            this.syncBotExtras(entry, message);
        }
        this.messageNodes[message.id] = entry;
        if (message.role === "user" && window.lucide) {
            window.lucide.createIcons({ props: { size: 14 } });
        }
        this.scrollToBottom();
    };

    AssistSidebar.prototype.removeRestoreRedoButton = function (messageId) {
        if (!messageId) return;
        var entry = this.messageNodes[messageId];
        var wrapper = entry?.wrapper;
        if (!wrapper) return;
        var redoBtn = wrapper.querySelector(".chat-restore-redo-btn");
        if (redoBtn) {
            redoBtn.remove();
        }
    };

    AssistSidebar.prototype.handleUndoDocument = function (message) {
        if (!message || message.role !== "user") return;
        var docId = message.docSnapshotId
            || (typeof global.getMemoActiveTabId === "function" ? global.getMemoActiveTabId() : null)
            || window.__memoState?.activeTabId
            || null;
        var snapshotContent = (typeof message.docSnapshotContent === "string") ? message.docSnapshotContent : "";
        if (!snapshotContent) {
            snapshotContent = getMemoTabContentById(docId) || "";
        }
        var activeTabId = (typeof global.getMemoActiveTabId === "function" ? global.getMemoActiveTabId() : null)
            || window.__memoState?.activeTabId
            || null;
        var activeTabContent = readDocumentContent() || "";

        if (this.latestRestoreMessageId) {
            this.removeRestoreRedoButton(this.latestRestoreMessageId);
        }

        this.undoState = {
            messages: cloneForHistory(this.conversation.messages) || [],
            activeTabId: activeTabId,
            activeTabContent: activeTabContent
        };

        var msgIndex = this.conversation.messages.findIndex(function (msg) {
            return msg && msg.id === message.id;
        });
        if (msgIndex >= 0) {
            this.conversation.messages.splice(msgIndex, 1);
        }
        var entry = this.messageNodes[message.id];
        if (entry?.wrapper) {
            entry.wrapper.remove();
        }
        delete this.messageNodes[message.id];

        if (docId && typeof global.setMemoActiveTab === "function") {
            global.setMemoActiveTab(docId);
        }
        if (typeof global.setEditorMarkdown === "function" && snapshotContent) {
            global.setEditorMarkdown(snapshotContent);
        }
        if (docId && typeof global.setMemoReadOnly === "function") {
            global.setMemoReadOnly(docId, false);
        }

        var restoreMessage = createMessage("user", "Document restauré");
        restoreMessage.isDocRestore = true;
        restoreMessage.docSnapshotId = docId || null;
        restoreMessage.docSnapshotContent = snapshotContent || "";
        this.conversation.messages.push(restoreMessage);
        this.latestRestoreMessageId = restoreMessage.id;
        this.appendMessage(restoreMessage);
        this.persist();
    };

    AssistSidebar.prototype.handleRedoUndo = function (message) {
        if (!message || message.id !== this.latestRestoreMessageId) return;
        if (!this.undoState) return;
        var undoState = this.undoState;
        var restoreMessages = cloneForHistory(undoState.messages) || [];
        this.conversation.messages = restoreMessages;
        this.latestRestoreMessageId = null;
        this.undoState = null;
        if (this.messagesEl) {
            this.messagesEl.innerHTML = "";
        }
        this.messageNodes = {};
        this.renderInitialMessages();

        var activeTabId = undoState.activeTabId;
        var activeTabContent = undoState.activeTabContent;
        if (activeTabId && typeof global.setMemoActiveTab === "function") {
            global.setMemoActiveTab(activeTabId);
        }
        if (typeof global.setEditorMarkdown === "function" && typeof activeTabContent === "string") {
            global.setEditorMarkdown(activeTabContent);
        }
        this.persist();
    };

    AssistSidebar.prototype.handleEditPrompt = function (message) {
        if (!message || message.role !== "user") return;
        if (this.isStreaming) {
            this.abortStream?.();
        }
        if (this.activeEdit && this.activeEdit.message?.id !== message.id) {
            this.cancelEditPrompt();
        }
        if (this.activeEdit && this.activeEdit.message?.id === message.id) return;
        var entry = this.messageNodes[message.id];
        if (!entry || !entry.wrapper) return;
        var contentWrapper = entry.contentWrapper || entry.wrapper.querySelector(".chat-content-wrapper");
        if (!contentWrapper) return;

        var index = this.conversation.messages.findIndex(function (msg) {
            return msg.id === message.id;
        });
        var removed = [];
        if (index >= 0) {
            removed = this.conversation.messages.splice(index + 1);
            removed.forEach(function (msg) {
                var node = this.messageNodes[msg.id];
                if (node?.wrapper) {
                    node.wrapper.remove();
                }
                delete this.messageNodes[msg.id];
            }.bind(this));
        }
        this.persist();

        var docId = message.docSnapshotId
            || (typeof global.getMemoActiveTabId === "function" ? global.getMemoActiveTabId() : null)
            || window.__memoState?.activeTabId
            || null;
        var activeTabId = (typeof global.getMemoActiveTabId === "function" ? global.getMemoActiveTabId() : null)
            || window.__memoState?.activeTabId
            || null;
        var activeTabContent = readDocumentContent() || "";
        var snapshotDocContent = (typeof message.docSnapshotContent === "string") ? message.docSnapshotContent : null;
        var snapshotLatestContent = getMemoTabContentById(docId);
        if (docId && typeof global.setMemoActiveTab === "function") {
            global.setMemoActiveTab(docId);
        }
        if (docId && typeof global.setMemoReadOnly === "function") {
            global.setMemoReadOnly(docId, true);
        }
        if (docId && typeof global.setEditorMarkdown === "function" && typeof snapshotDocContent === "string") {
            global.setEditorMarkdown(snapshotDocContent);
        }

        var inline = this.buildInlineComposer(message);
        entry.wrapper.replaceChild(inline.composer, contentWrapper);
        this.activeEdit = {
            message: message,
            entry: entry,
            originalContentWrapper: contentWrapper,
            originalContent: message.content || "",
            composer: inline.composer,
            textarea: inline.textarea,
            docId: docId,
            removedMessages: removed,
            restoreState: {
                activeTabId: activeTabId,
                activeTabContent: activeTabContent,
                snapshotDocId: docId,
                snapshotLatestContent: snapshotLatestContent
            }
        };

        inline.cancelBtn.addEventListener("click", this.cancelEditPrompt.bind(this));
        inline.sendBtn.addEventListener("click", this.submitEditPrompt.bind(this));
        inline.textarea.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.submitEditPrompt();
            }
        }.bind(this));
        inline.textarea.focus();
        if (window.lucide) window.lucide.createIcons({ props: { size: 14 } });
    };

    AssistSidebar.prototype.buildInlineComposer = function (message) {
        var composer = document.createElement("div");
        composer.className = "chat-composer chat-composer--inline";

        var textareaWrapper = document.createElement("div");
        textareaWrapper.className = "chat-input-wrapper";
        var textarea = document.createElement("textarea");
        textarea.className = "chat-input";
        textarea.rows = 2;
        textarea.value = message?.content || "";
        textareaWrapper.appendChild(textarea);
        composer.appendChild(textareaWrapper);

        var actions = document.createElement("div");
        actions.className = "chat-composer-actions";
        var leftActions = document.createElement("div");
        leftActions.className = "chat-composer-left-actions";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn-secondary chat-edit-cancel-btn";
        cancelBtn.innerHTML = '<i data-lucide="x"></i>';
        cancelBtn.setAttribute("title", "Annuler");
        leftActions.appendChild(cancelBtn);
        var inlinePromptDropdown = this.buildInlinePromptDropdown();
        leftActions.appendChild(inlinePromptDropdown);

        var promptShortcutsBtn = document.createElement("button");
        promptShortcutsBtn.type = "button";
        promptShortcutsBtn.className = "btn-secondary chat-prompt-shortcuts-btn";
        promptShortcutsBtn.innerHTML = '<i data-lucide="sparkles"></i>';
        promptShortcutsBtn.setAttribute("title", "Raccourcis Prompt");
        promptShortcutsBtn.addEventListener("click", function () {
            this.openPromptShortcutsModal(textarea);
        }.bind(this));
        leftActions.appendChild(promptShortcutsBtn);

        var attachFilesBtn = document.createElement("button");
        attachFilesBtn.type = "button";
        attachFilesBtn.className = "btn-secondary chat-attach-files-btn chat-scroll-btn";
        attachFilesBtn.innerHTML = '<i data-lucide="paperclip"></i>';
        attachFilesBtn.addEventListener("click", this.openDocumentSelector.bind(this));
        leftActions.appendChild(attachFilesBtn);
        actions.appendChild(leftActions);

        var sendBtn = document.createElement("button");
        sendBtn.type = "button";
        sendBtn.className = "btn-primary chat-send-btn";
        sendBtn.innerHTML = '<i data-lucide="send"></i>';
        actions.appendChild(sendBtn);
        composer.appendChild(actions);

        var resize = function () {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, 220) + "px";
        };
        textarea.addEventListener("input", resize);
        resize();

        return { composer: composer, textarea: textarea, sendBtn: sendBtn, cancelBtn: cancelBtn };
    };

    AssistSidebar.prototype.cancelEditPrompt = function () {
        this.finishEditPrompt("cancel");
    };

    AssistSidebar.prototype.submitEditPrompt = function () {
        var edit = this.activeEdit;
        if (!edit) return;
        var value = edit.textarea?.value || "";
        this.finishEditPrompt("send", value);
    };

    AssistSidebar.prototype.finishEditPrompt = function (action, value) {
        var edit = this.activeEdit;
        if (!edit) return;
        var entry = edit.entry;
        if (edit.composer?.parentNode && edit.originalContentWrapper) {
            edit.composer.parentNode.replaceChild(edit.originalContentWrapper, edit.composer);
        }
        if (entry && edit.originalContentWrapper) {
            entry.contentWrapper = edit.originalContentWrapper;
            entry.contentEl = edit.originalContentWrapper.querySelector(".chat-content");
        }
        if (edit.docId && typeof global.setMemoReadOnly === "function") {
            global.setMemoReadOnly(edit.docId, false);
        }
        this.activeEdit = null;

        if (action === "send") {
            var trimmed = String(value || "").trim();
            if (!trimmed) {
                var msgIndex = this.conversation.messages.findIndex(function (msg) {
                    return msg && edit.message && msg.id === edit.message.id;
                });
                if (msgIndex >= 0) {
                    this.conversation.messages.splice(msgIndex, 1);
                }
                if (entry?.wrapper) {
                    entry.wrapper.remove();
                }
                if (edit.message?.id) {
                    delete this.messageNodes[edit.message.id];
                }
                this.persist();
                return;
            }
            edit.message.content = trimmed;
            if (entry?.contentEl) {
                entry.contentEl.innerHTML = escapeHtml(edit.message.content || "").replace(/\n/g, "<br>");
            }
            this.persist();
            this.handleSend({ value: trimmed, editMessage: edit.message, fromInline: true });
            return;
        }
        if (action === "cancel") {
            var restore = edit.restoreState || {};
            var snapshotDocId = restore.snapshotDocId;
            var snapshotLatestContent = restore.snapshotLatestContent;
            var activeTabId = restore.activeTabId;
            var activeTabContent = restore.activeTabContent;
            if (snapshotDocId && typeof global.setMemoActiveTab === "function" && typeof global.setEditorMarkdown === "function") {
                global.setMemoActiveTab(snapshotDocId);
                if (typeof snapshotLatestContent === "string") {
                    global.setEditorMarkdown(snapshotLatestContent);
                }
            }
            if (activeTabId && typeof global.setMemoActiveTab === "function" && typeof global.setEditorMarkdown === "function") {
                global.setMemoActiveTab(activeTabId);
                if (typeof activeTabContent === "string") {
                    global.setEditorMarkdown(activeTabContent);
                }
            }
            if (Array.isArray(edit.removedMessages) && edit.removedMessages.length) {
                edit.removedMessages.forEach(function (msg) {
                    this.conversation.messages.push(msg);
                    this.appendMessage(msg);
                }.bind(this));
            }
        }
        this.persist();
    };

    AssistSidebar.prototype.renderBotContent = function (message) {
        return renderBotMarkdown(message.content || "");
    };

    AssistSidebar.prototype.syncBotExtras = function (entry, message) {
        if (!entry) return;
        var references = Array.isArray(message.references) ? message.references : [];
        var suggestions = Array.isArray(message.suggestions) ? message.suggestions : [];

        if (entry.refsEl) {
            entry.refsEl.innerHTML = "";
            if (references.length) {
                entry.refsEl.style.display = "";
                var list = document.createElement("ul");
                list.className = "chat-references-list";
                references.forEach(function (ref) {
                    var docLabel = this.resolveDocName(ref.documentId) || "Document";
                    if (docLabel === "Non fourni") return;
                    var abstractLabel = (ref.abstract || "").trim();
                    var displayTitle = abstractLabel || docLabel;
                    var titleText = docLabel;
                    var item = document.createElement("li");
                    item.className = "chat-reference-item";
                    var link = document.createElement("button");
                    link.type = "button";
                    link.className = "chat-reference-link";
                    link.textContent = displayTitle;
                    link.title = titleText;
                    if (ref.documentId) {
                        link.dataset.documentId = ref.documentId;
                    }
                    if (ref.chunkId) {
                        link.dataset.chunkId = ref.chunkId;
                    }
                    link.addEventListener("click", function () {
                        this.openReferencePreview(message, ref);
                    }.bind(this));
                    item.appendChild(link);
                    list.appendChild(item);
                }, this);
                entry.refsEl.appendChild(list);
            } else {
                entry.refsEl.style.display = "none";
            }
        }

        if (entry.suggestionsEl) {
            entry.suggestionsEl.innerHTML = "";
            if (suggestions.length) {
                entry.suggestionsEl.style.display = "";
                var wrap = document.createElement("div");
                wrap.className = "chat-suggestions-list";
                suggestions.forEach(function (text) {
                    if (!text) return;
                    var btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "chat-suggestion-btn";
                    btn.textContent = text;
                    btn.addEventListener("click", function () {
                        this.handleSuggestionClick(text);
                    }.bind(this));
                    wrap.appendChild(btn);
                }, this);
                entry.suggestionsEl.appendChild(wrap);
            } else {
                entry.suggestionsEl.style.display = "none";
            }
        }
    };

    AssistSidebar.prototype.handleSuggestionClick = function (text) {
        if (!text || !this.textarea) return;
        if (this.isStreaming) return;
        this.textarea.value = text;
        this.handleInputResize();
        this.updateComposerState();
        this.handleSend();
    };

    AssistSidebar.prototype.renderInitialMessages = function () {
        var _this = this;
        (this.conversation.messages || []).forEach(function (message) {
            _this.appendMessage(message);
        });
    };

    AssistSidebar.prototype.getPromptPresets = function () {
        var storePresets = global.GoToolkitChatPrompt?.PRESETS || {};
        var allowed = getAllowedPromptPresetIds();

        var advicePrompt = getSystemPrompt();

        var editPersisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.edit");
        var editPrompt = editPersisted
            || storePresets?.edit?.prompt
            || storePresets?.edit?.defaultPrompt
            || "";

        var suggestPersisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.suggest");
        var suggestPrompt = suggestPersisted
            || storePresets?.suggest?.prompt
            || storePresets?.suggest?.defaultPrompt
            || "";

        var importPersisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.import");
        var importPrompt = importPersisted
            || storePresets?.import?.prompt
            || storePresets?.import?.defaultPrompt
            || "";

        var extractPersisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.extract");
        var extractPrompt = extractPersisted
            || storePresets?.extract?.prompt
            || storePresets?.extract?.defaultPrompt
            || "";

        var drawPersisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.draw");
        var drawPrompt = drawPersisted
            || storePresets?.draw?.prompt
            || storePresets?.draw?.defaultPrompt
            || "";

        var all = {
            advice: {
                id: "advice",
                label: storePresets?.advice?.label || "Demander",
                prompt: advicePrompt
            },
            suggest: {
                id: "suggest",
                label: storePresets?.suggest?.label || "Suggérer",
                prompt: suggestPrompt
            },
            edit: {
                id: "edit",
                label: storePresets?.edit?.label || "Éditer",
                prompt: editPrompt
            },
            import: {
                id: "import",
                label: storePresets?.import?.label || "Importer",
                prompt: importPrompt
            },
            draw: {
                id: "draw",
                label: storePresets?.draw?.label || "Draw",
                prompt: drawPrompt
            },
            extract: {
                id: "extract",
                label: storePresets?.extract?.label || "Extraire",
                prompt: extractPrompt
            }
        };

        var filtered = {};
        allowed.forEach(function (id) {
            if (all[id]) filtered[id] = all[id];
        });
        if (!filtered.edit && all.edit) {
            filtered.edit = all.edit;
        }
        return filtered;
    };

    AssistSidebar.prototype.setPromptPreset = function (presetId, options) {
        var allowed = getAllowedPromptPresetIds();
        options = options || {};
        var prevPreset = this.promptPresetId;
        var next = allowed.includes(presetId) ? presetId : (allowed[0] || "advice");
        this.promptPresetId = next;
        persistPromptPreset(next);
        try {
            if (global.document && typeof global.CustomEvent === "function") {
                global.document.dispatchEvent(new global.CustomEvent("goToolkitChatPromptPresetChanged", {
                    detail: { presetId: next, appId: CHAT_APP_ID }
                }));
            }
        } catch (err) { /* ignore */ }
        if (next !== "advice") {
            this.closeKnowledgeModal(false);
        }
        this.updatePromptDropdownLabel();
        this.updateInlinePromptDropdownLabel();
        this.updateInputPlaceholder();
        this.updateHeaderDocumentCount();
        this.refreshDocumentStats();
        this.syncKnowledgeModalVisibility();
    };

    AssistSidebar.prototype.updateInputPlaceholder = function () {
        if (!this.textarea) return;
        var placeholders = {
            'edit': 'Que veux-tu modifier ?',
            'advice': 'Que veux-tu demander ?',
            'draw': 'Que veux-tu dessiner ?',
            'suggest': 'Que veux-tu corriger ?',
            'ask': 'Que veux-tu explorer ?',
            'import': 'Que veux-tu importer ?',
            'extract': 'Que veux-tu extraire ?'
        };
        this.textarea.placeholder = placeholders[this.promptPresetId] || 'ok go, ok annule, ok efface';
    };

    AssistSidebar.prototype.initMemoSelectionTracking = function () {
        if (this.memoSelectionTrackingInit) return;
        this.memoSelectionTrackingInit = true;

        var overlay = document.getElementById("chat-selection-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "chat-selection-overlay";
            overlay.style.cssText = [
                "position: fixed",
                "background: rgba(245, 158, 11, 0.15)",
                "border: 1px solid rgba(245, 158, 11, 0.3)",
                "pointer-events: none",
                "display: none",
                "z-index: 998",
                "border-radius: 4px"
            ].join(";");
            document.body.appendChild(overlay);
        }
        this.memoSelectionOverlay = overlay;

        var self = this;
        this._lastFocusedEditor = null;
        document.addEventListener("focusin", function (e) {
            if (window.memoEditor?.view?.dom && window.memoEditor.view.dom.contains(e.target)) {
                self._lastFocusedEditor = window.memoEditor;
            }
        });

        document.addEventListener("memoEditorSelectionChanged", function (event) {
            var detail = event?.detail || {};
            var keepSelection = !detail.isSelected
                && this.memoSelectionFollowActive
                && document.activeElement === this.textarea
                && this.memoSelection;
            if (!detail.isSelected) {
                if (!keepSelection) {
                    this.memoSelection = null;
                    this.memoSelectionDetail = detail;
                    this.memoSelectionCoords = null;
                    this.memoSelectionBlockCoords = null;
                    if (this.memoSelectionOverlay) {
                        this.memoSelectionOverlay.style.display = "none";
                    }
                }
                return;
            }

            this.memoSelectionDetail = detail;

            this.memoSelection = {
                text: detail.selectionText,
                blockText: detail.blockText || detail.selectionText,
                blockMarkdown: detail.blockMarkdown || detail.blockText || detail.selectionText,
                excerpt: detail.selectionExcerpt,
                from: detail.positionFrom,
                to: detail.positionTo
            };
            this.memoSelectionCoords = detail.coords || null;

            try {
                var editorInstance = window.memoEditor;
                if (editorInstance && Number.isFinite(detail.positionFrom) && Number.isFinite(detail.positionTo)) {
                    var blockStart = editorInstance.view.coordsAtPos(detail.positionFrom);
                    var blockEnd = editorInstance.view.coordsAtPos(detail.positionTo);
                    this.memoSelectionBlockCoords = {
                        top: blockStart.top,
                        left: blockStart.left,
                        width: blockEnd.right - blockStart.left,
                        height: blockEnd.bottom - blockStart.top
                    };
                }
            } catch (err) {
                this.memoSelectionBlockCoords = null;
            }
            if (this.memoSelectionOverlay && this.memoSelectionOverlay.style.display !== "none") {
                this.updateMemoSelectionOverlayPosition();
            }
        }.bind(this));

        var editorWrap = document.querySelector(".editor-wrap");
        if (editorWrap) {
            editorWrap.addEventListener("scroll", function () {
                if (!this.memoSelection || !window.memoEditor) return;
                try {
                    var view = window.memoEditor.view;
                    var coordsStart = view.coordsAtPos(this.memoSelection.from);
                    var coordsEnd = view.coordsAtPos(this.memoSelection.to);
                    this.memoSelectionCoords = {
                        top: coordsEnd.bottom + 10,
                        left: coordsStart.left,
                        bottom: coordsEnd.bottom,
                        right: coordsEnd.right
                    };
                    this.memoSelectionBlockCoords = {
                        top: coordsStart.top,
                        left: coordsStart.left,
                        width: coordsEnd.right - coordsStart.left,
                        height: coordsEnd.bottom - coordsStart.top
                    };
                    if (this.memoSelectionOverlay && this.memoSelectionOverlay.style.display !== "none") {
                        this.updateMemoSelectionOverlayPosition();
                    }
                } catch (err) {
                    // ignore
                }
            }.bind(this), { passive: true });
        }

        window.addEventListener("blur", function () {
            if (this.memoSelectionOverlay) {
                this.memoSelectionOverlay.style.display = "none";
            }
        }.bind(this));
    };

    AssistSidebar.prototype.updateMemoSelectionOverlayPosition = function () {
        if (!this.memoSelectionOverlay || !this.memoSelectionBlockCoords) return;
        this.memoSelectionOverlay.style.position = "fixed";
        this.memoSelectionOverlay.style.top = this.memoSelectionBlockCoords.top + "px";
        this.memoSelectionOverlay.style.left = this.memoSelectionBlockCoords.left + "px";
        this.memoSelectionOverlay.style.width = Math.max(this.memoSelectionBlockCoords.width, 100) + "px";
        this.memoSelectionOverlay.style.height = Math.max(this.memoSelectionBlockCoords.height, 20) + "px";
    };

    AssistSidebar.prototype.refreshMemoSelectionFromEditorSelection = function (editor) {
        if (!editor || !editor.view || !editor.state) return;
        try {
            var selection = editor.state.selection;
            if (!selection || selection.empty) {
                this.memoSelection = null;
                this.memoSelectionBlockCoords = null;
                this.memoSelectionCoords = null;
                if (this.memoSelectionOverlay) {
                    this.memoSelectionOverlay.style.display = "none";
                }
                return;
            }
            var from = selection.from;
            var to = selection.to;
            var selectedText = editor.state.doc.textBetween(from, to, " ");
            this.memoSelection = {
                text: selectedText,
                blockText: selectedText,
                blockMarkdown: selectedText,
                excerpt: selectedText ? selectedText.substring(0, 100) + (selectedText.length > 100 ? "…" : "") : "",
                from: from,
                to: to
            };
            var coordsStart = editor.view.coordsAtPos(from);
            var coordsEnd = editor.view.coordsAtPos(to);
            this.memoSelectionBlockCoords = {
                top: coordsStart.top,
                left: coordsStart.left,
                width: coordsEnd.right - coordsStart.left,
                height: coordsEnd.bottom - coordsStart.top
            };
            if (this.memoSelectionOverlay) {
                this.memoSelectionOverlay.style.display = "block";
                this.updateMemoSelectionOverlayPosition();
            }
        } catch (err) {
            // ignore
        }
    };

    AssistSidebar.prototype.getMemoSelectionPayload = function (documentMarkdown, documentContent) {
        if (!this.memoSelection) return null;
        var selectionBlockMarkdown = (this.memoSelection.blockMarkdown || "").toString().trim();
        var selectionBlockText = (this.memoSelection.blockText || this.memoSelection.text || "").toString();
        var selectionText = (this.memoSelection.text || "").toString();
        var selectionStartLine = 0;
        var selectionEndLine = 0;

        if (documentMarkdown && selectionBlockMarkdown) {
            var idx = documentMarkdown.indexOf(selectionBlockMarkdown);
            if (idx >= 0) {
                selectionStartLine = documentMarkdown.slice(0, idx).split("\n").length - 1;
                selectionEndLine = selectionStartLine + selectionBlockMarkdown.split("\n").length;
            }
        }

        if (!Number.isFinite(selectionEndLine) || selectionEndLine <= selectionStartLine) {
            var lines = (documentContent || "").split("\n");
            var isWhitespaceSelection = selectionText.trim().length === 0 && selectionBlockText.trim().length === 0;
            var anchorFrom = isWhitespaceSelection ? this.memoSelection.to : this.memoSelection.from;
            var anchorTo = isWhitespaceSelection ? this.memoSelection.to : this.memoSelection.to;
            var charCount = 0;

            for (var i = 0; i < lines.length; i++) {
                var lineLength = lines[i].length + 1;
                if (charCount + lineLength > anchorFrom) {
                    selectionStartLine = i;
                    break;
                }
                charCount += lineLength;
            }

            charCount = 0;
            selectionEndLine = lines.length;
            for (var j = 0; j < lines.length; j++) {
                var lineLength2 = lines[j].length + 1;
                if (charCount + lineLength2 > anchorTo) {
                    selectionEndLine = j + 1;
                    break;
                }
                charCount += lineLength2;
            }

            if (isWhitespaceSelection && selectionEndLine <= selectionStartLine) {
                selectionEndLine = selectionStartLine + 1;
            }
        }

        return {
            text: selectionBlockMarkdown || selectionBlockText,
            start: selectionStartLine,
            end: selectionEndLine
        };
    };

    AssistSidebar.prototype.getActiveSystemPrompt = function () {
        if (this.promptPresetId === "ask") {
            var persisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.info");
            if (persisted) return persisted;
            return global.GoToolkitChatPrompt?.INFO_PROMPT
                || global.GoToolkitChatPrompt?.DEFAULT_INFO_PROMPT
                || "";
        }
        if (this.promptPresetId === "suggest") {
            var persistedSuggest = getPersistedPromptOrEmpty("goToolkit.chat.prompt.suggest");
            if (persistedSuggest) return persistedSuggest;
            return global.GoToolkitChatPrompt?.PRESETS.suggest?.prompt
                || global.GoToolkitChatPrompt?.PRESETS.suggest?.defaultPrompt
                || "";
        }
        if (this.promptPresetId === "edit") {
            var persistedEdit = getPersistedPromptOrEmpty("goToolkit.chat.prompt.edit");
            if (persistedEdit) return persistedEdit;
            return global.GoToolkitChatPrompt?.PRESETS.edit.prompt
                || global.GoToolkitChatPrompt?.PRESETS.edit.defaultPrompt
                || "";
        }
        if (this.promptPresetId === "import") {
            var persistedImport = getPersistedPromptOrEmpty("goToolkit.chat.prompt.import");
            if (persistedImport) return persistedImport;
            return global.GoToolkitChatPrompt?.PRESETS.import?.prompt
                || global.GoToolkitChatPrompt?.PRESETS.import?.defaultPrompt
                || "";
        }
        if (this.promptPresetId === "draw") {
            var persistedDraw = getPersistedPromptOrEmpty("goToolkit.chat.prompt.draw");
            if (persistedDraw) return persistedDraw;
            return global.GoToolkitChatPrompt?.PRESETS.draw?.prompt
                || global.GoToolkitChatPrompt?.PRESETS.draw?.defaultPrompt
                || "";
        }
        if (this.promptPresetId === "extract") {
            var persistedExtract = getPersistedPromptOrEmpty("goToolkit.chat.prompt.extract");
            if (persistedExtract) return persistedExtract;
            return global.GoToolkitChatPrompt?.PRESETS.extract?.prompt
                || global.GoToolkitChatPrompt?.PRESETS.extract?.defaultPrompt
                || "";
        }
        return getSystemPrompt();
    };

    AssistSidebar.prototype.filterHitsByPromptPreset = function (hits) {
        if (!Array.isArray(hits)) return [];
        return hits;
    };

    AssistSidebar.prototype.buildPayload = function (systemPrompt, userMessage, docInfo) {
        var self = this;
        var promptContent = (systemPrompt && systemPrompt.trim()) ? systemPrompt : getSystemPrompt();
        var messages = [{ role: "system", content: promptContent }];
        var userContent = (userMessage?.content || "").trim();
        var selectionContext = userMessage?.selectionContext || null;
        if (userContent) {
            var docContent = (typeof userMessage?.docSnapshotContent === "string")
                ? userMessage.docSnapshotContent
                : readDocumentContent();
            if (docContent && docContent.trim()) {
                if (selectionContext) {
                    userContent = "DOCUMENT:\n" + docContent.trim() + "\n\nSELECTION:\n" + JSON.stringify(selectionContext) + "\n\nASK:\n" + userContent;
                } else {
                    userContent = "DOCUMENT\n" + docContent.trim() + "\n\nASK\n" + userContent;
                }
            } else {
                if (selectionContext) {
                    userContent = "SELECTION:\n" + JSON.stringify(selectionContext) + "\n\nASK:\n" + userContent;
                } else {
                    userContent = "ASK\n" + userContent;
                }
            }
        }
        if (userMessage) {
            messages.push({
                role: "user",
                content: userContent
            });
        }
        var payload = {
            stream: true,
            messages: messages
        };

        function appendToUser(text) {
            if (!text || !text.trim()) return;
            var idx = messages.findIndex(function (msg) {
                return msg.role === "user";
            });
            if (idx >= 0) {
                messages[idx].content += (messages[idx].content ? "\n\n" : "") + text;
            } else {
                messages.push({
                    role: "user",
                    content: text
                });
            }
        }

        function hasDocEntries(info) {
            if (!info) return false;
            var embedded = info.embedded || {};
            return (Array.isArray(embedded.methods) && embedded.methods.length)
                || (Array.isArray(embedded.tools) && embedded.tools.length)
                || (Array.isArray(embedded.context) && embedded.context.length)
                || (Array.isArray(info.context) && info.context.length);
        }

        function appendDocSections(info, label) {
            if (!info) return;
            var embeddedSections = {};
            var embeddedMethods = Array.isArray(info.embedded?.methods)
                ? info.embedded.methods
                : [];
            var embeddedTools = Array.isArray(info.embedded?.tools)
                ? info.embedded.tools
                : [];
            var embeddedContext = Array.isArray(info.embedded?.context)
                ? info.embedded.context
                : [];
            if (embeddedMethods.length) {
                embeddedSections.methods = self.formatEntriesForPayload(embeddedMethods);
            }
            if (embeddedTools.length) {
                embeddedSections.tools = self.formatEntriesForPayload(embeddedTools);
            }
            if (embeddedContext.length) {
                var contextKey = label && label !== "CONTEXT"
                    ? label.toLowerCase()
                    : "context";
                embeddedSections[contextKey] = self.formatEntriesForPayload(embeddedContext);
            }
            if (Object.keys(embeddedSections).length) {
                var embedText = self.buildEmbeddedResultsText(embeddedSections);
                if (embedText) {
                    appendToUser(embedText);
                }
            }
            if (Array.isArray(info.context) && info.context.length) {
                var contextEntries = self.formatEntriesForPayload(info.context);
                var contextKey = (label || "CONTEXT").toLowerCase();
                var contextSections = {};
                contextSections[contextKey] = contextEntries;
                var contextText = self.buildEmbeddedResultsText(contextSections);
                if (contextText) {
                    appendToUser(contextText);
                }
            }
        }

        var contextDocInfo = docInfo?.context;
        var knowledgeDocInfo = docInfo?.knowledge;
        if (shouldIncludeKnowledgeForPreset(this.promptPresetId) && hasDocEntries(knowledgeDocInfo)) {
            appendDocSections(knowledgeDocInfo, "KNOWLEDGE");
        }
        appendDocSections(contextDocInfo, "CONTEXT");

        var historyText = self.buildHistoryText();
        if (historyText) {
            appendToUser("HISTORY\n" + historyText);
        }

        return payload;
    };

    AssistSidebar.prototype.formatEntriesForPayload = function (entries) {
        if (!entries || !entries.length) return [];
        var formatted = [];
        entries.forEach(function (entry) {
            var resolvedDocName = (entry.docName || "").toString().trim()
                ? entry.docName
                : entry.fileName;
            var record = {
                chunkId: entry.chunkId,
                documentId: entry.documentId,
                documentName: resolvedDocName || entry.documentName,
                docName: entry.docName,
                category: entry.category || "",
                text: entry.text || "",
                section: entry.section || "",
                page: typeof entry.page === "number" ? entry.page : null,
                line: typeof entry.line === "number" ? entry.line : null,
                sourceType: entry.sourceType || ""
            };
            if (typeof entry.score === "number") {
                record.score = entry.score;
            }
            if (typeof entry.chunk === "number") {
                record.chunk = entry.chunk;
            }
            formatted.push(record);
        });
        return formatted;
    };

    AssistSidebar.prototype.buildEmbeddedResultsText = function (sections) {
        if (!sections || typeof sections !== "object") return "";
        var parts = [];
        Object.keys(sections).forEach(function (key) {
            var entries = sections[key];
            if (!entries || !entries.length) return;
            var header = key.toUpperCase();
            var includeJson = header === "CONTEXT" || header === "KNOWLEDGE";
            var includePlain = header !== "CONTEXT" && header !== "KNOWLEDGE";
            var rows = "";
            if (includePlain) {
                rows = entries
                    .map(function (entry) {
                        var doc = entry.docName || "Document";
                        var snippet = entry.text ? entry.text.trim() : "";
                        if (snippet) {
                            snippet = snippet.replace(/\s+/g, " ").slice(0, 200);
                            return "- " + doc + ": " + snippet;
                        }
                        return "- " + doc;
                    })
                    .join("\n");
            }
            var jsonRows = "";
            if (includeJson) {
                jsonRows = entries
                    .map(function (entry) {
                        if (!entry.chunkId || !entry.documentId) return null;
                        return JSON.stringify({
                            chunkId: entry.chunkId,
                            documentId: entry.documentId,
                            documentName: entry.documentName || entry.docName || entry.fileName || "Document",
                            content: entry.text || ""
                        });
                    })
                    .filter(Boolean)
                    .join("\n");
            }
            var sectionParts = [header];
            if (rows) sectionParts.push(rows);
            if (jsonRows) sectionParts.push(jsonRows);
            if (sectionParts.length > 1) {
                parts.push(sectionParts.join("\n"));
            }
        });
        return parts.join("\n\n");
    };

    AssistSidebar.prototype.stripDocExtension = function (value) {
        if (!value) return "";
        var idx = value.lastIndexOf(".");
        if (idx > 0) {
            return value.slice(0, idx);
        }
        return value;
    };

    AssistSidebar.prototype.buildHitEntry = function (hit) {
        if (!hit) return null;
        var rawName = (hit.docName || "Document").toString();
        var stripped = this.stripDocExtension(rawName);
        return {
            chunkId: hit.id,
            documentId: hit.docId,
            documentName: stripped ? stripped.toString() : "",
            fileName: (hit.fileName || hit.sourceFileName || rawName).toString(),
            docName: stripped,
            keyName: stripped.toLowerCase(),
            text: hit.text || "",
            score: typeof hit.score === "number" ? hit.score : undefined,
            chunk: typeof hit.idx === "number" ? hit.idx : undefined,
            section: hit.section || "",
            page: typeof hit.page === "number" ? hit.page : undefined,
            line: typeof hit.line === "number" ? hit.line : undefined,
            sourceType: hit.sourceType || "context"
        };
    };

    AssistSidebar.prototype.categorizeHits = function (hits) {
        var embedded = { methods: [], tools: [], attachments: [] };
        var context = [];
        (hits || []).forEach(function (hit) {
            var entry = this.buildHitEntry(hit);
            if (!entry) return;
            var scopes = Array.isArray(hit?.docScopes) ? hit.docScopes : [];
            if (scopes.includes("attachments")) {
                entry.category = "attachment";
                embedded.attachments.push(entry);
                return;
            }
            if (scopes.includes("methods")) {
                entry.category = "method";
                embedded.methods.push(entry);
                return;
            }
            if (scopes.includes("tools")) {
                entry.category = "tool";
                embedded.tools.push(entry);
                return;
            }
            entry.category = "context";
            context.push(entry);
        }, this);
        return { embedded: embedded, context: context };
    };

    AssistSidebar.prototype.buildSourcesFromEntries = function (embedded, context) {
        var sources = [];
        function appendEntries(list) {
            (list || []).forEach(function (entry) {
                var prefix = "";
                if (entry.category === "method") {
                    prefix = "Méthode · ";
                } else if (entry.category === "tool") {
                    prefix = "Outil · ";
                } else if (entry.category === "context") {
                    prefix = "Contexte · ";
                } else if (entry.category === "attachment") {
                    prefix = "Pièce jointe · ";
                }
                var title = prefix + (entry.docName || "Document");
                if (typeof entry.chunk === "number") {
                    title += " (chunk=" + entry.chunk + ")";
                }
                sources.push({
                    title: title,
                    url: "",
                    text: entry.text || ""
                });
            });
        }
        appendEntries(embedded.methods || []);
        appendEntries(embedded.tools || []);
        appendEntries(embedded.attachments || []);
        appendEntries(context || []);
        return sources;
    };

    AssistSidebar.prototype.getRetrievalParamsForQuestion = function (text) {
        var words = String(text || "").trim().split(/\s+/).filter(Boolean);
        var count = words.length;
        if (count === 0 || count <= 2) {
            return { topK: 18, minScore: 0.05 };
        }
        if (count <= 6) {
            return { topK: 14, minScore: 0.08 };
        }
        if (count <= 14) {
            return { topK: 10, minScore: 0.1 };
        }
        return { topK: 8, minScore: 0.12 };
    };

    AssistSidebar.prototype.getRetrievalFallbackParams = function (params) {
        if (!params || typeof params !== "object") return null;
        var baseTopK = typeof params.topK === "number" ? params.topK : 0;
        var baseMinScore = typeof params.minScore === "number" ? params.minScore : 0;
        var fallbackTopK = Math.max(1, Math.round(baseTopK * 1.5));
        var fallbackMinScore = Math.max(0.03, baseMinScore - 0.03);
        return { topK: fallbackTopK, minScore: fallbackMinScore };
    };

    AssistSidebar.prototype.buildRetrievalContext = async function (conversationId) {
        if (!this.docManager) return { chunks: [], docs: [], chunkMap: new Map(), docMap: new Map() };
        await this.docManager.waitReady?.();
        let [chunks, docs] = await Promise.all([
            this.docManager.getChunks(conversationId),
            this.docManager.getDocuments(conversationId)
        ]);
        var memoId = this.getActiveMemoId();
        var memoDocIds = null;
        if (memoId && CHAT_APP_ID === "memo" && conversationId === this.conversation.id) {
            var memoEntries = await this.docManager.getMemoEmbeddings(memoId);
            memoDocIds = new Set((memoEntries || []).map(function (entry) {
                if (entry?.enabled === false) return null;
                return entry?.docId;
            }).filter(Boolean));
            docs = (docs || []).filter(function (doc) {
                return memoDocIds.has(doc?.id);
            });
        }
        const docMap = new Map();
        (docs || []).forEach(function (doc) {
            if (doc && doc.id) {
                docMap.set(doc.id, doc);
            }
        });
        const chunkMap = new Map();
        const filteredChunks = [];
        (chunks || []).forEach(function (chunk) {
            const docMeta = docMap.get(chunk.docId);
            if (!docMeta) return;
            filteredChunks.push(chunk);
            chunkMap.set(chunk.id, Object.assign({}, chunk, {
                docName: docMeta?.name || "Document",
                sourceType: docMeta?.sourceType || "context",
                docScopes: Array.isArray(docMeta?.scope) ? docMeta.scope : [],
                docAbstract: docMeta?.abstract || ""
            }));
        });
        this.cacheDocuments(docs);
        return { chunks: filteredChunks, docs, chunkMap, docMap };
    };

    AssistSidebar.prototype.cacheDocuments = function (docs) {
        if (!Array.isArray(docs)) return;
        docs.forEach(function (doc) {
            if (doc && doc.id) {
                this.docCache.set(doc.id, doc);
            }
        }, this);
    };

    AssistSidebar.prototype.resolveDocName = function (docId) {
        if (!docId) return "";
        var doc = this.docCache.get(docId);
        if (doc) {
            return (doc.name || doc.sourceFileName || "").trim();
        }
        return "";
    };

    AssistSidebar.prototype.ensureDocumentCached = async function (docId) {
        if (!docId || !this.docManager) return null;
        var cached = this.docCache.get(docId);
        if (cached) return cached;
        try {
            var doc = await this.docManager.getDocumentById(docId);
            if (doc && doc.id) {
                this.docCache.set(doc.id, doc);
                return doc;
            }
        } catch (err) {
            console.warn("Document cache miss for", docId, err);
        }
        return null;
    };

    AssistSidebar.prototype.mergeHybridHits = function (vectorHits, keywordHits, limit, options) {
        var chunkMap = options?.chunkMap || new Map();
        var wordCount = Number(options?.wordCount) || 0;
        var preferSmall = wordCount > 0 && wordCount <= 6;
        var preferMedium = wordCount >= 7;
        function sizeBias(hit) {
            var size = (hit?.size || "").toString().toLowerCase();
            if (preferSmall) return size === "small" ? 0 : 1;
            if (preferMedium) return size === "medium" ? 0 : (size === "small" ? 1 : 2);
            return 0;
        }
        function vectorComparator(a, b) {
            var diff = (Number(b?.score) || 0) - (Number(a?.score) || 0);
            if (Math.abs(diff) > 0.0001) return diff;
            return sizeBias(a) - sizeBias(b);
        }
        function keywordComparator(a, b) {
            var diff = (Number(b?.kwScore) || 0) - (Number(a?.kwScore) || 0);
            if (Math.abs(diff) > 0.0001) return diff;
            return sizeBias(a) - sizeBias(b);
        }
        var kwMap = new Map();
        (keywordHits || []).forEach(function (hit) {
            var id = hit?.chunkId || hit?.id;
            if (!id) return;
            kwMap.set(id, hit);
        });
        var both = [];
        var vectorOnly = [];
        (vectorHits || []).forEach(function (hit) {
            var id = hit?.id;
            if (!id) return;
            var kw = kwMap.get(id);
            if (kw) {
                both.push(Object.assign({}, hit, { kwPresent: true, kwScore: kw.score }));
                kwMap.delete(id);
            } else {
                vectorOnly.push(hit);
            }
        });
        both.sort(vectorComparator);
        vectorOnly.sort(vectorComparator);
        var keywordOnly = [];
        kwMap.forEach(function (kw, id) {
            var chunk = chunkMap.get(id);
            if (!chunk) return;
            keywordOnly.push(Object.assign({}, chunk, {
                id: id,
                kwScore: kw.score,
                kwPresent: true,
                score: chunk.score || 0
            }));
        });
        keywordOnly.sort(keywordComparator);
        var finalLimit = Math.max(CONTEXT_LIMIT_MIN, Math.min(CONTEXT_LIMIT_MAX, Number(limit) || CONTEXT_LIMIT_MAX));
        var merged = [];
        [both, vectorOnly, keywordOnly].forEach(function (bucket) {
            for (var i = 0; i < bucket.length && merged.length < finalLimit; i++) {
                merged.push(bucket[i]);
            }
        });
        return merged;
    };

    AssistSidebar.prototype.logHybridRetrieval = function () {
        var info = arguments.length > 0 ? arguments[0] : null;
        if (!info) return;
    };

    AssistSidebar.prototype.hybridRetrieveOnce = async function (query, conversationId, params, options) {
        if (!this.docManager || !params) return [];
        var contextLimit = Math.max(
            CONTEXT_LIMIT_MIN,
            Math.min(CONTEXT_LIMIT_MAX, options.contextLimit || params.topK || CONTEXT_LIMIT_MAX)
        );
        var kwLimit = options.kwLimit || KEYWORD_CANDIDATE_LIMIT;
        var vector = options.vector;
        var keywordHits = null;
        try {
            keywordHits = await this.docManager.searchKeywordCandidates(query, conversationId, kwLimit);
        } catch (err) {
            console.warn("Keyword retrieval failed", err);
            keywordHits = null;
        }
        var keywordFailed = keywordHits === null;
        var keywordCount = Array.isArray(keywordHits) ? keywordHits.length : 0;
        var candidateIds = keywordCount
            ? keywordHits.map(function (hit) {
                return hit?.chunkId || hit?.id;
            }).filter(Boolean)
            : [];
        var vectorScope = candidateIds.length ? "candidates" : "full";
        var vectorHits = [];
        try {
            vectorHits = await this.docManager.vectorSearch(query, conversationId, {
                minScore: params.minScore,
                topK: params.topK,
                candidateIds: candidateIds.length ? candidateIds : null,
                vector: vector,
                chunks: options.chunks,
                docs: options.docs
            });
        } catch (err) {
            console.warn("Vector retrieval failed", err);
            vectorHits = [];
        }
        var merged = this.mergeHybridHits(vectorHits, keywordHits || [], contextLimit, {
            wordCount: options.wordCount,
            chunkMap: options.chunkMap
        });
        this.logHybridRetrieval({
            label: options.label,
            query: query,
            params: params,
            keywordCount: keywordCount,
            keywordFailed: keywordFailed,
            vectorScope: vectorScope,
            contextLimit: contextLimit,
            finalCount: merged.length,
            finalChunks: merged
        });
        if (!merged.length && keywordFailed && Array.isArray(vectorHits) && vectorHits.length) {
            return vectorHits.slice(0, contextLimit);
        }
        return merged;
    };

    AssistSidebar.prototype.retrieveWithFallback = async function (query, conversationId, params, label) {
        if (!params || !this.docManager) return [];
        await this.docManager.waitReady?.();
        var words = String(query || "").trim().split(/\s+/).filter(Boolean);
        var wordCount = words.length;
        var contextLimit = Math.max(CONTEXT_LIMIT_MIN, Math.min(CONTEXT_LIMIT_MAX, params.topK || CONTEXT_LIMIT_MAX));
        var vector = null;
        if (typeof this.docManager.embed === "function") {
            try {
                vector = await this.docManager.embed(query);
            } catch (err) {
                vector = null;
            }
        }
        var ctx = await this.buildRetrievalContext(conversationId);
        // Tuning: bump KEYWORD_CANDIDATE_LIMIT / KEYWORD_RETRY_LIMIT or CONTEXT_LIMIT_* to adjust recall vs. context size.
        var hits = await this.hybridRetrieveOnce(query, conversationId, params, {
            label: label,
            kwLimit: KEYWORD_CANDIDATE_LIMIT,
            contextLimit: contextLimit,
            wordCount: wordCount,
            vector: vector,
            chunks: ctx.chunks,
            docs: ctx.docs,
            chunkMap: ctx.chunkMap
        });
        if (hits.length) return hits;
        var fallbackParams = this.getRetrievalFallbackParams(params);
        if (fallbackParams) {
            var fallbackLimit = Math.max(CONTEXT_LIMIT_MIN, Math.min(CONTEXT_LIMIT_MAX, fallbackParams.topK || CONTEXT_LIMIT_MAX));
            hits = await this.hybridRetrieveOnce(query, conversationId, fallbackParams, {
                label: label + " fallback",
                kwLimit: KEYWORD_RETRY_LIMIT,
                contextLimit: fallbackLimit,
                wordCount: wordCount,
                vector: vector,
                chunks: ctx.chunks,
                docs: ctx.docs,
                chunkMap: ctx.chunkMap
            });
        }
        return hits;
    };

    AssistSidebar.prototype.handleSend = async function (options) {
        options = options || {};
        if (this.isStreaming) return;
        if (!this.textarea && !options.editMessage) return;
        var rawValue = (typeof options.value === "string" ? options.value : this.textarea?.value || "");
        var value = rawValue.trim();
        if (this.isListening) {
            this.speechResultStartIndex = 0;
            this.speechClearRequested = false;
        }
        var isInlineEdit = Boolean(options.editMessage);
        var attachments = isInlineEdit ? [] : (this.pendingDocumentAttachments || []).filter(function (name) {
            return name && !this.pendingExcludedAttachments?.has?.(name);
        }.bind(this));
        var hasAttachment = attachments.length > 0;
        if (!value && !hasAttachment) return;

        if (!isInlineEdit && !hasAttachment && this.memoSelection && window.sendInlineEditToAssist && window.memoEditor) {
            try {
                var askText = value;
                var documentMarkdown = (typeof window.getEditorMarkdown === "function"
                    ? window.getEditorMarkdown()
                    : (typeof window.getMemoEditorSource === "function" ? window.getMemoEditorSource("markdown") : "")) || "";
                var documentContent = documentMarkdown
                    || readDocumentContent()
                    || window.memoEditor.getHTML?.()
                    || "";
                var selectionPayload = this.getMemoSelectionPayload(documentMarkdown, documentContent);
                if (selectionPayload) {
                    var systemPromptInline = this.getActiveSystemPrompt();
                    var payloadInline = {
                        system: systemPromptInline,
                        messages: [
                            {
                                role: "user",
                                content: "DOCUMENT: \n" + documentContent + " \n\nSELECTION: \n" + JSON.stringify(selectionPayload) + " \n\nASK: \n" + askText
                            }
                        ],
                        stream: false
                    };

                    var savedExcerptInline = this.memoSelection.excerpt || null;
                    var savedPosInline = { from: this.memoSelection.from, to: this.memoSelection.to };
                    if (this.textarea) {
                        this.textarea.value = "";
                        this.textarea.style.height = "auto";
                    }
                    if (this.memoSelectionOverlay) {
                        this.memoSelectionOverlay.style.display = "none";
                    }

                    window.sendInlineEditToAssist({
                        payload: payloadInline,
                        askText: askText,
                        selectionExcerpt: savedExcerptInline,
                        selectionPos: savedPosInline,
                        editor: window.memoEditor,
                        docSnapshotId: window.getMemoActiveTabId?.() || null,
                        docSnapshotContent: documentContent || ""
                    });
                    return;
                }
            } catch (err) {
                console.warn("Assist inline selection send failed", err);
            }
        }

        // Visual feedback immediately
        this.setSendButtonBusy(true);
        this.isStreaming = true;
        this.updateComposerState();

        var userMessage = isInlineEdit ? options.editMessage : createMessage("user", value);
        var selectionExcerpt = null;
        if (!isInlineEdit && this.memoSelection) {
            var documentMarkdown = (typeof window.getEditorMarkdown === "function"
                ? window.getEditorMarkdown()
                : (typeof window.getMemoEditorSource === "function" ? window.getMemoEditorSource("markdown") : "")) || "";
            var documentContent = documentMarkdown || readDocumentContent() || "";
            var selectionPayload = this.getMemoSelectionPayload(documentMarkdown, documentContent);
            if (selectionPayload) {
                userMessage.selectionContext = selectionPayload;
                selectionExcerpt = this.memoSelection.excerpt || null;
            }
        }
        if (userMessage) {
            userMessage.content = value;
        }
        if (!isInlineEdit && attachments && attachments.length) {
            userMessage.attachments = attachments.slice();
            this.clearAttachmentProgress();
        }
        if (!isInlineEdit) {
            this.conversation.messages.push(userMessage);
            this.appendMessage(userMessage, { selectionExcerpt: selectionExcerpt });
        }

        if (userMessage) {
            if (!userMessage.docSnapshotId) {
                var activeSnapshotId = (typeof global.getMemoActiveTabId === "function" ? global.getMemoActiveTabId() : null)
                    || this.getActiveMemoId?.()
                    || window.__memoState?.activeTabId
                    || null;
                userMessage.docSnapshotId = activeSnapshotId || null;
            }
            if (typeof userMessage.docSnapshotContent !== "string") {
                userMessage.docSnapshotContent = readDocumentContent() || "";
            }
        }

        var memoId = this.getActiveMemoId();
        if (!isInlineEdit && memoId && attachments && attachments.length) {
            this.confirmMemoAttachments(memoId);
            this.refreshMemoContextAttachments().catch(function (e) {
                console.warn("Context refresh background", e);
            });
            window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
        }

        if (!isInlineEdit && this.textarea) {
            this.textarea.value = "";
            this.textarea.style.height = "auto";
        }
        this.scrollToBottom();
        this.persist();

        var botMessage = createMessage("bot", "...");
        botMessage.references = [];
        botMessage.suggestions = [];
        // Pre-append a placeholder bubble so the user sees activity immediately.
        var botMessageAppended = true;
        this.conversation.messages.push(botMessage);
        this.appendMessage(botMessage);
        this.scrollToBottom();

        if (CHAT_APP_ID === "memo") {
            var activeMemoDocId = typeof global.GoToolkitMemoGetActiveDocumentId === "function"
                ? global.GoToolkitMemoGetActiveDocumentId()
                : null;
            if (!activeMemoDocId && typeof global.GoToolkitMemoCreateAutoDocument === "function") {
                await global.GoToolkitMemoCreateAutoDocument();
            }
        }

        var systemPrompt = this.getActiveSystemPrompt();
        var shouldFetchKnowledge = shouldIncludeKnowledgeForPreset(this.promptPresetId);
        var docInfo = null;

        if (this.docManager) {
            var contextParams = this.getRetrievalParamsForQuestion(value);
            var contextHits = await this.retrieveWithFallback(value, this.conversation.id, contextParams, "context");
            if (!Array.isArray(contextHits)) {
                contextHits = [];
            }
            contextHits = contextHits.filter(function (hit) {
                return (hit?.sourceType || "context") !== "embedded";
            });
            contextHits = this.filterHitsByPromptPreset(contextHits);
            var knowledgeHits = [];
            if (shouldFetchKnowledge) {
                var knowledgeParams = this.getRetrievalParamsForQuestion(value);
                knowledgeHits = await this.retrieveWithFallback(value, this.knowledgeConversationId, knowledgeParams, "knowledge");
                if (!Array.isArray(knowledgeHits)) {
                    knowledgeHits = [];
                }
            }
            docInfo = {
                context: this.categorizeHits(contextHits)
            };
            if (shouldFetchKnowledge) {
                docInfo.knowledge = this.categorizeHits(knowledgeHits);
            }
            botMessage.retrievalEntries = docInfo;
        }

        var controller = new AbortController();
        this.controller = controller;

        var payload = this.buildPayload(systemPrompt, userMessage, docInfo);
        recordChatAIInHistory(payload, this.conversation?.id);
        var requestTokenEstimate = estimatePayloadTokens(payload);
        var self = this;
        var appendBotMessageIfNeeded = function () {
            if (botMessageAppended) return;
            botMessageAppended = true;
            self.conversation.messages.push(botMessage);
            self.appendMessage(botMessage);
        };

        function extractContent(buffer) {
            var key = "\"content\"";
            var idx = buffer.indexOf(key);
            if (idx === -1) return null;
            var colon = buffer.indexOf(":", idx + key.length);
            if (colon === -1) return null;
            var rest = buffer.slice(colon + 1);
            var quote = rest.indexOf("\"");
            if (quote === -1) return null;
            var tail = rest.slice(quote + 1);
            var closing = tail.indexOf("\"");
            if (closing === -1) {
                return tail;
            }
            return tail.slice(0, closing);
        }

        var snapshotDocId = userMessage?.docSnapshotId;
        var didActivateSnapshot = false;

        function handleChunk(chunk) {
            if (!didActivateSnapshot && snapshotDocId && typeof global.setMemoActiveTab === "function") {
                var activeId = (typeof global.getMemoActiveTabId === "function" ? global.getMemoActiveTabId() : null)
                    || window.__memoState?.activeTabId
                    || null;
                if (activeId !== snapshotDocId) {
                    global.setMemoActiveTab(snapshotDocId);
                }
                didActivateSnapshot = true;
            }
            botMessage._jsonBuffer = (botMessage._jsonBuffer || "") + chunk;
            var parsed = null;
            try {
                parsed = JSON.parse(botMessage._jsonBuffer);
            } catch (err) {
                parsed = null;
            }
            var answerContent = null;
            if (parsed && parsed.answer) {
                if (typeof parsed.answer === "string") {
                    answerContent = parsed.answer;
                } else if (typeof parsed.answer.content === "string") {
                    answerContent = parsed.answer.content;
                }
            }
            if (answerContent !== null) {
                botMessage.content = answerContent;
                botMessage.references = (Array.isArray(parsed.references) ? parsed.references : [])
                    .map(normalizeReference)
                    .filter(Boolean);
                botMessage.suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
            } else {
                var partial = extractContent(botMessage._jsonBuffer);
                if (partial) {
                    botMessage.content = partial;
                }
            }
            self.updateBotMessage(botMessage);
            var liveEntry = self.messageNodes[botMessage.id];
            if (liveEntry && liveEntry.contentEl) {
                liveEntry.contentEl.innerHTML = renderBotMarkdown(botMessage.content || "");
                addCopyButtonsToChatContent(liveEntry.contentEl);
            }
            self.throttledPersist();
        }

        var requestStart = 0;
        try {
            // Calculate total payload token count and start toaster
            var totalPayloadTokens = estimatePayloadTokens(payload);
            startCharacterCounterToaster(totalPayloadTokens);

            requestStart = performance.now();
            var result = await global.GoToolkitIA.chatCompletion({
                payload: payload,
                endpointType: "responses",
                signal: controller.signal,
                onChunk: payload.stream ? handleChunk : undefined
            });
            // Handle new return format: { text: ..., usage: ... }
            var resultText = (result && typeof result === "object") ? result.text : result;
            var resultUsage = (result && typeof result === "object") ? result.usage : null;
            var parsed = this.parseAssistantResponse(resultText || "");
            if (parsed.content === "Réponse illisible." && botMessage.content) {
                parsed.content = botMessage.content;
            }
            recordChatAIOutHistory({
                rawResponse: result,
                responseText: resultText,
                usage: resultUsage,
                parsedResponse: parsed
            }, this.conversation?.id);
            botMessage.content = parsed.content;
            botMessage.references = parsed.references;
            botMessage.suggestions = parsed.suggestions;
            botMessage.techStats = {
                responseMs: Math.round(performance.now() - requestStart),
                requestTokens: resultUsage?.prompt_tokens || requestTokenEstimate,
                responseTokens: resultUsage?.completion_tokens || estimateTokenCount(parsed.content || botMessage.content || ""),
                cost: resultUsage?.cost
            };
            if (this.promptPresetId === "edit" || this.promptPresetId === "suggest") {
                var applied = false;
                if (parsed.output) {
                    if (this.promptPresetId === "edit" && typeof window.insertEditorMarkdownAtEnd === "function") {
                        window.insertEditorMarkdownAtEnd(parsed.output);
                        applied = true;
                    } else if (typeof window.setEditorMarkdown === "function") {
                        window.setEditorMarkdown(parsed.output);
                        applied = true;
                    } else if (typeof window.setEditorContent === "function") {
                        window.setEditorContent(parsed.output);
                        applied = true;
                    }
                } else if (parsed.operations && parsed.operations.length && typeof window.setEditorContent === "function") {
                    // Backward compatibility: apply legacy character-index operations.
                    var currentContent = window.getEditorContent();
                    var reversedOps = parsed.operations.slice().reverse();
                    for (var i = 0; i < reversedOps.length; i++) {
                        var op = reversedOps[i];
                        var action = op.action;
                        var start = op.start;
                        var end = op.end;
                        var text = op.text || "";
                        if (action === "replace") {
                            currentContent = currentContent.slice(0, start) + text + currentContent.slice(end);
                        } else if (action === "insert") {
                            currentContent = currentContent.slice(0, start) + text + currentContent.slice(start);
                        } else if (action === "delete") {
                            currentContent = currentContent.slice(0, start) + currentContent.slice(end);
                        }
                    }
                    window.setEditorContent(currentContent);
                    applied = true;
                }
                if (applied) {
                    botMessage.content += " [Document régénéré.]";
                }
            }
            this.updateBotMessage(botMessage);
            this.persist();
        } catch (err) {
            var isAbort = err?.name === "AbortError";
            var responseMs = Math.round(performance.now() - (requestStart || performance.now()));
            if (isAbort) {
                botMessage.content = botMessage.content || "Requête interrompue.";
            } else {
                var msg = (err && err.message) || "";
                var isBadRequest = /400|Bad Request/i.test(msg);
                botMessage.content = isBadRequest
                    ? "Désolé, une erreur de configuration est survenue (400). Vérifie le moteur IA ou ta clé dans Paramètres."
                    : "Désolé, une erreur est survenue.";
            }
            botMessage.references = [];
            botMessage.suggestions = [];
            botMessage.techStats = {
                responseMs: responseMs,
                requestTokens: requestTokenEstimate,
                responseTokens: estimateTokenCount(botMessage.content || "")
            };
            appendBotMessageIfNeeded();
            this.updateBotMessage(botMessage);
            this.persist();
        } finally {
            stopCharacterCounterToaster();
            this.isStreaming = false;
            this.controller = null;
            this.updateComposerState();
            // Always restore send button after AI response
            this.setSendButtonBusy(false);
            if (this.importInProgress) {
                this.importInProgress = false;
                if (CHAT_APP_ID === "memo") {
                    window.GoToolkitMemoToast?.("");
                }
            }
            if (botMessage) {
                this.updateBotMessage(botMessage);
            }
        }
    };

    AssistSidebar.prototype.handleInputResize = function () {
        if (!this.textarea) return;
        this.textarea.style.height = "auto";
        var maxHeight = this.textarea.scrollHeight;
        var lineHeight = parseInt(global.getComputedStyle(this.textarea).lineHeight, 10) || 18;
        var maxAllowed = lineHeight * 6;
        var nextHeight = Math.min(maxHeight, maxAllowed);
        this.textarea.style.height = nextHeight + "px";
    };

    AssistSidebar.prototype.mountResizer = function (resizer) {
        var self = this;
        var startX = 0;
        var startWidth = this.sidebarWidth;

        function onMouseMove(event) {
            var delta = startX - event.clientX;
            var next = clampWidth(startWidth + delta);
            self.setWidth(next);
        }

        function onMouseUp() {
            global.document.body.classList.remove("is-resizing");
            global.removeEventListener("mousemove", onMouseMove);
            global.removeEventListener("mouseup", onMouseUp);
            if (self.sidebarWidth <= 200) {
                self.close();
            }
            saveWidth(self.sidebarWidth);
        }

        resizer.addEventListener("mousedown", function (event) {
            startX = event.clientX;
            startWidth = self.sidebarWidth;
            global.document.body.classList.add("is-resizing");
            global.addEventListener("mousemove", onMouseMove);
            global.addEventListener("mouseup", onMouseUp);
        });
    };

    AssistSidebar.prototype.updatePromptDropdownLabel = function () {
        if (this.promptDropdownButton) {
            var presets = this.getPromptPresets();
            var activePreset = presets && presets[this.promptPresetId];
            var iconName = activePreset?.icon || "terminal";
            var label = activePreset?.label || ("/" + this.promptPresetId);
            this.promptDropdownButton.innerHTML = label + ' <i data-lucide="chevron-down" style="width:12px;height:12px;margin-left:2px"></i>';
            this.promptDropdownButton.title = "Mode: " + label;
            if (global.lucide) global.lucide.createIcons();
        }
        if (this.promptDropdownMenu) {
            var buttons = this.promptDropdownMenu.querySelectorAll("[data-preset]");
            buttons.forEach(function (btn) {
                btn.classList.toggle("active", btn.dataset.preset === this.promptPresetId);
            }, this);
        }
    };

    AssistSidebar.prototype.updateInlinePromptDropdownLabel = function () {
        if (this.inlinePromptDropdownButton) {
            var presets = this.getPromptPresets();
            var activePreset = presets && presets[this.promptPresetId];
            var label = activePreset?.label || ("/" + this.promptPresetId);
            this.inlinePromptDropdownButton.innerHTML = label + ' <i data-lucide="chevron-down" style="width:12px;height:12px;margin-left:2px"></i>';
            this.inlinePromptDropdownButton.title = "Mode: " + label;
            if (global.lucide) global.lucide.createIcons();
        }
        if (this.inlinePromptDropdownMenu) {
            var buttons = this.inlinePromptDropdownMenu.querySelectorAll("[data-preset]");
            buttons.forEach(function (btn) {
                btn.classList.toggle("active", btn.dataset.preset === this.promptPresetId);
            }, this);
        }
    };

    AssistSidebar.prototype.closePromptDropdown = function () {
        if (!this.promptDropdownMenu) return;
        this.promptDropdownMenu.classList.remove("open");
        this.promptDropdownMenu.hidden = true;
    };

    AssistSidebar.prototype.togglePromptDropdown = function () {
        if (!this.promptDropdownMenu) return;
        var willOpen = this.promptDropdownMenu.hidden;
        if (willOpen) {
            this.promptDropdownMenu.hidden = false;
            this.promptDropdownMenu.classList.add("open");
        } else {
            this.closePromptDropdown();
        }
    };

    AssistSidebar.prototype.buildPromptDropdown = function () {
        var wrapper = document.createElement("div");
        wrapper.className = "chat-prompt-dropdown";

        var button = document.createElement("button");
        button.type = "button";
        button.className = "btn-secondary chat-prompt-btn";
        // innerHTML is set by updatePromptDropdownLabel()
        button.addEventListener("click", function (event) {
            event.stopPropagation();
            this.togglePromptDropdown();
        }.bind(this));

        var menu = document.createElement("div");
        menu.className = "chat-prompt-menu";
        menu.hidden = true;

        var presets = this.getPromptPresets();
        var presetKeys = ["edit", "advice", "suggest"];
        presetKeys.forEach(function (key) {
            var preset = presets[key];
            if (!preset) {
                return;
            }
            var item = document.createElement("button");
            item.type = "button";
            item.className = "chat-prompt-menu-item";
            item.dataset.preset = preset.id;

            var label = preset.label || ("/" + preset.id);
            item.innerHTML = label;

            item.addEventListener("click", function (event) {
                event.stopPropagation();
                this.setPromptPreset(preset.id, { source: "dropdown" });
                this.closePromptDropdown();
            }.bind(this));
            menu.appendChild(item);
        }, this);

        wrapper.appendChild(button);
        wrapper.appendChild(menu);

        this.promptDropdown = wrapper;
        this.promptDropdownButton = button;
        this.promptDropdownMenu = menu;
        this.updatePromptDropdownLabel();

        document.addEventListener("click", function (event) {
            if (!this.promptDropdownMenu) return;
            if (wrapper.contains(event.target)) return;
            this.closePromptDropdown();
        }.bind(this));

        return wrapper;
    };

    AssistSidebar.prototype.buildInlinePromptDropdown = function () {
        var wrapper = document.createElement("div");
        wrapper.className = "chat-prompt-dropdown";

        var button = document.createElement("button");
        button.type = "button";
        button.className = "btn-secondary chat-prompt-btn";
        button.addEventListener("click", function (event) {
            event.stopPropagation();
            var menu = this.inlinePromptDropdownMenu;
            if (!menu) return;
            var willOpen = menu.hidden;
            if (willOpen) {
                menu.hidden = false;
                menu.classList.add("open");
            } else {
                menu.classList.remove("open");
                menu.hidden = true;
            }
        }.bind(this));

        var menu = document.createElement("div");
        menu.className = "chat-prompt-menu";
        menu.hidden = true;

        var presets = this.getPromptPresets();
        var presetKeys = ["edit", "advice", "suggest"];
        presetKeys.forEach(function (key) {
            var preset = presets[key];
            if (!preset) {
                return;
            }
            var item = document.createElement("button");
            item.type = "button";
            item.className = "chat-prompt-menu-item";
            item.dataset.preset = preset.id;

            var label = preset.label || ("/" + preset.id);
            item.innerHTML = label;

            item.addEventListener("click", function (event) {
                event.stopPropagation();
                this.setPromptPreset(preset.id, { source: "dropdown" });
                menu.classList.remove("open");
                menu.hidden = true;
            }.bind(this));
            menu.appendChild(item);
        }, this);

        wrapper.appendChild(button);
        wrapper.appendChild(menu);

        this.inlinePromptDropdownButton = button;
        this.inlinePromptDropdownMenu = menu;
        this.updateInlinePromptDropdownLabel();

        var closeOnClick = function (event) {
            if (!wrapper.isConnected) {
                document.removeEventListener("click", closeOnClick);
                return;
            }
            if (wrapper.contains(event.target)) return;
            menu.classList.remove("open");
            menu.hidden = true;
        };
        document.addEventListener("click", closeOnClick);

        return wrapper;
    };

    AssistSidebar.prototype.getPromptShortcuts = function () {
        var shortcuts = global.GoToolkitPromptShortcuts;
        if (!shortcuts || !Array.isArray(shortcuts.prompts)) return [];
        return shortcuts.prompts.slice();
    };

    AssistSidebar.prototype.getPromptShortcutsRecentStorageKey = function () {
        return "go-toolkit-prompt-shortcuts-recent";
    };

    AssistSidebar.prototype.getPromptShortcutsRecentIds = function () {
        try {
            var raw = localStorage.getItem(this.getPromptShortcutsRecentStorageKey());
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(function (item) {
                return typeof item === "string" && item.trim().length > 0;
            });
        } catch (err) {
            return [];
        }
    };

    AssistSidebar.prototype.savePromptShortcutsRecentIds = function (ids) {
        try {
            localStorage.setItem(this.getPromptShortcutsRecentStorageKey(), JSON.stringify(ids || []));
        } catch (err) { /* ignore */ }
    };

    AssistSidebar.prototype.trackPromptShortcutRecent = function (prompt) {
        if (!prompt || !prompt.id) return;
        var id = String(prompt.id);
        var existing = this.getPromptShortcutsRecentIds();
        var next = [id].concat(existing.filter(function (item) { return item !== id; })).slice(0, 9);
        this.savePromptShortcutsRecentIds(next);
    };

    AssistSidebar.prototype.getPromptShortcutsRecentList = function (prompts) {
        var ids = this.getPromptShortcutsRecentIds();
        if (!ids.length) return [];
        var byId = new Map();
        (prompts || []).forEach(function (prompt) {
            if (prompt && prompt.id) {
                byId.set(String(prompt.id), prompt);
            }
        });
        return ids.map(function (id) {
            return byId.get(id);
        }).filter(Boolean);
    };

    AssistSidebar.prototype.getPromptShortcutsSearchQuery = function () {
        return (this.promptShortcutsSearchQuery || "").toString().trim().toLowerCase();
    };

    AssistSidebar.prototype.filterPromptShortcutsByQuery = function (prompts) {
        var query = this.getPromptShortcutsSearchQuery();
        if (!query) return (prompts || []).slice();
        return (prompts || []).filter(function (prompt) {
            if (!prompt) return false;
            var title = (prompt.title || "").toString().toLowerCase();
            var content = (prompt.content || "").toString().toLowerCase();
            return title.indexOf(query) !== -1 || content.indexOf(query) !== -1;
        });
    };

    AssistSidebar.prototype.getPromptShortcutCategories = function () {
        var shortcuts = global.GoToolkitPromptShortcuts;
        if (!shortcuts || !shortcuts.categories || typeof shortcuts.categories !== "object") return {};
        return Object.assign({}, shortcuts.categories);
    };

    AssistSidebar.prototype.buildPromptShortcutsModal = function () {
        if (this.promptShortcutsOverlay) return;
        var overlay = document.createElement("div");
        overlay.className = "modal-overlay chat-prompt-shortcuts-overlay";
        overlay.setAttribute("aria-hidden", "true");

        var modal = document.createElement("div");
        modal.className = "modal chat-prompt-shortcuts-modal";

        var header = document.createElement("div");
        header.className = "modal-header chat-prompt-shortcuts__header";
        var title = document.createElement("h3");
        title.innerHTML = '<i data-lucide="sparkles"></i> Raccourcis Prompt';
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "modal-close";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", this.closePromptShortcutsModal.bind(this));
        header.appendChild(title);
        header.appendChild(closeBtn);

        var searchRow = document.createElement("div");
        searchRow.className = "chat-prompt-shortcuts__search";
        var searchInput = document.createElement("input");
        searchInput.type = "search";
        searchInput.className = "chat-prompt-shortcuts__search-input";
        searchInput.placeholder = "Rechercher un prompt...";
        searchInput.setAttribute("aria-label", "Rechercher un prompt");
        searchInput.addEventListener("input", function (event) {
            this.promptShortcutsSearchQuery = (event?.target?.value || "").toString();
            this.promptShortcutsPageIndex = 0;
            this.renderPromptShortcutsFilters(this.promptShortcutsPrompts || []);
            this.renderPromptShortcutsGrid(this.promptShortcutsPrompts || []);
        }.bind(this));
        searchRow.appendChild(searchInput);

        var filterBar = document.createElement("div");
        filterBar.className = "chat-prompt-shortcuts__filters";

        var pager = document.createElement("div");
        pager.className = "chat-prompt-shortcuts__pager";
        var prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "chat-prompt-shortcuts__pager-btn";
        prevBtn.innerHTML = '<i data-lucide="chevron-left"></i>';
        prevBtn.addEventListener("click", function () {
            this.changePromptShortcutsPage(-1);
        }.bind(this));
        var label = document.createElement("div");
        label.className = "chat-prompt-shortcuts__pager-label";
        var nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "chat-prompt-shortcuts__pager-btn";
        nextBtn.innerHTML = '<i data-lucide="chevron-right"></i>';
        nextBtn.addEventListener("click", function () {
            this.changePromptShortcutsPage(1);
        }.bind(this));
        pager.appendChild(prevBtn);
        pager.appendChild(label);
        pager.appendChild(nextBtn);

        var grid = document.createElement("div");
        grid.className = "chat-prompt-shortcuts__grid";

        modal.appendChild(header);
        modal.appendChild(searchRow);
        modal.appendChild(filterBar);
        modal.appendChild(grid);
        modal.appendChild(pager);
        overlay.appendChild(modal);
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) {
                this.closePromptShortcutsModal();
            }
        }.bind(this));
        document.body.appendChild(overlay);

        this.promptShortcutsOverlay = overlay;
        this.promptShortcutsModal = modal;
        this.promptShortcutsTitleEl = title;
        this.promptShortcutsFilterEl = filterBar;
        this.promptShortcutsGridEl = grid;
        this.promptShortcutsCloseBtn = closeBtn;
        this.promptShortcutsPagerEl = pager;
        this.promptShortcutsPagerLabelEl = label;
        this.promptShortcutsPagerPrevBtn = prevBtn;
        this.promptShortcutsPagerNextBtn = nextBtn;
        this.promptShortcutsSearchInput = searchInput;
        if (global.lucide) global.lucide.createIcons();
    };

    AssistSidebar.prototype.renderPromptShortcutsFilters = function (prompts) {
        if (!this.promptShortcutsFilterEl) return;
        var categoriesMeta = this.getPromptShortcutCategories();
        var filterBar = this.promptShortcutsFilterEl;
        filterBar.innerHTML = "";
        var recentList = this.getPromptShortcutsRecentList(prompts || []);
        var hasRecent = recentList.length > 0;
        var categories = new Set();
        (prompts || []).forEach(function (prompt) {
            var category = (prompt?.category || "").toString().trim();
            if (category) categories.add(category.toUpperCase());
        });
        var defaultCategory = hasRecent ? "RECENT" : "ALL";
        var active = (this.promptShortcutsActiveCategory || defaultCategory).toUpperCase();
        if (active === "RECENT" && !hasRecent) {
            active = "ALL";
            this.promptShortcutsActiveCategory = "ALL";
        }
        var makeButton = function (label, value, iconOverride) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "chat-prompt-shortcuts__filter";
            var icon = iconOverride || categoriesMeta?.[value.toLowerCase()]?.icon;
            btn.innerHTML = (icon ? '<i data-lucide="' + icon + '"></i>' : "") + '<span>' + label + "</span>";
            btn.dataset.category = value;
            if (value === active) {
                btn.classList.add("active");
            }
            btn.addEventListener("click", function () {
                this.promptShortcutsActiveCategory = value;
                this.promptShortcutsPageIndex = 0;
                this.renderPromptShortcutsFilters(prompts);
                this.renderPromptShortcutsGrid(prompts);
            }.bind(this));
            filterBar.appendChild(btn);
        }.bind(this);

        makeButton("TOUS", "ALL", "layout-grid");
        if (hasRecent) {
            makeButton("RÉCENT", "RECENT", "history");
        }
        Array.from(categories).sort().forEach(function (categoryKey) {
            var key = categoryKey.toLowerCase();
            var meta = categoriesMeta?.[key];
            var label = meta?.label || categoryKey;
            makeButton(label, categoryKey);
        });
        if (global.lucide) global.lucide.createIcons();
    };

    AssistSidebar.prototype.renderPromptShortcutsGrid = function (prompts) {
        if (!this.promptShortcutsGridEl) return;
        var categoriesMeta = this.getPromptShortcutCategories();
        var grid = this.promptShortcutsGridEl;
        grid.innerHTML = "";
        var recentList = this.getPromptShortcutsRecentList(prompts || []);
        var hasRecent = recentList.length > 0;
        var active = (this.promptShortcutsActiveCategory || (hasRecent ? "RECENT" : "ALL")).toUpperCase();
        if (active === "RECENT" && !hasRecent) {
            active = "ALL";
            this.promptShortcutsActiveCategory = "ALL";
        }
        var baseList = prompts || [];
        if (active === "RECENT") {
            baseList = recentList;
        }
        var list = this.filterPromptShortcutsByQuery(baseList).filter(function (prompt) {
            if (!prompt) return false;
            if (active === "ALL" || active === "RECENT") return true;
            return (prompt.category || "").toString().trim().toUpperCase() === active;
        });
        var pageSize = Number(this.promptShortcutsPageSize) || 9;
        var totalPages = Math.max(1, Math.ceil(list.length / pageSize));
        var pageIndex = Math.min(Math.max(0, this.promptShortcutsPageIndex || 0), totalPages - 1);
        this.promptShortcutsPageIndex = pageIndex;
        var pageStart = pageIndex * pageSize;
        var pageList = list.slice(pageStart, pageStart + pageSize);
        this.updatePromptShortcutsPager(totalPages);
        if (!list.length) {
            var empty = document.createElement("div");
            empty.className = "chat-prompt-shortcuts__empty";
            empty.textContent = this.getPromptShortcutsSearchQuery()
                ? "Aucun raccourci ne correspond à votre recherche."
                : "Aucun raccourci dans cette catégorie.";
            grid.appendChild(empty);
            return;
        }
        pageList.forEach(function (prompt, index) {
            var card = document.createElement("button");
            card.type = "button";
            card.className = "prompt-card";
            card.dataset.promptIndex = String(index);
            var categoryKey = (prompt.category || "").toString().trim().toLowerCase();
            var metaInfo = categoriesMeta?.[categoryKey] || {};
            var category = (metaInfo.label || categoryKey || "PROMPT").toString().toUpperCase();
            var icon = metaInfo.icon;
            var meta = document.createElement("div");
            meta.className = "prompt-card__meta";
            meta.innerHTML = (icon ? '<i data-lucide="' + icon + '"></i>' : "") + "<span>" + (category || "PROMPT") + "</span>";
            var title = document.createElement("div");
            title.className = "prompt-card__title";
            title.textContent = (prompt.title || "").toString();
            var content = document.createElement("div");
            content.className = "prompt-card__content";
            content.textContent = (prompt.content || "").toString();
            card.appendChild(meta);
            card.appendChild(title);
            card.appendChild(content);
            card.addEventListener("click", function () {
                this.applyPromptShortcut(prompt);
            }.bind(this));
            grid.appendChild(card);
        }, this);
        if (global.lucide) global.lucide.createIcons();
    };

    AssistSidebar.prototype.refreshPromptShortcutsModal = function () {
        this.promptShortcutsPrompts = this.getPromptShortcuts();
        this.renderPromptShortcutsFilters(this.promptShortcutsPrompts);
        this.renderPromptShortcutsGrid(this.promptShortcutsPrompts);
    };

    AssistSidebar.prototype.updatePromptShortcutsPager = function (totalPages) {
        if (!this.promptShortcutsPagerEl) return;
        var hasPages = totalPages > 1;
        var pageIndex = this.promptShortcutsPageIndex || 0;
        this.promptShortcutsPagerEl.style.display = hasPages ? "flex" : "none";
        if (this.promptShortcutsPagerLabelEl) {
            this.promptShortcutsPagerLabelEl.textContent = (pageIndex + 1) + " / " + totalPages;
        }
        if (this.promptShortcutsPagerPrevBtn) {
            this.promptShortcutsPagerPrevBtn.disabled = pageIndex <= 0;
        }
        if (this.promptShortcutsPagerNextBtn) {
            this.promptShortcutsPagerNextBtn.disabled = pageIndex >= totalPages - 1;
        }
    };

    AssistSidebar.prototype.changePromptShortcutsPage = function (direction) {
        var next = (this.promptShortcutsPageIndex || 0) + direction;
        if (next < 0) next = 0;
        this.promptShortcutsPageIndex = next;
        this.renderPromptShortcutsGrid(this.promptShortcutsPrompts || []);
    };

    AssistSidebar.prototype.applyPromptShortcut = function (prompt) {
        if (!prompt) return;
        var target = this.promptShortcutsTargetInput || this.textarea;
        if (!target) return;
        var content = (prompt.content || "").toString();
        if (typeof target.value === "string") {
            target.value = content;
        } else if (target.isContentEditable) {
            target.textContent = content;
        }
        try {
            target.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (err) { /* ignore */ }
        try {
            target.focus();
        } catch (err) { /* ignore */ }
        this.trackPromptShortcutRecent(prompt);
        this.closePromptShortcutsModal();
    };

    AssistSidebar.prototype.openPromptShortcutsModal = function (targetInput) {
        this.buildPromptShortcutsModal();
        if (!this.promptShortcutsOverlay) return;
        this.promptShortcutsTargetInput = targetInput || this.textarea;
        this.promptShortcutsPageIndex = 0;
        this.promptShortcutsSearchQuery = "";
        if (this.promptShortcutsSearchInput) {
            this.promptShortcutsSearchInput.value = "";
        }
        var hasRecent = this.getPromptShortcutsRecentIds().length > 0;
        this.promptShortcutsActiveCategory = hasRecent ? "RECENT" : "ALL";
        this.promptShortcutsOverlay.classList.add("open");
        this.promptShortcutsOverlay.setAttribute("aria-hidden", "false");
        this.refreshPromptShortcutsModal();
    };

    AssistSidebar.prototype.closePromptShortcutsModal = function () {
        if (!this.promptShortcutsOverlay) return;
        this.promptShortcutsOverlay.classList.remove("open");
        this.promptShortcutsOverlay.setAttribute("aria-hidden", "true");
        this.promptShortcutsTargetInput = null;
    };

    AssistSidebar.prototype.buildUI = function () {
        if (!this.root) return false;
        this.page = document.getElementById("page");
        this.mainApp = document.querySelector(".app-main");
        if (this.mainApp) {
            if (!this.mainApp.hasAttribute("tabindex")) {
                this.mainApp.setAttribute("tabindex", "-1");
            }
            this.mainApp.addEventListener("focusin", function () {
                if (!this.isOpen) return;
                if (window.innerWidth >= 1200) return;
                this.close();
                try {
                    this.mainApp.focus();
                } catch (err) { /* ignore */ }
            }.bind(this));
        }
        var staticLauncher = document.getElementById("assistLauncherBtn");
        if (!staticLauncher) {
            console.error("GoToolkitAssist requires #assistLauncherBtn to be present");
            return false;
        }
        this.toggleButton = staticLauncher;
        this.toggleButton.classList.add("chat-toggle-button");
        this.updateToggleIcon();

        this.toggleButton.addEventListener("click", this.toggle.bind(this));

        this.sidebar = document.createElement("div");
        this.sidebar.id = "assistSidebar";
        this.sidebar.className = "chat-sidebar";
        this.sidebar.style.width = this.sidebarWidth + "px";

        var resizer = document.createElement("div");
        resizer.className = "chat-resizer";
        this.sidebar.appendChild(resizer);

        var header = document.createElement("div");
        header.className = "chat-header";
        var title = document.createElement("span");
        title.className = "chat-header-title";
        title.innerHTML = '<i data-lucide="bot" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 6px;"></i>';
        header.appendChild(title);

        var headerActions = document.createElement("div");
        headerActions.className = "chat-header-actions";

        this.headerDocCountEl = document.createElement("button");
        this.headerDocCountEl.type = "button";
        this.headerDocCountEl.className = "btn-secondary chat-header-btn";
        this.headerDocCountEl.innerHTML = '<i data-lucide="brain"></i>';
        this.headerDocCountEl.setAttribute("title", this.headerDocCountTooltipDefault);
        this.headerDocCountEl.addEventListener("click", this.handleHeaderDocCountClick.bind(this));
        this.headerDocCountEl.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                this.handleHeaderDocCountClick();
            }
        }.bind(this));
        headerActions.appendChild(this.headerDocCountEl);
        this.promptButton = document.createElement("button");
        this.promptButton.id = "gtPromptModalTrigger";
        this.promptButton.type = "button";
        this.promptButton.className = "btn-secondary chat-header-btn";
        this.promptButton.innerHTML = '<i data-lucide="square-chevron-right"></i>';
        this.promptButton.setAttribute("aria-label", "Prompt");
        this.promptButton.setAttribute("title", "Prompt");
        headerActions.appendChild(this.promptButton);
        this.clearButton = document.createElement("button");
        this.clearButton.id = "chatClearBtn";
        this.clearButton.type = "button";
        this.clearButton.className = "btn-secondary chat-header-btn";
        this.clearButton.innerHTML = '<i data-lucide="message-circle-x"></i>';
        this.clearButton.addEventListener("click", this.clearConversation.bind(this));
        headerActions.appendChild(this.clearButton);

        header.appendChild(headerActions);
        this.sidebar.appendChild(header);
        if (window.lucide) window.lucide.createIcons();

        this.messagesEl = document.createElement("div");
        this.messagesEl.className = "chat-messages";
        this.sidebar.appendChild(this.messagesEl);

        // Create tab indicator element (shown above composer when multiple tabs exist)
        this.tabIndicator = document.createElement("div");
        this.tabIndicator.className = "chat-tab-indicator";
        this.tabIndicator.style.display = "none";
        this.tabIndicator.style.paddingLeft = "4px";
        this.tabIndicator.style.fontSize = "0.7rem";
        this.tabIndicator.style.color = "var(--muted)";
        this.tabIndicator.style.userSelect = "none";
        this.sidebar.appendChild(this.tabIndicator);

        var composer = document.createElement("div");
        composer.className = "chat-composer";
        this.composer = composer;
        var pendingAttachmentRow = document.createElement("div");
        pendingAttachmentRow.className = "chat-composer-attachments chat-composer-attachments--pending";
        pendingAttachmentRow.style.display = "none";
        this.pendingAttachmentRow = pendingAttachmentRow;
        this.pendingAttachmentList = document.createElement("div");
        this.pendingAttachmentList.className = "chat-composer-attachments__list";
        pendingAttachmentRow.appendChild(this.pendingAttachmentList);
        this.sidebar.appendChild(pendingAttachmentRow);
        var memoAttachmentRow = document.createElement("div");
        memoAttachmentRow.className = "chat-composer-attachments";
        memoAttachmentRow.style.display = "none";
        this.memoContextAttachmentRow = memoAttachmentRow;
        this.memoContextAttachmentList = document.createElement("div");
        this.memoContextAttachmentList.className = "chat-composer-attachments__list";
        memoAttachmentRow.appendChild(this.memoContextAttachmentList);
        this.sidebar.appendChild(memoAttachmentRow);
        this.textarea = document.createElement("textarea");
        this.textarea.className = "chat-input";
        this.textarea.rows = 2;
        this.updateInputPlaceholder();
        this.textarea.addEventListener("input", this.handleInputResize.bind(this));
        this.textarea.addEventListener("input", this.updateComposerState.bind(this));
        this.textarea.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.handleSend();
            }
        }.bind(this));
        this.textarea.addEventListener("focus", function () {
            var emptyEl = document.getElementById("memoEmptyState");
            var noOpenedDoc = emptyEl && (emptyEl.style.display !== "none");

            if (!window.memoEditor?.state || !window.memoEditor?.view || noOpenedDoc) {
                this.memoSelection = null;
                this.memoSelectionBlockCoords = null;
                if (this.memoSelectionOverlay) {
                    this.memoSelectionOverlay.style.display = "none";
                }
                return;
            }
            if (this.memoSelectionDetail && this.memoSelectionDetail.isSelected) {
                this.memoSelection = {
                    text: this.memoSelectionDetail.selectionText,
                    blockText: this.memoSelectionDetail.blockText || this.memoSelectionDetail.selectionText,
                    blockMarkdown: this.memoSelectionDetail.blockMarkdown
                        || this.memoSelectionDetail.blockText
                        || this.memoSelectionDetail.selectionText,
                    excerpt: this.memoSelectionDetail.selectionExcerpt,
                    from: this.memoSelectionDetail.positionFrom,
                    to: this.memoSelectionDetail.positionTo
                };
            }
            if (!this.memoSelection && window.memoEditor?.state && window.memoEditor?.view) {
                try {
                    var selection = window.memoEditor.state.selection;
                    var allowCaretBlock = Boolean(this.memoSelectionFollowActive) && (this._lastFocusedEditor === window.memoEditor);
                    var resolveBlockRange = function ($pos) {
                        var allowedBlockTypes = {
                            paragraph: true,
                            heading: true,
                            codeBlock: true,
                            table: true,
                            listItem: true,
                            blockquote: true,
                            mermaidDiagram: true
                        };
                        var tableDepth = -1;
                        for (var depth = $pos.depth; depth >= 0; depth--) {
                            var node = $pos.node(depth);
                            if (node && node.type && node.type.name === "table") {
                                tableDepth = depth;
                                break;
                            }
                        }
                        if (tableDepth >= 0) {
                            return {
                                from: $pos.start(tableDepth),
                                to: $pos.end(tableDepth)
                            };
                        }
                        for (var depth = $pos.depth; depth >= 0; depth--) {
                            var node = $pos.node(depth);
                            if (node && allowedBlockTypes[node.type.name]) {
                                return {
                                    from: $pos.start(depth),
                                    to: $pos.end(depth)
                                };
                            }
                        }
                        return null;
                    };
                    if (selection && (!selection.empty || allowCaretBlock)) {
                        var from = selection.from;
                        var to = selection.to;
                        var blockRange = null;
                        if (selection.$from) {
                            blockRange = resolveBlockRange(selection.$from);
                        }
                        if (selection.$to) {
                            var blockRangeTo = resolveBlockRange(selection.$to);
                            if (blockRangeTo) {
                                if (!blockRange) {
                                    blockRange = blockRangeTo;
                                } else {
                                    blockRange = {
                                        from: Math.min(blockRange.from, blockRangeTo.from),
                                        to: Math.max(blockRange.to, blockRangeTo.to)
                                    };
                                }
                            }
                        }
                        if (blockRange) {
                            from = blockRange.from;
                            to = blockRange.to;
                        }
                        var selectedText = window.memoEditor.state.doc.textBetween(from, to, " ");
                        this.memoSelection = {
                            text: selectedText,
                            blockText: selectedText,
                            blockMarkdown: selectedText,
                            excerpt: selectedText ? selectedText.substring(0, 100) + (selectedText.length > 100 ? "…" : "") : "",
                            from: from,
                            to: to
                        };
                        try {
                            var view = window.memoEditor.view;
                            var coordsStart = view.coordsAtPos(from);
                            var coordsEnd = view.coordsAtPos(to);
                            this.memoSelectionBlockCoords = {
                                top: coordsStart.top,
                                left: coordsStart.left,
                                width: coordsEnd.right - coordsStart.left,
                                height: coordsEnd.bottom - coordsStart.top
                            };
                        } catch (err) {
                            // ignore
                        }
                    } else {
                        this.memoSelection = null;
                        this.memoSelectionBlockCoords = null;
                    }
                } catch (err) {
                    // ignore
                }
            }
            if (this.memoSelection && this.memoSelectionOverlay) {
                if (!this.memoSelectionBlockCoords && window.memoEditor) {
                    try {
                        var view = window.memoEditor.view;
                        var coordsStart = view.coordsAtPos(this.memoSelection.from);
                        var coordsEnd = view.coordsAtPos(this.memoSelection.to);
                        this.memoSelectionBlockCoords = {
                            top: coordsStart.top,
                            left: coordsStart.left,
                            width: coordsEnd.right - coordsStart.left,
                            height: coordsEnd.bottom - coordsStart.top
                        };
                    } catch (err) {
                        // ignore
                    }
                }
                this.updateMemoSelectionOverlayPosition();
                this.memoSelectionOverlay.style.display = "block";
            } else if (this.memoSelectionOverlay) {
                this.memoSelectionOverlay.style.display = "none";
            }
        }.bind(this));
        this.textarea.addEventListener("blur", function () {
            if (this.memoSelectionIgnoreBlur) {
                this.memoSelectionIgnoreBlur = false;
                if (this.memoSelectionOverlay) {
                    this.memoSelectionOverlay.style.display = "block";
                }
                return;
            }
            if (this.memoSelectionOverlay) {
                this.memoSelectionOverlay.style.display = "none";
            }
        }.bind(this));
        var textareaWrapper = document.createElement("div");
        textareaWrapper.className = "chat-input-wrapper";
        textareaWrapper.appendChild(this.textarea);
        composer.appendChild(textareaWrapper);

        var composerActions = document.createElement("div");
        composerActions.className = "chat-composer-actions";

        var composerLeftActions = document.createElement("div");
        composerLeftActions.className = "chat-composer-left-actions";

        var promptDropdown = this.buildPromptDropdown();
        composerLeftActions.appendChild(promptDropdown);

        this.promptShortcutsButton = document.createElement("button");
        this.promptShortcutsButton.type = "button";
        this.promptShortcutsButton.className = "btn-secondary chat-prompt-shortcuts-btn";
        this.promptShortcutsButton.innerHTML = '<i data-lucide="sparkles"></i>';
        this.promptShortcutsButton.setAttribute("title", "Raccourcis Prompt");
        this.promptShortcutsButton.addEventListener("click", function () {
            this.openPromptShortcutsModal(this.textarea);
        }.bind(this));
        composerLeftActions.appendChild(this.promptShortcutsButton);

        this.scrollButton = document.createElement("button");
        this.scrollButton.type = "button";
        this.scrollButton.id = "chatAttachFilesBtn";
        this.scrollButton.className = "btn-secondary chat-attach-files-btn chat-scroll-btn";
        this.scrollButton.innerHTML = '<i data-lucide="paperclip"></i>';
        this.scrollButton.addEventListener("click", this.openDocumentSelector.bind(this));
        composerLeftActions.appendChild(this.scrollButton);

        this.docsIndicatorButton = document.createElement("button");
        this.docsIndicatorButton.type = "button";
        this.docsIndicatorButton.id = "chatAttachedFilesIndicatorBtn";
        this.docsIndicatorButton.className = "chat-attached-files-indicator ai-request-counter-toaster";
        this.docsIndicatorButton.hidden = true;
        this.docsIndicatorButton.style.display = "none";
        this.docsIndicatorButton.addEventListener("click", this.openDocumentSelector.bind(this));
        this.docsIndicatorLabelEl = document.createElement("span");
        this.docsIndicatorLabelEl.className = "chat-attached-files-indicator__label chat-docs-indicator__label";
        this.docsIndicatorButton.appendChild(this.docsIndicatorLabelEl);
        this.docsIndicatorDeleteEl = document.createElement("span");
        this.docsIndicatorDeleteEl.className = "chat-delete chat-attached-files-indicator__delete";
        this.docsIndicatorDeleteEl.textContent = "×";
        this.docsIndicatorDeleteEl.setAttribute("aria-label", "Supprimer les documents");
        this.docsIndicatorDeleteEl.addEventListener("click", function (event) {
            event.stopPropagation();
            this.handleRemoveAttachedDocuments();
        }.bind(this));
        this.docsIndicatorDeleteEl.style.marginLeft = "4px";
        this.docsIndicatorButton.appendChild(this.docsIndicatorDeleteEl);
        document.body.appendChild(this.docsIndicatorButton);

        composerActions.appendChild(composerLeftActions);

        this.sendButton = document.createElement("button");
        this.sendButton.type = "button";
        this.sendButton.className = "btn-primary chat-send-btn";
        this.sendButton.innerHTML = '<i data-lucide="send"></i>';
        this.sendButton.addEventListener("click", this.handleSend.bind(this));
        composerActions.appendChild(this.sendButton);

        composer.appendChild(composerActions);

        this.speechButton = document.createElement("button");
        this.speechButton.type = "button";
        this.speechButton.className = "btn-secondary chat-speech-btn";
        this.speechButton.innerHTML = '<i data-lucide="mic"></i>';
        this.speechButton.addEventListener("mousedown", function () {
            this.memoSelectionIgnoreBlur = true;
        }.bind(this));
        this.speechButton.addEventListener("click", this.handleSpeechToggle.bind(this));
        composerLeftActions.appendChild(this.speechButton);

        this.memoSelectionFollowButton = document.createElement("button");
        this.memoSelectionFollowButton.type = "button";
        this.memoSelectionFollowButton.className = "btn-secondary chat-selection-follow-btn active";
        this.memoSelectionFollowButton.innerHTML = '<i data-lucide="mouse-pointer-click"></i>';
        this.memoSelectionFollowButton.setAttribute("title", "Sélection automatique");
        this.memoSelectionFollowButton.setAttribute("aria-pressed", "true");
        this.memoSelectionFollowButton.addEventListener("click", function () {
            this.memoSelectionFollowActive = !this.memoSelectionFollowActive;
            this.memoSelectionFollowButton.classList.toggle("active", this.memoSelectionFollowActive);
            this.memoSelectionFollowButton.setAttribute("aria-pressed", String(this.memoSelectionFollowActive));
            if (this.memoSelectionFollowActive && document.activeElement === this.textarea) {
                this.textarea.dispatchEvent(new Event("focus"));
            }
        }.bind(this));
        composerLeftActions.appendChild(this.memoSelectionFollowButton);
        this.sidebar.appendChild(composer);
        if (window.lucide) window.lucide.createIcons();

        this.root.appendChild(this.sidebar);
        this.mountResizer(resizer);
        this.createDocumentPickers();
        this.buildPreviewPanel();
        this.initMemoSelectionTracking();
        this.prefetchKnowledgeModalList();
        this.renderPendingDocumentAttachments();
        return true;
    };

    AssistSidebar.prototype.prefetchKnowledgeModalList = function () {
        if (this.knowledgeIndexing || this.knowledgeModal) return;
        this.buildKnowledgeModal();
        this.refreshKnowledgeModal({ skipAutoReindex: true }).catch(function (err) {
            console.warn("Knowledge prefetch failed", err);
        });
        this.ensureKnowledgeIndexWarm();
    };

    AssistSidebar.prototype.ensureKnowledgeIndexWarm = function () {
        if (this.knowledgeIndexing || !this.docManager) return;
        this.docManager.waitReady?.()
            .then(function () {
                return this.refreshKnowledgeModal({ skipAutoReindex: true });
            }.bind(this))
            .catch(function (err) {
                console.warn("Knowledge warmup failed", err);
            });
    };

    AssistSidebar.prototype.getFileImportAcceptString = function (options) {
        var exclude = options?.exclude || [];
        var filterFn = function (item) {
            if (!item) return false;
            var low = item.toLowerCase();
            return !exclude.some(function (ext) {
                var extLow = ext.toLowerCase();
                // Check if it's an extension or part of a mime-type
                return low === extLow || low === "." + extLow || low.indexOf("/" + extLow) !== -1 || low.indexOf("." + extLow) !== -1;
            });
        };

        var config = window.GoToolkitSiteConfig?.get("fileImport.supportedExtensions");
        if (config && Array.isArray(config.mimeTypes) && Array.isArray(config.extensions)) {
            var base = config.mimeTypes.concat(config.extensions).filter(filterFn);
            var media = [
                "audio/mpeg", ".mp3",
                "audio/wav", ".wav",
                "audio/mp4", ".mp4", ".m4a",
                "audio/aac", ".aac",
                "audio/ogg", ".ogg",
                "audio/webm", ".webm",
                "audio/flac", ".flac",
                "video/mp4",
                "video/webm",
                "video/quicktime", ".mov",
                "video/x-msvideo", ".avi",
                "image/png", ".png",
                "image/jpeg", ".jpg", ".jpeg",
                "image/webp", ".webp",
                "image/gif", ".gif",
                "image/bmp", ".bmp",
                "image/tiff", ".tif", ".tiff"
            ].filter(filterFn);
            return base.concat(media).join(",");
        }

        // Fallback to default if config not available
        var fallback = "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,text/plain,.txt,text/markdown,.md,text/vtt,.vtt,application/json,.json,.hag,application/rtf,.rtf,application/msword,.doc,application/vnd.oasis.opendocument.text,.odt,application/vnd.oasis.opendocument.spreadsheet,.ods,audio/mpeg,.mp3,audio/wav,.wav,audio/mp4,.mp4,.m4a,audio/aac,.aac,audio/ogg,.ogg,audio/webm,.webm,audio/flac,.flac,video/mp4,video/webm,video/quicktime,.mov,video/x-msvideo,.avi";
        return fallback.split(",").filter(filterFn).join(",");
    };

    AssistSidebar.prototype.createDocumentPickers = function () {
        if (this.documentsFileInput) return;
        this.documentsFileInput = document.createElement("input");
        this.documentsFileInput.type = "file";
        this.documentsFileInput.multiple = true;
        this.documentsFileInput.accept = this.getFileImportAcceptString();
        this.documentsFileInput.style.display = "none";
        this.documentsFileInput.addEventListener("change", this.handleDocumentFilesSelected.bind(this));

        document.body.appendChild(this.documentsFileInput);
    };

    AssistSidebar.prototype.openDocumentSelector = async function () {
        if (CHAT_APP_ID === "memo") {
            var activeMemoDocId = typeof global.GoToolkitMemoGetActiveDocumentId === "function"
                ? global.GoToolkitMemoGetActiveDocumentId()
                : null;
            if (!activeMemoDocId && typeof global.GoToolkitMemoCreateAutoDocument === "function") {
                await global.GoToolkitMemoCreateAutoDocument();
            }
        }
        if (this.documentsFileInput) {
            this.documentsFileInput.click();
        }
    };

    AssistSidebar.prototype.createImportFileInput = function () {
        if (this.importFileInput) return;
        this.importFileInput = document.createElement("input");
        this.importFileInput.type = "file";
        this.importFileInput.multiple = true;
        this.importFileInput.accept = this.getFileImportAcceptString({
            exclude: ["xlsx", "csv", "tsv", "ods", "json", "har", "hag"]
        });
        this.importFileInput.style.display = "none";
        this.importFileInput.addEventListener("change", this.handleImportFilesSelected.bind(this));
        document.body.appendChild(this.importFileInput);
    };

    AssistSidebar.prototype.openImportFileSelector = function (options) {
        this.createImportFileInput();
        this.importFileOptions = options || null;
        if (this.importFileInput) {
            this.importFileInput.click();
        }
    };

    AssistSidebar.prototype.prepareMediaTranscripts = async function (files, options) {
        var transcriptApi = global.GoToolkitVoiceTranscript;
        if (!transcriptApi) {
            throw new Error("Transcription indisponible");
        }
        var key = transcriptApi.getAssemblyApiKey?.() || "";
        var durationCache = new Map();
        var totalDurationSec = 0;
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var validation = await validateMediaFile(file);
            durationCache.set(file, validation);
            if (validation.ok && Number.isFinite(validation.duration)) {
                totalDurationSec += Math.max(0, validation.duration);
            }
        }
        var transcriptionDuration = clampDuration(45000 + Math.round(totalDurationSec * 250), 45000, 180000);
        global.GoToolkitAIRequestToaster?.startIcon?.(
            "aiRequestCounterToasterTranscription",
            "audio-lines",
            "Transcription",
            transcriptionDuration
        );
        var results = [];
        var errors = [];
        try {
            var onTranscript = typeof options?.onTranscript === "function" ? options.onTranscript : null;
            var concurrency = Number.isFinite(options?.concurrency) ? Math.max(1, options.concurrency) : 1;
            this.mediaTotalCount = files.length;
            this.mediaUploadCount = 0;
            this.mediaTranscribedCount = 0;
            if (!options?.skipIndicator) {
                this.updateAttachmentIndicator();
            }
            var index = 0;
            var runWorker = async function () {
                while (index < files.length) {
                    var currentIndex = index;
                    index += 1;
                    var file = files[currentIndex];
                    var validation = durationCache.get(file) || await validateMediaFile(file);
                    if (!validation.ok) {
                        errors.push({ name: file?.name || "", error: validation.error || "Fichier invalide" });
                        continue;
                    }
                    this.setDocumentUploadStatus("Upload audio/vidéo → " + (file?.name || ""));
                    var uploadUrl = await transcriptApi.uploadAudioToAssembly(file, key);
                    this.mediaUploadCount += 1;
                    if (!options?.skipIndicator) {
                        this.updateAttachmentIndicator();
                    }
                    var payload = transcriptApi.buildAssemblyTranscriptPayload(uploadUrl, 0);
                    var transcriptId = await transcriptApi.requestAssemblyTranscript(payload, key);
                    this.setDocumentUploadStatus("Transcription → " + (file?.name || ""));
                    var result = await transcriptApi.pollAssemblyTranscript(transcriptId, key);
                    this.mediaTranscribedCount += 1;
                    if (!options?.skipIndicator) {
                        this.updateAttachmentIndicator();
                    }
                    try {
                        console.log("AssemblyAI transcript response:", result);
                    } catch (err) {
                        // ignore
                    }
                    var transcriptText = transcriptApi.buildTranscriptFromUtterances
                        ? transcriptApi.buildTranscriptFromUtterances(result)
                        : (result?.text || "").trim();
                    if (!transcriptText) {
                        errors.push({ name: file?.name || "", error: "Transcription vide" });
                        continue;
                    }
                    var vttFileName = buildTranscriptFileName(file?.name || "");
                    var txtFile = new File([transcriptText], vttFileName, { type: "text/plain" });
                    this.mediaTranscriptFileSizes?.set(txtFile.name, Number(file?.size) || 0);
                    var entry = { file: txtFile, sourceFile: file, transcriptText: transcriptText };
                    if (onTranscript) {
                        await onTranscript(entry);
                    }
                    results.push(entry);
                }
            }.bind(this);
            var workers = [];
            var workerCount = Math.min(concurrency, files.length);
            for (var w = 0; w < workerCount; w++) {
                workers.push(runWorker());
            }
            await Promise.all(workers);
        } finally {
            global.GoToolkitAIRequestToaster?.stop?.("aiRequestCounterToasterTranscription");
        }
        return { files: results, errors: errors };
    };

    AssistSidebar.prototype.handleImportFilesSelected = function (event) {
        var files = event?.target?.files;
        if (!files || !files.length) return;
        var options = this.importFileOptions || {};
        this.importFileOptions = null;
        this.sendImportedDocuments(Array.from(files), options);
        event.target.value = "";
    };

    AssistSidebar.prototype.sendImportedDocuments = async function (files, options = {}) {
        if (!this.docManager) {
            console.warn("Document manager not available");
            return;
        }

        if (!files || !files.length) {
            console.warn("No files to import");
            return;
        }

        var self = this;
        var fileArray = Array.from(files);

        // Filter out table-like/structured formats not supported for memo import
        var unsupportedImportExtensions = ["xlsx", "csv", "tsv", "ods", "json", "har", "hag"];
        var filteredFiles = fileArray.filter(function (file) {
            var ext = (file.name || "").split('.').pop().toLowerCase();
            return !unsupportedImportExtensions.includes(ext);
        });

        if (!filteredFiles.length && fileArray.length > 0) {
            return;
        }
        fileArray = filteredFiles;

        var directTextFiles = [];
        if (CHAT_APP_ID === "memo") {
            var remainingFiles = [];
            fileArray.forEach(function (file) {
                var name = (file?.name || "").toLowerCase();
                var isMarkdown = name.endsWith(".md") || name.endsWith(".markdown");
                var isText = name.endsWith(".txt");
                if (isMarkdown || isText) {
                    directTextFiles.push(file);
                } else {
                    remainingFiles.push(file);
                }
            });
            fileArray = remainingFiles;
        }

        var memoId = this.getActiveMemoId();
        var tabId = memoId || null;
        var createdImportBubble = false;
        var hadMediaTranscription = false;
        var didSendAI = false;
        // Options for import behavior
        var skipEmbeddings = Boolean(options.skipEmbeddings);
        var directPasteMode = Boolean(options.directPasteMode) ||
            Boolean(global.GoToolkitSiteConfig?.get?.("memo.import.directPasteEnabled", false));

        this.attachmentsTotalCount = fileArray.length;
        this.attachmentsTotalSize = fileArray.reduce(function (acc, file) {
            return acc + (Number(file?.size) || 0);
        }, 0);
        this.attachmentsCompletedCount = 0;
        this.attachmentsCompletedSize = 0;
        this.attachmentsCompletedFiles = new Set();
        this.attachmentsFailedFiles = new Set();
        this.attachmentsFileSizes = new Map();
        this.mediaTranscriptFileSizes = new Map();
        fileArray.forEach(function (file) {
            if (file?.name) {
                this.attachmentsFileSizes.set(file.name, Number(file.size) || 0);
            }
        }, this);

        // Do not display indicator for memo import (skipEmbeddings)
        if (!skipEmbeddings) {
            this.updateAttachmentIndicator();
        }

        try {
            this.importInProgress = true;
            this.setSendButtonBusy(true);

            // Hide generic toast for memo import (skipEmbeddings)
            if (CHAT_APP_ID === "memo" && !skipEmbeddings) {
                window.GoToolkitMemoToast?.("Import en cours");
            }
            // 1. Ingérer les fichiers (parsing, chunking) comme chatAttachFilesBtn
            console.log("Starting document ingestion for import...");
            var mediaTranscriptMap = new Map();
            var mediaTranscriptTextMap = new Map();
            var mediaIngestResults = [];
            var mediaFiles = fileArray.filter(function (file) {
                return isMediaFile(file);
            });
            var docFiles = fileArray.filter(function (file) {
                return !isMediaFile(file);
            });

            // For memo import (skipEmbeddings): always write the import message immediately
            if (skipEmbeddings && fileArray.length > 0) {
                var fileNames = fileArray.map(function (file) { return file?.name || ""; }).filter(Boolean);
                var importLabel = "⤷ Importer " + (fileNames.length === 1 ? fileNames[0] : fileNames.length + " fichiers");
                var userMessage = {
                    id: "msg-" + Date.now(),
                    role: "user",
                    content: importLabel,
                    attachments: fileNames
                };
                this.conversation.messages.push(userMessage);
                this.appendMessage(userMessage);
                this.persist();
                this.scrollToBottom();
                createdImportBubble = true;

                // Do not create statusMessage "..." here as sendAIRequest will create its own placeholder
            }

            if (directTextFiles.length && memoId) {
                var insertMarkdown = function (value) {
                    if (typeof window.insertEditorMarkdownAtEnd === "function") {
                        window.insertEditorMarkdownAtEnd(value);
                    } else if (typeof window.GoToolkitMemoAppendText === "function") {
                        window.GoToolkitMemoAppendText(value);
                    }
                };
                for (var i = 0; i < directTextFiles.length; i++) {
                    var textFile = directTextFiles[i];
                    if (!textFile) continue;
                    try {
                        var textContent = await textFile.text();
                        if (textContent) {
                            insertMarkdown(textContent + "\n\n");
                        }
                    } catch (err) {
                        console.warn("Failed to import text file into memo:", textFile?.name || "", err);
                    }
                }
                var directLabel = directTextFiles.length === 1
                    ? directTextFiles[0]?.name || "Document"
                    : directTextFiles.length + " documents";
                if (!skipEmbeddings) window.GoToolkitMemoToast?.("⤷ " + directLabel + " importé");
            }

            if (mediaFiles.length) {
                hadMediaTranscription = true;
                this.deferSendButtonRestoreUntilAI = true;
                this.setTranscriptionUiState(true);
                var mediaNames = mediaFiles.map(function (file) { return file?.name || ""; }).filter(Boolean);

                if (!skipEmbeddings) {
                    var importLabel = "⤷ Importer " + (mediaNames.length === 1 ? mediaNames[0] : mediaNames.length + " fichiers");
                    var userMessage = {
                        id: "msg-" + Date.now(),
                        role: "user",
                        content: importLabel,
                        attachments: mediaNames
                    };
                    this.conversation.messages.push(userMessage);
                    this.appendMessage(userMessage);
                    this.persist();
                    this.scrollToBottom();
                    createdImportBubble = true;

                    var statusMessage = {
                        id: "msg-" + (Date.now() + 1),
                        role: "bot",
                        content: "..."
                    };
                    this.conversation.messages.push(statusMessage);
                    this.appendMessage(statusMessage);
                    this.persist();
                    this.scrollToBottom();
                }

                this.setDocumentUploadStatus("Transcription audio/vidéo en cours…");
                var transcriptResult = await this.prepareMediaTranscripts(mediaFiles, {
                    concurrency: 2,
                    skipIndicator: skipEmbeddings,
                    onTranscript: async function (entry) {
                        if (entry?.file?.name && entry?.sourceFile) {
                            mediaTranscriptMap.set(entry.file.name, entry.sourceFile);
                        }
                        if (entry?.file?.name && entry?.transcriptText) {
                            mediaTranscriptTextMap.set(entry.file.name, entry.transcriptText);
                        }
                        var metadata = new Map();
                        var displayName = String(entry?.sourceFile?.name || "").replace(/\.[^/.]+$/, "") + " (transcription)";
                        metadata.set(entry.file.name, {
                            scope: "attachments",
                            name: displayName || entry.file.name,
                            abstract: "Transcription importée"
                        });
                        var memoId = this.getActiveMemoId();
                        var tabId = memoId || null;

                        // Ingest with skipEmbeddings=true
                        var results = await this.docManager.ingestFiles([entry.file], this.conversation.id, {
                            onProgress: this.handleDocumentProgress.bind(this),
                            sourceType: "context",
                            metadata: metadata,
                            memoId: memoId,
                            tabId: tabId,
                            skipEmbeddings: true
                        });
                        mediaIngestResults.push.apply(mediaIngestResults, results);

                        // If NOT in memo import skipEmbeddings mode, we might want individual requests
                        // but for memo import we wait for all to be ready or handle them here?
                        // The user said "go throught chatImportPrompt"
                        if (!skipEmbeddings) {
                            var systemPrompt = window.GoToolkitChatPrompt?.PRESETS?.import?.prompt ||
                                window.GoToolkitChatPrompt?.PRESETS?.import?.defaultPrompt ||
                                "Analyse le DOCUMENT fourni et produis une synthèse structurée.";
                            var payload = {
                                system: systemPrompt,
                                messages: [
                                    {
                                        role: "user",
                                        content: "DOCUMENT\n" + entry.transcriptText
                                    }
                                ],
                                stream: false,
                                model: global.GoToolkitIAConfig?.getOpenRouterModel?.() || "openai/gpt-oss-120b"
                            };
                            this.sendAIRequest(payload);
                        }
                    }.bind(this)
                });
                if (transcriptResult.errors && transcriptResult.errors.length) {
                    var firstError = transcriptResult.errors[0];
                    this.setDocumentUploadStatus("Erreur : " + (firstError.error || "transcription échouée"));
                    transcriptResult.errors.forEach(function (entry) {
                        if (entry?.name) {
                            this.markAttachmentFailed(entry.name);
                            if (window.GoToolkitMemoToast) {
                                window.GoToolkitMemoToast("Transcription échouée : " + entry.name, true);
                            }
                        }
                    }, this);
                }
                fileArray = docFiles;
            }
            if (!fileArray.length && !mediaIngestResults.length && !directTextFiles.length) {
                this.setDocumentUploadStatus("Erreur : aucun fichier valide");
                return;
            }
            var results = [];
            if (fileArray.length) {
                var metadata = new Map();
                fileArray.forEach(function (file) {
                    var sourceFile = mediaTranscriptMap.get(file.name);
                    var displayName = file.name;
                    var abstract = "Importer";
                    if (sourceFile) {
                        displayName = String(sourceFile.name || "").replace(/\.[^/.]+$/, "") + " (transcription)";
                        abstract = "Transcription importée";
                    }
                    metadata.set(file.name, {
                        scope: "attachments",
                        name: displayName || file.name,
                        abstract: abstract
                    });
                });

                results = await this.docManager.ingestFiles(fileArray, this.conversation.id, {
                    onProgress: this.handleDocumentProgress.bind(this),
                    sourceType: "context",
                    metadata: metadata,
                    memoId: memoId,
                    tabId: tabId,
                    skipEmbeddings: skipEmbeddings
                });
            }
            if (mediaIngestResults.length) {
                results = mediaIngestResults.concat(results);
            }
            if (!results.length && directTextFiles.length) {
                return;
            }

            var errors = results.filter(function (item) {
                return !item.success && !item.duplicate;
            });
            var duplicates = results.filter(function (item) {
                return item.duplicate;
            });

            if (errors.length) {
                console.error("Import ingestion errors:", errors);
                errors.forEach(function (entry) {
                    if (entry?.name) {
                        this.markAttachmentFailed(entry.name);
                        if (window.GoToolkitMemoToast) {
                            window.GoToolkitMemoToast("Import échoué : " + entry.name, true);
                        }
                    }
                }, this);
                return;
            }
            if (duplicates.length) {
                var dupNames = duplicates.map(function (item) { return item.name; }).filter(Boolean);
                this.setDocumentUploadStatus("Doublon ignoré : " + (dupNames.join(", ") || "fichier"));
            }

            // 2. Récupérer les documents depuis la DB
            var readyDocNames = results
                .filter(function (item) {
                    return item.success;
                })
                .map(function (item) {
                    return item.name;
                });

            console.log("Documents ready for import:", readyDocNames);
            if (memoId) {
                if (readyDocNames.length) {
                    this.markMemoAttachmentsPending(memoId);
                }
                await this.refreshMemoContextAttachments();
                window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
            }

            // Check for direct paste mode with media transcripts - paste directly and skip AI
            if (directPasteMode && memoId && mediaTranscriptTextMap.size) {
                var transcriptParts = [];
                readyDocNames.forEach(function (name) {
                    var text = mediaTranscriptTextMap.get(name);
                    if (text) {
                        transcriptParts.push(text);
                    }
                });
                if (transcriptParts.length) {
                    window.GoToolkitMemoAppendText?.(transcriptParts.join("\n\n"));
                    var toastMsg = readyDocNames.length === 1
                        ? "⤷ " + readyDocNames[0] + " importé"
                        : readyDocNames.length + " documents importés";
                    if (!skipEmbeddings) window.GoToolkitMemoToast?.(toastMsg);
                }

                // Create a user message indicating direct paste
                var userMessage = {
                    id: "msg-" + Date.now(),
                    role: "user",
                    content: "⤷ Importer " + (readyDocNames.length === 1 ? readyDocNames[0] : readyDocNames.length + " documents"),
                    attachments: readyDocNames
                };
                this.conversation.messages.push(userMessage);
                this.appendMessage(userMessage);
                this.persist();

                // Create a bot confirmation message
                var botMessage = {
                    id: "msg-" + (Date.now() + 1),
                    role: "bot",
                    content: "✓ " + (readyDocNames.length === 1 ? "Document" : readyDocNames.length + " documents") + " importé(s) directement dans le mémo."
                };
                this.conversation.messages.push(botMessage);
                this.appendMessage(botMessage);
                this.persist();

                if (readyDocNames.length) {
                    this.confirmMemoAttachments(memoId);
                    await this.refreshMemoContextAttachments();
                    window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
                }
                didSendAI = true;
                return;
            }

            // Standard media transcript paste (when not in directPasteMode)
            if (memoId && mediaTranscriptTextMap.size) {
                var transcriptParts = [];
                readyDocNames.forEach(function (name) {
                    var text = mediaTranscriptTextMap.get(name);
                    if (text) {
                        transcriptParts.push(text);
                    }
                });
                if (transcriptParts.length) {
                    window.GoToolkitMemoAppendText?.(transcriptParts.join("\n\n"));
                    if (!skipEmbeddings) window.GoToolkitMemoToast?.("Transcription importée.");
                }
            }

            // 3. Récupérer le contenu de chaque document depuis IndexedDB
            var parsedContents = [];
            var documents = await this.docManager.getDocuments(this.conversation.id);

            for (var i = 0; i < readyDocNames.length; i++) {
                var docName = readyDocNames[i];
                // Trouver le document dans la liste
                var doc = documents.find(function (d) {
                    return d && (d.name === docName || d.sourceFileName === docName);
                });

                if (doc && doc.id) {
                    try {
                        var fullDoc = await this.docManager.getDocumentById(doc.id);
                        if (fullDoc && fullDoc.rawText) {
                            parsedContents.push(fullDoc.rawText);
                        }
                    } catch (err) {
                        console.warn("Failed to retrieve document content for:", docName, err);
                    }
                }
            }

            if (!parsedContents.length) {
                console.warn("No document content available to import");
                return;
            }
            this.clearAttachments();

            // 4. Check for direct paste mode (OCR/transcription files get pasted directly to memo)
            if (directPasteMode && memoId && parsedContents.length) {
                var fullText = parsedContents.join("\n\n");
                window.GoToolkitMemoAppendText?.(fullText);
                var toastMsg = readyDocNames.length === 1
                    ? "⤷ " + readyDocNames[0] + " importé"
                    : readyDocNames.length + " documents importés";
                if (!skipEmbeddings) window.GoToolkitMemoToast?.(toastMsg);

                // Create a user message indicating direct paste
                var userMessage = {
                    id: "msg-" + Date.now(),
                    role: "user",
                    content: "⤷ Importer " + (readyDocNames.length === 1 ? readyDocNames[0] : readyDocNames.length + " documents"),
                    attachments: readyDocNames
                };
                this.conversation.messages.push(userMessage);
                this.appendMessage(userMessage);
                this.persist();

                // Create a bot confirmation message
                var botMessage = {
                    id: "msg-" + (Date.now() + 1),
                    role: "bot",
                    content: "✓ " + (readyDocNames.length === 1 ? "Document" : readyDocNames.length + " documents") + " importé(s) directement dans le mémo."
                };
                this.conversation.messages.push(botMessage);
                this.appendMessage(botMessage);
                this.persist();

                if (readyDocNames.length) {
                    this.confirmMemoAttachments(memoId);
                    await this.refreshMemoContextAttachments();
                    window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
                }
                didSendAI = true;
                return;
            }

            // 5. Construire le payload avec format DOCUMENT\n{contenu1}\nDOCUMENT\n{contenu2}
            var userPrompt = "DOCUMENT\n" + parsedContents.join("\nDOCUMENT\n");

            // Get the import prompt
            var systemPrompt = window.GoToolkitChatPrompt?.PRESETS?.import?.prompt ||
                window.GoToolkitChatPrompt?.PRESETS?.import?.defaultPrompt ||
                "Analyse le DOCUMENT fourni et produis une synthèse structurée.";

            // Build payload
            var payload = {
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                stream: false,
                model: global.GoToolkitIAConfig?.getOpenRouterModel?.() || "openai/gpt-oss-120b"
            };

            // Create user message in chat
            if (!createdImportBubble) {
                var userMessage = {
                    id: "msg-" + Date.now(),
                    role: "user",
                    content: "⤷ Importer " + (readyDocNames.length === 1 ? readyDocNames[0] : readyDocNames.length + " documents"),
                    attachments: readyDocNames
                };
                this.conversation.messages.push(userMessage);
                this.appendMessage(userMessage);
                this.persist();
                this.scrollToBottom();
            }
            if (memoId && readyDocNames.length) {
                this.confirmMemoAttachments(memoId);
                await this.refreshMemoContextAttachments();
                window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
            }

            // Send to AI
            didSendAI = true;
            this.sendAIRequest(payload);

        } catch (err) {
            console.error("Import documents error:", err);
            var errorMessage = {
                id: "msg-" + Date.now(),
                role: "bot",
                content: "❌ Erreur lors de l'importation. Vérifiez les fichiers."
            };
            this.appendMessage(errorMessage);
            this.persist();
        } finally {
            if (hadMediaTranscription && !didSendAI) {
                this.deferSendButtonRestoreUntilAI = false;
                this.setTranscriptionUiState(false);
            }
            if (this.importInProgress && !didSendAI) {
                this.importInProgress = false;
                this.setSendButtonBusy(false);
                if (CHAT_APP_ID === "memo") {
                    window.GoToolkitMemoToast?.("");
                }
            }
        }
    };

    AssistSidebar.prototype.setDocumentUploadStatus = function (message) {
        this.documentUploadStatus = message || "";
        this.syncDocumentIndicatorTitle(this.documentChunkCount);
        if (CHAT_APP_ID === "memo" && message) {
            var isError = /Erreur|indisponible|échec/i.test(message);
            if (isError) {
                try {
                    document.dispatchEvent(new CustomEvent("goToolkitMemoImportStatus", {
                        detail: { message: message, isError: true }
                    }));
                } catch (err) {
                    // ignore
                }
            }
        }
    };

    AssistSidebar.prototype.syncDocumentIndicatorTitle = function (chunkCount) {
        if (!this.docsIndicatorButton) return;
        var parts = [];
        if (this.attachmentsIngestionStart && this.attachmentsIngestionEnd) {
            var durationMs = Math.max(0, this.attachmentsIngestionEnd - this.attachmentsIngestionStart);
            var durationSec = (durationMs / 1000).toFixed(1);
            parts.push("Temps total: " + durationSec + " s");
        }
        if (this.attachmentsTotalSize) {
            parts.push("Taille totale: " + formatFileSize(this.attachmentsTotalSize));
        }
        if (typeof chunkCount === "number" && !isNaN(chunkCount)) {
            parts.push(chunkCount + " extraits indexés");
        }
        if (this.keywordIndexSizes) {
            var ctxSize = Number(this.keywordIndexSizes.context) || 0;
            var knSize = Number(this.keywordIndexSizes.knowledge) || 0;
            parts.push("keyword index size (context): " + ctxSize);
            if (this.promptPresetId !== "ask") {
                parts.push("keyword index size (knowledge): " + knSize);
            }
        }
        if (this.documentUploadStatus) {
            parts.push(this.documentUploadStatus);
        }
        this.docsIndicatorButton.title = parts.join("\n");
    };

    AssistSidebar.prototype.setPendingDocumentAttachments = function (names, options) {
        options = options || {};
        var nextNames = (names || []).filter(Boolean);
        if (options.preserveExcluded) {
            var nextExcluded = new Set();
            (this.pendingExcludedAttachments || new Set()).forEach(function (name) {
                if (nextNames.includes(name)) {
                    nextExcluded.add(name);
                }
            });
            this.pendingExcludedAttachments = nextExcluded;
        } else {
            this.pendingExcludedAttachments = new Set();
        }
        this.pendingDocumentAttachments = nextNames;
        this.attachmentsParsedCount = this.pendingDocumentAttachments.length;
        this.attachmentsTotalCount = 0;
        this.attachmentsCharsTotal = 0;
        this.attachmentsCharsProcessed = 0;
        this.attachmentsCharsByFile = {};
        this.attachmentsCharsProcessedByFile = {};
        this.attachmentsExtractProgressByFile = {};
        this.attachmentsEmbedProgressByFile = {};
        this.attachmentsChunkTotalsByFile = {};
        this.attachmentsChunkExtByFile = {};
        this.updateAttachmentIndicator();
        this.renderPendingDocumentAttachments();
        this.syncDocumentIndicatorTitle(this.documentChunkCount);
        this.persistPendingAttachments();
    };

    AssistSidebar.prototype.renderPendingDocumentAttachments = function () {
        if (!this.pendingAttachmentRow || !this.pendingAttachmentList) return;
        var names = Array.isArray(this.pendingDocumentAttachments)
            ? this.pendingDocumentAttachments.filter(Boolean)
            : [];
        var showList = names.length > 0 && !this.mediaTranscriptionActive;
        if (!showList) {
            this.pendingAttachmentRow.style.display = "none";
            this.pendingAttachmentList.innerHTML = "";
            return;
        }
        this.pendingAttachmentRow.style.display = "flex";
        this.pendingAttachmentList.innerHTML = "";
        names.forEach(function (name) {
            var isEnabled = !this.pendingExcludedAttachments?.has?.(name);
            var item = document.createElement("span");
            item.className = "chat-composer-attachment";
            item.dataset.enabled = isEnabled ? "true" : "false";
            var label = document.createElement("span");
            label.className = "chat-composer-attachment__name";
            label.textContent = truncateFilename(name);
            label.setAttribute("role", "button");
            label.setAttribute("tabindex", "0");
            label.setAttribute("aria-pressed", isEnabled ? "true" : "false");
            label.addEventListener("click", function (event) {
                event.stopPropagation();
                this.togglePendingAttachment(name);
            }.bind(this));
            label.addEventListener("keydown", function (event) {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                this.togglePendingAttachment(name);
            }.bind(this));
            item.appendChild(label);
            var removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "chat-composer-attachment__remove";
            removeBtn.setAttribute("aria-label", "Supprimer la pièce jointe");
            removeBtn.innerHTML = '<i data-lucide="x" style="width:12px;height:12px;"></i>';
            removeBtn.addEventListener("click", function (event) {
                event.stopPropagation();
                this.handleRemovePendingAttachment(name);
            }.bind(this));
            item.appendChild(removeBtn);
            this.pendingAttachmentList.appendChild(item);
        }.bind(this));
        if (window.lucide) window.lucide.createIcons();
    };

    AssistSidebar.prototype.togglePendingAttachment = function (name) {
        if (!name) return;
        if (this.pendingExcludedAttachments?.has?.(name)) {
            this.pendingExcludedAttachments.delete(name);
        } else {
            this.pendingExcludedAttachments.add(name);
        }
        this.renderPendingDocumentAttachments();
        this.updateAttachmentIndicator();
        this.persistPendingAttachments();
    };

    AssistSidebar.prototype.handleRemovePendingAttachment = function (name) {
        if (!name) return;
        this.pendingExcludedAttachments?.delete?.(name);
        this.pendingDocumentAttachments = (this.pendingDocumentAttachments || []).filter(function (item) {
            return item !== name;
        });
        this.renderPendingDocumentAttachments();
        this.updateAttachmentIndicator();
        this.updateComposerState();
        this.persistPendingAttachments();
        if (this.docManager) {
            this.docManager.deleteDocumentsByNames(this.conversation.id, [name])
                .then(function () {
                    this.refreshDocumentStats();
                    this.refreshMemoContextAttachments().catch(function () { /* ignore */ });
                }.bind(this))
                .catch(function (err) {
                    console.warn("Failed to remove attached document", err);
                });
        }
    };

    AssistSidebar.prototype.getActiveMemoId = function () {
        if (CHAT_APP_ID !== "memo") return null;
        return window.__memoState?.activeTabId || null;
    };

    AssistSidebar.prototype.formatMemoAttachmentTooltip = function (entry) {
        if (!entry) return "";
        var parts = [];
        if (entry.importedAt) {
            var date = new Date(entry.importedAt);
            if (!isNaN(date.getTime())) {
                parts.push("Importe le " + date.toLocaleString("fr-FR"));
            }
        }
        if (entry.size) {
            parts.push("Taille " + formatFileSize(entry.size));
        }
        if (entry.chunkCount) {
            parts.push(entry.chunkCount + " extraits");
        }
        parts.push("Keyword index: " + (this.docManager?.keywordIndex ? "oui" : "non"));
        if (entry.docId || entry.id) {
            parts.push("Doc ID: " + (entry.docId || entry.id));
        }
        if (entry.fileHash) {
            parts.push("Hash: " + entry.fileHash);
        }
        return parts.join(" · ");
    };

    AssistSidebar.prototype.markMemoAttachmentsPending = function (memoId) {
        if (!memoId) return;
        this.memoPendingAttachmentMemos.add(memoId);
    };

    AssistSidebar.prototype.confirmMemoAttachments = function (memoId) {
        if (!memoId) return;
        this.memoConfirmedAttachmentMemos.add(memoId);
        this.memoPendingAttachmentMemos.delete(memoId);
    };

    AssistSidebar.prototype.renderMemoContextAttachments = function () {
        if (!this.memoContextAttachmentRow || !this.memoContextAttachmentList) return;
        var entries = Array.isArray(this.memoContextAttachments) ? this.memoContextAttachments : [];
        if (CHAT_APP_ID !== "memo" || !entries.length) {
            this.memoContextAttachmentRow.style.display = "none";
            this.memoContextAttachmentList.innerHTML = "";
            return;
        }
        this.memoContextAttachmentRow.style.display = "flex";
        this.memoContextAttachmentList.innerHTML = "";
        entries.forEach(function (entry) {
            var isEnabled = entry?.enabled !== false;
            var item = document.createElement("span");
            item.className = "chat-composer-attachment";
            item.dataset.enabled = isEnabled ? "true" : "false";
            item.title = this.formatMemoAttachmentTooltip(entry);

            var name = document.createElement("span");
            name.className = "chat-composer-attachment__name";
            name.textContent = truncateFilename(entry.fileName || "Document");
            name.setAttribute("role", "button");
            name.setAttribute("tabindex", "0");
            name.setAttribute("aria-pressed", isEnabled ? "true" : "false");
            name.addEventListener("click", function (event) {
                event.stopPropagation();
                this.toggleMemoContextAttachment(entry);
            }.bind(this));
            name.addEventListener("keydown", function (event) {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                this.toggleMemoContextAttachment(entry);
            }.bind(this));
            item.appendChild(name);

            var removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "chat-composer-attachment__remove";
            removeBtn.textContent = "⊗";
            removeBtn.setAttribute("aria-label", "Supprimer l'embedding");
            removeBtn.addEventListener("click", function (event) {
                event.stopPropagation();
                this.handleRemoveMemoContextAttachment(entry);
            }.bind(this));
            item.appendChild(removeBtn);

            this.memoContextAttachmentList.appendChild(item);
        }.bind(this));
    };

    AssistSidebar.prototype.refreshMemoContextAttachments = async function () {
        if (!this.memoContextAttachmentRow || !this.docManager) return;
        var memoId = this.getActiveMemoId();
        if (!memoId) {
            this.memoContextAttachments = [];
            this.renderMemoContextAttachments();
            return;
        }
        try {
            var entries = await this.docManager.getMemoEmbeddings(memoId);
            this.memoContextAttachments = entries || [];
            if (this.memoPendingAttachmentMemos.has(memoId) && !this.memoConfirmedAttachmentMemos.has(memoId)) {
                this.memoContextAttachmentRow.style.display = "none";
                this.memoContextAttachmentList.innerHTML = "";
                return;
            }
            if (this.memoContextAttachments.length && !this.memoConfirmedAttachmentMemos.has(memoId)) {
                this.memoConfirmedAttachmentMemos.add(memoId);
            }
            this.renderMemoContextAttachments();
        } catch (err) {
            console.warn("Failed to load memo context attachments", err);
        }
    };

    AssistSidebar.prototype.toggleMemoContextAttachment = async function (entry) {
        if (!entry || !this.docManager) return;
        var memoId = this.getActiveMemoId();
        if (!memoId) return;
        var nextEnabled = entry.enabled === false ? true : false;
        entry.enabled = nextEnabled;
        try {
            await this.docManager.upsertMemoEmbedding(entry);
            await this.refreshMemoContextAttachments();
            await this.refreshDocumentStats();
            window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
        } catch (err) {
            console.warn("Failed to toggle memo attachment", err);
        }
    };

    AssistSidebar.prototype.handleRemoveMemoContextAttachment = async function (entry) {
        if (!entry || !this.docManager) return;
        var docId = entry.docId || entry.id;
        if (docId && typeof docId === "string" && docId.indexOf(":") !== -1) {
            docId = docId.split(":").pop();
        }
        try {
            var memoId = this.getActiveMemoId();
            if (memoId) {
                await this.docManager.deleteMemoEmbeddingLinkAndCleanup(memoId, docId);
            }
            await this.refreshMemoContextAttachments();
            await this.refreshDocumentStats();
            if (memoId) {
                window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
            }
        } catch (err) {
            console.warn("Failed to delete memo embedding", err);
        }
    };

    AssistSidebar.prototype.updateAttachmentIndicator = function () {
        if (!this.docsIndicatorButton) return;
        if (this.mediaTranscriptionActive && this.mediaTotalCount > 0) {
            this.docsIndicatorButton.hidden = false;
            this.docsIndicatorButton.style.display = "";
            this.docsIndicatorButton.classList.add("visible");
            if (this.docsIndicatorLabelEl) {
                var uploadedTotal = this.mediaUploadCount || 0;
                this.docsIndicatorLabelEl.textContent = "♫ " + this.mediaTranscribedCount + "/" + uploadedTotal + " fichiers";
            }
            if (this.docsIndicatorDeleteEl) {
                this.docsIndicatorDeleteEl.style.display = "none";
            }
            return;
        }
        if (this.attachmentsTotalCount <= 0) {
            this.docsIndicatorButton.hidden = true;
            this.docsIndicatorButton.style.display = "none";
            this.docsIndicatorButton.classList.remove("visible");
            if (this.docsIndicatorLabelEl) {
                this.docsIndicatorLabelEl.textContent = "";
            }
            if (this.docsIndicatorDeleteEl) {
                this.docsIndicatorDeleteEl.style.display = "none";
            }
            return;
        }
        var label = this.computeDocsIndicatorLabel();
        this.docsIndicatorButton.hidden = false;
        this.docsIndicatorButton.style.display = "";
        this.docsIndicatorButton.classList.add("visible");
        if (this.docsIndicatorLabelEl) {
            this.docsIndicatorLabelEl.textContent = label;
        }
        if (this.docsIndicatorDeleteEl) {
            this.docsIndicatorDeleteEl.style.display = "";
        }
    };

    AssistSidebar.prototype.getAttachmentSize = function (fileName) {
        if (!fileName) return 0;
        if (this.attachmentsFileSizes?.has(fileName)) {
            return Number(this.attachmentsFileSizes.get(fileName)) || 0;
        }
        if (this.mediaTranscriptFileSizes?.has(fileName)) {
            return Number(this.mediaTranscriptFileSizes.get(fileName)) || 0;
        }
        return 0;
    };

    AssistSidebar.prototype.markAttachmentCompleted = function (fileName) {
        if (!fileName) return;
        if (this.attachmentsCompletedFiles?.has(fileName)) return;
        this.attachmentsCompletedFiles.add(fileName);
        this.attachmentsCompletedCount += 1;
        this.attachmentsCompletedSize += this.getAttachmentSize(fileName);
        this.updateAttachmentIndicator();
    };

    AssistSidebar.prototype.markAttachmentFailed = function (fileName) {
        if (!fileName) return;
        if (this.attachmentsFailedFiles?.has(fileName)) return;
        this.attachmentsFailedFiles.add(fileName);
        var size = this.getAttachmentSize(fileName);
        if (size > 0) {
            this.attachmentsTotalSize = Math.max(0, (this.attachmentsTotalSize || 0) - size);
        }
        if (this.attachmentsTotalCount > 0) {
            this.attachmentsTotalCount = Math.max(0, this.attachmentsTotalCount - 1);
        }
        this.updateAttachmentIndicator();
    };

    AssistSidebar.prototype.computeDocsIndicatorLabel = function () {
        var completed = Number(this.attachmentsCompletedCount) || 0;
        var total = Number(this.attachmentsTotalCount) || 0;
        var completedSize = Number(this.attachmentsCompletedSize) || 0;
        var totalSize = Number(this.attachmentsTotalSize) || 0;
        var pendingCount = Array.isArray(this.pendingDocumentAttachments)
            ? this.pendingDocumentAttachments.filter(function (name) {
                return name && !this.pendingExcludedAttachments?.has?.(name);
            }.bind(this)).length
            : 0;

        // During import: show overall percent only
        if (total > 0) {
            var percent = 0;
            if (totalSize > 0) {
                percent = Math.round((completedSize / totalSize) * 100);
            } else if (completed >= total) {
                percent = 100;
            }
            var ingested = Math.min(completed, total);
            return "🗎 " + ingested + "/" + total + " | " + percent + " %";
        }

        // After import complete (total === 0, but pendingCount > 0)
        if (pendingCount === 1) {
            // Single file: show filename
            return truncateIndicatorFilename(this.pendingDocumentAttachments[0]);
        }
        if (pendingCount > 1) {
            // Multiple files: show count
            return "🗎 " + pendingCount + " fichiers";
        }

        return "";
    };

    AssistSidebar.prototype.setSendButtonBusy = function (isBusy) {
        if (!this.sendButton) return;
        if (isBusy) {
            this.sendButton.disabled = true;
            this.sendButton.innerHTML = `<i data-lucide="loader-2" class="lucide-spin" style="width:16px;height:16px;"></i>`;
            if (window.lucide) window.lucide.createIcons();
            return;
        }
        this.sendButton.innerHTML = this.sendButtonBaseLabel || `<i data-lucide="send" style="width:16px;height:16px;"></i>`;
        this.updateComposerState();
        if (window.lucide) window.lucide.createIcons();
    };

    AssistSidebar.prototype.setTranscriptionUiState = function (active) {
        this.mediaTranscriptionActive = Boolean(active);
        if (!active) {
            this.mediaUploadCount = 0;
            this.mediaTranscribedCount = 0;
            this.mediaTotalCount = 0;
        }
        this.setSendButtonBusy(Boolean(active));
    };

    AssistSidebar.prototype.handleDocumentFilesSelected = function (event) {
        var files = event.target.files;
        if (!files || !files.length) return;
        this.startDocumentIngestion(files);
        event.target.value = "";
    };

    AssistSidebar.prototype.startDocumentIngestion = async function (files) {
        if (!this.docManager) {
            this.setDocumentUploadStatus("Gestion des documents indisponible.");
            return;
        }
        this.setSendButtonBusy(true);
        var fileArray = Array.from(files);
        if (!fileArray.length) return;
        var originalFiles = fileArray.slice();
        this.attachmentsIngestionStart = Date.now();
        this.attachmentsIngestionEnd = 0;
        this.attachmentsTotalSize = originalFiles.reduce(function (acc, file) {
            return acc + (Number(file?.size) || 0);
        }, 0);
        if (this.documentsFileInput) this.documentsFileInput.disabled = true;
        this.attachmentsTotalCount = originalFiles.length;
        this.attachmentsCompletedCount = 0;
        this.attachmentsCompletedSize = 0;
        this.attachmentsCompletedFiles = new Set();
        this.attachmentsFailedFiles = new Set();
        this.attachmentsFileSizes = new Map();
        this.mediaTranscriptFileSizes = new Map();
        originalFiles.forEach(function (file) {
            if (file?.name) {
                this.attachmentsFileSizes.set(file.name, Number(file.size) || 0);
            }
        }, this);
        var mediaTranscriptMap = new Map();
        var mediaIngestResults = [];
        var hadMediaTranscription = false;
        var mediaFiles = fileArray.filter(function (file) {
            return isMediaFile(file);
        });
        var docFiles = fileArray.filter(function (file) {
            return !isMediaFile(file);
        });
        if (mediaFiles.length) {
            hadMediaTranscription = true;
            this.setTranscriptionUiState(true);
            this.setDocumentUploadStatus("Transcription audio/vidéo en cours…");
            try {
                var transcriptResult = await this.prepareMediaTranscripts(mediaFiles, {
                    concurrency: 2,
                    onTranscript: async function (entry) {
                        if (entry?.file?.name && entry?.sourceFile) {
                            mediaTranscriptMap.set(entry.file.name, entry.sourceFile);
                        }
                        var metadata = new Map();
                        var displayName = String(entry?.sourceFile?.name || "").replace(/\.[^/.]+$/, "") + " (transcription)";
                        metadata.set(entry.file.name, {
                            scope: "attachments",
                            name: displayName || entry.file.name,
                            abstract: "Transcription importée"
                        });
                        var memoId = this.getActiveMemoId();
                        var tabId = memoId || null;
                        var results = await this.docManager.ingestFiles([entry.file], this.conversation.id, {
                            onProgress: this.handleDocumentProgress.bind(this),
                            sourceType: "context",
                            metadata: metadata,
                            memoId: memoId,
                            tabId: tabId
                        });
                        mediaIngestResults.push.apply(mediaIngestResults, results);
                    }.bind(this)
                });
                if (transcriptResult.errors && transcriptResult.errors.length) {
                    var firstError = transcriptResult.errors[0];
                    this.setDocumentUploadStatus("Erreur : " + (firstError.error || "transcription échouée"));
                }
                fileArray = docFiles;
            } catch (err) {
                this.setDocumentUploadStatus("Erreur : " + ((err && err.message) || "transcription échouée"));
            }
        }
        if (!fileArray.length && !mediaIngestResults.length) {
            this.attachmentsIngestionEnd = Date.now();
            this.setPendingDocumentAttachments([]);
            if (this.documentsFileInput) this.documentsFileInput.disabled = false;
            return;
        }
        this.attachmentsParsedCount = 0;
        this.attachmentsCharsTotal = 0;
        this.attachmentsCharsProcessed = 0;
        this.attachmentsCharsByFile = {};
        this.attachmentsCharsProcessedByFile = {};
        this.attachmentsExtractProgressByFile = {};
        this.attachmentsEmbedProgressByFile = {};
        this.attachmentsChunkTotalsByFile = {};
        this.attachmentsChunkExtByFile = {};
        var existingPending = Array.isArray(this.pendingDocumentAttachments)
            ? this.pendingDocumentAttachments.slice()
            : [];
        var incomingNames = fileArray.map(function (file) {
            return file.name;
        });
        this.pendingDocumentAttachments = Array.from(new Set(existingPending.concat(incomingNames)));
        fileArray.forEach(function (file) {
            var name = file?.name || "";
            if (!name) return;
            this.attachmentsChunkExtByFile[name] = getFileExtension(name);
        }, this);
        this.updateAttachmentIndicator();
        this.renderPendingDocumentAttachments();
        this.updateComposerState();
        this.setDocumentUploadStatus("Indexation en cours…");
        var memoId = this.getActiveMemoId();
        var tabId = memoId || null;
        try {
            var results = [];
            if (fileArray.length) {
                var metadata = new Map();
                fileArray.forEach(function (file) {
                    var sourceFile = mediaTranscriptMap.get(file.name);
                    var displayName = file.name;
                    var abstract = "Pièce jointe";
                    if (sourceFile) {
                        displayName = String(sourceFile.name || "").replace(/\.[^/.]+$/, "") + " (transcription)";
                        abstract = "Transcription importée";
                    }
                    metadata.set(file.name, {
                        scope: "attachments",
                        name: displayName || file.name,
                        abstract: abstract
                    });
                });
                results = await this.docManager.ingestFiles(fileArray, this.conversation.id, {
                    onProgress: this.handleDocumentProgress.bind(this),
                    sourceType: "context",
                    metadata: metadata,
                    memoId: memoId,
                    tabId: tabId
                });
            }
            if (mediaIngestResults.length) {
                results = mediaIngestResults.concat(results);
            }
            console.log("Document ingestion results:", results);
            var errors = results.filter(function (item) {
                return !item.success && !item.duplicate;
            });
            var duplicates = results.filter(function (item) {
                return item.duplicate;
            });
            if (errors.length) {
                console.error("Document ingestion errors:", errors);
                errors.forEach(function (entry) {
                    if (entry?.name) {
                        this.markAttachmentFailed(entry.name);
                        if (window.GoToolkitMemoToast) {
                            window.GoToolkitMemoToast("Import échoué : " + entry.name, true);
                        }
                    }
                }, this);
                this.attachmentsIngestionEnd = Date.now();
                this.setDocumentUploadStatus("Erreur : " + (errors[0].error || "échec d'indexation"));
            } else if (duplicates.length) {
                var dupNames = duplicates.map(function (item) { return item.name; }).filter(Boolean);
                this.attachmentsIngestionEnd = Date.now();
                this.setDocumentUploadStatus("Doublon ignoré : " + (dupNames.join(", ") || "fichier"));
            } else {
                this.attachmentsIngestionEnd = Date.now();
                this.setDocumentUploadStatus("Indexation terminée.");
            }
            var readyDocs = results
                .filter(function (item) {
                    return item && (item.success || item.duplicate);
                })
                .map(function (item) {
                    return item.name;
                })
                .filter(Boolean);
            console.log("Ready docs to display:", readyDocs);
            try {
                document.dispatchEvent(new CustomEvent("goToolkitDocumentsDbStatus", {
                    detail: { status: "ready" }
                }));
            } catch (err) {
                // ignore
            }
            var mergedReadyDocs = Array.from(new Set((this.pendingDocumentAttachments || []).concat(readyDocs)));
            this.setPendingDocumentAttachments(mergedReadyDocs, { preserveExcluded: true });
            if (memoId) {
                if (readyDocs.length) {
                    this.markMemoAttachmentsPending(memoId);
                    this.confirmMemoAttachments(memoId);
                }
                await this.refreshMemoContextAttachments();
                window.GoToolkitMemoSyncContextEmbeddings?.(memoId);
            }
            if (!errors.length) {
                this.clearAttachmentProgress();
            }
        } catch (error) {
            console.error("Document ingestion exception:", error);
            this.attachmentsIngestionEnd = Date.now();
            this.setDocumentUploadStatus("Erreur : " + ((error && error.message) || "échec"));
            this.setPendingDocumentAttachments([]);
        } finally {
            if (hadMediaTranscription) {
                this.setTranscriptionUiState(false);
            }
            if (this.documentsFileInput) this.documentsFileInput.disabled = false;
            this.setSendButtonBusy(false);
        }
    };

    AssistSidebar.prototype.handleDocumentProgress = function (progress) {
        if (!progress) return;
        if (progress.type === "file-skip") {
            if (progress.file) {
                this.markAttachmentCompleted(progress.file);
            }
        } else if (progress.type === "file-done") {
            // Increment parsed count when a file is done
            this.attachmentsParsedCount = Math.min(
                Number(this.attachmentsParsedCount) + 1 || 1,
                Number(this.attachmentsTotalCount) || 1
            );
            if (progress.file) {
                if (!this.attachmentsExtractProgressByFile) this.attachmentsExtractProgressByFile = {};
                if (!this.attachmentsEmbedProgressByFile) this.attachmentsEmbedProgressByFile = {};
                this.attachmentsExtractProgressByFile[progress.file] = 100;
                this.attachmentsEmbedProgressByFile[progress.file] = 100;
                this.markAttachmentCompleted(progress.file);
            }
        }
    };
    AssistSidebar.prototype.updateDocumentIndicator = function (stats, docs, keywordSizes) {
        if (!this.docsIndicatorButton) return;
        var chunkCount = stats ? Number(stats.chunkCount) || 0 : 0;
        this.documentChunkCount = chunkCount;
        this.computeDocumentCounts(docs);
        this.updateHeaderDocumentCount();
        if (keywordSizes && typeof keywordSizes === "object") {
            this.keywordIndexSizes = {
                context: Number(keywordSizes.context) || 0,
                knowledge: Number(keywordSizes.knowledge) || 0
            };
        }
        this.syncDocumentIndicatorTitle(chunkCount);
        this.renderKnowledgeModalTitle();
    };

    AssistSidebar.prototype.computeDocumentCounts = function (docs) {
        var counts = { context: 0, gallery: 0 };
        (docs || []).forEach(function (doc) {
            var source = doc?.sourceType || "context";
            if (source === "embedded") {
                return;
            }
            if (source === "gallery") {
                counts.gallery += 1;
                return;
            }
            counts.context += 1;
        });
        this.documentCounts = counts;
        return counts;
    };

    AssistSidebar.prototype.getMemoireDocumentCount = function () {
        var entries = Array.isArray(this.knowledgeManifestEntries) ? this.knowledgeManifestEntries : [];
        var seen = new Set();
        var count = 0;
        if (this.knowledgeModalSelectionSet instanceof Set) {
            return this.knowledgeModalSelectionSet.size;
        }
        entries.forEach(function (entry) {
            var source = (entry?.source || "").toString();
            if (source !== "Local" && source !== "Web") {
                return;
            }
            var key = this.normalizeKnowledgeKey(entry.fileName || entry.name);
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            count += 1;
        }.bind(this));
        if (count) {
            return count;
        }
        var fallback = Number.isFinite(this.knowledgeDocumentCount) ? this.knowledgeDocumentCount : 0;
        return fallback;
    };

    AssistSidebar.prototype.updateHeaderDocumentCount = function () {
        if (!this.headerDocCountEl) return;
        var showMemoireButton = this.promptPresetId !== "ask";
        this.headerDocCountEl.style.display = showMemoireButton ? "" : "none";
        var count = this.getMemoireDocumentCount();
        this.headerDocCountEl.dataset.count = count;
        if (count > 0) {
            this.headerDocCountEl.innerHTML = '<i data-lucide="brain"></i><span class="chat-header-badge">' + count + '</span>';
        } else {
            this.headerDocCountEl.innerHTML = '<i data-lucide="brain"></i>';
        }
        if (window.lucide) window.lucide.createIcons();
    };

    AssistSidebar.prototype.getVersionParam = function () {
        try {
            const params = new URLSearchParams(window.location.search || "");
            return params.get("v") || "v";
        } catch (err) {
            return "v";
        }
    };

    AssistSidebar.prototype.getFileNameFromPath = function (path) {
        if (!path) return "";
        var parts = path.split("/");
        return parts[parts.length - 1] || path;
    };

    AssistSidebar.prototype.parseUpdatedAt = function (value) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string" && value.trim()) {
            var numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
            var date = Date.parse(value);
            if (Number.isFinite(date)) return date;
        }
        return 0;
    };

    AssistSidebar.prototype.normalizeKnowledgeKey = function (value) {
        return (value || "").toString().trim().toLowerCase();
    };

    AssistSidebar.prototype.deduplicateKnowledgeWebEntries = function (entries) {
        if (!Array.isArray(entries) || !entries.length) return [];
        var seen = new Set();
        var result = [];
        entries.forEach(function (entry) {
            if (!entry) return;
            var pathKey = this.normalizeKnowledgeKey(entry.path || "");
            if (!pathKey || seen.has(pathKey)) return;
            seen.add(pathKey);
            result.push(entry);
        }.bind(this));
        return result;
    };

    AssistSidebar.prototype.formatFriendlyDate = function (value) {
        var ts = Number(value) || 0;
        if (!ts) return "—";
        try {
            var date = new Date(ts);
            return date.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        } catch (err) {
            return "—";
        }
    };

    AssistSidebar.prototype.formatKnowledgeRelativeDate = function (value) {
        var ts = this.parseUpdatedAt(value);
        if (!ts) return "—";
        var deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (deltaSeconds < 60) {
            return "à l'instant";
        }
        var deltaMinutes = Math.floor(deltaSeconds / 60);
        if (deltaMinutes < 60) {
            return deltaMinutes + " mn";
        }
        var deltaHours = Math.floor(deltaMinutes / 60);
        if (deltaHours < 24) {
            return deltaHours + " h";
        }
        var deltaDays = Math.floor(deltaHours / 24);
        return deltaDays + " j";
    };

    AssistSidebar.prototype.truncateKnowledgeName = function (name) {
        var text = (name || "").toString();
        var maxLength = 32;
        var ellipsis = "...";
        if (text.length <= maxLength) {
            return text;
        }
        return text.slice(0, maxLength - ellipsis.length) + ellipsis;
    };

    AssistSidebar.prototype.hasAttachmentScope = function (doc) {
        if (!doc) return false;
        var scope = doc.scope;
        if (Array.isArray(scope)) {
            return scope.some(function (value) {
                return (value || "").toString().trim().toLowerCase() === "attachments";
            });
        }
        if (typeof scope === "string") {
            return scope.trim().toLowerCase() === "attachments";
        }
        return false;
    };

    AssistSidebar.prototype.hasMemoScope = function (doc) {
        if (!doc) return false;
        var scope = doc.scope;
        if (Array.isArray(scope)) {
            return scope.some(function (value) {
                return (value || "").toString().trim().toLowerCase() === "memo";
            });
        }
        if (typeof scope === "string") {
            return scope.trim().toLowerCase() === "memo";
        }
        return false;
    };

    AssistSidebar.prototype.isMemoDocument = function (doc) {
        if (!doc) return false;
        if (this.hasMemoScope(doc)) return true;
        var name = (doc.sourceFileName || doc.name || "").toString().trim().toLowerCase();
        return name.startsWith("memo-");
    };

    AssistSidebar.prototype.compareKnowledgeEntries = function (a, b, sortConfig) {
        var column = (sortConfig && sortConfig.column) || "updatedAt";
        var direction = sortConfig && sortConfig.direction === "asc" ? 1 : -1;
        var cmp = 0;
        var options = { sensitivity: "base" };
        if (column === "name") {
            var aName = (a?.name || "").toString();
            var bName = (b?.name || "").toString();
            cmp = aName.localeCompare(bName, "fr", options);
        } else if (column === "source") {
            var aSource = (a?.source || "").toString();
            var bSource = (b?.source || "").toString();
            cmp = aSource.localeCompare(bSource, "fr", options);
        } else {
            var aTs = this.parseUpdatedAt(a?.updatedAt);
            var bTs = this.parseUpdatedAt(b?.updatedAt);
            if (aTs !== bTs) {
                cmp = aTs < bTs ? -1 : 1;
            }
        }
        if (!cmp) {
            var fallbackA = (a?.name || "").toString();
            var fallbackB = (b?.name || "").toString();
            cmp = fallbackA.localeCompare(fallbackB, "fr", options);
        }
        return cmp * direction;
    };

    AssistSidebar.prototype.truncateKnowledgeAbstract = function (value) {
        var text = (value || "").toString();
        var maxLength = 120;
        var ellipsis = "...";
        if (text.length <= maxLength) {
            return text;
        }
        return text.slice(0, maxLength - ellipsis.length) + ellipsis;
    };

    AssistSidebar.prototype.stripHtmlText = function (value) {
        if (typeof value !== "string") return "";
        if (!value) return "";
        var container = document.createElement("div");
        container.innerHTML = value;
        var text = container.textContent || "";
        return text.replace(/\r\n/g, "\n");
    };

    AssistSidebar.prototype.getFirstNonEmptyLine = function (value) {
        var lines = (value || "").toString().split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = (lines[i] || "").trim();
            if (line) return line;
        }
        return "";
    };

    AssistSidebar.prototype.normalizeDocumentText = function (value) {
        return (value || "")
            .replace(/\s+\n/g, "\n")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    };

    AssistSidebar.prototype.chunkDocumentText = function (text, size, overlap) {
        var chunks = [];
        var i = 0;
        var maxSize = Number(size) || 900;
        var maxOverlap = Number(overlap) || 120;
        while (i < text.length) {
            var end = Math.min(text.length, i + maxSize);
            chunks.push(text.slice(i, end));
            if (end === text.length) break;
            i = Math.max(0, end - maxOverlap);
        }
        return chunks;
    };

    AssistSidebar.prototype.cleanExcerptLine = function (value) {
        var line = (value || "").toString();
        line = line.replace(/<[^>]*>/g, " ");
        line = line.replace(/^#{1,6}\s+/g, "");
        line = line.replace(/^\s*>+\s?/g, "");
        line = line.replace(/^\s*[-*+]\s+/g, "");
        line = line.replace(/^\s*\d+\.\s+/g, "");
        line = line.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
        line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        line = line.replace(/`+/g, "");
        line = line.replace(/\s+/g, " ").trim();
        return line;
    };

    AssistSidebar.prototype.extractFirstChunkLine = function (chunkText) {
        if (typeof chunkText !== "string" || !chunkText.trim()) return "";
        var lines = chunkText.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var cleaned = this.cleanExcerptLine(lines[i]);
            if (cleaned) {
                return cleaned.slice(0, 150);
            }
        }
        var fallback = this.cleanExcerptLine(chunkText);
        return fallback.slice(0, 150);
    };

    AssistSidebar.prototype.deriveAbstractFromFile = async function (file) {
        if (!file || !this.docManager) return "";
        try {
            var extraction = await this.docManager.extractText(file);
            var text = typeof extraction?.text === "string" ? extraction.text : "";
            var normalized = this.normalizeDocumentText(text);
            if (!normalized) return "";
            var chunkConfig = this.docManager.getChunkConfigForText(normalized);
            var chunks = this.chunkDocumentText(normalized, chunkConfig.chunkSize, chunkConfig.chunkOverlap);
            var firstChunk = chunks.length ? chunks[0] : normalized;
            return this.extractFirstChunkLine(firstChunk);
        } catch (err) {
            console.warn("First chunk extract failed", err);
            return "";
        }
    };

    AssistSidebar.prototype.loadKnowledgeLocalDocsCache = async function () {
        if (!this.knowledgeLocalDocsStore?.read) return {};
        var cached = await this.knowledgeLocalDocsStore.read();
        return cached && typeof cached === "object" ? cached : {};
    };

    AssistSidebar.prototype.saveKnowledgeLocalDocsCache = async function (records) {
        if (!this.knowledgeLocalDocsStore?.write) return;
        await this.knowledgeLocalDocsStore.write(records || {});
    };

    AssistSidebar.prototype.getMemoLibraryFileName = function (id) {
        var raw = (id || "").toString().trim();
        if (!raw) return "";
        return "memo-" + raw + ".txt";
    };

    AssistSidebar.prototype.loadMemoLibraryEntries = async function () {
        var records = [];
        try {
            if (global.goToolkitDocumentApi?.getAllRecords) {
                records = await global.goToolkitDocumentApi.getAllRecords();
            } else if (global.goToolkitDocStore?.createStore) {
                var store = global.goToolkitDocStore.createStore("document-api");
                var entries = await store.getAll();
                if (Array.isArray(entries)) {
                    records = entries;
                } else if (entries && typeof entries === "object") {
                    records = Object.values(entries);
                }
            }
        } catch (err) {
            console.warn("Memo library load failed", err);
        }
        if (!Array.isArray(records) || !records.length) return [];
        var entries = [];
        records.forEach(function (record) {
            if (!record || record.app !== "memo") return;
            var fileName = this.getMemoLibraryFileName(record.id || record.uuid || "");
            if (!fileName) return;
            var payload = record.payload;
            var tab = null;
            if (payload && Array.isArray(payload.tabs) && payload.tabs[0]) {
                tab = payload.tabs[0];
            } else if (typeof payload === "string") {
                tab = { title: record.title || "Docs", content: payload };
            }
            if (!tab) return;
            var title = (typeof tab.title === "string" && tab.title.trim())
                ? tab.title.trim()
                : (record.title || "Docs");
            var rawHtml = typeof tab.content === "string" ? tab.content : "";
            var plainText = this.stripHtmlText(rawHtml);
            var abstract = this.getFirstNonEmptyLine(plainText);
            entries.push({
                path: "",
                name: title,
                abstract: abstract,
                updatedAt: this.parseUpdatedAt(record.updatedAt),
                fileName: fileName,
                source: "Mémo",
                memoHtml: rawHtml,
                memoText: plainText
            });
        }.bind(this));
        return entries;
    };

    AssistSidebar.prototype.fetchContentManifest = function () {
        try {
            const url = new URL("content/files.json", window.location.href);
            url.searchParams.set("v", this.getVersionParam());
            return fetch(url.toString(), { cache: "no-cache" })
                .then(function (response) {
                    if (!response.ok) {
                        console.warn("Failed to fetch files.json", response.status);
                        return [];
                    }
                    return response.json();
                })
                .catch(function (err) {
                    console.error("files.json fetch error", err);
                    return [];
                });
        } catch (err) {
            console.error("files.json manifest URL error", err);
            return Promise.resolve([]);
        }
    };

    AssistSidebar.prototype.loadKnowledgeManifest = async function () {
        var manifest = await this.fetchContentManifest();
        var entries = Array.isArray(manifest) ? manifest : [];
        if (!entries.length && this.knowledgeManifestCacheStore?.read) {
            try {
                var cached = await this.knowledgeManifestCacheStore.read();
                if (Array.isArray(cached) && cached.length) {
                    return this.applyKnowledgeOverrides(this.deduplicateKnowledgeWebEntries(cached));
                }
            } catch (err) {
                console.warn("Knowledge manifest cache read failed", err);
            }
        }
        if (!entries.length) {
            return [];
        }
        var normalized = entries
            .map(function (entry) {
                var path = entry?.path || "";
                var fileName = (entry?.fileName || this.getFileNameFromPath(path)).trim();
                return {
                    path: path,
                    name: (entry?.name || fileName).trim(),
                    abstract: entry?.abstract || "",
                    updatedAt: this.parseUpdatedAt(entry?.updatedAt),
                    fileName: fileName,
                    source: "Web"
                };
            }.bind(this))
            .filter(function (entry) {
                return entry.path && entry.fileName && entry.name;
            });
        var deduped = this.deduplicateKnowledgeWebEntries(normalized);
        if (this.knowledgeManifestCacheStore?.write) {
            try {
                await this.knowledgeManifestCacheStore.write(deduped);
            } catch (err) {
                console.warn("Knowledge manifest cache write failed", err);
            }
        }
        return this.applyKnowledgeOverrides(deduped);
    };

    AssistSidebar.prototype.fetchCurrentManifest = async function () {
        try {
            const url = new URL("content/files.json", window.location.href);
            url.searchParams.set("v", this.getVersionParam());
            const response = await fetch(url.toString(), { cache: "no-cache" });
            if (!response.ok) {
                console.warn("Current manifest fetch failed", response.status);
                return [];
            }
            const manifest = await response.json();
            if (!Array.isArray(manifest)) return [];
            var entries = manifest
                .map(function (entry) {
                    var path = entry?.path || "";
                    var fileName = (entry?.fileName || this.getFileNameFromPath(path)).trim();
                    return {
                        path: path,
                        name: (entry?.name || fileName).trim(),
                        abstract: entry?.abstract || "",
                        updatedAt: this.parseUpdatedAt(entry?.updatedAt),
                        fileName: fileName,
                        source: "Web"
                    };
                }.bind(this))
                .filter(function (entry) {
                    return entry.path && entry.fileName && entry.name;
                });
            return this.applyKnowledgeOverrides(this.deduplicateKnowledgeWebEntries(entries));
        } catch (err) {
            console.error("Current manifest error", err);
            return [];
        }
    };

    AssistSidebar.prototype.cacheKnowledgeDocumentNames = function (entries) {
        this.knowledgeDocumentNames = (Array.isArray(entries) ? entries : [])
            .map(function (entry) {
                return (entry?.name || "").toString().trim();
            })
            .filter(Boolean);
        this.updateHeaderDocTooltip();
    };

    AssistSidebar.prototype.updateHeaderDocTooltip = function () {
        if (!this.headerDocCountEl) return;
        if (!this.knowledgeDocumentNames || !this.knowledgeDocumentNames.length) {
            this.headerDocCountEl.setAttribute("title", this.headerDocCountTooltipDefault);
            return;
        }
        this.headerDocCountEl.setAttribute("title", this.knowledgeDocumentNames.join("\n"));
    };

    AssistSidebar.prototype.applyKnowledgeOverrides = async function (entries) {
        if (!this.knowledgeOverridesStore?.read) return entries || [];
        var overrides = await this.knowledgeOverridesStore.read();
        var descOverrides = this.knowledgeDescriptionOverridesStore?.read
            ? await this.knowledgeDescriptionOverridesStore.read()
            : null;
        overrides = overrides && typeof overrides === "object" ? overrides : {};
        descOverrides = descOverrides && typeof descOverrides === "object" ? descOverrides : {};
        return (entries || []).map(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            var override = key ? overrides[key] : null;
            var hasDescOverride = key && Object.prototype.hasOwnProperty.call(descOverrides, key);
            var descOverride = hasDescOverride ? descOverrides[key] : null;
            var nextName = entry.name;
            if (override && typeof override === "object" && typeof override.name === "string" && override.name.trim()) {
                nextName = override.name.trim();
            }
            var nextAbstract = entry.abstract;
            if (hasDescOverride) {
                nextAbstract = typeof descOverride === "string" ? descOverride : "";
            } else if (override && typeof override === "object" && typeof override.abstract === "string") {
                nextAbstract = override.abstract;
            }
            return Object.assign({}, entry, {
                name: nextName,
                abstract: nextAbstract
            });
        }.bind(this));
    };

    AssistSidebar.prototype.buildKnowledgeModal = function () {
        if (this.knowledgeModal) return;
        var modal = document.createElement("div");
        modal.className = "chat-knowledge-modal";
        modal.setAttribute("aria-hidden", "true");

        var header = document.createElement("div");
        header.className = "chat-knowledge-modal__header";
        var left = document.createElement("div");
        left.className = "chat-knowledge-modal__header-left";
        var title = document.createElement("div");
        title.className = "chat-knowledge-modal__title";
        title.innerHTML = '<i data-lucide="brain"></i> | 0 fichiers';
        left.appendChild(title);
        var actions = document.createElement("div");
        actions.className = "chat-knowledge-modal__header-actions";
        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "chat-knowledge-modal__add";
        addBtn.textContent = "+ Ajouter";
        addBtn.addEventListener("click", this.openKnowledgeFilePicker.bind(this));
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "chat-knowledge-modal__close";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", this.closeKnowledgeModal.bind(this));
        actions.appendChild(addBtn);
        actions.appendChild(closeBtn);
        var resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "chat-knowledge-modal__reset";
        resetBtn.textContent = "↺ Réinitialiser";
        resetBtn.addEventListener("click", this.handleKnowledgeResetClick.bind(this));
        actions.appendChild(addBtn);
        actions.appendChild(resetBtn);
        actions.appendChild(closeBtn);
        header.appendChild(left);
        header.appendChild(actions);

        var list = document.createElement("div");
        list.className = "chat-knowledge-modal__list";

        modal.appendChild(header);
        modal.appendChild(list);
        document.body.appendChild(modal);

        this.knowledgeModal = modal;
        this.knowledgeModalHeader = header;
        this.knowledgeModalListEl = list;
        this.knowledgeModalTitleEl = title;
        this.knowledgeModalCloseBtn = closeBtn;
        this.knowledgeModalAddBtn = addBtn;
        this.buildKnowledgeFilePicker();
        this.buildKnowledgeEditModal();
        this.renderKnowledgeModalTitle();
    };

    AssistSidebar.prototype.renderKnowledgeModalTitle = function () {
        if (!this.knowledgeModalTitleEl) return;
        if (this.knowledgeIndexing && this.knowledgeModalIndexingProgress) {
            var processed = Number(this.knowledgeModalIndexingProgress.processed) || 0;
            var total = Number(this.knowledgeModalIndexingProgress.total) || 0;
            this.knowledgeModalTitleEl.textContent = "🗎 Indexation en cours " + processed + " / " + total;
            return;
        }
        if (this.knowledgeModalStatusMessage) {
            this.knowledgeModalTitleEl.textContent = this.knowledgeModalStatusMessage;
            return;
        }
        var count = this.getMemoireDocumentCount();
        var suffix = count === 1 ? "fichier" : "fichiers";
        this.knowledgeModalTitleEl.innerHTML = '<i data-lucide="brain"></i> | ' + count + " " + suffix;
        if (window.lucide) window.lucide.createIcons();
    };

    AssistSidebar.prototype.setKnowledgeModalStatus = function (message, isError, autoClearMs) {
        if (this.knowledgeModalStatusTimer) {
            clearTimeout(this.knowledgeModalStatusTimer);
            this.knowledgeModalStatusTimer = null;
        }
        this.knowledgeModalStatusMessage = message || "";
        this.knowledgeModalStatusIsError = Boolean(isError);
        if (this.knowledgeModalTitleEl) {
            this.knowledgeModalTitleEl.dataset.status = this.knowledgeModalStatusIsError ? "error" : "";
        }
        this.renderKnowledgeModalTitle();
        if (autoClearMs && autoClearMs > 0) {
            this.knowledgeModalStatusTimer = setTimeout(function () {
                this.setKnowledgeModalStatus("", false);
            }.bind(this), autoClearMs);
        }
    };

    AssistSidebar.prototype.handleKnowledgeResetClick = function () {
        this.resetKnowledgeIndex();
    };

    AssistSidebar.prototype.resetKnowledgeIndex = async function () {
        if (this.knowledgeIndexing) return;
        this.setKnowledgeModalStatus("Réindexation complète…");
        try {
            await this.refreshKnowledgeModal({ skipAutoReindex: true });
            var entries = Array.isArray(this.knowledgeManifestEntries) ? this.knowledgeManifestEntries : [];
            var selectionSet = new Set(this.knowledgeModalSelectionSet || []);
            if (!selectionSet.size) {
                this.setKnowledgeModalStatus("");
                return;
            }
            this.renderKnowledgeModalList(entries, selectionSet);
            await this.reindexKnowledgeSelection(entries, selectionSet);
            this.renderKnowledgeModalList(entries, selectionSet);
        } catch (err) {
            console.warn("Knowledge reset failed", err);
            this.setKnowledgeModalStatus("Réindexation échouée.", true);
        }
    };

    AssistSidebar.prototype.buildKnowledgeFilePicker = function () {
        if (this.knowledgeModalFileInput) return;
        var input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = this.getFileImportAcceptString();
        input.style.display = "none";
        input.addEventListener("change", this.handleKnowledgeFilesSelected.bind(this));
        document.body.appendChild(input);
        this.knowledgeModalFileInput = input;
    };

    AssistSidebar.prototype.openKnowledgeFilePicker = function () {
        if (this.knowledgeModalFileInput) {
            this.knowledgeModalFileInput.click();
        }
    };

    AssistSidebar.prototype.handleKnowledgeFilesSelected = function (event) {
        var files = event?.target?.files;
        if (!files || !files.length) return;
        this.ingestKnowledgeFiles(files);
        event.target.value = "";
    };

    AssistSidebar.prototype.getFileSizeLimit = function (fileName) {
        try {
            var config = globalConfig || {};
            var fileSizeLimits = config.fileImport?.fileSizeLimits || {};
            var fileExt = (fileName || "").toLowerCase();
            var lastDotIndex = fileExt.lastIndexOf(".");
            if (lastDotIndex < 0) {
                return null;
            }
            var ext = fileExt.substring(lastDotIndex);
            for (var typeKey in fileSizeLimits) {
                var typeLimit = fileSizeLimits[typeKey];
                if (!typeLimit || !Array.isArray(typeLimit.extensions)) continue;
                if (typeLimit.extensions.includes(ext)) {
                    return typeLimit;
                }
            }
        } catch (err) {
            console.warn("Error getting file size limit:", err);
        }
        return null;
    };

    AssistSidebar.prototype.validateFileSizes = function (files) {
        var fileArray = Array.from(files);
        var errors = [];
        var allowOverLimitEmbeddings = Boolean(globalConfig?.fileImport?.allowOverLimitEmbeddings);
        for (var i = 0; i < fileArray.length; i++) {
            var file = fileArray[i];
            var limit = this.getFileSizeLimit(file.name);
            if (limit && limit.maxMB) {
                var maxBytes = limit.maxMB * 1048576;
                if (file.size > maxBytes) {
                    var sizeMB = (file.size / 1048576).toFixed(2);
                    if (!allowOverLimitEmbeddings) {
                        errors.push(file.name + " (" + sizeMB + " MB) dépasse la limite de " + limit.maxMB + " MB.");
                    }
                }
            }
        }
        return errors;
    };

    AssistSidebar.prototype.ingestKnowledgeFiles = async function (files) {
        if (!this.docManager) return;
        var fileArray = Array.from(files);
        var sizeErrors = this.validateFileSizes(files);
        if (sizeErrors.length > 0) {
            var errorMsg = "Fichier(s) trop volumineux :\n" + sizeErrors.join("\n");
            this.setKnowledgeModalStatus(errorMsg, true);
            return;
        }
        if (!fileArray.length) return;
        this.setKnowledgeModalStatus("Importation en cours…");
        try {
            var localCache = await this.loadKnowledgeLocalDocsCache();
            var metadata = new Map();
            for (var i = 0; i < fileArray.length; i++) {
                var file = fileArray[i];
                var importedAt = Date.now();
                var derivedAbstract = await this.deriveAbstractFromFile(file);
                var buffer = null;
                try {
                    buffer = await file.arrayBuffer();
                } catch (err) {
                    buffer = null;
                }
                metadata.set(file.name, {
                    name: file.name,
                    abstract: derivedAbstract || "",
                    updatedAt: importedAt,
                    fileName: file.name,
                    scope: ["attachments", "local"]
                });
                var key = this.normalizeKnowledgeKey(file.name);
                if (key) {
                    localCache[key] = {
                        fileName: file.name,
                        name: file.name,
                        abstract: derivedAbstract || "",
                        updatedAt: importedAt,
                        mime: file.type || "",
                        buffer: buffer
                    };
                }
            }
            await this.docManager.ingestFiles(fileArray, this.knowledgeConversationId, {
                sourceType: "embedded",
                metadata: metadata
            });
            await this.saveKnowledgeLocalDocsCache(localCache);
            this.setKnowledgeModalStatus("");
            this.refreshDocumentStats();
            this.refreshKnowledgeModal();
        } catch (err) {
            console.warn("Knowledge import failed", err);
            this.setKnowledgeModalStatus("Importation échouée.", true);
        }
    };

    AssistSidebar.prototype.buildKnowledgeEditModal = function () {
        if (this.knowledgeEditOverlay) return;
        var overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.setAttribute("aria-hidden", "true");
        var modal = document.createElement("div");
        modal.className = "modal chat-knowledge-edit";
        var header = document.createElement("div");
        header.className = "modal-header";
        var title = document.createElement("h3");
        title.textContent = "Modifier le document";
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "modal-close";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", this.closeKnowledgeEditModal.bind(this));
        header.appendChild(title);
        header.appendChild(closeBtn);

        var nameLabel = document.createElement("label");
        nameLabel.textContent = "Nom";
        var nameInput = document.createElement("input");
        nameInput.type = "text";

        var abstractLabel = document.createElement("label");
        abstractLabel.textContent = "Description";
        var abstractInput = document.createElement("textarea");

        var actions = document.createElement("div");
        actions.className = "modal-actions";
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn-secondary";
        cancelBtn.textContent = "Annuler";
        cancelBtn.addEventListener("click", this.closeKnowledgeEditModal.bind(this));
        var saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn-primary";
        saveBtn.textContent = "Enregistrer";
        saveBtn.addEventListener("click", this.saveKnowledgeEdit.bind(this));
        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);

        modal.appendChild(header);
        modal.appendChild(nameLabel);
        modal.appendChild(nameInput);
        modal.appendChild(abstractLabel);
        modal.appendChild(abstractInput);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) {
                this.closeKnowledgeEditModal();
            }
        }.bind(this));
        document.body.appendChild(overlay);

        this.knowledgeEditOverlay = overlay;
        this.knowledgeEditNameInput = nameInput;
        this.knowledgeEditAbstractInput = abstractInput;
        this.knowledgeEditSaveBtn = saveBtn;
        this.knowledgeEditCloseBtn = closeBtn;
    };

    AssistSidebar.prototype.openKnowledgeEditModal = function (entry) {
        if (!entry) return;
        this.buildKnowledgeEditModal();
        if (!this.knowledgeEditOverlay) return;
        this.knowledgeEditTargetKey = this.normalizeKnowledgeKey(entry.fileName);
        this.knowledgeEditNameInput.value = entry.name || "";
        this.knowledgeEditAbstractInput.value = entry.abstract || "";
        this.knowledgeEditOverlay.classList.add("open");
        this.knowledgeEditOverlay.setAttribute("aria-hidden", "false");
        this.knowledgeEditNameInput.focus();
    };

    AssistSidebar.prototype.closeKnowledgeEditModal = function () {
        if (!this.knowledgeEditOverlay) return;
        this.knowledgeEditOverlay.classList.remove("open");
        this.knowledgeEditOverlay.setAttribute("aria-hidden", "true");
        this.knowledgeEditTargetKey = null;
    };

    AssistSidebar.prototype.saveKnowledgeEdit = async function () {
        var key = this.normalizeKnowledgeKey(this.knowledgeEditTargetKey || "");
        if (!key || !this.knowledgeOverridesStore?.read || !this.knowledgeOverridesStore?.write) {
            this.closeKnowledgeEditModal();
            return;
        }
        var name = (this.knowledgeEditNameInput?.value || "").trim();
        var abstract = (this.knowledgeEditAbstractInput?.value || "").trim();
        var overrides = await this.knowledgeOverridesStore.read();
        overrides = overrides && typeof overrides === "object" ? overrides : {};
        overrides[key] = { name: name, abstract: abstract };
        await this.knowledgeOverridesStore.write(overrides);
        if (this.knowledgeDescriptionOverridesStore?.read && this.knowledgeDescriptionOverridesStore?.write) {
            var descOverrides = await this.knowledgeDescriptionOverridesStore.read();
            descOverrides = descOverrides && typeof descOverrides === "object" ? descOverrides : {};
            descOverrides[key] = abstract;
            await this.knowledgeDescriptionOverridesStore.write(descOverrides);
        }
        if (this.docManager) {
            try {
                var docs = await this.docManager.getDocuments(this.knowledgeConversationId);
                var match = (docs || []).find(function (doc) {
                    var docKey = this.normalizeKnowledgeKey(doc?.sourceFileName || doc?.name || "");
                    return docKey === key;
                }.bind(this));
                if (match) {
                    var updatedDoc = Object.assign({}, match, {
                        name: name || match.name,
                        abstract: abstract || match.abstract
                    });
                    await this.docManager.putDocument(updatedDoc);
                }
            } catch (err) {
                console.warn("Knowledge edit update failed", err);
            }
        }
        this.closeKnowledgeEditModal();
        this.refreshKnowledgeModal();
        this.refreshDocumentStats();
    };

    AssistSidebar.prototype.openKnowledgeModal = function (persist, options) {
        if (options && Object.prototype.hasOwnProperty.call(options, "sourceFilter")) {
            var nextFilter = (options.sourceFilter || "").toString().trim();
            this.knowledgeModalSourceFilter = nextFilter || null;
        } else {
            this.knowledgeModalSourceFilter = null;
        }
        this.buildKnowledgeModal();
        if (!this.knowledgeModal) return;
        if (this.previewPanel && this.previewPanel.classList.contains("open")) {
            this.closePreviewPanel();
        }
        this.knowledgeModal.classList.add("open");
        this.knowledgeModal.setAttribute("aria-hidden", "false");
        if (persist !== false) {
            persistKnowledgeModalOpenState(true);
        }
        this.refreshKnowledgeModal();
    };

    AssistSidebar.prototype.openKnowledgeModalWithSourceFilter = function (source) {
        this.openKnowledgeModal(true, { sourceFilter: source });
    };

    AssistSidebar.prototype.closeKnowledgeModal = function (persist) {
        if (!this.knowledgeModal) return;
        this.knowledgeModal.classList.remove("open");
        this.knowledgeModal.setAttribute("aria-hidden", "true");
        if (persist !== false) {
            persistKnowledgeModalOpenState(false);
        }
        this.setKnowledgeModalStatus("");
    };

    AssistSidebar.prototype.refreshKnowledgeModal = async function (options) {
        options = options || {};
        if (!this.knowledgeModalListEl) return;
        if (Object.prototype.hasOwnProperty.call(options, "sourceFilter")) {
            var nextFilter = (options.sourceFilter || "").toString().trim();
            this.knowledgeModalSourceFilter = nextFilter || null;
        }
        var manifest = await this.loadKnowledgeManifest();
        var webEntries = Array.isArray(manifest) ? manifest : [];
        var webMap = new Map();
        webEntries.forEach(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            if (key) webMap.set(key, entry);
        }.bind(this));
        this.contentManifestEntries = webEntries.slice();
        var storedList = [];
        if (this.knowledgeManifestStore?.read) {
            storedList = await this.knowledgeManifestStore.read();
        }
        var storedSet = new Set((storedList || []).map(this.normalizeKnowledgeKey.bind(this)));
        var indexedSet = new Set();
        var localEntries = [];
        var chatEntries = [];
        var memoEntries = [];
        var localCache = await this.loadKnowledgeLocalDocsCache();
        this.knowledgeLocalDocRefs.clear();
        this.knowledgeChatDocRefs.clear();
        this.knowledgeMemoDocRefs.clear();
        if (this.docManager) {
            try {
                var docs = await this.docManager.getDocuments(this.knowledgeConversationId);
                (docs || []).forEach(function (doc) {
                    if (!doc) return;
                    var key = this.normalizeKnowledgeKey(doc.sourceFileName || doc.name);
                    if (!key) return;
                    indexedSet.add(key);
                    if (this.isMemoDocument(doc)) {
                        this.knowledgeMemoDocRefs.set(key, {
                            id: doc.id,
                            name: doc.name || doc.sourceFileName || "",
                            updatedAt: Number(doc.updatedAt) || 0
                        });
                        return;
                    }
                    var isLocal = Array.isArray(doc.scope) && doc.scope.includes("local");
                    if (!isLocal && webMap.has(key)) {
                        var webEntry = webMap.get(key);
                        if (webEntry && !webEntry.abstract && doc.abstract) {
                            webEntry.abstract = doc.abstract;
                        }
                        return;
                    }
                    if (isLocal) {
                        localCache[key] = {
                            fileName: doc.sourceFileName || doc.name || "",
                            name: doc.name || doc.sourceFileName || "Document",
                            abstract: typeof doc.abstract === "string" ? doc.abstract : "",
                            updatedAt: Number(doc.updatedAt) || 0,
                            mime: doc.mime || "",
                            buffer: doc.fileBuffer || null
                        };
                    }
                    this.knowledgeLocalDocRefs.set(key, { id: doc.id, name: doc.name || doc.sourceFileName || "" });
                    localEntries.push({
                        path: "",
                        name: doc.name || doc.sourceFileName || "Document",
                        abstract: doc.abstract || "",
                        updatedAt: Number(doc.updatedAt) || 0,
                        fileName: doc.sourceFileName || doc.name || "",
                        source: "Local"
                    });
                }.bind(this));
            } catch (err) {
                console.warn("Knowledge docs fetch failed", err);
            }
            try {
                var chatDocs = await this.docManager.getDocuments(this.conversation?.id);
                (chatDocs || []).forEach(function (doc) {
                    if (!doc) return;
                    if (!this.hasAttachmentScope(doc)) return;
                    if (!doc.fileBuffer) return;
                    var key = this.normalizeKnowledgeKey(doc.sourceFileName || doc.name);
                    if (!key || indexedSet.has(key)) return;
                    var docName = doc.name || doc.sourceFileName || "Document";
                    this.knowledgeChatDocRefs.set(key, { id: doc.id, name: docName });
                    chatEntries.push({
                        path: "",
                        name: docName,
                        abstract: doc.abstract || "",
                        updatedAt: Number(doc.updatedAt) || 0,
                        fileName: doc.sourceFileName || doc.name || "",
                        source: "Chat"
                    });
                }.bind(this));
            } catch (err) {
                console.warn("Knowledge chat docs fetch failed", err);
            }
        }
        var localCacheEntries = Object.values(localCache || {})
            .map(function (record) {
                if (!record) return null;
                var key = this.normalizeKnowledgeKey(record.fileName || record.name);
                if (!key) return null;
                return {
                    path: "",
                    name: record.name || record.fileName || "Document",
                    abstract: typeof record.abstract === "string" ? record.abstract : "",
                    updatedAt: Number(record.updatedAt) || 0,
                    fileName: record.fileName || record.name || "",
                    source: "Local"
                };
            }.bind(this))
            .filter(Boolean);
        if (localCacheEntries.length) {
            var localEntryMap = new Map();
            localEntries.forEach(function (entry) {
                var key = this.normalizeKnowledgeKey(entry.fileName || entry.name);
                if (key) localEntryMap.set(key, entry);
            }.bind(this));
            localCacheEntries.forEach(function (entry) {
                var key = this.normalizeKnowledgeKey(entry.fileName || entry.name);
                var existing = key ? localEntryMap.get(key) : null;
                if (existing) {
                    if (!existing.abstract && entry.abstract) {
                        existing.abstract = entry.abstract;
                    }
                    if (!existing.updatedAt && entry.updatedAt) {
                        existing.updatedAt = entry.updatedAt;
                    }
                } else if (key) {
                    localEntries.push(entry);
                }
            }.bind(this));
        }
        await this.saveKnowledgeLocalDocsCache(localCache);
        if (localEntries.length) {
            localEntries = await this.applyKnowledgeOverrides(localEntries);
        }
        memoEntries = await this.loadMemoLibraryEntries();
        if (memoEntries.length) {
            memoEntries = await this.applyKnowledgeOverrides(memoEntries);
            memoEntries.forEach(function (entry) {
                var key = this.normalizeKnowledgeKey(entry.fileName);
                var indexed = key ? this.knowledgeMemoDocRefs.get(key) : null;
                entry.indexedUpdatedAt = indexed?.updatedAt || 0;
            }.bind(this));
        }
        this.knowledgeManifestEntries = webEntries.concat(memoEntries, localEntries, chatEntries);

        // Load user's persistent selection (independent of preset)
        var persistedSelection = [];
        if (this.knowledgeSelectionStore?.read) {
            persistedSelection = await this.knowledgeSelectionStore.read();
        }
        var persistedSelectionSet = new Set((persistedSelection || []).map(this.normalizeKnowledgeKey.bind(this)));

        // Use persisted selection if available, otherwise start with empty selection for new users
        var selectionSet = persistedSelectionSet.size > 0 ? persistedSelectionSet : new Set();

        var memoKeySet = new Set();
        memoEntries.forEach(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            if (key) memoKeySet.add(key);
        }.bind(this));
        var staleMemoKeys = [];
        this.knowledgeMemoDocRefs.forEach(function (_ref, key) {
            if (!memoKeySet.has(key)) {
                staleMemoKeys.push(key);
            }
        });
        if (staleMemoKeys.length) {
            staleMemoKeys.forEach(function (key) {
                selectionSet.delete(key);
            });
            if (this.docManager) {
                var names = [];
                staleMemoKeys.forEach(function (key) {
                    var ref = this.knowledgeMemoDocRefs.get(key);
                    if (ref?.name) names.push(ref.name);
                }.bind(this));
                if (names.length) {
                    try {
                        await this.docManager.deleteDocumentsByNames(this.knowledgeConversationId, names);
                    } catch (err) {
                        console.warn("Memo knowledge cleanup failed", err);
                    }
                }
            }
            staleMemoKeys.forEach(function (key) {
                this.knowledgeMemoDocRefs.delete(key);
            }.bind(this));
        }

        var newEntries = webEntries.filter(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            return key && !storedSet.has(key);
        }.bind(this));
        var hasStoredList = Array.isArray(storedList) && storedList.length;
        if (!hasStoredList && indexedSet.size) {
            newEntries = [];
        }
        // Only auto-add new entries if user has an existing selection (not a new user)
        if (false) {
            newEntries.forEach(function (entry) {
                var key = this.normalizeKnowledgeKey(entry.fileName);
                if (key) selectionSet.add(key);
            }.bind(this));
        }
        var entriesToRender = this.knowledgeManifestEntries;
        if (this.knowledgeModalSourceFilter) {
            entriesToRender = entriesToRender.filter(function (entry) {
                return (entry?.source || "").toString() === this.knowledgeModalSourceFilter;
            }.bind(this));
        }
        this.renderKnowledgeModalList(entriesToRender, selectionSet);
        if (newEntries.length && options.autoReindex === true && selectionSet.size > 0) {
            await this.reindexKnowledgeSelection(this.knowledgeManifestEntries, selectionSet);
        }
        if (this.knowledgeManifestStore?.write) {
            await this.knowledgeManifestStore.write(
                webEntries.map(function (entry) { return entry.fileName; })
            );
        }
        this.updateHeaderDocumentCount();
        this.renderKnowledgeModalTitle();
    };

    AssistSidebar.prototype.renderKnowledgeModalList = function (entries, selectionSet) {
        if (!this.knowledgeModalListEl) return;
        var list = this.knowledgeModalListEl;
        if (!Array.isArray(entries) || !entries.length) {
            list.innerHTML = "<div class=\"chat-knowledge-modal__empty\">Aucun document disponible.</div>";
            return;
        }
        var sorted = entries.slice();
        var selSet = selectionSet instanceof Set ? selectionSet : new Set();
        var sortConfig = this.knowledgeModalSort || { column: "updatedAt", direction: "desc" };
        sorted.sort(function (a, b) {
            var aKey = this.normalizeKnowledgeKey(a?.fileName);
            var bKey = this.normalizeKnowledgeKey(b?.fileName);
            var aChecked = selSet.has(aKey);
            var bChecked = selSet.has(bKey);
            if (aChecked !== bChecked) return aChecked ? -1 : 1;
            return this.compareKnowledgeEntries(a, b, sortConfig);
        }.bind(this));
        var html = [];
        html.push(
            "<div class=\"chat-knowledge-modal__row chat-knowledge-modal__row--header\">" +
            "<div><input type=\"checkbox\" class=\"chat-knowledge-modal__header-checkbox\" aria-label=\"Tout sélectionner\"></div>" +
            "<div><button type=\"button\" class=\"chat-knowledge-modal__header-sort\" data-sort=\"name\">Nom</button></div>" +
            "<div><button type=\"button\" class=\"chat-knowledge-modal__header-sort\" data-sort=\"source\">Source</button></div>" +
            "<div>Description</div>" +
            "<div><button type=\"button\" class=\"chat-knowledge-modal__header-sort\" data-sort=\"updatedAt\">MàJ</button></div>" +
            "</div>"
        );
        var disableCheckboxes = Boolean(this.knowledgeIndexing);
        sorted.forEach(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            var checked = selectionSet && selectionSet.has(key);
            var fullName = entry.name || "";
            var truncatedName = this.truncateKnowledgeName(fullName);
            var abstractText = entry.abstract || "";
            var truncatedAbstract = this.truncateKnowledgeAbstract(abstractText);
            var indexedUpdatedAt = Number(entry.indexedUpdatedAt) || 0;
            var entryUpdatedAt = Number(entry.updatedAt) || 0;
            var needsReindex = entry.source === "Mémo" && indexedUpdatedAt && entryUpdatedAt > indexedUpdatedAt;
            html.push(
                "<div class=\"chat-knowledge-modal__row\" data-key=\"" + escapeHtml(key) + "\">" +
                "<div><input type=\"checkbox\" class=\"chat-knowledge-modal__checkbox\" data-key=\"" + escapeHtml(key) + "\" " + (checked ? "checked" : "") + " " + (disableCheckboxes ? "disabled" : "") + "></div>" +
                "<div class=\"chat-knowledge-modal__name-cell\">" +
                "<button type=\"button\" class=\"chat-knowledge-modal__edit\" data-key=\"" + escapeHtml(key) + "\" aria-label=\"Modifier\">✐</button>" +
                (needsReindex
                    ? "<button type=\"button\" class=\"chat-knowledge-modal__reindex\" data-key=\"" + escapeHtml(key) + "\" aria-label=\"Réindexer\">↺</button>"
                    : "") +
                "<button type=\"button\" class=\"chat-knowledge-modal__name\" data-key=\"" + escapeHtml(key) + "\" title=\"" + escapeHtml(fullName) + "\">" + escapeHtml(truncatedName) + "</button>" +
                "</div>" +
                "<div class=\"chat-knowledge-modal__source\">" + escapeHtml(entry.source || "") + "</div>" +
                "<div class=\"chat-knowledge-modal__abstract\" title=\"" + escapeHtml(abstractText) + "\">" + escapeHtml(truncatedAbstract) + "</div>" +
                "<div class=\"chat-knowledge-modal__date\">" + escapeHtml(this.formatKnowledgeRelativeDate(entry.updatedAt)) + "</div>" +
                "</div>"
            );
        }.bind(this));
        list.innerHTML = html.join("");
        this.setKnowledgeModalSelection(selectionSet);
        var sortButtons = list.querySelectorAll(".chat-knowledge-modal__header-sort");
        sortButtons.forEach(function (btn) {
            var column = btn.dataset.sort || "";
            if (!column) return;
            var direction = this.knowledgeModalSort?.column === column ? (this.knowledgeModalSort.direction === "asc" ? "asc" : "desc") : "";
            btn.dataset.direction = direction;
            btn.addEventListener("click", this.handleKnowledgeHeaderSort.bind(this));
        }.bind(this));
        var headerCheckbox = list.querySelector(".chat-knowledge-modal__header-checkbox");
        if (headerCheckbox) {
            headerCheckbox.disabled = disableCheckboxes;
            headerCheckbox.addEventListener("change", this.handleKnowledgeHeaderToggle.bind(this));
        }

        var checkboxes = list.querySelectorAll(".chat-knowledge-modal__checkbox");
        checkboxes.forEach(function (checkbox) {
            checkbox.addEventListener("change", this.handleKnowledgeToggle.bind(this));
        }.bind(this));
        var nameButtons = list.querySelectorAll(".chat-knowledge-modal__name");
        nameButtons.forEach(function (btn) {
            btn.addEventListener("click", this.handleKnowledgePreviewClick.bind(this));
        }.bind(this));
        var editButtons = list.querySelectorAll(".chat-knowledge-modal__edit");
        editButtons.forEach(function (btn) {
            btn.addEventListener("click", this.handleKnowledgeEditClick.bind(this));
        }.bind(this));
        var reindexButtons = list.querySelectorAll(".chat-knowledge-modal__reindex");
        reindexButtons.forEach(function (btn) {
            btn.addEventListener("click", this.handleKnowledgeReindexClick.bind(this));
        }.bind(this));
    };

    AssistSidebar.prototype.getContentManifestKeys = function () {
        var entries = Array.isArray(this.knowledgeManifestEntries) ? this.knowledgeManifestEntries : [];
        var keys = new Set();
        entries.forEach(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName || entry.name);
            if (key) keys.add(key);
        }.bind(this));
        return keys;
    };

    AssistSidebar.prototype.updateKnowledgeHeaderCheckboxState = function () {
        if (!this.knowledgeModalListEl) return;
        var checkbox = this.knowledgeModalListEl.querySelector(".chat-knowledge-modal__header-checkbox");
        if (!checkbox) return;
        var manifestKeys = this.getContentManifestKeys();
        if (!manifestKeys.size) {
            checkbox.checked = false;
            checkbox.indeterminate = false;
            checkbox.disabled = true;
            return;
        }
        checkbox.disabled = false;
        var selection = this.knowledgeModalSelectionSet instanceof Set ? this.knowledgeModalSelectionSet : new Set();
        var selectedCount = 0;
        manifestKeys.forEach(function (key) {
            if (selection.has(key)) selectedCount += 1;
        });
        if (selectedCount === 0) {
            checkbox.checked = false;
            checkbox.indeterminate = false;
        } else if (selectedCount >= manifestKeys.size) {
            checkbox.checked = true;
            checkbox.indeterminate = false;
        } else {
            checkbox.checked = false;
            checkbox.indeterminate = true;
        }
    };

    AssistSidebar.prototype.setKnowledgeModalSelection = function (selectionSet) {
        var selection = new Set();
        if (selectionSet instanceof Set) {
            selectionSet.forEach(function (value) {
                selection.add(value);
            });
        } else if (Array.isArray(selectionSet)) {
            selectionSet.forEach(function (value) {
                selection.add(value);
            });
        }
        this.knowledgeModalSelectionSet = selection;
        this.updateKnowledgeHeaderCheckboxState();
        this.persistKnowledgeSelection(selection);
    };

    AssistSidebar.prototype.persistKnowledgeSelection = function (selectionSet) {
        var selection = [];
        if (selectionSet instanceof Set) {
            selectionSet.forEach(function (key) {
                if (typeof key === "string" && key.trim()) {
                    selection.push(key);
                }
            });
        }
        if (this.knowledgeSelectionStore?.write) {
            this.knowledgeSelectionStore.write(selection).catch(function (err) {
                console.warn("Failed to persist knowledge selection", err);
            });
        }
    };

    AssistSidebar.prototype.handleKnowledgeHeaderToggle = async function (event) {
        if (this.knowledgeIndexing) return;
        var target = event?.currentTarget || event?.target;
        if (!target) return;
        var manifestKeys = this.getContentManifestKeys();
        if (!manifestKeys.size) return;
        var checked = Boolean(target.checked);
        var selectionSet = new Set(this.knowledgeModalSelectionSet || []);
        manifestKeys.forEach(function (key) {
            if (checked) {
                selectionSet.add(key);
            } else {
                selectionSet.delete(key);
            }
        });
        var entries = Array.isArray(this.knowledgeManifestEntries) ? this.knowledgeManifestEntries : [];
        this.renderKnowledgeModalList(entries, selectionSet);
        this.setKnowledgeModalSelection(selectionSet);
        try {
            var reindexOptions = checked ? undefined : { skipDocPurge: true };
            await this.reindexKnowledgeSelection(entries, selectionSet, reindexOptions);
        } catch (err) {
            console.error("Knowledge header toggle reindex failed", err);
        }
        this.renderKnowledgeModalList(entries, selectionSet);
    };

    AssistSidebar.prototype.handleKnowledgeHeaderSort = function (event) {
        var target = event?.currentTarget || event?.target;
        var column = target?.dataset?.sort;
        if (!column) return;
        var current = this.knowledgeModalSort || { column: "updatedAt", direction: "desc" };
        var direction = "asc";
        if (current.column === column) {
            direction = current.direction === "asc" ? "desc" : "asc";
        } else {
            direction = column === "updatedAt" ? "desc" : "asc";
        }
        this.knowledgeModalSort = { column: column, direction: direction };
        this.renderKnowledgeModalList(this.knowledgeManifestEntries, this.knowledgeModalSelectionSet);
    };

    AssistSidebar.prototype.collectKnowledgeSelection = function () {
        var selection = new Set();
        if (!this.knowledgeModalListEl) return selection;
        var checkboxes = this.knowledgeModalListEl.querySelectorAll(".chat-knowledge-modal__checkbox");
        checkboxes.forEach(function (checkbox) {
            if (checkbox.checked) {
                var key = this.normalizeKnowledgeKey(checkbox.dataset.key || "");
                if (key) selection.add(key);
            }
        }.bind(this));
        this.setKnowledgeModalSelection(selection);
        return selection;
    };

    AssistSidebar.prototype.handleKnowledgeToggle = async function (event) {
        if (this.knowledgeIndexing) return;
        var target = event?.currentTarget || event?.target;
        if (!target) return;
        var key = this.normalizeKnowledgeKey(target?.dataset?.key || "");
        var checked = Boolean(target.checked);
        var entry = (this.knowledgeManifestEntries || []).find(function (item) {
            return this.normalizeKnowledgeKey(item.fileName) === key;
        }.bind(this));
        if (!entry) {
            if (target) {
                target.checked = !checked;
            }
            return;
        }
        var entryName = entry?.name || entry?.fileName || "Document";
        var removalMessage = entryName + " retiré.";
        if (!checked && entry.source === "Mémo") {
            await this.deleteKnowledgeEntryDocument(entry);
            var memoSelection = this.collectKnowledgeSelection();
            await this.reindexKnowledgeSelection(this.knowledgeManifestEntries, memoSelection);
            this.refreshDocumentStats();
            this.setKnowledgeModalStatus(removalMessage, false, 4000);
            return;
        }
        if (!checked && (entry.source === "Local" || entry.source === "Chat")) {
            var confirmDeletion = globalThis.confirm("Souhaitez-vous supprimer le fichier ?");
            var removed = false;
            if (confirmDeletion) {
                this.setKnowledgeModalStatus("Suppression en cours…");
                removed = await this.deleteKnowledgeEntryDocument(entry);
            }
            if (removed) {
                await this.refreshKnowledgeModal();
            }
            var selection = this.collectKnowledgeSelection();
            await this.reindexKnowledgeSelection(this.knowledgeManifestEntries, selection);
            this.setKnowledgeModalStatus(removalMessage, false, 4000);
            return;
        }
        var selection = this.collectKnowledgeSelection();
        await this.reindexKnowledgeSelection(this.knowledgeManifestEntries, selection);
        if (!checked) {
            this.setKnowledgeModalStatus(removalMessage, false, 4000);
        } else {
            this.setKnowledgeModalStatus("");
        }
    };

    AssistSidebar.prototype.deleteKnowledgeEntryDocument = async function (entry) {
        if (!entry || !this.docManager) return false;
        var key = this.normalizeKnowledgeKey(entry.fileName);
        if (!key) return false;
        var targetId = entry.source === "Chat" ? this.conversation?.id : this.knowledgeConversationId;
        if (!targetId) return false;
        var ref = entry.source === "Chat"
            ? this.knowledgeChatDocRefs.get(key)
            : (entry.source === "Mémo"
                ? this.knowledgeMemoDocRefs.get(key)
                : this.knowledgeLocalDocRefs.get(key));
        var names = (ref?.name ? [ref.name] : []);
        if (!names.length) return false;
        try {
            await this.docManager.deleteDocumentsByNames(targetId, names);
            if (entry.source === "Chat") {
                this.knowledgeChatDocRefs.delete(key);
            } else if (entry.source === "Mémo") {
                this.knowledgeMemoDocRefs.delete(key);
            } else {
                this.knowledgeLocalDocRefs.delete(key);
                if (this.knowledgeLocalDocsStore?.read && this.knowledgeLocalDocsStore?.write) {
                    var cache = await this.knowledgeLocalDocsStore.read();
                    cache = cache && typeof cache === "object" ? cache : {};
                    delete cache[key];
                    await this.knowledgeLocalDocsStore.write(cache);
                }
            }
            return true;
        } catch (err) {
            console.warn("Knowledge document delete failed", err);
            return false;
        }
    };

    AssistSidebar.prototype.handleKnowledgePreviewClick = function (event) {
        var target = event?.currentTarget;
        var key = this.normalizeKnowledgeKey(target?.dataset?.key || "");
        if (!key) return;
        var entry = (this.knowledgeManifestEntries || []).find(function (item) {
            return this.normalizeKnowledgeKey(item.fileName) === key;
        }.bind(this));
        if (!entry) return;
        this.closeKnowledgeModal();
        this.openKnowledgePreview(entry);
    };

    AssistSidebar.prototype.handleKnowledgeEditClick = function (event) {
        event?.stopPropagation?.();
        var target = event?.currentTarget;
        var key = this.normalizeKnowledgeKey(target?.dataset?.key || "");
        if (!key) return;
        var entry = (this.knowledgeManifestEntries || []).find(function (item) {
            return this.normalizeKnowledgeKey(item.fileName) === key;
        }.bind(this));
        if (!entry) return;
        this.openKnowledgeEditModal(entry);
    };

    AssistSidebar.prototype.handleKnowledgeReindexClick = function (event) {
        event?.stopPropagation?.();
        if (this.knowledgeIndexing) return;
        var target = event?.currentTarget;
        var key = this.normalizeKnowledgeKey(target?.dataset?.key || "");
        if (!key) return;
        var entry = (this.knowledgeManifestEntries || []).find(function (item) {
            return this.normalizeKnowledgeKey(item.fileName) === key;
        }.bind(this));
        if (!entry || entry.source !== "Mémo") return;
        this.reindexMemoKnowledgeEntry(entry);
    };

    AssistSidebar.prototype.reindexMemoKnowledgeEntry = async function (entry) {
        if (!this.docManager || this.knowledgeIndexing || !entry) return;
        this.knowledgeIndexing = true;
        this.setKnowledgeModalStatus("Réindexation en cours…");
        try {
            await this.docManager.waitReady?.();
            var memoText = typeof entry.memoText === "string" ? entry.memoText : "";
            if (!memoText && typeof entry.memoHtml === "string") {
                memoText = this.stripHtmlText(entry.memoHtml);
            }
            if (!memoText && entry.memoHtml) {
                memoText = String(entry.memoHtml);
            }
            var file = this.createKnowledgeFile(memoText, entry.fileName, "text/plain");
            if (!file) {
                this.setKnowledgeModalStatus("Réindexation échouée.", true);
                return;
            }
            await this.docManager.deleteDocumentsByNames(this.knowledgeConversationId, [entry.fileName]);
            var derivedAbstract = entry.abstract || this.extractFirstChunkLine(memoText);
            var metadata = new Map();
            metadata.set(entry.fileName, {
                name: entry.name,
                abstract: derivedAbstract || "",
                updatedAt: entry.updatedAt,
                fileName: entry.fileName,
                scope: ["memo"]
            });
            await this.docManager.ingestFiles([file], this.knowledgeConversationId, {
                sourceType: "embedded",
                metadata: metadata
            });
            await this.refreshKnowledgeModal({ skipAutoReindex: true });
            this.refreshDocumentStats();
            this.setKnowledgeModalStatus("");
        } catch (err) {
            console.warn("Memo knowledge reindex failed", err);
            this.setKnowledgeModalStatus("Réindexation échouée.", true);
        } finally {
            this.knowledgeIndexing = false;
            this.renderKnowledgeModalTitle();
        }
    };

    AssistSidebar.prototype.detectFileTypeFromPath = function (path) {
        if (!path) return "";
        var lower = path.toLowerCase();
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".md")) return "markdown";
        if (lower.endsWith(".txt")) return "txt";
        return "";
    };

    AssistSidebar.prototype.createKnowledgeFile = function (data, fileName, type) {
        var normalizedType = (type || "").trim();
        var parts = [];
        if (data instanceof Blob) {
            parts.push(data);
        } else if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
            parts.push(data);
        } else {
            parts.push(typeof data === "string" ? data : (data != null ? String(data) : ""));
        }
        var blobType = normalizedType || (data instanceof Blob ? data.type : "");
        if (typeof File !== "undefined") {
            try {
                return new File(parts, fileName, { type: blobType });
            } catch (err) {
                // fall back to Blob
            }
        }
        var fallback = new Blob(parts, { type: blobType });
        fallback.name = fileName;
        return fallback;
    };

    AssistSidebar.prototype.fetchKnowledgeDocument = async function (entry) {
        if (!entry || !entry.path) return null;
        try {
            const url = new URL(entry.path, window.location.href);
            url.searchParams.set("v", this.getVersionParam());
            const response = await fetch(url.toString(), { cache: "no-cache" });
            if (!response.ok) {
                console.warn("Knowledge doc fetch failed", entry.path, response.status);
                return null;
            }
            const fileName = entry.fileName || this.getFileNameFromPath(entry.path);
            const contentTypeHeader = (response.headers.get("content-type") || "").toLowerCase();
            const extensionHint = this.detectFileTypeFromPath(entry.path);
            const isPdf = contentTypeHeader.includes("pdf") || extensionHint === "pdf";
            if (isPdf) {
                const buffer = await response.arrayBuffer();
                const mime = contentTypeHeader.includes("/") ? contentTypeHeader : "application/pdf";
                const blob = new Blob([buffer], { type: mime });
                return this.createKnowledgeFile(blob, fileName, mime);
            }
            const text = await response.text();
            var textMime = "text/plain";
            if (extensionHint === "markdown" || contentTypeHeader.includes("markdown")) {
                textMime = "text/markdown";
            } else if (contentTypeHeader.includes("html")) {
                textMime = "text/html";
            }
            return this.createKnowledgeFile(text, fileName, textMime);
        } catch (err) {
            console.error("Knowledge document fetch error", entry.path, err);
            return null;
        }
    };

    AssistSidebar.prototype.syncKnowledgeDocs = async function (manifest) {
        if (!this.docManager) return;
        try {
            await this.docManager.waitReady?.();
            var entries = Array.isArray(manifest) ? manifest : await this.loadKnowledgeManifest();
            if (!entries.length) return;
            var existingDocs = await this.docManager.getDocuments(this.knowledgeConversationId);
            var existingMap = new Map();
            (existingDocs || []).forEach(function (doc) {
                if (!doc || doc.sourceType !== "embedded") return;
                var key = doc.sourceFileName || doc.name;
                if (key) {
                    existingMap.set(key, doc);
                }
            });
            var staleNames = [];
            entries.forEach(function (entry) {
                var stored = existingMap.get(entry.fileName);
                if (!stored) return;
                var storedUpdated = Number(stored.updatedAt) || 0;
                if (!storedUpdated || entry.updatedAt > storedUpdated) {
                    staleNames.push(stored.name);
                    existingMap.delete(entry.fileName);
                }
            });
            if (staleNames.length) {
                await this.docManager.deleteDocumentsByNames(this.knowledgeConversationId, staleNames);
            }
            var toIngest = entries.filter(function (entry) {
                return !existingMap.has(entry.fileName);
            });
            if (!toIngest.length) return;
            var filePromises = toIngest.map(function (entry) {
                return this.fetchKnowledgeDocument(entry);
            }.bind(this));
            var files = (await Promise.all(filePromises)).filter(Boolean);
            if (!files.length) return;
            var metadata = new Map();
            toIngest.forEach(function (entry) {
                metadata.set(entry.fileName, {
                    name: entry.name,
                    abstract: entry.abstract,
                    updatedAt: entry.updatedAt,
                    fileName: entry.fileName
                });
            });
            await this.docManager.ingestFiles(files, this.knowledgeConversationId, {
                sourceType: "embedded",
                metadata
            });
        } catch (err) {
            console.error("Knowledge document sync failed", err);
        }
    };

    AssistSidebar.prototype.purgeKnowledgeIndex = async function () {
        if (!this.docManager) return;
        try {
            await this.docManager.waitReady?.();
            await this.docManager.deleteDocumentsBySourceTypes?.(this.knowledgeConversationId, ["embedded"]);
        } catch (err) {
            console.warn("Knowledge index purge failed", err);
        }
    };

    AssistSidebar.prototype.clearKnowledgeChunks = async function () {
        if (!this.docManager || typeof this.docManager.deleteByIndex !== "function") return;
        try {
            await this.docManager.waitReady?.();
            await this.docManager.deleteByIndex("chunks", "conversationId", this.knowledgeConversationId);
        } catch (err) {
            console.warn("Knowledge chunks clear failed", err);
        }
    };

    AssistSidebar.prototype.reindexKnowledgeFromManifest = async function (manifest, options) {
        if (!this.docManager) return { total: 0, consumed: 0 };
        var entries = Array.isArray(manifest) ? manifest : [];
        var total = entries.length;
        var onProgress = options?.onProgress;
        if (onProgress) {
            onProgress(0, total);
        }
        var files = [];
        try {
            await this.docManager.waitReady?.();
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                if (!entry || !entry.path) {
                    if (onProgress) {
                        onProgress(i + 1, total);
                    }
                    continue;
                }
                entry.fileName = entry.fileName || this.getFileNameFromPath(entry.path);
                var file = await this.fetchKnowledgeDocument(entry);
                if (file) {
                    files.push({
                        entry: entry,
                        file: file
                    });
                }
                if (onProgress) {
                    onProgress(i + 1, total);
                }
            }
            if (!files.length) {
                return { total: total, consumed: 0 };
            }
            var metadata = new Map();
            files.forEach(function (item) {
                metadata.set(item.entry.fileName, {
                    name: item.entry.name,
                    abstract: item.entry.abstract || "",
                    updatedAt: item.entry.updatedAt,
                    fileName: item.entry.fileName
                });
            });
            await this.docManager.ingestFiles(files.map(function (item) {
                return item.file;
            }), this.knowledgeConversationId, {
                sourceType: "embedded",
                metadata: metadata
            });
            return { total: total, consumed: files.length };
        } catch (err) {
            console.error("Knowledge reindex failed", err);
            return { total: total, consumed: files.length };
        }
    };

    AssistSidebar.prototype.reindexKnowledgeSelection = async function (manifest, selectionSet, options) {
        if (this.knowledgeIndexing || !this.docManager) return;
        var entries = Array.isArray(manifest) ? manifest : [];
        var selected = selectionSet instanceof Set ? selectionSet : new Set();
        var filtered = entries.filter(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            return key && selected.has(key);
        }.bind(this));
        var seenPaths = new Set();
        filtered = filtered.filter(function (entry) {
            if (!entry || !entry.path) return true;
            var normalizedPath = entry.path.toString().trim();
            if (!normalizedPath) return true;
            if (seenPaths.has(normalizedPath)) return false;
            seenPaths.add(normalizedPath);
            return true;
        });
        var hadError = false;
        this.knowledgeIndexing = true;
        this.setKnowledgeModalStatus("Indexation en cours…");
        try {
            var existingDocs = await this.docManager.getDocuments(this.knowledgeConversationId);
            var localDocMap = new Map();
            var localCache = await this.loadKnowledgeLocalDocsCache();
            (existingDocs || []).forEach(function (doc) {
                if (!doc) return;
                var key = this.normalizeKnowledgeKey(doc.sourceFileName || doc.name);
                if (!key) return;
                localDocMap.set(key, doc);
            }.bind(this));
            var skipPurge = Boolean(options?.skipDocPurge);
            if (skipPurge) {
                await this.clearKnowledgeChunks();
            } else {
                await this.purgeKnowledgeIndex();
            }
            var total = filtered.length;
            var processed = 0;
            var files = [];
            var metadata = new Map();
            this.knowledgeModalIndexingProgress = {
                processed: 0,
                total: total
            };
            this.renderKnowledgeModalTitle();
            for (var i = 0; i < filtered.length; i++) {
                var entry = filtered[i];
                var key = this.normalizeKnowledgeKey(entry.fileName);
                var source = entry.source || "Web";
                var file = null;
                var derivedAbstract = "";
                if (source === "Local") {
                    var localDoc = localDocMap.get(key);
                    var buffer = localDoc?.fileBuffer || localCache[key]?.buffer || null;
                    var mime = localDoc?.mime || localCache[key]?.mime || "";
                    if (buffer) {
                        file = this.createKnowledgeFile(
                            buffer,
                            localDoc?.sourceFileName || localDoc?.name || entry.fileName,
                            mime
                        );
                    }
                    if (!entry.abstract) {
                        derivedAbstract = await this.deriveAbstractFromFile(file);
                    }
                    metadata.set(entry.fileName, {
                        name: entry.name,
                        abstract: entry.abstract || derivedAbstract || "",
                        updatedAt: entry.updatedAt,
                        fileName: entry.fileName,
                        scope: ["attachments", "local"]
                    });
                    if (localCache && entry.fileName) {
                        localCache[key] = {
                            fileName: entry.fileName,
                            name: entry.name || entry.fileName,
                            abstract: entry.abstract || derivedAbstract || "",
                            updatedAt: entry.updatedAt,
                            mime: mime,
                            buffer: buffer
                        };
                    }
                } else if (source === "Mémo") {
                    var memoText = typeof entry.memoText === "string" ? entry.memoText : "";
                    if (!memoText && typeof entry.memoHtml === "string") {
                        memoText = this.stripHtmlText(entry.memoHtml);
                    }
                    if (!memoText && entry.memoHtml) {
                        memoText = String(entry.memoHtml);
                    }
                    file = this.createKnowledgeFile(memoText, entry.fileName, "text/plain");
                    if (!entry.abstract) {
                        derivedAbstract = this.extractFirstChunkLine(memoText);
                    }
                    if (file) {
                        metadata.set(entry.fileName, {
                            name: entry.name,
                            abstract: entry.abstract || derivedAbstract || "",
                            updatedAt: entry.updatedAt,
                            fileName: entry.fileName,
                            scope: ["memo"]
                        });
                    }
                } else {
                    file = await this.fetchKnowledgeDocument(entry);
                    if (file) {
                        if (!entry.abstract) {
                            derivedAbstract = await this.deriveAbstractFromFile(file);
                        }
                        metadata.set(entry.fileName, {
                            name: entry.name,
                            abstract: entry.abstract || derivedAbstract || "",
                            updatedAt: entry.updatedAt,
                            fileName: entry.fileName
                        });
                    }
                }
                processed += 1;
                var label = total ? processed + " / " + total : processed;
                if (this.knowledgeModalIndexingProgress) {
                    this.knowledgeModalIndexingProgress.processed = processed;
                }
                this.setKnowledgeModalStatus("Indexation " + label);
                if (file) {
                    files.push(file);
                }
            }
            if (files.length) {
                await this.docManager.ingestFiles(files, this.knowledgeConversationId, {
                    sourceType: "embedded",
                    metadata: metadata
                });
            }
            if (localCache) {
                await this.saveKnowledgeLocalDocsCache(localCache);
            }
            this.cacheKnowledgeDocumentNames(filtered);
        } catch (err) {
            hadError = true;
            console.warn("Knowledge selection index failed", err);
            this.setKnowledgeModalStatus("Indexation échouée.", true);
        } finally {
            this.knowledgeIndexing = false;
            this.knowledgeModalIndexingProgress = null;
            this.renderKnowledgeModalTitle();
            if (!hadError) {
                this.setKnowledgeModalStatus("");
            }
            this.refreshDocumentStats();
        }
    };

    AssistSidebar.prototype.handleHeaderDocCountClick = function () {
        if (this.knowledgeModal && this.knowledgeModal.classList.contains("open")) {
            this.closeKnowledgeModal();
            return;
        }
        this.openKnowledgeModal();
    };

    AssistSidebar.prototype.refreshDocumentStats = function () {
        if (!this.docManager) return;
        this.docManager.waitReady?.()
            .then(function () {
                return Promise.all([
                    this.docManager.getStats(this.conversation.id),
                    this.docManager.getDocuments(this.conversation.id),
                    this.docManager.getDocuments(this.knowledgeConversationId),
                    this.docManager.getKeywordIndexSize?.(this.conversation.id),
                    this.docManager.getKeywordIndexSize?.(this.knowledgeConversationId)
                ]);
            }.bind(this))
            .then(function (results) {
                var stats = results ? results[0] : null;
                var docs = results ? results[1] : [];
                var knowledgeDocs = results ? results[2] : [];
                var ctxSize = results ? results[3] : 0;
                var knowledgeSize = results ? results[4] : 0;
                this.knowledgeDocumentCount = (Array.isArray(knowledgeDocs) ? knowledgeDocs.length : 0);
                if (Array.isArray(knowledgeDocs) && knowledgeDocs.length) {
                    this.cacheKnowledgeDocumentNames(knowledgeDocs.map(function (doc) {
                        return { name: doc?.name || "" };
                    }));
                }
                this.updateDocumentIndicator(stats, docs, {
                    context: ctxSize,
                    knowledge: knowledgeSize
                });
            }.bind(this))
            .catch(function (err) {
                console.warn("Documents stats", err);
            });
    };

    AssistSidebar.prototype.ensureInitialKnowledgeIndex = function () {
        if (!this.docManager) return;
        this.docManager.waitReady?.()
            .then(async function () {
                var docs = await this.docManager.getDocuments(this.knowledgeConversationId);
                var embedded = (docs || []).filter(function (doc) {
                    return doc && doc.sourceType === "embedded";
                });
                if (embedded.length) {
                    if (this.knowledgeManifestStore?.read && this.knowledgeManifestStore?.write) {
                        var stored = await this.knowledgeManifestStore.read();
                        if (!stored || !stored.length) {
                            var manifest = await this.loadKnowledgeManifest();
                            if (manifest.length) {
                                await this.knowledgeManifestStore.write(
                                    manifest.map(function (entry) { return entry.fileName; })
                                );
                            }
                        }
                    }
                    return;
                }
                var manifest = await this.loadKnowledgeManifest();
                if (!manifest.length) return;
                if (this.knowledgeManifestStore?.write) {
                    await this.knowledgeManifestStore.write(
                        manifest.map(function (entry) { return entry.fileName; })
                    );
                }
            }.bind(this))
            .catch(function (err) {
                console.warn("Initial knowledge index failed", err);
            });
    };

    AssistSidebar.prototype.buildContextPrompt = function (hits) {
        var base = getSystemPrompt();
        if (!hits || !hits.length) return base;
        var parts = hits.map(function (hit, index) {
            var label = hit.docName || "Document";
            var chunkRef = typeof hit.idx === "number" ? "chunk=" + hit.idx : "";
            var score = typeof hit.score === "number" ? hit.score.toFixed(3) : "";
            var header = "[#" + (index + 1) + "] (" + score + " " + label + " " + chunkRef + ")";
            return header + "\\n" + (hit.text || "(aucun extrait)");
        });
        return [
            base,
            "",
            "=== CONTEXTE (extraits) ===",
            parts.join("\\n\\n"),
            "=== FIN CONTEXTE ==="
        ].join("\\n");
    };

    function parseNdjsonResponse(raw) {
        if (!raw || typeof raw !== "string") return null;
        var lines = raw
            .split(/\r?\n/)
            .map(function (line) {
                return line.trim();
            })
            .filter(Boolean);
        if (!lines.length) return null;
        var content = "";
        var references = [];
        var suggestions = [];
        var operations = [];
        var seenAny = false;
        lines.forEach(function (line) {
            try {
                var payload = JSON.parse(line);
                if (!payload || typeof payload.t !== "string") {
                    return;
                }
                seenAny = true;
                if (payload.t === "delta" && payload.path === "answer" && typeof payload.s === "string") {
                    content += payload.s;
                    return;
                }
                if (payload.t === "ref" && references.length < 3) {
                    var normalizedRef = normalizeReference(payload);
                    if (normalizedRef) {
                        references.push(normalizedRef);
                    }
                    return;
                }
                if (payload.t === "suggestion" && suggestions.length < 3 && typeof payload?.label === "string") {
                    var label = payload.label.trim();
                    if (label) {
                        suggestions.push(label);
                    }
                }
                if (payload.t === "operation") {
                    operations.push(payload);
                    return;
                }
            } catch (err) {
                // ignore non-JSON lines
            }
        });
        if (!seenAny) return null;
        return {
            content: content.trim() || "Réponse illisible.",
            references: references,
            suggestions: suggestions,
            operations: operations
        };
    }

    function sanitizeEmbeddedJson(text) {
        return text.replace(/[\u0000-\u001f\u2028\u2029]/g, function (char) {
            switch (char) {
                case "\r":
                    return "\\r";
                case "\n":
                    return "\\n";
                case "\t":
                    return "\\t";
                case "\b":
                    return "\\b";
                case "\f":
                    return "\\f";
                case "\u2028":
                    return "\\u2028";
                case "\u2029":
                    return "\\u2029";
                default:
                    return "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");
            }
        });
    }

    function parseEmbeddedContent(text) {
        if (typeof text !== "string") return null;
        var trimmed = text.trim();
        if (!trimmed) return null;
        var parsed = tryParseJsonString(trimmed);
        if (parsed && typeof parsed === "object") {
            return parsed;
        }
        var sanitized = sanitizeEmbeddedJson(trimmed);
        if (sanitized === trimmed) return null;
        return tryParseJsonString(sanitized);
    }

    function tryParseJsonString(value) {
        try {
            return JSON.parse(value);
        } catch (err) {
            return null;
        }
    }

    AssistSidebar.prototype.parseAssistantResponse = function (raw) {
        var fallback = {
            content: "Réponse illisible.",
            references: [],
            suggestions: []
        };
        if (!raw || typeof raw !== "string") {
            return fallback;
        }
        var trimmed = raw.trim();
        if (!trimmed) {
            return fallback;
        }
        var ndjsonResult = parseNdjsonResponse(trimmed);
        if (ndjsonResult) {
            return ndjsonResult;
        }
        var parsed = null;
        try {
            parsed = JSON.parse(trimmed);
            var payload = parsed;
            var embedded = parseEmbeddedContent(payload?.content);
            if (embedded && typeof embedded === "object") {
                payload = embedded;
            } else if (payload?.content && typeof payload.content === "object") {
                payload = payload.content;
            }
            var answerPayload = payload?.answer;
            var answerContent = null;
            if (typeof answerPayload === "string") {
                answerContent = answerPayload.trim();
            } else if (answerPayload && typeof answerPayload.content === "string") {
                answerContent = answerPayload.content.trim();
            }
            var references = Array.isArray(payload?.references) ? payload.references : [];
            var suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
            var operations = Array.isArray(payload?.operations) ? payload.operations : [];
            var output = (typeof payload?.output === "string") ? payload.output : "";
            var finalContent = (answerContent && answerContent.length)
                ? answerContent
                : (output && output.length ? "Import effectué." : "Non trouvé dans la base");
            return {
                content: finalContent,
                references: references
                    .map(normalizeReference)
                    .filter(Boolean),
                suggestions: suggestions.filter(Boolean).slice(0, 3),
                operations: operations,
                output: output
            };
        } catch (err) {
            return {
                content: trimmed,
                references: [],
                suggestions: [],
                operations: [],
                output: ""
            };
        }
    };

    AssistSidebar.prototype.buildPreviewPanel = function () {
        if (this.previewPanel) return;
        var panel = document.createElement("div");
        panel.className = "chat-doc-preview";
        panel.setAttribute("aria-hidden", "true");

        var header = document.createElement("div");
        header.className = "chat-doc-preview__header";
        var backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "chat-doc-preview__back";
        backBtn.textContent = "←";
        backBtn.setAttribute("aria-label", "Retour à la base de connaissances");
        backBtn.addEventListener("click", function () {
            this.closePreviewPanel();
            this.openKnowledgeModal();
        }.bind(this));
        var title = document.createElement("div");
        title.className = "chat-doc-preview__title";
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "chat-doc-preview__close";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", this.closePreviewPanel.bind(this));
        header.appendChild(backBtn);
        header.appendChild(title);
        header.appendChild(closeBtn);

        var body = document.createElement("div");
        body.className = "chat-doc-preview__body";

        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        this.previewPanel = panel;
        this.previewTitleEl = title;
        this.previewBodyEl = body;
        this.previewCloseBtn = closeBtn;
    };

    AssistSidebar.prototype.clearPreviewIframe = function () {
        if (this.previewIframeEl) {
            this.previewIframeEl.remove();
            this.previewIframeEl = null;
        }
        if (this.previewPdfUrl) {
            try {
                URL.revokeObjectURL(this.previewPdfUrl);
            } catch (err) {
                // ignore
            }
            this.previewPdfUrl = null;
        }
        if (this.previewBodyEl) {
            this.previewBodyEl.style.display = "";
        }
        this.pendingPdfHighlight = null;
    };

    AssistSidebar.prototype.showPdfPreview = function (doc) {
        if (!this.previewPanel || !this.previewBodyEl) return false;
        if (!doc || !doc.fileBuffer) return false;
        try {
            var blob = doc.fileBuffer instanceof Blob
                ? doc.fileBuffer
                : new Blob([doc.fileBuffer], { type: doc.mime || "application/pdf" });
            var restoreHighlight = this.pendingPdfHighlight;
            this.clearPreviewIframe();
            this.pendingPdfHighlight = restoreHighlight;
            var url = URL.createObjectURL(blob);
            this.previewPdfUrl = url;
            var iframe = document.createElement("iframe");
            iframe.className = "chat-doc-preview__iframe";
            iframe.setAttribute("loading", "lazy");
            iframe.setAttribute("referrerpolicy", "no-referrer");
            iframe.src = url;
            this.previewBodyEl.style.display = "none";
            this.previewPanel.appendChild(iframe);
            this.previewIframeEl = iframe;
            iframe.addEventListener("load", function () {
                this.postPdfHighlight(this.pendingPdfHighlight);
            }.bind(this));
            return true;
        } catch (err) {
            console.warn("PDF preview failed", err);
            this.clearPreviewIframe();
            return false;
        }
    };

    AssistSidebar.prototype.showHtmlPreview = function (html) {
        if (!this.previewPanel || !this.previewBodyEl) return false;
        if (typeof html !== "string" || !html.trim()) return false;
        try {
            this.clearPreviewIframe();
            var iframe = document.createElement("iframe");
            iframe.className = "chat-doc-preview__iframe";
            iframe.setAttribute("loading", "lazy");
            iframe.setAttribute("referrerpolicy", "no-referrer");
            iframe.setAttribute("sandbox", "");
            iframe.srcdoc = html;
            this.previewBodyEl.style.display = "none";
            this.previewPanel.appendChild(iframe);
            this.previewIframeEl = iframe;
            return true;
        } catch (err) {
            console.warn("HTML preview failed", err);
            this.clearPreviewIframe();
            return false;
        }
    };

    AssistSidebar.prototype.setPdfHighlight = function (highlight) {
        this.pendingPdfHighlight = highlight;
        if (!highlight) return;
        if (this.previewIframeEl) {
            this.postPdfHighlight(highlight);
        }
    };

    AssistSidebar.prototype.postPdfHighlight = function (highlight) {
        if (!highlight || !this.previewIframeEl) return;
        var payload = {
            type: "chunk-highlight",
            chunkId: highlight.chunkId,
            page: Number.isFinite(highlight.page) ? highlight.page : undefined,
            text: highlight.text || ""
        };
        try {
            this.previewIframeEl.contentWindow?.postMessage(payload, "*");
        } catch (err) {
            console.warn("PDF highlight post failed", err);
        }
    };

    AssistSidebar.prototype.closePreviewPanel = function () {
        if (!this.previewPanel) return;
        this.previewPanel.classList.remove("open");
        this.previewPanel.setAttribute("aria-hidden", "true");
        this.clearPreviewIframe();
    };

    AssistSidebar.prototype.importDocument = function () {
        if (!this.currentPreviewDoc) {
            console.warn("No document to import");
            return;
        }

        var self = this;
        var docId = this.currentPreviewDoc.id;

        // Récupérer le contenu texte brut depuis IndexedDB
        if (!this.docManager) {
            console.warn("Document manager not available");
            return;
        }

        this.docManager.getDocumentById(docId).then(function (doc) {
            if (!doc || !doc.rawText) {
                console.warn("Document raw text not available");
                return;
            }

            var docContent = doc.rawText;

            // Construire le message utilisateur
            var userPrompt = "DOCUMENT\n" + docContent;

            // Construire le payload avec le prompt system import
            var systemPrompt = window.GoToolkitChatPrompt?.PRESETS?.import?.prompt ||
                window.GoToolkitChatPrompt?.PRESETS?.import?.defaultPrompt ||
                "Importer le DOCUMENT à l'identique avec Markdown adapté";

            var payload = {
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                stream: false,
                model: global.GoToolkitIAConfig?.getOpenRouterModel?.() || "openai/gpt-oss-120b"
            };

            // Fermer le panel
            self.closePreviewPanel();

            // Créer un message utilisateur dans le chat avec "Importer le document"
            var userMessage = {
                id: "msg-" + Date.now(),
                role: "user",
                content: "⤷ Importer le document",
                attachments: [doc.name]
            };
            self.appendMessage(userMessage, {});

            // Ajouter à la conversation
            if (self.conversation) {
                self.conversation.messages.push(userMessage);
            }

            // Envoyer la requête à l'IA
            self.sendAIRequest(payload);
        }).catch(function (err) {
            console.error("Failed to retrieve document:", err);
        });
    };

    AssistSidebar.prototype.sendAIRequest = function (payload) {
        var self = this;

        // Avoid sending the same payload twice in quick succession or while in-flight
        var payloadJson = JSON.stringify(payload || {});
        var payloadHash = payloadJson;
        var now = Date.now();
        if (this._inFlightPayloadHash === payloadHash ||
            (this._lastPayloadHash === payloadHash && (now - (this._lastPayloadAt || 0)) < 1200)) {
            console.warn("Duplicate payload skipped");
            return;
        }
        this._lastPayloadHash = payloadHash;
        this._lastPayloadAt = now;
        this._inFlightPayloadHash = payloadHash;

        this.setSendButtonBusy(true);

        // Calculate total payload byte count and check size limit
        var payloadBytes = new Blob([payloadJson]).size;
        var maxPayloadBytes = 2_000_000;

        if (payloadBytes > maxPayloadBytes) {
            console.error("Payload size exceeds limit:", payloadBytes, "bytes");
            var errorMessage = "Document trop volumineux pour Docs\n\n" +
                "Le document dépasse la limite de " + Math.floor(maxPayloadBytes / 1_000_000) + " Mo.\n\n" +
                "Suggestion : Ajoutez-le à la Mémoire ou avec +";
            alert(errorMessage);
            this._inFlightPayloadHash = null;
            return;
        }

        // Calculate total payload character count and start toaster
        var totalPayloadChars = 0;
        if (Array.isArray(payload.messages)) {
            payload.messages.forEach(function (msg) {
                if (msg && typeof msg.content === "string") {
                    totalPayloadChars += msg.content.length;
                }
            });
        }

        // Determine if it's an import to enable looping and custom duration
        var isImportRequest = payload.system && payload.system.includes("Importer le DOCUMENT");
        startCharacterCounterToaster(totalPayloadChars / 4, { isImport: isImportRequest });

        // Créer un message bot provisoire pour la réponse
        var botMessage = {
            id: "msg-" + (Date.now() + 1),
            role: "bot",
            content: "..."
        };
        botMessage.references = [];
        botMessage.suggestions = [];

        this.appendMessage(botMessage, {});
        if (this.conversation) {
            this.conversation.messages.push(botMessage);
        }
        this.persist();
        this.scrollToBottom();

        // Normaliser le payload (helper from handleSend)
        var requestPayload = Object.assign({}, payload || {});
        var requestMessages = Array.isArray(requestPayload.messages)
            ? requestPayload.messages.slice()
            : [];

        var systemPrompt = (typeof requestPayload.system === 'string')
            ? requestPayload.system
            : '';

        var hasSystemMessage = requestMessages.some(function (m) {
            return m && m.role === 'system';
        });
        if (!hasSystemMessage && systemPrompt && systemPrompt.trim()) {
            requestMessages.unshift({ role: 'system', content: systemPrompt });
        }
        requestPayload.messages = requestMessages;
        delete requestPayload.system;

        // Appeler l'IA
        if (!window.GoToolkitIA || !window.GoToolkitIA.chatCompletion) {
            console.warn("AI Client not available");
            botMessage.content = "❌ Service IA non disponible";
            self.updateBotMessage(botMessage);
            return;
        }

        window.GoToolkitIA.chatCompletion({
            payload: requestPayload,
            endpointType: 'responses'
        }).then(function (rawResponse) {
            // Parser la réponse
            var responseObj = null;
            var rawTextFallback = '';

            // Handle return format from ia-client.js: { text: "...", usage: ... }
            var resultText = (rawResponse && typeof rawResponse === 'object') ? (rawResponse.text || rawResponse.content) : rawResponse;

            if (typeof resultText === 'string') {
                try {
                    responseObj = JSON.parse(resultText);
                    rawTextFallback = resultText;
                } catch (e) {
                    rawTextFallback = (resultText || '').trim();
                }
            } else if (resultText && typeof resultText === 'object') {
                responseObj = resultText;
            }

            // Extraire l'output
            var output = null;
            if (responseObj && typeof responseObj === 'object') {
                if (typeof responseObj.content === 'string') {
                    try {
                        var embedded = JSON.parse(responseObj.content.trim());
                        if (embedded && typeof embedded === 'object') {
                            responseObj = embedded;
                        }
                    } catch (e) {
                        // noop
                    }
                } else if (responseObj.content && typeof responseObj.content === 'object') {
                    responseObj = responseObj.content;
                }
                output = responseObj.output || responseObj.mermaid || null;
            }

            // Parser le contenu pour le chat
            var parsedResponse = self.parseAssistantResponse(
                JSON.stringify(responseObj || { answer: rawTextFallback || "Import effectué." })
            );

            // Mettre à jour le message bot
            botMessage.content = parsedResponse.content || rawTextFallback || "Import effectué.";
            botMessage.references = parsedResponse.references || [];
            botMessage.suggestions = parsedResponse.suggestions || [];

            // Mettre à jour l'affichage du message
            var messageEntry = self.messageNodes[botMessage.id];
            if (messageEntry && messageEntry.contentEl) {
                messageEntry.contentEl.innerHTML = self.renderBotContent(botMessage);
                addCopyButtonsToChatContent(messageEntry.contentEl);
                self.syncBotExtras?.(messageEntry, botMessage);
            }

            // Insérer le contenu importé à la fin du document courant
            if (output && typeof window.getMemoActiveTabContent === 'function') {
                var currentContent = window.getMemoActiveTabContent() || '';
                var newContent = currentContent + (currentContent ? '\n\n' : '') + output;

                if (typeof window.setEditorMarkdown === 'function') {
                    window.setEditorMarkdown(newContent);
                }
            }

            self.scrollToBottom();
            self.persist();
            stopCharacterCounterToaster();
            self.setSendButtonBusy(false);
            if (self.deferSendButtonRestoreUntilAI) {
                self.deferSendButtonRestoreUntilAI = false;
                self.setTranscriptionUiState(false);
            }
            if (self.importInProgress) {
                self.importInProgress = false;
                if (CHAT_APP_ID === "memo") {
                    window.GoToolkitMemoToast?.("");
                }
            }

        }).catch(function (err) {
            console.error("AI Error:", err);
            botMessage.content = "❌ Erreur lors de l'import du document. Veuillez réessayer.";
            self.updateBotMessage(botMessage);

            var messageEntry = self.messageNodes[botMessage.id];
            if (messageEntry && messageEntry.contentEl) {
                messageEntry.contentEl.innerHTML = self.renderBotContent(botMessage);
                addCopyButtonsToChatContent(messageEntry.contentEl);
                self.syncBotExtras?.(messageEntry, botMessage);
            }
            stopCharacterCounterToaster();
            self.setSendButtonBusy(false);
            if (self.deferSendButtonRestoreUntilAI) {
                self.deferSendButtonRestoreUntilAI = false;
                self.setTranscriptionUiState(false);
            }
            if (self.importInProgress) {
                self.importInProgress = false;
                if (CHAT_APP_ID === "memo") {
                    window.GoToolkitMemoToast?.("", true);
                }
            }
        }).finally(function () {
            if (self._inFlightPayloadHash === payloadHash) {
                self._inFlightPayloadHash = null;
            }
        });
    };

    AssistSidebar.prototype.normalizeDocName = function (value) {
        return this.stripDocExtension(String(value || "")).toLowerCase();
    };

    AssistSidebar.prototype.buildHistoryText = function () {
        if (!this.conversation?.messages?.length) return "";
        var entries = [];
        var msgs = this.conversation.messages;
        for (var i = msgs.length - 1; i >= 0 && entries.length < 4; i--) {
            var msg = msgs[i];
            if (msg?.role === "bot") continue;
            var text = (msg?.content || "").toString().trim();
            if (!text) continue;
            entries.unshift({
                role: "USER",
                text: text
            });
        }
        return entries
            .map(function (entry) {
                return entry.role + ": " + entry.text;
            })
            .join("\n");
    };

    AssistSidebar.prototype.resolvePreviewSnippet = async function (message, reference) {
        var targetDocId = reference?.documentId;
        var entries = [];
        if (message?.retrievalEntries) {
            var contextEntries = message.retrievalEntries.context || { embedded: {}, context: [] };
            var knowledgeEntries = message.retrievalEntries.knowledge || { embedded: {}, context: [] };
            entries = []
                .concat(
                    contextEntries.embedded?.methods || [],
                    contextEntries.embedded?.tools || [],
                    contextEntries.embedded?.context || []
                )
                .concat(contextEntries.context || [])
                .concat(
                    knowledgeEntries.embedded?.methods || [],
                    knowledgeEntries.embedded?.tools || [],
                    knowledgeEntries.embedded?.context || []
                )
                .concat(knowledgeEntries.context || []);
        }
        var match = null;
        if (targetDocId) {
            match = entries.find(function (entry) {
                return entry.documentId === targetDocId;
            });
        }
        if (match?.text) {
            return match.text;
        }
        if (!this.docManager || !targetDocId) return "";
        try {
            var doc = this.docCache.get(targetDocId) || await this.ensureDocumentCached(targetDocId);
            if (!doc?.id) return "";
            var chunks = await this.getDocumentChunks(doc.id, doc.conversationId);
            if (!chunks.length) return "";
            return chunks[0].text || "";
        } catch (err) {
            console.warn("Preview resolve failed", err);
            return "";
        }
    };

    AssistSidebar.prototype.findDocumentForPreview = async function (name) {
        if (!name || !this.docManager) return null;
        var docs = await this.docManager.getDocuments(this.conversation.id);
        if (!docs || !docs.length) return null;
        var target = name.toString().trim().toLowerCase();
        var normalizedTarget = this.normalizeDocName(name);
        for (var i = 0; i < docs.length; i++) {
            var doc = docs[i];
            var candidate = (doc?.name || "").toString().trim().toLowerCase();
            if (candidate && candidate === target) {
                return doc;
            }
            var sourceName = (doc?.sourceFileName || "").toString().trim().toLowerCase();
            if (sourceName && sourceName === target) {
                return doc;
            }
        }
        if (normalizedTarget) {
            for (var i = 0; i < docs.length; i++) {
                var doc = docs[i];
                if (this.normalizeDocName(doc?.name) === normalizedTarget) {
                    return doc;
                }
                if (this.normalizeDocName(doc?.sourceFileName) === normalizedTarget) {
                    return doc;
                }
            }
        }
        return null;
    };

    AssistSidebar.prototype.openAttachmentPreview = async function (name) {
        if (!name || !this.docManager) return;
        this.buildPreviewPanel();
        if (!this.previewPanel) return;
        this.previewPanel.classList.add("open");
        this.previewPanel.setAttribute("aria-hidden", "false");
        this.previewTitleEl && (this.previewTitleEl.textContent = name);
        this.clearPreviewIframe();
        if (this.previewBodyEl) {
            this.previewBodyEl.innerHTML = "<div class=\"chat-doc-preview__loading\">Chargement…</div>";
        }
        var snippet = "";
        try {
            var doc = await this.findDocumentForPreview(name);
            if (doc && doc.id) {
                this.currentPreviewDoc = doc;
                if (isPdfDocument(doc) && !getConfig("memo.documentPreview.showChunksForPdf", false)) {
                    if (this.showPdfPreview(doc)) {
                        return;
                    }
                }
                var docChunks = await this.getDocumentChunks(doc.id, doc.conversationId);
                snippet = docChunks.length ? (docChunks[0].text || "") : "";
                this.renderDocumentText(docChunks, { snippet: snippet, doc: doc });
                return;
            } else {
                console.warn("Document not found for preview:", name);
            }
        } catch (err) {
            console.warn("Attachment preview failed", err);
        }
        if (this.previewBodyEl) {
            var content = snippet || "(extrait indisponible)";
            this.previewBodyEl.innerHTML = this.formatPreviewText(content);
        }
    };

    AssistSidebar.prototype.findKnowledgeDocumentForPreview = async function (entry) {
        if (!entry || !this.docManager) return null;
        var docs = await this.docManager.getDocuments(this.knowledgeConversationId);
        if (!docs || !docs.length) return null;
        var targetKey = this.normalizeKnowledgeKey(entry.fileName || entry.name);
        for (var i = 0; i < docs.length; i++) {
            var doc = docs[i];
            if (!doc) continue;
            var fileKey = this.normalizeKnowledgeKey(doc.sourceFileName || doc.name);
            if (fileKey && fileKey === targetKey) {
                return doc;
            }
            var nameKey = this.normalizeKnowledgeKey(doc.name || "");
            if (nameKey && nameKey === targetKey) {
                return doc;
            }
        }
        return null;
    };

    function convertHtmlToMarkdownForPreview(html) {
        if (!html) return "";
        var doc = new DOMParser().parseFromString(html, "text/html");
        var body = doc.body;
        if (!body) return "";

        function tableToMarkdown(tableEl) {
            var rows = Array.from(tableEl.querySelectorAll("tr"));
            if (!rows.length) return "";
            var headerCells = Array.from(rows[0].querySelectorAll("th,td")).map(function (cell) {
                return (cell.textContent || "").trim();
            });
            var header = "| " + headerCells.join(" | ") + " |";
            var separator = "| " + headerCells.map(function () { return "---"; }).join(" | ") + " |";
            var bodyRows = rows.slice(1).map(function (row) {
                var cells = Array.from(row.querySelectorAll("td,th")).map(function (cell) {
                    return (cell.textContent || "").trim();
                });
                return "| " + cells.join(" | ") + " |";
            });
            return [header, separator].concat(bodyRows).join("\n");
        }

        function walk(node) {
            if (!node) return "";
            if (node.nodeType === Node.TEXT_NODE) {
                return node.nodeValue || "";
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return "";
            var tag = node.tagName.toLowerCase();
            var children = Array.from(node.childNodes).map(walk).join("").trim();
            if (tag === "br") return "\n";
            if (tag === "p") return "\n" + children + "\n";
            if (/^h[1-6]$/.test(tag)) {
                var level = Math.min(parseInt(tag.slice(1), 10) || 2, 6);
                return "\n" + "#".repeat(level) + " " + children + "\n";
            }
            if (tag === "strong" || tag === "b") return "**" + children + "**";
            if (tag === "em" || tag === "i") return "*" + children + "*";
            if (tag === "code") return "`" + children + "`";
            if (tag === "pre") return "\n```\n" + (node.textContent || "") + "\n```\n";
            if (tag === "a") {
                var href = node.getAttribute("href") || "";
                return "[" + children + "](" + href + ")";
            }
            if (tag === "blockquote") {
                var lines = children.split(/\r?\n/).filter(Boolean);
                return "\n" + lines.map(function (line) { return "> " + line; }).join("\n") + "\n";
            }
            if (tag === "table") {
                return "\n" + tableToMarkdown(node) + "\n";
            }
            if (tag === "ul") {
                var items = Array.from(node.querySelectorAll(":scope > li")).map(function (li) {
                    return "- " + walk(li).trim();
                });
                return "\n" + items.join("\n") + "\n";
            }
            if (tag === "ol") {
                var ordered = Array.from(node.querySelectorAll(":scope > li")).map(function (li, idx) {
                    return (idx + 1) + ". " + walk(li).trim();
                });
                return "\n" + ordered.join("\n") + "\n";
            }
            if (tag === "li") return children;
            return children;
        }

        return walk(body).replace(/\n{3,}/g, "\n\n").trim();
    }

    AssistSidebar.prototype.openKnowledgePreview = async function (entry) {
        if (!entry || !this.docManager) return;
        this.buildPreviewPanel();
        if (!this.previewPanel) return;
        this.previewPanel.classList.add("open");
        this.previewPanel.setAttribute("aria-hidden", "false");
        this.previewTitleEl && (this.previewTitleEl.textContent = entry.name || "Document");
        this.clearPreviewIframe();
        this.currentPreviewDoc = null;
        if (this.previewBodyEl) {
            this.previewBodyEl.innerHTML = "<div class=\"chat-doc-preview__loading\">Chargement…</div>";
        }
        try {
            var doc = await this.findKnowledgeDocumentForPreview(entry);
            if (doc?.id) {
                this.currentPreviewDoc = doc;
            }
            var memoHtml = typeof entry.memoHtml === "string" ? entry.memoHtml : "";
            if (entry.source === "Mémo" && memoHtml.trim()) {
                var markdown = convertHtmlToMarkdownForPreview(memoHtml);
                var markdownHtml = renderDocumentMarkdown(markdown);
                if (this.previewBodyEl) {
                    this.previewBodyEl.innerHTML = markdownHtml || "<div style='color: var(--muted); font-style: italic;'>(extrait indisponible)</div>";
                }
                return;
            }
            if (doc?.id) {
                var docChunks = await this.getDocumentChunks(doc.id, doc.conversationId);
                this.renderDocumentText(docChunks, { doc: doc });
                return;
            }
            var fetched = await this.fetchKnowledgeDocument(entry);
            if (fetched) {
                var fetchedType = (fetched.type || "").toLowerCase();
                if (fetchedType.includes("pdf")) {
                    try {
                        if (this.previewBodyEl) {
                            this.previewBodyEl.innerHTML = "<div class=\"chat-doc-preview__loading\">Extraction PDF…</div>";
                        }
                        await this.docManager.waitReady?.();
                        var useCloudOnly = getConfig("memo.ocr.disableOffline", false);
                        if (useCloudOnly) {
                            console.info("[Memo OCR] memo.ocr.disableOffline is enabled; using cloud-only extraction.");
                        }
                        if (useCloudOnly && typeof this.docManager.extractPdfCloudTextWithProgress === "function") {
                            var accumulated = "";
                            var virtualDocCloud = {
                                name: fetched.name || entry.name || "Document",
                                sourceFileName: fetched.name || entry.name || "Document",
                                mime: fetchedType || "application/pdf",
                                rawText: ""
                            };
                            await this.docManager.extractPdfCloudTextWithProgress(fetched, function (pageNumber, text) {
                                if (!text) return;
                                accumulated = accumulated ? (accumulated + "\n\n" + text) : text;
                                virtualDocCloud.rawText = accumulated;
                                this.previewBodyEl.innerHTML = this.formatPreviewText(accumulated);
                            }.bind(this));
                            if (!accumulated) {
                                this.previewBodyEl.innerHTML = "<div style='color: var(--muted); font-style: italic;'>(extrait indisponible)</div>";
                            }
                            return;
                        }
                        var extractionResult = await this.docManager.extractText(fetched);
                        var chunkInfo = this.docManager.buildChunkList(fetched, extractionResult);
                        var virtualDoc = {
                            name: fetched.name || entry.name || "Document",
                            sourceFileName: fetched.name || entry.name || "Document",
                            mime: fetchedType || "application/pdf",
                            rawText: extractionResult?.text || ""
                        };
                        this.renderDocumentTextProgressive(chunkInfo.chunkList || [], { doc: virtualDoc });
                        return;
                    } catch (err) {
                        console.warn("PDF preview extraction failed", err);
                    }
                }
                var rawText = await fetched.text();
                if (fetchedType.includes("markdown") || this.detectFileTypeFromPath(entry.path) === "markdown") {
                    var html = renderDocumentMarkdown(rawText);
                    this.previewBodyEl.innerHTML = html || "<div style='color: var(--muted); font-style: italic;'>(extrait indisponible)</div>";
                    return;
                }
                if (fetchedType.includes("html")) {
                    if (this.showHtmlPreview(rawText)) {
                        return;
                    }
                }
                this.previewBodyEl.innerHTML = this.formatPreviewText(rawText);
                return;
            }
        } catch (err) {
            console.warn("Knowledge preview failed", err);
        }
        if (this.previewBodyEl) {
            this.previewBodyEl.innerHTML = "(extrait indisponible)";
        }
    };

    AssistSidebar.prototype.openReferencePreview = async function (message, reference) {
        if (!reference) return;
        if (this.knowledgeModal && this.knowledgeModal.classList.contains("open")) {
            this.closeKnowledgeModal(false);
        }
        this.buildPreviewPanel();
        if (!this.previewPanel) return;
        this.previewPanel.classList.add("open");
        this.previewPanel.setAttribute("aria-hidden", "false");
        this.clearPreviewIframe();
        if (this.previewBodyEl) {
            this.previewBodyEl.innerHTML = "<div class=\"chat-doc-preview__loading\">Chargement…</div>";
        }
        var snippet = await this.resolvePreviewSnippet(message, reference);
        try {
            var doc = null;
            if (reference.documentId) {
                doc = this.docCache.get(reference.documentId) || await this.ensureDocumentCached(reference.documentId);
            }
            var title = doc?.name || "Document";
            this.previewTitleEl && (this.previewTitleEl.textContent = title);
            if (doc?.id) {
                var docChunks = await this.getDocumentChunks(doc.id, doc.conversationId);
                var highlightChunk = null;
                if (reference.chunkId) {
                    highlightChunk = docChunks.find(function (chunk) {
                        return chunk?.id === reference.chunkId;
                    });
                }
                var highlightInfo = null;
                var previewSnippet = snippet;
                var targetPage = normalizePageNumber(reference?.page);
                if (highlightChunk) {
                    previewSnippet = (highlightChunk.text || "").trim().slice(0, 512);
                    var highlightText = findHighlightSnippet(reference?.snippet, highlightChunk.text);
                    var chunkPage = normalizePageNumber(highlightChunk.page);
                    if (chunkPage !== null) {
                        targetPage = chunkPage;
                    }
                    highlightInfo = {
                        chunkId: highlightChunk.id,
                        page: targetPage ?? undefined,
                        text: highlightText || previewSnippet
                    };
                }
                if (!highlightInfo && targetPage !== null) {
                    highlightInfo = {
                        chunkId: null,
                        page: targetPage,
                        text: previewSnippet || snippet || ""
                    };
                }
                console.log("chat-reference highlight", {
                    page: highlightInfo?.page,
                    snippet: highlightInfo?.text,
                    chunkId: highlightInfo?.chunkId
                });
                var relatedChunkIds = new Set(
                    (message?.references || [])
                        .filter(function (ref) {
                            return ref?.documentId && reference.documentId && ref.documentId === reference.documentId;
                        })
                        .map(function (ref) {
                            return ref?.chunkId;
                        })
                        .filter(Boolean)
                );
                if (isPdfDocument(doc) && !getConfig("memo.documentPreview.showChunksForPdf", false)) {
                    this.setPdfHighlight(highlightInfo);
                    if (this.showPdfPreview(doc)) {
                        return;
                    }
                    this.setPdfHighlight(null);
                }
                if (!isPdfDocument(doc)) {
                    this.setPdfHighlight(null);
                }
                // Pass aiSnippets if snippet is an array (from AI citations), otherwise empty
                var aiSnippets = Array.isArray(reference.snippet) ? reference.snippet : [];
                this.renderDocumentText(docChunks, {
                    highlightChunkIds: Array.from(relatedChunkIds),
                    snippet: previewSnippet,
                    highlightLine: typeof reference.line === "number" ? reference.line : undefined,
                    aiSnippets: aiSnippets,
                    doc: doc
                });
                this.scrollPreviewToReference(reference);
                return;
            }
        } catch (err) {
            console.warn("Reference preview failed", err);
        }
        if (this.previewBodyEl) {
            var content = snippet || "(extrait indisponible)";
            this.previewBodyEl.innerHTML = this.formatPreviewText(content, reference.line);
            if (typeof reference.line === "number") {
                this.scrollPreviewToLine(reference.line);
            }
        }
    };

    AssistSidebar.prototype.scrollPreviewToReference = function (reference) {
        if (!reference || !this.previewBodyEl) return;
        if (reference.chunkId && this.scrollPreviewToChunk(reference.chunkId)) {
            return;
        }
        if (typeof reference.line === "number" && this.scrollPreviewToLine(reference.line)) {
            return;
        }
        var match = this.previewBodyEl.querySelector(".chat-doc-preview__text-match");
        if (match && typeof match.scrollIntoView === "function") {
            match.scrollIntoView({ block: "center" });
        }
    };

    AssistSidebar.prototype.scrollPreviewToLine = function (lineNo) {
        if (!this.previewBodyEl || !Number.isFinite(lineNo)) return false;
        var target = this.previewBodyEl.querySelector("[data-line=\"" + lineNo + "\"]");
        if (target && typeof target.scrollIntoView === "function") {
            target.scrollIntoView({ block: "center" });
            return true;
        }
        return false;
    };

    AssistSidebar.prototype.scrollPreviewToChunk = function (chunkId) {
        if (!this.previewBodyEl || !chunkId) return false;
        var nodes = this.previewBodyEl.querySelectorAll("[data-chunk]");
        for (var i = 0; i < nodes.length; i++) {
            var attr = nodes[i].getAttribute("data-chunk") || "";
            var keys = attr.split(",").map(function (key) { return key.trim(); }).filter(Boolean);
            if (keys.indexOf(chunkId) !== -1) {
                if (typeof nodes[i].scrollIntoView === "function") {
                    nodes[i].scrollIntoView({ block: "center" });
                }
                return true;
            }
        }
        return false;
    };

    AssistSidebar.prototype.formatPreviewText = function (text, highlightLine, options) {
        var opts = options || {};
        var docMeta = opts.doc || null;
        if (isMarkdownDocument(docMeta, opts)) {
            return renderDocumentMarkdown(String(text || ""));
        }
        var lines = String(text || "").split(/\r?\n/);
        if (!lines.length) return "";
        return lines.map(function (line, index) {
            var lineNo = index + 1;
            var cls = "chat-doc-preview__line";
            if (typeof highlightLine === "number" && highlightLine === lineNo) {
                cls += " chat-doc-preview__line--highlight";
            }
            return (
                "<div class=\"" + cls + "\" data-line=\"" + lineNo + "\">" +
                "<span class=\"chat-doc-preview__line-number\">" + lineNo + "</span>" +
                "<span class=\"chat-doc-preview__line-text\">" + escapeHtml(line) + "</span>" +
                "</div>"
            );
        }).join("");
    };

    AssistSidebar.prototype.getDocumentChunks = async function (docId, conversationId) {
        if (!docId || !this.docManager) return [];
        try {
            var convId = conversationId || this.conversation.id;
            var chunks = await this.docManager.getChunks(convId);
            var filtered = (chunks || []).filter(function (chunk) {
                return chunk && chunk.docId === docId;
            });
            filtered.sort(function (a, b) {
                return (a.idx || 0) - (b.idx || 0);
            });
            return filtered;
        } catch (err) {
            console.warn("Document chunk fetch failed", err);
            return [];
        }
    };

    AssistSidebar.prototype.highlightSnippetsInMarkdown = function (snippets) {
        if (!this.previewBodyEl || !snippets.length) return;

        var walker = document.createTreeWalker(
            this.previewBodyEl,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        var nodesToReplace = [];
        var textNode;
        while (textNode = walker.nextNode()) {
            // Skip script/style nodes
            if (textNode.parentElement?.tagName === "SCRIPT" ||
                textNode.parentElement?.tagName === "STYLE") continue;

            var text = textNode.nodeValue;
            var hasMatch = false;

            for (var i = 0; i < snippets.length; i++) {
                var snippet = snippets[i];
                if (!snippet) continue;
                var normalizedSnippet = normalizeSpaces(snippet);
                if (text.toLowerCase().includes(normalizedSnippet.toLowerCase())) {
                    hasMatch = true;
                    break;
                }
            }

            if (hasMatch) {
                nodesToReplace.push(textNode);
            }
        }

        // Replace text nodes with highlighted versions
        nodesToReplace.forEach(function (textNode) {
            var html = escapeHtml(textNode.nodeValue);

            snippets.forEach(function (snippet) {
                if (!snippet) return;
                var normalizedSnippet = normalizeSpaces(snippet);
                var regex = new RegExp(
                    "(" + escapeRegex(normalizedSnippet) + ")",
                    "gi"
                );
                html = html.replace(regex, "<span class=\"chat-doc-preview__text-match\">$1</span>");
            });

            var span = document.createElement("span");
            span.innerHTML = html;
            textNode.parentNode.replaceChild(span, textNode);
        });
    };

    AssistSidebar.prototype.renderDocumentText = function (chunks, options) {
        if (!this.previewBodyEl) return;
        var opts = options || {};
        var snippet = typeof opts.snippet === "string" ? opts.snippet.trim() : "";

        // Support for AI snippets array from references
        var aiSnippets = Array.isArray(opts.aiSnippets) ? opts.aiSnippets.filter(Boolean) : [];

        var highlightChunkIds = new Set(
            (Array.isArray(opts.highlightChunkIds) ? opts.highlightChunkIds : [])
                .filter(Boolean)
        );
        var highlightLine = Number.isFinite(opts.highlightLine) ? opts.highlightLine : null;
        var docMeta = opts.doc || null;
        var renderMarkdown = isMarkdownDocument(docMeta, opts);

        // For Markdown documents:
        // - when showChunksForMarkdown=false, render the full stored rawText (exact file content)
        // - when true, render from (overlap-normalized) chunks
        if (renderMarkdown) {
            var showChunksForMarkdown = getConfig("memo.documentPreview.showChunksForMarkdown", false);
            var markdownSource = "";

            if (!showChunksForMarkdown && typeof docMeta?.rawText === "string" && docMeta.rawText.trim()) {
                markdownSource = docMeta.rawText;
            } else if (showChunksForMarkdown) {
                var normalizedMarkdownChunks = normalizePreviewChunks(Array.isArray(chunks) ? chunks : []);
                markdownSource = normalizedMarkdownChunks
                    .map(function (entry) { return String(entry?.text || ""); })
                    .filter(Boolean)
                    .join("\n\n");
            } else {
                markdownSource = this.buildMarkdownContent(Array.isArray(chunks) ? chunks : []);
            }

            if (!markdownSource && snippet) {
                markdownSource = snippet;
            }
            var markdownHtml = renderDocumentMarkdown(markdownSource);
            this.previewBodyEl.innerHTML = markdownHtml || "<div style='color: var(--muted); font-style: italic;'>(extrait indisponible)</div>";

            // Highlight AI snippets in markdown content
            if (aiSnippets.length > 0 && this.previewBodyEl.innerHTML) {
                this.highlightSnippetsInMarkdown(aiSnippets);
            }
            return;
        }

        // Check config for whether to show chunks for this document type
        var isPdfDoc = isPdfDocument(docMeta);
        var shouldShowChunks = true;
        if (isPdfDoc) {
            shouldShowChunks = getConfig("memo.documentPreview.showChunksForPdf", false);
        } else if (renderMarkdown) {
            shouldShowChunks = getConfig("memo.documentPreview.showChunksForMarkdown", false);
        } else {
            shouldShowChunks = getConfig("memo.documentPreview.showChunksForOtherFormats", true);
        }

        var normalized = shouldShowChunks ? normalizePreviewChunks(chunks) : [];
        if (!normalized.length) {
            // Si pas de chunks normalisés, essayer d'afficher les chunks bruts s'ils ont du contenu
            if (shouldShowChunks && chunks && chunks.length) {
                console.log("Chunks available but normalized is empty, raw chunks:", chunks.slice(0, 3));
                var rawContent = [];
                chunks.forEach(function (chunk) {
                    if (chunk && chunk.text) {
                        rawContent.push(String(chunk.text));
                    }
                });
                if (rawContent.length) {
                    this.previewBodyEl.innerHTML = this.formatPreviewText(rawContent.join("\n\n"), highlightLine, opts);
                    return;
                }
            }
            if (snippet) {
                this.previewBodyEl.innerHTML = this.formatPreviewText(snippet, highlightLine, opts);
            } else {
                this.previewBodyEl.innerHTML = "<div style='color: var(--muted); font-style: italic;'>(extrait indisponible)</div>";
            }
            return;
        }
        var html = [];
        var accumulatedText = "";
        var accumulatedChunkKeys = [];
        var segments = [];
        var punctuationPattern = /[,.!?;:\-)\]»"'`]$/;

        // Helper to flush accumulated content as a segment
        var flushAccumulated = function () {
            if (!accumulatedText.trim()) return;

            var contentHtml = escapeHtml(accumulatedText);

            // Highlight AI snippets in accumulated content
            aiSnippets.forEach(function (aiSnippet) {
                if (!aiSnippet) return;
                var normalizedAiSnippet = normalizeSpaces(aiSnippet);
                if (accumulatedText.toLowerCase().includes(normalizedAiSnippet.toLowerCase())) {
                    var regex = new RegExp(
                        "(" + escapeRegex(normalizedAiSnippet) + ")",
                        "gi"
                    );
                    contentHtml = contentHtml.replace(regex, "<span class=\"chat-doc-preview__text-match\">$1</span>");
                }
            });

            segments.push({
                html: contentHtml,
                chunkKeys: accumulatedChunkKeys.slice()
            });

            accumulatedText = "";
            accumulatedChunkKeys = [];
        };

        normalized.forEach(function (entry) {
            var chunkRaw = String(entry.text || "");
            var rawLines = chunkRaw.split(/\r?\n/);
            if (!rawLines.length) rawLines = [""];
            var chunkContent = rawLines
                .map(function (line) {
                    return normalizeSpaces(line);
                })
                .filter(Boolean)
                .join(" ");
            if (!chunkContent) return;

            // Add chunk key to tracking
            if (entry.chunkKey) {
                accumulatedChunkKeys.push(entry.chunkKey);
            }

            // Add content with space separator if already accumulated
            if (accumulatedText) {
                accumulatedText += " " + chunkContent;
            } else {
                accumulatedText = chunkContent;
            }

            // Check if we should flush (ends with punctuation)
            if (punctuationPattern.test(accumulatedText)) {
                flushAccumulated();
            }
        });

        // Flush any remaining accumulated text
        if (accumulatedText.trim()) {
            flushAccumulated();
        }

        // Render all segments in a single line with <br> between them
        if (segments.length > 0) {
            var segmentHtmls = segments.map(function (seg) { return seg.html; });
            var allChunkKeys = [];
            segments.forEach(function (seg) {
                allChunkKeys = allChunkKeys.concat(seg.chunkKeys);
            });

            html.push(
                "<div class=\"chat-doc-preview__line\" data-chunk=\"" + escapeHtml(allChunkKeys.join(",")) + "\">" +
                "<div class=\"chat-doc-preview__line-text\">" +
                segmentHtmls.join("<br>") +
                "</div>" +
                "</div>"
            );
        }

        this.previewBodyEl.innerHTML = html.join("");
    };

    AssistSidebar.prototype.renderDocumentTextProgressive = function (chunks, options) {
        if (!this.previewBodyEl) return;
        var opts = options || {};
        var items = Array.isArray(chunks) ? chunks.slice() : [];
        if (!items.length) {
            this.renderDocumentText(items, opts);
            return;
        }
        var batchSize = 10;
        var index = 0;
        this.previewBodyEl.innerHTML = "";
        var appendBatch = function () {
            var slice = items.slice(index, index + batchSize);
            index += batchSize;
            var html = this.formatPreviewText(
                slice.map(function (entry) { return String(entry?.text || ""); }).filter(Boolean).join("\n\n"),
                null,
                opts
            );
            var container = document.createElement("div");
            container.innerHTML = html;
            while (container.firstChild) {
                this.previewBodyEl.appendChild(container.firstChild);
            }
            if (index < items.length) {
                requestAnimationFrame(appendBatch);
            }
        }.bind(this);
        requestAnimationFrame(appendBatch);
    };

    AssistSidebar.prototype.updateTabIndicator = function () {
        if (!this.tabIndicator) return;

        // Check if we're in memo app context with multiple tabs
        var memoTabs = window.__memoState?.tabs;
        var activeTabId = window.__memoState?.activeTabId;

        if (Array.isArray(memoTabs) && memoTabs.length > 1 && activeTabId) {
            // Find the active tab
            var activeTab = memoTabs.find(function (tab) {
                return tab.id === activeTabId;
            });

            if (activeTab) {
                var tabLabel = activeTab.title || ("Page " + (memoTabs.indexOf(activeTab) + 1));
                this.tabIndicator.textContent = tabLabel;
                this.tabIndicator.style.display = "block";
            } else {
                this.tabIndicator.style.display = "none";
            }
        } else {
            this.tabIndicator.style.display = "none";
        }
    };

    AssistSidebar.prototype.init = function () {
        if (!this.root) return;
        if (!global.GoToolkitIA || typeof global.GoToolkitIA.chatCompletion !== "function") {
            console.error("GoToolkitIA indisponible pour le chat.");
            return;
        }
        if (!this.buildUI()) return;
        this.renderInitialMessages();
        this.updateComposerState();
        this.refreshMemoContextAttachments();
        if (this.docManager) {
            this.documentStatsWatcher = this.docManager.onStatsChange(this.refreshDocumentStats.bind(this));
            this.refreshDocumentStats();
        }
        this.syncKnowledgeModalVisibility();
        if (this.isOpen) {
            this.open();
        }
        window.addEventListener("resize", () => {
            if (window.innerWidth < 1200 && this.isOpen) {
                this.close();
            } else {
                this.applyPagePadding();
            }
        });
        this.ensureKnowledgeIndexWarm();
    };

    var GoToolkitAssist = {
        mount: function (target) {
            if (!target) return null;
            var instance = new AssistSidebar(target);
            instance.init();
            return instance;
        }
    };

    // Fonction pour envoyer un message inline du memo-editor
    // Remplace SEULEMENT la sélection en cours, pas tout le document
    async function sendInlineEditToAssist(options) {
        const { payload, selectionExcerpt, selectionPos, editor, askText } = options;
        const assistInstance = window.GoToolkitAssistInstance;

        if (!assistInstance) {
            return;
        }

        assistInstance.setSendButtonBusy(true);

        let botMessage = null;

        // Capturer la position du scroll avant la requête IA
        let scrollPosition = 0;
        const isListText = (text) => {
            if (typeof text !== "string") return false;
            const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            if (!lines.length) return false;
            const listLineRe = /^([-*+]|\\d+[.)])\\s+\\S+/;
            let listLines = 0;
            let nonListLines = 0;
            for (let i = 0; i < lines.length; i++) {
                if (listLineRe.test(lines[i])) {
                    listLines += 1;
                } else {
                    nonListLines += 1;
                }
            }
            return listLines >= 2 && listLines >= nonListLines;
        };
        const getListRangeFromSelection = (editorInstance, selectionFrom, selectionTo) => {
            if (!editorInstance || !editorInstance.state || !editorInstance.state.doc) return null;
            if (!Number.isFinite(selectionFrom) || !Number.isFinite(selectionTo)) return null;
            const safeFrom = Math.min(selectionFrom, selectionTo);
            const safeTo = Math.max(selectionFrom, selectionTo);
            const listItemType = { listItem: true };
            const listTypes = { bulletList: true, orderedList: true, taskList: true };
            let listRange = null;
            try {
                editorInstance.state.doc.nodesBetween(safeFrom, safeTo, (node, pos) => {
                    if (listRange) return false;
                    if (node && listItemType[node.type?.name]) {
                        listRange = { from: pos, to: pos + node.nodeSize };
                        return false;
                    }
                    if (node && listTypes[node.type?.name]) {
                        listRange = { from: pos, to: pos + node.nodeSize };
                        return false;
                    }
                    return;
                });
            } catch (err) {
                listRange = null;
            }
            if (listRange) return listRange;
            try {
                const resolved = editorInstance.state.doc.resolve(safeFrom);
                for (let depth = resolved.depth; depth >= 0; depth--) {
                    const node = resolved.node(depth);
                    if (node && (listItemType[node.type?.name] || listTypes[node.type?.name])) {
                        return {
                            from: resolved.before(depth),
                            to: resolved.after(depth)
                        };
                    }
                }
            } catch (err) {
                return null;
            }
            return null;
        };
        const logInlineEditIssue = (label, details) => {
            try {
                console.error("InlineEdit not applied", {
                    label,
                    details: details || {},
                    ai_in: requestPayloadForLog || null,
                    ai_out: aiOutForLog || null
                });
            } catch (err) {
                // noop
            }
        };

        let requestPayloadForLog = null;
        let aiOutForLog = null;

        try {
            if (editor && editor.view && editor.view.dom && editor.view.dom.parentElement) {
                scrollPosition = editor.view.dom.parentElement.scrollTop || 0;
            }
        } catch (err) {
            scrollPosition = 0;
        }

        try {
            // 1. Normaliser le payload (memo.html fournit souvent `payload.system`, mais
            //    le client Responses attend un message `role: system` / instructions).
            const requestPayload = Object.assign({}, payload || {});
            const requestMessages = Array.isArray(requestPayload.messages)
                ? requestPayload.messages.slice()
                : [];

            const systemPrompt = (typeof requestPayload.system === 'string')
                ? requestPayload.system
                : '';

            const hasSystemMessage = requestMessages.some(m => m && m.role === 'system');
            if (!hasSystemMessage && systemPrompt && systemPrompt.trim()) {
                requestMessages.unshift({ role: 'system', content: systemPrompt });
            }
            requestPayload.messages = requestMessages;
            // Avoid leaking non-standard field downstream.
            delete requestPayload.system;
            requestPayloadForLog = requestPayload;

            // Expose the last AI input (for memo source modal: AI In)
            try {
                window.__memoEditorLastAIInAt = new Date().toISOString();
                window.__memoEditorLastAIInMessages = requestMessages;
                var aiInPayload = Object.assign({}, requestPayload);
                if (aiInPayload && aiInPayload.messages) delete aiInPayload.messages;
                window.__memoEditorLastAIInPayload = aiInPayload;
                window.__memoEditorLastAIInDocumentMarkdown =
                    (typeof window.getMemoEditorSource === 'function'
                        ? window.getMemoEditorSource('markdown')
                        : window.getEditorMarkdown?.()) ||
                    '';

                // Maintain top 20 history
                if (!window.__memoEditorAIInHistory) window.__memoEditorAIInHistory = [];
                window.__memoEditorAIInHistory.unshift({
                    at: window.__memoEditorLastAIInAt,
                    messages: requestMessages,
                    payload: aiInPayload,
                    document: ''
                });
                if (window.__memoEditorAIInHistory.length > 20) window.__memoEditorAIInHistory.pop();

            } catch (e) {
                // noop
            }

            // 2. Extraire le ASK pour afficher le message utilisateur dans le chat.
            //    (Cherche le dernier message user qui contient ASK:, sinon prend tout)
            let askContent = (typeof askText === 'string') ? askText.trim() : '';
            for (let i = requestMessages.length - 1; i >= 0; i--) {
                const msg = requestMessages[i];
                if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') continue;

                // On cherche "ASK:" suivi de n'importe quoi jusqu'à la fin ou une autre section
                const match = msg.content.match(/ASK:\n([\s\S]*)$/);
                if (match && match[1]) {
                    askContent = match[1].trim();
                    break;
                }
            }
            // Si pas de ASK: on prend le message brut
            if (!askContent) {
                for (let i = requestMessages.length - 1; i >= 0; i--) {
                    const msg = requestMessages[i];
                    if (msg && msg.role === 'user' && typeof msg.content === 'string') {
                        askContent = msg.content.trim();
                        break;
                    }
                }
            }

            // 3. Afficher le message utilisateur dans le chat
            const userMessage = createMessage('user', askContent);
            if (!userMessage.docSnapshotId) {
                var inlineDocId = (typeof options?.docSnapshotId === "string" && options.docSnapshotId)
                    || (typeof global.getMemoActiveTabId === "function" ? global.getMemoActiveTabId() : null)
                    || window.__memoState?.activeTabId
                    || null;
                userMessage.docSnapshotId = inlineDocId || null;
            }
            if (typeof userMessage.docSnapshotContent !== "string") {
                var inlineSnapshot = (typeof options?.docSnapshotContent === "string" && options.docSnapshotContent.trim())
                    ? options.docSnapshotContent
                    : "";
                if (!inlineSnapshot) {
                    inlineSnapshot = extractInlineDocumentSnapshot(requestMessages);
                }
                userMessage.docSnapshotContent = inlineSnapshot || readDocumentContent() || "";
            }
            assistInstance.conversation.messages.push(userMessage);
            assistInstance.appendMessage(userMessage, {
                selectionExcerpt: selectionExcerpt
            });

            // 4. Créer et afficher le message bot avec loading "..."
            botMessage = createMessage('bot', '...');
            botMessage.references = [];
            botMessage.suggestions = [];

            assistInstance.conversation.messages.push(botMessage);
            assistInstance.appendMessage(botMessage);
            assistInstance.persist();

            // Calculate total payload character count and start toaster
            var totalPayloadChars = 0;
            if (Array.isArray(requestMessages)) {
                requestMessages.forEach(function (msg) {
                    if (msg && typeof msg.content === "string") {
                        totalPayloadChars += msg.content.length;
                    }
                });
            }
            startCharacterCounterToaster(totalPayloadChars);

            // 5. Appeler l'IA
            const rawResponse = await window.GoToolkitIA?.chatCompletion({
                payload: requestPayload,
                endpointType: 'responses',
            });

            if (!rawResponse) {
                logInlineEditIssue('L0/raw-response-missing', { reason: 'No response from AI client' });
                stopCharacterCounterToaster();
                return;
            }

            // Handle new return format: { text, usage }
            const responseText = (rawResponse && typeof rawResponse === "object") ? rawResponse.text : rawResponse;
            const responseUsage = (rawResponse && typeof rawResponse === "object") ? rawResponse.usage : null;

            // 6. Normaliser la réponse et extraire les métadonnées d'édition
            let editMetadata = null;
            let responseObj = null;
            let rawTextFallback = '';

            if (typeof responseText === 'string') {
                try {
                    responseObj = JSON.parse(responseText);
                } catch (e) {
                    // Réponse texte brute (pas de JSON)
                    rawTextFallback = responseText.trim();
                }
            } else if (responseText && typeof responseText === 'object') {
                responseObj = responseText;
            }

            // Certaines intégrations enveloppent le JSON dans `.content` (string ou objet).
            let payloadObj = responseObj;
            if (payloadObj && typeof payloadObj === 'object') {
                if (typeof payloadObj.content === 'string') {
                    const embedded = tryParseJsonString(payloadObj.content.trim());
                    if (embedded && typeof embedded === 'object') {
                        payloadObj = embedded;
                    }
                } else if (payloadObj.content && typeof payloadObj.content === 'object') {
                    payloadObj = payloadObj.content;
                }
            }

            const normalizeSelectionOutput = (value) => {
                if (typeof value === 'string') {
                    return { text: value };
                }
                if (value && typeof value === 'object') {
                    if (typeof value.text === 'string') return value;
                    if (typeof value.markdown === 'string') return { text: value.markdown };
                    if (typeof value.content === 'string') return { text: value.content };
                }
                return null;
            };

            const extractEditPayload = (obj) => {
                if (!obj || typeof obj !== 'object') return { sOutput: null, output: null };
                let sOutput = obj.s_output || obj.sOutput || null;
                let output = obj.output || null;

                if (!sOutput && !output && obj.answer) {
                    if (typeof obj.answer === 'object' && obj.answer !== null) {
                        sOutput = obj.answer.s_output || obj.answer.sOutput || null;
                        output = obj.answer.output || null;
                        if (!sOutput && !output && typeof obj.answer.content === 'string') {
                            const parsedAnswer = tryParseJsonString(obj.answer.content.trim());
                            if (parsedAnswer && typeof parsedAnswer === 'object') {
                                sOutput = parsedAnswer.s_output || parsedAnswer.sOutput || null;
                                output = parsedAnswer.output || null;
                            }
                        }
                    } else if (typeof obj.answer === 'string') {
                        const parsedAnswer = tryParseJsonString(obj.answer.trim());
                        if (parsedAnswer && typeof parsedAnswer === 'object') {
                            sOutput = parsedAnswer.s_output || parsedAnswer.sOutput || null;
                            output = parsedAnswer.output || null;
                        }
                    }
                }

                return { sOutput, output };
            };

            if (payloadObj && typeof payloadObj === 'object') {
                const extracted = extractEditPayload(payloadObj);
                const normalizedSOutput = normalizeSelectionOutput(extracted.sOutput);
                const output = extracted.output || null;
                if (normalizedSOutput || output) {
                    editMetadata = { sOutput: normalizedSOutput, output };
                }
            }
            aiOutForLog = payloadObj || responseText || rawTextFallback || rawResponse || null;

            // Expose the last AI output (for memo source modal: AI Out)
            try {
                window.__memoEditorLastAIOutAt = new Date().toISOString();
                let lastOut = null;
                if (editMetadata && (editMetadata.sOutput || editMetadata.output)) {
                    lastOut = editMetadata.sOutput || editMetadata.output;
                } else if (payloadObj && typeof payloadObj === 'object') {
                    lastOut = payloadObj.s_output || payloadObj.sOutput || payloadObj.output || null;
                } else {
                    lastOut = rawTextFallback || null;
                }
                window.__memoEditorLastAIOut = lastOut;

                // Maintain top 20 history
                if (!window.__memoEditorAIOutHistory) window.__memoEditorAIOutHistory = [];
                window.__memoEditorAIOutHistory.unshift({
                    at: window.__memoEditorLastAIOutAt,
                    full_payload: payloadObj
                });
                if (window.__memoEditorAIOutHistory.length > 20) window.__memoEditorAIOutHistory.pop();

            } catch (e) {
                // noop
            }

            // 7. Parser le contenu pour le chat depuis un JSON “sanitisé” (sans output/s_output)
            //    Objectif: afficher l'answer dans le chat, garder output/s_output uniquement pour l'édition.
            let parsedResponse = null;
            if (payloadObj && typeof payloadObj === 'object') {
                const chatObj = Object.assign({}, payloadObj);
                delete chatObj.s_output;
                delete chatObj.sOutput;
                delete chatObj.output;
                parsedResponse = assistInstance.parseAssistantResponse(JSON.stringify(chatObj));
            } else if (rawTextFallback) {
                parsedResponse = assistInstance.parseAssistantResponse(rawTextFallback);
            } else {
                parsedResponse = {
                    content: 'Aucune modification apportée.',
                    references: [],
                    suggestions: [],
                    operations: []
                };
            }

            if (!parsedResponse || typeof parsedResponse !== 'object') {
                parsedResponse = {
                    content: rawTextFallback || 'Aucune modification apportée.',
                    references: [],
                    suggestions: [],
                    operations: []
                };
            }

            // 8. Mettre à jour le message bot avec les données parsées (UNIQUEMENT le contenu pour le chat)
            botMessage.content = parsedResponse.content;
            botMessage.references = parsedResponse.references || [];
            botMessage.suggestions = parsedResponse.suggestions || [];
            botMessage.operations = parsedResponse.operations || [];

            // Stocker les métadonnées d'édition dans le message (PAS affichées dans le chat)
            botMessage._editMetadata = editMetadata;
            // 9. Rendre le message dans le DOM
            const messageEntry = assistInstance.messageNodes[botMessage.id];
            if (!messageEntry) {
                return;
            }

            const contentEl = messageEntry.contentEl || messageEntry.querySelector?.('.chat-message-content');
            if (contentEl) {
                contentEl.innerHTML = assistInstance.renderBotContent(botMessage);
                addCopyButtonsToChatContent(contentEl);
                assistInstance.syncBotExtras?.(messageEntry, botMessage);
                assistInstance.scrollToBottom?.();
            }

            // 10. Mettre à jour l'éditeur selon le type de remplacement (continue dans le pipe)
            if (editor && editMetadata) {
                // Restaurer la position du scroll après les modifications
                const restoreScroll = () => {
                    try {
                        if (editor && editor.view && editor.view.dom && editor.view.dom.parentElement) {
                            setTimeout(() => {
                                editor.view.dom.parentElement.scrollTop = scrollPosition;
                            }, 0);
                        }
                    } catch (err) {
                        // noop
                    }
                };

                if (editMetadata.sOutput && typeof editMetadata.sOutput.text === 'string') {
                    // Cas SELECTION : remplacer la sélection courante (overlay)
                    const selectionFrom = Number(selectionPos?.from);
                    const selectionTo = Number(selectionPos?.to);
                    if (Number.isFinite(selectionFrom) && Number.isFinite(selectionTo) && selectionFrom >= 0 && selectionTo >= selectionFrom) {
                        if (typeof window.insertEditorMarkdownAtRange === 'function') {
                            let targetRange = { from: selectionFrom, to: selectionTo };
                            const listRange = getListRangeFromSelection(editor, selectionFrom, selectionTo);
                            if (listRange && isListText(editMetadata.sOutput.text)) {
                                targetRange = listRange;
                            }
                            window.insertEditorMarkdownAtRange(editMetadata.sOutput.text, targetRange);
                            restoreScroll();
                            setTimeout(function () {
                                assistInstance.refreshMemoSelectionFromEditorSelection(editor);
                            }, 0);
                        } else {
                            logInlineEditIssue('L1/insert-range-missing', { reason: 'insertEditorMarkdownAtRange unavailable' });
                        }
                    } else {
                        logInlineEditIssue('L2/selection-range-invalid', { selectionFrom, selectionTo });
                    }
                } else if (typeof editMetadata.output === 'string' && editMetadata.output.trim()) {
                    // Cas DOCUMENT entier (Maintenant APPEND par défaut dans le mode "edit" sans sélection)
                    if (typeof window.insertEditorMarkdownAtEnd === 'function') {
                        window.insertEditorMarkdownAtEnd(editMetadata.output);
                        window.scrollMemoEditorToEnd?.();
                    } else if (typeof window.setEditorMarkdown === 'function') {
                        // Fallback si insertEditorMarkdownAtEnd n'est pas dispo
                        const current = window.getEditorMarkdown?.() || '';
                        window.setEditorMarkdown(current + (current ? '\n\n' : '') + editMetadata.output);
                        window.scrollMemoEditorToEnd?.();
                    } else {
                        editor
                            .chain()
                            .focus()
                            .insertContentAt(editor.state.doc.content.size, editMetadata.output)
                            .run();
                        window.scrollMemoEditorToEnd?.();
                    }
                } else {
                    logInlineEditIssue('L3/edit-metadata-empty', { editMetadata });
                }
            } else if (!editor) {
                logInlineEditIssue('L4/editor-missing', { reason: 'Editor instance not available' });
            } else if (!editMetadata) {
                logInlineEditIssue('L5/no-edit-metadata', { reason: 'AI response missing output/s_output' });
            }

            // 11. Persister la conversation
            assistInstance.persist?.();
            stopCharacterCounterToaster();

        } catch (error) {
            // Mettre à jour le message bot avec l'erreur
            logInlineEditIssue('L6/exception', { error: (error && (error.stack || error.message)) || error });
            stopCharacterCounterToaster();
            if (botMessage) {
                botMessage.content = '⚠️ Une erreur s\'est produite.';
                if (assistInstance.messageNodes[botMessage.id]?.contentEl) {
                    assistInstance.messageNodes[botMessage.id].contentEl.innerHTML = '⚠️ Une erreur s\'est produite.';
                }
            }
        } finally {
            assistInstance.setSendButtonBusy(false);
        }
    }

    // Exposer la fonction globalement
    global.sendInlineEditToAssist = sendInlineEditToAssist;

    global.GoToolkitAssist = global.GoToolkitAssist || GoToolkitAssist;
})(typeof window !== "undefined" ? window : this);
