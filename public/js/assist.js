(function (global) {
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
    var DEFAULT_WIDTH = 450;
    var MIN_WIDTH = 320;
    var MAX_WIDTH = 800;
    var MAX_WIDTH_RATIO = 0.6;
    var PROMPT_PRESET_KEY = scopedKey("goToolkit.chat.prompt.preset");
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

    function loadKnowledgeModalOpenState() {
        try {
            var stored = global.localStorage.getItem(KNOWLEDGE_MODAL_OPEN_KEY);
            if (stored === "1") return true;
            if (stored === "0") return false;
        } catch (err) { /* ignore */ }
        return null;
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

    function getAllowedPromptPresetIds() {
        if (CHAT_APP_ID === "memo") return ["edit"];
        if (CHAT_APP_ID === "index") return ["advice", "ask"];
        return ["advice", "ask"];
    }

    function readPromptPreset() {
        var allowed = getAllowedPromptPresetIds();
        try {
            var stored = global.localStorage.getItem(PROMPT_PRESET_KEY);
            if (stored && allowed.includes(stored)) {
                return stored;
            }
        } catch (err) {
            console.warn("Chat prompt preset read failed", err);
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

    function renderBotMarkdown(text) {
        if (global.GoToolkitMarkdown && typeof global.GoToolkitMarkdown.render === "function") {
            return global.GoToolkitMarkdown.render(text);
        }
        return escapeHtml(text).replace(/\n/g, "<br>");
    }

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
        var snippetValue = typeof payload.snippet === "string"
            ? payload.snippet.trim()
            : (typeof payload.text === "string" ? payload.text.trim() : "");
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
        this.headerDocCountEl = null;
        this.knowledgeDocumentNames = [];
        this.headerDocCountTooltipDefault = "Base de connaissance";
        this.previewPanel = null;
        this.previewTitleEl = null;
        this.previewBodyEl = null;
        this.previewCloseBtn = null;
        this.previewIframeEl = null;
        this.previewPdfUrl = null;
        this.pendingPdfHighlight = null;
        this.promptPresetId = readPromptPreset();
        this.promptDropdown = null;
        this.promptDropdownButton = null;
        this.promptDropdownMenu = null;
        this.documentCounts = { context: 0, gallery: 0 };
        this.knowledgeConversationId = global.GoToolkitKnowledgeConversationId || "knowledge";
        this.knowledgeDocumentNames = [];
        this.knowledgeDocumentCount = 0;
        this.knowledgeManifestStore = createKnowledgeManifestStore();
        this.knowledgeOverridesStore = createKnowledgeOverridesStore();
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
    }

    AssistSidebar.prototype.persist = function () {
        this.conversation.updatedAt = Date.now();
        persistConversation(this.conversation);
    };

    AssistSidebar.prototype.setWidth = function (value) {
        this.sidebarWidth = clampWidth(value);
        if (this.sidebar) {
            this.sidebar.style.width = this.sidebarWidth + "px";
        }
        if (this.isOpen) {
            this.applyPagePadding();
        }
        this.updateSidebarWidthVar();
    };

    AssistSidebar.prototype.applyPagePadding = function () {
        if (!this.page) return;
        var offset = Math.max(0, this.sidebarWidth);
        this.page.style.marginRight = this.isOpen ? offset + "px" : "";
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
        this.sidebar.style.display = "flex";
        this.applyPagePadding();
        this.updateSidebarWidthVar();
        if (this.toggleButton) {
            this.toggleButton.classList.add("active");
        }
        persistOpenState(true);
        if (this.textarea) {
            this.textarea.focus();
        }
        this.syncKnowledgeModalVisibility();
    };

    AssistSidebar.prototype.syncKnowledgeModalVisibility = function () {
        if (!this.isOpen) return;
        if (this.promptPresetId === "ask" || this.promptPresetId === "edit") {
            this.closeKnowledgeModal(false);
        } else {
            // Mode "advice" (conseiller)
            var preference = loadKnowledgeModalOpenState();
            if (preference === null) {
                // No preference yet, auto-open only if conversation is empty
                if (!this.conversation || !this.conversation.messages || this.conversation.messages.length === 0) {
                    this.openKnowledgeModal();
                } else {
                    this.closeKnowledgeModal(false);
                }
            } else if (preference === true) {
                this.openKnowledgeModal();
            } else {
                this.closeKnowledgeModal(false);
            }
        }
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
        this.sidebar.style.display = "none";
        this.applyPagePadding();
        this.updateSidebarWidthVar();
        if (this.toggleButton) {
            this.toggleButton.classList.remove("active");
        }
        persistOpenState(false);
    };

    AssistSidebar.prototype.toggle = function () {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
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
        this.setPromptPreset(this.promptPresetId);
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
        this.attachmentsTotalCount = 0;
        this.attachmentsParsedCount = 0;
        this.updateAttachmentIndicator();
        this.updateComposerState();
    };

    AssistSidebar.prototype.handleRemoveAttachedDocuments = function () {
        var names = (this.pendingDocumentAttachments || []).slice();
        if (!names.length) return;
        this.clearAttachments();
        if (!this.docManager) return;
        var self = this;
        this.docManager.deleteDocumentsByNames(this.conversation.id, names)
            .then(function () {
                self.refreshDocumentStats();
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
        this.speechRecognition.interimResults = true;
        this.speechRecognition.maxAlternatives = 1;
        this.isListening = true;
        this.toggleListeningStyles(true);
        const self = this;

        this.speechRecognition.onresult = function (event) {
            const transcript = Array.from(event.results)
                .map(result => (result[0] ? result[0].transcript : ""))
                .join("");
            if (self.textarea) {
                self.textarea.value = transcript.trim();
                self.handleInputResize();
                self.updateComposerState();
            }
        };

        this.speechRecognition.onerror = function () {
            self.stopSpeechRecognition();
        };

        this.speechRecognition.onend = function () {
            self.stopSpeechRecognition();
        };

        try {
            this.speechRecognition.start();
        } catch (err) {
            console.warn("Speech recognition failed", err);
            self.stopSpeechRecognition();
        }
    };

    AssistSidebar.prototype.stopSpeechRecognition = function () {
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
        }
        this.syncBotExtras(entry, message);
        this.scrollToBottom();
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
            prepend.textContent = "↪︎ " + (options.selectionExcerpt || message.selectionExcerpt);
            contentWrapper.appendChild(prepend);
        }

        var bubble = document.createElement("div");
        bubble.className = "chat-bubble";
        contentWrapper.appendChild(bubble);
        wrapper.appendChild(contentWrapper);

        var content = document.createElement("div");
        content.className = "chat-content";
        bubble.appendChild(content);

        if (message.role === "bot") {
            content.innerHTML = this.renderBotContent(message);
        } else {
            content.innerHTML = escapeHtml(message.content || "").replace(/\n/g, "<br>");
        }

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
                keepAllBtn.textContent = "✓ Garder tout";
                keepAllBtn.addEventListener("click", function () {
                    if (typeof window.setEditorMarkdown === 'function') {
                        window.setEditorMarkdown(message.data.output);
                    }
                    actionsEl.remove();
                });

                var rejectAllBtn = document.createElement("button");
                rejectAllBtn.type = "button";
                rejectAllBtn.className = "chat-bubble-action-btn chat-bubble-action-reject";
                rejectAllBtn.textContent = "✗ Refuser tout";
                rejectAllBtn.addEventListener("click", function () {
                    actionsEl.remove();
                });

                actionsEl.appendChild(keepAllBtn);
                actionsEl.appendChild(rejectAllBtn);
                bubble.appendChild(actionsEl);
            }

            this.syncBotExtras(entry, message);
        }
        this.messageNodes[message.id] = entry;
        this.scrollToBottom();
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
        var askPersisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.info");
        var askPrompt = askPersisted
            || global.GoToolkitChatPrompt?.INFO_PROMPT
            || global.GoToolkitChatPrompt?.DEFAULT_INFO_PROMPT
            || "";

        var editPersisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.edit");
        var editPrompt = editPersisted
            || storePresets?.edit?.prompt
            || storePresets?.edit?.defaultPrompt
            || "";

        var all = {
            advice: {
                id: "advice",
                label: storePresets?.advice?.label || "↬ Conseiller",
                prompt: advicePrompt
            },
            ask: {
                id: "ask",
                label: storePresets?.ask?.label || "⌕ Explorer",
                prompt: askPrompt
            },
            edit: {
                id: "edit",
                label: storePresets?.edit?.label || "✂ Éditer",
                prompt: editPrompt
            }
        };

        var filtered = {};
        allowed.forEach(function (id) {
            if (all[id]) filtered[id] = all[id];
        });
        return filtered;
    };

    AssistSidebar.prototype.setPromptPreset = function (presetId) {
        var allowed = getAllowedPromptPresetIds();
        var next = allowed.includes(presetId) ? presetId : (allowed[0] || "advice");
        this.promptPresetId = next;
        persistPromptPreset(next);
        this.updatePromptDropdownLabel();
        this.updateHeaderDocumentCount();
        this.refreshDocumentStats();
        this.syncKnowledgeModalVisibility();
    };

    AssistSidebar.prototype.getActiveSystemPrompt = function () {
        if (this.promptPresetId === "ask") {
            var persisted = getPersistedPromptOrEmpty("goToolkit.chat.prompt.info");
            if (persisted) return persisted;
            return global.GoToolkitChatPrompt?.INFO_PROMPT
                || global.GoToolkitChatPrompt?.DEFAULT_INFO_PROMPT
                || "";
        }
        if (this.promptPresetId === "edit") {
            var persistedEdit = getPersistedPromptOrEmpty("goToolkit.chat.prompt.edit");
            if (persistedEdit) return persistedEdit;
            return global.GoToolkitChatPrompt?.PRESETS.edit.prompt
                || global.GoToolkitChatPrompt?.PRESETS.edit.defaultPrompt
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
        if (userContent) {
            if (this.promptPresetId === "edit") {
                var docContent = window.getEditorMarkdown ? window.getEditorMarkdown() : (window.getEditorContent ? window.getEditorContent() : "");
                userContent = "DOCUMENT\n" + docContent + "\n\nASK\n" + userContent;
            } else {
                userContent = "ASK\n" + userContent;
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
        if (this.promptPresetId !== "ask" && hasDocEntries(knowledgeDocInfo)) {
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
            var record = {
                chunkId: entry.chunkId,
                documentId: entry.documentId,
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
        const [chunks, docs] = await Promise.all([
            this.docManager.getChunks(conversationId),
            this.docManager.getDocuments(conversationId)
        ]);
        const docMap = new Map();
        (docs || []).forEach(function (doc) {
            if (doc && doc.id) {
                docMap.set(doc.id, doc);
            }
        });
        const chunkMap = new Map();
        (chunks || []).forEach(function (chunk) {
            const docMeta = docMap.get(chunk.docId);
            chunkMap.set(chunk.id, Object.assign({}, chunk, {
                docName: docMeta?.name || "Document",
                sourceType: docMeta?.sourceType || "context",
                docScopes: Array.isArray(docMeta?.scope) ? docMeta.scope : [],
                docAbstract: docMeta?.abstract || ""
            }));
        });
        this.cacheDocuments(docs);
        return { chunks, docs, chunkMap, docMap };
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
        // Intentionally no-op to avoid verbose logging in production.
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

    AssistSidebar.prototype.handleSend = async function () {
        if (this.isStreaming) return;
        if (!this.textarea) return;
        var value = this.textarea.value.trim();
        var hasAttachment = this.pendingDocumentAttachments.length > 0;
        if (!value && !hasAttachment) return;
        // log the outgoing user content once the payload is ready

        var userMessage = createMessage("user", value);
        var systemPrompt = this.getActiveSystemPrompt();
        var shouldFetchKnowledge = this.promptPresetId !== "ask" && this.promptPresetId !== "edit";
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
        }
        var attachments = this.pendingDocumentAttachments;
        if (attachments && attachments.length) {
            userMessage.attachments = attachments.slice();
            this.clearAttachments();
        }
        this.conversation.messages.push(userMessage);
        this.appendMessage(userMessage);
        this.persist();
        this.textarea.value = "";
        this.textarea.style.height = "auto";

        var botMessage = createMessage("bot", "...");
        botMessage.references = [];
        botMessage.suggestions = [];
        botMessage.retrievalEntries = docInfo;
        var botMessageAppended = false;
        this.isStreaming = true;
        this.updateComposerState();
        this.scrollToBottom();

        var controller = new AbortController();
        this.controller = controller;

        var payload = this.buildPayload(systemPrompt, userMessage, docInfo);
        console.log("AI payload messages", payload.messages.map(function (msg) {
            return { role: msg.role, content: msg.content };
        }));
        var self = this;

        // Pre-append a placeholder bubble so the user sees activity immediately.
        botMessageAppended = true;
        this.conversation.messages.push(botMessage);
        this.appendMessage(botMessage);

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

        function handleChunk(chunk) {
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
            }
            self.throttledPersist();
        }

        try {
            var result = await global.GoToolkitIA.chatCompletion({
                payload: payload,
                endpointType: "responses",
                signal: controller.signal,
                onChunk: payload.stream ? handleChunk : undefined
            });
            var parsed = this.parseAssistantResponse(result || "");
            if (parsed.content === "Réponse illisible." && botMessage.content) {
                parsed.content = botMessage.content;
            }
            console.log("AI response", {
                content: parsed.content,
                references: parsed.references,
                suggestions: parsed.suggestions,
                operations: parsed.operations,
                output: parsed.output
            });
            botMessage.content = parsed.content;
            botMessage.references = parsed.references;
            botMessage.suggestions = parsed.suggestions;
            if (this.promptPresetId === "edit") {
                var applied = false;
                if (parsed.output && typeof window.setEditorMarkdown === "function") {
                    window.setEditorMarkdown(parsed.output);
                    applied = true;
                } else if (parsed.output && typeof window.setEditorContent === "function") {
                    // Fallback: treat output as raw content if the host editor doesn't support markdown.
                    window.setEditorContent(parsed.output);
                    applied = true;
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
            appendBotMessageIfNeeded();
            this.updateBotMessage(botMessage);
            this.persist();
        } finally {
            this.isStreaming = false;
            this.controller = null;
            this.updateComposerState();
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
            global.removeEventListener("mousemove", onMouseMove);
            global.removeEventListener("mouseup", onMouseUp);
            saveWidth(self.sidebarWidth);
        }

        resizer.addEventListener("mousedown", function (event) {
            startX = event.clientX;
            startWidth = self.sidebarWidth;
            global.addEventListener("mousemove", onMouseMove);
            global.addEventListener("mouseup", onMouseUp);
        });
    };

    AssistSidebar.prototype.updatePromptDropdownLabel = function () {
        if (this.promptDropdownButton) {
            var presets = this.getPromptPresets();
            var activePreset = presets && presets[this.promptPresetId];
            var label = activePreset?.label || ("/" + this.promptPresetId);
            var displayLabel = label + " ▾";
            this.promptDropdownButton.textContent = displayLabel;
            this.promptDropdownButton.title = "Mode: " + label;
        }
        if (this.promptDropdownMenu) {
            var buttons = this.promptDropdownMenu.querySelectorAll("[data-preset]");
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
        button.textContent = "/ ▾";
        button.addEventListener("click", function (event) {
            event.stopPropagation();
            this.togglePromptDropdown();
        }.bind(this));

        var menu = document.createElement("div");
        menu.className = "chat-prompt-menu";
        menu.hidden = true;

        var presets = this.getPromptPresets();
        Object.keys(presets).forEach(function (key) {
            var preset = presets[key];
            var item = document.createElement("button");
            item.type = "button";
            item.className = "chat-prompt-menu-item";
            item.dataset.preset = preset.id;
            item.textContent = preset.label || ("/" + preset.id);
            item.addEventListener("click", function (event) {
                event.stopPropagation();
                this.setPromptPreset(preset.id);
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

    AssistSidebar.prototype.buildUI = function () {
        if (!this.root) return;
        this.page = document.getElementById("page");
        var staticLauncher = document.getElementById("assistLauncherBtn");
        if (staticLauncher) {
            this.toggleButton = staticLauncher;
            this.toggleButton.classList.add("chat-toggle-button");
        } else {
            this.toggleButton = document.createElement("button");
            this.toggleButton.id = "chatToggleBtn";
            this.toggleButton.type = "button";
            this.toggleButton.className = "feedback-button chat-toggle-button";
            this.toggleButton.textContent = "⌬ Assist";
            document.body.appendChild(this.toggleButton);
        }

        this.toggleButton.addEventListener("click", this.toggle.bind(this));

        this.sidebar = document.createElement("div");
        this.sidebar.id = "assistSidebar";
        this.sidebar.className = "chat-sidebar";
        this.sidebar.style.display = "none";
        this.sidebar.style.width = this.sidebarWidth + "px";

        var resizer = document.createElement("div");
        resizer.className = "chat-resizer";
        this.sidebar.appendChild(resizer);

        var header = document.createElement("div");
        header.className = "chat-header";
        var title = document.createElement("span");
        title.className = "chat-header-title";
        title.textContent = "⌬ Assist";
        header.appendChild(title);

        var headerActions = document.createElement("div");
        headerActions.className = "chat-header-actions";
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "btn-secondary chat-header-btn";
        closeBtn.textContent = "<";
        closeBtn.addEventListener("click", this.close.bind(this));
        header.insertBefore(closeBtn, title);

        this.headerDocCountEl = document.createElement("button");
        this.headerDocCountEl.type = "button";
        this.headerDocCountEl.className = "chat-corpus-modal-toggle";
        this.headerDocCountEl.textContent = "🗎 Corpus";
        this.headerDocCountEl.setAttribute("title", this.headerDocCountTooltipDefault);
        this.headerDocCountEl.addEventListener("click", this.handleHeaderDocCountClick.bind(this));
        this.headerDocCountEl.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                this.handleHeaderDocCountClick();
            }
        }.bind(this));
        headerActions.appendChild(this.headerDocCountEl);
        this.clearButton = document.createElement("button");
        this.clearButton.id = "chatClearBtn";
        this.clearButton.type = "button";
        this.clearButton.className = "btn-secondary chat-header-btn";
        this.clearButton.textContent = "⊘";
        this.clearButton.addEventListener("click", this.clearConversation.bind(this));
        headerActions.appendChild(this.clearButton);

        header.appendChild(headerActions);
        this.sidebar.appendChild(header);

        this.messagesEl = document.createElement("div");
        this.messagesEl.className = "chat-messages";
        this.sidebar.appendChild(this.messagesEl);

        var composer = document.createElement("div");
        composer.className = "chat-composer";
        this.composer = composer;
        this.textarea = document.createElement("textarea");
        this.textarea.className = "chat-input";
        this.textarea.rows = 2;
        this.textarea.placeholder = "Que veux-tu demander ?";
        this.textarea.addEventListener("input", this.handleInputResize.bind(this));
        this.textarea.addEventListener("input", this.updateComposerState.bind(this));
        this.textarea.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.handleSend();
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

        this.scrollButton = document.createElement("button");
        this.scrollButton.type = "button";
        this.scrollButton.id = "chatAttachFilesBtn";
        this.scrollButton.className = "btn-secondary chat-attach-files-btn chat-scroll-btn";
        this.scrollButton.textContent = "+";
        this.scrollButton.addEventListener("click", this.openDocumentSelector.bind(this));
        composerLeftActions.appendChild(this.scrollButton);

        this.docsIndicatorButton = document.createElement("button");
        this.docsIndicatorButton.type = "button";
        this.docsIndicatorButton.id = "chatAttachedFilesIndicatorBtn";
        this.docsIndicatorButton.className = "btn-secondary chat-attached-files-indicator chat-docs-indicator";
        this.docsIndicatorButton.hidden = true;
        this.docsIndicatorButton.style.display = "none";
        this.docsIndicatorButton.addEventListener("click", this.openDocumentSelector.bind(this));
        this.docsIndicatorLabelEl = document.createElement("span");
        this.docsIndicatorLabelEl.className = "chat-attached-files-indicator__label chat-docs-indicator__label";
        this.docsIndicatorButton.appendChild(this.docsIndicatorLabelEl);
        this.docsIndicatorDeleteEl = document.createElement("span");
        this.docsIndicatorDeleteEl.className = "chat-delete chat-attached-files-indicator__delete chat-docs-indicator__delete";
        this.docsIndicatorDeleteEl.textContent = "×";
        this.docsIndicatorDeleteEl.setAttribute("aria-label", "Supprimer les documents");
        this.docsIndicatorDeleteEl.addEventListener("click", function (event) {
            event.stopPropagation();
            this.handleRemoveAttachedDocuments();
        }.bind(this));
        this.docsIndicatorDeleteEl.style.marginLeft = "4px";
        this.docsIndicatorButton.appendChild(this.docsIndicatorDeleteEl);
        composerLeftActions.appendChild(this.docsIndicatorButton);

        composerActions.appendChild(composerLeftActions);

        this.sendButton = document.createElement("button");
        this.sendButton.type = "button";
        this.sendButton.className = "btn-primary chat-send-btn";
        this.sendButton.textContent = "↩︎";
        this.sendButton.addEventListener("click", this.handleSend.bind(this));
        composerActions.appendChild(this.sendButton);

        composer.appendChild(composerActions);

        this.speechButton = document.createElement("button");
        this.speechButton.type = "button";
        this.speechButton.className = "speech-button";
        this.speechButton.textContent = "◉";
        this.speechButton.addEventListener("click", this.handleSpeechToggle.bind(this));
        textareaWrapper.appendChild(this.speechButton);
        this.sidebar.appendChild(composer);

        this.root.appendChild(this.sidebar);
        this.mountResizer(resizer);
        this.createDocumentPickers();
        this.buildPreviewPanel();
    };

    AssistSidebar.prototype.createDocumentPickers = function () {
        if (this.documentsFileInput) return;
        this.documentsFileInput = document.createElement("input");
        this.documentsFileInput.type = "file";
        this.documentsFileInput.multiple = true;
        this.documentsFileInput.accept =
            "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,text/plain,.txt,text/markdown,.md,application/rtf,.rtf,application/msword,.doc,application/vnd.oasis.opendocument.text,.odt,application/vnd.oasis.opendocument.spreadsheet,.ods";
        this.documentsFileInput.style.display = "none";
        this.documentsFileInput.addEventListener("change", this.handleDocumentFilesSelected.bind(this));

        document.body.appendChild(this.documentsFileInput);
    };

    AssistSidebar.prototype.openDocumentSelector = function () {
        if (this.documentsFileInput) {
            this.documentsFileInput.click();
        }
    };

    AssistSidebar.prototype.setDocumentUploadStatus = function (message) {
        this.documentUploadStatus = message || "";
        this.syncDocumentIndicatorTitle(this.documentChunkCount);
    };

    AssistSidebar.prototype.syncDocumentIndicatorTitle = function (chunkCount) {
        if (!this.docsIndicatorButton) return;
        var parts = [];
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

    AssistSidebar.prototype.setPendingDocumentAttachments = function (names) {
        this.pendingDocumentAttachments = (names || []).filter(Boolean);
        this.attachmentsParsedCount = this.pendingDocumentAttachments.length;
        if (!this.pendingDocumentAttachments.length) {
            this.attachmentsTotalCount = 0;
        }
        this.updateAttachmentIndicator();
        this.syncDocumentIndicatorTitle(this.documentChunkCount);
    };

    AssistSidebar.prototype.updateAttachmentIndicator = function () {
        if (!this.docsIndicatorButton) return;
        var label = this.computeDocsIndicatorLabel();
        if (!label) {
            this.docsIndicatorButton.hidden = true;
            this.docsIndicatorButton.style.display = "none";
            if (this.docsIndicatorLabelEl) {
                this.docsIndicatorLabelEl.textContent = "";
            }
            if (this.docsIndicatorDeleteEl) {
                this.docsIndicatorDeleteEl.style.display = "none";
            }
            return;
        }
        this.docsIndicatorButton.hidden = false;
        this.docsIndicatorButton.style.display = "";
        if (this.docsIndicatorLabelEl) {
            this.docsIndicatorLabelEl.textContent = label;
        }
        if (this.docsIndicatorDeleteEl) {
            this.docsIndicatorDeleteEl.style.display = "";
        }
    };

    AssistSidebar.prototype.computeDocsIndicatorLabel = function () {
        var parsed = Number(this.attachmentsParsedCount) || 0;
        var total = Number(this.attachmentsTotalCount) || 0;
        if (this.pendingDocumentAttachments.length === 1) {
            return this.pendingDocumentAttachments[0];
        }
        if (total) {
            if (parsed === total) {
                return "🗎 " + total + " documents";
            }
            return "🗎 " + parsed + " / " + total + " documents";
        }
        if (parsed) {
            return "🗎 " + parsed;
        }
        return "";
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
        var fileArray = Array.from(files);
        if (!fileArray.length) return;
        if (this.documentsFileInput) this.documentsFileInput.disabled = true;
        this.attachmentsTotalCount = fileArray.length;
        this.attachmentsParsedCount = 0;
        this.pendingDocumentAttachments = fileArray.map(function (file) {
            return file.name;
        });
        this.updateAttachmentIndicator();
        this.updateComposerState();
        this.setDocumentUploadStatus("Indexation en cours…");
        try {
            var metadata = new Map();
            fileArray.forEach(function (file) {
                metadata.set(file.name, {
                    scope: "attachments",
                    name: file.name,
                    abstract: "Pièce jointe"
                });
            });
            var results = await this.docManager.ingestFiles(fileArray, this.conversation.id, {
                onProgress: this.handleDocumentProgress.bind(this),
                sourceType: "context",
                metadata: metadata
            });
            var errors = results.filter(function (item) {
                return !item.success;
            });
            if (errors.length) {
                this.setDocumentUploadStatus("Erreur : " + (errors[0].error || "échec d'indexation"));
            } else {
                this.setDocumentUploadStatus("Indexation terminée.");
            }
            var readyDocs = results
                .filter(function (item) {
                    return item.success;
                })
                .map(function (item) {
                    return item.name;
                });
            this.setPendingDocumentAttachments(readyDocs);
        } catch (error) {
            this.setDocumentUploadStatus("Erreur : " + ((error && error.message) || "échec"));
            this.setPendingDocumentAttachments([]);
        } finally {
            if (this.documentsFileInput) this.documentsFileInput.disabled = false;
        }
    };

    AssistSidebar.prototype.handleDocumentProgress = function (progress) {
        if (!progress) return;
        if (progress.type === "chunk") {
            this.setDocumentUploadStatus("Indexation " + progress.progress + "% → " + (progress.file || ""));
        } else if (progress.type === "file-start") {
            this.setDocumentUploadStatus("Ouverture de " + progress.file + " (" + progress.index + "/" + progress.total + ")");
        } else if (progress.type === "file-done") {
            this.setDocumentUploadStatus("Fichier traité : " + (progress.file || ""));
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

    AssistSidebar.prototype.getCorpusDocumentCount = function () {
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
        var showCorpusButton = this.promptPresetId !== "ask";
        this.headerDocCountEl.style.display = showCorpusButton ? "" : "none";
        var count = this.getCorpusDocumentCount();
        this.headerDocCountEl.dataset.count = count;
        this.headerDocCountEl.textContent = "🗎 Corpus";
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
            return "Il y a moins d'une minute";
        }
        var deltaMinutes = Math.floor(deltaSeconds / 60);
        if (deltaMinutes < 60) {
            return "Il y a " + deltaMinutes + " minute" + (deltaMinutes > 1 ? "s" : "");
        }
        var deltaHours = Math.floor(deltaMinutes / 60);
        if (deltaHours < 24) {
            return "Il y a " + deltaHours + " heure" + (deltaHours > 1 ? "s" : "");
        }
        var deltaDays = Math.floor(deltaHours / 24);
        return "Il y a " + deltaDays + " jour" + (deltaDays > 1 ? "s" : "");
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
        if (!Array.isArray(manifest)) {
            return [];
        }
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
        if (!overrides || typeof overrides !== "object") return entries || [];
        return (entries || []).map(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            var override = key ? overrides[key] : null;
            if (!override || typeof override !== "object") return entry;
            return Object.assign({}, entry, {
                name: typeof override.name === "string" && override.name.trim() ? override.name.trim() : entry.name,
                abstract: typeof override.abstract === "string" ? override.abstract : entry.abstract
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
        title.textContent = "🗎 Corpus | 0 documents";
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
        var count = this.getCorpusDocumentCount();
        var suffix = count === 1 ? "document" : "documents";
        this.knowledgeModalTitleEl.textContent = "🗎 Corpus | " + count + " " + suffix;
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
            var selectionSet = new Set();
            entries.forEach(function (entry) {
                var key = this.normalizeKnowledgeKey(entry.fileName);
                if (key) {
                    selectionSet.add(key);
                }
            }.bind(this));
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
        input.accept =
            "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,text/plain,.txt,text/markdown,.md,application/rtf,.rtf,application/msword,.doc,application/vnd.oasis.opendocument.text,.odt,application/vnd.oasis.opendocument.spreadsheetml.sheet,.ods";
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

    AssistSidebar.prototype.ingestKnowledgeFiles = async function (files) {
        if (!this.docManager) return;
        var fileArray = Array.from(files);
        if (!fileArray.length) return;
        this.setKnowledgeModalStatus("Importation en cours…");
        try {
            var metadata = new Map();
            fileArray.forEach(function (file) {
                metadata.set(file.name, {
                    name: file.name,
                    abstract: "",
                    updatedAt: file.lastModified || Date.now(),
                    fileName: file.name,
                    scope: ["attachments", "local"]
                });
            });
            await this.docManager.ingestFiles(fileArray, this.knowledgeConversationId, {
                sourceType: "embedded",
                metadata: metadata
            });
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

    AssistSidebar.prototype.openKnowledgeModal = function (persist) {
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
        this.knowledgeLocalDocRefs.clear();
        this.knowledgeChatDocRefs.clear();
        if (this.docManager) {
            try {
                var docs = await this.docManager.getDocuments(this.knowledgeConversationId);
                (docs || []).forEach(function (doc) {
                    if (!doc) return;
                    var key = this.normalizeKnowledgeKey(doc.sourceFileName || doc.name);
                    if (!key) return;
                    indexedSet.add(key);
                    var isLocal = Array.isArray(doc.scope) && doc.scope.includes("local");
                    if (!isLocal && webMap.has(key)) return;
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
        if (localEntries.length) {
            localEntries = await this.applyKnowledgeOverrides(localEntries);
        }
        this.knowledgeManifestEntries = webEntries.concat(localEntries, chatEntries);
        var selectionSet = new Set(indexedSet);
        var newEntries = webEntries.filter(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            return key && !storedSet.has(key);
        }.bind(this));
        var hasStoredList = Array.isArray(storedList) && storedList.length;
        if (!hasStoredList && indexedSet.size) {
            newEntries = [];
        }
        if (newEntries.length) {
            newEntries.forEach(function (entry) {
                var key = this.normalizeKnowledgeKey(entry.fileName);
                if (key) selectionSet.add(key);
            }.bind(this));
        }
        this.renderKnowledgeModalList(this.knowledgeManifestEntries, selectionSet);
        if (newEntries.length && !options.skipAutoReindex) {
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
        sorted.forEach(function (entry) {
            var key = this.normalizeKnowledgeKey(entry.fileName);
            var checked = selectionSet && selectionSet.has(key);
            var fullName = entry.name || "";
            var truncatedName = this.truncateKnowledgeName(fullName);
            var abstractText = entry.abstract || "";
            var truncatedAbstract = this.truncateKnowledgeAbstract(abstractText);
            html.push(
                "<div class=\"chat-knowledge-modal__row\" data-key=\"" + escapeHtml(key) + "\">" +
                "<div><input type=\"checkbox\" class=\"chat-knowledge-modal__checkbox\" data-key=\"" + escapeHtml(key) + "\" " + (checked ? "checked" : "") + "></div>" +
                "<div class=\"chat-knowledge-modal__name-cell\">" +
                "<button type=\"button\" class=\"chat-knowledge-modal__edit\" data-key=\"" + escapeHtml(key) + "\" aria-label=\"Modifier\">✐</button>" +
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
            : this.knowledgeLocalDocRefs.get(key);
        var names = (ref?.name ? [ref.name] : []);
        if (!names.length) return false;
        try {
            await this.docManager.deleteDocumentsByNames(targetId, names);
            if (entry.source === "Chat") {
                this.knowledgeChatDocRefs.delete(key);
            } else {
                this.knowledgeLocalDocRefs.delete(key);
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
                if (source === "Local") {
                    var localDoc = localDocMap.get(key);
                    if (localDoc?.fileBuffer) {
                        file = this.createKnowledgeFile(
                            localDoc.fileBuffer,
                            localDoc.sourceFileName || localDoc.name || entry.fileName,
                            localDoc.mime || ""
                        );
                        metadata.set(entry.fileName, {
                            name: entry.name,
                            abstract: entry.abstract || "",
                            updatedAt: entry.updatedAt,
                            fileName: entry.fileName,
                            scope: ["attachments", "local"]
                        });
                    }
                } else {
                    file = await this.fetchKnowledgeDocument(entry);
                    if (file) {
                        metadata.set(entry.fileName, {
                            name: entry.name,
                            abstract: entry.abstract || "",
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
                var selection = new Set(manifest.map(function (entry) {
                    return this.normalizeKnowledgeKey(entry.fileName);
                }.bind(this)));
                await this.reindexKnowledgeSelection(manifest, selection);
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
                : "Non trouvé dans la base";
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
        backBtn.setAttribute("aria-label", "Retour à la base de connaissance");
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
            iframe.src = "js/pdf-viewer?file=" + encodeURIComponent(url);
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
            if (doc?.id) {
                if (isPdfDocument(doc)) {
                    if (this.showPdfPreview(doc)) {
                        return;
                    }
                }
                var docChunks = await this.getDocumentChunks(doc.id, doc.conversationId);
                snippet = docChunks.length ? (docChunks[0].text || "") : "";
                this.renderDocumentText(docChunks, { snippet: snippet, doc: doc });
                return;
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

    AssistSidebar.prototype.openKnowledgePreview = async function (entry) {
        if (!entry || !this.docManager) return;
        this.buildPreviewPanel();
        if (!this.previewPanel) return;
        this.previewPanel.classList.add("open");
        this.previewPanel.setAttribute("aria-hidden", "false");
        this.previewTitleEl && (this.previewTitleEl.textContent = entry.name || "Document");
        this.clearPreviewIframe();
        if (this.previewBodyEl) {
            this.previewBodyEl.innerHTML = "<div class=\"chat-doc-preview__loading\">Chargement…</div>";
        }
        try {
            var doc = await this.findKnowledgeDocumentForPreview(entry);
            if (doc?.id) {
                if (isPdfDocument(doc)) {
                    if (this.showPdfPreview(doc)) {
                        return;
                    }
                }
                var docChunks = await this.getDocumentChunks(doc.id, doc.conversationId);
                this.renderDocumentText(docChunks, { doc: doc });
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
                if (isPdfDocument(doc)) {
                    this.setPdfHighlight(highlightInfo);
                    if (this.showPdfPreview(doc)) {
                        return;
                    }
                    this.setPdfHighlight(null);
                }
                if (!isPdfDocument(doc)) {
                    this.setPdfHighlight(null);
                }
                this.renderDocumentText(docChunks, {
                    highlightChunkIds: Array.from(relatedChunkIds),
                    snippet: previewSnippet,
                    highlightLine: typeof reference.line === "number" ? reference.line : undefined,
                    doc: doc
                });
                return;
            }
        } catch (err) {
            console.warn("Reference preview failed", err);
        }
        if (this.previewBodyEl) {
            var content = snippet || "(extrait indisponible)";
            this.previewBodyEl.innerHTML = this.formatPreviewText(content, reference.line);
            if (typeof reference.line === "number") {
                var target = this.previewBodyEl.querySelector("[data-line=\"" + reference.line + "\"]");
                if (target && typeof target.scrollIntoView === "function") {
                    target.scrollIntoView({ block: "center" });
                }
            }
        }
    };

    AssistSidebar.prototype.formatPreviewText = function (text, highlightLine, options) {
        var opts = options || {};
        var docMeta = opts.doc || null;
        if (isMarkdownDocument(docMeta, opts)) {
            return renderBotMarkdown(String(text || ""));
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

    AssistSidebar.prototype.renderDocumentText = function (chunks, options) {
        if (!this.previewBodyEl) return;
        var opts = options || {};
        var snippet = typeof opts.snippet === "string" ? opts.snippet.trim() : "";
        var highlightChunkIds = new Set(
            (Array.isArray(opts.highlightChunkIds) ? opts.highlightChunkIds : [])
                .filter(Boolean)
        );
        var highlightLine = Number.isFinite(opts.highlightLine) ? opts.highlightLine : null;
        var docMeta = opts.doc || null;
        var renderMarkdown = isMarkdownDocument(docMeta, opts);
        var normalized = normalizePreviewChunks(chunks);
        if (!normalized.length) {
            if (snippet) {
                this.previewBodyEl.innerHTML = this.formatPreviewText(snippet, highlightLine, opts);
            } else {
                this.previewBodyEl.innerHTML = "(extrait indisponible)";
            }
            return;
        }
        if (renderMarkdown) {
            var markdownSource = this.buildMarkdownContent(chunks);
            if (!markdownSource && snippet) {
                markdownSource = snippet;
            }
            var markdownHtml = renderBotMarkdown(markdownSource);
            this.previewBodyEl.innerHTML = markdownHtml || "(extrait indisponible)";
            return;
        }
        var html = [];
        var lineNo = 0;
        var highlightLines = new Set();
        var normalizedSnippet = normalizeSpaces(snippet);
        normalized.forEach(function (entry) {
            var chunkRaw = String(entry.text || "");
            var rawLines = chunkRaw.split(/\r?\n/);
            if (!rawLines.length) rawLines = [""];
            var chunkLineStart = lineNo + 1;
            var chunkLineEnd = chunkLineStart + rawLines.length - 1;
            lineNo = chunkLineEnd;
            var chunkContent = rawLines
                .map(function (line) {
                    return normalizeSpaces(line);
                })
                .filter(Boolean)
                .join(" ");
            if (!chunkContent) return;
            var matchesSnippet = normalizedSnippet
                ? chunkContent.toLowerCase().includes(normalizedSnippet.toLowerCase())
                : false;
            var highlightChunk = entry.chunkKey && highlightChunkIds.has(entry.chunkKey);
            var highlightLineActive = highlightLine && highlightLine >= chunkLineStart && highlightLine <= chunkLineEnd;
            if (highlightChunk || highlightLineActive) {
                highlightLines.add(chunkLineStart);
            }
            var cls = "chat-doc-preview__line";
            if (highlightChunk || highlightLineActive) {
                cls += " chat-doc-preview__line--highlight";
            }
            var snippetHtml = matchesSnippet
                ? highlightSnippetText(chunkContent, normalizedSnippet)
                : escapeHtml(chunkContent);
            html.push(
                "<div class=\"" + cls + "\" data-line=\"" + chunkLineStart + "\" data-chunk=\"" + escapeHtml(entry.chunkKey || "") + "\">" +
                "<span class=\"chat-doc-preview__line-number\">" + chunkLineStart + "</span>" +
                "<div class=\"chat-doc-preview__line-text\">" + snippetHtml + "</div>" +
                "</div>"
            );
        });
        this.previewBodyEl.innerHTML = html.join("");
        var targetLine = null;
        if (highlightLine && highlightLines.has(highlightLine)) {
            targetLine = this.previewBodyEl.querySelector("[data-line=\"" + highlightLine + "\"]");
        }
        if (!targetLine && highlightLines.size) {
            targetLine = this.previewBodyEl.querySelector(".chat-doc-preview__line--highlight");
        }
        if (targetLine && typeof targetLine.scrollIntoView === "function") {
            targetLine.scrollIntoView({ block: "center" });
        }
    };

    AssistSidebar.prototype.init = function () {
        if (!this.root) return;
        if (!global.GoToolkitIA || typeof global.GoToolkitIA.chatCompletion !== "function") {
            console.error("GoToolkitIA indisponible pour le chat.");
            return;
        }
        this.buildUI();
        this.renderInitialMessages();
        this.updateComposerState();
        if (this.docManager) {
            this.documentStatsWatcher = this.docManager.onStatsChange(this.refreshDocumentStats.bind(this));
            this.refreshDocumentStats();
            this.ensureInitialKnowledgeIndex();
        }
        this.syncKnowledgeModalVisibility();
        if (this.isOpen) {
            this.open();
        }
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
        const { payload, selectionExcerpt, selectionPos, editor } = options;
        const assistInstance = window.GoToolkitAssistInstance;

        if (!assistInstance) {
            return;
        }

        let botMessage = null;

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

            // Expose the last AI input (for memo source modal: AI In)
            try {
                window.__memoEditorLastAIInAt = new Date().toISOString();
                window.__memoEditorLastAIInMessages = requestMessages;
                window.__memoEditorLastAIInPayload = requestPayload;
                window.__memoEditorLastAIInDocumentMarkdown =
                    (typeof window.getMemoEditorSource === 'function'
                        ? window.getMemoEditorSource('markdown')
                        : window.getEditorMarkdown?.()) ||
                    '';
            } catch (e) {
                // noop
            }

            // 2. Extraire le ASK pour afficher le message utilisateur dans le chat.
            //    (Cherche le dernier message user qui contient ASK:)
            let askContent = '';
            for (let i = requestMessages.length - 1; i >= 0; i--) {
                const msg = requestMessages[i];
                if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') continue;
                const match = msg.content.match(/ASK:\n([\s\S]*)$/);
                if (match && match[1]) {
                    askContent = match[1].trim();
                    break;
                }
                if (!askContent) {
                    askContent = msg.content.trim();
                }
            }

            // 3. Afficher le message utilisateur dans le chat
            const userMessage = createMessage('user', askContent);
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

            // 5. Appeler l'IA
            const rawResponse = await window.GoToolkitIA?.chatCompletion({
                payload: requestPayload,
                endpointType: 'responses',
            });

            if (!rawResponse) {
                return;
            }

            // 📥 Log the received payload with structured formatting
            console.log('%c📥 AI Payload Messages (Received)', 'color: #FFF; background: #2196F3; padding: 8px 12px; border-radius: 4px; font-weight: bold;');
            console.log(typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse, null, 2));

            // 6. Normaliser la réponse et extraire les métadonnées d'édition
            let editMetadata = null;
            let responseObj = null;
            let rawTextFallback = '';

            if (typeof rawResponse === 'string') {
                try {
                    responseObj = JSON.parse(rawResponse);
                } catch (e) {
                    // Réponse texte brute (pas de JSON)
                    rawTextFallback = rawResponse.trim();
                }
            } else if (rawResponse && typeof rawResponse === 'object') {
                responseObj = rawResponse;
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

            if (payloadObj && typeof payloadObj === 'object') {
                const sOutput = payloadObj.s_output || payloadObj.sOutput || null;
                const output = payloadObj.output || null;
                if (sOutput || output) {
                    editMetadata = { sOutput, output };
                }
            }

            // Expose the last AI output (for memo source modal: AI Out)
            try {
                window.__memoEditorLastAIOutAt = new Date().toISOString();
                if (editMetadata && (editMetadata.sOutput || editMetadata.output)) {
                    window.__memoEditorLastAIOut = editMetadata.sOutput || editMetadata.output;
                } else if (payloadObj && typeof payloadObj === 'object') {
                    window.__memoEditorLastAIOut = payloadObj.s_output || payloadObj.sOutput || payloadObj.output || null;
                } else {
                    window.__memoEditorLastAIOut = rawTextFallback || null;
                }
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
                assistInstance.syncBotExtras?.(messageEntry, botMessage);
                assistInstance.scrollToBottom?.();
            }

            // 10. Mettre à jour l'éditeur selon le type de remplacement (continue dans le pipe)
            if (editor && editMetadata) {
                if (editMetadata.sOutput && typeof editMetadata.sOutput.text === 'string') {
                    // Cas SELECTION : remplacer les lignes [start, end[
                    const startLine = Number(editMetadata.sOutput.start);
                    const endLine = Number(editMetadata.sOutput.end);
                    if (Number.isFinite(startLine) && Number.isFinite(endLine) && startLine >= 0 && endLine >= startLine) {
                        const docMarkdown = window.getEditorMarkdown?.() || '';
                        const lines = docMarkdown.split('\n');
                        const newLines = [
                            ...lines.slice(0, startLine),
                            ...editMetadata.sOutput.text.split('\n'),
                            ...lines.slice(endLine)
                        ];
                        const newMarkdown = newLines.join('\n');

                        if (typeof window.setEditorMarkdown === 'function') {
                            window.setEditorMarkdown(newMarkdown);
                        } else {
                            editor
                                .chain()
                                .focus()
                                .selectAll()
                                .deleteSelection()
                                .insertContent(newMarkdown)
                                .run();
                        }
                    }
                } else if (typeof editMetadata.output === 'string' && editMetadata.output.trim()) {
                    // Cas DOCUMENT entier
                    if (typeof window.setEditorMarkdown === 'function') {
                        window.setEditorMarkdown(editMetadata.output);
                    } else {
                        editor
                            .chain()
                            .focus()
                            .selectAll()
                            .deleteSelection()
                            .insertContent(editMetadata.output)
                            .run();
                    }
                }
            }

            // 11. Persister la conversation
            assistInstance.persist?.();

        } catch (error) {
            // Mettre à jour le message bot avec l'erreur
            if (botMessage) {
                botMessage.content = '⚠️ Une erreur s\'est produite.';
                if (assistInstance.messageNodes[botMessage.id]?.contentEl) {
                    assistInstance.messageNodes[botMessage.id].contentEl.innerHTML = '⚠️ Une erreur s\'est produite.';
                }
            }
        }
    }

    // Exposer la fonction globalement
    global.sendInlineEditToAssist = sendInlineEditToAssist;

    global.GoToolkitAssist = global.GoToolkitAssist || GoToolkitAssist;
})(typeof window !== "undefined" ? window : this);
