(() => {
    const DEFAULT_WIDTH = 300;
    const MIN_WIDTH = 100;
    const MAX_WIDTH = 520;
    const DEFAULT_TITLE = "Documents";
    const EXPANDED_STORAGE_KEY = "goToolkit.memo.treeExpanded";
    const ORDER_STORAGE_KEY = "goToolkit.memo.treeOrder";
    const SECTION_EXPANDED_STORAGE_KEY = "goToolkit.memo.sectionExpanded";
    const ICON_CHOICES = Array.from(new Set(`
        file file-text file-plus file-pen file-check file-search file-lock file-symlink file-stack files file-down
        folder folder-open folder-plus folder-search folder-git-2 folder-kanban folder-lock folder-sync folder-tree
        archive archive-restore briefcase briefcase-business briefcase-medical book book-open book-text notebook notepad-text
        bookmark library
        star flag tags tag hash at-sign link link-2 unlink paperclip
        list list-checks list-todo list-tree list-ordered list-minus list-plus list-filter layout-grid layout-list kanban square-kanban
        check check-check check-square circle-check circle minus plus x triangle-alert octagon-alert
        shield shield-check shield-alert shield-question lock lock-keyhole lock-keyhole-open key key-round
        calendar calendar-check calendar-clock calendar-days calendar-range clock alarm-clock timer history hourglass
        target lightbulb rocket sparkles wand-sparkles brain bot cpu circuit-board binary code code-2 terminal command workflow
        message-square message-circle messages-square mail send inbox bell bell-ring phone smartphone tablet laptop monitor server
        globe map map-pin navigation compass route locate pin
        settings sliders-horizontal wrench hammer cog
        pen pencil pen-tool highlighter eraser palette paintbrush ruler scissors stamp signature
        image image-plus image-off camera video clapperboard mic mic-off headphones music radio podcast
        play pause stop-circle fast-forward rewind volume-2 volume-x
        chart-column chart-bar chart-line chart-pie trending-up trending-down activity gauge
        database table receipt text quote clipboard clipboard-check clipboard-list clipboard-pen copy save download upload
        cloud cloud-upload cloud-download cloud-check cloud-alert cloud-cog
        user user-round user-check user-plus user-cog users contact id-card
        building building-2 landmark store factory warehouse home
        shopping-cart package truck plane ship car
        dollar-sign euro piggy-bank wallet credit-card receipt-text calculator percent
        search filter funnel zap component puzzle layers git-branch git-commit git-merge git-pull-request refresh-cw refresh-ccw
        sun moon leaf flame snowflake umbrella
    `.trim().split(/\s+/)));
    const ICON_TOKEN_FR = {
        file: ["fichier", "document", "page"],
        folder: ["dossier", "repertoire"],
        archive: ["archive", "historique"],
        briefcase: ["projet", "travail", "business"],
        book: ["livre", "guide", "documentation"],
        notebook: ["notes", "bloc-notes"],
        bookmark: ["favori", "marque-page"],
        tag: ["etiquette", "label"],
        list: ["liste", "plan"],
        check: ["valide", "ok", "tache"],
        calendar: ["calendrier", "planning", "date"],
        clock: ["heure", "temps", "delai"],
        target: ["objectif", "cible", "kpi"],
        lightbulb: ["idee", "innovation"],
        rocket: ["lancement", "croissance"],
        brain: ["strategie", "analyse"],
        bot: ["ia", "assistant"],
        code: ["dev", "technique"],
        message: ["message", "discussion", "chat"],
        mail: ["email", "courriel"],
        phone: ["telephone", "appel"],
        globe: ["monde", "internet", "web"],
        map: ["carte", "localisation"],
        link: ["lien", "url"],
        shield: ["securite", "protection"],
        lock: ["prive", "confidentiel"],
        key: ["acces", "cle"],
        settings: ["parametres", "config"],
        pen: ["edition", "redaction"],
        image: ["image", "visuel"],
        video: ["video", "media"],
        mic: ["audio", "micro"],
        chart: ["graphique", "analyse", "reporting"],
        database: ["base", "donnees"],
        table: ["tableau", "grille"],
        cloud: ["partage", "en-ligne", "sync"],
        user: ["utilisateur", "profil", "personne"],
        users: ["equipe", "collaboration"],
        building: ["entreprise", "organisation"],
        search: ["recherche", "trouver"],
        filter: ["filtre", "tri"],
        zap: ["rapide", "automatisation"],
        component: ["commun", "module"],
        puzzle: ["solution", "assemblage"],
        git: ["version", "code-source"],
    };
    const normalizeIconSearchValue = (value) => String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const getIconSearchText = (icon) => {
        const parts = String(icon || "").split("-").filter(Boolean);
        const words = [icon].concat(parts);
        parts.forEach((token) => {
            const fr = ICON_TOKEN_FR[token];
            if (Array.isArray(fr)) words.push(...fr);
        });
        if (parts.length > 1) {
            const fr = ICON_TOKEN_FR[parts[0]];
            if (Array.isArray(fr)) words.push(...fr);
        }
        return normalizeIconSearchValue(words.join(" "));
    };

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
        return !icon || icon === "file" || icon === "file-text" || icon === "file-symlink";
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
        const getSectionMeta = typeof opts.getSectionMeta === "function" ? opts.getSectionMeta : null;
        const getSharedSections = typeof opts.getSharedSections === "function" ? opts.getSharedSections : null;
        const onSectionAdd = typeof opts.onSectionAdd === "function" ? opts.onSectionAdd : null;
        const onSectionSettings = typeof opts.onSectionSettings === "function" ? opts.onSectionSettings : null;
        const onSectionRefresh = typeof opts.onSectionRefresh === "function" ? opts.onSectionRefresh : null;
        const getItems = typeof opts.getItems === "function" ? opts.getItems : null;
        const getOpenIds = typeof opts.getOpenIds === "function" ? opts.getOpenIds : null;
        const getActiveId = typeof opts.getActiveId === "function" ? opts.getActiveId : null;
        let cachedItems = [];
        let expandedIds = new Set();
        let selectedIds = new Set();
        let selectedHighlightEnabled = false;
        let selectionAnchorId = "";
        let draggingId = "";
        let draggingSection = "";
        let orderIds = [];
        let sectionExpanded = { recent: true, private: true, archives: false, common: true, superpowers: true };
        let searchQuery = "";
        let pendingInlineRenameId = "";
        let pendingInlineRenameUntil = 0;
        let activeInlineRenameId = "";
        let activeInlineRenameInput = null;
        let inlineRenameCommitId = "";
        let deferredRenderAfterInlineRename = false;

        let hasDefaultTabSet = false;

        ensureSuperpowersLoaded();

        function setActiveTab(target, options) {
            const canUseToc = Boolean(tocPanel && tabBtns.length && Array.from(tabBtns).some(b => b.dataset.tab === "toc"));
            const nextTarget = (target === "toc" && canUseToc) ? "toc" : "library";
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
            importBtn.innerHTML = '<i data-lucide="file-down"></i>';
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
                const next = {
                    recent: false,
                    private: parsed?.private !== false,
                    archives: parsed?.archives === true,
                    common: parsed?.common !== false,
                    superpowers: false
                };
                Object.keys(parsed || {}).forEach(key => {
                    if (key in next) return;
                    next[key] = parsed[key] !== false;
                });
                return next;
            } catch (err) {
                return { recent: false, private: true, archives: false, common: true, superpowers: false };
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
                    <div class="modal-actions" style="justify-content: flex-end; align-items: center; gap: 8px;">
                        <button class="btn-primary" type="button" data-save>Enregistrer</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const modalCloseBtn = modalOverlay.querySelector(".modal-close");
        const modalSaveBtn = modalOverlay.querySelector("[data-save]");
        const modalEl = modalOverlay.querySelector(".modal");
        const modalInput = modalOverlay.querySelector("#document-explorer-name-input");
        const modalIconBtn = modalOverlay.querySelector("#document-explorer-icon-btn");
        const modalIconGrid = modalOverlay.querySelector("#document-explorer-icon-grid");
        const modalDescInput = modalOverlay.querySelector("#document-explorer-description-input");
        let searchWrap = null;
        let searchInput = null;
        let searchClearBtn = null;
        let modalResolver = null;
        let modalDocumentId = "";
        let modalNotionLink = { pageId: "", url: "", path: "", workspaceId: "" };
        let modalNotionUnlinkRequested = false;
        let modalIcon = "file";
        let modalIconSearch = "";

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
        }
        function renderIconGrid() {
            if (!modalIconGrid) return;
            modalIconGrid.innerHTML = "";
            const searchWrap = document.createElement("div");
            searchWrap.className = "document-explorer-icon-search-wrap";
            const searchInput = document.createElement("input");
            searchInput.type = "search";
            searchInput.className = "document-explorer-icon-search";
            searchInput.placeholder = "Rechercher une icône (ex: dossier, calendrier, partage)";
            searchInput.value = modalIconSearch;
            searchInput.addEventListener("input", () => {
                modalIconSearch = searchInput.value || "";
                renderIconGrid();
            });
            searchWrap.appendChild(searchInput);
            modalIconGrid.appendChild(searchWrap);
            const q = normalizeIconSearchValue(modalIconSearch);
            const filteredIcons = !q
                ? ICON_CHOICES
                : ICON_CHOICES.filter((icon) => getIconSearchText(icon).includes(q));
            filteredIcons.forEach(icon => {
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
            if (searchInput && document.activeElement !== searchInput && modalIconGrid.classList.contains("open")) {
                searchInput.focus();
            }
            if (window.lucide) window.lucide.createIcons();
            if (!searchQuery && listEl) {
                const visibleIds = Array.from(listEl.querySelectorAll(".document-explorer__item[data-document-id]"))
                    .map(node => String(node.getAttribute("data-document-id") || "").trim())
                    .filter(Boolean);
                if (visibleIds.length) {
                    const seen = new Set(visibleIds);
                    const tail = orderIds.filter(id => {
                        const token = String(id || "").trim();
                        return token && !seen.has(token);
                    });
                    orderIds = visibleIds.concat(tail);
                    persistOrderState();
                }
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
            modalIconSearch = "";
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
        modalSaveBtn?.addEventListener("click", () => {
            resolveModal({
                name: modalInput?.value || "",
                icon: modalIcon,
                description: modalDescInput?.value || "",
                superpowers: getSelectedSuperpowers(),
                action: "confirm",
                notionPath: "",
                notionPageId: modalNotionLink.pageId || "",
                notionWorkspaceId: modalNotionLink.workspaceId || "",
                unlinkNotion: Boolean(modalNotionUnlinkRequested)
            });
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
            return name || "Nouvelle page";
        }

        function uniqueName(name, list, extraNames, excludeId) {
            return normalizeName(name);
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
                    icon.setAttribute("data-lucide", isOpen ? "panel-left-dashed" : "panel-left");
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
            const explicit = String(item.section || "").trim();
            if (explicit.startsWith("shared:")) return explicit;
            if (item.section === "superpowers") return "superpowers";
            if (item.section === "archives") return "archives";
            if (item.section === "common") return "common";
            if (item.isCommon) return "common";
            if (String(item.id || "").startsWith("common:")) return "common";
            if (item.section === "shared") {
                const spaceId = String(item.spaceId || "golive").trim() || "golive";
                return `shared:${spaceId}`;
            }
            if (item.isShared) {
                const spaceId = String(item.spaceId || "golive").trim() || "golive";
                return `shared:${spaceId}`;
            }
            if (String(item.id || "").startsWith("share:")) {
                const spaceId = String(item.spaceId || "golive").trim() || "golive";
                return `shared:${spaceId}`;
            }
            if (String(item?.status || "").trim().toLowerCase() === "archived") return "archives";
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
        function rebuildOrderFromCachedItems() {
            const sectionNames = Array.from(new Set(
                normalizeList(cachedItems)
                    .map(item => getItemSection(item))
                    .filter(Boolean)
            ));
            const ordered = [];
            const seen = new Set();
            const walkTree = (item, tree) => {
                const id = String(item?.id || "").trim();
                if (!id || seen.has(id)) return;
                seen.add(id);
                ordered.push(id);
                const children = tree.childrenByParent.get(id) || [];
                children.forEach(child => walkTree(child, tree));
            };
            sectionNames.forEach(sectionName => {
                const sectionItems = normalizeList(cachedItems).filter(item => getItemSection(item) === sectionName);
                const tree = buildTree(sectionItems);
                (tree.roots || []).forEach(root => walkTree(root, tree));
            });
            orderIds.forEach(id => {
                const token = String(id || "").trim();
                if (!token || seen.has(token)) return;
                seen.add(token);
                ordered.push(token);
            });
            orderIds = ordered;
            persistOrderState();
        }
        function prioritizeItem(docId) {
            const targetId = String(docId || "").trim();
            if (!targetId) return;
            const next = orderIds.filter(id => id !== targetId);
            next.unshift(targetId);
            orderIds = next;
            persistOrderState();
        }
        function shouldDeferRenderForInlineRename(itemId) {
            const targetId = String(itemId || "").trim();
            if (!targetId) return false;
            if (String(inlineRenameCommitId || "") !== targetId) return false;
            return Boolean(activeInlineRenameInput && activeInlineRenameInput.isConnected);
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

        function setDocumentDragPayload(dataTransfer, item) {
            if (!dataTransfer || !item) return;
            const docId = String(item.id || "").trim();
            if (!docId) return;
            const payload = {
                id: docId,
                title: String(item.title || "").trim(),
                section: String(getItemSection(item) || "private")
            };
            dataTransfer.effectAllowed = "move";
            dataTransfer.setData("text/plain", docId);
            dataTransfer.setData("application/x-gotoolkit-docid", docId);
            dataTransfer.setData("application/x-gotoolkit-memo-document", JSON.stringify(payload));
            dataTransfer.setData("text/uri-list", `memo://${docId}`);
            try {
                window.__goToolkitDraggingMemoDocument = payload;
            } catch (err) {
                // ignore
            }
        }

        function ensureSearchViewState() {
            const hasQuery = Boolean(String(searchQuery || "").trim());
            if (searchClearBtn) {
                searchClearBtn.style.display = hasQuery ? "inline-flex" : "none";
            }
            if (searchWrap) {
                searchWrap.classList.toggle("is-searching", hasQuery);
            }
        }
        function normalizeId(value) {
            return String(value || "").trim();
        }
        function sanitizeSelectedIds(sourceIds) {
            const available = new Set(normalizeList(cachedItems).map(item => normalizeId(item?.id)));
            const next = new Set();
            const values = sourceIds instanceof Set ? Array.from(sourceIds) : Array.isArray(sourceIds) ? sourceIds : [];
            values.forEach(value => {
                const id = normalizeId(value);
                if (id && available.has(id)) next.add(id);
            });
            return next;
        }
        function getVisibleDocumentIds() {
            if (!listEl) return [];
            const ids = [];
            const seen = new Set();
            const nodes = listEl.querySelectorAll(".document-explorer__item[data-document-id]");
            nodes.forEach(node => {
                const id = normalizeId(node.getAttribute("data-document-id"));
                if (!id || seen.has(id)) return;
                seen.add(id);
                ids.push(id);
            });
            return ids;
        }
        function refreshSelectionIndicatorsOnly() {
            if (!listEl) return;
            const nodes = listEl.querySelectorAll(".document-explorer__item[data-document-id]");
            nodes.forEach(node => {
                const nodeId = normalizeId(node.getAttribute("data-document-id"));
                node.classList.toggle("document-explorer__item--selected", selectedHighlightEnabled && selectedIds.has(nodeId));
            });
        }
        function getSelectedIdsSnapshot() {
            selectedIds = sanitizeSelectedIds(selectedIds);
            return Array.from(selectedIds);
        }
        function setExplorerSelection(nextIds, options = {}) {
            selectedIds = sanitizeSelectedIds(nextIds);
            if (typeof options.highlightSelected === "boolean") {
                selectedHighlightEnabled = options.highlightSelected;
            }
            const anchor = normalizeId(options.anchorId);
            if (anchor) selectionAnchorId = anchor;
            else if (!selectedIds.size) selectionAnchorId = "";
            if (!selectedIds.size) selectedHighlightEnabled = false;
            refreshSelectionIndicatorsOnly();
            return getSelectedIdsSnapshot();
        }
        function clearExplorerSelection() {
            selectedIds = new Set();
            selectedHighlightEnabled = false;
            selectionAnchorId = "";
            refreshSelectionIndicatorsOnly();
        }
        function applySelectionFromClick(itemId, modifiers = {}) {
            const clickedId = normalizeId(itemId);
            if (!clickedId) return getSelectedIdsSnapshot();
            const visibleIds = getVisibleDocumentIds();
            const hasShift = Boolean(modifiers.shiftKey);
            const hasToggle = Boolean(modifiers.ctrlKey || modifiers.metaKey);
            let next = new Set(selectedIds);
            if (hasShift && visibleIds.length > 0) {
                const anchor = (selectionAnchorId && visibleIds.includes(selectionAnchorId))
                    ? selectionAnchorId
                    : clickedId;
                const start = visibleIds.indexOf(anchor);
                const end = visibleIds.indexOf(clickedId);
                const rangeIds = start >= 0 && end >= 0
                    ? visibleIds.slice(Math.min(start, end), Math.max(start, end) + 1)
                    : [clickedId];
                next = hasToggle ? new Set(next) : new Set();
                rangeIds.forEach(id => next.add(id));
                selectionAnchorId = anchor;
            } else if (hasToggle) {
                if (next.has(clickedId)) next.delete(clickedId);
                else next.add(clickedId);
                selectionAnchorId = clickedId;
            } else {
                next = new Set([clickedId]);
                selectionAnchorId = clickedId;
            }
            return setExplorerSelection(next, {
                anchorId: selectionAnchorId,
                highlightSelected: hasShift || hasToggle
            });
        }

        async function renderList(items) {
            if (!listEl) return;
            const nonce = ++renderListNonce;
            const isStale = () => nonce !== renderListNonce;
            const resolveTreeScrollContainer = () => {
                let node = listEl;
                while (node && node !== sidebar) {
                    const style = window.getComputedStyle(node);
                    const overflowY = String(style?.overflowY || "").toLowerCase();
                    const isScrollable = overflowY === "auto" || overflowY === "scroll";
                    if (isScrollable && node.scrollHeight > node.clientHeight) {
                        return node;
                    }
                    node = node.parentElement;
                }
                return listEl;
            };
            const treeScrollContainer = resolveTreeScrollContainer();
            const preservedScrollTop = Number(treeScrollContainer?.scrollTop || 0);
            await ensureSuperpowersLoaded();
            if (pendingInlineRenameId && pendingInlineRenameUntil && Date.now() > pendingInlineRenameUntil) {
                pendingInlineRenameId = "";
                pendingInlineRenameUntil = 0;
                activeInlineRenameId = "";
            }

            if (isStale()) return;

            const safeItems = normalizeList(items);
            const needle = String(searchQuery || "").trim().toLowerCase();
            const filteredItems = needle
                ? safeItems.filter(item => String(item?.title || "").toLowerCase().includes(needle))
                : safeItems;
            listEl.innerHTML = "";
            let dropHintTarget = null;
            let dropHintMode = "";
            let rootDropBody = null;
            const clearDropHint = () => {
                if (!dropHintTarget) return;
                dropHintTarget.classList.remove(
                    "document-explorer__item--drop-before",
                    "document-explorer__item--drop-inside",
                    "document-explorer__item--drop-after"
                );
                dropHintTarget = null;
                dropHintMode = "";
            };
            const setDropHint = (target, mode) => {
                const nextMode = String(mode || "").trim();
                if (!target || !nextMode) return;
                if (dropHintTarget !== target) {
                    clearDropHint();
                }
                if (dropHintMode === nextMode && dropHintTarget === target) return;
                target.classList.remove(
                    "document-explorer__item--drop-before",
                    "document-explorer__item--drop-inside",
                    "document-explorer__item--drop-after"
                );
                target.classList.add(`document-explorer__item--drop-${nextMode}`);
                dropHintTarget = target;
                dropHintMode = nextMode;
            };
            const clearRootDropHint = () => {
                if (!rootDropBody) return;
                rootDropBody.classList.remove("document-explorer__section-body--drop-root");
                rootDropBody = null;
            };
            const setRootDropHint = (sectionBody) => {
                if (!sectionBody) return;
                if (rootDropBody && rootDropBody !== sectionBody) {
                    rootDropBody.classList.remove("document-explorer__section-body--drop-root");
                }
                rootDropBody = sectionBody;
                rootDropBody.classList.add("document-explorer__section-body--drop-root");
            };
            const clearAllDropHints = () => {
                clearDropHint();
                clearRootDropHint();
            };
            const getDropModeFromPointer = (buttonEl, clientY) => {
                const rect = buttonEl.getBoundingClientRect();
                const y = clientY - rect.top;
                const upper = rect.height * 0.33;
                const lower = rect.height * 0.67;
                if (y < upper) return "before";
                if (y > lower) return "after";
                return "inside";
            };
            const activeId = typeof getActiveId?.() === "string" ? getActiveId() : "";
            selectedIds = sanitizeSelectedIds(selectedIds);
            if (selectionAnchorId && !selectedIds.has(selectionAnchorId)) {
                selectionAnchorId = "";
            }
            const sectionItems = {
                private: filteredItems.filter(item => getItemSection(item) === "private"),
                archives: filteredItems.filter(item => getItemSection(item) === "archives"),
                common: filteredItems.filter(item => getItemSection(item) === "common")
            };
            const discoveredShared = filteredItems
                .map(item => getItemSection(item))
                .filter(section => section.startsWith("shared:"));
            const configuredShared = Array.isArray(getSharedSections?.())
                ? getSharedSections().map(section => String(section || "").trim()).filter(section => section.startsWith("shared:"))
                : [];
            const sharedSectionNames = Array.from(new Set(discoveredShared.concat(configuredShared)));
            const sharedSections = {};
            sharedSectionNames.forEach(sectionName => {
                sharedSections[sectionName] = filteredItems.filter(item => getItemSection(item) === sectionName);
            });
            const trees = {
                private: buildTree(sectionItems.private),
                archives: buildTree(sectionItems.archives),
                common: buildTree(sectionItems.common)
            };
            sharedSectionNames.forEach(sectionName => {
                trees[sectionName] = buildTree(sharedSections[sectionName] || []);
            });
            const recentItems = filteredItems
                .slice()
                .sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")))
                .slice(0, 10);
            const renderNode = async (item, level, sectionName, containerEl) => {
                if (isStale()) return;
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
                    if (selectedHighlightEnabled && selectedIds.has(item.id)) {
                        button.classList.add("document-explorer__item--selected");
                    }
                }
                const resolvedHandoffId = (typeof item.handoffId === "string" && item.handoffId) ? item.handoffId : null;
                const hasHandoff = resolvedHandoffId !== null;
                const lead = document.createElement("span");
                lead.className = "document-explorer__item-leading";
                lead.setAttribute("role", "button");
                lead.setAttribute("tabindex", "0");
                lead.setAttribute("aria-label", isExpanded ? "Réduire les sous-documents" : "Afficher les sous-documents");
                const defaultIconName = (() => {
                    if (hasHandoff) return "";
                    if (!isAutoFileIcon(item.icon)) return item.icon;
                    return hasChildren ? "file-text" : "file";
                })();
                const renderLeadIcon = (hoverChevron = false) => {
                    if (!hasChildren) {
                        lead.innerHTML = defaultIconName ? `<i data-lucide="${defaultIconName}"></i>` : "";
                        return;
                    }
                    if (hoverChevron) {
                        lead.innerHTML = `<i data-lucide="${isExpanded ? "chevron-down" : "chevron-right"}"></i>`;
                        return;
                    }
                    lead.innerHTML = defaultIconName ? `<i data-lucide="${defaultIconName}"></i>` : "";
                };
                renderLeadIcon(false);
                const showRowChevron = () => {
                    if (!hasChildren) return;
                    renderLeadIcon(true);
                    if (window.lucide) window.lucide.createIcons();
                };
                const hideRowChevron = () => {
                    if (!hasChildren) return;
                    renderLeadIcon(false);
                    if (window.lucide) window.lucide.createIcons();
                };
                button.addEventListener("mouseenter", showRowChevron);
                button.addEventListener("mouseleave", hideRowChevron);
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
                label.textContent = item.title || "Docs sans titre";
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
                    const selected = getSelectedIdsSnapshot();
                    const selectedForDelete = selected.length > 1 && selected.includes(item.id)
                        ? selected
                        : [item.id];
                    onDelete?.(item, { selectedIds: selectedForDelete, trigger: "row-delete" });
                });
                actions.appendChild(deleteBtn);
                button.appendChild(actions);
                button.addEventListener("click", event => {
                    if (event.target.closest(".document-explorer__item-actions")) return;
                    const clickMeta = {
                        shiftKey: Boolean(event.shiftKey),
                        ctrlKey: Boolean(event.ctrlKey),
                        metaKey: Boolean(event.metaKey)
                    };
                    const selected = applySelectionFromClick(item.id, clickMeta);
                    if (clickMeta.shiftKey || clickMeta.ctrlKey || clickMeta.metaKey) return;
                    const liveActiveId = String(getActiveId?.() || activeId || "").trim();
                    if (liveActiveId === String(item.id || "").trim()) return;
                    onSelect?.(item, { selectedIds: selected, trigger: "row-click" });
                });
                const openInlineRename = (event, options = {}) => {
                    const isAutoStart = Boolean(options && options.autoStart);
                    const itemId = String(item.id || "");
                    const liveActiveId = String(getActiveId?.() || activeId || "").trim();
                    if (!isAutoStart && liveActiveId !== itemId) return;
                    if (event.target.closest(".document-explorer__item-actions")) return;
                    activeInlineRenameId = itemId;
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
                    activeInlineRenameInput = input;
                    input.focus();
                    input.select();
                    let finished = false;
                    const finish = submit => {
                        if (finished) return;
                        finished = true;
                        const itemId = String(item.id || "");
                        const nextName = String(input.value || "").trim();
                        if (submit && nextName && onRename) {
                            const normalizedCurrent = normalizeName(initialValue);
                            const normalizedNext = normalizeName(nextName);
                            if (normalizedNext && normalizedNext !== normalizedCurrent) {
                                inlineRenameCommitId = itemId;
                                label.textContent = normalizedNext;
                                Promise.resolve(onRename(item, {
                                    name: normalizedNext,
                                    description: item.description || "",
                                    superpowers: normalizeSuperpowersList(item.superpowers, item.category),
                                    icon: item.icon || (item.isShared ? "file-symlink" : ""),
                                    action: "confirm",
                                    unlinkNotion: false
                                })).finally(() => {
                                    inlineRenameCommitId = "";
                                    if (deferredRenderAfterInlineRename) {
                                        deferredRenderAfterInlineRename = false;
                                        renderList(cachedItems);
                                    }
                                });
                            } else {
                                label.textContent = nextName || initialValue;
                            }
                        } else {
                            label.textContent = initialValue;
                        }
                        if (pendingInlineRenameId && String(pendingInlineRenameId) === itemId) {
                            pendingInlineRenameId = "";
                            pendingInlineRenameUntil = 0;
                        }
                        if (activeInlineRenameId && String(activeInlineRenameId) === itemId) {
                            activeInlineRenameId = "";
                        }
                        if (activeInlineRenameInput === input) {
                            activeInlineRenameInput = null;
                        }
                    };
                    input.addEventListener("keydown", keyEvent => {
                        if (keyEvent.key === "Enter") {
                            keyEvent.preventDefault();
                            void finish(true);
                        } else if (keyEvent.key === "Escape") {
                            keyEvent.preventDefault();
                            void finish(false);
                        }
                    });
                    input.addEventListener("blur", () => {
                        if (isAutoStart && pendingInlineRenameId === itemId) {
                            // Create/refresh can re-render the row and detach the input.
                            // If that happens, keep rename mode pending and reopen inline editor.
                            setTimeout(() => {
                                if (!input.isConnected) {
                                    if (activeInlineRenameId === itemId) activeInlineRenameId = "";
                                    if (pendingInlineRenameId === itemId) {
                                        renderList(cachedItems);
                                    }
                                    return;
                                }
                                if (document.activeElement !== input) void finish(true);
                            }, 0);
                            return;
                        }
                        void finish(true);
                    });
                };
                button.addEventListener("dblclick", event => {
                    const liveActiveId = String(getActiveId?.() || activeId || "").trim();
                    if (liveActiveId !== String(item.id || "").trim()) {
                        onSelect?.(item);
                        pendingInlineRenameId = String(item.id || "").trim();
                        pendingInlineRenameUntil = pendingInlineRenameId ? Date.now() + 15000 : 0;
                        activeInlineRenameId = "";
                        return;
                    }
                    openInlineRename(event, { autoStart: false });
                });
                if (
                    pendingInlineRenameId &&
                    String(pendingInlineRenameId) === String(item.id || "") &&
                    String(activeInlineRenameId || "") !== String(item.id || "")
                ) {
                    setTimeout(() => {
                        try {
                            const fakeEvent = {
                                target: button,
                                preventDefault() { },
                                stopPropagation() { }
                            };
                            openInlineRename(fakeEvent, { autoStart: true });
                        } catch (err) {
                            // ignore
                        }
                    }, 0);
                }
                button.addEventListener("contextmenu", event => {
                    event.preventDefault();
                });
                button.addEventListener("dragstart", event => {
                    draggingId = item.id;
                    draggingSection = sectionName || getItemSection(item);
                    button.classList.add("is-dragging");
                    setDocumentDragPayload(event.dataTransfer, item);
                });
                button.addEventListener("dragend", () => {
                    draggingId = "";
                    draggingSection = "";
                    button.classList.remove("is-dragging");
                    clearAllDropHints();
                    try {
                        window.__goToolkitDraggingMemoDocument = null;
                    } catch (err) {
                        // ignore
                    }
                });
                button.addEventListener("dragover", event => {
                    if (!draggingId || draggingId === item.id) return;
                    event.preventDefault();
                    clearRootDropHint();
                    const mode = getDropModeFromPointer(button, event.clientY);
                    setDropHint(button, mode);
                });
                button.addEventListener("dragleave", event => {
                    if (dropHintTarget !== button) return;
                    const nextTarget = event.relatedTarget;
                    if (nextTarget && button.contains(nextTarget)) return;
                    clearDropHint();
                });
                button.addEventListener("drop", async event => {
                    event.preventDefault();
                    clearAllDropHints();
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
                    const selectedForMove = (selectedHighlightEnabled && selectedIds.has(fromId))
                        ? Array.from(sanitizeSelectedIds(selectedIds))
                        : [fromId];
                    const selectedSet = new Set(selectedForMove.map(id => String(id || "").trim()).filter(Boolean));
                    const idsToMove = selectedForMove.filter((candidateId) => {
                        const id = String(candidateId || "").trim();
                        if (!id) return false;
                        let cursor = String(byId.get(id)?.parentId || "").trim();
                        while (cursor) {
                            if (selectedSet.has(cursor)) return false;
                            cursor = String(byId.get(cursor)?.parentId || "").trim();
                        }
                        return true;
                    });
                    if (!idsToMove.length) return;
                    if (fromSection === toSection) {
                        idsToMove.forEach((id, index) => {
                            applyLocalParentMove(id, parentId);
                            applyLocalOrderMove(id, parentId, index === 0 ? beforeId : "");
                        });
                        rebuildOrderFromCachedItems();
                        renderList(cachedItems);
                    }
                    for (let index = 0; index < idsToMove.length; index += 1) {
                        const id = idsToMove[index];
                        await onMove(id, parentId, nextDepth, index === 0 ? beforeId : "", {
                            fromSection,
                            toSection,
                            selectedIds: idsToMove
                        });
                    }
                    draggingSection = "";
                    await renderList(cachedItems);
                });
                row.appendChild(button);
                if (isStale()) return;
                containerEl.appendChild(row);
                if (isExpanded) {
                    if (level < 4) {
                        for (const child of children) {
                            if (isStale()) return;
                            await renderNode(child, level + 1, sectionName, containerEl);
                        }
                    }
                }
            };
            const renderSection = async (sectionName, title, iconOverride) => {
                if (isStale()) return null;
                const sectionRoot = document.createElement("div");
                sectionRoot.className = "document-explorer__section";
                const sectionHeader = document.createElement("button");
                sectionHeader.type = "button";
                sectionHeader.className = "document-explorer__section-header";
                sectionHeader.dataset.section = String(sectionName || "").trim();
                const sectionMeta = getSectionMeta?.(sectionName) || null;
                const sectionIcon = iconOverride || sectionMeta?.icon || (sectionName === "recent"
                    ? "history"
                    : (sectionName === "common" ? "component" : (sectionName === "private" ? "user" : "lock-keyhole-open")));
                const isSectionExpanded = sectionExpanded[sectionName] !== false;
                sectionHeader.innerHTML = `<i data-lucide="${sectionIcon}"></i><strong>${title}</strong>`;
                const collapseIcon = document.createElement("i");
                collapseIcon.setAttribute("data-lucide", isSectionExpanded ? "chevron-down" : "chevron-right");
                sectionHeader.appendChild(collapseIcon);
                if (sectionName.startsWith("shared:") || sectionName === "private") {
                    const actions = document.createElement("span");
                    actions.className = "document-explorer__section-actions";
                    const pendingCount = sectionName.startsWith("shared:")
                        ? Number(sectionMeta?.pendingCount || 0)
                        : 0;
                    if (sectionName.startsWith("shared:") && pendingCount > 0) {
                        actions.classList.add("document-explorer__section-actions--pending-sync");
                    }
                    const addBtn = document.createElement("button");
                    addBtn.type = "button";
                    addBtn.className = "document-explorer__item-action";
                    if (sectionName.startsWith("shared:")) {
                        addBtn.classList.add("document-explorer__item-action--hover-only");
                    }
                    addBtn.title = sectionName === "private" ? "Créer une page racine" : "Ajouter une page";
                    addBtn.innerHTML = '<i data-lucide="plus"></i>';
                    addBtn.addEventListener("click", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSectionAdd?.(sectionName);
                    });
                    const canCreateInSection = sectionName === "private" || Boolean(sectionMeta?.canCreatePage !== false);
                    if (canCreateInSection) {
                        actions.appendChild(addBtn);
                    }
                    if (sectionName === "private") {
                        const refreshBtn = document.createElement("button");
                        refreshBtn.type = "button";
                        refreshBtn.className = "document-explorer__item-action";
                        refreshBtn.title = "Rafraîchir et nettoyer l'espace privé";
                        refreshBtn.innerHTML = '<i data-lucide="refresh-cw"></i>';
                        refreshBtn.addEventListener("click", (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onSectionRefresh?.(sectionName);
                        });
                        actions.appendChild(refreshBtn);
                    }
                    if (sectionName.startsWith("shared:")) {
                        const sharedSpaceId = String(sectionMeta?.spaceId || sectionName.replace(/^shared:/, "")).trim().toLowerCase();
                        const canRefreshSection = Boolean(sectionMeta?.canRefresh !== false);
                        const isSharedSpaceSyncing = Boolean(sectionMeta?.isSyncing);
                        const hasSharedSpaceSyncError = Boolean(sectionMeta?.hasSyncError);
                        const sharedSpaceSyncErrorMessage = String(sectionMeta?.syncErrorMessage || "").trim();
                        const settingsBtn = document.createElement("button");
                        settingsBtn.type = "button";
                        settingsBtn.className = "document-explorer__item-action";
                        settingsBtn.classList.add("document-explorer__item-action--hover-only");
                        settingsBtn.title = String(sectionMeta?.settingsLabel || "Modifier cet espace");
                        settingsBtn.innerHTML = '<i data-lucide="settings"></i>';
                        settingsBtn.addEventListener("click", (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onSectionSettings?.(sectionName);
                        });
                        actions.appendChild(settingsBtn);
                        if (canRefreshSection) {
                            const refreshBtn = document.createElement("button");
                            refreshBtn.type = "button";
                            refreshBtn.className = "document-explorer__item-action document-explorer__item-action--sync-refresh";
                            if (sharedSpaceId) {
                                refreshBtn.dataset.spaceId = sharedSpaceId;
                            }
                            const shouldShowCleanIcon = !isSharedSpaceSyncing && !hasSharedSpaceSyncError && pendingCount <= 0;
                            refreshBtn.dataset.cleanIcon = shouldShowCleanIcon ? "1" : "0";
                            const sinceLabel = String(sectionMeta?.lastSyncLabel || "").trim();
                            const syncSinceLabel = sinceLabel
                                ? (sinceLabel.toLowerCase().startsWith("il y a")
                                    ? `Synchronisé ${sinceLabel.toLowerCase()}`
                                    : `Synchronisé : ${sinceLabel.toLowerCase()}`)
                                : "Synchronisé il y a 0 mn";
                            const pendingNames = Array.isArray(sectionMeta?.pendingNames)
                                ? sectionMeta.pendingNames.map(name => String(name || "").trim()).filter(Boolean)
                                : [];
                            if (hasSharedSpaceSyncError) {
                                refreshBtn.title = `Problème de synchronisation cloud (accès Firestore).\n${sharedSpaceSyncErrorMessage || "Réessayez."}`;
                            } else if (pendingNames.length) {
                                refreshBtn.title = `${syncSinceLabel}\nEn attente: ${pendingNames.join(", ")}`;
                            } else {
                                refreshBtn.title = syncSinceLabel;
                            }
                            refreshBtn.innerHTML = hasSharedSpaceSyncError
                                ? '<i data-lucide="triangle-alert"></i>'
                                : (shouldShowCleanIcon
                                    ? '<i data-lucide="circle-check"></i>'
                                    : '<i data-lucide="refresh-cw"></i>');
                            if (isSharedSpaceSyncing && !hasSharedSpaceSyncError) {
                                const icon = refreshBtn.querySelector('svg.lucide-refresh-cw, i[data-lucide="refresh-cw"], svg, i');
                                if (icon) icon.classList.add("lucide-spin");
                            }
                            if (pendingCount > 0) {
                                const badge = document.createElement("span");
                                badge.className = "document-explorer__sync-badge";
                                badge.textContent = String(pendingCount);
                                refreshBtn.appendChild(badge);
                            }
                            refreshBtn.addEventListener("click", (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onSectionRefresh?.(sectionName);
                            });
                            actions.appendChild(refreshBtn);
                        }
                    }
                    sectionHeader.appendChild(actions);
                }
                const buildRootMoveIds = (fromId) => {
                    const selectedForMove = (selectedHighlightEnabled && selectedIds.has(fromId))
                        ? Array.from(sanitizeSelectedIds(selectedIds))
                        : [fromId];
                    const byId = new Map(
                        normalizeList(cachedItems)
                            .map(item => [String(item?.id || "").trim(), item])
                            .filter(([id]) => Boolean(id))
                    );
                    const selectedSet = new Set(selectedForMove.map(id => String(id || "").trim()).filter(Boolean));
                    return selectedForMove.filter((candidateId) => {
                        const id = String(candidateId || "").trim();
                        if (!id) return false;
                        let cursor = String(byId.get(id)?.parentId || "").trim();
                        while (cursor) {
                            if (selectedSet.has(cursor)) return false;
                            cursor = String(byId.get(cursor)?.parentId || "").trim();
                        }
                        return true;
                    });
                };
                sectionHeader.addEventListener("dragover", event => {
                    if (!draggingId || !onMove) return;
                    if (event.target.closest(".document-explorer__section-actions")) return;
                    event.preventDefault();
                    clearDropHint();
                    clearRootDropHint();
                    sectionHeader.classList.add("document-explorer__section-header--drop-root");
                });
                sectionHeader.addEventListener("dragleave", event => {
                    const nextTarget = event.relatedTarget;
                    if (nextTarget && sectionHeader.contains(nextTarget)) return;
                    sectionHeader.classList.remove("document-explorer__section-header--drop-root");
                });
                sectionHeader.addEventListener("drop", async event => {
                    if (!draggingId || !onMove) return;
                    if (event.target.closest(".document-explorer__section-actions")) return;
                    event.preventDefault();
                    sectionHeader.classList.remove("document-explorer__section-header--drop-root");
                    clearAllDropHints();
                    const fromItem = normalizeList(cachedItems).find(entry => String(entry?.id || "") === String(draggingId));
                    const fromSection = draggingSection || getItemSection(fromItem);
                    const fromId = draggingId;
                    const toSection = sectionName || "private";
                    const idsToMove = buildRootMoveIds(fromId);
                    if (!idsToMove.length) return;
                    if (fromSection === toSection) {
                        idsToMove.forEach((id, index) => {
                            applyLocalParentMove(id, "");
                            applyLocalOrderMove(id, "", index === 0 ? "" : "");
                        });
                        rebuildOrderFromCachedItems();
                    }
                    for (const id of idsToMove) {
                        await onMove(id, "", 1, "", { fromSection, toSection, selectedIds: idsToMove });
                    }
                    draggingId = "";
                    draggingSection = "";
                    renderList(cachedItems);
                });
                sectionHeader.addEventListener("click", () => {
                    sectionExpanded[sectionName] = !sectionExpanded[sectionName];
                    persistSectionExpandedState();
                    renderList(cachedItems);
                });
                sectionRoot.appendChild(sectionHeader);
                const sectionBody = document.createElement("div");
                sectionBody.className = "document-explorer__section-body";
                sectionBody.dataset.section = sectionName;
                if (!isSectionExpanded) {
                    sectionBody.style.display = "none";
                } else {
                    const roots = trees[sectionName]?.roots || [];
                    for (const root of roots) {
                        if (isStale()) return null;
                        await renderNode(root, 1, sectionName, sectionBody);
                    }
                }
                sectionRoot.appendChild(sectionBody);
                if (isStale()) return null;
                listEl.appendChild(sectionRoot);
                return sectionBody;
            };
            const renderRecentSection = async () => {
                const sectionBody = await renderSection("recent", "Récent");
                if (!sectionBody || !sectionExpanded.recent) return;
                for (const item of recentItems) {
                    if (isStale()) return;
                    const row = document.createElement("div");
                    row.className = "document-explorer__tree-row";
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "document-explorer__item";
                    button.draggable = true;
                    if (item.id) {
                        button.dataset.documentId = item.id;
                        if (activeId && activeId === item.id) {
                            button.classList.add("document-explorer__item--active");
                        }
                        if (selectedHighlightEnabled && selectedIds.has(item.id)) {
                            button.classList.add("document-explorer__item--selected");
                        }
                    }
                    const lead = document.createElement("span");
                    lead.className = "document-explorer__item-leading";
                    lead.innerHTML = `<i data-lucide="${item.icon || "file"}"></i>`;
                    button.appendChild(lead);
                    const label = document.createElement("span");
                    label.className = "document-explorer__item-title";
                    label.textContent = item.title || "Document";
                    button.appendChild(label);
                    button.addEventListener("click", event => {
                        const clickMeta = {
                            shiftKey: Boolean(event.shiftKey),
                            ctrlKey: Boolean(event.ctrlKey),
                            metaKey: Boolean(event.metaKey)
                        };
                        const selected = applySelectionFromClick(item.id, clickMeta);
                        if (clickMeta.shiftKey || clickMeta.ctrlKey || clickMeta.metaKey) return;
                        const liveActiveId = String(getActiveId?.() || activeId || "").trim();
                        if (liveActiveId === String(item.id || "").trim()) return;
                        onSelect?.(item, { selectedIds: selected, trigger: "recent-click" });
                    });
                    button.addEventListener("dragstart", event => {
                        draggingId = item.id;
                        draggingSection = getItemSection(item);
                        button.classList.add("is-dragging");
                        setDocumentDragPayload(event.dataTransfer, item);
                    });
                    button.addEventListener("dragend", () => {
                        draggingId = "";
                        draggingSection = "";
                        button.classList.remove("is-dragging");
                        try {
                            window.__goToolkitDraggingMemoDocument = null;
                        } catch (err) {
                            // ignore
                        }
                    });
                    row.appendChild(button);
                    sectionBody.appendChild(row);
                }
            };
            await renderRecentSection();
            if (isStale()) return;
            await renderSection("private", "Privé");
            if (isStale()) return;
            for (const sectionName of sharedSectionNames) {
                if (isStale()) return;
                const sectionMeta = getSectionMeta?.(sectionName) || {};
                const fallbackName = sectionName.replace(/^shared:/, "") || "Espace";
                await renderSection(sectionName, sectionMeta.title || fallbackName, sectionMeta.icon || "cloud-upload");
            }
            if (isStale()) return;
            const renderSuperpowersSection = async () => {
                if (isStale()) return;
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
                if (isStale()) return;
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
                            if (selectedHighlightEnabled && selectedIds.has(doc.id)) childBtn.classList.add("document-explorer__item--selected");
                            const childLead = document.createElement("span");
                            childLead.className = "document-explorer__item-leading";
                            childLead.innerHTML = `<i data-lucide="file"></i>`;
                            childBtn.appendChild(childLead);
                            const childLabel = document.createElement("span");
                            childLabel.className = "document-explorer__item-title";
                            childLabel.textContent = doc.title || "Document";
                            childBtn.appendChild(childLabel);
                            childBtn.addEventListener("click", event => {
                                const clickMeta = {
                                    shiftKey: Boolean(event.shiftKey),
                                    ctrlKey: Boolean(event.ctrlKey),
                                    metaKey: Boolean(event.metaKey)
                                };
                                const selected = applySelectionFromClick(doc.id, clickMeta);
                                if (clickMeta.shiftKey || clickMeta.ctrlKey || clickMeta.metaKey) return;
                                const liveActiveId = String(getActiveId?.() || activeId || "").trim();
                                if (liveActiveId === String(doc.id || "").trim()) return;
                                onSelect?.(doc, { selectedIds: selected, trigger: "superpower-click" });
                            });
                            childBtn.addEventListener("dragstart", event => {
                                draggingId = doc.id;
                                draggingSection = "superpowers";
                                childBtn.classList.add("is-dragging");
                                setDocumentDragPayload(event.dataTransfer, doc);
                            });
                            childBtn.addEventListener("dragend", () => {
                                draggingId = "";
                                draggingSection = "";
                                childBtn.classList.remove("is-dragging");
                                try {
                                    window.__goToolkitDraggingMemoDocument = null;
                                } catch (err) {
                                    // ignore
                                }
                            });
                            childRow.appendChild(childBtn);
                            sectionBody.appendChild(childRow);
                        });
                    }
                };
                visibleGroups.forEach(group => renderGroupRow(group));
            };
            await renderSuperpowersSection();
            if (isStale()) return;
            await renderSection("archives", "Archives", "archive");
            if (isStale()) return;
            if (!listDnDBound) {
                listDnDBound = true;
                listEl.addEventListener("dragover", event => {
                    if (!draggingId) return;
                    event.preventDefault();
                    const itemTarget = event.target.closest(".document-explorer__item");
                    if (itemTarget) {
                        clearRootDropHint();
                        return;
                    }
                    const sectionBody = event.target.closest(".document-explorer__section-body");
                    if (sectionBody) {
                        clearDropHint();
                        setRootDropHint(sectionBody);
                    } else {
                        clearRootDropHint();
                    }
                });
                listEl.addEventListener("drop", async event => {
                    if (!draggingId || !onMove) return;
                    if (event.target.closest(".document-explorer__item")) return;
                    event.preventDefault();
                    const sectionBody = event.target.closest(".document-explorer__section-body");
                    const toSection = sectionBody?.dataset?.section || "private";
                    const fromItem = normalizeList(cachedItems).find(entry => String(entry?.id || "") === String(draggingId));
                    const fromSection = draggingSection || getItemSection(fromItem);
                    const fromId = draggingId;
                    const selectedForMove = (selectedHighlightEnabled && selectedIds.has(fromId))
                        ? Array.from(sanitizeSelectedIds(selectedIds))
                        : [fromId];
                    const byId = new Map(
                        normalizeList(cachedItems)
                            .map(item => [String(item?.id || "").trim(), item])
                            .filter(([id]) => Boolean(id))
                    );
                    const selectedSet = new Set(selectedForMove.map(id => String(id || "").trim()).filter(Boolean));
                    const idsToMove = selectedForMove.filter((candidateId) => {
                        const id = String(candidateId || "").trim();
                        if (!id) return false;
                        let cursor = String(byId.get(id)?.parentId || "").trim();
                        while (cursor) {
                            if (selectedSet.has(cursor)) return false;
                            cursor = String(byId.get(cursor)?.parentId || "").trim();
                        }
                        return true;
                    });
                    if (!idsToMove.length) return;
                    if (fromSection === toSection) {
                        idsToMove.forEach((id, index) => {
                            applyLocalParentMove(id, "");
                            applyLocalOrderMove(id, "", index === 0 ? "" : "");
                        });
                        rebuildOrderFromCachedItems();
                    }
                    for (const id of idsToMove) {
                        await onMove(id, "", 1, "", { fromSection, toSection, selectedIds: idsToMove });
                    }
                    draggingId = "";
                    draggingSection = "";
                    clearAllDropHints();
                    renderList(cachedItems);
                });
                listEl.addEventListener("dragleave", event => {
                    const nextTarget = event.relatedTarget;
                    if (nextTarget && listEl.contains(nextTarget)) return;
                    clearAllDropHints();
                });
            }

            if (treeScrollContainer && Number.isFinite(preservedScrollTop)) {
                const maxTop = Math.max(0, treeScrollContainer.scrollHeight - treeScrollContainer.clientHeight);
                treeScrollContainer.scrollTop = Math.min(preservedScrollTop, maxTop);
            }
            if (window.lucide) window.lucide.createIcons();
        }

        async function refresh(options = {}) {
            const forceReload = Boolean(options && options.forceReload);
            if (typeof getItems !== "function") {
                renderEmpty();
                return;
            }
            try {
                if (!forceReload && hasLoadedTreeData && cachedItems.length > 0) {
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
                    const cloudDraftsKey = "goToolkit.memo.cloudDrafts.v1";
                    let cloudDrafts = {};
                    try {
                        if (typeof localStorage !== "undefined") {
                            const rawCloudDrafts = localStorage.getItem(cloudDraftsKey);
                            const parsedCloudDrafts = rawCloudDrafts ? JSON.parse(rawCloudDrafts) : {};
                            cloudDrafts = parsedCloudDrafts && typeof parsedCloudDrafts === "object" ? parsedCloudDrafts : {};
                        }
                    } catch (err) {
                        cloudDrafts = {};
                    }
                    const shared = await shareHistory.getRecordsByApp("memo");
                    const staleTokensToRemove = [];
                    const filteredShared = (Array.isArray(shared) ? shared : []).filter(item => {
                        const token = String(item?.token || "").trim();
                        if (!token) return false;
                        const draft = cloudDrafts[`share:${token}`];
                        const draftOpType = String(draft?.opType || draft?.reason || "").trim().toLowerCase();
                        if (draftOpType === "archive") {
                            staleTokensToRemove.push(token);
                            return false;
                        }
                        return true;
                    });
                    if (staleTokensToRemove.length && shareHistory?.removeRecord) {
                        await Promise.all(staleTokensToRemove.map(token => shareHistory.removeRecord("memo", token)));
                    }
                    const uniqueShared = normalizeList(filteredShared.map(item => ({
                        ...item,
                        id: `share:${item.token}`
                    })));
                    sharedItems = uniqueShared.map(item => ({
                        ...item,
                        title: item.title || "Document partagé",
                        icon: item.icon || "file-symlink",
                        parentId: (() => {
                            const rawParent = String(item.parentId || "").trim();
                            if (!rawParent) return "";
                            return rawParent.startsWith("share:") ? rawParent : `share:${rawParent}`;
                        })(),
                        isShared: true,
                        spaceId: String(item.spaceId || "golive").trim() || "golive",
                        section: `shared:${String(item.spaceId || "golive").trim() || "golive"}`
                    }));
                }
                if (getCommonItems) {
                    const common = await getCommonItems();
                    commonItems = normalizeList(Array.isArray(common) ? common : []).map(item => ({
                        ...item,
                        id: String(item.id || "").startsWith("common:") ? String(item.id) : `common:${item.id}`,
                        title: item.title || "Golive",
                        isCommon: true,
                        section: "common",
                        icon: String(item.icon || "").trim()
                    }));
                }
                cachedItems = normalizeList(
                    normalized.map(item => {
                        const isArchived = String(item?.status || "").trim().toLowerCase() === "archived";
                        return { ...item, section: isArchived ? "archives" : "private" };
                    })
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
            if (shouldDeferRenderForInlineRename(item.id)) {
                deferredRenderAfterInlineRename = true;
                return;
            }
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
            selectedIds = sanitizeSelectedIds(selectedIds);
            const nodes = listEl.querySelectorAll(".document-explorer__item[data-document-id]");
            nodes.forEach(node => {
                const nodeId = node.getAttribute("data-document-id") || "";
                node.classList.toggle("document-explorer__item--active", Boolean(activeId) && nodeId === activeId);
                node.classList.toggle("document-explorer__item--selected", selectedHighlightEnabled && selectedIds.has(nodeId));
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
        sidebar.addEventListener("contextmenu", event => {
            event.preventDefault();
        });
        sidebar.addEventListener("pointerdown", event => {
            const input = activeInlineRenameInput;
            if (!input || !input.isConnected) return;
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (target === input || input.contains(target)) return;
            input.blur();
        }, true);

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
            getItemsSnapshot() {
                return normalizeList(cachedItems).map(item => ({ ...item }));
            },
            getChildrenOf(parentId) {
                const pid = String(parentId || "").trim();
                if (!pid) return [];
                const token = pid.replace(/^(share:|common:)/, "");
                return normalizeList(cachedItems)
                    .filter(item => {
                        const rawParent = String(item?.parentId || "").trim();
                        if (!rawParent) return false;
                        if (rawParent === pid) return true;
                        return rawParent.replace(/^(share:|common:)/, "") === token;
                    })
                    .map(item => ({ ...item }));
            },
            async refreshIndicators() {
                refreshActiveIndicatorOnly();
            },
            getSelectedIds() {
                return getSelectedIdsSnapshot();
            },
            setSelectedIds(ids) {
                return setExplorerSelection(ids);
            },
            clearSelection() {
                clearExplorerSelection();
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
            async prioritizeItem(id) {
                prioritizeItem(id);
                await renderList(cachedItems);
            },
            async startInlineRename(id) {
                pendingInlineRenameId = String(id || "").trim();
                pendingInlineRenameUntil = pendingInlineRenameId ? Date.now() + 15000 : 0;
                activeInlineRenameId = "";
                if (!pendingInlineRenameId) return;
                await renderList(cachedItems);
            },
            async setItems(items) {
                cachedItems = normalizeList(items);
                syncOrderWithItems(cachedItems);
                await renderList(cachedItems);
            },
            async expandItem(id) {
                const itemId = String(id || "").trim();
                if (!itemId) return;
                expandedIds.add(itemId);
                persistExpandedState();
                await renderList(cachedItems);
            }
        };
    }

    window.GoToolkitDocumentExplorer = {
        create: createDocumentExplorer
    };
})();
