(() => {
    const DEFAULT_WIDTH = 300;
    const MIN_WIDTH = 100;
    const MAX_WIDTH = 520;
    const DEFAULT_TITLE = "Documents";
    const PUBLISH_TARGET_STORAGE_KEY = "goToolkit.memo.publishTarget";
    const NOTION_PATH_STORAGE_KEY = "goToolkit.memo.notionPath";
    const EXPANDED_STORAGE_KEY = "goToolkit.memo.treeExpanded";
    const ORDER_STORAGE_KEY = "goToolkit.memo.treeOrder";
    const SECTION_EXPANDED_STORAGE_KEY = "goToolkit.memo.sectionExpanded";
    const ICON_CHOICES = [
        "file", "file-text", "sticky-note", "book-text", "notebook", "folder", "folder-open", "archive", "briefcase", "bookmark",
        "star", "flag", "tag", "hash", "list", "list-checks", "check-square", "calendar", "clock", "hourglass",
        "target", "lightbulb", "sparkles", "rocket", "bolt", "wand-sparkles", "brain", "bot", "message-square", "mail",
        "phone", "globe", "map-pin", "compass", "link", "shield", "lock", "key", "settings", "wrench",
        "palette", "pen", "pencil", "brush", "image", "camera", "video", "mic", "headphones", "music"
    ];
    const voiceRecordingsStore = window.goToolkitDocStore?.createStore?.("voice-recordings") || null;
    const recordingIconCache = new Map();

    let superpowersCatalog = null;
    let currentModalSelectedIds = [];

    async function ensureSuperpowersLoaded() {
        if (superpowersCatalog) return superpowersCatalog;
        try {
            const response = await fetch('content/superpowers.json');
            if (response.ok) {
                superpowersCatalog = await response.json();
                return superpowersCatalog;
            }
        } catch (err) {
            console.error('Erreur lors du chargement des super-pouvoirs:', err);
        }
        superpowersCatalog = [];
        return superpowersCatalog;
    }

    function normalizeSuperpowersList(list, category) {
        const normalized = Array.isArray(list) ? list.filter(Boolean) : [];
        if (normalized.length) return normalized;
        return category ? [category] : [];
    }

    async function resolveRecordingIcon(recordingId) {
        if (!recordingId) return "";
        if (recordingIconCache.has(recordingId)) return recordingIconCache.get(recordingId);
        let icon = "cassette-tape";
        try {
            const recording = await voiceRecordingsStore?.get?.(recordingId);
            if (recording?.videoBlob) icon = "video";
        } catch (err) {
            icon = "cassette-tape";
        }
        recordingIconCache.set(recordingId, icon);
        return icon;
    }

    async function populateSuperpowerCheckboxes(selectedIds = []) {
        const catalog = await ensureSuperpowersLoaded();
        const normalizedSelectedIds = Array.isArray(selectedIds)
            ? selectedIds.filter(Boolean).map(id => String(id).toLowerCase())
            : [];

        currentModalSelectedIds = normalizedSelectedIds;
        const container = document.getElementById("document-explorer-superpowers-container");
        if (!container) return;
        container.innerHTML = '';

        catalog.forEach(sp => {
            const label = document.createElement('label');
            label.className = 'superpower-checkbox-label';

            const spIdStr = String(sp.id).toLowerCase();
            const spTitleStr = String(sp.title).toLowerCase();
            const isChecked = normalizedSelectedIds.some(sid => sid === spIdStr || sid === spTitleStr);

            label.innerHTML = `
                <input type="radio" name="document-superpower" value="${sp.id}" ${isChecked ? 'checked' : ''} style="display:none;">
                <span class="superpower-pill ${isChecked ? 'active' : ''}">
                    <i data-lucide="${sp.icon}" style="width:12px;height:12px;"></i>
                    ${sp.title}
                    <i data-lucide="check" class="pill-check-icon" style="width:12px;height:12px;display:${isChecked ? 'inline-block' : 'none'};"></i>
                </span>
            `;
            const input = label.querySelector('input');
            const pill = label.querySelector('.superpower-pill');
            const checkIcon = pill.querySelector('.pill-check-icon');

            input.addEventListener('change', () => {
                const allInputs = container.querySelectorAll('input[name="document-superpower"]');
                allInputs.forEach(node => {
                    const parentPill = node.closest('label')?.querySelector('.superpower-pill');
                    const parentCheck = parentPill?.querySelector('.pill-check-icon');
                    const active = node === input && input.checked;
                    if (parentPill) parentPill.classList.toggle('active', active);
                    if (parentCheck) parentCheck.style.display = active ? 'inline-block' : 'none';
                });
            });
            container.appendChild(label);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function resolveElement(value) {
        if (!value) return null;
        if (typeof value === "string") {
            return document.querySelector(value);
        }
        return value;
    }

    function readNumber(key, fallback) {
        if (typeof localStorage === "undefined") return fallback;
        try {
            const raw = localStorage.getItem(key);
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) ? parsed : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function writeNumber(key, value) {
        if (typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(key, String(value));
        } catch (err) {
            // ignore
        }
    }

    function readBool(key, fallback) {
        if (typeof localStorage === "undefined") return fallback;
        try {
            const raw = localStorage.getItem(key);
            if (raw === "true") return true;
            if (raw === "false") return false;
            return fallback;
        } catch (err) {
            return fallback;
        }
    }

    function writeBool(key, value) {
        if (typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(key, value ? "true" : "false");
        } catch (err) {
            // ignore
        }
    }

    function normalizeList(value) {
        const list = Array.isArray(value) ? value.filter(Boolean) : [];
        const seen = new Set();
        const deduped = [];
        for (const item of list) {
            const id = String(item?.id || "").trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            deduped.push(item);
        }
        return deduped;
    }
    function isAutoFileIcon(value) {
        const icon = String(value || "").trim();
        return !icon || icon === "file" || icon === "file-text";
    }

    function formatRelativeShort(value) {
        const timestamp = Date.parse(value || "");
        if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
        const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
        if (deltaSeconds < 60) return "<1mn";
        const minutes = Math.floor(deltaSeconds / 60);
        if (minutes < 60) return `${minutes}mn`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}j`;
        const months = Math.floor(days / 30) || 1;
        return `${months}m`;
    }

    function createDocumentExplorer(options) {
        const opts = options || {};
        const appId = typeof opts.appId === "string" ? opts.appId.trim() : "";
        const storagePrefix = opts.storagePrefix || "goToolkit.documentExplorer";
        const widthKey = `${storagePrefix}.width${appId ? "." + appId : ""}`;
        const openKey = `${storagePrefix}.open${appId ? "." + appId : ""}`;

        const sidebar = resolveElement(opts.sidebar);
        if (!sidebar) {
            return null;
        }
        const resizer = resolveElement(opts.resizer);
        const toggleBtn = resolveElement(opts.toggleButton);
        const listEl = sidebar.querySelector("[data-document-explorer-list]");
        const tocEl = sidebar.querySelector("[data-document-toc]");
        const headerEl = sidebar.querySelector(".document-explorer__header");
        const libraryPanel = sidebar.querySelector('[data-panel="library"]');
        const tocPanel = sidebar.querySelector('[data-panel="toc"]');
        const tabBtns = sidebar.querySelectorAll(".document-explorer__tab-btn[data-tab]");

        const onCreate = typeof opts.onCreate === "function" ? opts.onCreate : null;
        const onRename = typeof opts.onRename === "function" ? opts.onRename : null;
        const onDelete = typeof opts.onDelete === "function" ? opts.onDelete : null;
        const onSelect = typeof opts.onSelect === "function" ? opts.onSelect : null;
        const onCreateChild = typeof opts.onCreateChild === "function" ? opts.onCreateChild : null;
        const onMove = typeof opts.onMove === "function" ? opts.onMove : null;
        const getCommonItems = typeof opts.getCommonItems === "function" ? opts.getCommonItems : null;
        const getItems = typeof opts.getItems === "function" ? opts.getItems : null;
        const getOpenIds = typeof opts.getOpenIds === "function" ? opts.getOpenIds : null;
        const getActiveId = typeof opts.getActiveId === "function" ? opts.getActiveId : null;
        let cachedItems = [];
        let expandedIds = new Set();
        let draggingId = "";
        let draggingSection = "";
        let orderIds = [];
        let sectionExpanded = { private: true, shared: true };
        let searchQuery = "";
        let preSearchExpandedIds = null;
        let preSearchSectionExpanded = null;

        let hasDefaultTabSet = false;

        ensureSuperpowersLoaded();

        function setActiveTab(target, options) {
            const nextTarget = target === "toc" ? "toc" : "library";
            const shouldRender = options?.renderToc ?? true;

            tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === nextTarget));
            libraryPanel?.classList.toggle("active", nextTarget === "library");
            tocPanel?.classList.toggle("active", nextTarget === "toc");

            if (nextTarget === "toc" && shouldRender) {
                renderTOC();
            }
        }

        function ensureDefaultTab() {
            if (hasDefaultTabSet) return;
            const activeId = typeof getActiveId?.() === "string" ? getActiveId().trim() : "";
            const headings = (window.MemoHeadings || []).filter(h => h.level >= 1 && h.level <= 4);

            if (activeId && headings.length > 0) {
                setActiveTab("toc", { renderToc: true });
                hasDefaultTabSet = true;
            } else if (!activeId) {
                setActiveTab("library");
                hasDefaultTabSet = true;
            }
            // Wait for headings if activeId exists but headings haven't arrived yet
        }

        // Tab Switching Logic
        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const target = btn.dataset.tab;
                setActiveTab(target);
            });
        });

        const closeBtn = headerEl?.querySelector(".chat-knowledge-modal__close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                applyOpen(false);
            });
        }

        if (appId === "memo") {
            const importBtn = document.createElement("button");
            importBtn.type = "button";
            importBtn.className = "chat-knowledge-modal__add btn btn-secondary";
            importBtn.innerHTML = '<i data-lucide="import"></i>';
            importBtn.title = "Importer";
            importBtn.setAttribute("aria-label", "Importer");
            importBtn.addEventListener("click", async () => {
                if (typeof window.GoToolkitMemoCreateAutoDocument === "function") {
                    await window.GoToolkitMemoCreateAutoDocument();
                }
                window.GoToolkitAssistInstance?.openImportFileSelector?.({
                    skipEmbeddings: true
                });
            });
            if (headerEl) {
                const closeBtn = headerEl.querySelector(".chat-knowledge-modal__close");
                if (closeBtn) {
                    importBtn.style.marginLeft = "auto";
                    closeBtn.style.marginLeft = "0";
                    headerEl.insertBefore(importBtn, closeBtn);
                } else {
                    headerEl.appendChild(importBtn);
                }
            }
        }

        if (window.lucide) window.lucide.createIcons();

        function readExpandedState() {
            try {
                const parsed = JSON.parse(localStorage.getItem(EXPANDED_STORAGE_KEY) || "[]");
                if (!Array.isArray(parsed)) return new Set();
                return new Set(parsed.filter(Boolean).map(String));
            } catch (err) {
                return new Set();
            }
        }
        function persistExpandedState() {
            try {
                localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(expandedIds)));
            } catch (err) {
                // ignore
            }
        }
        expandedIds = readExpandedState();
        function readOrderState() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || "[]");
                return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
            } catch (err) {
                return [];
            }
        }
        function persistOrderState() {
            try {
                localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orderIds));
            } catch (err) {
                // ignore
            }
        }
        function readSectionExpandedState() {
            try {
                const parsed = JSON.parse(localStorage.getItem(SECTION_EXPANDED_STORAGE_KEY) || "{}");
                return {
                    private: parsed?.private !== false,
                    shared: parsed?.shared !== false,
                    common: parsed?.common !== false,
                    superpowers: parsed?.superpowers !== false
                };
            } catch (err) {
                return { private: true, shared: true, common: true, superpowers: true };
            }
        }
        function persistSectionExpandedState() {
            try {
                localStorage.setItem(SECTION_EXPANDED_STORAGE_KEY, JSON.stringify(sectionExpanded));
            } catch (err) {
                // ignore
            }
        }
        function syncOrderWithItems(items) {
            const ids = new Set(normalizeList(items).map(item => String(item.id || "")));
            const kept = orderIds.filter(id => ids.has(id));
            const existing = new Set(kept);
            normalizeList(items).forEach(item => {
                const id = String(item.id || "");
                if (id && !existing.has(id)) {
                    kept.push(id);
                    existing.add(id);
                }
            });
            orderIds = kept;
            persistOrderState();
        }
        orderIds = readOrderState();
        sectionExpanded = readSectionExpandedState();

        const modalOverlay = document.createElement("div");
        modalOverlay.className = "modal-overlay";
        modalOverlay.setAttribute("role", "dialog");
        modalOverlay.setAttribute("aria-modal", "true");
        modalOverlay.style.display = "none";
        modalOverlay.innerHTML = `
            <div class="modal document-edit-modal">
                <div class="modal-header">
                    <h3>Document</h3>
                    <button class="modal-close" type="button" aria-label="Fermer"><i data-lucide="x"></i></button>
                </div>
                <div class="ia-actions">
                    <div class="header-row ia-header-actions">
                        <label for="document-explorer-name-input">Nom</label>
                        <div class="document-explorer-icon-field">
                            <button id="document-explorer-icon-btn" type="button" class="btn btn-secondary" title="Choisir une icône"><i data-lucide="file"></i></button>
                            <input id="document-explorer-name-input" type="text" placeholder="Nom du document" />
                            <div id="document-explorer-icon-grid" class="document-explorer-icon-grid"></div>
                        </div>
                    </div>
                    <div class="header-row ia-header-actions" style="display:block;">
                        <label>Superpouvoirs</label>
                        <div id="document-explorer-superpowers-container" class="superpowers-checkbox-group"></div>
                    </div>
                    <div class="header-row ia-header-actions">
                        <label for="document-explorer-description-input">Description</label>
                        <textarea id="document-explorer-description-input" rows="3" placeholder="Description courte (optionnelle)"></textarea>
                    </div>
                    <div class="modal-actions" style="justify-content: space-between; align-items: center;">
                        <div style="display:flex; align-items:center; gap:8px; flex: 1; max-width: 560px;">
                            <select id="publishTargetSelect"
                                style="width: 140px; height: 26px; font-size: 11px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg-surface); color: var(--text-main); padding: 0 8px; outline: none;">
                                <option value="gotoolkit"><i data-lucide="zap"></i> Go-Live</option>
                                <option value="notion"><i data-lucide="notebook"></i> Notion</option>
                            </select>
                            <div id="notionPathContainer" style="display:none; position:relative; flex:1;">
                                <input type="text" id="notionPathInput" placeholder=""
                                    style="width: 100%; height: 26px; font-size: 11px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg-surface); color: var(--text-main); padding: 0 24px 0 8px; outline: none;">
                                <button type="button" id="notionUnlinkBtn" title="Délier Notion"
                                    style="position:absolute; right:4px; top:50%; transform:translateY(-50%); border:none; background:transparent; color:var(--text-muted); padding:0; width:16px; height:16px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                                    <i data-lucide="unlink" style="width:12px;height:12px;"></i>
                                </button>
                            </div>
                            <div id="ownerTokenContainer" style="display:flex; align-items:center; gap:6px; flex: 1;">
                                <i data-lucide="user" style="width:12px;height:12px;"></i>
                                <input type="text" id="ownerToken" placeholder="Prénom"
                                    style="width: 100%; height: 26px; font-size: 11px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg-surface); color: var(--text-main); padding: 0 8px; outline: none;">
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; margin-left: auto;">
                            <button class="btn btn-secondary" type="button" data-cancel>Annuler</button>
                            <button class="btn btn-secondary" type="button" data-publish style="display:none;">Publier</button>
                            <button class="btn-primary" type="button" data-confirm>Enregistrer</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const modalCloseBtn = modalOverlay.querySelector(".modal-close");
        const modalCancelBtn = modalOverlay.querySelector("[data-cancel]");
        const modalPublishBtn = modalOverlay.querySelector("[data-publish]");
        const modalConfirmBtn = modalOverlay.querySelector("[data-confirm]");
        const modalEl = modalOverlay.querySelector(".modal");
        const modalInput = modalOverlay.querySelector("#document-explorer-name-input");
        const modalIconBtn = modalOverlay.querySelector("#document-explorer-icon-btn");
        const modalIconGrid = modalOverlay.querySelector("#document-explorer-icon-grid");
        const modalDescInput = modalOverlay.querySelector("#document-explorer-description-input");
        const ownerTokenInput = modalOverlay.querySelector("#ownerToken");
        const ownerTokenContainer = modalOverlay.querySelector("#ownerTokenContainer");
        const publishTargetSelect = modalOverlay.querySelector("#publishTargetSelect");
        const notionPathContainer = modalOverlay.querySelector("#notionPathContainer");
        const notionPathInput = modalOverlay.querySelector("#notionPathInput");
        const notionUnlinkBtn = modalOverlay.querySelector("#notionUnlinkBtn");
        let searchWrap = null;
        let searchInput = null;
        let searchClearBtn = null;
        function normalizeOwnerTokenInput(value) {
            return String(value || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .trim();
        }
        let modalResolver = null;
        let modalAllowPublish = false;
        let modalDocumentId = "";
        let modalNotionLink = { pageId: "", url: "", path: "", workspaceId: "" };
        let modalNotionUnlinkRequested = false;
        let modalIcon = "file";

        function getSelectedSuperpowers() {
            const container = modalOverlay.querySelector("#document-explorer-superpowers-container");
            if (!container) return [];
            const selected = container.querySelector('input[name="document-superpower"]:checked');
            return selected ? [selected.value] : [];
        }

        function closeModal() {
            modalOverlay.classList.remove("open");
            modalOverlay.style.display = "none";
            if (modalIconGrid) modalIconGrid.classList.remove("open");
            modalResolver = null;
            modalAllowPublish = false;
        }
        function renderIconGrid() {
            if (!modalIconGrid) return;
            modalIconGrid.innerHTML = "";
            ICON_CHOICES.forEach(icon => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "document-explorer-icon-choice" + (modalIcon === icon ? " active" : "");
                btn.innerHTML = `<i data-lucide="${icon}"></i>`;
                btn.title = icon;
                btn.addEventListener("click", () => {
                    modalIcon = icon;
                    modalIconGrid.querySelectorAll(".document-explorer-icon-choice").forEach(node => node.classList.remove("active"));
                    btn.classList.add("active");
                    if (modalIconBtn) modalIconBtn.innerHTML = `<i data-lucide="${icon}"></i>`;
                    modalIconGrid.classList.remove("open");
                    if (window.lucide) window.lucide.createIcons();
                });
                modalIconGrid.appendChild(btn);
            });
            if (window.lucide) window.lucide.createIcons();
        }

        function hasAdminToken() {
            const token = localStorage.getItem("feedback-admin-token") || "";
            return Boolean(String(token).trim());
        }

        function syncOwnerTokenFromStorage() {
            if (!ownerTokenInput) return;
            const stored = localStorage.getItem("feedback-admin-token") || "";
            const normalized = normalizeOwnerTokenInput(stored);
            if (!ownerTokenInput.value && normalized) ownerTokenInput.value = normalized;
            if (normalized && stored !== normalized) {
                localStorage.setItem("feedback-admin-token", normalized);
            }
        }

        function updatePublishVisibility() {
            const isNotion = (publishTargetSelect?.value || "gotoolkit") === "notion";
            const allowPublish = Boolean(modalAllowPublish && (isNotion || hasAdminToken()));
            if (modalPublishBtn) {
                modalPublishBtn.style.display = allowPublish ? "inline-flex" : "none";
            }
            if (modalCancelBtn) {
                modalCancelBtn.style.display = allowPublish ? "none" : "inline-flex";
            }
        }

        function getSavedNotionPath() {
            try {
                return String(localStorage.getItem(NOTION_PATH_STORAGE_KEY) || "").trim();
            } catch (err) {
                return "";
            }
        }

        function updatePublishTargetUI() {
            const isNotion = (publishTargetSelect?.value || "gotoolkit") === "notion";
            if (ownerTokenContainer) ownerTokenContainer.style.display = isNotion ? "none" : "flex";
            const linked = Boolean(modalNotionLink?.pageId);
            if (notionPathContainer) notionPathContainer.style.display = isNotion && linked ? "block" : "none";
            if (notionPathInput) {
                notionPathInput.readOnly = true;
                notionPathInput.value = modalNotionLink.path || modalNotionLink.url || "";
            }
        }

        async function openNameModal(defaultValue, defaultDescription, options) {
            if (!modalInput) return null;
            modalOverlay.style.display = "flex";
            modalOverlay.classList.add("open");

            const selectedSuperpowers = normalizeSuperpowersList(
                options && options.superpowers,
                options && options.category
            );

            await populateSuperpowerCheckboxes(selectedSuperpowers);
            if (window.lucide) window.lucide.createIcons();
            modalInput.value = defaultValue || "";
            modalIcon = (options && typeof options.icon === "string" && options.icon.trim()) ? options.icon.trim() : "file";
            if (modalIconBtn) modalIconBtn.innerHTML = `<i data-lucide="${modalIcon}"></i>`;
            renderIconGrid();
            if (modalDescInput) modalDescInput.value = defaultDescription || "";
            const shouldFetchFromStore = Boolean(options?.documentId);
            if (shouldFetchFromStore) {
                const documentApi = window.goToolkitDocumentApi;
                if (documentApi?.getRecord) {
                    try {
                        const record = await documentApi.getRecord(options.documentId);
                        console.log("[GoToolkit] Document record from IndexedDB:", record);
                        if (record) {
                            const fromStore = normalizeSuperpowersList(record?.superpowers, record?.category);
                            // On repeuple systématiquement si on a un documentId pour être sûr d'avoir la donnée de la source de vérité
                            await populateSuperpowerCheckboxes(fromStore);
                            if (window.lucide) window.lucide.createIcons();
                        }
                    } catch (err) { /* noop */ }
                }
            }
            syncOwnerTokenFromStorage();
            if (publishTargetSelect) {
                publishTargetSelect.value = "gotoolkit";
            }
            if (notionPathInput) {
                notionPathInput.value = "";
            }
            modalDocumentId = String(options?.documentId || "").trim();
            modalNotionUnlinkRequested = false;
            modalNotionLink = { pageId: "", url: "", path: "", workspaceId: "" };
            if (modalDocumentId && window.goToolkitDocumentApi?.getRecord) {
                try {
                    const record = await window.goToolkitDocumentApi.getRecord(modalDocumentId);
                    modalNotionLink = {
                        pageId: String(record?.notionPageId || "").trim(),
                        url: String(record?.notionPageUrl || "").trim(),
                        path: String(record?.notionPath || "").trim(),
                        workspaceId: String(record?.notionWorkspaceId || "").trim()
                    };
                } catch (err) {
                    modalNotionLink = { pageId: "", url: "", path: "", workspaceId: "" };
                }
            }
            if (!modalNotionLink.pageId) {
                const fallbackPath = getSavedNotionPath();
                if (fallbackPath) modalNotionLink.path = fallbackPath;
            }
            updatePublishTargetUI();
            modalAllowPublish = Boolean(options && options.allowPublish);
            updatePublishVisibility();
            requestAnimationFrame(() => {
                modalInput.focus();
                modalInput.select();
            });
            return new Promise(resolve => {
                modalResolver = resolve;
            });
        }

        function resolveModal(value) {
            if (typeof modalResolver === "function") {
                modalResolver(value);
            }
            closeModal();
        }

        modalCloseBtn?.addEventListener("click", () => resolveModal(null));
        modalCancelBtn?.addEventListener("click", () => resolveModal(null));
        modalIconBtn?.addEventListener("click", () => {
            if (!modalIconGrid) return;
            modalIconGrid.classList.toggle("open");
        });
        modalOverlay.addEventListener("click", event => {
            if (!modalIconGrid) return;
            if (event.target === modalIconBtn || modalIconBtn?.contains(event.target)) return;
            if (event.target === modalIconGrid || modalIconGrid.contains(event.target)) return;
            modalIconGrid.classList.remove("open");
        });
        modalPublishBtn?.addEventListener("click", () => {
            resolveModal({
                name: modalInput?.value || "",
                icon: modalIcon,
                description: modalDescInput?.value || "",
                superpowers: getSelectedSuperpowers(),
                action: "publish",
                publishTarget: publishTargetSelect?.value || "gotoolkit",
                notionPath: notionPathInput?.value || "",
                notionPageId: modalNotionLink.pageId || "",
                notionWorkspaceId: modalNotionLink.workspaceId || "",
                unlinkNotion: Boolean(modalNotionUnlinkRequested)
            });
        });
        modalConfirmBtn?.addEventListener("click", () => {
            resolveModal({
                name: modalInput?.value || "",
                icon: modalIcon,
                description: modalDescInput?.value || "",
                superpowers: getSelectedSuperpowers(),
                action: "confirm",
                unlinkNotion: Boolean(modalNotionUnlinkRequested)
            });
        });
        ownerTokenInput?.addEventListener("input", () => {
            const normalized = normalizeOwnerTokenInput(ownerTokenInput.value || "");
            if (ownerTokenInput.value !== normalized) ownerTokenInput.value = normalized;
            if (normalized) {
                localStorage.setItem("feedback-admin-token", normalized);
            } else {
                localStorage.removeItem("feedback-admin-token");
            }
        });
        ownerTokenInput?.addEventListener("blur", () => {
            const normalized = normalizeOwnerTokenInput(ownerTokenInput.value || "");
            if (ownerTokenInput.value !== normalized) ownerTokenInput.value = normalized;
            if (normalized) {
                localStorage.setItem("feedback-admin-token", normalized);
            } else {
                localStorage.removeItem("feedback-admin-token");
            }
            updatePublishVisibility();
        });
        publishTargetSelect?.addEventListener("change", () => {
            const value = (publishTargetSelect.value || "gotoolkit").toLowerCase();
            localStorage.setItem(PUBLISH_TARGET_STORAGE_KEY, value === "notion" ? "notion" : "gotoolkit");
            updatePublishTargetUI();
            updatePublishVisibility();
        });
        notionUnlinkBtn?.addEventListener("click", () => {
            modalNotionUnlinkRequested = true;
            modalNotionLink = { pageId: "", url: "", path: "", workspaceId: "" };
            if (notionPathInput) notionPathInput.value = "";
            updatePublishTargetUI();
        });
        modalEl?.addEventListener("click", event => {
            event.stopPropagation();
        });

        modalInput?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                resolveModal({
                    name: modalInput?.value || "",
                    icon: modalIcon,
                    description: modalDescInput?.value || "",
                    superpowers: getSelectedSuperpowers(),
                    action: "confirm",
                    unlinkNotion: Boolean(modalNotionUnlinkRequested)
                });
            } else if (event.key === "Escape") {
                if (modalIconGrid?.classList.contains("open")) {
                    modalIconGrid.classList.remove("open");
                }
            }
        });

    function normalizeName(value) {
        const name = String(value || "").trim();
        return name || "New page";
    }

        function uniqueName(name, list, extraNames, excludeId) {
            const base = normalizeName(name);
            const names = (list || [])
                .filter(item => !excludeId || item.id !== excludeId)
                .map(item => String(item.title || "").trim())
                .filter(Boolean);
            const extras = Array.isArray(extraNames) ? extraNames.map(value => String(value || "").trim()).filter(Boolean) : [];
            const allNames = names.concat(extras);
            if (!allNames.includes(base)) return base;
            let index = 1;
            let candidate = `${base} (${index})`;
            while (allNames.includes(candidate)) {
                index += 1;
                candidate = `${base} (${index})`;
            }
            return candidate;
        }

        let isOpen = (window.innerWidth < 900) ? false : readBool(openKey, false);
        let width = clamp(readNumber(widthKey, DEFAULT_WIDTH), MIN_WIDTH, MAX_WIDTH);

        function applyWidth(nextWidth) {
            width = clamp(nextWidth, MIN_WIDTH, MAX_WIDTH);
            sidebar.style.setProperty("--doc-sidebar-width", `${width}px`);
            writeNumber(widthKey, width);
        }

        function applyOpen(nextOpen) {
            isOpen = Boolean(nextOpen);
            if (isOpen && window.innerWidth < 900) {
                const assist = window.GoToolkitAssistInstance;
                if (assist?.isOpen && typeof assist.close === "function") {
                    assist.close();
                }
            }
            sidebar.classList.toggle("document-explorer--collapsed", !isOpen);
            if (resizer) {
                resizer.classList.toggle("is-hidden", !isOpen);
            }
            if (toggleBtn) {
                toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
                toggleBtn.title = isOpen ? "Masquer les documents" : "Afficher les documents";

                const icon = toggleBtn.querySelector("[data-lucide]");
                if (icon) {
                    icon.setAttribute("data-lucide", isOpen ? "panel-left-close" : "panel-left-open");
                    if (window.lucide) window.lucide.createIcons();
                }
            }
            writeBool(openKey, isOpen);
        }

        function getSafeHeadingPos(editor, heading) {
            if (!editor || !heading) return null;
            const rawPos = Number.isFinite(heading.pos) ? heading.pos : null;
            if (rawPos === null) return null;

            const doc = editor.state?.doc;
            if (!doc) return null;

            const maxPos = Math.max(0, doc.content.size);
            const clampPos = pos => Math.max(0, Math.min(pos, maxPos));

            const tryResolve = pos => {
                try {
                    const $pos = doc.resolve(clampPos(pos));
                    return $pos?.parent?.inlineContent ? $pos.pos : null;
                } catch (e) {
                    return null;
                }
            };

            let safePos = tryResolve(rawPos);
            if (safePos !== null) return safePos;

            safePos = tryResolve(rawPos + 1);
            if (safePos !== null) return safePos;

            const node = doc.nodeAt(clampPos(rawPos));
            if (node && node.isTextblock && node.content.size > 0) {
                safePos = tryResolve(rawPos + 1);
                if (safePos !== null) return safePos;
            }

            for (let offset = 2; offset <= 6; offset += 1) {
                safePos = tryResolve(rawPos + offset);
                if (safePos !== null) return safePos;
            }

            return null;
        }

        function renderTOC() {
            if (!tocEl) return;
            const headings = (window.MemoHeadings || []).filter(h => h.level >= 1 && h.level <= 4);

            if (!headings.length) {
                tocEl.innerHTML = '<div class="document-explorer__empty">Aucun titre</div>';
                return;
            }

            tocEl.innerHTML = "";
            headings.forEach(heading => {
                const item = document.createElement("div");
                item.className = `toc-item toc-item--h${heading.level}`;
                item.textContent = heading.textContent;
                item.dataset.id = heading.id;

                item.addEventListener("click", () => {
                    const editor = window.MemoEditor || window.memoEditor;
                    if (editor) {
                        try {
                            const element = editor.view.dom.querySelector(`[id="${heading.id}"]`);
                            const safePos = getSafeHeadingPos(editor, heading);
                            const scrollArea = document.querySelector(".editor-wrap");
                            const offset = 20; // offset to not stick exactly to the top

                            // Highlight active immediately
                            tocEl.querySelectorAll(".toc-item").forEach(el => el.classList.remove("toc-item--active"));
                            item.classList.add("toc-item--active");

                            if (safePos !== null) {
                                editor.chain().focus().setTextSelection(safePos).run();
                            } else {
                                editor.commands.focus();
                            }

                            if (element && scrollArea) {
                                const areaRect = scrollArea.getBoundingClientRect();
                                const elementRect = element.getBoundingClientRect();
                                const relativeTop = elementRect.top - areaRect.top + scrollArea.scrollTop;
                                scrollArea.scrollTo({
                                    top: Math.max(0, relativeTop - offset),
                                    behavior: "smooth"
                                });
                            } else if (safePos !== null && editor.view?.coordsAtPos && scrollArea) {
                                const coords = editor.view.coordsAtPos(safePos);
                                const areaRect = scrollArea.getBoundingClientRect();
                                const relativeTop = coords.top - areaRect.top + scrollArea.scrollTop;
                                scrollArea.scrollTo({
                                    top: Math.max(0, relativeTop - offset),
                                    behavior: "smooth"
                                });
                            } else if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        } catch (e) {
                            console.error("ToC scroll error:", e);
                        }
                    }
                });

                tocEl.appendChild(item);
            });

            updateActiveHeading();
        }

        function updateActiveHeading() {
            if (!tocEl || !tocPanel?.classList.contains("active")) return;

            const editor = window.MemoEditor || window.memoEditor;
            if (!editor) return;

            const headings = (window.MemoHeadings || []).filter(h => h.level >= 1 && h.level <= 4);
            if (!headings.length) return;

            const scrollArea = document.querySelector(".editor-wrap");
            if (!scrollArea) return;

            // Find the heading that is most "active" (closest to the top of the viewport but not passed)
            let activeHeadingId = null;
            const scrollRect = scrollArea.getBoundingClientRect();

            // Collect all heading elements and their positions relative to the scroll area top
            const headingElements = headings.map(h => {
                const el = editor.view.dom.querySelector(`[id="${h.id}"]`);
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { id: h.id, top: rect.top - scrollRect.top };
            }).filter(Boolean);

            // The active heading is the last one whose top is <= some threshold (e.g. 50px)
            // We use a smaller threshold (80px) to better match visual "top"
            const threshold = 80;
            for (let i = 0; i < headingElements.length; i++) {
                if (headingElements[i].top <= threshold) {
                    activeHeadingId = headingElements[i].id;
                } else {
                    break;
                }
            }

            // Fallback to first if none reached threshold but we are at top
            if (!activeHeadingId && headingElements.length > 0) {
                activeHeadingId = headingElements[0].id;
            }

            tocEl.querySelectorAll(".toc-item").forEach(item => {
                item.classList.toggle("toc-item--active", item.dataset.id === activeHeadingId);
            });
        }

        window.addEventListener('memo:headings-updated', () => {
            ensureDefaultTab();
            if (tocPanel?.classList.contains("active")) {
                renderTOC();
            }
        });

        // Robust scroll listener for active heading using capture phase 
        // because scroll events do not bubble and .editor-wrap might be replaced by React
        let scrollTimeout;
        window.addEventListener('scroll', (event) => {
            const target = event.target;
            if (target && target instanceof HTMLElement && target.classList.contains('editor-wrap')) {
                if (!scrollTimeout) {
                    scrollTimeout = setTimeout(() => {
                        updateActiveHeading();
                        scrollTimeout = null;
                    }, 150);
                }
            }
        }, { passive: true, capture: true });

        function renderEmpty() {
            if (!listEl) return;
            listEl.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "document-explorer__empty";
            empty.textContent = "Aucun document";
            listEl.appendChild(empty);
        }

        let renderListNonce = 0;
        let listDnDBound = false;
        let hasLoadedTreeData = false;

        function buildTree(items) {
            const byId = new Map((items || []).filter(Boolean).map(item => [item.id, item]));
            const childrenByParent = new Map();
            const roots = [];
            (items || []).forEach(item => {
                const pid = String(item?.parentId || "").trim();
                if (!pid || !byId.has(pid)) {
                    roots.push(item);
                    return;
                }
                if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
                childrenByParent.get(pid).push(item);
            });
            const indexById = new Map(orderIds.map((id, index) => [id, index]));
            const sortFn = (a, b) => {
                const ai = indexById.has(a.id) ? indexById.get(a.id) : Number.MAX_SAFE_INTEGER;
                const bi = indexById.has(b.id) ? indexById.get(b.id) : Number.MAX_SAFE_INTEGER;
                return ai - bi;
            };
            roots.sort(sortFn);
            childrenByParent.forEach(list => list.sort(sortFn));
            return { roots, childrenByParent, byId };
        }
        function getItemSection(item) {
            if (!item) return "private";
            if (item.section === "superpowers") return "superpowers";
            if (item.section === "common") return "common";
            if (item.isCommon) return "common";
            if (String(item.id || "").startsWith("common:")) return "common";
            if (item.section === "shared") return "shared";
            if (item.isShared) return "shared";
            if (String(item.id || "").startsWith("share:")) return "shared";
            return "private";
        }
        function applyLocalOrderMove(docId, parentId, beforeId) {
            const list = orderIds.filter(id => id !== docId);
            if (beforeId && list.includes(beforeId)) {
                const index = list.indexOf(beforeId);
                list.splice(index, 0, docId);
            } else {
                const parent = String(parentId || "");
                const siblingIds = normalizeList(cachedItems)
                    .filter(item => String(item.parentId || "") === parent && item.id !== docId)
                    .map(item => item.id)
                    .filter(id => list.includes(id));
                if (siblingIds.length) {
                    const lastSibling = siblingIds[siblingIds.length - 1];
                    const index = list.indexOf(lastSibling);
                    list.splice(index + 1, 0, docId);
                } else {
                    list.push(docId);
                }
            }
            orderIds = list;
            persistOrderState();
        }
        function applyLocalParentMove(docId, parentId) {
            const target = normalizeList(cachedItems).find(item => String(item.id || "") === String(docId || ""));
            if (!target) return;
            target.parentId = String(parentId || "").trim();
        }

        function hasDepthExceeded(targetId, movingId, byId, nextDepth) {
            if (movingId === targetId) return true;
            let walk = byId.get(targetId);
            while (walk) {
                if (walk.id === movingId) return true;
                const pid = String(walk.parentId || "").trim();
                walk = pid ? byId.get(pid) : null;
            }
            return nextDepth > 4;
        }

        function ensureSearchViewState() {
            const hasQuery = Boolean(String(searchQuery || "").trim());
            if (hasQuery) {
                if (!preSearchExpandedIds) preSearchExpandedIds = new Set(expandedIds);
                if (!preSearchSectionExpanded) preSearchSectionExpanded = { ...sectionExpanded };
                sectionExpanded = { ...sectionExpanded, private: true, shared: true, common: true, superpowers: true };
                expandedIds = new Set(normalizeList(cachedItems).map(item => String(item.id || "")).filter(Boolean));
                persistExpandedState();
                persistSectionExpandedState();
            } else if (preSearchExpandedIds || preSearchSectionExpanded) {
                expandedIds = preSearchExpandedIds ? new Set(preSearchExpandedIds) : expandedIds;
                sectionExpanded = preSearchSectionExpanded ? { ...preSearchSectionExpanded } : sectionExpanded;
                preSearchExpandedIds = null;
                preSearchSectionExpanded = null;
                persistExpandedState();
                persistSectionExpandedState();
            }
            if (searchClearBtn) {
                searchClearBtn.style.display = hasQuery ? "inline-flex" : "none";
            }
            if (searchWrap) {
                searchWrap.classList.toggle("is-searching", hasQuery);
            }
        }

        async function renderList(items) {
            if (!listEl) return;
            const nonce = ++renderListNonce;
            await ensureSuperpowersLoaded();

            if (nonce !== renderListNonce) return;

            const safeItems = normalizeList(items);
            const needle = String(searchQuery || "").trim().toLowerCase();
            const filteredItems = needle
                ? safeItems.filter(item => String(item?.title || "").toLowerCase().includes(needle))
                : safeItems;
            listEl.innerHTML = "";
            const activeId = typeof getActiveId?.() === "string" ? getActiveId() : "";
            const sectionItems = {
                private: filteredItems.filter(item => getItemSection(item) === "private"),
                shared: filteredItems.filter(item => getItemSection(item) === "shared"),
                common: filteredItems.filter(item => getItemSection(item) === "common")
            };
            const trees = {
                private: buildTree(sectionItems.private),
                shared: buildTree(sectionItems.shared),
                common: buildTree(sectionItems.common)
            };
            const renderNode = async (item, level, sectionName, containerEl) => {
                const tree = trees[sectionName] || trees.private;
                const childrenByParent = tree.childrenByParent;
                const byId = tree.byId;
                const children = childrenByParent.get(item.id) || [];
                const hasChildren = children.length > 0;
                if (!hasChildren && expandedIds.has(item.id)) {
                    expandedIds.delete(item.id);
                    persistExpandedState();
                }
                const isExpanded = hasChildren && expandedIds.has(item.id);
                const row = document.createElement("div");
                row.className = "document-explorer__tree-row";
                row.style.marginLeft = `${Math.max(0, level - 1) * 12}px`;

                const button = document.createElement("button");
                button.type = "button";
                button.className = "document-explorer__item";
                button.draggable = true;
                if (item.id) {
                    button.dataset.documentId = item.id;
                    if (activeId && activeId === item.id) {
                        button.classList.add("document-explorer__item--active");
                    }
                }
                const payloadRecordingId = item?.payload?.tabs?.find(tab => typeof tab?.voiceRecordingId === "string" && tab.voiceRecordingId)?.voiceRecordingId || null;
                const hasRecording = !!(item.voiceRecordingId || payloadRecordingId);
                const recordingId = item.voiceRecordingId || payloadRecordingId;
                const recordingIconName = await resolveRecordingIcon(recordingId);
                const resolvedHandoffId = (typeof item.handoffId === "string" && item.handoffId) ? item.handoffId : null;
                const hasHandoff = resolvedHandoffId !== null;
                const hasNotion = Boolean(String(item?.notionPageId || "").trim());
                const lead = document.createElement("span");
                lead.className = "document-explorer__item-leading";
                lead.setAttribute("role", "button");
                lead.setAttribute("tabindex", "0");
                lead.setAttribute("aria-label", isExpanded ? "Réduire les sous-documents" : "Afficher les sous-documents");
                const defaultIconName = (() => {
                    if (hasHandoff) return "";
                    if (hasRecording) return recordingIconName;
                    if (!isAutoFileIcon(item.icon)) return item.icon;
                    if (item.isShared) return "file-symlink";
                    return hasChildren ? "file-text" : "file";
                })();
                const renderLeading = (showChevron) => {
                    if (!hasChildren) {
                        lead.innerHTML = defaultIconName ? `<i data-lucide="${defaultIconName}"></i>` : "";
                    } else if (showChevron) {
                        lead.innerHTML = `<i data-lucide="${isExpanded ? "chevron-down" : "chevron-right"}"></i>`;
                    } else {
                        lead.innerHTML = `<i data-lucide="${isExpanded ? "chevron-down" : defaultIconName}"></i>`;
                    }
                    if (window.lucide) window.lucide.createIcons();
                };
                renderLeading(false);
                lead.addEventListener("click", event => {
                    if (!hasChildren) return;
                    event.stopPropagation();
                    if (expandedIds.has(item.id)) expandedIds.delete(item.id);
                    else expandedIds.add(item.id);
                    persistExpandedState();
                    renderList(cachedItems);
                });
                lead.addEventListener("keydown", event => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    if (!hasChildren) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (expandedIds.has(item.id)) expandedIds.delete(item.id);
                    else expandedIds.add(item.id);
                    persistExpandedState();
                    renderList(cachedItems);
                });
                button.appendChild(lead);

                const label = document.createElement("span");
                label.className = "document-explorer__item-title";
                const notionIcon = hasNotion ? '<i data-lucide="notebook" style="width:14px;height:14px;margin-right:6px;vertical-align:text-bottom;opacity:0.85;"></i>' : "";
                label.innerHTML = `${notionIcon}${item.title || "Docs sans titre"}`;
                button.appendChild(label);

                const actions = document.createElement("span");
                actions.className = "document-explorer__item-actions";
                const plusBtn = document.createElement("button");
                plusBtn.type = "button";
                plusBtn.className = "document-explorer__item-action";
                plusBtn.innerHTML = '<i data-lucide="plus"></i>';
                plusBtn.title = "Créer une sous-page";
                plusBtn.addEventListener("click", event => {
                    event.stopPropagation();
                    onCreateChild?.(item);
                });
                actions.appendChild(plusBtn);

                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "document-explorer__item-action document-explorer__delete";
                deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                deleteBtn.title = "Supprimer";
                deleteBtn.addEventListener("click", event => {
                    event.stopPropagation();
                    onDelete?.(item);
                });
                actions.appendChild(deleteBtn);
                button.appendChild(actions);
                button.addEventListener("mouseenter", () => renderLeading(true));
                button.addEventListener("mouseleave", () => renderLeading(false));
                button.addEventListener("click", () => onSelect?.(item));
                button.addEventListener("dblclick", event => {
                    if (String(activeId || "") !== String(item.id || "")) return;
                    if (event.target.closest(".document-explorer__item-actions")) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const initialValue = item.title || "Document";
                    const input = document.createElement("input");
                    input.type = "text";
                    input.className = "document-explorer__item-inline-input";
                    input.value = initialValue;
                    input.setAttribute("aria-label", "Renommer le document");
                    label.innerHTML = "";
                    label.appendChild(input);
                    input.focus();
                    input.select();
                    const finish = submit => {
                        const nextName = String(input.value || "").trim();
                        if (submit && nextName && onRename) {
                            onRename(item, {
                                name: uniqueName(nextName, cachedItems, null, item.id),
                                description: item.description || "",
                                superpowers: normalizeSuperpowersList(item.superpowers, item.category),
                                icon: item.icon || (item.isShared ? "file-symlink" : ""),
                                action: "confirm",
                                unlinkNotion: false
                            });
                        } else {
                            label.innerHTML = `${hasNotion ? '<i data-lucide="notebook" style="width:14px;height:14px;margin-right:6px;vertical-align:text-bottom;opacity:0.85;"></i>' : ""}${initialValue}`;
                            if (window.lucide) window.lucide.createIcons();
                        }
                    };
                    input.addEventListener("keydown", keyEvent => {
                        if (keyEvent.key === "Enter") {
                            keyEvent.preventDefault();
                            finish(true);
                        } else if (keyEvent.key === "Escape") {
                            keyEvent.preventDefault();
                            finish(false);
                        }
                    });
                    input.addEventListener("blur", () => finish(true), { once: true });
                });
                button.addEventListener("dragstart", event => {
                    draggingId = item.id;
                    draggingSection = sectionName || getItemSection(item);
                    button.classList.add("is-dragging");
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.id);
                });
                button.addEventListener("dragend", () => {
                    draggingId = "";
                    draggingSection = "";
                    button.classList.remove("is-dragging");
                });
                button.addEventListener("dragover", event => {
                    if (!draggingId || draggingId === item.id) return;
                    event.preventDefault();
                });
                button.addEventListener("drop", async event => {
                    event.preventDefault();
                    const fromId = draggingId;
                    draggingId = "";
                    if (!fromId || fromId === item.id || !onMove) return;
                    const rect = button.getBoundingClientRect();
                    const y = event.clientY - rect.top;
                    const upper = rect.height * 0.33;
                    const lower = rect.height * 0.67;
                    let parentId = "";
                    let beforeId = "";
                    let nextDepth = 1;
                    if (y < upper) {
                        parentId = String(item.parentId || "");
                        beforeId = item.id;
                        nextDepth = Math.max(1, level);
                    } else if (y > lower) {
                        parentId = String(item.parentId || "");
                        beforeId = "";
                        nextDepth = Math.max(1, level);
                    } else {
                        parentId = item.id;
                        beforeId = "";
                        nextDepth = Math.min(4, level + 1);
                    }
                    if (hasDepthExceeded(parentId || item.id, fromId, byId, nextDepth)) return;
                    const fromItem = normalizeList(cachedItems).find(entry => String(entry?.id || "") === String(fromId));
                    const fromSection = draggingSection || getItemSection(fromItem);
                    const toSection = sectionName || "private";
                    await onMove(fromId, parentId, nextDepth, beforeId, { fromSection, toSection });
                    if (fromSection === toSection) {
                        applyLocalParentMove(fromId, parentId);
                        applyLocalOrderMove(fromId, parentId, beforeId);
                        renderList(cachedItems);
                    }
                    draggingSection = "";
                });
                row.appendChild(button);
                containerEl.appendChild(row);
                if (isExpanded) {
                    if (level < 4) {
                        for (const child of children) {
                            await renderNode(child, level + 1, sectionName, containerEl);
                        }
                    }
                }
            };
            const renderSection = async (sectionName, title) => {
                const sectionRoot = document.createElement("div");
                sectionRoot.className = "document-explorer__section";
                const sectionHeader = document.createElement("button");
                sectionHeader.type = "button";
                sectionHeader.className = "document-explorer__section-header";
                const sectionIcon = sectionName === "shared" ? "cloud" : (sectionName === "common" ? "component" : "book");
                sectionHeader.innerHTML = `<i data-lucide="${sectionIcon}"></i><strong>${title}</strong><i data-lucide="${sectionExpanded[sectionName] ? "chevron-down" : "chevron-right"}"></i>`;
                sectionHeader.addEventListener("click", () => {
                    sectionExpanded[sectionName] = !sectionExpanded[sectionName];
                    persistSectionExpandedState();
                    renderList(cachedItems);
                });
                sectionRoot.appendChild(sectionHeader);
                const sectionBody = document.createElement("div");
                sectionBody.className = "document-explorer__section-body";
                sectionBody.dataset.section = sectionName;
                if (!sectionExpanded[sectionName]) {
                    sectionBody.style.display = "none";
                } else {
                    const roots = trees[sectionName]?.roots || [];
                    for (const root of roots) {
                        await renderNode(root, 1, sectionName, sectionBody);
                    }
                }
                sectionRoot.appendChild(sectionBody);
                listEl.appendChild(sectionRoot);
                return sectionBody;
            };
            await renderSection("common", "Commun");
            await renderSection("private", "Privé");
            await renderSection("shared", "Partagé");
            const renderSuperpowersSection = async () => {
                const sectionRoot = document.createElement("div");
                sectionRoot.className = "document-explorer__section";
                const sectionHeader = document.createElement("button");
                sectionHeader.type = "button";
                sectionHeader.className = "document-explorer__section-header";
                sectionHeader.innerHTML = `<i data-lucide="zap"></i><strong>Superpouvoirs</strong><i data-lucide="${sectionExpanded.superpowers ? "chevron-down" : "chevron-right"}"></i>`;
                sectionHeader.addEventListener("click", () => {
                    sectionExpanded.superpowers = !sectionExpanded.superpowers;
                    persistSectionExpandedState();
                    renderList(cachedItems);
                });
                sectionRoot.appendChild(sectionHeader);
                const sectionBody = document.createElement("div");
                sectionBody.className = "document-explorer__section-body";
                sectionBody.dataset.section = "superpowers";
                sectionRoot.appendChild(sectionBody);
                listEl.appendChild(sectionRoot);
                if (!sectionExpanded.superpowers) {
                    sectionBody.style.display = "none";
                    return;
                }
                const allDocs = normalizeList(safeItems).slice().sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
                const catalog = Array.isArray(superpowersCatalog) ? superpowersCatalog : [];
                const groups = new Map();
                groups.set("none", { id: "none", title: "(Aucun)", icon: "shield-question", docs: [] });
                const resolveDocSuperpower = (doc) => {
                    const value = Array.isArray(doc?.superpowers) ? doc.superpowers[0] : (doc?.superpowers || doc?.category || "");
                    const token = String(value || "").trim();
                    if (!token) return "none";
                    const lower = token.toLowerCase();
                    const found = catalog.find(sp => String(sp?.id || "").toLowerCase() === lower || String(sp?.title || "").toLowerCase() === lower);
                    return found ? String(found.id) : token;
                };
                allDocs.forEach(doc => {
                    const spKey = resolveDocSuperpower(doc);
                    if (!groups.has(spKey)) {
                        const found = catalog.find(sp => String(sp?.id || "") === spKey || String(sp?.title || "").toLowerCase() === spKey.toLowerCase());
                        groups.set(spKey, {
                            id: spKey,
                            title: found?.title || spKey,
                            icon: found?.icon || "zap",
                            docs: []
                        });
                    }
                    groups.get(spKey).docs.push(doc);
                });
                const visibleGroups = Array.from(groups.values()).filter(group => group.docs.length > 0);
                const renderGroupRow = (group) => {
                    const row = document.createElement("div");
                    row.className = "document-explorer__tree-row";
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "document-explorer__item";
                    button.draggable = false;
                    const groupKey = `spg:${group.id}`;
                    const isExpanded = expandedIds.has(groupKey);
                    const lead = document.createElement("span");
                    lead.className = "document-explorer__item-leading";
                    lead.innerHTML = `<i data-lucide="${isExpanded ? "chevron-down" : "chevron-right"}"></i>`;
                    lead.addEventListener("click", event => {
                        event.stopPropagation();
                        if (expandedIds.has(groupKey)) expandedIds.delete(groupKey);
                        else expandedIds.add(groupKey);
                        persistExpandedState();
                        renderList(cachedItems);
                    });
                    button.appendChild(lead);
                    const label = document.createElement("span");
                    label.className = "document-explorer__item-title";
                    label.innerHTML = `<i data-lucide="${group.icon || "zap"}" style="width:14px;height:14px;margin-right:6px;"></i>${group.title}`;
                    button.appendChild(label);
                    button.addEventListener("dragover", event => {
                        if (!draggingId) return;
                        event.preventDefault();
                    });
                    button.addEventListener("drop", async event => {
                        if (!draggingId || !onMove) return;
                        event.preventDefault();
                        const fromId = draggingId;
                        const fromSection = draggingSection || getItemSection(normalizeList(cachedItems).find(entry => String(entry?.id || "") === String(fromId)));
                        draggingId = "";
                        draggingSection = "";
                        await onMove(fromId, "", 1, "", { fromSection, toSection: "superpowers", superpowerId: group.id });
                    });
                    row.appendChild(button);
                    sectionBody.appendChild(row);
                    if (isExpanded) {
                        group.docs.forEach(doc => {
                            const childRow = document.createElement("div");
                            childRow.className = "document-explorer__tree-row";
                            childRow.style.marginLeft = "12px";
                            const childBtn = document.createElement("button");
                            childBtn.type = "button";
                            childBtn.className = "document-explorer__item";
                            childBtn.draggable = true;
                            childBtn.dataset.documentId = doc.id;
                            if (activeId && activeId === doc.id) childBtn.classList.add("document-explorer__item--active");
                            const childLead = document.createElement("span");
                            childLead.className = "document-explorer__item-leading";
                            childLead.innerHTML = `<i data-lucide="file"></i>`;
                            childBtn.appendChild(childLead);
                            const childLabel = document.createElement("span");
                            childLabel.className = "document-explorer__item-title";
                            childLabel.textContent = doc.title || "Document";
                            childBtn.appendChild(childLabel);
                            childBtn.addEventListener("click", () => onSelect?.(doc));
                            childBtn.addEventListener("dragstart", event => {
                                draggingId = doc.id;
                                draggingSection = "superpowers";
                                childBtn.classList.add("is-dragging");
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", doc.id);
                            });
                            childBtn.addEventListener("dragend", () => {
                                draggingId = "";
                                draggingSection = "";
                                childBtn.classList.remove("is-dragging");
                            });
                            childRow.appendChild(childBtn);
                            sectionBody.appendChild(childRow);
                        });
                    }
                };
                visibleGroups.forEach(group => renderGroupRow(group));
            };
            await renderSuperpowersSection();
            if (!listDnDBound) {
                listDnDBound = true;
                listEl.addEventListener("dragover", event => {
                    if (!draggingId) return;
                    event.preventDefault();
                });
                listEl.addEventListener("drop", async event => {
                    if (!draggingId || !onMove) return;
                    if (event.target.closest(".document-explorer__item")) return;
                    event.preventDefault();
                    const sectionBody = event.target.closest(".document-explorer__section-body");
                    const toSection = sectionBody?.dataset?.section || "private";
                    const fromItem = normalizeList(cachedItems).find(entry => String(entry?.id || "") === String(draggingId));
                    const fromSection = draggingSection || getItemSection(fromItem);
                    await onMove(draggingId, "", 1, "", { fromSection, toSection });
                    if (fromSection === toSection) {
                        applyLocalParentMove(draggingId, "");
                        applyLocalOrderMove(draggingId, "", "");
                    }
                    draggingId = "";
                    draggingSection = "";
                    renderList(cachedItems);
                });
            }

            if (window.lucide) window.lucide.createIcons();
        }

        async function refresh() {
            if (typeof getItems !== "function") {
                renderEmpty();
                return;
            }
            try {
                if (hasLoadedTreeData && cachedItems.length > 0) {
                    ensureSearchViewState();
                    await renderList(cachedItems);
                    return;
                }
                const items = await getItems();
                const normalized = Array.isArray(items) ? items : [];
                let sharedItems = [];
                let commonItems = [];
                const shareHistory = window.goToolkitShareHistory;
                if (shareHistory?.getRecordsByApp) {
                    const shared = await shareHistory.getRecordsByApp("memo");
                    const uniqueShared = normalizeList((Array.isArray(shared) ? shared : []).map(item => ({
                        ...item,
                        id: `share:${item.token}`
                    })));
                    sharedItems = uniqueShared.map(item => ({
                        ...item,
                        title: item.title || "Document partagé",
                        icon: item.icon || "file-symlink",
                        isShared: true,
                        section: "shared"
                    }));
                }
                if (getCommonItems) {
                    const common = await getCommonItems();
                    commonItems = normalizeList(Array.isArray(common) ? common : []).map(item => ({
                        ...item,
                        id: String(item.id || "").startsWith("common:") ? String(item.id) : `common:${item.id}`,
                        title: item.title || "Commun",
                        isCommon: true,
                        section: "common",
                        icon: String(item.icon || "").trim()
                    }));
                }
                cachedItems = normalizeList(
                    normalized.map(item => ({ ...item, section: "private" }))
                        .concat(sharedItems)
                        .concat(commonItems)
                );
                ensureSearchViewState();
                syncOrderWithItems(cachedItems);
                await renderList(cachedItems);
                hasLoadedTreeData = true;
            } catch (err) {
                renderEmpty();
            }
        }
        async function upsertItem(item) {
            if (!item || !item.id) return;
            const existingIndex = cachedItems.findIndex(entry => String(entry?.id || "") === String(item.id));
            if (existingIndex >= 0) {
                cachedItems[existingIndex] = { ...cachedItems[existingIndex], ...item };
            } else {
                cachedItems.push(item);
            }
            if (existingIndex < 0 && !("section" in item)) {
                const inserted = cachedItems[cachedItems.length - 1];
                inserted.section = getItemSection(inserted);
            }
            cachedItems = normalizeList(cachedItems);
            ensureSearchViewState();
            syncOrderWithItems(cachedItems);
            hasLoadedTreeData = true;
            await renderList(cachedItems);
        }
        async function removeItemById(id) {
            const targetId = String(id || "").trim();
            if (!targetId) return;
            cachedItems = normalizeList(cachedItems).filter(item => String(item?.id || "") !== targetId);
            orderIds = orderIds.filter(entryId => entryId !== targetId);
            persistOrderState();
            ensureSearchViewState();
            hasLoadedTreeData = true;
            await renderList(cachedItems);
        }
        function refreshActiveIndicatorOnly() {
            if (!listEl) return;
            const activeId = typeof getActiveId?.() === "string" ? getActiveId() : "";
            const nodes = listEl.querySelectorAll(".document-explorer__item[data-document-id]");
            nodes.forEach(node => {
                const nodeId = node.getAttribute("data-document-id") || "";
                node.classList.toggle("document-explorer__item--active", Boolean(activeId) && nodeId === activeId);
            });
        }

        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => {
                applyOpen(!isOpen);
            });
        }

        const handleOutsideClose = event => {
            if (!isOpen || window.innerWidth >= 900) return;
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (sidebar.contains(target)) return;
            if (toggleBtn?.contains?.(target)) return;
            applyOpen(false);
        };
        document.addEventListener("mousedown", handleOutsideClose);
        document.addEventListener("touchstart", handleOutsideClose, { passive: true });

        if (resizer) {
            let startX = 0;
            let startWidth = width;

            const onMove = (event) => {
                const clientX = event.touches ? event.touches[0].clientX : event.clientX;
                const delta = clientX - startX;
                applyWidth(startWidth + delta);
            };

            const stopResize = () => {
                document.body.classList.remove("is-resizing");
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", stopResize);
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", stopResize);
                if (width <= 100) {
                    applyOpen(false);
                }
            };

            const startResize = (event) => {
                event.preventDefault();
                startX = event.touches ? event.touches[0].clientX : event.clientX;
                startWidth = width;
                document.body.classList.add("is-resizing");
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", stopResize);
                document.addEventListener("touchmove", onMove);
                document.addEventListener("touchend", stopResize);
            };

            resizer.addEventListener("mousedown", startResize);
            resizer.addEventListener("touchstart", startResize, { passive: false });
        }

        applyWidth(width);
        applyOpen(isOpen);
        ensureDefaultTab();

        if (listEl && listEl.parentElement && !listEl.parentElement.querySelector(".document-explorer__search")) {
            searchWrap = document.createElement("div");
            searchWrap.className = "document-explorer__search";
            searchWrap.innerHTML = `
                <i data-lucide="search" class="document-explorer__search-icon"></i>
                <input type="text" class="document-explorer__search-input" placeholder="Rechercher un document" aria-label="Rechercher un document" />
                <button type="button" class="document-explorer__search-clear" aria-label="Effacer la recherche" title="Effacer"><i data-lucide="x"></i></button>
            `;
            listEl.parentElement.insertBefore(searchWrap, listEl);
            searchInput = searchWrap.querySelector(".document-explorer__search-input");
            searchClearBtn = searchWrap.querySelector(".document-explorer__search-clear");
            searchInput?.addEventListener("input", event => {
                searchQuery = String(event?.target?.value || "");
                ensureSearchViewState();
                renderList(cachedItems);
            });
            searchClearBtn?.addEventListener("click", () => {
                searchQuery = "";
                if (searchInput) searchInput.value = "";
                ensureSearchViewState();
                renderList(cachedItems);
            });
            if (window.lucide) window.lucide.createIcons();
        }

        window.addEventListener("resize", () => {
            // Keep state on resize (persistence)
            if (window.innerWidth < 900 && isOpen) {
                applyOpen(false);
            }
        });

        return {
            refresh,
            upsertItem,
            removeItemById,
            async refreshIndicators() {
                refreshActiveIndicatorOnly();
            },
            open() {
                applyOpen(true);
            },
            close() {
                applyOpen(false);
            },
            openRenameModal(name, description, options) {
                return openNameModal(name, description, options);
            },
            uniqueName(name, excludeId) {
                return uniqueName(name, cachedItems, null, excludeId);
            },
            async setItems(items) {
                cachedItems = normalizeList(items);
                syncOrderWithItems(cachedItems);
                await renderList(cachedItems);
            }
        };
    }

    window.GoToolkitDocumentExplorer = {
        create: createDocumentExplorer
    };
})();
