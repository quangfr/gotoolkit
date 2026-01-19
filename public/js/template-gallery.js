(function () {
    const TEMPLATES_COLLECTION = "template-memos";
    const TEMPLATE_SYNC_PERIOD = 24 * 60 * 60 * 1000; // 24h
    let cloudTemplates = [];
    let superpowersMap = [];

    function isAdmin() {
        const token = (localStorage.getItem("feedback-admin-token") || "").trim();
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
            return;
        }

        const sorted = [...cloudTemplates].sort((a, b) => {
            return parseTemplateUpdatedAt(b.updatedAt) - parseTemplateUpdatedAt(a.updatedAt);
        });
        const toShow = sorted;

        gallery.innerHTML = "";
        const userIsAdmin = isAdmin();

        toShow.forEach(template => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "gt-template-card";
            btn.style.width = "100%";

            let superpowersHtml = "";
            if (template.superpowers && Array.isArray(template.superpowers)) {
                const pills = template.superpowers.map(spId => {
                    const sp = superpowersMap.find(s => s.id == spId);
                    if (!sp) return "";
                    return `<span class="share-card-template"><i data-lucide="${sp.icon || 'star'}" style="width: 12px; height: 12px; margin-right: 4px; vertical-align: middle;"></i>${escapeHtml(sp.title)}</span>`;
                }).join("");
                if (pills) {
                    superpowersHtml = `<div class="gt-template-card__superpowers">${pills}</div>`;
                }
            }

            const updatedLabel = formatTemplateRelativeDate(template.updatedAt);
            btn.innerHTML = `
                <div class="gt-template-card__title">${escapeHtml(template.label)}</div>
                ${superpowersHtml}
                <div class="gt-template-card__desc">${escapeHtml(template.description || "")}</div>
                <div class="gt-template-card__meta">${escapeHtml(updatedLabel)}</div>
            `;

            if (userIsAdmin) {
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
                // Open Mémo with this template
                localStorage.setItem("goToolkit.memo.templateToLoad", JSON.stringify(template));
                // We use target="memo" to avoid opening multiple tabs if already open, 
                // but window.location.href changes the CURRENT tab.
                // To keep the user on index.html but open/focus memo, we should use window.open
                window.open("memo.html", "memo");
            });

            gallery.appendChild(btn);
        });

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
