(function (global) {
    var STORAGE_KEY = "goToolkit.chat.conversation.default";
    var WIDTH_KEY = "goToolkit.chat.sidebarWidth";
    var OPEN_KEY = "goToolkit.chat.sidebarOpen";
    var DEFAULT_WIDTH = 400;
    var MIN_WIDTH = 320;
    var MAX_WIDTH = 800;
    var MAX_WIDTH_RATIO = 0.6;

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
        return "Tu es Go-Toolkit un outil conversationnel pour product owners. Tu réponds à la demande en cours de l'utilisateur en tenant compte de l'historique de la conversation.";
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
    };

    ChatSidebar.prototype.applyPagePadding = function () {
        if (!this.page) return;
        var offset = Math.max(0, this.sidebarWidth);
        this.page.style.marginRight = this.isOpen ? offset + "px" : "";
        this.page.style.paddingRight = "";
    };

    ChatSidebar.prototype.open = function () {
        if (!this.sidebar) return;
        this.isOpen = true;
        this.sidebar.classList.add("chat-sidebar--open");
        this.sidebar.style.display = "flex";
        this.applyPagePadding();
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
            this.docManager.clearConversation(this.conversation.id).catch(function () { /* ignore */ });
        }
        this.conversation = {
            id: "default",
            updatedAt: Date.now(),
            messages: []
        };
        this.messageNodes = {};
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

    ChatSidebar.prototype.renderReferences = function (message, refsPanel, countEl, toggleBtn) {
        var sources = Array.isArray(message.sources) ? message.sources : [];
        if (countEl) {
            countEl.textContent = "⌗ " + sources.length + " références";
        }
        if (toggleBtn) {
            toggleBtn.hidden = sources.length === 0;
        }
        if (!refsPanel) return;
        refsPanel.style.display = sources.length ? "block" : "none";
        refsPanel.innerHTML = "";
        sources.forEach(function (source) {
            var item = document.createElement("div");
            item.className = "chat-ref-item";
            var link = document.createElement("a");
            link.href = source.url || "#";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = source.title || source.url || "Source";
            item.appendChild(link);
            if (source.url && source.title) {
                var small = document.createElement("div");
                small.className = "chat-ref-url";
                small.textContent = source.url;
                item.appendChild(small);
            }
            refsPanel.appendChild(item);
        });
    };

    ChatSidebar.prototype.updateBotMessage = function (message) {
        var entry = this.messageNodes[message.id];
        if (!entry || !entry.contentEl) return;
        entry.contentEl.innerHTML = renderBotMarkdown(message.content || "");
        this.renderReferences(message, entry.refsPanel, entry.refsCount, entry.refsToggle);
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

        var refsCount;
        var refsPanel;
        var refsToggle;
        if (message.role === "bot") {
            refsToggle = document.createElement("button");
            refsToggle.type = "button";
            refsToggle.className = "chat-refs-toggle";
            refsCount = document.createElement("span");
            refsToggle.appendChild(refsCount);
            refsToggle.addEventListener("click", function () {
                refsPanel.hidden = !refsPanel.hidden;
            });

            refsPanel = document.createElement("div");
            refsPanel.className = "chat-refs-list";
            refsPanel.hidden = true;

            bubble.appendChild(refsToggle);
        }

        var content = document.createElement("div");
        content.className = "chat-content";
        bubble.appendChild(content);

        if (message.role === "bot") {
            bubble.appendChild(refsPanel);
            content.innerHTML = renderBotMarkdown(message.content || "");
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
                attachmentList.appendChild(tag);
            });
            bubble.appendChild(attachmentList);
        }

        wrapper.appendChild(bubble);
        this.messagesEl.appendChild(wrapper);
        this.messageNodes[message.id] = {
            wrapper: wrapper,
            contentEl: content,
            refsCount: refsCount,
            refsPanel: refsPanel,
            refsToggle: refsToggle
        };
        if (message.role === "bot") {
            this.renderReferences(message, refsPanel, refsCount, refsToggle);
        }
        this.scrollToBottom();
    };

    ChatSidebar.prototype.renderInitialMessages = function () {
        var _this = this;
        (this.conversation.messages || []).forEach(function (message) {
            _this.appendMessage(message);
        });
    };

    ChatSidebar.prototype.buildPayload = function (systemPrompt) {
        var history = (this.conversation.messages || []).map(function (message) {
            var role = message.role === "bot" ? "assistant" : "user";
            return { role: role, content: message.content || "" };
        });
        var payload = {
            stream: Boolean(global.GoToolkitIAClient?.supportsStreaming?.() !== false),
            messages: [{ role: "system", content: (systemPrompt && systemPrompt.trim()) ? systemPrompt : getSystemPrompt() }].concat(history)
        };
        return payload;
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
        var systemPrompt = getSystemPrompt();
        if (this.docManager) {
            try {
                contextHits = await this.docManager.retrieve(value, this.conversation.id);
                console.log("embeddings retrieval", { query: value, hits: contextHits });
                if (contextHits && contextHits.length) {
                    systemPrompt = this.buildContextPrompt(contextHits);
                }
            } catch (err) {
                console.warn("Document retrieval échoué", err);
            }
        }
        var attachments = this.pendingDocumentAttachments;
        if (attachments && attachments.length) {
            userMessage.attachments = attachments.slice();
            this.setPendingDocumentAttachments([]);
        }
        this.conversation.messages.push(userMessage);
        this.appendMessage(userMessage);
        this.persist();
        this.textarea.value = "";
        this.textarea.style.height = "auto";

        var botMessage = createMessage("bot", "");
        if (contextHits && contextHits.length) {
            botMessage.sources = contextHits.map(function (hit, index) {
                return {
                    title: (hit.docName || "Document") + " (#" + (index + 1) + ")",
                    url: "",
                    text: hit.text
                };
            });
        }
        this.conversation.messages.push(botMessage);
        this.appendMessage(botMessage);
        this.isStreaming = true;
        this.updateComposerState();
        this.scrollToBottom();

        var controller = new AbortController();
        this.controller = controller;

        var payload = this.buildPayload(systemPrompt);
        console.log("AI payload", payload);
        var self = this;

        function handleChunk(chunk) {
            console.log("AI chunk", chunk);
            botMessage.content += chunk;
            self.updateBotMessage(botMessage);
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
            if (result) {
                botMessage.content = result;
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
        this.headerDocCountEl.hidden = true;
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

        this.scrollButton = document.createElement("button");
        this.scrollButton.type = "button";
        this.scrollButton.className = "btn-secondary chat-scroll-btn";
        this.scrollButton.textContent = "+";
        this.scrollButton.addEventListener("click", this.openDocumentSelector.bind(this));
        composerActions.appendChild(this.scrollButton);

        this.docsIndicatorButton = document.createElement("button");
        this.docsIndicatorButton.type = "button";
        this.docsIndicatorButton.className = "btn-secondary chat-docs-indicator";
        this.docsIndicatorButton.textContent = "🗎 0 / 0";
        this.docsIndicatorButton.hidden = true;
        this.docsIndicatorButton.addEventListener("click", this.openDocumentSelector.bind(this));
        composerActions.appendChild(this.docsIndicatorButton);

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
        if (!this.pendingDocumentAttachments.length) {
            this.docsIndicatorButton.hidden = true;
            this.syncDocumentIndicatorTitle(this.documentChunkCount);
            return;
        }
        this.docsIndicatorButton.hidden = false;
        if (this.pendingDocumentAttachments.length === 1) {
            this.docsIndicatorButton.textContent = "🗎 " + this.pendingDocumentAttachments[0];
        } else {
            this.docsIndicatorButton.textContent = "🗎 " + this.pendingDocumentAttachments.length + " docs prêts";
        }
        this.syncDocumentIndicatorTitle(this.documentChunkCount);
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
        this.setDocumentUploadStatus("Indexation en cours…");
        try {
            var results = await this.docManager.ingestFiles(fileArray, this.conversation.id, {
                onProgress: this.handleDocumentProgress.bind(this)
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
    ChatSidebar.prototype.updateDocumentIndicator = function (stats) {
        if (!this.docsIndicatorButton) return;
        var chunkCount = stats ? Number(stats.chunkCount) || 0 : 0;
        this.documentChunkCount = chunkCount;
        this.updateHeaderDocumentCount(stats);
        if (!this.pendingDocumentAttachments.length) {
            this.docsIndicatorButton.hidden = true;
            return;
        }
        this.docsIndicatorButton.hidden = false;
        this.docsIndicatorButton.textContent = "🗎 " + this.pendingDocumentAttachments.length + " docs prêts";
        this.syncDocumentIndicatorTitle(chunkCount);
    };

    ChatSidebar.prototype.updateHeaderDocumentCount = function (stats) {
        if (!this.headerDocCountEl) return;
        var parsed = stats ? Number(stats.docsParsed) || 0 : 0;
        if (parsed <= 0) {
            this.headerDocCountEl.hidden = true;
            return;
        }
        this.headerDocCountEl.hidden = false;
        this.headerDocCountEl.textContent = "🗎 " + parsed;
    };

    ChatSidebar.prototype.refreshDocumentStats = function () {
        if (!this.docManager) return;
        this.docManager.waitReady?.()
            .then(function () {
                return this.docManager.getStats(this.conversation.id);
            }.bind(this))
            .then(this.updateDocumentIndicator.bind(this))
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
            this.documentStatsWatcher = this.docManager.onStatsChange(this.updateDocumentIndicator.bind(this));
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
