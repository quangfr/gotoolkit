        (function () {
            const sharedSpacesRoot = document.getElementById("sharedSpacesRoot");
            const pinnedGallery = document.getElementById("pinnedGallery");
            const pinnedBlock = document.getElementById("pinnedBlock");
            const loadingLabel = document.getElementById("shareLoading");
            const errorLabel = document.getElementById("shareError");
            const refreshBtn = document.getElementById("refreshShares");
            const shareHistory = window.goToolkitShareHistory;
            const shareService = window.goToolkitShareWorker;
            const spacesApi = window.GoToolkitSpaces;
            const savedGallery = document.getElementById("savedGallery");
            const savedGalleryNav = document.getElementById("savedGalleryNav");
            const savedEmpty = document.getElementById("savedEmpty");
            const documentApi = window.goToolkitDocumentApi;

            const APP_DEFINITIONS = {
                memo: { icon: "zap", name: "Docs", page: "index.html", collection: "memos" },
                plan: { icon: "layout-list", name: "Timeline", page: "old/timeline.html", collection: "timelines" },
                grid: { icon: "grid-3x3", name: "Grid", page: "grid.html", collection: "grids" }
            };
            const GRID_TEMPLATE_LABELS = {
                "tree-structure": "Structure de données",
                "data-mapping": "Mapping de données",
                "data-mock": "Données fictives"
            };
            let refreshGalleryPromise = null;
            let refreshSavedPromise = null;

            function setState({ loading = false, hasPinned = false, error = "" }) {
                if (loadingLabel) {
                    loadingLabel.hidden = !loading;
                }
                if (pinnedBlock) {
                    pinnedBlock.hidden = !hasPinned;
                }
                if (errorLabel) {
                    errorLabel.hidden = !error;
                    errorLabel.textContent = error || "";
                }
            }

            function formatFriendlyDate(isoString) {
                if (!isoString) return "Mis à jour";
                try {
                    const value = new Date(isoString).getTime();
                    if (Number.isNaN(value)) return "Mis à jour";
                    const deltaSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
                    if (deltaSeconds < 60) return "À l'instant";
                    const deltaMinutes = Math.floor(deltaSeconds / 60);
                    if (deltaMinutes < 60) return `Il y a ${deltaMinutes} min`;
                    const deltaHours = Math.floor(deltaMinutes / 60);
                    if (deltaHours < 24) return `Il y a ${deltaHours} h`;
                    const deltaDays = Math.floor(deltaHours / 24);
                    if (deltaDays < 30) return `Il y a ${deltaDays} j`;
                    const formatter = new Intl.DateTimeFormat("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                    });
                    return formatter.format(new Date(value));
                } catch (err) {
                    return "Mis à jour";
                }
            }

            function normalizeLines(value) {
                if (!value) return [];
                return value
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(Boolean)
                    .slice(0, 2);
            }

            function stripEmojiPrefix(text) {
                if (!text || typeof text !== "string") return "";
                try {
                    return text.replace(/^[\p{Emoji_Presentation}\p{Emoji}\u200d\ufe0f]+\s*/u, "").trim();
                } catch (e) {
                    return text.trim();
                }
            }

            function buildMetaBadge(label) {
                if (!label) return "";
                const clean = stripEmojiPrefix(label);
                if (!clean) return "";
                const safe = clean.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return `<span class="share-card-template">${safe}</span>`;
            }

            let superpowersCatalog = null;

            async function getSuperpowersCatalog() {
                if (superpowersCatalog) return superpowersCatalog;
                try {
                    const resp = await fetch('content/superpowers.json');
                    if (resp.ok) {
                        superpowersCatalog = await resp.json();
                        return superpowersCatalog;
                    }
                } catch (e) {
                    // ignore
                }
                superpowersCatalog = [];
                return superpowersCatalog;
            }

            function normalizeSuperpowers(list, category) {
                const normalized = Array.isArray(list) ? list.filter(Boolean) : [];
                if (normalized.length) return normalized;
                return category ? [category] : [];
            }

            function buildSuperpowerBadges(superpowers, catalog) {
                if (!Array.isArray(superpowers) || !superpowers.length) return "";
                const badges = superpowers
                    .map(id => {
                        const match = (catalog || []).find(sp => sp.id === id || sp.id == id);
                        const label = match?.title || String(id || "").trim();
                        if (!label) return null;
                        const safe = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                        const icon = match?.icon || "sparkles";
                        return `<span class="share-card-template"><i data-lucide="${icon}" style="width:12px;height:12px;margin-right:6px;vertical-align:middle;"></i>${safe}</span>`;
                    })
                    .filter(Boolean);
                if (!badges.length) return "";
                const badgeHtml = badges.join(" ");
                return `<p class="share-card-meta">${badgeHtml}</p>`;
            }

            function extractPreview(app, payload) {
                let templateLabel = "";
                if (app === "plan") {
                    const firstView = payload?.views?.[0];
                    const tabName = firstView?.title || firstView?.name || "Planning";
                    const brief = payload?.brief || "";
                    templateLabel =
                        payload?.templateName ||
                        firstView?.context?.templateName ||
                        firstView?.context?.templateId ||
                        "";
                    return { tabName, lines: normalizeLines(brief), templateLabel };
                }
                if (app === "grid") {
                    const tabName = payload?.title || "Tableau";
                    const context = payload?.scenario || "";
                    const templateLabel =
                        payload?.templateLabel ||
                        GRID_TEMPLATE_LABELS[payload?.templateId] ||
                        payload?.templateId ||
                        "";
                    return { tabName, lines: normalizeLines(context), templateLabel };
                }
                if (app === "memo") {
                    const firstTab = payload?.tabs?.[0];
                    const tabName = firstTab?.title || "Docs";
                    const content = firstTab?.content || "";
                    const plainText = content
                        .replace(/<[^>]+>/g, " ")
                        .replace(/[*_`~[\]()#+\-]/g, " ")
                        .trim();
                    const firstLine = plainText.split(/\r?\n/)[0]?.trim() || "";
                    const lines = firstLine ? [firstLine] : [];
                    const templateLabel = payload?.templateLabel || payload?.templateId || "";
                    const hasRecording = Boolean(
                        payload?.voiceRecordingId ||
                        payload?.tabs?.some(tab => typeof tab?.voiceRecordingId === "string" && tab.voiceRecordingId)
                    );
                    return { tabName, lines, templateLabel, hasRecording };
                }
                return { tabName: "Sans titre", lines: [], templateLabel: "", hasRecording: false };
            }

            async function getStoredRecords() {
                if (!shareHistory) {
                    return [];
                }
                const records = await shareHistory.getRecords() || {};
                const flat = [];
                Object.entries(records).forEach(([app, appData]) => {
                    if (APP_DEFINITIONS[app]) {
                        if (appData && typeof appData === "object" && !appData.token) {
                            // Support for the new structure (keyed by token)
                            Object.values(appData).forEach(record => {
                                if (record?.token) {
                                    flat.push({ app, record });
                                }
                            });
                        } else if (appData?.token) {
                            // Support for legacy single record structure
                            flat.push({ app, record: appData });
                        }
                    }
                });
                return flat;
            }

            function buildShareUrl(definition, token) {
                const url = new URL("index.html", window.location.origin);
                url.searchParams.set("share", token);
                return url.toString();
            }

            function queueMemoOpenRequest(request) {
                if (!request || typeof localStorage === "undefined") return;
                try {
                    localStorage.setItem("goToolkit.memo.documentToOpen", JSON.stringify(request));
                } catch (err) {
                    // noop
                }
            }

            async function createShareCardElement(cardInfo, target = "_self") {
                const { definition, preview, formattedDate, href, app, record, superpowerHtml } = cardInfo;
                const card = document.createElement("a");
                card.className = "share-card";
                card.href = href;
                card.target = target;
                card.rel = "noopener";
                card.setAttribute("data-app", app);
                const notionIcon = String(record?.notionPageId || "").trim() ? '<i data-lucide="notebook" style="width:14px;height:14px;margin-right:8px;vertical-align:text-bottom;opacity:0.85;"></i>' : "";
                card.innerHTML = `
                    <p class="share-card-title">${notionIcon}${preview.tabName}</p>
                    ${superpowerHtml || ""}
                    <p class="share-card-desc">${preview.lines.join(" · ") || "(sans contexte)"}</p>
                    <p class="share-card-date">${formattedDate}</p>
                `;
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "share-card-action share-card-delete";
                deleteBtn.title = "Supprimer ce document";
                deleteBtn.innerHTML = `<i data-lucide="x" style="width:14px;height:14px;"></i>`;
                deleteBtn.addEventListener("click", async event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const confirmed = window.confirm("Supprimer ce document ?");
                    if (!confirmed) return;
                    try {
                        await shareService?.deleteSharePayload?.(definition.collection, record.token);
                    } catch (err) {
                        console.warn("Suppression distante impossible", err);
                    }
                    await shareHistory?.removeRecord?.(app, record.token);
                    refreshGallery().catch(() => { /* noop */ });
                });
                card.appendChild(deleteBtn);
                if (app === "memo" && record?.token) {
                    card.addEventListener("click", () => {
                        queueMemoOpenRequest({ type: "share", token: record.token });
                    });
                }
                return card;
            }

            async function buildShareCard(app, record) {
                const definition = APP_DEFINITIONS[app];
                if (!definition || !shareService?.isReady) {
                    return null;
                }
                let result;
                try {
                    result = await shareService.fetchSharePayload(definition.collection, record.token);
                } catch (err) {
                    console.error(`Impossible de récupérer le document ${app}`, err);
                    return null;
                }
                if (!result || !result.payload) {
                    await shareHistory?.removeRecord?.(app);
                    return null;
                }
                const preview = extractPreview(app, result.payload);
                const updatedAt = record.updatedAt || result.meta?.updatedAt || new Date().toISOString();
                const formattedDate = formatFriendlyDate(updatedAt);
                const href = buildShareUrl(definition, record.token);
                const catalog = await getSuperpowersCatalog();
                const superpowers = normalizeSuperpowers(record.superpowers, record.category);
                const superpowerHtml = buildSuperpowerBadges(superpowers, catalog);
                const cardInfo = { app, definition, record, preview, formattedDate, href, superpowerHtml, isPinned: false };
                const card = await createShareCardElement(cardInfo);
                return { ...cardInfo, card, updatedAt, isPinned: false };
            }

            function buildCreateCard() {
                const card = document.createElement("a");
                card.className = "share-card share-card--create";
                card.href = "index.html?edit=new";
                card.target = "_self";
                card.innerHTML = `
                    <p class="share-card-title"><i data-lucide="plus-circle" style="width:16px;height:16px;margin-right:8px;vertical-align:text-bottom;"></i>Créer un nouveau document</p>
                `;
                card.addEventListener("click", () => {
                    queueMemoOpenRequest({ type: "edit", id: "new" });
                });
                return card;
            }

            async function buildSavedCard(record, catalog) {
                if (!record || !documentApi) {
                    return null;
                }
                const definition = APP_DEFINITIONS[record.app];
                if (!definition) {
                    return null;
                }
                const preview = extractPreview(record.app, record.payload || {});
                const formattedDate = formatFriendlyDate(record.updatedAt);

                let href = "";
                let target = "_self";
                href = `index.html?edit=${record.id}`;

                const card = document.createElement("a");
                card.className = "share-card";
                card.href = href;
                card.target = target;
                card.rel = "noopener";
                card.setAttribute("data-app", record.app);
                const superpowers = normalizeSuperpowers(record.superpowers, record.category);
                const superpowerHtml = buildSuperpowerBadges(superpowers, catalog);
                const notionIcon = String(record?.notionPageId || "").trim() ? '<i data-lucide="notebook" style="width:14px;height:14px;margin-right:8px;vertical-align:text-bottom;opacity:0.85;"></i>' : "";
                card.innerHTML = `
                    <p class="share-card-title">${notionIcon}${preview.tabName}</p>
                    ${superpowerHtml}
                    <p class="share-card-desc">${preview.lines.join(" · ") || "Complète le contexte pour l'afficher ici."}</p>
                    <p class="share-card-date">${formattedDate}</p>
                `;
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "share-card-action share-card-delete";
                deleteBtn.title = "Supprimer ce document";
                deleteBtn.innerHTML = `<i data-lucide="x" style="width:14px;height:14px;"></i>`;
                deleteBtn.addEventListener("click", async event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const confirmed = window.confirm("Supprimer ce document ?");
                    if (!confirmed) return;
                    await documentApi.removeRecord?.(record.id);
                    refreshSavedGallery().catch(() => { /* noop */ });
                });
                card.appendChild(deleteBtn);
                if (record.app === "memo" && record.id) {
                    card.addEventListener("click", () => {
                        queueMemoOpenRequest({ type: "edit", id: record.id });
                    });
                }
                return { card, isPinned: false, updatedAt: record.updatedAt, preview };
            }

            const GALLERY_TEXT_KEYS = {
                common: [
                    "title",
                    "label",
                    "name",
                    "context",
                    "globalContext",
                    "brief",
                    "summary",
                    "scenario",
                    "description",
                    "text",
                    "content",
                    "input",
                    "notes",
                    "transcript",
                    "speaker",
                    "objective",
                    "goal",
                    "decision",
                    "problem",
                    "opportunity"
                ],
                plan: ["views", "items", "milestones"],
                grid: ["rows", "columns", "fields", "value", "headerName"]
            };

            function collectPayloadText(value, keyWhitelist, output, depth = 0) {
                if (depth > 6 || value == null) return;
                if (typeof value === "string") {
                    const trimmed = value.trim();
                    if (trimmed) output.push(trimmed);
                    return;
                }
                if (typeof value === "number" || typeof value === "boolean") {
                    output.push(String(value));
                    return;
                }
                if (Array.isArray(value)) {
                    value.forEach(item => collectPayloadText(item, keyWhitelist, output, depth + 1));
                    return;
                }
                if (typeof value === "object") {
                    Object.entries(value).forEach(([key, val]) => {
                        if (keyWhitelist.has(key)) {
                            collectPayloadText(val, keyWhitelist, output, depth + 1);
                        } else if (typeof val === "object") {
                            collectPayloadText(val, keyWhitelist, output, depth + 1);
                        }
                    });
                }
            }

            function buildGalleryText(app, payload, sourceLabel) {
                if (!payload || typeof payload !== "object") return "";
                const keys = new Set([
                    ...GALLERY_TEXT_KEYS.common,
                    ...(GALLERY_TEXT_KEYS[app] || [])
                ]);
                const lines = [];
                collectPayloadText(payload, keys, lines);
                const unique = [];
                const seen = new Set();
                lines.forEach(line => {
                    const normalized = line.replace(/\s+/g, " ").trim();
                    if (!normalized) return;
                    if (seen.has(normalized)) return;
                    seen.add(normalized);
                    unique.push(normalized);
                });
                const header = [
                    `Source: ${sourceLabel}`,
                    `App: ${app}`
                ];
                const body = unique.join("\n");
                const combined = header.concat(body ? [body] : []).join("\n");
                return combined.slice(0, 20000);
            }

            function createGalleryFile(text, name) {
                const blob = new Blob([text], { type: "text/plain" });
                blob.name = name;
                return blob;
            }

            function initGalleryNav(wrapper, listEl) {
                if (!wrapper || !listEl) return;
                const prevBtn = wrapper.querySelector(".gallery-nav__prev");
                const nextBtn = wrapper.querySelector(".gallery-nav__next");
                const pageSize = 10;
                const isSavedOrShareGallery = listEl.id === "savedGallery" || String(listEl.id || "").startsWith("spaceGallery_");

                function update() {
                    const items = Array.from(listEl.children);
                    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
                    let page = parseInt(wrapper.dataset.page || "0", 10);
                    if (!Number.isFinite(page) || page < 0) page = 0;
                    if (page >= totalPages) page = 0;
                    wrapper.dataset.page = String(page);

                    items.forEach((item, index) => {
                        const pageIndex = Math.floor(index / pageSize);
                        item.style.display = totalPages <= 1 || pageIndex === page ? "" : "none";
                    });

                    const showNav = totalPages > 1;
                    if (prevBtn) prevBtn.style.display = showNav ? "flex" : "none";
                    if (nextBtn) nextBtn.style.display = showNav ? "flex" : "none";
                    if (isSavedOrShareGallery) {
                        listEl.classList.toggle("single-page", !showNav);
                    }
                }

                if (!wrapper.dataset.navInit) {
                    wrapper.dataset.navInit = "true";
                    prevBtn?.addEventListener("click", () => {
                        const page = parseInt(wrapper.dataset.page || "0", 10) || 0;
                        wrapper.dataset.page = String(Math.max(0, page - 1));
                        update();
                    });
                    nextBtn?.addEventListener("click", () => {
                        const page = parseInt(wrapper.dataset.page || "0", 10) || 0;
                        wrapper.dataset.page = String(page + 1);
                        update();
                    });
                }

                update();
            }

            function hideGalleryNav(wrapper) {
                if (!wrapper) return;
                wrapper.dataset.page = "0";
                wrapper.querySelectorAll(".gallery-nav__btn").forEach(btn => {
                    btn.style.display = "none";
                });
                if (wrapper.id === "savedGalleryNav") savedGallery?.classList.add("single-page");
            }

            async function refreshSavedGallery() {
                if (refreshSavedPromise) {
                    return refreshSavedPromise;
                }
                refreshSavedPromise = (async () => {
                    if (!savedGallery) {
                        return;
                    }
                    savedGallery.innerHTML = "";
                    if (!documentApi || typeof documentApi.getAllRecords !== "function") {
                        savedGallery.appendChild(buildCreateCard());
                        if (savedEmpty) savedEmpty.hidden = false;
                        hideGalleryNav(savedGalleryNav);
                        return;
                    }
                    const records = await documentApi.getAllRecords();
                    const seenIds = new Set();
                    const entries = records.filter(record => {
                        const definition = APP_DEFINITIONS[record.app];
                        if (!definition) return false;
                        const key = `${record.app}::${record.id}`;
                        if (seenIds.has(key)) return false;
                        seenIds.add(key);
                        return true;
                    });
                    const staleIds = [];
                    const filtered = entries.filter(record => {
                        const hasPayload = record && record.payload && typeof record.payload === "object";
                        if (!hasPayload && record?.id) {
                            staleIds.push(record.id);
                        }
                        return hasPayload;
                    });
                    if (staleIds.length) {
                        await Promise.all(staleIds.map(id => documentApi.removeRecord?.(id)));
                    }
                    if (!filtered.length) {
                        savedGallery.appendChild(buildCreateCard());
                        if (savedEmpty) savedEmpty.hidden = false;
                        hideGalleryNav(savedGalleryNav);
                        return;
                    }
                    if (savedEmpty) savedEmpty.hidden = true;
                    // Deduplicate saved drafts that are already present in shared gallery
                    const sharedKeys = window.__goToolkitSharedPreviewKeys || new Set();
                    // Deduplicate both against shared and within saved
                    const seenSavedKeys = new Set();
                    const catalog = await getSuperpowersCatalog();
                    const cards = (await Promise.all(filtered
                        .map(record => buildSavedCard(record, catalog))))
                        .filter(Boolean)
                        .filter(item => {
                            try {
                                const definition = APP_DEFINITIONS[item.card.getAttribute("data-app")];
                                const key = `${definition.collection}::${item.preview.tabName}::${(item.preview.lines || []).join("|")}`;
                                if (sharedKeys.has(key)) return false;
                                if (seenSavedKeys.has(key)) return false;
                                seenSavedKeys.add(key);
                                return true;
                            } catch (e) {
                                return true;
                            }
                        });
                    // Front dedupe: avoid duplicate hrefs
                    const hrefSeen = new Set();
                    const uniqueCards = cards.filter(item => {
                        const href = item.card?.getAttribute("href");
                        if (!href) return true;
                        if (hrefSeen.has(href)) return false;
                        hrefSeen.add(href);
                        return true;
                    });
                    const regular = uniqueCards
                        .sort((a, b) => {
                            const nameA = (a.preview?.tabName || "").toLowerCase();
                            const nameB = (b.preview?.tabName || "").toLowerCase();
                            if (nameA && nameB) return nameA.localeCompare(nameB, "fr");
                            return 0;
                        });
                    savedGallery.appendChild(buildCreateCard());
                    regular.forEach(item => savedGallery.appendChild(item.card));
                    if (savedEmpty) savedEmpty.hidden = true; // Always show the gallery if we have the Create card
                    if (window.lucide) window.lucide.createIcons();
                    initGalleryNav(savedGalleryNav, savedGallery);
                })().finally(() => {
                    refreshSavedPromise = null;
                });
                return refreshSavedPromise;
            }

            function normalizeSpaceId(value) {
                const normalized = spacesApi?.normalizeSpaceId?.(value);
                if (normalized) return normalized;
                const raw = String(value || "").trim().toLowerCase();
                return raw || "golive";
            }

            function getSpaces() {
                const spaces = spacesApi?.readSpaces?.();
                if (Array.isArray(spaces) && spaces.length) return spaces;
                return [{ id: "golive", name: "Go Live", icon: "cloud-upload", isDefault: true }];
            }

            function createSharedSpaceSection(space) {
                const section = document.createElement("section");
                section.className = "space-section";
                const navId = `spaceGalleryNav_${space.id}`;
                const galleryId = `spaceGallery_${space.id}`;
                section.innerHTML = `
                    <div class="section-title-row">
                        <p class="section-label nexus-label label-link">
                            <i data-lucide="${space.icon || "cloud-upload"}" style="width:14px;height:14px;margin-right:4px;"></i>${space.name || "Espace"}
                        </p>
                    </div>
                    <div class="gallery-nav" id="${navId}">
                        <button class="gallery-nav__btn gallery-nav__prev" type="button" aria-label="Précédent">
                            <i data-lucide="chevron-left"></i>
                        </button>
                        <div id="${galleryId}" class="share-gallery space-gallery" aria-live="polite"></div>
                        <button class="gallery-nav__btn gallery-nav__next" type="button" aria-label="Suivant">
                            <i data-lucide="chevron-right"></i>
                        </button>
                    </div>
                `;
                return { section, navId, galleryId };
            }

            async function refreshGallery() {
                if (refreshGalleryPromise) {
                    return refreshGalleryPromise;
                }
                refreshGalleryPromise = (async () => {
                    if (!shareHistory) {
                        setState({ loading: false, error: "Historique indisponible." });
                        return;
                    }
                    if (!shareService?.isReady) {
                        setState({ loading: false, error: "Service de documents indisponible." });
                        return;
                    }
                    setState({ loading: true, error: "", hasPinned: false });
                    if (sharedSpacesRoot) sharedSpacesRoot.innerHTML = "";
                    if (pinnedGallery) pinnedGallery.innerHTML = "";
                    const entries = await getStoredRecords();
                    const spaces = getSpaces();
                    if (!entries.length) {
                        spaces.forEach(space => {
                            const { section, navId } = createSharedSpaceSection(space);
                            sharedSpacesRoot?.appendChild(section);
                            hideGalleryNav(document.getElementById(navId));
                        });
                        setState({ loading: false, error: "", hasPinned: false });
                        if (window.lucide) window.lucide.createIcons();
                        return;
                    }
                    const cards = await Promise.all(entries.map(({ app, record }) => buildShareCard(app, record)));
                    const validCards = cards.filter(Boolean);
                    // Build a quick set of preview keys to help deduplicate saved drafts that refer to the same content
                    try {
                        const previewKeys = new Set(validCards.map(item => {
                            const coll = item.definition.collection || String(item.definition.name || item.app);
                            const tab = item.preview?.tabName || "";
                            const lines = (item.preview?.lines || []).join("|");
                            return `${coll}::${tab}::${lines}`;
                        }));
                        window.__goToolkitSharedPreviewKeys = previewKeys;
                    } catch (e) {
                        window.__goToolkitSharedPreviewKeys = new Set();
                    }
                    if (!validCards.length) {
                        getSpaces().forEach(space => {
                            const { section, navId } = createSharedSpaceSection(space);
                            sharedSpacesRoot?.appendChild(section);
                            hideGalleryNav(document.getElementById(navId));
                        });
                        setState({ loading: false, error: "", hasPinned: false });
                        return;
                    }
                    const cardsBySpace = new Map(spaces.map(space => [normalizeSpaceId(space.id), []]));
                    validCards.forEach(item => {
                        const spaceId = normalizeSpaceId(item.record?.spaceId || "golive");
                        if (!cardsBySpace.has(spaceId)) {
                            const fallbackSpace = spacesApi?.upsertSpace?.({
                                id: spaceId,
                                name: `Espace ${spaceId.toUpperCase()}`,
                                icon: "cloud-upload",
                                spaceCode: "",
                                isDefault: spaceId === "golive"
                            }) || { id: spaceId, name: `Espace ${spaceId.toUpperCase()}`, icon: "cloud-upload" };
                            cardsBySpace.set(spaceId, []);
                            spaces.push(fallbackSpace);
                        }
                        cardsBySpace.get(spaceId).push(item);
                    });
                    const orderedSpaces = spaces
                        .slice()
                        .sort((a, b) => {
                            if (normalizeSpaceId(a.id) === "golive") return -1;
                            if (normalizeSpaceId(b.id) === "golive") return 1;
                            return String(a.name || "").localeCompare(String(b.name || ""), "fr");
                        });
                    orderedSpaces.forEach(space => {
                        const key = normalizeSpaceId(space.id);
                        const entriesForSpace = (cardsBySpace.get(key) || [])
                            .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
                            .slice(0, 10);
                        const { section, navId, galleryId } = createSharedSpaceSection(space);
                        sharedSpacesRoot?.appendChild(section);
                        const galleryEl = document.getElementById(galleryId);
                        const navEl = document.getElementById(navId);
                        if (!galleryEl || !navEl || !entriesForSpace.length) {
                            hideGalleryNav(navEl);
                            return;
                        }
                        entriesForSpace.forEach(entry => galleryEl.appendChild(entry.card));
                        initGalleryNav(navEl, galleryEl);
                    });
                    setState({ loading: false, hasPinned: false, error: "" });
                    if (window.lucide) window.lucide.createIcons();
                })().finally(() => {
                    refreshGalleryPromise = null;
                });
                return refreshGalleryPromise;
            }

            refreshBtn?.addEventListener("click", () => {
                (async () => {
                    try {
                        await shareHistory?.refreshFromStore?.();
                    } catch (err) {
                        console.warn("Impossible de rafraîchir les documents partagés", err);
                    }
                    refreshGallery().catch(() => { /* noop */ });
                    refreshSavedGallery().catch(() => { /* noop */ });
                })();
            });

            (async () => {
                try {
                    await shareHistory?.refreshFromStore?.();
                } catch (err) {
                    console.warn("Impossible de rafraîchir les documents partagés", err);
                }
                refreshGallery().catch(() => { /* noop */ });
                refreshSavedGallery().catch(() => { /* noop */ });
            })();
            window.addEventListener("pageshow", () => {
                refreshGallery().catch(() => { /* noop */ });
                refreshSavedGallery().catch(() => { /* noop */ });
            });
            const galleryStorageKeys = new Set([
                documentApi?.STORAGE_KEY,
                shareHistory?.STORAGE_KEY,
                spacesApi?.STORAGE_KEY
            ].filter(Boolean));
            window.addEventListener("storage", event => {
                if (!event.key || !galleryStorageKeys.has(event.key)) return;
                refreshGallery().catch(() => { /* noop */ });
                refreshSavedGallery().catch(() => { /* noop */ });
            });
        })();
