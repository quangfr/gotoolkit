;(function (global) {
    const doc = global.document;
    if (!doc) return;

    function normalizeBackdrop(modal) {
        if (!modal) return;
        modal.classList.add("modal-overlay");
    }

    function normalizeDialog(modal) {
        const dialog = modal?.querySelector(".settings-modal");
        if (!dialog) return;
        dialog.classList.add("modal");
    }

    function open(modal) {
        if (!modal) return;
        normalizeBackdrop(modal);
        normalizeDialog(modal);
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function close(modal) {
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    function bind(options = {}) {
        const modal = doc.getElementById(options.modalId || "settingsModal");
        if (!modal) return null;
        const closeBtn = doc.getElementById(options.closeBtnId || "closeSettingsBtn");
        const triggerIds = options.triggerIds || ["openSettingsBtn", "memoSettingsBtn"];

        normalizeBackdrop(modal);
        normalizeDialog(modal);

        const onOpen = typeof options.onOpen === "function" ? options.onOpen : null;
        const onClose = typeof options.onClose === "function" ? options.onClose : null;

        const api = {
            open: function () {
                if (onOpen) onOpen();
                open(modal);
            },
            close: function () {
                close(modal);
                if (onClose) onClose();
            },
            modal
        };

        triggerIds.forEach(function (id) {
            const trigger = doc.getElementById(id);
            if (!trigger) return;
            trigger.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                api.open();
            });
        });

        closeBtn?.addEventListener("click", function () {
            api.close();
        });

        modal.addEventListener("click", function (event) {
            if (event.target === modal) {
                api.close();
            }
        });

        doc.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && modal.classList.contains("open")) {
                api.close();
            }
        });

        return api;
    }

    global.GoToolkitSettingsModal = {
        bind
    };

    const NOTION_STORAGE_DEVICE_KEY = "go-toolkit-notion-device-id";
    const DEFAULT_NOTION_API_BASE = (global.GO_TOOLKIT_NOTION_API_URL || "https://notion.gotoolkit.workers.dev").replace(/\/$/, "");

    function getNotionApiBaseUrl() {
        return (global.GO_TOOLKIT_NOTION_API_URL || DEFAULT_NOTION_API_BASE).replace(/\/$/, "");
    }

    function getNotionDeviceId() {
        try {
            const existing = (localStorage.getItem(NOTION_STORAGE_DEVICE_KEY) || "").trim();
            if (existing) return existing;
            const next = (crypto?.randomUUID?.() || `notion-${Date.now()}-${Math.random().toString(16).slice(2)}`).trim();
            localStorage.setItem(NOTION_STORAGE_DEVICE_KEY, next);
            return next;
        } catch (err) {
            return `notion-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    }

    async function notionJsonPost(path, body) {
        const response = await fetch(`${getNotionApiBaseUrl()}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur Notion (${response.status})`);
        }
        return payload;
    }

    function openNotionOAuthPopup() {
        const deviceId = getNotionDeviceId();
        const origin = global.location.origin;
        const api = getNotionApiBaseUrl();
        const url = `${api}/oauth/start?deviceId=${encodeURIComponent(deviceId)}&origin=${encodeURIComponent(origin)}`;
        const popup = global.open(url, "gotoolkit-notion-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-notion-oauth") return;
                cleanup();
                if (event.data?.ok) {
                    resolve(event.data);
                    return;
                }
                reject(new Error(event.data?.error || "Connexion Notion refusee"));
            };
            function cleanup() {
                global.removeEventListener("message", onMessage);
                if (closedTimer) clearInterval(closedTimer);
                try { popup.close(); } catch (err) { /* noop */ }
            }
            global.addEventListener("message", onMessage);
            closedTimer = setInterval(() => {
                if (!popup || popup.closed) {
                    cleanup();
                    reject(new Error("Connexion Notion annulee"));
                }
            }, 300);
        });
    }

    async function notionGetAuthStatus() {
        return notionJsonPost("/auth/status", { deviceId: getNotionDeviceId() });
    }

    async function notionGetWorkspaces() {
        return notionJsonPost("/auth/workspaces", { deviceId: getNotionDeviceId() });
    }

    async function notionSelectWorkspace(workspaceId) {
        return notionJsonPost("/auth/workspace/select", {
            deviceId: getNotionDeviceId(),
            workspaceId: String(workspaceId || "").trim()
        });
    }

    async function notionDisconnect() {
        return notionJsonPost("/auth/disconnect", { deviceId: getNotionDeviceId() });
    }

    async function notionEnsureConnected() {
        const status = await notionGetAuthStatus();
        if (status?.connected) return true;
        await openNotionOAuthPopup();
        return true;
    }

    async function notionListPages(options) {
        return notionJsonPost("/pages/list", {
            deviceId: getNotionDeviceId(),
            workspaceId: String(options?.workspaceId || "").trim(),
            parentId: String(options?.parentId || "").trim()
        });
    }

    async function notionPublishPage(options) {
        return notionJsonPost("/pages/publish", {
            deviceId: getNotionDeviceId(),
            workspaceId: String(options?.workspaceId || "").trim(),
            parentId: String(options?.parentId || "").trim(),
            path: String(options?.path || "").trim(),
            title: String(options?.title || "Document").trim() || "Document",
            content: String(options?.content || ""),
            format: String(options?.format || "markdown").trim() || "markdown"
        });
    }

    global.GoToolkitNotionPublish = {
        getDeviceId: getNotionDeviceId,
        getAuthStatus: notionGetAuthStatus,
        getWorkspaces: notionGetWorkspaces,
        selectWorkspace: notionSelectWorkspace,
        ensureConnected: notionEnsureConnected,
        disconnect: notionDisconnect,
        listPages: notionListPages,
        publishPage: notionPublishPage
    };
})(window);
