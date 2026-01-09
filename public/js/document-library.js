(() => {
    const DEFAULT_WIDTH = 350;
    const MIN_WIDTH = 150;
    const MAX_WIDTH = 520;
    const DEFAULT_TITLE = "Documents";

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

    function sortByUpdatedAt(list) {
        return [...list].sort((a, b) => {
            const aTime = Date.parse(a?.updatedAt || "") || 0;
            const bTime = Date.parse(b?.updatedAt || "") || 0;
            return bTime - aTime;
        });
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
        const headerEl = sidebar.querySelector(".document-explorer__header");
        const onCreate = typeof opts.onCreate === "function" ? opts.onCreate : null;
        const onRename = typeof opts.onRename === "function" ? opts.onRename : null;
        const onDelete = typeof opts.onDelete === "function" ? opts.onDelete : null;
        const getItems = typeof opts.getItems === "function" ? opts.getItems : null;
        let cachedItems = [];

        if (headerEl) {
            headerEl.textContent = "";
            const title = document.createElement("span");
            title.textContent = opts.title || headerEl.textContent || DEFAULT_TITLE;
            headerEl.appendChild(title);
            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "chat-knowledge-modal__close";
            closeBtn.style.marginLeft = "auto";
            closeBtn.textContent = "✕";
            closeBtn.addEventListener("click", () => {
                applyOpen(false);
            });
            headerEl.appendChild(closeBtn);
        }

        const createBtn = document.createElement("button");
        createBtn.type = "button";
        createBtn.className = "chat-knowledge-modal__add btn btn-secondary";
        createBtn.textContent = "+ Nouveau";
        sidebar.insertBefore(createBtn, listEl);

        const modalOverlay = document.createElement("div");
        modalOverlay.className = "modal-overlay";
        modalOverlay.setAttribute("role", "dialog");
        modalOverlay.setAttribute("aria-modal", "true");
        modalOverlay.style.display = "none";
        modalOverlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>Nom du document</h3>
                    <button class="modal-close" type="button" aria-label="Fermer">×</button>
                </div>
                <div class="ia-actions">
                    <div class="header-row ia-header-actions">
                        <label for="document-explorer-name-input">Nom</label>
                        <input id="document-explorer-name-input" type="text" />
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end;">
                        <button class="btn btn-secondary" type="button" data-cancel>Annuler</button>
                        <button class="btn-primary" type="button" data-confirm>Valider</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        const modalCloseBtn = modalOverlay.querySelector(".modal-close");
        const modalCancelBtn = modalOverlay.querySelector("[data-cancel]");
        const modalConfirmBtn = modalOverlay.querySelector("[data-confirm]");
        const modalInput = modalOverlay.querySelector("#document-explorer-name-input");
        let modalResolver = null;

        function closeModal() {
            modalOverlay.classList.remove("open");
            modalOverlay.style.display = "none";
            modalResolver = null;
        }

        function openNameModal(defaultValue) {
            if (!modalInput) return Promise.resolve(null);
            modalOverlay.style.display = "flex";
            modalOverlay.classList.add("open");
            modalInput.value = defaultValue || "";
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
        modalConfirmBtn?.addEventListener("click", () => resolveModal(modalInput?.value || ""));
        modalOverlay.addEventListener("click", event => {
            if (event.target === modalOverlay) {
                resolveModal(null);
            }
        });

        modalInput?.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                resolveModal(modalInput?.value || "");
            }
        });

        function normalizeName(value) {
            const name = String(value || "").trim();
            return name || "Doc";
        }

        function uniqueName(name, list) {
            const base = normalizeName(name);
            const names = (list || []).map(item => String(item.title || "").trim()).filter(Boolean);
            if (!names.includes(base)) return base;
            let index = 1;
            let candidate = `${base} (${index})`;
            while (names.includes(candidate)) {
                index += 1;
                candidate = `${base} (${index})`;
            }
            return candidate;
        }

        let isOpen = readBool(openKey, false);
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
            }
            writeBool(openKey, isOpen);
        }

        function renderEmpty() {
            if (!listEl) return;
            listEl.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "document-explorer__empty";
            empty.textContent = "Aucun document";
            listEl.appendChild(empty);
        }

        function renderList(items) {
            if (!listEl) return;
            listEl.innerHTML = "";
            if (!items || !items.length) {
                renderEmpty();
                return;
            }
            items.forEach(item => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "document-explorer__item";
                if (item.id) {
                    button.dataset.documentId = item.id;
                }
                const label = document.createElement("span");
                label.textContent = item.title || "Mémo sans titre";
                button.appendChild(label);

                const actions = document.createElement("span");
                actions.className = "document-explorer__item-actions";

                const renameBtn = document.createElement("button");
                renameBtn.type = "button";
                renameBtn.className = "document-explorer__item-action document-explorer__rename";
                renameBtn.textContent = "✎";
                renameBtn.title = "Renommer";
                renameBtn.addEventListener("click", event => {
                    event.stopPropagation();
                    if (!onRename) return;
                    openNameModal(item.title || "").then(result => {
                        if (!result) return;
                        onRename(item, uniqueName(result, cachedItems));
                    });
                });
                actions.appendChild(renameBtn);

                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "document-explorer__item-action document-explorer__delete";
                deleteBtn.textContent = "⊗";
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
        }

        async function refresh() {
            if (typeof getItems !== "function") {
                renderEmpty();
                return;
            }
            try {
                const items = await getItems();
                const normalized = Array.isArray(items) ? items : [];
                cachedItems = sortByUpdatedAt(normalized);
                renderList(cachedItems);
            } catch (err) {
                renderEmpty();
            }
        }

        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => {
                applyOpen(!isOpen);
            });
        }

        createBtn.addEventListener("click", async () => {
            if (!onCreate) return;
            const baseName = uniqueName(`Doc ${cachedItems.length + 1}`, cachedItems);
            const result = await openNameModal(baseName);
            if (!result) return;
            const name = uniqueName(result, cachedItems);
            onCreate(name);
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

        return {
            refresh,
            open() {
                applyOpen(true);
            },
            close() {
                applyOpen(false);
            },
            openRenameModal(name) {
                return openNameModal(name);
            },
            uniqueName(name) {
                return uniqueName(name, cachedItems);
            },
            setItems(items) {
                cachedItems = sortByUpdatedAt(Array.isArray(items) ? items : []);
                renderList(cachedItems);
            }
        };
    }

    window.GoToolkitDocumentExplorer = {
        create: createDocumentExplorer
    };
})();
