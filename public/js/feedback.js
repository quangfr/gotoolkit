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

    const launcherRow = document.createElement("div");
    launcherRow.className = "feedback-app-launcher-row";

    const inlineContainer = document.getElementById(`${prefix}-inline-container`);
    if (inlineContainer) {
        launcherRow.innerHTML = `
            <button id="${prefix}-openBtn" class="${prefix}-open-btn secondary" type="button" title="Envoyer un feedback" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px;">
                <i data-lucide="message-square-plus" style="width: 16px; height: 16px;"></i> Feedback
            </button>
        `;
        launcherRow.style.flex = "1";
        launcherRow.style.display = "flex";
    } else {
        launcherRow.innerHTML = `
            <button id="${prefix}-openBtn" class="${prefix}-open-btn feedback-app-button btn btn-secondary app-header-btn" type="button" title="Envoyer un feedback"><i data-lucide="message-square-plus"></i></button>
        `;
    }

    const container = document.createElement("div");
    container.innerHTML = `
        <div id="${prefix}-backdrop" class="${prefix}-backdrop feedback-app-backdrop" aria-hidden="true" role="dialog">
            <div class="${prefix}-dialog feedback-app-dialog">
                <header>
                    <h3><i data-lucide="message-square-plus"></i> Feedback · ${config.appName || "GoToolkit"}</h3>
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
                    <label class="feedback-app-label">
                        <span>Médias (images/vidéos)</span>
                        <input id="${prefix}-media" type="file" accept="image/*,video/*" multiple class="feedback-app-input" />
                        <p class="feedback-app-helper">Jusqu'à 6 fichiers, 100 Mo max par fichier.</p>
                    </label>
                    <div id="${prefix}-mediaList" class="feedback-app-media-list" hidden></div>
                    <div class="${prefix}-actions feedback-app-actions">
                        <button type="button" class="btn btn-secondary feedback-app-cgu-btn" data-open-nexus-modal>Mentions légales</button>
                        <button type="button" id="${prefix}-cancelBtn" class="btn btn-secondary">Annuler</button>
                        <button type="submit" class="btn btn-primary">Envoyer</button>
                    </div>
                </form>
            </div>
        </div>
        <div id="${prefix}-toast" class="${prefix}-toast feedback-app-toast" role="status" aria-live="polite"></div>
    `;
    if (inlineContainer) {
        launcherRow.classList.add("feedback-app-launcher-row--inline");
        inlineContainer.appendChild(launcherRow);
    } else {
        const globalActions = document.querySelector(".global-actions");
        if (globalActions) {
            launcherRow.classList.add("feedback-app-launcher-row--inline");
            const assistBtn = document.getElementById("assistLauncherBtn");
            if (assistBtn && assistBtn.parentNode === globalActions) {
                globalActions.insertBefore(launcherRow, assistBtn);
            } else {
                globalActions.appendChild(launcherRow);
            }
        } else {
            document.body.appendChild(launcherRow);
        }
    }
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
    const mediaField = document.getElementById(`${prefix}-media`);
    const mediaList = document.getElementById(`${prefix}-mediaList`);

    const messagePlaceholders = {
        bug: "Décris le bug (étapes pour reproduire, résultat attendu vs observé).",
        suggestion: "Décris la suggestion, le contexte et l’impact souhaité."
    };
    const MAX_MEDIA_FILES = 6;
    const MAX_MEDIA_FILE_SIZE = 100 * 1024 * 1024;
    const selectedMedia = [];

    function isSupportedMediaFile(file) {
        const mime = String(file?.type || "").toLowerCase();
        return mime.startsWith("image/") || mime.startsWith("video/");
    }

    function formatSize(size) {
        const value = Number(size) || 0;
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
        return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
            reader.readAsDataURL(file);
        });
    }

    function renderMediaList() {
        if (!mediaList) return;
        mediaList.innerHTML = "";
        if (!selectedMedia.length) {
            mediaList.setAttribute("hidden", "true");
            return;
        }
        mediaList.removeAttribute("hidden");
        selectedMedia.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "feedback-app-media-item";
            const label = document.createElement("span");
            label.className = "feedback-app-media-item-label";
            label.textContent = `${item.fileName} (${formatSize(item.size)})`;
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "btn btn-secondary feedback-app-media-remove";
            removeBtn.textContent = "Retirer";
            removeBtn.addEventListener("click", () => {
                selectedMedia.splice(index, 1);
                renderMediaList();
            });
            row.appendChild(label);
            row.appendChild(removeBtn);
            mediaList.appendChild(row);
        });
    }

    function showToast(text, error = false) {
        if (!toast) return;
        toast.textContent = text;
        toast.style.background = error ? "var(--intent-error-border)" : "var(--bg-surface)";
        toast.classList.add("show");
        setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    }

    async function handleMediaSelection(event) {
        const files = Array.from(event?.target?.files || []);
        if (!files.length) return;
        for (const file of files) {
            if (selectedMedia.length >= MAX_MEDIA_FILES) {
                showToast(`Maximum ${MAX_MEDIA_FILES} fichiers`, true);
                break;
            }
            if (!isSupportedMediaFile(file)) {
                showToast(`Type non supporté: ${file.name}`, true);
                continue;
            }
            if (file.size > MAX_MEDIA_FILE_SIZE) {
                showToast(`${file.name} dépasse 100 Mo`, true);
                continue;
            }
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const commaIndex = dataUrl.indexOf(",");
                const contentBase64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "";
                selectedMedia.push({
                    fileName: file.name || "fichier",
                    mimeType: file.type || "application/octet-stream",
                    contentBase64,
                    size: file.size || 0
                });
            } catch (err) {
                console.error("Media read error", err);
                showToast(`Impossible de lire ${file.name}`, true);
            }
        }
        if (mediaField) mediaField.value = "";
        renderMediaList();
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
        if (window.lucide) lucide.createIcons();
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
            media: selectedMedia.map(item => ({
                fileName: item.fileName,
                mimeType: item.mimeType,
                contentBase64: item.contentBase64
            }))
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
            selectedMedia.length = 0;
            renderMediaList();
            closeModal();
        } catch (err) {
            console.error("Feedback send error", err);
            showToast("Impossible d'envoyer le feedback.", true);
        }
    }

    form?.addEventListener("submit", submitFeedback);
    mediaField?.addEventListener("change", handleMediaSelection);
    requestAnimationFrame(() => {
        if (config.defaultType && typeField) {
            typeField.value = config.defaultType;
            updatePlaceholder(config.defaultType);
        }
    });
})();
