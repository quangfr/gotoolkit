(() => {
    const DEFAULT_WIDTH = 220;
    const MIN_WIDTH = 150;
    const MAX_WIDTH = 520;
    const DEFAULT_TITLE = "Documents";

    let superpowers = [];
    let currentModalSelectedIds = [];

    async function loadSuperpowers() {
        try {
            const response = await fetch('content/superpowers.json');
            if (response.ok) {
                superpowers = await response.json();
                if (document.querySelector(".modal-overlay.open")) {
                    populateSuperpowerCheckboxes(currentModalSelectedIds);
                }
            }
        } catch (err) {
            console.error('Erreur lors du chargement des super-pouvoirs:', err);
        }
    }

    function normalizeSuperpowersList(list, category) {
        const normalized = Array.isArray(list) ? list.filter(Boolean) : [];
        if (normalized.length) return normalized;
        return category ? [category] : [];
    }

    function populateSuperpowerCheckboxes(selectedIds = []) {
        const normalizedSelectedIds = Array.isArray(selectedIds)
            ? selectedIds.filter(Boolean)
            : [];
        currentModalSelectedIds = normalizedSelectedIds;
        const container = document.getElementById("document-explorer-superpowers-container");
        if (!container) return;
        container.innerHTML = '';

        superpowers.forEach(sp => {
            const label = document.createElement('label');
            label.className = 'superpower-checkbox-label';
            const isChecked = normalizedSelectedIds.some(id => String(id) == String(sp.id));
            label.innerHTML = `
                <input type="checkbox" value="${sp.id}" ${isChecked ? 'checked' : ''} style="display:none;">
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
                pill.classList.toggle('active', input.checked);
                if (checkIcon) checkIcon.style.display = input.checked ? 'inline-block' : 'none';
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

    function getRecentTimestamp(item) {
        const opened = Date.parse(item?.lastOpenedAt || "");
        if (Number.isFinite(opened) && opened > 0) return opened;
        const updated = Date.parse(item?.updatedAt || "");
        return Number.isFinite(updated) ? updated : 0;
    }

    function sortByOpenAndRecent(list, openIds) {
        const openSet = new Set((openIds || []).filter(Boolean));
        return [...list].sort((a, b) => {
            const aOpen = openSet.has(a?.id);
            const bOpen = openSet.has(b?.id);
            if (aOpen !== bOpen) return aOpen ? -1 : 1;
            const aTime = getRecentTimestamp(a);
            const bTime = getRecentTimestamp(b);
            return bTime - aTime;
        });
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
        const getItems = typeof opts.getItems === "function" ? opts.getItems : null;
        const getOpenIds = typeof opts.getOpenIds === "function" ? opts.getOpenIds : null;
        const getActiveId = typeof opts.getActiveId === "function" ? opts.getActiveId : null;
        let cachedItems = [];

        let hasDefaultTabSet = false;

        loadSuperpowers();

        function setActiveTab(target, options) {
            const nextTarget = target === "toc" ? "toc" : "library";
            const shouldRender = options?.renderToc ?? true;

            tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === nextTarget));
            libraryPanel?.classList.toggle("active", nextTarget === "library");
            tocPanel?.classList.toggle("active", nextTarget === "toc");

            if (actionRow) {
                actionRow.style.display = nextTarget === "library" ? "flex" : "none";
            }

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

        const actionRow = document.createElement("div");
        actionRow.className = "document-explorer__actions";
        if (appId === "memo") {
            const importBtn = document.createElement("button");
            importBtn.type = "button";
            importBtn.className = "chat-knowledge-modal__add btn btn-secondary";
            importBtn.innerHTML = '<i data-lucide="import"></i> Importer';
            importBtn.addEventListener("click", async () => {
                if (typeof window.GoToolkitMemoCreateAutoDocument === "function") {
                    await window.GoToolkitMemoCreateAutoDocument();
                }
                window.GoToolkitAssistInstance?.openImportFileSelector?.({
                    skipEmbeddings: true
                });
            });
            actionRow.appendChild(importBtn);
        }
        const createBtn = document.createElement("button");
        createBtn.type = "button";
        createBtn.className = "chat-knowledge-modal__add btn btn-secondary";
        createBtn.innerHTML = '<i data-lucide="plus"></i> Nouveau';
        actionRow.appendChild(createBtn);

        // Insert actionRow into the library panel instead of sidebar
        if (libraryPanel) {
            libraryPanel.insertBefore(actionRow, listEl);
        } else {
            sidebar.insertBefore(actionRow, listEl);
        }

        if (window.lucide) window.lucide.createIcons();

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
                        <input id="document-explorer-name-input" type="text" placeholder="Nom du document" />
                    </div>
                    <div class="header-row ia-header-actions" style="display:block;">
                        <label>Superpouvoirs</label>
                        <div id="document-explorer-superpowers-container" class="superpowers-checkbox-group"></div>
                    </div>
                    <div class="header-row ia-header-actions">
                        <label for="document-explorer-description-input">Description</label>
                        <textarea id="document-explorer-description-input" rows="3" placeholder="Description courte (optionnelle)"></textarea>
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end;">
                        <button class="btn btn-secondary" type="button" data-cancel>Annuler</button>
                        <button class="btn btn-secondary" type="button" data-publish style="display:none;">Publier</button>
                        <button class="btn-primary" type="button" data-confirm>Enregistrer</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const modalCloseBtn = modalOverlay.querySelector(".modal-close");
        const modalCancelBtn = modalOverlay.querySelector("[data-cancel]");
        const modalPublishBtn = modalOverlay.querySelector("[data-publish]");
        const modalConfirmBtn = modalOverlay.querySelector("[data-confirm]");
        const modalInput = modalOverlay.querySelector("#document-explorer-name-input");
        const modalDescInput = modalOverlay.querySelector("#document-explorer-description-input");
        let modalResolver = null;

        function getSelectedSuperpowers() {
            const container = modalOverlay.querySelector("#document-explorer-superpowers-container");
            if (!container) return [];
            return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        }

        function closeModal() {
            modalOverlay.classList.remove("open");
            modalOverlay.style.display = "none";
            modalResolver = null;
        }

        function hasAdminToken() {
            const token = localStorage.getItem("feedback-admin-token") || "";
            return Boolean(String(token).trim());
        }

        function openNameModal(defaultValue, defaultDescription, options) {
            if (!modalInput) return Promise.resolve(null);
            modalOverlay.style.display = "flex";
            modalOverlay.classList.add("open");

            const selectedSuperpowers = normalizeSuperpowersList(
                options && options.superpowers,
                options && options.category
            );

            populateSuperpowerCheckboxes(selectedSuperpowers);
            if (window.lucide) window.lucide.createIcons();
            modalInput.value = defaultValue || "";
            if (modalDescInput) modalDescInput.value = defaultDescription || "";
            const shouldFetchFromStore =
                (!options || options.superpowers === undefined || (Array.isArray(options.superpowers) && options.superpowers.length === 0))
                && options?.documentId;
            if (shouldFetchFromStore) {
                const documentApi = window.goToolkitDocumentApi;
                if (documentApi?.getRecord) {
                    documentApi.getRecord(options.documentId).then(record => {
                        const fallback = normalizeSuperpowersList(record?.superpowers, record?.category);
                        if (fallback.length) {
                            populateSuperpowerCheckboxes(fallback);
                            if (window.lucide) window.lucide.createIcons();
                        }
                    }).catch(() => { /* noop */ });
                }
            }
            const allowPublish = Boolean(options && options.allowPublish && hasAdminToken());
            if (modalPublishBtn) {
                modalPublishBtn.style.display = allowPublish ? "inline-flex" : "none";
            }
            if (modalCancelBtn) {
                modalCancelBtn.style.display = allowPublish ? "none" : "inline-flex";
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
        modalCancelBtn?.addEventListener("click", () => resolveModal(null));
        modalPublishBtn?.addEventListener("click", () => {
            resolveModal({
                name: modalInput?.value || "",
                description: modalDescInput?.value || "",
                superpowers: getSelectedSuperpowers(),
                action: "publish"
            });
        });
        modalConfirmBtn?.addEventListener("click", () => {
            resolveModal({
                name: modalInput?.value || "",
                description: modalDescInput?.value || "",
                superpowers: getSelectedSuperpowers(),
                action: "confirm"
            });
        });
        modalOverlay.addEventListener("click", event => {
            if (event.target === modalOverlay) {
                resolveModal(null);
            }
        });

        modalInput?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                resolveModal({
                    name: modalInput?.value || "",
                    description: modalDescInput?.value || "",
                    superpowers: getSelectedSuperpowers(),
                    action: "confirm"
                });
            }
        });

        function normalizeName(value) {
            const name = String(value || "").trim();
            return name || "Doc";
        }

        function uniqueName(name, list, extraNames) {
            const base = normalizeName(name);
            const names = (list || []).map(item => String(item.title || "").trim()).filter(Boolean);
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

        let cachedSuperpowers = null;
        async function getSuperpowers() {
            if (cachedSuperpowers) return cachedSuperpowers;
            try {
                const resp = await fetch('content/superpowers.json');
                if (resp.ok) {
                    cachedSuperpowers = await resp.json();
                    return cachedSuperpowers;
                }
            } catch (e) { }
            return [];
        }

        async function renderList(items) {
            if (!listEl) return;
            listEl.innerHTML = "";
            if (!items || !items.length) {
                renderEmpty();
                return;
            }
            const superpowersMap = await getSuperpowers();
            const openIds = Array.isArray(getOpenIds?.()) ? getOpenIds() : [];
            const activeId = typeof getActiveId?.() === "string" ? getActiveId() : "";
            const openSet = new Set(openIds.filter(Boolean));
            items.forEach(item => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "document-explorer__item";
                if (item.id) {
                    button.dataset.documentId = item.id;
                    if (openSet.has(item.id)) {
                        button.classList.add("document-explorer__item--open");
                    }
                    if (activeId && activeId === item.id) {
                        button.classList.add("document-explorer__item--active");
                    }
                }

                const label = document.createElement("span");
                label.className = "document-explorer__item-title";
                label.textContent = item.title || "Mémo sans titre";
                button.appendChild(label);

                const openedLabel = formatRelativeShort(item?.lastOpenedAt || "");
                if (openedLabel) {
                    const openedAt = document.createElement("span");
                    openedAt.className = "document-explorer__item-opened";
                    openedAt.textContent = openedLabel;
                    openedAt.title = "Dernière ouverture";
                    button.appendChild(openedAt);
                }

                const actions = document.createElement("span");
                actions.className = "document-explorer__item-actions";

                const renameBtn = document.createElement("button");
                renameBtn.type = "button";
                renameBtn.className = "document-explorer__item-action document-explorer__rename";
                renameBtn.innerHTML = '<i data-lucide="pencil"></i>';
                renameBtn.title = "Renommer";
                renameBtn.addEventListener("click", event => {
                    event.stopPropagation();
                    if (!onRename) return;
                    openNameModal(item.title || "", item.description || "", {
                        superpowers: normalizeSuperpowersList(item.superpowers, item.category),
                        documentId: item.id,
                        allowPublish: true
                    }).then(result => {
                        if (!result) return;
                        onRename(item, {
                            ...result,
                            name: uniqueName(result.name, cachedItems)
                        });
                    });
                });
                actions.appendChild(renameBtn);

                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "document-explorer__item-action document-explorer__delete";
                deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                deleteBtn.title = "Supprimer";
                deleteBtn.addEventListener("click", event => {
                    event.stopPropagation();
                    if (!onDelete) return;
                    onDelete(item);
                });
                actions.appendChild(deleteBtn);

                button.appendChild(actions);
                listEl.appendChild(button);
            });

            if (window.lucide) window.lucide.createIcons();
        }

        async function refresh() {
            if (typeof getItems !== "function") {
                renderEmpty();
                return;
            }
            try {
                const items = await getItems();
                const normalized = Array.isArray(items) ? items : [];
                const openIds = Array.isArray(getOpenIds?.()) ? getOpenIds() : [];
                cachedItems = sortByOpenAndRecent(normalized, openIds);
                await renderList(cachedItems);
            } catch (err) {
                renderEmpty();
            }
        }

        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => {
                applyOpen(!isOpen);
            });
        }

        let isCreating = false;
        const pendingNames = new Set();

        createBtn.addEventListener("click", async () => {
            if (!onCreate) return;
            if (isCreating) return;
            isCreating = true;
            createBtn.disabled = true;
            try {
                const baseName = uniqueName(`Doc ${cachedItems.length + 1}`, cachedItems, Array.from(pendingNames));
                const result = await openNameModal(baseName);
                if (!result) return;
                const name = uniqueName(result.name, cachedItems, Array.from(pendingNames));
                pendingNames.add(name);
                await Promise.resolve(onCreate(name, result.description, result.superpowers));
            } finally {
                isCreating = false;
                createBtn.disabled = false;
                pendingNames.clear();
            }
        });

        if (resizer) {
            let startX = 0;
            let startWidth = width;

            const onMove = (event) => {
                const clientX = event.touches ? event.touches[0].clientX : event.clientX;
                const delta = clientX - startX;
                applyWidth(startWidth + delta);
            };

            const stopResize = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", stopResize);
                document.removeEventListener("touchmove", onMove);
                document.removeEventListener("touchend", stopResize);
            };

            const startResize = (event) => {
                event.preventDefault();
                startX = event.touches ? event.touches[0].clientX : event.clientX;
                startWidth = width;
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

        window.addEventListener("resize", () => {
            if (window.innerWidth < 900 && isOpen) {
                applyOpen(false);
            }
        });

        return {
            refresh,
            async refreshIndicators() {
                const openIds = Array.isArray(getOpenIds?.()) ? getOpenIds() : [];
                cachedItems = sortByOpenAndRecent(cachedItems, openIds);
                await renderList(cachedItems);
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
            uniqueName(name) {
                return uniqueName(name, cachedItems);
            },
            async setItems(items) {
                const openIds = Array.isArray(getOpenIds?.()) ? getOpenIds() : [];
                cachedItems = sortByOpenAndRecent(Array.isArray(items) ? items : [], openIds);
                await renderList(cachedItems);
            }
        };
    }

    window.GoToolkitDocumentExplorer = {
        create: createDocumentExplorer
    };
})();
