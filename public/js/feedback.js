(function () {
    "use strict";
    const config = window.GoToolkitAppFeedbackConfig;
    if (!config || !config.appId) {
        return;
    }

    const APP_ID = String(config.appId || "app").replace(/[^a-z0-9_-]/gi, "-");
    const prefix = `feedback-app-${APP_ID}`;
    const types = config.types || [
        { value: "bug-general", label: "Bug Général" },
        { value: "bug-assist", label: "Bug Assist" },
        { value: "bug-canvas", label: "Bug Canvas" },
        { value: "bug-draw", label: "Bug Draw" },
        { value: "bug-grid", label: "Bug Grid" },
        { value: "bug-timeline", label: "Bug Timeline" },
        { value: "bug-voice", label: "Bug Voice" },
        { value: "suggestion", label: "Suggestion" }
    ];

    const container = document.createElement("div");
    container.innerHTML = `
        <div class="feedback-app-launcher-row">
            <button id="${prefix}-openBtn" class="${prefix}-open-btn feedback-app-button" type="button" title="Envoyer un feedback">☄</button>
        </div>
        <div id="${prefix}-backdrop" class="${prefix}-backdrop feedback-app-backdrop" aria-hidden="true" role="dialog">
            <div class="${prefix}-dialog feedback-app-dialog">
                <header>
                    <h3>☄ Feedback · ${config.appName || "Go-Toolkit"}</h3>
                    <button id="${prefix}-closeBtn" class="btn-secondary feedback-app-close-btn" type="button" aria-label="Fermer">✕</button>
                </header>
                <form id="${prefix}-form" class="${prefix}-form feedback-app-form">
                    <label class="feedback-app-label">
                        <span>Nom</span>
                        <input id="${prefix}-name" name="name" type="text" placeholder="Ton nom" required class="feedback-app-input" />
                    </label>
                    <label class="feedback-app-label">
                        <span>Type <span aria-hidden="true">*</span></span>
                        <select id="${prefix}-type" name="type" required class="feedback-app-input">
                            ${types.map(option => `<option value="${option.value}">${option.label}</option>`).join("")}
                        </select>
                    </label>
                    <label class="feedback-app-label">
                        <span>Sujet <span aria-hidden="true">*</span></span>
                        <input id="${prefix}-subject" name="subject" type="text" placeholder="Titre de la demande" required class="feedback-app-input"  />
                    </label>
                    <label class="feedback-app-label">
                        <span>Message <span aria-hidden="true">*</span></span>
                        <textarea id="${prefix}-message" name="message" required placeholder="Décris ton retour" class="feedback-app-textarea"></textarea>
                        <p class="feedback-app-helper">Message susceptible d’être consulté par tous. Évite toute information personnelle ou confidentielle.</p>
                    </label>
                    <div class="${prefix}-share-row feedback-app-share-row">
                        <label class="feedback-app-share-checkbox">
                            <input id="${prefix}-shareCheckbox" type="checkbox" />
                            Partager le document
                        </label>
                    </div>
                    <div id="${prefix}-shareInfo" class="${prefix}-share-info feedback-app-share-info" hidden>
                        <p class="feedback-app-helper">${config.shareWarning || "Lien partagé dans le feedback : "}</p>
                        <a id="${prefix}-shareLink" class="feedback-app-share-link" rel="noreferrer noopener" target="_blank"></a>
                    </div>
                    <div class="${prefix}-actions feedback-app-actions">
                        <button type="button" class="btn btn-secondary feedback-app-cgu-btn" data-open-nexus-modal>Mentions légales</button>
                        <button type="button" id="${prefix}-cancelBtn" class="btn btn-secondary">Annuler</button>
                        <button type="submit" class="btn btn-primary">Envoyer</button>
                    </div>
                    <input type="hidden" id="${prefix}-shareUrl" name="shareUrl" />
                </form>
            </div>
        </div>
        <div id="${prefix}-toast" class="${prefix}-toast feedback-app-toast" role="status" aria-live="polite"></div>
    `;
    document.body.appendChild(container);

    const openBtn = document.getElementById(`${prefix}-openBtn`);
    const backdrop = document.getElementById(`${prefix}-backdrop`);
    const closeBtn = document.getElementById(`${prefix}-closeBtn`);
    const cancelBtn = document.getElementById(`${prefix}-cancelBtn`);
    const form = document.getElementById(`${prefix}-form`);
    const toast = document.getElementById(`${prefix}-toast`);
    const typeField = document.getElementById(`${prefix}-type`);
    const messageField = document.getElementById(`${prefix}-message`);
    const nameField = document.getElementById(`${prefix}-name`);
    const subjectField = document.getElementById(`${prefix}-subject`);
    const shareCheckbox = document.getElementById(`${prefix}-shareCheckbox`);
    const shareInfo = document.getElementById(`${prefix}-shareInfo`);
    const shareLink = document.getElementById(`${prefix}-shareLink`);
    const shareUrlInput = document.getElementById(`${prefix}-shareUrl`);
    const shareStatusText = document.createElement("span");
    shareStatusText.className = "feedback-app-helper";
    shareStatusText.style.display = "block";
    shareStatusText.style.marginTop = "4px";
    if (shareInfo) {
        shareInfo.appendChild(shareStatusText);
    }

    const messagePlaceholders = {
        bug: "Décris le bug (étapes pour reproduire, résultat attendu vs observé).",
        suggestion: "Décris la suggestion, le contexte et l’impact souhaité."
    };

    function showToast(text, error = false) {
        if (!toast) return;
        toast.textContent = text;
        toast.style.background = error ? "rgba(176, 0, 32, 0.95)" : "rgba(15, 23, 42, 0.95)";
        toast.classList.add("show");
        setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    }

    function updatePlaceholder(type) {
        const normalized = type && type.toLowerCase().startsWith("bug") ? "bug" : type;
        const placeholder = messagePlaceholders[normalized] || messagePlaceholders.bug;
        if (messageField) {
            messageField.placeholder = placeholder;
        }
    }

    updatePlaceholder(typeField?.value || config.defaultType || "bug");

    typeField?.addEventListener("change", event => {
        updatePlaceholder(event.target.value);
    });

    function openModal() {
        backdrop?.classList.add("open");
        backdrop?.setAttribute("aria-hidden", "false");
        messageField?.focus();
    }

    function closeModal() {
        backdrop?.classList.remove("open");
        backdrop?.setAttribute("aria-hidden", "true");
    }

    openBtn?.addEventListener("click", openModal);
    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", event => {
        if (event.target === backdrop) {
            closeModal();
        }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeModal();
        }
    });

    let sharePromise = null;
    async function createShareLink() {
        if (!config.shareCollection) {
            throw new Error("Collection de partage inconnue.");
        }
        const shareWorker = window.goToolkitShareWorker;
        if (!shareWorker?.isReady) {
            throw new Error("Service de partage indisponible.");
        }
        const token = crypto.randomUUID ? crypto.randomUUID() : `fb-${Date.now()}`;
        const payload = await (config.buildSharePayload ? config.buildSharePayload() : {});
        const shareBase = shareWorker.baseUrl.replace(/\/+$/, "");
        const shareNamespace = shareWorker.version || "v1";
        await shareWorker.saveSharePayload(config.shareCollection, token, payload);
        return `${shareBase}/${shareNamespace}/shares/${config.shareCollection}/${encodeURIComponent(token)}`;
    }

    async function handleShareToggle() {
        if (!shareCheckbox?.checked) {
            shareInfo?.setAttribute("hidden", "true");
            shareLink.textContent = "";
            shareLink.removeAttribute("href");
            shareUrlInput.value = "";
            shareStatusText.textContent = "";
            sharePromise = null;
            return;
        }
        if (sharePromise) {
            return;
        }
        sharePromise = (async () => {
            shareInfo?.removeAttribute("hidden");
            shareStatusText.textContent = "Génération du lien...";
            try {
                const url = await createShareLink();
                shareLink.textContent = url;
                shareLink.href = url;
                shareUrlInput.value = url;
            } catch (err) {
                shareStatusText.textContent = err.message || "Impossible de générer le lien.";
                shareCheckbox.checked = false;
                shareInfo?.setAttribute("hidden", "true");
                shareUrlInput.value = "";
                sharePromise = null;
                throw err;
            } finally {
                sharePromise = null;
            }
        })();
    }

    shareCheckbox?.addEventListener("change", () => {
        if (shareCheckbox.checked) {
            handleShareToggle().catch(() => { /* noop */ });
        } else {
            handleShareToggle();
        }
    });

    async function submitFeedback(event) {
        event.preventDefault();
        const endpoint = (window.GO_TOOLKIT_FEEDBACK_API_URL || "https://feedback.gotoolkit.workers.dev/v1/feedback") + "";
        if (!form?.checkValidity()) {
            form?.reportValidity();
            return;
        }
        const payload = {
            name: nameField?.value?.trim() || null,
            type: typeField?.value || "bug-general",
            subject: subjectField?.value?.trim() || null,
            message: messageField?.value?.trim(),
            page: config.appId,
            shareUrl: shareUrlInput?.value?.trim() || ""
        };
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(text || "Échec de l'envoi");
            }
            showToast("Feedback envoyé. Merci !", false);
            form.reset();
            hideShareInfo();
            closeModal();
        } catch (err) {
            console.error("Feedback send error", err);
            showToast("Impossible d'envoyer le feedback.", true);
        }
    }

    function hideShareInfo() {
        shareInfo?.setAttribute("hidden", "true");
        shareLink.textContent = "";
        shareLink.removeAttribute("href");
        shareUrlInput.value = "";
        shareStatusText.textContent = "";
        shareCheckbox.checked = false;
    }

    form?.addEventListener("submit", submitFeedback);
    requestAnimationFrame(() => {
        if (config.defaultType && typeField) {
            typeField.value = config.defaultType;
            updatePlaceholder(config.defaultType);
        }
    });
})();
