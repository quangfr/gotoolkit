(function () {
    const overlay = document.getElementById("memo-source-overlay");
    const closeBtn = document.getElementById("memo-source-close");
    const copyBtn = document.getElementById("memo-source-copy");
    const downloadBtn = document.getElementById("memo-source-download");
    const formatButtons = Array.from(document.querySelectorAll(".memo-source-format-btn"));
    const textarea = document.getElementById("memo-source-text");
    const preview = document.getElementById("memo-source-preview");
    const toast = document.getElementById("memo-source-toast");
    let currentFormat = "markdown";

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.style.display = "block";
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => {
            toast.style.display = "none";
        }, 1400);
    }

    function safeStringify(value) {
        if (value == null) return "";
        if (typeof value === "string") return value;
        try {
            return JSON.stringify(value, null, 2);
        } catch (e) {
            return String(value);
        }
    }

    function extractAiInUserPayload(rawValue) {
        const list = Array.isArray(rawValue) ? rawValue : [rawValue];
        return list
            .map((entry) => {
                const messages = Array.isArray(entry?.payload_messages)
                    ? entry.payload_messages
                    : (Array.isArray(entry?.payload?.messages) ? entry.payload.messages : []);
                const userMessages = messages
                    .filter((msg) => msg && msg.role === "user")
                    .map((msg) => ({ role: "user", content: msg.content }));
                return { messages: userMessages };
            })
            .filter((entry) => Array.isArray(entry.messages) && entry.messages.length);
    }

    function getSource(format) {
        if (format === "markdown" || format === "html" || format === "json" || format === "text") {
            try {
                const fn = window.getMemoEditorSource;
                if (typeof fn === "function") {
                    return fn(format) || "";
                }
            } catch (e) {
                // noop
            }
            return "";
        }

        if (format === "ai_in") {
            if (window.__memoEditorAIInHistory && window.__memoEditorAIInHistory.length > 0) {
                return extractAiInUserPayload(window.__memoEditorAIInHistory);
            }
            const at = window.__memoEditorLastAIInAt || null;
            const messages = window.__memoEditorLastAIInMessages || null;
            return extractAiInUserPayload([{ at, payload_messages: messages }]);
        }

        if (format === "ai_out") {
            if (window.__memoEditorAIOutHistory && window.__memoEditorAIOutHistory.length > 0) {
                return window.__memoEditorAIOutHistory;
            }
            const at = window.__memoEditorLastAIOutAt || null;
            const out = window.__memoEditorLastAIOut || null;
            return [{ at, ai_out: out }];
        }

        return "";
    }

    function refresh() {
        const jsonContainer = document.getElementById("memo-source-json");
        if (!textarea || !preview || !jsonContainer) return;
        const format = currentFormat;
        const rawValue = getSource(format);
        textarea.style.display = "none";
        preview.style.display = "none";
        jsonContainer.style.display = "none";
        jsonContainer.innerHTML = "";

        if (format === "html") {
            preview.style.display = "block";
            preview.innerHTML = rawValue || "";
            if (window.lucide && typeof window.lucide.createIcons === "function") {
                window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
            }
        } else if (format === "ai_in" || format === "ai_out" || format === "json") {
            jsonContainer.style.display = "block";
            let jsonObj = rawValue;
            if (typeof rawValue === "string") {
                try {
                    jsonObj = JSON.parse(rawValue);
                } catch (e) {
                    jsonObj = { error: "Invalid JSON", raw: rawValue };
                }
            }
            if (typeof window.JSONViewer === "function") {
                try {
                    const viewer = new window.JSONViewer();
                    jsonContainer.appendChild(viewer.getContainer());
                    viewer.showJSON(jsonObj);
                } catch (e) {
                    console.error("JSONViewer error", e);
                    textarea.style.display = "block";
                    textarea.value = safeStringify(jsonObj);
                }
            } else {
                textarea.style.display = "block";
                textarea.value = safeStringify(jsonObj);
            }
        } else {
            textarea.style.display = "block";
            textarea.value = rawValue || "";
            textarea.focus();
            textarea.select();
        }
    }

    async function copyAll() {
        if (!textarea || !preview) return;
        const format = currentFormat;
        let text = "";
        if (format === "html") {
            text = preview.innerHTML;
        } else if (format === "ai_in" || format === "ai_out" || format === "json") {
            text = safeStringify(getSource(format));
        } else {
            text = textarea.value;
        }

        try {
            if (format === "html") {
                const htmlType = "text/html";
                const plainType = "text/plain";
                const plainText = getSource("text");
                const htmlBlob = new Blob([text], { type: htmlType });
                const plainBlob = new Blob([plainText || ""], { type: plainType });
                const data = [new ClipboardItem({ [htmlType]: htmlBlob, [plainType]: plainBlob })];
                await navigator.clipboard.write(data);
                showToast("Rendu HTML copié");
            } else {
                await navigator.clipboard.writeText(text);
                showToast("Contenu copié");
            }
        } catch (e) {
            textarea.focus();
            textarea.select();
            const ok = document.execCommand && document.execCommand("copy");
            showToast(ok ? "Contenu copié" : "Copie impossible");
        }
    }

    function download() {
        if (!textarea || !preview) return;
        const format = currentFormat;
        let text = "";
        if (format === "html") {
            text = preview.innerHTML;
        } else if (format === "ai_in" || format === "ai_out" || format === "json") {
            text = safeStringify(getSource(format));
        } else {
            text = textarea.value;
        }
        const mimes = {
            markdown: "text/markdown",
            text: "text/plain",
            html: "text/html",
            json: "application/json",
            ai_in: "application/json",
            ai_out: "application/json"
        };
        const extensions = {
            markdown: "md",
            text: "txt",
            html: "html",
            json: "json",
            ai_in: "json",
            ai_out: "json"
        };
        const ext = extensions[format] || "txt";
        const mime = mimes[format] || "text/plain";
        const filename = `memo-source-${format}-${new Date().toISOString().slice(0, 10)}.${ext}`;
        const blob = new Blob([text], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function setFormat(nextFormat) {
        const allowed = new Set(["markdown", "text", "html", "json", "ai_in", "ai_out"]);
        currentFormat = allowed.has(nextFormat) ? nextFormat : "markdown";
        formatButtons.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.format === currentFormat);
        });
    }

    function open() {
        if (!overlay) return;
        overlay.style.display = "block";
        setFormat("markdown");
        refresh();
        if (window.lucide) window.lucide.createIcons();
    }

    function close() {
        if (!overlay) return;
        overlay.style.display = "none";
    }

    window.openMemoSourceModal = open;
    document.addEventListener("memoEditorOpenSourceModal", open);
    closeBtn?.addEventListener("click", close);
    overlay?.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
    formatButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            setFormat(btn.dataset.format || "markdown");
            refresh();
        });
    });
    copyBtn?.addEventListener("click", async () => {
        await copyAll();
    });
    downloadBtn?.addEventListener("click", download);
    document.addEventListener("keydown", (e) => {
        if (overlay?.style.display === "block" && e.key === "Escape") {
            close();
        }
    });
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
})();
