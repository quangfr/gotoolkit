(function (global) {
    var STORAGE_KEY = "goToolkit.chat.conversation.default";
    var WIDTH_KEY = "goToolkit.chat.sidebarWidth";
    var OPEN_KEY = "goToolkit.chat.sidebarOpen";
    var DEFAULT_WIDTH = 400;
    var MIN_WIDTH = 320;
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
            if (parsed && parsed.id === "default" && Array.isArray(parsed.messages)) {
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
            id: "default",
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

    function readPromptPreset() {
        try {
            var stored = global.localStorage.getItem(PROMPT_PRESET_KEY);
            if (stored === "ask" || stored === "advice") {
                return stored;
            }
        } catch (err) {
            console.warn("Chat prompt preset read failed", err);
        }
        return "advice";
    }

    function persistPromptPreset(value) {
        try {
            global.localStorage.setItem(PROMPT_PRESET_KEY, value);
        } catch (err) {
            console.warn("Chat prompt preset save failed", err);
        }
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

    function normalizeReference(payload) {
        if (!payload || typeof payload !== "object") return null;
        var documentId = payload.documentId || payload.docId || payload.doc_id || null;
        var chunkId = payload.chunkId || payload.chunk_id || payload.chunk || null;
        var abstractLabel = typeof payload.abstract === "string" ? payload.abstract.trim() : "";
        var line = typeof payload.line === "number" ? payload.line : null;
        return {
            documentId: documentId,
            chunkId: chunkId,
            abstract: abstractLabel,
            line: line
        };
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

    function getSystemPrompt() {
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
        this.headerDocCountTooltipDefault = "Rafraîchir les documents indexés";
        this.previewPanel = null;
        this.previewTitleEl = null;
        this.previewBodyEl = null;
        this.previewCloseBtn = null;
        this.promptPresetId = readPromptPreset();
        this.promptDropdown = null;
        this.promptDropdownButton = null;
        this.promptDropdownMenu = null;
        this.documentCounts = { context: 0, gallery: 0 };
        this.knowledgeConversationId = global.GoToolkitKnowledgeConversationId || "knowledge";
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
    };

    AssistSidebar.prototype.close = function () {
        if (!this.sidebar) return;
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
            id: "default",
            updatedAt: Date.now(),
            messages: []
        };
        this.messageNodes = {};
        this.setPendingDocumentAttachments([]);
        if (this.messagesEl) {
            this.messagesEl.innerHTML = "";
        }
        this.persist();
        this.updateComposerState();
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

    AssistSidebar.prototype.appendMessage = function (message) {
        if (!this.messagesEl) return;
        var wrapper = document.createElement("div");
        wrapper.className = "chat-message chat-message--" + message.role;
        var bubble = document.createElement("div");
        bubble.className = "chat-bubble";

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

        wrapper.appendChild(bubble);
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
        var presets = global.GoToolkitChatPrompt?.PRESETS;
        if (presets) return presets;
        return {
            advice: {
                id: "advice",
                label: "⟡ Conseil",
                prompt: getSystemPrompt()
            },
            ask: {
                id: "ask",
                label: "? Demande",
                prompt: global.GoToolkitChatPrompt?.INFO_PROMPT || global.GoToolkitChatPrompt?.DEFAULT_INFO_PROMPT || ""
            }
        };
    };

    AssistSidebar.prototype.setPromptPreset = function (presetId) {
        var next = presetId === "ask" ? "ask" : "advice";
        this.promptPresetId = next;
        persistPromptPreset(next);
        this.updatePromptDropdownLabel();
        this.updateHeaderDocumentCount();
        this.refreshDocumentStats();
    };

    AssistSidebar.prototype.getActiveSystemPrompt = function () {
        if (this.promptPresetId === "ask") {
            return global.GoToolkitChatPrompt?.INFO_PROMPT
                || global.GoToolkitChatPrompt?.DEFAULT_INFO_PROMPT
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
            userContent = "ASK\n" + userContent;
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

    AssistSidebar.prototype.logHybridRetrieval = function (info) {
        console.log("hybrid retrieval", {
            label: info.label,
            query: info.query,
            queryLength: (info.query || "").split(/\s+/).filter(Boolean).length,
            topK: info.params?.topK,
            minScore: info.params?.minScore,
            keywordCandidates: info.keywordCount,
            keywordFailed: info.keywordFailed,
            vectorScope: info.vectorScope,
            contextLimit: info.contextLimit,
            finalCount: info.finalCount,
            finalChunks: (info.finalChunks || []).map(function (hit) {
                return {
                    docId: hit.docId,
                    chunkId: hit.id,
                    size: hit.size,
                    kwPresent: !!hit.kwPresent,
                    vecScore: hit.score
                };
            })
        });
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
        var shouldFetchKnowledge = this.promptPresetId !== "ask";
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
            if (parsed && parsed.answer && typeof parsed.answer.content === "string") {
                botMessage.content = parsed.answer.content;
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
                suggestions: parsed.suggestions
            });
            botMessage.content = parsed.content;
            botMessage.references = parsed.references;
            botMessage.suggestions = parsed.suggestions;
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
            this.promptDropdownButton.textContent = label;
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
        button.textContent = "/";
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
        this.toggleButton = document.createElement("button");
        this.toggleButton.id = "chatToggleBtn";
        this.toggleButton.type = "button";
        this.toggleButton.className = "feedback-button chat-toggle-button";
        this.toggleButton.textContent = "Assist";
        this.toggleButton.addEventListener("click", this.toggle.bind(this));

        var heroMeta = document.querySelector(".hero-meta");
        if (heroMeta) {
            heroMeta.insertBefore(this.toggleButton, heroMeta.firstChild);
        } else {
            document.body.appendChild(this.toggleButton);
        }

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
        title.textContent = "Assist";
        header.appendChild(title);

        var headerActions = document.createElement("div");
        headerActions.className = "chat-header-actions";
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "btn-secondary chat-header-btn";
        closeBtn.textContent = "<";
        closeBtn.addEventListener("click", this.close.bind(this));
        header.insertBefore(closeBtn, title);

        this.headerDocCountEl = document.createElement("span");
        this.headerDocCountEl.className = "chat-header-doc-count";
        this.headerDocCountEl.textContent = "🗎 0";
        this.headerDocCountEl.tabIndex = 0;
        this.headerDocCountEl.setAttribute("role", "button");
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
        this.textarea.placeholder = "Écrire un message...";
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
        this.scrollButton.className = "btn-secondary chat-scroll-btn";
        this.scrollButton.textContent = "+";
        this.scrollButton.addEventListener("click", this.openDocumentSelector.bind(this));
        composerLeftActions.appendChild(this.scrollButton);

        this.docsIndicatorButton = document.createElement("button");
        this.docsIndicatorButton.type = "button";
        this.docsIndicatorButton.className = "btn-secondary chat-docs-indicator";
        this.docsIndicatorButton.hidden = true;
        this.docsIndicatorButton.addEventListener("click", this.openDocumentSelector.bind(this));
        this.docsIndicatorLabelEl = document.createElement("span");
        this.docsIndicatorLabelEl.className = "chat-docs-indicator__label";
        this.docsIndicatorButton.appendChild(this.docsIndicatorLabelEl);
        this.docsIndicatorDeleteEl = document.createElement("span");
        this.docsIndicatorDeleteEl.className = "chat-delete chat-docs-indicator__delete";
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
            if (this.docsIndicatorLabelEl) {
                this.docsIndicatorLabelEl.textContent = "";
            }
            if (this.docsIndicatorDeleteEl) {
                this.docsIndicatorDeleteEl.style.display = "none";
            }
            return;
        }
        this.docsIndicatorButton.hidden = false;
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

    AssistSidebar.prototype.updateHeaderDocumentCount = function () {
        if (!this.headerDocCountEl) return;
        var counts = this.documentCounts || { context: 0, gallery: 0 };
        var total = counts.context + (this.promptPresetId === "ask" ? counts.gallery : 0);
        this.headerDocCountEl.dataset.count = total;
        this.headerDocCountEl.textContent = "🗎 " + total;
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
        return manifest
            .map(function (entry) {
                var path = entry?.path || "";
                var fileName = (entry?.fileName || this.getFileNameFromPath(path)).trim();
                return {
                    path: path,
                    name: (entry?.name || fileName).trim(),
                    abstract: entry?.abstract || "",
                    updatedAt: this.parseUpdatedAt(entry?.updatedAt),
                    fileName: fileName
                };
            }.bind(this))
            .filter(function (entry) {
                return entry.path && entry.fileName && entry.name;
            });
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
            return manifest
                .map(function (entry) {
                    var path = entry?.path || "";
                    var fileName = (entry?.fileName || this.getFileNameFromPath(path)).trim();
                    return {
                        path: path,
                        name: (entry?.name || fileName).trim(),
                        abstract: entry?.abstract || "",
                        updatedAt: this.parseUpdatedAt(entry?.updatedAt),
                        fileName: fileName
                    };
                }.bind(this))
                .filter(function (entry) {
                    return entry.path && entry.fileName && entry.name;
                });
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

    AssistSidebar.prototype.handleHeaderDocCountClick = function () {
        if (!this.headerDocCountEl) return;
        if (this.headerDocCountEl.dataset.refreshing === "1") return;
        this.headerDocCountEl.dataset.refreshing = "1";
        this.headerDocCountEl.classList.add("chat-header-doc-count--refreshing");
        var self = this;
        var total = 0;
        var updateCount = function (parsed, count) {
            if (!self.headerDocCountEl) return;
            if (typeof count === "number" && count > 0) {
                self.headerDocCountEl.textContent = "🗎 " + parsed + " / " + count;
                self.headerDocCountEl.dataset.manifestTotal = count;
            } else {
                self.headerDocCountEl.textContent = "🗎 " + parsed;
            }
        };
        self.fetchCurrentManifest()
            .then(async function (manifest) {
                if (!Array.isArray(manifest)) {
                    manifest = [];
                }
                total = manifest.length;
                self.cacheKnowledgeDocumentNames(manifest);
                updateCount(0, total);
                await self.purgeKnowledgeIndex();
                await self.reindexKnowledgeFromManifest(manifest, {
                    onProgress: function (parsed) {
                        updateCount(parsed, total);
                    }
                });
            })
            .catch(function (err) {
                console.error("Knowledge refresh failed", err);
            })
            .finally(function () {
                self.headerDocCountEl.dataset.refreshing = "0";
                self.headerDocCountEl.classList.remove("chat-header-doc-count--refreshing");
                updateCount(total, total);
                self.refreshDocumentStats();
            });
    };

    AssistSidebar.prototype.refreshDocumentStats = function () {
        if (!this.docManager) return;
        this.docManager.waitReady?.()
            .then(function () {
                return Promise.all([
                    this.docManager.getStats(this.conversation.id),
                    this.docManager.getDocuments(this.conversation.id),
                    this.docManager.getKeywordIndexSize?.(this.conversation.id),
                    this.docManager.getKeywordIndexSize?.(this.knowledgeConversationId)
                ]);
            }.bind(this))
            .then(function (results) {
                var stats = results ? results[0] : null;
                var docs = results ? results[1] : [];
                var ctxSize = results ? results[2] : 0;
                var knowledgeSize = results ? results[3] : 0;
                this.updateDocumentIndicator(stats, docs, {
                    context: ctxSize,
                    knowledge: knowledgeSize
                });
            }.bind(this))
            .catch(function (err) {
                console.warn("Documents stats", err);
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
                    references.push({
                        document: payload?.document || "Document",
                        documentId: payload?.documentId || payload?.docId || null,
                        chunkId: payload?.chunkId || null,
                        section: payload?.section || "",
                        page: typeof payload?.page === "number" ? payload.page : null,
                        line: typeof payload?.line === "number" ? payload.line : null,
                        type: payload?.type || ""
                    });
                    return;
                }
                if (payload.t === "suggestion" && suggestions.length < 3 && typeof payload?.label === "string") {
                    var label = payload.label.trim();
                    if (label) {
                        suggestions.push(label);
                    }
                }
            } catch (err) {
                // ignore non-JSON lines
            }
        });
        if (!seenAny) return null;
        return {
            content: content.trim() || "Réponse illisible.",
            references: references,
            suggestions: suggestions
        };
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
        try {
            var parsed = JSON.parse(trimmed);
            var payload = parsed;
            if (payload && typeof payload.content === "string") {
                var innerTrim = payload.content.trim();
                if (innerTrim.startsWith("{")) {
                    try {
                        var innerParsed = JSON.parse(innerTrim);
                        if (innerParsed && typeof innerParsed === "object") {
                            payload = innerParsed;
                        }
                    } catch (innerErr) {
                        /* ignore */
                    }
                }
            }
            var answerContent = payload?.answer?.content;
            var references = Array.isArray(payload?.references) ? payload.references : [];
            var suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
            var finalContent = typeof answerContent === "string" && answerContent.trim()
                ? answerContent.trim()
                : (typeof payload?.content === "string" && payload.content.trim()
                    ? payload.content.trim()
                    : "Non trouvé dans la base");
            return {
                content: finalContent,
                references: references
                    .map(normalizeReference)
                    .filter(Boolean),
                suggestions: suggestions.filter(Boolean).slice(0, 3)
            };
        } catch (err) {
            return {
                content: trimmed,
                references: [],
                suggestions: []
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
        var title = document.createElement("div");
        title.className = "chat-doc-preview__title";
        var closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "chat-doc-preview__close";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", this.closePreviewPanel.bind(this));
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

    AssistSidebar.prototype.closePreviewPanel = function () {
        if (!this.previewPanel) return;
        this.previewPanel.classList.remove("open");
        this.previewPanel.setAttribute("aria-hidden", "true");
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
        if (this.previewBodyEl) {
            this.previewBodyEl.innerHTML = "<div class=\"chat-doc-preview__loading\">Chargement…</div>";
        }
        var snippet = "";
        try {
            var doc = await this.findDocumentForPreview(name);
            if (doc?.id) {
                var docChunks = await this.getDocumentChunks(doc.id, doc.conversationId);
                snippet = docChunks.length ? (docChunks[0].text || "") : "";
                this.renderDocumentText(docChunks, { snippet: snippet });
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

    AssistSidebar.prototype.openReferencePreview = async function (message, reference) {
        if (!reference) return;
        this.buildPreviewPanel();
        if (!this.previewPanel) return;
        this.previewPanel.classList.add("open");
        this.previewPanel.setAttribute("aria-hidden", "false");
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
                this.renderDocumentText(docChunks, {
                    highlightChunkIds: Array.from(relatedChunkIds),
                    snippet: snippet,
                    highlightLine: typeof reference.line === "number" ? reference.line : undefined
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

    AssistSidebar.prototype.formatPreviewText = function (text, highlightLine) {
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
        var normalized = normalizePreviewChunks(chunks);
        if (!normalized.length) {
            if (snippet) {
                this.previewBodyEl.innerHTML = this.formatPreviewText(snippet, highlightLine);
            } else {
                this.previewBodyEl.innerHTML = "(extrait indisponible)";
            }
            return;
        }
        var html = [];
        var lineNo = 0;
        var highlightLines = new Set();
        var normalizedSnippet = normalizeSpaces(snippet);
        normalized.forEach(function (entry) {
            var rawLines = String(entry.text || "").split(/\r?\n/);
            if (!rawLines.length) rawLines = [""];
            var chunkLineStart = lineNo + 1;
            var chunkLineEnd = chunkLineStart + rawLines.length - 1;
            lineNo = chunkLineEnd;
            var chunkText = rawLines
                .map(function (line) {
                    return normalizeSpaces(line);
                })
                .filter(Boolean)
                .join(" ");
            if (!chunkText) return;
            var matchesSnippet = normalizedSnippet && chunkText.toLowerCase().includes(normalizedSnippet.toLowerCase());
            var highlightChunk = entry.chunkKey && highlightChunkIds.has(entry.chunkKey);
            var highlightLineActive = highlightLine && highlightLine >= chunkLineStart && highlightLine <= chunkLineEnd;
            if (highlightChunk || highlightLineActive) {
                highlightLines.add(chunkLineStart);
            }
            var cls = "chat-doc-preview__line";
            if (highlightChunk || highlightLineActive) {
                cls += " chat-doc-preview__line--highlight";
            }
            var snippetText = matchesSnippet
                ? highlightSnippetText(chunkText, normalizedSnippet)
                : escapeHtml(chunkText);
            html.push(
                "<div class=\"" + cls + "\" data-line=\"" + chunkLineStart + "\" data-chunk=\"" + escapeHtml(entry.chunkKey || "") + "\">" +
                "<span class=\"chat-doc-preview__line-number\">" + chunkLineStart + "</span>" +
                "<span class=\"chat-doc-preview__line-text\">" + snippetText + "</span>" +
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
        }
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

    global.GoToolkitAssist = global.GoToolkitAssist || GoToolkitAssist;
})(typeof window !== "undefined" ? window : this);
this.speechRecognition = null;
this.isListening = false;
