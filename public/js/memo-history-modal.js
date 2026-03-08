(function () {
    function ensureStyles() {
        if (document.getElementById("memo-history-modal-styles")) return;
        const style = document.createElement("style");
        style.id = "memo-history-modal-styles";
        style.textContent = `
            #memo-history-overlay{position:fixed;inset:0;background:rgba(15,23,42,.46);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;z-index:100000}
            #memo-history-overlay.open{display:flex}
            #memo-history-modal{width:98vw;height:98vh;min-width:98vw;min-height:98vh;background:var(--bg-surface,#fff);color:var(--text-main,#111);border:1px solid var(--border-main,#ddd);border-radius:20px;box-shadow:var(--shadow-lg,0 20px 60px rgba(0,0,0,.18));display:grid;grid-template-rows:auto 1fr}
            .memo-history-header{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border-main,#ddd);min-height:0}
            .memo-history-title{font-size:.95rem;font-weight:700;line-height:1.2}
            .memo-history-spacer{flex:1}
            .memo-history-close,.memo-history-action{border:1px solid var(--border-main,#ddd);background:var(--bg-surface-soft,#f7f7f7);color:var(--text-main,#111);border-radius:12px;padding:10px 14px;cursor:pointer}
            .memo-history-close{padding:4px;background:transparent;border:none;box-shadow:none;display:inline-flex;align-items:center;justify-content:center}
            .memo-history-body{display:grid;grid-template-columns:minmax(280px,360px) 1fr;min-height:0}
            .memo-history-list{border-right:1px solid var(--border-main,#ddd);overflow:auto;padding:12px}
            .memo-history-list__actions{display:flex;gap:8px;position:sticky;top:0;background:var(--bg-surface,#fff);padding:2px 0 12px;z-index:1}
            .memo-history-action{display:inline-flex;align-items:center;gap:8px}
            .memo-history-item{width:100%;text-align:left;border:1px solid var(--border-main,#ddd);background:var(--bg-surface,#fff);border-radius:14px;padding:12px;margin-bottom:10px;cursor:pointer}
            .memo-history-item.is-active{border-color:var(--color-primary,#2563eb);box-shadow:0 0 0 1px var(--color-primary,#2563eb) inset}
            .memo-history-item__top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
            .memo-history-item__time{font-size:.82rem;color:var(--text-muted,#666)}
            .memo-history-item__scope{font-size:.74rem;padding:2px 8px;border-radius:999px;background:var(--bg-surface-soft,#f3f4f6)}
            .memo-history-item__title{font-weight:600;margin-bottom:6px}
            .memo-history-preview{display:grid;grid-template-rows:1fr;min-height:0}
            .memo-history-preview__content{padding:0;overflow:auto;min-height:0;width:100%;height:100%}
            .memo-history-preview__text{width:100%;height:100%;min-height:100%;overflow:auto;border:none;border-radius:0;background:transparent;padding:0;font:400 16px/1.65 Georgia,"Times New Roman",serif;color:var(--text-main,#111);white-space:pre-wrap;word-break:break-word;box-sizing:border-box}
            .memo-history-preview__text h1,.memo-history-preview__text h2,.memo-history-preview__text h3{font-family:inherit;line-height:1.2;margin:0 0 .7em}
            .memo-history-preview__text p,.memo-history-preview__text ul,.memo-history-preview__text ol,.memo-history-preview__text blockquote,.memo-history-preview__text pre{margin:0 0 1em}
            .memo-history-preview__text code,.memo-history-preview__text pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
            .memo-history-empty{padding:24px;color:var(--text-muted,#666)}
            @media (max-width: 900px){#memo-history-modal{width:100vw;height:100vh;min-width:100vw;min-height:100vh;border-radius:0}.memo-history-body{grid-template-columns:1fr}.memo-history-list{max-height:34vh;border-right:none;border-bottom:1px solid var(--border-main,#ddd)}}
        `;
        document.head.appendChild(style);
    }

    function ensureDom() {
        if (document.getElementById("memo-history-overlay")) return;
        const overlay = document.createElement("div");
        overlay.id = "memo-history-overlay";
        overlay.innerHTML = `
            <div id="memo-history-modal" role="dialog" aria-modal="true" aria-label="Historique du document">
                <div class="memo-history-header">
                    <div id="memo-history-title" class="memo-history-title">Historique</div>
                    <div class="memo-history-spacer"></div>
                    <button id="memo-history-close" type="button" class="memo-history-close" aria-label="Fermer"><i data-lucide="x"></i></button>
                </div>
                <div class="memo-history-body">
                    <div id="memo-history-list" class="memo-history-list">
                        <div class="memo-history-list__actions">
                            <button id="memo-history-duplicate" type="button" class="memo-history-action"><i data-lucide="copy"></i><span>Dupliquer</span></button>
                            <button id="memo-history-restore" type="button" class="memo-history-action"><i data-lucide="history"></i><span>Restaurer</span></button>
                        </div>
                    </div>
                    <div class="memo-history-preview">
                        <div class="memo-history-preview__content">
                            <div id="memo-history-preview-text" class="memo-history-preview__text"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function formatDate(iso) {
        try {
            return new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short"
            }).format(new Date(iso));
        } catch (err) {
            return String(iso || "");
        }
    }

    function getPreviewText(version) {
        const payload = version?.payload || {};
        const firstTab = Array.isArray(payload?.tabs) ? payload.tabs[0] : null;
        const html = String(firstTab?.content || "").trim();
        return html
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    let versions = [];
    let selectedVersionId = "";

    function getSelectedVersion() {
        return versions.find(item => String(item?.versionId || "") === selectedVersionId) || versions[0] || null;
    }

    function renderPreview() {
        const version = getSelectedVersion();
        const text = document.getElementById("memo-history-preview-text");
        const restoreBtn = document.getElementById("memo-history-restore");
        const duplicateBtn = document.getElementById("memo-history-duplicate");
        if (!text || !restoreBtn || !duplicateBtn) return;
        if (!version) {
            text.innerHTML = `<p>Aucune version disponible.</p>`;
            restoreBtn.disabled = true;
            duplicateBtn.disabled = true;
            return;
        }
        text.innerHTML = String(version?.payload?.tabs?.[0]?.content || "").trim() || `<p>${getPreviewText(version)}</p>`;
        restoreBtn.disabled = false;
        duplicateBtn.disabled = false;
    }

    function renderList() {
        const list = document.getElementById("memo-history-list");
        if (!list) return;
        const actionsMarkup = `
            <div class="memo-history-list__actions">
                <button id="memo-history-duplicate" type="button" class="memo-history-action"><i data-lucide="copy"></i><span>Dupliquer</span></button>
                <button id="memo-history-restore" type="button" class="memo-history-action"><i data-lucide="history"></i><span>Restaurer</span></button>
            </div>
        `;
        if (!versions.length) {
            list.innerHTML = actionsMarkup + `<div class="memo-history-empty">Aucune version enregistrée.</div>`;
            if (window.lucide) window.lucide.createIcons();
            renderPreview();
            return;
        }
        list.innerHTML = actionsMarkup;
        versions.forEach((version) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "memo-history-item" + (String(version?.versionId || "") === selectedVersionId ? " is-active" : "");
            button.innerHTML = `
                <div class="memo-history-item__top">
                    <span class="memo-history-item__time">${formatDate(version?.createdAt)}</span>
                    <span class="memo-history-item__scope">${String(version?.storage || version?.scope || "local").trim()}</span>
                </div>
                <div class="memo-history-item__title">${String(version?.title || "Version").trim() || "Version"}</div>
            `;
            button.addEventListener("click", () => {
                selectedVersionId = String(version?.versionId || "");
                renderList();
            });
            list.appendChild(button);
        });
        if (window.lucide) window.lucide.createIcons();
        renderPreview();
    }

    async function refreshModal() {
        const api = window.GoToolkitMemoHistoryApi;
        const docId = String(window.__memoActiveDocumentId || "").trim();
        const title = document.getElementById("memo-history-title");
        const pageTitleInput = document.getElementById("memoPageTitleInput");
        const pageName = String(pageTitleInput?.value || document.title || "").trim();
        if (title) {
            title.textContent = pageName ? `Historique (${pageName})` : "Historique";
        }
        versions = api?.listVersions ? await api.listVersions(docId) : [];
        selectedVersionId = String(versions[0]?.versionId || "");
        renderList();
    }

    function closeModal() {
        document.getElementById("memo-history-overlay")?.classList.remove("open");
    }

    async function openModal() {
        ensureStyles();
        ensureDom();
        await refreshModal();
        document.getElementById("memo-history-overlay")?.classList.add("open");
    }

    document.addEventListener("click", (event) => {
        const overlay = document.getElementById("memo-history-overlay");
        if (!overlay || !overlay.classList.contains("open")) return;
        if (event.target === overlay) {
            closeModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeModal();
        }
    });

    document.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("#memo-history-close")) {
            closeModal();
            return;
        }
        if (target.closest("#memo-history-restore")) {
            const version = getSelectedVersion();
            if (!version) return;
            await window.GoToolkitMemoHistoryApi?.restoreVersion?.(version);
            await refreshModal();
            closeModal();
            return;
        }
        if (target.closest("#memo-history-duplicate")) {
            const version = getSelectedVersion();
            if (!version) return;
            await window.GoToolkitMemoHistoryApi?.duplicateVersionAsNew?.(version);
            closeModal();
        }
    });

    window.openMemoHistoryModal = openModal;
})();
