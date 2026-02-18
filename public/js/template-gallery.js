(function () {
    const TEMPLATES_COLLECTION = "template-memos";
    const TEMPLATE_SYNC_PERIOD = 24 * 60 * 60 * 1000; // 24h
    let cloudTemplates = [];
    let superpowersMap = [];
    let selectedOwnerToken = "";
    let hasInitializedOwnerFilter = false;
    let selectedSuperpowerIds = [];

    const ownerTokenFilters = document.getElementById("templateOwnerFilters");
    const templateSuperpowerList = document.getElementById("gtTemplateSuperpowerList");
    const templateGalleryNav = document.getElementById("templateGalleryNav");

    function initGalleryNav(wrapper, listEl, itemSelector) {
        if (!wrapper || !listEl) return;
        const prevBtn = wrapper.querySelector(".gallery-nav__prev");
        const nextBtn = wrapper.querySelector(".gallery-nav__next");
        const pageSize = 10;

        function update() {
            const items = Array.from(listEl.querySelectorAll(itemSelector));
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
    }

    function normalizeOwnerToken(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .trim();
    }

    function formatOwnerTokenLabel(token) {
        const value = String(token || "").trim();
        if (!value) return "";
        return value
            .split("-")
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    function buildOwnerTokenOrder(tokens) {
        const normalized = tokens.filter(Boolean);
        const unique = Array.from(new Set(normalized));
        const lowerMap = new Map(unique.map(token => [token.toLowerCase(), token]));
        const ordered = [];
        if (lowerMap.has("golive")) {
            ordered.push(lowerMap.get("golive"));
            lowerMap.delete("golive");
        } else {
            ordered.push("golive");
        }
        const rest = Array.from(lowerMap.values()).sort((a, b) => a.localeCompare(b, "fr"));
        ordered.push(...rest);
        return ordered;
    }

    function renderOwnerTokenFilters(templates) {
        if (!ownerTokenFilters) return;
        const counts = new Map();
        (templates || []).forEach(template => {
            const token = normalizeOwnerToken(template.ownerToken);
            if (!token) return;
            counts.set(token, (counts.get(token) || 0) + 1);
        });
        const orderedTokens = buildOwnerTokenOrder(Array.from(counts.keys()));
        if (!hasInitializedOwnerFilter) {
            if (counts.has("golive")) {
                selectedOwnerToken = "golive";
            }
            hasInitializedOwnerFilter = true;
        }

        ownerTokenFilters.innerHTML = "";
        const allFilter = document.createElement("button");
        allFilter.type = "button";
        allFilter.className = "share-card-template share-card-template--filter share-card-template--all";
        const allSelected = !selectedOwnerToken;
        allFilter.setAttribute("aria-pressed", allSelected ? "true" : "false");
        allFilter.classList.toggle("is-selected", allSelected);
        allFilter.innerHTML = `<i data-lucide="user" style="width:12px;height:12px;margin-right:6px;vertical-align:middle;"></i>Tout`;
        allFilter.addEventListener("click", () => {
            selectedOwnerToken = "";
            renderTemplateGallery(true);
        });
        ownerTokenFilters.appendChild(allFilter);
        orderedTokens.forEach(token => {
            if (!token) return;
            const count = counts.get(token) || 0;
            const filter = document.createElement("button");
            filter.type = "button";
            filter.className = "share-card-template share-card-template--filter";
            const isSelected = token === selectedOwnerToken;
            filter.setAttribute("aria-pressed", isSelected ? "true" : "false");
            filter.classList.toggle("is-selected", isSelected);
            const displayToken = formatOwnerTokenLabel(token);
            filter.innerHTML = `<i data-lucide="user" style="width:12px;height:12px;margin-right:6px;vertical-align:middle;"></i>${escapeHtml(displayToken || token)}${count ? ` (${count})` : ""}`;
            filter.addEventListener("click", () => {
                selectedOwnerToken = selectedOwnerToken === token ? "" : token;
                renderTemplateGallery(true);
            });
            ownerTokenFilters.appendChild(filter);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function renderSuperpowerFilters(templates) {
        if (!templateSuperpowerList) return;
        const stats = new Map();
        (templates || []).forEach(template => {
            const sps = template.superpowers || [];
            sps.forEach(spId => {
                const id = parseInt(spId, 10);
                if (!Number.isFinite(id)) return;
                stats.set(id, (stats.get(id) || 0) + 1);
            });
        });

        templateSuperpowerList.innerHTML = "";
        if (!superpowersMap.length) return;

        superpowersMap.forEach(sp => {
            const count = stats.get(parseInt(sp.id, 10)) || 0;
            if (!count) return;

            const spId = parseInt(sp.id, 10);
            const isChecked = selectedSuperpowerIds.includes(spId);
            const label = document.createElement("label");
            label.className = "superpower-checkbox-label";
            label.innerHTML = `
                <input type="checkbox" value="${spId}" ${isChecked ? "checked" : ""} style="display:none;">
                <span class="superpower-pill ${isChecked ? "active" : ""}">
                    <i data-lucide="${sp.icon || "zap"}" style="width:12px;height:12px;"></i>
                    ${escapeHtml(sp.title)} (${count})
                </span>
            `;
            const input = label.querySelector("input");
            input.addEventListener("change", () => {
                const value = parseInt(input.value, 10);
                if (input.checked) {
                    if (!selectedSuperpowerIds.includes(value)) {
                        selectedSuperpowerIds.push(value);
                    }
                } else {
                    selectedSuperpowerIds = selectedSuperpowerIds.filter(v => v !== value);
                }
                renderTemplateGallery();
            });
            templateSuperpowerList.appendChild(label);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function getAdminToken() {
        return normalizeOwnerToken(localStorage.getItem("feedback-admin-token") || "");
    }

    function isAdmin() {
        const token = getAdminToken();
        return token.length > 0;
    }

    async function getSuperpowers() {
        if (window._superpowersCached) return window._superpowersCached;
        try {
            const resp = await fetch('content/superpowers.json');
            if (resp.ok) {
                window._superpowersCached = await resp.json();
                return window._superpowersCached;
            }
        } catch (e) {
            console.error("Failed to load superpowers.json", e);
        }
        return [];
    }

    async function syncTemplates(force = false) {
        if (!window.goToolkitTemplateStore) return;

        const lastSync = parseInt(localStorage.getItem('last_template_sync') || '0');
        const now = Date.now();

        if (!force && lastSync && (now - lastSync < TEMPLATE_SYNC_PERIOD)) {
            cloudTemplates = await window.goToolkitTemplateStore.list();
            if (cloudTemplates && cloudTemplates.length > 0) return;
        }

        localStorage.setItem('last_template_sync', now.toString());

        try {
            const fetched = await window.goToolkitShareWorker.listShares(TEMPLATES_COLLECTION);
            const mapped = (fetched || []).map(doc => ({
                id: doc.id,
                label: doc.payload?.label || "Modèle sans titre",
                description: doc.payload?.description || "",
                category: doc.payload?.category || "",
                superpowers: doc.payload?.superpowers || [],
                html: doc.payload?.html || "",
                ownerToken: doc.payload?.ownerToken || "",
                updatedAt: doc.meta?.updatedDate || doc.meta?.updatedAt || ""
            }));
            await window.goToolkitTemplateStore.clear(); await window.goToolkitTemplateStore.saveAll(mapped);
            cloudTemplates = mapped;
        } catch (err) {
            console.warn("Failed to fetch cloud templates, falling back to local store", err);
            cloudTemplates = await window.goToolkitTemplateStore.list();
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function parseTemplateUpdatedAt(value) {
        if (!value) return 0;
        if (typeof value === "number") return value;
        const parsed = Date.parse(String(value));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatTemplateRelativeDate(value) {
        const ts = parseTemplateUpdatedAt(value);
        if (!ts) return "—";
        const deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (deltaSeconds < 60) return "Il y a <1 mn";
        const minutes = Math.floor(deltaSeconds / 60);
        if (minutes < 60) {
            return `Il y a ${minutes} mn`;
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `Il y a ${hours} h`;
        }
        const days = Math.floor(hours / 24);
        if (days < 30) {
            return `Il y a ${days} j`;
        }
        const months = Math.floor(days / 30) || 1;
        return `Il y a ${months} m`;
    }

    async function renderSuperpowerModalContent() {
        const superpowerList = document.getElementById("superpowerList");
        if (!superpowerList) return;

        superpowersMap = await getSuperpowers();

        // Preserve intro
        const intro = superpowerList.querySelector(".superpower-subtitle");
        superpowerList.innerHTML = "";
        if (intro) superpowerList.appendChild(intro);

        superpowersMap.forEach(sp => {
            const section = document.createElement("section");
            section.innerHTML = `
                <div class="superpower-head">
                    <h4><i data-lucide="${sp.icon || 'zap'}"
                            style="width:18px;height:18px;vertical-align:middle;margin-right:8px;"></i>${escapeHtml(sp.title)}</h4>
                </div>
                <div class="superpower-subtitle">${escapeHtml(sp.description)}</div>
            `;
            superpowerList.appendChild(section);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    async function renderTemplateGallery(force = false) {
        const gallery = document.getElementById("gtTemplateModalList");
        if (!gallery) return;

        gallery.innerHTML = '<div style="padding: 20px; text-align: center; grid-column: 1 / -1; opacity: 0.7;">Chargement des modèles...</div>';

        await syncTemplates(force);
        superpowersMap = await getSuperpowers();

        if (!cloudTemplates || !cloudTemplates.length) {
            gallery.innerHTML = '<div style="padding: 20px; text-align: center; grid-column: 1 / -1; opacity: 0.7;">Aucun modèle disponible.</div>';
            hideGalleryNav(templateGalleryNav);
            return;
        }

        const sorted = [...cloudTemplates].sort((a, b) => {
            return parseTemplateUpdatedAt(b.updatedAt) - parseTemplateUpdatedAt(a.updatedAt);
        });
        renderOwnerTokenFilters(sorted);
        const ownerFiltered = selectedOwnerToken
            ? sorted.filter(template => normalizeOwnerToken(template.ownerToken) === selectedOwnerToken)
            : sorted;
        renderSuperpowerFilters(ownerFiltered);
        const toShow = ownerFiltered.filter(template => {
            const matchesSuperpowers = selectedSuperpowerIds.length === 0
                || (template.superpowers && template.superpowers.some(spId => {
                    const value = parseInt(spId, 10);
                    return selectedSuperpowerIds.includes(value);
                }));
            return matchesSuperpowers;
        });
        if (!toShow.length) {
            gallery.innerHTML = '<div style="padding: 20px; text-align: center; grid-column: 1 / -1; opacity: 0.7;">Aucun modèle disponible.</div>';
            hideGalleryNav(templateGalleryNav);
            return;
        }

        gallery.innerHTML = "";
        const adminToken = getAdminToken();
        const userIsAdmin = Boolean(adminToken);

        toShow.forEach(template => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "gt-template-card";
            btn.style.width = "100%";

            let superpowersHtml = "";
            const badges = [];
            if (template.superpowers && Array.isArray(template.superpowers)) {
                template.superpowers.forEach(spId => {
                    const sp = superpowersMap.find(s => s.id == spId);
                    if (!sp) return;
                    badges.push(`<span class="share-card-template"><i data-lucide="${sp.icon || 'star'}" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>${escapeHtml(sp.title)}</span>`);
                });
            }
            if (badges.length) {
                superpowersHtml = `<div class="gt-template-card__superpowers">${badges.join("")}</div>`;
            }

            const updatedLabel = formatTemplateRelativeDate(template.updatedAt);
            const recordingIcon = template.voiceRecordingId ? `<i data-lucide="cassette-tape" style="width:14px;height:14px;margin-right:6px;vertical-align:text-bottom;opacity:0.8;"></i>` : "";
            btn.innerHTML = `
                <div class="gt-template-card__title">${recordingIcon}${escapeHtml(template.label)}</div>
                ${superpowersHtml}
                <div class="gt-template-card__meta">${escapeHtml(updatedLabel)}</div>
            `;

            const templateOwnerToken = normalizeOwnerToken(template.ownerToken);
            const canDeleteTemplate = userIsAdmin && adminToken && (adminToken === "golive" || templateOwnerToken === adminToken);

            if (canDeleteTemplate) {
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "share-card-action share-card-delete";
                deleteBtn.title = "Supprimer ce modèle";
                deleteBtn.innerHTML = `<i data-lucide="x" style="width:14px;height:14px;"></i>`;
                deleteBtn.addEventListener("click", async event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const confirmed = window.confirm(`Supprimer le modèle "${template.label}" du cloud ?`);
                    if (!confirmed) return;
                    try {
                        const ok = await window.goToolkitShareWorker.deleteSharePayload(TEMPLATES_COLLECTION, template.id);
                        if (ok) {
                            await window.goToolkitTemplateStore.delete(template.id);
                            await renderTemplateGallery(true);
                        }
                    } catch (err) {
                        console.error("Failed to delete template", err);
                        alert("Erreur lors de la suppression.");
                    }
                });
                btn.appendChild(deleteBtn);
            }

            btn.addEventListener("click", () => {
                // Open Docs with template preview
                localStorage.setItem("goToolkit.memo.templateToPreview", JSON.stringify(template));
                window.location.href = "docs.html";
            });

            gallery.appendChild(btn);
        });

        initGalleryNav(templateGalleryNav, gallery, ".gt-template-card");
        if (window.lucide) window.lucide.createIcons();
    }

    async function init() {
        // Init Superpowers Modal content
        await renderSuperpowerModalContent();

        // Init Template Gallery
        await renderTemplateGallery();

        // Refresh button
        const refreshBtn = document.getElementById("refreshTemplatesBtn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", async () => {
                const icon = refreshBtn.querySelector("i");
                if (icon) icon.classList.add("lucide-spin");
                await renderTemplateGallery(true);
                if (icon) icon.classList.remove("lucide-spin");
            });
        }
    }

    document.addEventListener("DOMContentLoaded", init);

    // Expose for external use if needed
    window.GoToolkitTemplateGallery = {
        refresh: renderTemplateGallery,
        sync: syncTemplates
    };
})();
