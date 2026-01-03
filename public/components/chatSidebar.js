(function (global) {
    var STORAGE_KEY = "goToolkit.chat.conversation.default";
    var WIDTH_KEY = "goToolkit.chat.sidebarWidth";
    var OPEN_KEY = "goToolkit.chat.sidebarOpen";
    var DEFAULT_WIDTH = 400;
    var MIN_WIDTH = 320;
    var MAX_WIDTH = 800;
    var MAX_WIDTH_RATIO = 0.6;
    var PROMPT_PRESET_KEY = "goToolkit.chat.prompt.preset";

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
            if (stored === "info" || stored === "coach") {
                return stored;
            }
        } catch (err) {
            console.warn("Chat prompt preset read failed", err);
        }
        return "coach";
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

    function ChatSidebar(root) {
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
        this.docsIndicatorButton = null;
        this.documentsFileInput = null;
        this.documentStatsWatcher = null;
        this.documentChunkCount = 0;
        this.documentUploadStatus = "";
        this.pendingDocumentAttachments = [];
        this.headerDocCountEl = null;
        this.previewPanel = null;
        this.previewTitleEl = null;
        this.previewMetaEl = null;
        this.previewBodyEl = null;
        this.previewCloseBtn = null;
        this.promptPresetId = readPromptPreset();
        this.promptDropdown = null;
        this.promptDropdownButton = null;
        this.promptDropdownMenu = null;
        this.documentCounts = { context: 0, gallery: 0 };
    }

    ChatSidebar.prototype.persist = function () {
        this.conversation.updatedAt = Date.now();
        persistConversation(this.conversation);
    };

    ChatSidebar.prototype.setWidth = function (value) {
        this.sidebarWidth = clampWidth(value);
        if (this.sidebar) {
            this.sidebar.style.width = this.sidebarWidth + "px";
        }
        if (this.isOpen) {
            this.applyPagePadding();
        }
        this.updateSidebarWidthVar();
    };

    ChatSidebar.prototype.applyPagePadding = function () {
        if (!this.page) return;
        var offset = Math.max(0, this.sidebarWidth);
        this.page.style.marginRight = this.isOpen ? offset + "px" : "";
        this.page.style.paddingRight = "";
    };

    ChatSidebar.prototype.updateSidebarWidthVar = function () {
        var doc = global.document;
        if (!doc || !doc.documentElement?.style) return;
        doc.documentElement.style.setProperty("--chat-sidebar-width", this.isOpen ? this.sidebarWidth + "px" : "0px");
    };

    ChatSidebar.prototype.open = function () {
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

    ChatSidebar.prototype.close = function () {
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

    ChatSidebar.prototype.toggle = function () {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    };

    ChatSidebar.prototype.abortStream = function () {
        if (this.controller) {
            try {
                this.controller.abort();
            } catch (err) { /* ignore */ }
            this.controller = null;
        }
        this.isStreaming = false;
        this.updateComposerState();
    };

    ChatSidebar.prototype.clearConversation = function () {
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

    ChatSidebar.prototype.updateComposerState = function () {
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

    ChatSidebar.prototype.clearAttachments = function () {
        this.pendingDocumentAttachments = [];
        this.attachmentsTotalCount = 0;
        this.attachmentsParsedCount = 0;
        this.updateAttachmentIndicator();
        this.updateComposerState();
    };

    ChatSidebar.prototype.toggleListeningStyles = function (listening) {
        if (this.composer) {
            this.composer.classList.toggle("chat-composer--listening", Boolean(listening));
        }
        if (this.speechButton) {
            this.speechButton.classList.toggle("active", Boolean(listening));
        }
    };

    ChatSidebar.prototype.handleSpeechToggle = function () {
        if (this.isListening) {
            this.stopSpeechRecognition();
            return;
        }
        this.startSpeechRecognition();
    };

    ChatSidebar.prototype.startSpeechRecognition = function () {
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

    ChatSidebar.prototype.stopSpeechRecognition = function () {
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

    ChatSidebar.prototype.scrollToBottom = function () {
        if (!this.messagesEl) return;
        requestAnimationFrame(function () {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight + 200;
        }.bind(this));
    };

    ChatSidebar.prototype.updateBotMessage = function (message) {
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

    ChatSidebar.prototype.updateUserMessage = function (message) {
        var entry = this.messageNodes[message.id];
        if (!entry || !entry.contentEl) return;
        entry.contentEl.innerHTML = escapeHtml(message.content || "").replace(/\n/g, "<br>");
        this.scrollToBottom();
    };

    ChatSidebar.prototype.appendMessage = function (message) {
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
        console.info("appendMessage", message.id, message.role);
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

    ChatSidebar.prototype.renderBotContent = function (message) {
        return renderBotMarkdown(message.content || "");
    };

    ChatSidebar.prototype.syncBotExtras = function (entry, message) {
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
                    var label = ref.document || "Document";
                    if (label === "Non fourni") return;
                    var sectionLabel = (ref.section || "").trim();
                    var displayTitle = sectionLabel || label;
                    var item = document.createElement("li");
                    item.className = "chat-reference-item";
                    var link = document.createElement("button");
                    link.type = "button";
                    link.className = "chat-reference-link";
                    link.textContent = displayTitle;
                    link.title = label;
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

    ChatSidebar.prototype.handleSuggestionClick = function (text) {
        if (!text || !this.textarea) return;
        if (this.isStreaming) return;
        this.textarea.value = text;
        this.handleInputResize();
        this.updateComposerState();
        this.handleSend();
    };

    ChatSidebar.prototype.renderInitialMessages = function () {
        var _this = this;
        (this.conversation.messages || []).forEach(function (message) {
            _this.appendMessage(message);
        });
    };

    ChatSidebar.prototype.getPromptPresets = function () {
        var presets = global.GoToolkitChatPrompt?.PRESETS;
        if (presets) return presets;
        return {
            coach: {
                id: "coach",
                label: "/coach",
                prompt: getSystemPrompt()
            },
            info: {
                id: "info",
                label: "/info",
                prompt: global.GoToolkitChatPrompt?.INFO_PROMPT || global.GoToolkitChatPrompt?.DEFAULT_INFO_PROMPT || ""
            }
        };
    };

    ChatSidebar.prototype.setPromptPreset = function (presetId) {
        var next = presetId === "info" ? "info" : "coach";
        this.promptPresetId = next;
        persistPromptPreset(next);
        this.updatePromptDropdownLabel();
        this.updateHeaderDocumentCount();
        this.refreshDocumentStats();
    };

    ChatSidebar.prototype.getActiveSystemPrompt = function () {
        if (this.promptPresetId === "info") {
            return global.GoToolkitChatPrompt?.INFO_PROMPT
                || global.GoToolkitChatPrompt?.DEFAULT_INFO_PROMPT
                || "";
        }
        return getSystemPrompt();
    };

    ChatSidebar.prototype.filterHitsByPromptPreset = function (hits) {
        if (!Array.isArray(hits)) return [];
        if (this.promptPresetId === "info") {
            return hits;
        }
        return hits.filter(function (hit) {
            return hit?.sourceType !== "gallery";
        });
    };

    ChatSidebar.prototype.buildPayload = function (systemPrompt, userMessage, docInfo) {
        var promptContent = (systemPrompt && systemPrompt.trim()) ? systemPrompt : getSystemPrompt();
        var messages = [{ role: "system", content: promptContent }];
        var userContent = (userMessage?.content || "").trim();
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
        if (docInfo?.embedded) {
            var embeddedSections = {};
            if (docInfo.embedded.methods.length) {
                embeddedSections.methods = this.formatEntriesForPayload(docInfo.embedded.methods);
            }
            if (docInfo.embedded.tools.length) {
                embeddedSections.tools = this.formatEntriesForPayload(docInfo.embedded.tools);
            }
            if (docInfo.embedded.context.length) {
                embeddedSections.context = this.formatEntriesForPayload(docInfo.embedded.context);
            }
            if (Object.keys(embeddedSections).length) {
                var embedText = this.buildEmbeddedResultsText(embeddedSections);
                if (embedText) {
                    var idx = messages.findIndex(function (msg) {
                        return msg.role === "user";
                    });
                    if (idx >= 0) {
                        messages[idx].content += (messages[idx].content ? "\n\n" : "") + embedText;
                    } else {
                        messages.push({
                            role: "user",
                            content: embedText
                        });
                    }
                }
            }
        }
        if (Array.isArray(docInfo?.context) && docInfo.context.length) {
            var contextEntries = this.formatEntriesForPayload(docInfo.context);
            var contextText = this.buildEmbeddedResultsText({ context: contextEntries });
            if (contextText) {
                var contextIdx = messages.findIndex(function (msg) {
                    return msg.role === "user";
                });
                var contextBlock = "CONTEXT\n" + contextText;
                if (contextIdx >= 0) {
                    messages[contextIdx].content += (messages[contextIdx].content ? "\n\n" : "") + contextBlock;
                } else {
                    messages.push({
                        role: "user",
                        content: contextBlock
                    });
                }
            }
        }
        return payload;
    };

    ChatSidebar.prototype.formatEntriesForPayload = function (entries) {
        if (!entries || !entries.length) return [];
        var formatted = [];
        entries.forEach(function (entry) {
            var record = {
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

    ChatSidebar.prototype.buildEmbeddedResultsText = function (sections) {
        if (!sections || typeof sections !== "object") return "";
        var parts = [];
        Object.keys(sections).forEach(function (key) {
            var entries = sections[key];
            if (!entries || !entries.length) return;
            var header = key.toUpperCase();
            var rows = entries
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
            if (rows) {
                parts.push(header + "\n" + rows);
            }
        });
        return parts.join("\n\n");
    };

    ChatSidebar.prototype.stripDocExtension = function (value) {
        if (!value) return "";
        var idx = value.lastIndexOf(".");
        if (idx > 0) {
            return value.slice(0, idx);
        }
        return value;
    };

    ChatSidebar.prototype.buildHitEntry = function (hit) {
        if (!hit) return null;
        var rawName = (hit.docName || "Document").toString();
        var stripped = this.stripDocExtension(rawName);
        return {
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

    ChatSidebar.prototype.categorizeHits = function (hits) {
        var embedded = { methods: [], tools: [], context: [] };
        var context = [];
        (hits || []).forEach(function (hit) {
            var entry = this.buildHitEntry(hit);
            if (!entry) return;
            if (entry.sourceType === "embedded" || entry.sourceType === "gallery") {
                if (entry.keyName.startsWith("methods_")) {
                    entry.category = "method";
                    embedded.methods.push(entry);
                    return;
                }
                if (entry.keyName.startsWith("tools_")) {
                    entry.category = "tool";
                    embedded.tools.push(entry);
                    return;
                }
                return;
            }
            if (entry.keyName.startsWith("index_")) {
                return;
            }
            entry.category = "context";
            context.push(entry);
        }, this);
        return { embedded: embedded, context: context };
    };

    ChatSidebar.prototype.buildSourcesFromEntries = function (embedded, context) {
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
        appendEntries(embedded.knowledge || []);
        appendEntries(context || []);
        return sources;
    };

    ChatSidebar.prototype.handleSend = async function () {
        if (this.isStreaming) return;
        if (!this.textarea) return;
        var value = this.textarea.value.trim();
        var hasAttachment = this.pendingDocumentAttachments.length > 0;
        if (!value && !hasAttachment) return;
        console.log("chat-send-btn triggered", { message: value });

        var userMessage = createMessage("user", value);
        var contextHits = [];
        var systemPrompt = this.getActiveSystemPrompt();
        if (this.docManager) {
            try {
                contextHits = await this.docManager.retrieve(value, this.conversation.id);
                console.log("embeddings retrieval", { query: value, hits: contextHits });
            } catch (err) {
                console.warn("Document retrieval échoué", err);
            }
        }
        contextHits = this.filterHitsByPromptPreset(contextHits);
        var docInfo = this.categorizeHits(contextHits);
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
        console.log("AI payload", payload);
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
            console.log("AI chunk", chunk);
            botMessage._jsonBuffer = (botMessage._jsonBuffer || "") + chunk;
            var parsed = null;
            try {
                parsed = JSON.parse(botMessage._jsonBuffer);
            } catch (err) {
                parsed = null;
            }
            if (parsed && parsed.answer && typeof parsed.answer.content === "string") {
                botMessage.content = parsed.answer.content;
                botMessage.references = Array.isArray(parsed.references) ? parsed.references : [];
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
            console.log("AI response complete", result);
            var parsed = this.parseAssistantResponse(result || "");
            if (parsed.content === "Réponse illisible." && botMessage.content) {
                parsed.content = botMessage.content;
            }
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
        }
    };

    ChatSidebar.prototype.handleInputResize = function () {
        if (!this.textarea) return;
        this.textarea.style.height = "auto";
        var maxHeight = this.textarea.scrollHeight;
        var lineHeight = parseInt(global.getComputedStyle(this.textarea).lineHeight, 10) || 18;
        var maxAllowed = lineHeight * 6;
        var nextHeight = Math.min(maxHeight, maxAllowed);
        this.textarea.style.height = nextHeight + "px";
    };

    ChatSidebar.prototype.mountResizer = function (resizer) {
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

    ChatSidebar.prototype.updatePromptDropdownLabel = function () {
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

    ChatSidebar.prototype.closePromptDropdown = function () {
        if (!this.promptDropdownMenu) return;
        this.promptDropdownMenu.classList.remove("open");
        this.promptDropdownMenu.hidden = true;
    };

    ChatSidebar.prototype.togglePromptDropdown = function () {
        if (!this.promptDropdownMenu) return;
        var willOpen = this.promptDropdownMenu.hidden;
        if (willOpen) {
            this.promptDropdownMenu.hidden = false;
            this.promptDropdownMenu.classList.add("open");
        } else {
            this.closePromptDropdown();
        }
    };

    ChatSidebar.prototype.buildPromptDropdown = function () {
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

    ChatSidebar.prototype.buildUI = function () {
        if (!this.root) return;
        this.page = document.getElementById("page");
        this.toggleButton = document.createElement("button");
        this.toggleButton.id = "chatToggleBtn";
        this.toggleButton.type = "button";
        this.toggleButton.className = "feedback-button chat-toggle-button";
        this.toggleButton.textContent = "⌬ Chat IA";
        this.toggleButton.addEventListener("click", this.toggle.bind(this));

        var heroMeta = document.querySelector(".hero-meta");
        if (heroMeta) {
            heroMeta.insertBefore(this.toggleButton, heroMeta.firstChild);
        } else {
            document.body.appendChild(this.toggleButton);
        }

        this.sidebar = document.createElement("div");
        this.sidebar.id = "chatSidebar";
        this.sidebar.className = "chat-sidebar";
        this.sidebar.style.display = "none";
        this.sidebar.style.width = this.sidebarWidth + "px";

        var resizer = document.createElement("div");
        resizer.className = "chat-resizer";
        this.sidebar.appendChild(resizer);

        var header = document.createElement("div");
        header.className = "chat-header";
        var title = document.createElement("span");
        title.textContent = "⌬ Chat IA";
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
        this.headerDocCountEl.setAttribute("title", "Rafraîchir les documents indexés");
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
        this.docsIndicatorButton.textContent = "🗎 0 / 0";
        this.docsIndicatorButton.hidden = true;
        this.docsIndicatorButton.addEventListener("click", this.openDocumentSelector.bind(this));
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

    ChatSidebar.prototype.createDocumentPickers = function () {
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

    ChatSidebar.prototype.openDocumentSelector = function () {
        if (this.documentsFileInput) {
            this.documentsFileInput.click();
        }
    };

    ChatSidebar.prototype.setDocumentUploadStatus = function (message) {
        this.documentUploadStatus = message || "";
        this.syncDocumentIndicatorTitle(this.documentChunkCount);
    };

    ChatSidebar.prototype.syncDocumentIndicatorTitle = function (chunkCount) {
        if (!this.docsIndicatorButton) return;
        var parts = [];
        if (typeof chunkCount === "number" && !isNaN(chunkCount)) {
            parts.push(chunkCount + " extraits indexés");
        }
        if (this.documentUploadStatus) {
            parts.push(this.documentUploadStatus);
        }
        this.docsIndicatorButton.title = parts.join("\n");
    };

    ChatSidebar.prototype.setPendingDocumentAttachments = function (names) {
        this.pendingDocumentAttachments = (names || []).filter(Boolean);
        this.attachmentsParsedCount = this.pendingDocumentAttachments.length;
        if (!this.pendingDocumentAttachments.length) {
            this.attachmentsTotalCount = 0;
        }
        this.updateAttachmentIndicator();
        this.syncDocumentIndicatorTitle(this.documentChunkCount);
    };

    ChatSidebar.prototype.updateAttachmentIndicator = function () {
        if (!this.docsIndicatorButton) return;
        if (!this.pendingDocumentAttachments.length) {
            this.docsIndicatorButton.hidden = true;
            if (this.docsIndicatorLabelEl) {
                this.docsIndicatorLabelEl.textContent = "";
            }
            return;
        }
        var label;
        if (this.pendingDocumentAttachments.length === 1 && this.attachmentsTotalCount <= 1) {
            label = this.pendingDocumentAttachments[0];
        } else if (this.attachmentsTotalCount > 0) {
            label = "🗎 " + this.attachmentsParsedCount + "/" + this.attachmentsTotalCount;
        } else {
            label = "🗎 " + this.pendingDocumentAttachments.length;
        }
        if (this.docsIndicatorLabelEl) {
            this.docsIndicatorLabelEl.textContent = label;
        }
        this.docsIndicatorButton.hidden = false;
    };

    ChatSidebar.prototype.handleDocumentFilesSelected = function (event) {
        var files = event.target.files;
        if (!files || !files.length) return;
        this.startDocumentIngestion(files);
        event.target.value = "";
    };

    ChatSidebar.prototype.startDocumentIngestion = async function (files) {
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

    ChatSidebar.prototype.handleDocumentProgress = function (progress) {
        if (!progress) return;
        if (progress.type === "chunk") {
            this.setDocumentUploadStatus("Indexation " + progress.progress + "% → " + (progress.file || ""));
        } else if (progress.type === "file-start") {
            this.setDocumentUploadStatus("Ouverture de " + progress.file + " (" + progress.index + "/" + progress.total + ")");
        } else if (progress.type === "file-done") {
            this.setDocumentUploadStatus("Fichier traité : " + (progress.file || ""));
        }
    };
    ChatSidebar.prototype.updateDocumentIndicator = function (stats, docs) {
        if (!this.docsIndicatorButton) return;
        var chunkCount = stats ? Number(stats.chunkCount) || 0 : 0;
        this.documentChunkCount = chunkCount;
        this.computeDocumentCounts(docs);
        this.updateHeaderDocumentCount();
        if (!this.pendingDocumentAttachments.length) {
            this.docsIndicatorButton.hidden = true;
            return;
        }
        this.docsIndicatorButton.hidden = false;
        this.docsIndicatorButton.textContent = "🗎 " + this.pendingDocumentAttachments.length + " docs prêts";
        this.syncDocumentIndicatorTitle(chunkCount);
    };

    ChatSidebar.prototype.computeDocumentCounts = function (docs) {
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

    ChatSidebar.prototype.updateHeaderDocumentCount = function () {
        if (!this.headerDocCountEl) return;
        var counts = this.documentCounts || { context: 0, gallery: 0 };
        var total = counts.context + (this.promptPresetId === "info" ? counts.gallery : 0);
        this.headerDocCountEl.dataset.count = total;
        this.headerDocCountEl.textContent = "🗎 " + total;
    };

    ChatSidebar.prototype.getVersionParam = function () {
        try {
            const params = new URLSearchParams(window.location.search || "");
            return params.get("v") || "v";
        } catch (err) {
            return "v";
        }
    };

    ChatSidebar.prototype.fetchContentManifest = function () {
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

    ChatSidebar.prototype.handleHeaderDocCountClick = function () {
        if (!this.headerDocCountEl) return;
        var syncFn = global.GoToolkitIndexDocSync;
        if (typeof syncFn !== "function") return;
        if (this.headerDocCountEl.dataset.refreshing === "1") return;
        this.headerDocCountEl.dataset.refreshing = "1";
        this.headerDocCountEl.classList.add("chat-header-doc-count--refreshing");
        var self = this;
        Promise.resolve()
            .then(function () {
                return self.fetchContentManifest();
            })
            .then(function (manifest) {
                if (Array.isArray(manifest)) {
                    var total = manifest.length;
                    self.headerDocCountEl.dataset.manifestTotal = total;
                    self.headerDocCountEl.textContent = "🗎 " + total;
                }
            })
            .catch(function (err) {
                console.error("Index manifest fetch failed", err);
            })
            .then(function () {
                return syncFn();
            })
            .catch(function (err) {
                console.error("Index document refresh failed", err);
            })
            .finally(function () {
                self.headerDocCountEl.dataset.refreshing = "0";
                self.headerDocCountEl.classList.remove("chat-header-doc-count--refreshing");
                self.refreshDocumentStats();
            });
    };

    ChatSidebar.prototype.refreshDocumentStats = function () {
        if (!this.docManager) return;
        this.docManager.waitReady?.()
            .then(function () {
                return Promise.all([
                    this.docManager.getStats(this.conversation.id),
                    this.docManager.getDocuments(this.conversation.id)
                ]);
            }.bind(this))
            .then(function (results) {
                var stats = results ? results[0] : null;
                var docs = results ? results[1] : [];
                this.updateDocumentIndicator(stats, docs);
            }.bind(this))
            .catch(function (err) {
                console.warn("Documents stats", err);
            });
    };

    ChatSidebar.prototype.buildContextPrompt = function (hits) {
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

    ChatSidebar.prototype.parseAssistantResponse = function (raw) {
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
            var content = parsed?.answer?.content;
            var references = Array.isArray(parsed?.references) ? parsed.references : [];
            var suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
            return {
                content: typeof content === "string" && content.trim() ? content : "Non trouvé dans la base",
                references: references.map(function (ref) {
                    return {
                        document: ref?.document || "Document",
                        section: ref?.section || "",
                        page: typeof ref?.page === "number" ? ref.page : null,
                        line: typeof ref?.line === "number" ? ref.line : null,
                        type: ref?.type || ""
                    };
                }),
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

    ChatSidebar.prototype.buildPreviewPanel = function () {
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

        var meta = document.createElement("div");
        meta.className = "chat-doc-preview__meta";

        var body = document.createElement("div");
        body.className = "chat-doc-preview__body";

        panel.appendChild(header);
        panel.appendChild(meta);
        panel.appendChild(body);
        document.body.appendChild(panel);

        this.previewPanel = panel;
        this.previewTitleEl = title;
        this.previewMetaEl = meta;
        this.previewBodyEl = body;
        this.previewCloseBtn = closeBtn;
    };

    ChatSidebar.prototype.closePreviewPanel = function () {
        if (!this.previewPanel) return;
        this.previewPanel.classList.remove("open");
        this.previewPanel.setAttribute("aria-hidden", "true");
    };

    ChatSidebar.prototype.normalizeDocName = function (value) {
        return this.stripDocExtension(String(value || "")).toLowerCase();
    };

    ChatSidebar.prototype.resolvePreviewSnippet = async function (message, reference) {
        var targetName = this.normalizeDocName(reference?.document);
        var entries = [];
        if (message?.retrievalEntries) {
            var embedded = message.retrievalEntries.embedded || {};
            entries = []
                .concat(embedded.methods || [], embedded.tools || [], embedded.context || [])
                .concat(message.retrievalEntries.context || []);
        }
        var match = entries.find(function (entry) {
            return this.normalizeDocName(entry.docName) === targetName;
        }.bind(this));
        if (match?.text) {
            return match.text;
        }
        if (!this.docManager || !targetName) return "";
        try {
            var docs = await this.docManager.getDocuments(this.conversation.id);
            var doc = docs.find(function (item) {
                return this.normalizeDocName(item.name) === targetName;
            }.bind(this));
            if (!doc) return "";
            var chunks = await this.docManager.getChunks(this.conversation.id);
            var candidates = chunks.filter(function (chunk) {
                return chunk.docId === doc.id;
            });
            if (!candidates.length) return "";
            candidates.sort(function (a, b) {
                return (a.idx || 0) - (b.idx || 0);
            });
            return candidates[0].text || "";
        } catch (err) {
            console.warn("Preview resolve failed", err);
            return "";
        }
    };

    ChatSidebar.prototype.openAttachmentPreview = async function (name) {
        if (!name || !this.docManager) return;
        this.buildPreviewPanel();
        if (!this.previewPanel) return;
        this.previewPanel.classList.add("open");
        this.previewPanel.setAttribute("aria-hidden", "false");
        this.previewTitleEl && (this.previewTitleEl.textContent = name);
        var metaText = "Pièce jointe";
        var snippet = "";
        try {
            var doc = await this.docManager.findDocumentByName(this.conversation.id, name);
            if (doc?.abstract) {
                metaText = doc.abstract;
            }
            if (doc?.id) {
                var chunks = await this.docManager.getChunks(this.conversation.id);
                var chunk = chunks.find(function (item) {
                    return item.docId === doc.id;
                });
                snippet = (chunk && chunk.text) || "";
            }
        } catch (err) {
            console.warn("Attachment preview failed", err);
        }
        if (this.previewMetaEl) {
            this.previewMetaEl.textContent = metaText || "Pièce jointe";
        }
        if (this.previewBodyEl) {
            var content = snippet || "(extrait indisponible)";
            this.previewBodyEl.innerHTML = this.formatPreviewText(content);
        }
    };

    ChatSidebar.prototype.formatPreviewText = function (text, highlightLine) {
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

    ChatSidebar.prototype.openReferencePreview = async function (message, reference) {
        if (!reference) return;
        this.buildPreviewPanel();
        if (!this.previewPanel) return;
        this.previewPanel.classList.add("open");
        this.previewPanel.setAttribute("aria-hidden", "false");
        if (this.previewTitleEl) {
            this.previewTitleEl.textContent = reference.document || "Document";
        }
        if (this.previewMetaEl) {
            var metaParts = [];
            if (reference.section) {
                metaParts.push(reference.section);
            }
            if (typeof reference.page === "number") {
                metaParts.push("p. " + reference.page);
            }
            if (typeof reference.line === "number") {
                metaParts.push("l. " + reference.line);
            }
            this.previewMetaEl.textContent = metaParts.join(" · ") || "Référence";
        }
        if (this.previewBodyEl) {
            this.previewBodyEl.innerHTML = "<div class=\"chat-doc-preview__loading\">Chargement…</div>";
        }
        var snippet = await this.resolvePreviewSnippet(message, reference);
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

    ChatSidebar.prototype.init = function () {
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

    var GoToolkitChatSidebar = {
        mount: function (target) {
            if (!target) return null;
            var instance = new ChatSidebar(target);
            instance.init();
            return instance;
        }
    };

    global.GoToolkitChatSidebar = global.GoToolkitChatSidebar || GoToolkitChatSidebar;
})(typeof window !== "undefined" ? window : this);
this.speechRecognition = null;
this.isListening = false;
