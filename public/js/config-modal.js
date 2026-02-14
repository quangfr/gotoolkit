;(function (global) {
    const doc = global.document;
    if (!doc) return;
    const SHARED_SETTINGS_TABS_HTML = `
        <button type="button" class="tab-btn active" data-tab="paramsTab">
            <i data-lucide="sliders" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Paramétrages
        </button>
        <button type="button" class="tab-btn" data-tab="integrationsTab">
            <i data-lucide="plug-zap" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Intégrations
        </button>
    `;
    const SHARED_SETTINGS_PANELS_HTML = `
        <div class="settings-tab-panel" data-panel="paramsTab">
            <div class="field-row">
                <label style="width:100%">
                    <span class="label-title">Id Go-Toolkit</span>
                    <div style="position:relative; width:100%;">
                        <i data-lucide="user" style="width:14px;height:14px;position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:0.7;pointer-events:none;"></i>
                        <input id="ownerToken" type="text" style="padding-left:34px;" />
                    </div>
                </label>
            </div>
            <div class="field-row">
                <label style="width:100%">
                    <span class="label-title">Thème</span>
                    <select id="themeSelectMemo">
                        <option value="cream">Clair</option>
                        <option value="dark">Sombre</option>
                        <option value="auto" selected>Auto</option>
                    </select>
                </label>
            </div>
        </div>
        <div class="settings-tab-panel" data-panel="integrationsTab" hidden>
            <div class="field-row">
                <label style="width:100%">
                    <span class="label-title">Notion</span>
                    <a id="notionAuthLink" class="label-title dashed-link" href="#" style="margin-left:8px;">Se connecter</a>
                </label>
            </div>
            <div class="field-row" id="notionWorkspaceRow" style="display:none;">
                <label style="width:100%">
                    <span class="label-title">Workspace</span>
                    <select id="notionWorkspaceSelect" disabled>
                        <option value="">Aucun workspace</option>
                    </select>
                </label>
            </div>
            <div class="field-row" id="notionDefaultPathRow" style="display:none;">
                <label style="width:100%">
                    <span class="label-title">Chemin par défaut</span>
                    <input id="notionDefaultPathInput" type="text" placeholder="/Espace/Projet" />
                </label>
            </div>
            <hr style="width:100%; border:none; border-top:1px solid var(--border-main); margin:8px 0;">
            <div class="field-row">
                <label style="width:100%">
                    <span class="label-title">YouTube</span>
                    <a id="youtubeAuthLink" class="label-title dashed-link" href="#" style="margin-left:8px;">Se connecter</a>
                </label>
            </div>
            <div class="field-row" id="youtubeChannelRow" style="display:none;">
                <label style="width:100%">
                    <span class="label-title">Chaîne</span>
                    <select id="youtubeChannelSelect" disabled>
                        <option value="">Aucune chaîne</option>
                    </select>
                </label>
            </div>
            <div class="field-row" id="youtubeNoChannelRow" style="display:none;">
                <label style="width:100%">
                    <span class="label-subtitle">Aucune chaîne trouvée sur ce compte.</span>
                    <a id="youtubeChannelSwitcherLink" class="label-title dashed-link"
                        href="https://www.youtube.com/channel_switcher" target="_blank"
                        rel="noopener noreferrer">Créer ou sélectionner une chaîne YouTube</a>
                </label>
            </div>
            <hr style="width:100%; border:none; border-top:1px solid var(--border-main); margin:8px 0;">
            <div class="field-row">
                <label style="width:100%">
                    <span class="label-title">Outlook</span>
                    <a id="microsoftAuthLink" class="label-title dashed-link" href="#" style="margin-left:8px;">Se connecter</a>
                </label>
            </div>
            <hr style="width:100%; border:none; border-top:1px solid var(--border-main); margin:8px 0;">
            <div class="field-row">
                <label style="width:100%">
                    <span class="label-title">Gmail</span>
                    <a id="gmailAuthLink" class="label-title dashed-link" href="#" style="margin-left:8px;">Se connecter</a>
                </label>
            </div>
        </div>
    `;

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

    function ensureSharedSettingsModalTabs() {
        const modal = doc.getElementById("settingsModal");
        if (!modal) return;

        const tabsRow = modal.querySelector(".settings-tabs");
        if (!tabsRow) return;
        let panelContainer = modal.querySelector(".settings-tab-panels-wrapper");
        if (!panelContainer) {
            const parent = modal.querySelector(".ia-actions, .feedback-form");
            if (!parent) return;
            panelContainer = doc.createElement("div");
            panelContainer.className = "settings-tab-panels-wrapper";
            parent.appendChild(panelContainer);
        }
        Array.from(tabsRow.querySelectorAll('[data-tab="paramsTab"], [data-tab="integrationsTab"]')).forEach(el => el.remove());
        Array.from(modal.querySelectorAll('.settings-tab-panel[data-panel="paramsTab"], .settings-tab-panel[data-panel="integrationsTab"]')).forEach(el => el.remove());
        tabsRow.insertAdjacentHTML("beforeend", SHARED_SETTINGS_TABS_HTML);
        panelContainer.insertAdjacentHTML("beforeend", SHARED_SETTINGS_PANELS_HTML);
    }

    ensureSharedSettingsModalTabs();

    global.GoToolkitSettingsModal.setIntegrationConnected = function (anchorEl, connected) {
        if (!anchorEl || !anchorEl.parentElement) return;
        const label = anchorEl.parentElement.querySelector(".label-title");
        if (!label) return;
        let indicator = anchorEl.parentElement.querySelector('[data-integration-connected]');
        if (!connected) {
            indicator?.remove();
            return;
        }
        if (!indicator) {
            indicator = doc.createElement("i");
            indicator.setAttribute("data-integration-connected", "1");
            indicator.setAttribute("data-lucide", "circle-check");
            indicator.style.width = "14px";
            indicator.style.height = "14px";
            indicator.style.verticalAlign = "middle";
            indicator.style.marginLeft = "6px";
            label.insertAdjacentElement("afterend", indicator);
        }
        if (global.lucide?.createIcons) {
            global.lucide.createIcons();
        }
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
            pageId: String(options?.pageId || "").trim(),
            eraseContent: Boolean(options?.eraseContent),
            path: String(options?.path || "").trim(),
            title: String(options?.title || "Document").trim() || "Document",
            content: String(options?.content || ""),
            format: String(options?.format || "markdown").trim() || "markdown",
            hasRecording: Boolean(options?.hasRecording)
        });
    }

    async function notionGetPageContent(options) {
        return notionJsonPost("/pages/content", {
            deviceId: getNotionDeviceId(),
            workspaceId: String(options?.workspaceId || "").trim(),
            pageId: String(options?.pageId || "").trim()
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
        publishPage: notionPublishPage,
        getPageContent: notionGetPageContent
    };

    const MICROSOFT_STORAGE_DEVICE_KEY = "go-toolkit-microsoft-device-id";
    const DEFAULT_MICROSOFT_API_BASE = (global.GO_TOOLKIT_MICROSOFT_API_URL || "https://ms.gotoolkit.workers.dev").replace(/\/$/, "");

    function getMicrosoftApiBaseUrl() {
        return (global.GO_TOOLKIT_MICROSOFT_API_URL || DEFAULT_MICROSOFT_API_BASE).replace(/\/$/, "");
    }

    function getMicrosoftDeviceId() {
        try {
            const existing = (localStorage.getItem(MICROSOFT_STORAGE_DEVICE_KEY) || "").trim();
            if (existing) return existing;
            const next = (crypto?.randomUUID?.() || `ms-${Date.now()}-${Math.random().toString(16).slice(2)}`).trim();
            localStorage.setItem(MICROSOFT_STORAGE_DEVICE_KEY, next);
            return next;
        } catch (err) {
            return `ms-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    }

    async function microsoftJsonPost(path, body) {
        const response = await fetch(`${getMicrosoftApiBaseUrl()}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur Microsoft (${response.status})`);
        }
        return payload;
    }

    function openMicrosoftOAuthPopup() {
        const deviceId = getMicrosoftDeviceId();
        const origin = global.location.origin;
        const api = getMicrosoftApiBaseUrl();
        const url = `${api}/oauth/start?deviceId=${encodeURIComponent(deviceId)}&origin=${encodeURIComponent(origin)}`;
        const popup = global.open(url, "gotoolkit-microsoft-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-microsoft-oauth") return;
                cleanup();
                if (event.data?.ok) {
                    resolve(event.data);
                    return;
                }
                reject(new Error(event.data?.error || "Connexion Outlook refusee"));
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
                    reject(new Error("Connexion Outlook annulee"));
                }
            }, 300);
        });
    }

    async function microsoftGetAuthStatus() {
        return microsoftJsonPost("/auth/status", { deviceId: getMicrosoftDeviceId() });
    }

    async function microsoftDisconnect() {
        return microsoftJsonPost("/auth/disconnect", { deviceId: getMicrosoftDeviceId() });
    }

    async function microsoftEnsureConnected() {
        const status = await microsoftGetAuthStatus();
        if (status?.connected) return true;
        await openMicrosoftOAuthPopup();
        return true;
    }

    async function microsoftCreateDraft(options = {}) {
        return microsoftJsonPost("/mail/draft/create", {
            deviceId: getMicrosoftDeviceId(),
            subject: String(options?.subject || "Document").trim() || "Document",
            html: String(options?.html || ""),
            text: String(options?.text || "")
        });
    }

    global.GoToolkitMicrosoftPublish = {
        getDeviceId: getMicrosoftDeviceId,
        getAuthStatus: microsoftGetAuthStatus,
        ensureConnected: microsoftEnsureConnected,
        disconnect: microsoftDisconnect,
        createDraft: microsoftCreateDraft
    };

    const GMAIL_STORAGE_DEVICE_KEY = "go-toolkit-gmail-device-id";
    const DEFAULT_GMAIL_API_BASE = (global.GO_TOOLKIT_GMAIL_API_URL || "https://gmail.gotoolkit.workers.dev").replace(/\/$/, "");

    function getGmailApiBaseUrl() {
        return (global.GO_TOOLKIT_GMAIL_API_URL || DEFAULT_GMAIL_API_BASE).replace(/\/$/, "");
    }

    function getGmailDeviceId() {
        try {
            const existing = (localStorage.getItem(GMAIL_STORAGE_DEVICE_KEY) || "").trim();
            if (existing) return existing;
            const next = (crypto?.randomUUID?.() || `gmail-${Date.now()}-${Math.random().toString(16).slice(2)}`).trim();
            localStorage.setItem(GMAIL_STORAGE_DEVICE_KEY, next);
            return next;
        } catch (err) {
            return `gmail-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    }

    async function gmailJsonPost(path, body) {
        const response = await fetch(`${getGmailApiBaseUrl()}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur Gmail (${response.status})`);
        }
        return payload;
    }

    function openGmailOAuthPopup() {
        const deviceId = getGmailDeviceId();
        const origin = global.location.origin;
        const api = getGmailApiBaseUrl();
        const url = `${api}/oauth/start?deviceId=${encodeURIComponent(deviceId)}&origin=${encodeURIComponent(origin)}`;
        const popup = global.open(url, "gotoolkit-gmail-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-gmail-oauth") return;
                cleanup();
                if (event.data?.ok) {
                    resolve(event.data);
                    return;
                }
                reject(new Error(event.data?.error || "Connexion Gmail refusee"));
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
                    reject(new Error("Connexion Gmail annulee"));
                }
            }, 300);
        });
    }

    async function gmailGetAuthStatus() {
        return gmailJsonPost("/auth/status", { deviceId: getGmailDeviceId() });
    }

    async function gmailDisconnect() {
        return gmailJsonPost("/auth/disconnect", { deviceId: getGmailDeviceId() });
    }

    async function gmailEnsureConnected() {
        const status = await gmailGetAuthStatus();
        if (status?.connected) return true;
        await openGmailOAuthPopup();
        return true;
    }

    async function gmailCreateDraft(options = {}) {
        return gmailJsonPost("/mail/draft/create", {
            deviceId: getGmailDeviceId(),
            subject: String(options?.subject || "Document").trim() || "Document",
            html: String(options?.html || ""),
            text: String(options?.text || "")
        });
    }

    global.GoToolkitGmailPublish = {
        getDeviceId: getGmailDeviceId,
        getAuthStatus: gmailGetAuthStatus,
        ensureConnected: gmailEnsureConnected,
        disconnect: gmailDisconnect,
        createDraft: gmailCreateDraft
    };
})(window);
