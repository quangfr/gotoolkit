; (function (global) {
    const doc = global.document;
    if (!doc) return;
    const ENABLE_AI_SERVICES_TAB = false;
    const SETTINGS_HELP = Object.freeze({
        assemblyAi: "Utilisation : transcription des enregistrements.\nPolitique actuelle : environ 50 $ de crédits gratuits, puis 0,15 $/h.",
        googleTts: "Utilisation : téléchargement audio d'un fichier et lecture audio dans mobile.html.\nGratuit estimé : Neural2 + WaveNet + Studio + Chirp HD ~60 h/mois puis Standard + Wavenet ~120 h/mois ;\nAprès gratuité : Standard ~0,23 $/h ; Neural2 et WaveNet ~0,91 $/h ; Chirp 3 HD ~1,71 $/h ; Studio ~9,14 $/h.\n",
        openRouterModel: "Utilisation : chat Assist.\nOrdre de grandeur : ~100 à 500 requêtes par euro sur des échanges courts à moyens, selon le modèle et la taille des prompts.",
        openRouterOcr: "Utilisation : importeur d'images et images à l'intérieur des documents.\nOrdre de grandeur : ~0,01 à 0,03 €/image selon la résolution et la quantité de texte.",
        openRouterEmbeddings: "Utilisation : indexation RAG et recherche sémantique des documents.\nOrdre de grandeur : ~0,001 à 0,003 €/MB de texte selon le volume réellement vectorisé.",
        notionIntegration: "Publier le document dans une page",
        youtubeIntegration: "Publier un enregistrement comme vidéo sur sa chaîne Youtube",
        gmailIntegration: "Envoyer le document comme email HTML depuis sa messagerie Gmail",
        voicePlaybackSpeed: "Vitesse de lecture par défaut d'un enregistrement vidéo",
        voiceScreenCaptureQuality: "Qualité de l'enregistrement vidéo WebM. Baisser dans le cas où le rendu n'est pas fluide"
    });
    const SHARED_SETTINGS_MODAL_HTML = `
        <div class="modal settings-modal" style="max-height: 98vh; overflow-y: auto; display: flex; flex-direction: column; max-width: 640px; width: min(640px, 94vw); min-width: min(100vw, 520px); min-height: min(100vh, 720px); padding: 12px; margin-right: -8px;">
            <header style="flex-shrink: 0;">
                <h3><i data-lucide="settings" style="width:20px;height:20px;vertical-align:middle;margin-right:8px;"></i>Paramètres</h3>
                <button id="closeSettingsBtn" class="btn-secondary" type="button" aria-label="Fermer"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
            </header>
            <form class="feedback-form" onsubmit="return false;" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding-right: 8px; margin-right: -8px;">
                <div class="settings-tabs tabs">
                    <button type="button" class="tab-btn" data-tab="paramsTab"><i data-lucide="palette" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Personnalisation</button>
                    <button type="button" class="tab-btn" data-tab="categoryTab"><i data-lucide="tag" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Catégorie</button>
                    <button type="button" class="tab-btn" data-tab="integrationsTab"><i data-lucide="plug-zap" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Intégrations</button>
                    <button type="button" class="tab-btn" data-tab="promptTab"><i data-lucide="bot" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Assistant</button>
                    ${ENABLE_AI_SERVICES_TAB ? `<button type="button" class="tab-btn" data-tab="servicesTab"><i data-lucide="cpu" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Services IA</button>` : ""}
                </div>
                <div class="settings-tab-panels-wrapper" style="flex: 1; overflow-y: auto; padding-right: 8px; margin-right: -8px;">
                    <div class="settings-tab-panel" data-panel="servicesTab" ${ENABLE_AI_SERVICES_TAB ? "" : "hidden"}>
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                                    <div class="settings-label-row">
                                        <a class="label-title dashed-link" href="https://www.assemblyai.com/dashboard/api-keys" target="_blank" rel="noopener noreferrer">Clé AssemblyAI</a>
                                        <button class="settings-help-btn" type="button" data-help-key="assemblyAi" aria-label="Aide Clé AssemblyAI">
                                            <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                        </button>
                                        <span class="ia-status" id="assemblyAiStatus" aria-hidden="true"></span>
                                    </div>
                                    <div style="display:flex; gap:0.35rem;">
                                        <button id="assemblyAiVerifyBtn" type="button" class="btn-secondary">Vérifier</button>
                                    </div>
                                </div>
                                <input id="assemblyAiKeyInput" type="text" placeholder="sk-..." />
                            </label>
                        </div>
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                                    <div class="settings-label-row">
                                        <a class="label-title dashed-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Clé Google TTS</a>
                                        <button class="settings-help-btn" type="button" data-help-key="googleTts" aria-label="Aide Clé Google TTS">
                                            <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                        </button>
                                        <span class="ia-status" id="googleTtsStatus" aria-hidden="true"></span>
                                    </div>
                                    <div style="display:flex; gap:0.35rem;">
                                        <button id="googleTtsVerifyBtn" type="button" class="btn-secondary">Vérifier</button>
                                    </div>
                                </div>
                                <input id="googleTtsApiKeyInput" type="text" placeholder="AIza..." />
                            </label>
                        </div>
                        <div id="openrouterSettings">
                            <div class="field-row">
                                <label style="width:100%">
                                    <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                                        <div>
                                            <a class="label-title" href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">Clé OpenRouter</a>
                                            <span class="ia-status" id="openrouterStatus" aria-hidden="true"></span>
                                            <span class="ia-model-label" id="openrouterModelLabel" aria-live="polite"></span><br>
                                        </div>
                                        <div style="display:flex; gap:0.35rem;">
                                            <button id="openrouterVerifyBtn" type="button" class="btn-secondary">Vérifier</button>
                                        </div>
                                    </div>
                                    <input id="openrouterApiKeyInput" type="text" placeholder="or-..." />
                                </label>
                            </div>
                            <div class="field-row" id="openrouterOcrModelRow">
                                <label style="width:100%">
                                    <span class="settings-label-row">
                                        <span class="label-title">Modèle OCR</span>
                                        <button class="settings-help-btn" type="button" data-help-key="openRouterOcr" aria-label="Aide Modèle OCR">
                                            <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                        </button>
                                    </span>
                                    <input id="openrouterOcrModelInput" type="text" placeholder="nvidia/nemotron-nano-12b-v2-vl" />
                                </label>
                            </div>
                            <div class="field-row">
                                <label style="width:100%">
                                    <span class="settings-label-row">
                                        <span class="label-title">Modèle Embeddings</span>
                                        <button class="settings-help-btn" type="button" data-help-key="openRouterEmbeddings" aria-label="Aide Modèle Embeddings">
                                            <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                        </button>
                                    </span>
                                    <input id="openrouterEmbeddingsModelInput" type="text" placeholder="qwen/qwen3-embedding-8b" />
                                </label>
                            </div>
                            <div id="openrouterExtras" style="display:none; margin-top:8px;">
                                <div class="field-row">
                                    <label>
                                        <span class="label-title">Collecte et rétention des données</span>
                                        <select id="openrouterDataCollectionSelect">
                                            <option value="deny-zdr">Non</option>
                                            <option value="allow">Oui</option>
                                        </select>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="settings-tab-panel" data-panel="paramsTab">
                        <div class="field-row">
                            <label style="width:100%">
                                <span class="label-title">Thème</span>
                                <select id="themeSelectMemo">
                                    <option value="cream">Clair</option>
                                    <option value="dark">Sombre</option>
                                    <option value="auto" selected>Auto</option>
                                </select>
                            </label>
                        </div>
                        <div class="field-row">
                            <label style="width:100%">
                                <span class="label-title">Taille</span>
                                <select id="uiFontSizeSelect">
                                    <option value="12">12px</option>
                                    <option value="13">13px</option>
                                    <option value="14">14px</option>
                                    <option value="15">15px</option>
                                    <option value="16" selected>16px</option>
                                    <option value="17">17px</option>
                                    <option value="18">18px</option>
                                    <option value="19">19px</option>
                                    <option value="20">20px</option>
                                </select>
                            </label>
                        </div>
                        <div class="field-row">
                            <label style="width:100%">
                                <span class="settings-label-row">
                                    <span class="label-title">Vitesse de lecture</span>
                                    <button class="settings-help-btn" type="button" data-help-key="voicePlaybackSpeed" aria-label="Aide Vitesse de lecture">
                                        <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                    </button>
                                </span>
                                <select id="voiceRecordingSpeedSelect"></select>
                            </label>
                        </div>
                        <div class="field-row">
                            <label style="width:100%">
                                <span class="settings-label-row">
                                    <span class="label-title">Capture d'écran</span>
                                    <button class="settings-help-btn" type="button" data-help-key="voiceScreenCaptureQuality" aria-label="Aide Capture d'écran">
                                        <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                    </button>
                                </span>
                                <select id="voiceScreenCaptureQualitySelect">
                                    <option value="1080">Haute qualité 1080p</option>
                                    <option value="720">Bonne qualité 720p</option>
                                </select>
                            </label>
                        </div>
                    </div>
                    <div class="settings-tab-panel" data-panel="categoryTab" hidden>
                        <div class="field-row">
                            <label style="width:100%">
                                <select id="categoryTemplateSelect" class="category-editor-input"></select>
                            </label>
                        </div>
                        <div class="field-row" style="display:block;">
                            <div id="categoryListEditor" style="display:flex; flex-direction:column; gap:2px; margin-top:4px;"></div>
                            <div id="categoryIconPicker" class="document-explorer-icon-grid" style="position:static; display:none; margin-top:8px;"></div>
                        </div>
                    </div>
                    <div class="settings-tab-panel" data-panel="integrationsTab" hidden>
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                                    <span class="settings-label-row">
                                        <span class="label-title">Notion</span>
                                        <button class="settings-help-btn" type="button" data-help-key="notionIntegration" aria-label="Aide Notion">
                                            <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                        </button>
                                    </span>
                                    <a id="notionAuthLink" class="label-title dashed-link" href="#">Se connecter</a>
                                </div>
                            </label>
                        </div>
                        <div class="field-row" id="notionWorkspaceRow" style="display:none;">
                            <label style="width:100%">
                                <select id="notionWorkspaceSelect" disabled>
                                    <option value="">Aucun workspace</option>
                                </select>
                            </label>
                        </div>
                        <hr style="width:100%; border:none; border-top:1px solid var(--border-main); margin:8px 0;">
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                                    <span class="settings-label-row">
                                        <span class="label-title">YouTube</span>
                                        <button class="settings-help-btn" type="button" data-help-key="youtubeIntegration" aria-label="Aide YouTube">
                                            <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                        </button>
                                    </span>
                                    <a id="youtubeAuthLink" class="label-title dashed-link" href="#">Se connecter</a>
                                </div>
                            </label>
                        </div>
                        <div class="field-row" id="youtubeChannelRow" style="display:none;">
                            <label style="width:100%">
                                <select id="youtubeChannelSelect" disabled>
                                    <option value="">Aucune chaîne</option>
                                </select>
                            </label>
                        </div>
                        <div class="field-row" id="youtubeNoChannelRow" style="display:none;">
                            <label style="width:100%">
                                <span class="label-subtitle">Aucune chaîne trouvée sur ce compte.</span>
                                <a id="youtubeChannelSwitcherLink" class="label-title dashed-link"
                                    href="https://www.youtube.com/channel_switcher" target="_blank"
                                    rel="noopener noreferrer">Créer ou sélectionner une chaîne YouTube</a>
                            </label>
                        </div>
                        <hr style="width:100%; border:none; border-top:1px solid var(--border-main); margin:8px 0;">
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                                    <span class="settings-label-row">
                                        <span class="label-title">Gmail</span>
                                        <button class="settings-help-btn" type="button" data-help-key="gmailIntegration" aria-label="Aide Gmail">
                                            <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                        </button>
                                    </span>
                                    <a id="gmailAuthLink" class="label-title dashed-link" href="#">Se connecter</a>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div class="settings-tab-panel" data-panel="promptTab" hidden>
                        <div class="field-row">
                            <label style="width:100%">
                                <span class="settings-label-row">
                                    <span class="label-title">Moteur IA</span>
                                    <button class="settings-help-btn" type="button" data-help-key="openRouterModel" aria-label="Aide Moteur IA">
                                        <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                    </button>
                                </span>
                                <select id="openrouterModelInput">
                                    <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                                    <option value="qwen/qwen3.5-35b-a3b">qwen/qwen3.5-35b-a3b</option>
                                    <option value="qwen/qwen3.5-397b-a17b">qwen/qwen3.5-397b-a17b</option>
                                    <option value="xiaomi/mimo-v2-flash">xiaomi/mimo-v2-flash</option>
                                </select>
                            </label>
                        </div>
                        <div class="field-row">
                            <label style="width:100%">
                                <span class="settings-label-row">
                                    <span class="label-title">Effort IA</span>
                                    <button class="settings-help-btn" type="button"
                                        title="Plus l'effort est élevé et plus la réponse sera pertinente et exhaustive mais le temps de réflexion sera plus long."
                                        aria-label="Aide Effort IA">
                                        <i data-lucide="circle-help" style="width:14px;height:14px;"></i>
                                    </button>
                                </span>
                                <select id="openrouterEffortSelect">
                                    <option value="minimal">Minimal</option>
                                    <option value="low" selected>Faible</option>
                                    <option value="medium">Moyen</option>
                                    <option value="high">Élevé</option>
                                </select>
                            </label>
                        </div>
                        <div class="header-row ia-header-actions" style="display:block;">
                            <div id="memoPromptPresetSelect"></div>
                            <textarea id="memoPromptEditor" rows="24" placeholder="Entrez le prompt personnalisé..."></textarea>
                        </div>
                    </div>
                </div>
                <div class="feedback-actions" style="margin-top: auto;">
                    <button id="refreshCacheBtn" type="button" class="btn-secondary" title="Vider le cache"><i data-lucide="rotate-ccw"
                            style="width:14px;height:14px;vertical-align:middle;"></i></button>
                    <div style="flex: 1;"></div>
                    <button id="resetPromptBtn" type="button" class="btn-secondary" hidden><i data-lucide="rotate-ccw"
                            style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>Réinitialiser</button>
                    <button id="resetCategoryBtn" type="button" class="btn-secondary" hidden><i data-lucide="rotate-ccw"
                            style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>Réinitialiser</button>
                    <button id="saveSettingsBtn" type="button" class="btn-primary" style="margin-left:auto;">Sauvegarder</button>
                </div>
            </form>
        </div>
    `;
    const CATEGORY_SETTINGS_STORAGE_KEY = "go-toolkit-category-settings.v1";
    const CATEGORY_SETTINGS_CHANGE_EVENT = "go-toolkit:categories-changed";
    const CATEGORY_DEFAULTS_URL = "category.json";
    const CATEGORY_ICON_CHOICES = Array.from(new Set(`
        tag tags star flag compass map brain book-type clapperboard wand-2 database
        file file-text folder folder-open briefcase chart-column chart-line
        target lightbulb rocket sparkles palette pen-tool brush
        message-circle message-square users user
        cloud-upload cloud-download refresh-cw lock shield
        code cpu puzzle component
        calendar clock timer
        heart home camera video mic music
    `.trim().split(/\s+/)));
    const CATEGORY_ICON_TOKENS = {
        tag: ["categorie", "etiquette"],
        star: ["important", "priorite"],
        compass: ["strategie", "orientation"],
        map: ["roadmap", "plan"],
        brain: ["ia", "analyse"],
        book: ["documentation", "savoir"],
        clapperboard: ["video", "tutoriel"],
        wand: ["prompt", "creativite"],
        database: ["donnees"],
        briefcase: ["professionnel", "travail"],
        user: ["prive", "personnel"],
        home: ["maison", "perso"]
    };
    let categorySettingsCache = null;
    let categorySettingsLoadPromise = null;
    let categoryTabDraft = null;
    let categoryTabSaved = null;
    let categoryTabIconTarget = null;
    let categoryTabIconSearch = "";
    let activeHelpTooltip = null;
    let activeHelpTooltipButton = null;
    let settingsHelpDismissBound = false;

    function closeActiveSettingsHelpTooltip() {
        if (activeHelpTooltip && activeHelpTooltip.parentNode) {
            activeHelpTooltip.parentNode.removeChild(activeHelpTooltip);
        }
        if (activeHelpTooltipButton) {
            activeHelpTooltipButton.setAttribute("aria-expanded", "false");
        }
        activeHelpTooltip = null;
        activeHelpTooltipButton = null;
    }

    function positionSettingsHelpTooltip(button, tooltip) {
        if (!button || !tooltip) return;
        const rect = button.getBoundingClientRect();
        const top = rect.bottom + 8;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - 8));
        tooltip.style.top = `${Math.round(top)}px`;
        tooltip.style.left = `${Math.round(left)}px`;
    }

    function openSettingsHelpTooltip(button, message) {
        closeActiveSettingsHelpTooltip();
        if (!button || !message) return;
        const tooltip = doc.createElement("div");
        tooltip.className = "settings-help-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.textContent = message;
        doc.body.appendChild(tooltip);
        positionSettingsHelpTooltip(button, tooltip);
        activeHelpTooltip = tooltip;
        activeHelpTooltipButton = button;
        button.setAttribute("aria-expanded", "true");
    }

    function deepClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            return null;
        }
    }

    function normalizeSearchValue(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function getIconSearchText(icon) {
        const parts = String(icon || "").split("-").filter(Boolean);
        const words = [icon].concat(parts);
        parts.forEach(token => {
            const extra = CATEGORY_ICON_TOKENS[token];
            if (Array.isArray(extra)) words.push(...extra);
        });
        return normalizeSearchValue(words.join(" "));
    }

    function normalizeCategoryItem(item, index) {
        const rawId = item?.id == null ? "" : String(item.id).trim();
        const id = rawId || String(index + 1);
        const title = String(item?.title || item?.name || `Catégorie ${id}`).trim() || `Catégorie ${id}`;
        const icon = String(item?.icon || "tag").trim() || "tag";
        const description = String(item?.description || "").trim();
        const enabled = item?.enabled !== false;
        return { id, title, icon, description, enabled };
    }

    function normalizeCategoryTemplate(template, index) {
        const id = String(template?.id || template?.name || `template-${index + 1}`).trim() || `template-${index + 1}`;
        const name = String(template?.name || template?.label || `Template ${index + 1}`).trim() || `Template ${index + 1}`;
        const list = Array.isArray(template?.categories)
            ? template.categories
            : (Array.isArray(template?.items) ? template.items : []);
        const categories = list.map((item, itemIndex) => normalizeCategoryItem(item, itemIndex));
        return { id, name, categories };
    }

    function normalizeCategoryTemplatesPayload(payload) {
        if (Array.isArray(payload)) {
            return {
                selectedTemplateId: "superpowers",
                templates: [{ id: "superpowers", name: "Superpouvoirs", categories: payload.map((item, index) => normalizeCategoryItem(item, index)) }]
            };
        }
        const templatesRaw = Array.isArray(payload?.templates)
            ? payload.templates
            : (Array.isArray(payload?.lists) ? payload.lists : []);
        const templates = templatesRaw.map((entry, index) => normalizeCategoryTemplate(entry, index)).filter(entry => Array.isArray(entry.categories) && entry.categories.length);
        if (!templates.length) {
            return { selectedTemplateId: "default", templates: [] };
        }
        const selectedTemplateId = String(payload?.defaultTemplateId || payload?.selectedTemplateId || templates[0].id).trim() || templates[0].id;
        return { selectedTemplateId, templates };
    }

    async function fetchDefaultCategorySettings() {
        const tryFetch = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        };
        try {
            const payload = await tryFetch(CATEGORY_DEFAULTS_URL);
            const normalized = normalizeCategoryTemplatesPayload(payload);
            if (normalized.templates.length) return normalized;
        } catch (err) {
            // fallback below
        }
        return {
            selectedTemplateId: "default",
            templates: [{
                id: "default",
                name: "Catégories",
                categories: []
            }]
        };
    }

    function normalizeStoredCategorySettings(raw, defaults) {
        const normalizedDefaults = normalizeCategoryTemplatesPayload(defaults || {});
        const normalizedRaw = normalizeCategoryTemplatesPayload(raw || {});
        const templates = (normalizedRaw.templates.length ? normalizedRaw.templates : normalizedDefaults.templates).map((template, index) => normalizeCategoryTemplate(template, index));
        const selectedTemplateId = templates.some(template => template.id === normalizedRaw.selectedTemplateId)
            ? normalizedRaw.selectedTemplateId
            : (templates[0]?.id || "");
        const displayEnabled = raw?.displayEnabled !== false;
        return {
            version: 1,
            selectedTemplateId,
            displayEnabled,
            templates
        };
    }

    function readStoredCategorySettings() {
        try {
            const raw = localStorage.getItem(CATEGORY_SETTINGS_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (err) {
            return null;
        }
    }

    function writeStoredCategorySettings(settings) {
        try {
            localStorage.setItem(CATEGORY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch (err) {
            // ignore
        }
    }

    async function ensureCategorySettingsLoaded() {
        if (categorySettingsCache) return deepClone(categorySettingsCache) || categorySettingsCache;
        if (categorySettingsLoadPromise) return categorySettingsLoadPromise;
        categorySettingsLoadPromise = (async () => {
            const defaults = await fetchDefaultCategorySettings();
            const stored = readStoredCategorySettings();
            const normalized = normalizeStoredCategorySettings(stored, defaults);
            categorySettingsCache = normalized;
            writeStoredCategorySettings(normalized);
            return deepClone(normalized) || normalized;
        })();
        try {
            return await categorySettingsLoadPromise;
        } finally {
            categorySettingsLoadPromise = null;
        }
    }

    function findActiveCategoryTemplate(settings) {
        const list = Array.isArray(settings?.templates) ? settings.templates : [];
        if (!list.length) return null;
        const selectedId = String(settings?.selectedTemplateId || "").trim();
        return list.find(template => template.id === selectedId) || list[0] || null;
    }

    async function saveCategorySettings(nextSettings) {
        const defaults = await fetchDefaultCategorySettings();
        const normalized = normalizeStoredCategorySettings(nextSettings || {}, defaults);
        categorySettingsCache = normalized;
        writeStoredCategorySettings(normalized);
        global.dispatchEvent(new CustomEvent(CATEGORY_SETTINGS_CHANGE_EVENT, {
            detail: { settings: deepClone(normalized) || normalized }
        }));
        return deepClone(normalized) || normalized;
    }

    function getActiveCategoriesFromSettings(settings, includeDisabled = false) {
        const active = findActiveCategoryTemplate(settings);
        const categories = Array.isArray(active?.categories) ? active.categories : [];
        return includeDisabled ? categories.slice() : categories.filter(item => item.enabled !== false);
    }

    function normalizeBackdrop(modal) {
        if (!modal) return;
        modal.classList.add("modal-overlay");
    }

    function normalizeDialog(modal) {
        const dialog = modal?.querySelector(".settings-modal");
        if (!dialog) return;
        dialog.classList.add("modal");
    }

    function open(modal) {
        if (!modal) return;
        normalizeBackdrop(modal);
        normalizeDialog(modal);
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function close(modal) {
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    function populateOpenrouterModelInput() {
        const input = doc.getElementById("openrouterModelInput");
        if (!input) return;
        const allowedModels = Array.isArray(global.GoToolkitIAConfig?.OPENROUTER_MODELS)
            ? global.GoToolkitIAConfig.OPENROUTER_MODELS
            : [];
        const stored = (
            (global.GoToolkitIAConfig && typeof global.GoToolkitIAConfig.getOpenRouterModel === "function"
                ? global.GoToolkitIAConfig.getOpenRouterModel()
                : "") ||
            (global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_MODEL || "")
        );
        const value = allowedModels.includes(stored)
            ? stored
            : (global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_MODEL || "openai/gpt-oss-120b");
        if (value) input.value = value;
    }

    function populateAssemblyAiInput() {
        const input = doc.getElementById("assemblyAiKeyInput");
        if (!input) return;
        input.value = "";
    }

    function populateGoogleTtsInput() {
        const input = doc.getElementById("googleTtsApiKeyInput");
        if (!input) return;
        input.value = global.GoToolkitIAConfig?.getGoogleTtsApiKey?.() || "";
    }

    function populateOpenrouterOcrModelInput() {
        const input = doc.getElementById("openrouterOcrModelInput");
        if (!input) return;
        const stored = (
            (global.GoToolkitIAConfig && typeof global.GoToolkitIAConfig.getOpenRouterOcrModel === "function"
                ? global.GoToolkitIAConfig.getOpenRouterOcrModel()
                : "") ||
            (global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_OCR_MODEL || "")
        );
        if (stored) input.value = stored;
    }

    function populateOpenrouterEmbeddingsModelInput() {
        const input = doc.getElementById("openrouterEmbeddingsModelInput");
        if (!input) return;
        const stored = (
            (global.GoToolkitIAConfig && typeof global.GoToolkitIAConfig.getOpenRouterEmbeddingsModel === "function"
                ? global.GoToolkitIAConfig.getOpenRouterEmbeddingsModel()
                : "") ||
            (global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_EMBEDDINGS_MODEL || "")
        );
        if (stored) input.value = stored;
    }

    function populateOpenrouterEffortSelect() {
        const select = doc.getElementById("openrouterEffortSelect");
        if (!select) return;
        const stored = (
            (global.GoToolkitIAConfig && typeof global.GoToolkitIAConfig.getOpenRouterReasoningEffort === "function"
                ? global.GoToolkitIAConfig.getOpenRouterReasoningEffort()
                : "") ||
            (global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_REASONING_EFFORT || "low")
        ).trim().toLowerCase();
        if (stored) select.value = stored;
    }

    async function performFullReset() {
        try {
            if (indexedDB && typeof indexedDB.databases === "function") {
                const allDbs = await indexedDB.databases();
                const names = Array.isArray(allDbs) ? allDbs.map(db => db && db.name).filter(Boolean) : [];
                await Promise.all(names.map(dbName => {
                    return new Promise(resolve => {
                        try {
                            const req = indexedDB.deleteDatabase(dbName);
                            req.onsuccess = req.onerror = req.onblocked = () => resolve();
                        } catch (err) {
                            resolve();
                        }
                    });
                }));
            } else {
                const databases = ["go-toolkit", "gotoolkit-documents"];
                databases.forEach(dbName => {
                    try { indexedDB.deleteDatabase(dbName); } catch (err) { /* noop */ }
                });
            }
        } catch (err) { /* noop */ }

        try { localStorage.clear(); } catch (err) { /* noop */ }
        try { sessionStorage.clear(); } catch (err) { /* noop */ }

        try {
            doc.cookie.split(";").forEach(function (cookie) {
                const eqPos = cookie.indexOf("=");
                const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
                if (!name) return;
                doc.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/";
            });
        } catch (err) { /* noop */ }

        const version = resolveCurrentVersion();
        const targetUrl = version ? "/?v=" + encodeURIComponent(version) : "/";
        if ("caches" in global) {
            try {
                const names = await caches.keys();
                await Promise.all(names.map(name => caches.delete(name)));
            } catch (err) { /* noop */ }
        }
        if (global.navigator?.serviceWorker && typeof global.navigator.serviceWorker.getRegistrations === "function") {
            try {
                const registrations = await global.navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(reg => reg.unregister()));
            } catch (err) { /* noop */ }
        }
        global.location.href = targetUrl;
    }

    function resolveCurrentVersion() {
        try {
            const url = new URL(global.location.href);
            const fromQuery = (url.searchParams.get("v") || "").trim();
            if (fromQuery) return fromQuery;
        } catch (err) { /* noop */ }

        try {
            const scripts = Array.from(doc.querySelectorAll("script[src]"));
            for (const script of scripts) {
                const src = script.getAttribute("src");
                if (!src) continue;
                const parsed = new URL(src, global.location.href);
                const value = (parsed.searchParams.get("v") || "").trim();
                if (value) return value;
            }
        } catch (err) { /* noop */ }

        return "";
    }

    function bindRepairButton() {
        const repairBtn = doc.getElementById("refreshCacheBtn");
        if (!repairBtn || repairBtn.dataset.repairBound === "1") return;
        repairBtn.addEventListener("click", function () {
            const confirmed = global.confirm("ATTENTION : Cette action va supprimer TOUTES vos données locales et réinitialiser l'application. Voulez-vous continuer ?");
            if (confirmed) {
                performFullReset();
            }
        });
        repairBtn.dataset.repairBound = "1";
    }

    function getTimestampMs() {
        if (typeof performance === "object" && typeof performance.now === "function") {
            return performance.now();
        }
        return Date.now();
    }

    function formatLatencyMs(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        const rounded = Math.round(Math.max(0, num));
        return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

    function appendLatencyToLabel(label, latencyMs) {
        if (!label || latencyMs == null) return label;
        const formatted = formatLatencyMs(latencyMs);
        if (!formatted) return label;
        return `${label} (${formatted} ms)`;
    }

    function getRateLimitRemaining(headers) {
        if (!headers || typeof headers.get !== "function") return null;
        const value = headers.get("X-RateLimit-Remaining");
        if (!value) return null;
        const trimmed = value.trim();
        return trimmed || null;
    }

    function normalizeLucideIconName(value, fallback = "circle") {
        const icon = String(value || "").trim().toLowerCase();
        if (!icon) return fallback;
        return /^[a-z0-9-]+$/.test(icon) ? icon : fallback;
    }

    function createLucideIconElement(iconName, style = "") {
        const icon = doc.createElement("i");
        icon.setAttribute("data-lucide", normalizeLucideIconName(iconName));
        if (style) icon.style.cssText = String(style);
        return icon;
    }

    function setElementIconAndText(target, iconName, text, style = "") {
        if (!target) return;
        target.textContent = "";
        if (iconName) {
            target.appendChild(createLucideIconElement(iconName, style));
        }
        if (text) {
            target.appendChild(doc.createTextNode(String(text)));
        }
    }

    function setElementIconOnly(target, iconName, style = "") {
        if (!target) return;
        target.textContent = "";
        target.appendChild(createLucideIconElement(iconName, style));
    }

    function setStatus(el, { state = null, label = "" } = {}) {
        if (!el) return;
        if (state === "verifying") {
            setElementIconAndText(
                el,
                "loader-circle",
                label || "Vérification...",
                "width:14px;height:14px;vertical-align:middle;margin-right:4px;"
            );
            const spinner = el.querySelector("i[data-lucide='loader-circle']");
            if (spinner) spinner.classList.add("lucide-spin");
            el.classList.remove("ia-status--error");
            global.lucide?.createIcons?.();
            return;
        }
        const iconByState = {
            ready: "circle-check",
            warning: "triangle-alert",
            error: "circle-alert"
        };
        const icon = iconByState[state] || null;
        setElementIconAndText(
            el,
            icon,
            label || "",
            "width:14px;height:14px;vertical-align:middle;margin-right:4px;"
        );
        if (state === "error") {
            el.classList.add("ia-status--error");
        } else {
            el.classList.remove("ia-status--error");
        }
        global.lucide?.createIcons?.();
    }

    function persistModalAiSettings() {
        const cfg = global.GoToolkitIAConfig;
        const googleTtsApiKeyInput = doc.getElementById("googleTtsApiKeyInput");
        const openrouterApiKeyInput = doc.getElementById("openrouterApiKeyInput");
        const openrouterDataCollectionSelect = doc.getElementById("openrouterDataCollectionSelect");
        const openrouterModelInput = doc.getElementById("openrouterModelInput");
        const openrouterOcrModelInput = doc.getElementById("openrouterOcrModelInput");
        const openrouterEmbeddingsModelInput = doc.getElementById("openrouterEmbeddingsModelInput");
        const openrouterEffortSelect = doc.getElementById("openrouterEffortSelect");

        const openRouterData = (openrouterDataCollectionSelect?.value || cfg?.DEFAULTS?.OPENROUTER_DATA_COLLECTION || "deny").trim();
        const openRouterModel = (openrouterModelInput?.value || "").trim() || (cfg?.DEFAULTS?.OPENROUTER_MODEL || "");
        const openRouterOcrModel = (openrouterOcrModelInput?.value || "").trim() || (cfg?.DEFAULTS?.OPENROUTER_OCR_MODEL || "");
        const openRouterEmbModel = (openrouterEmbeddingsModelInput?.value || "").trim() || (cfg?.DEFAULTS?.OPENROUTER_EMBEDDINGS_MODEL || "");
        const openRouterEffort = (openrouterEffortSelect?.value || cfg?.DEFAULTS?.OPENROUTER_REASONING_EFFORT || "low").trim().toLowerCase();

        try {
            if (cfg?.setBackend) cfg.setBackend("openrouter");
            if (cfg?.setOpenRouterDataCollection) cfg.setOpenRouterDataCollection(openRouterData);
            if (cfg?.setOpenRouterModel) cfg.setOpenRouterModel(openRouterModel);
            if (cfg?.setOpenRouterOcrModel) cfg.setOpenRouterOcrModel(openRouterOcrModel);
            if (cfg?.setOpenRouterEmbeddingsModel) cfg.setOpenRouterEmbeddingsModel(openRouterEmbModel);
            if (cfg?.setOpenRouterReasoningEffort) cfg.setOpenRouterReasoningEffort(openRouterEffort);
        } catch (err) { /* noop */ }
        try {
            localStorage.setItem("go-toolkit-ai-backend", "openrouter");
        } catch (err) { /* noop */ }
    }

    async function testAssemblyAiConnection() {
        persistModalAiSettings();
        const statusEl = doc.getElementById("assemblyAiStatus");
        const input = doc.getElementById("assemblyAiKeyInput");
        const key = (input?.value || "").trim();
        if (!key) {
            setStatus(statusEl, { state: "warning", label: "Clé invalide" });
            return false;
        }
        setStatus(statusEl, { state: "verifying", label: "Vérification..." });
        try {
            const response = await fetch("https://api.eu.assemblyai.com/v2/transcript", {
                method: "GET",
                headers: { Authorization: key }
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            setStatus(statusEl, { state: "ready", label: "Accès privé" });
            return true;
        } catch (err) {
            const proxyBase = (global.GO_TOOLKIT_ASSEMBLYAI_TOKEN_URL || "https://assemblyai.gotoolkit.workers.dev/token").replace(/\/token$/, "");
            try {
                const turnstileHeaders = await global.GoToolkitTurnstile?.getHeadersForUrl?.(proxyBase + "/transcript", "assemblyai");
                const proxyResponse = await fetch(proxyBase + "/transcript", {
                    method: "GET",
                    headers: {
                        Authorization: key,
                        ...(turnstileHeaders || {})
                    }
                });
                if (!proxyResponse.ok) throw new Error("HTTP " + proxyResponse.status);
                setStatus(statusEl, { state: "warning", label: "Clé invalide" });
                return true;
            } catch (proxyErr) {
                setStatus(statusEl, { state: "warning", label: "Clé invalide" });
                return false;
            }
        }
    }

    async function testGoogleTtsConnection() {
        persistModalAiSettings();
        const statusEl = doc.getElementById("googleTtsStatus");
        const directKey = (global.GoToolkitIAConfig?.getGoogleTtsApiKey?.() || "").trim();
        setStatus(statusEl, { state: "verifying", label: "Vérification..." });
        if (directKey) {
            const directResult = await global.GoToolkitGoogleTTS?.verifyAccess?.();
            if (directResult?.ok) {
                setStatus(statusEl, { state: "ready", label: "Accès direct" });
                return true;
            }
        }
        try {
            const explicit = global.GO_TOOLKIT_GOOGLE_TTS_API_URL || "https://googletts.gotoolkit.workers.dev";
            const baseUrl = String(explicit).replace(/\/+$/, "");
            const targetUrl = baseUrl + "/speak";
            const turnstileHeaders = await global.GoToolkitTurnstile?.getHeadersForUrl?.(targetUrl, "googletts");
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(turnstileHeaders || {})
                },
                body: JSON.stringify({
                    text: "Test",
                    languageCode: "fr-FR"
                })
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            setStatus(statusEl, { state: directKey ? "warning" : "ready", label: directKey ? "Clé invalide, proxy" : "Accès proxy" });
            return true;
        } catch (err) {
            setStatus(statusEl, { state: "error", label: directKey ? "Clé invalide" : "Proxy indisponible" });
            return false;
        }
    }

    async function testOpenRouterConnection() {
        persistModalAiSettings();
        const statusEl = doc.getElementById("openrouterStatus");
        const modelLabelEl = doc.getElementById("openrouterModelLabel");
        const cfg = global.GoToolkitIAConfig;
        const model = (cfg?.getOpenRouterModel?.() || cfg?.DEFAULTS?.OPENROUTER_MODEL || "openrouter/auto").trim();
        const apiKey = (cfg?.getOpenRouterApiKey?.() || "").trim();
        setStatus(statusEl, { state: "verifying", label: "Vérification..." });

        async function tryEndpoint(url, useKey) {
            const headers = { "Content-Type": "application/json" };
            if (useKey && apiKey) headers.Authorization = "Bearer " + apiKey;
            if (!useKey) {
                const turnstileHeaders = await global.GoToolkitTurnstile?.getHeadersForUrl?.(url, "openrouter");
                if (turnstileHeaders && typeof turnstileHeaders === "object") {
                    Object.assign(headers, turnstileHeaders);
                }
            }
            const start = getTimestampMs();
            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: "Vérification" }],
                    stream: false
                }),
                cache: "no-cache"
            });
            if (!response.ok) {
                let rawBody = "";
                try {
                    rawBody = await response.text();
                } catch (err) {
                    rawBody = "";
                }
                let parsed = null;
                if (rawBody) {
                    try {
                        parsed = JSON.parse(rawBody);
                    } catch (err) {
                        parsed = null;
                    }
                }
                const requestError = new Error(parsed?.error?.message || parsed?.message || ("HTTP " + response.status));
                requestError.status = response.status;
                requestError.code = parsed?.error?.code || parsed?.code || "";
                throw requestError;
            }
            const latencyMs = Math.max(0, getTimestampMs() - start);
            return {
                rateLimitRemaining: getRateLimitRemaining(response.headers),
                latencyMs
            };
        }

        if (apiKey) {
            try {
                const result = await tryEndpoint("https://openrouter.ai/api/v1/chat/completions", true);
                setStatus(statusEl, { state: "ready", label: "Accès privé" });
                if (modelLabelEl) {
                    modelLabelEl.textContent = appendLatencyToLabel("Clé valide. Accès privé", result.latencyMs);
                }
                return true;
            } catch (err) {
                // fallback to shared access
            }
        }
        try {
            const result = await tryEndpoint("https://openrouter.gotoolkit.workers.dev/api/v1/chat/completions", false);
            setStatus(statusEl, { state: "warning", label: "" });
            if (modelLabelEl) {
                modelLabelEl.textContent = appendLatencyToLabel("Clé invalide. Accès partagé", result.latencyMs);
            }
            return true;
        } catch (err) {
            const isMissingProxySecret = String(err?.code || "") === "MISSING_ENV" || /OpenRouter API key missing/i.test(String(err?.message || ""));
            setStatus(statusEl, { state: "error", label: isMissingProxySecret ? "Proxy sans secret" : "Accès partagé indisponible" });
            if (modelLabelEl) modelLabelEl.textContent = isMissingProxySecret ? "Le worker OpenRouter n'a plus de secret." : "Accès partagé indisponible";
            return false;
        }
    }

    function bindVerifyButtons() {
        const assemblyAiVerifyBtn = doc.getElementById("assemblyAiVerifyBtn");
        const googleTtsVerifyBtn = doc.getElementById("googleTtsVerifyBtn");
        const openrouterVerifyBtn = doc.getElementById("openrouterVerifyBtn");

        if (assemblyAiVerifyBtn && assemblyAiVerifyBtn.dataset.verifyBound !== "1") {
            assemblyAiVerifyBtn.addEventListener("click", async function () {
                try {
                    const handlers = global.GoToolkitSettingsModalHandlers || {};
                    if (typeof handlers.onVerifyAssemblyAi === "function") {
                        await handlers.onVerifyAssemblyAi();
                    } else {
                        await testAssemblyAiConnection();
                    }
                } catch (err) { /* noop */ }
            });
            assemblyAiVerifyBtn.dataset.verifyBound = "1";
        }

        if (googleTtsVerifyBtn && googleTtsVerifyBtn.dataset.verifyBound !== "1") {
            googleTtsVerifyBtn.addEventListener("click", async function () {
                try {
                    await testGoogleTtsConnection();
                } catch (err) { /* noop */ }
            });
            googleTtsVerifyBtn.dataset.verifyBound = "1";
        }

        if (openrouterVerifyBtn && openrouterVerifyBtn.dataset.verifyBound !== "1") {
            openrouterVerifyBtn.addEventListener("click", async function () {
                try {
                    const handlers = global.GoToolkitSettingsModalHandlers || {};
                    if (typeof handlers.onVerifyOpenRouter === "function") {
                        await handlers.onVerifyOpenRouter();
                    } else {
                        await testOpenRouterConnection();
                    }
                } catch (err) { /* noop */ }
            });
            openrouterVerifyBtn.dataset.verifyBound = "1";
        }
    }

    function bindSettingsHelp() {
        const buttons = Array.from(doc.querySelectorAll(".settings-help-btn"));
        if (!settingsHelpDismissBound) {
            doc.addEventListener("click", function (event) {
                if (!activeHelpTooltip) return;
                const target = event.target;
                if (!(target instanceof Element)) {
                    closeActiveSettingsHelpTooltip();
                    return;
                }
                if (activeHelpTooltip.contains(target)) return;
                if (activeHelpTooltipButton && activeHelpTooltipButton.contains(target)) return;
                closeActiveSettingsHelpTooltip();
            });
            doc.addEventListener("keydown", function (event) {
                if (event.key === "Escape") {
                    closeActiveSettingsHelpTooltip();
                }
            });
            window.addEventListener("resize", function () {
                if (activeHelpTooltip && activeHelpTooltipButton) {
                    positionSettingsHelpTooltip(activeHelpTooltipButton, activeHelpTooltip);
                }
            });
            settingsHelpDismissBound = true;
        }
        buttons.forEach(button => {
            if (button.dataset.helpBound === "1") return;
            const helpKey = String(button.getAttribute("data-help-key") || "").trim();
            const tooltip = SETTINGS_HELP[helpKey] || "";
            if (tooltip) {
                button.removeAttribute("title");
                button.setAttribute("aria-expanded", "false");
                button.addEventListener("click", function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (activeHelpTooltipButton === button) {
                        closeActiveSettingsHelpTooltip();
                        return;
                    }
                    openSettingsHelpTooltip(button, tooltip);
                });
            }
            button.dataset.helpBound = "1";
        });
    }

    function getSettingsTabNodes(modal) {
        if (!modal) return { buttons: [], wrapper: null, panels: [] };
        const buttons = Array.from(modal.querySelectorAll(".settings-tabs .tab-btn"));
        const wrapper = modal.querySelector(".settings-tab-panels-wrapper");
        const panels = Array.from((wrapper?.querySelectorAll(".settings-tab-panel")) || modal.querySelectorAll(".settings-tab-panel"));
        return { buttons, wrapper, panels };
    }

    function syncSettingsTabHeights(modal) {
        const { wrapper, panels } = getSettingsTabNodes(modal);
        if (!wrapper || !panels.length) return;
        let maxHeight = 0;
        const backups = [];
        panels.forEach(function (panel, index) {
            backups[index] = {
                hidden: panel.hidden,
                position: panel.style.position || "",
                visibility: panel.style.visibility || ""
            };
            panel.style.position = "absolute";
            panel.style.visibility = "hidden";
            panel.hidden = false;
            const height = panel.offsetHeight;
            if (height > maxHeight) maxHeight = height;
            panel.hidden = backups[index].hidden;
            panel.style.position = backups[index].position;
            panel.style.visibility = backups[index].visibility;
        });
        wrapper.style.minHeight = `${maxHeight || 0}px`;
    }

    function updateSettingsActionButtons(modal, tabId) {
        const resetPromptBtn = modal?.querySelector("#resetPromptBtn");
        const resetCategoryBtn = modal?.querySelector("#resetCategoryBtn");
        if (resetPromptBtn) {
            resetPromptBtn.hidden = tabId !== "promptTab";
        }
        if (resetCategoryBtn) {
            resetCategoryBtn.hidden = tabId !== "categoryTab";
        }
    }

    function activateSettingsTab(modal, tabId) {
        const { buttons, panels } = getSettingsTabNodes(modal);
        if (!buttons.length || !panels.length) return;
        const candidateTabId = tabId || buttons[0]?.dataset?.tab || "paramsTab";
        const hasCandidate = buttons.some(function (btn) { return btn.dataset.tab === candidateTabId; });
        const resolvedTabId = hasCandidate ? candidateTabId : (buttons[0]?.dataset?.tab || "paramsTab");
        buttons.forEach(function (btn) {
            btn.classList.toggle("active", btn.dataset.tab === resolvedTabId);
        });
        panels.forEach(function (panel) {
            panel.hidden = panel.dataset.panel !== resolvedTabId;
        });
        syncSettingsTabHeights(modal);
        updateSettingsActionButtons(modal, resolvedTabId);
    }

    function bindSettingsTabs(modal, options = {}) {
        if (!modal || modal.dataset.settingsTabsBound === "1") return;
        const { buttons } = getSettingsTabNodes(modal);
        if (!buttons.length) return;
        const onTabChange = typeof options.onTabChange === "function" ? options.onTabChange : null;
        buttons.forEach(function (button) {
            button.addEventListener("click", function () {
                const nextTab = button.dataset.tab || buttons[0]?.dataset?.tab || "servicesTab";
                activateSettingsTab(modal, nextTab);
                if (nextTab === "categoryTab") {
                    prepareCategorySettingsTab(modal).catch(() => { /* noop */ });
                }
                if (onTabChange) onTabChange(nextTab);
            });
        });
        modal.dataset.settingsTabsBound = "1";
    }

    function renderCategoryIconPicker(modal) {
        const picker = modal?.querySelector("#categoryIconPicker");
        if (!picker) return;
        picker.textContent = "";
        if (!categoryTabIconTarget) {
            picker.style.display = "none";
            return;
        }
        picker.style.display = "grid";
        picker.classList.add("open");
        const searchWrap = doc.createElement("div");
        searchWrap.className = "document-explorer-icon-search-wrap";
        searchWrap.style.gridColumn = "1 / -1";
        const searchInput = doc.createElement("input");
        searchInput.type = "search";
        searchInput.className = "document-explorer-icon-search";
        searchInput.placeholder = "Rechercher une icône";
        searchInput.value = categoryTabIconSearch;
        searchInput.addEventListener("input", () => {
            categoryTabIconSearch = searchInput.value || "";
            renderCategoryIconPicker(modal);
        });
        searchWrap.appendChild(searchInput);
        picker.appendChild(searchWrap);
        const q = normalizeSearchValue(categoryTabIconSearch);
        const icons = !q ? CATEGORY_ICON_CHOICES : CATEGORY_ICON_CHOICES.filter(icon => getIconSearchText(icon).includes(q));
        icons.forEach(icon => {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.className = "document-explorer-icon-choice" + (categoryTabIconTarget?.item?.icon === icon ? " active" : "");
            btn.title = icon;
            setElementIconOnly(btn, icon);
            btn.addEventListener("click", () => {
                const target = categoryTabIconTarget;
                if (!target?.item) return;
                target.item.icon = icon;
                picker.style.display = "none";
                categoryTabIconTarget = null;
                categoryTabIconSearch = "";
                renderCategoryTab(modal);
            });
            picker.appendChild(btn);
        });
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => searchInput.focus());
        } else {
            setTimeout(() => searchInput.focus(), 0);
        }
        global.lucide?.createIcons?.();
    }

    function renderCategoryTab(modal) {
        const select = modal?.querySelector("#categoryTemplateSelect");
        const list = modal?.querySelector("#categoryListEditor");
        if (!select || !list || !categoryTabDraft) return;
        const templates = Array.isArray(categoryTabDraft.templates) ? categoryTabDraft.templates : [];
        const activeTemplate = findActiveCategoryTemplate(categoryTabDraft);
        const currentTemplateId = String(categoryTabDraft.selectedTemplateId || activeTemplate?.id || "").trim();
        if (select.dataset.initialized !== "1") {
            select.addEventListener("change", () => {
                const selectedId = String(select.value || "").trim();
                categoryTabDraft.selectedTemplateId = selectedId;
                categoryTabIconTarget = null;
                categoryTabIconSearch = "";
                renderCategoryTab(modal);
            });
            select.dataset.initialized = "1";
        }
        select.textContent = "";
        templates.forEach(template => {
            const option = doc.createElement("option");
            option.value = template.id;
            option.textContent = template.name || template.id;
            select.appendChild(option);
        });
        select.value = templates.some(template => template.id === currentTemplateId)
            ? currentTemplateId
            : (templates[0]?.id || "");
        list.textContent = "";
        const currentTemplate = findActiveCategoryTemplate(categoryTabDraft);
        const categories = Array.isArray(currentTemplate?.categories) ? currentTemplate.categories : [];
        const markTemplateAsCustomized = () => {
            const active = findActiveCategoryTemplate(categoryTabDraft);
            if (!active) return;
            active.name = "Personnalisé";
            if (!active.id) {
                active.id = "custom";
                categoryTabDraft.selectedTemplateId = "custom";
            }
            select.textContent = "";
            templates.forEach(template => {
                const option = doc.createElement("option");
                option.value = template.id;
                option.textContent = template.name || template.id;
                select.appendChild(option);
            });
            select.value = active.id;
        };
        categories.forEach((item, index) => {
            const row = doc.createElement("div");
            row.className = "document-explorer__tree-row";
            row.style.display = "grid";
            row.style.gridTemplateColumns = "auto auto auto 1fr";
            row.style.gap = "2px";
            row.style.alignItems = "center";
            row.style.padding = "6px 8px";
            row.style.borderRadius = "8px";
            row.style.background = "var(--bg-surface)";

            const toggle = doc.createElement("input");
            toggle.type = "checkbox";
            toggle.checked = item.enabled !== false;
            toggle.style.accentColor = "var(--color-primary)";
            toggle.title = "Afficher cette catégorie";
            toggle.addEventListener("change", () => {
                item.enabled = Boolean(toggle.checked);
            });
            row.appendChild(toggle);

            const idLabel = doc.createElement("span");
            idLabel.textContent = String(item.id || index + 1);
            idLabel.style.fontSize = "12px";
            idLabel.style.opacity = "0.8";
            idLabel.style.minWidth = "16px";
            row.appendChild(idLabel);

            const iconBtn = doc.createElement("button");
            iconBtn.type = "button";
            iconBtn.className = "btn btn-secondary";
            iconBtn.style.padding = "3px 6px";
            setElementIconOnly(iconBtn, item.icon || "tag", "width:14px;height:14px;");
            iconBtn.title = "Choisir une icône";
            iconBtn.addEventListener("click", () => {
                categoryTabIconTarget = { item };
                categoryTabIconSearch = "";
                renderCategoryIconPicker(modal);
            });
            row.appendChild(iconBtn);

            const nameInput = doc.createElement("input");
            nameInput.type = "text";
            nameInput.className = "category-editor-input";
            nameInput.value = String(item.title || "");
            nameInput.placeholder = "Nom de la catégorie";
            nameInput.addEventListener("input", () => {
                item.title = String(nameInput.value || "").trim();
                markTemplateAsCustomized();
            });
            row.appendChild(nameInput);
            list.appendChild(row);
        });
        renderCategoryIconPicker(modal);
        global.lucide?.createIcons?.();
    }

    async function prepareCategorySettingsTab(modal) {
        const settings = await ensureCategorySettingsLoaded();
        categoryTabSaved = deepClone(settings) || settings;
        categoryTabDraft = deepClone(settings) || settings;
        categoryTabIconTarget = null;
        categoryTabIconSearch = "";
        renderCategoryTab(modal);
    }

    async function saveCategorySettingsDraft(modal) {
        if (!categoryTabDraft) {
            await prepareCategorySettingsTab(modal);
        }
        const saved = await saveCategorySettings(categoryTabDraft);
        categoryTabSaved = deepClone(saved) || saved;
        categoryTabDraft = deepClone(saved) || saved;
        categoryTabIconTarget = null;
        categoryTabIconSearch = "";
        renderCategoryTab(modal);
        return saved;
    }

    function resetCategorySettingsDraft(modal) {
        if (!categoryTabSaved) return;
        categoryTabDraft = deepClone(categoryTabSaved) || categoryTabSaved;
        categoryTabIconTarget = null;
        categoryTabIconSearch = "";
        renderCategoryTab(modal);
    }

    function bindCategoryResetButton(modal) {
        const resetBtn = modal?.querySelector("#resetCategoryBtn");
        if (!resetBtn || resetBtn.dataset.bound === "1") return;
        resetBtn.addEventListener("click", () => {
            resetCategorySettingsDraft(modal);
        });
        resetBtn.dataset.bound = "1";
    }

    function bind(options = {}) {
        const modal = doc.getElementById(options.modalId || "settingsModal");
        if (!modal) return null;
        const closeBtn = doc.getElementById(options.closeBtnId || "closeSettingsBtn");
        const triggerIds = options.triggerIds || ["openSettingsBtn", "memoSettingsBtn"];

        normalizeBackdrop(modal);
        normalizeDialog(modal);

        const onOpen = typeof options.onOpen === "function" ? options.onOpen : null;
        const onClose = typeof options.onClose === "function" ? options.onClose : null;
        const onTabChange = typeof options.onTabChange === "function" ? options.onTabChange : null;
        const defaultTab = options.defaultTab || "servicesTab";

        bindSettingsTabs(modal, { onTabChange });
        bindCategoryResetButton(modal);

        const api = {
            open: function () {
                if (onOpen) onOpen();
                prepareCategorySettingsTab(modal).catch(() => { /* noop */ });
                activateSettingsTab(modal, defaultTab);
                if (typeof requestAnimationFrame === "function") {
                    requestAnimationFrame(() => syncSettingsTabHeights(modal));
                } else {
                    setTimeout(() => syncSettingsTabHeights(modal), 0);
                }
                open(modal);
            },
            close: function () {
                close(modal);
                if (onClose) onClose();
            },
            modal,
            activateTab: function (tabId) { activateSettingsTab(modal, tabId); },
            syncTabHeights: function () { syncSettingsTabHeights(modal); }
        };

        triggerIds.forEach(function (id) {
            const trigger = doc.getElementById(id);
            if (!trigger) return;
            trigger.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                api.open();
            });
        });

        closeBtn?.addEventListener("click", function () {
            api.close();
        });

        modal.addEventListener("click", function (event) {
            if (event.target === modal) {
                event.stopPropagation();
            }
        });

        doc.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && modal.classList.contains("open")) {
                api.close();
            }
        });

        return api;
    }

    global.GoToolkitSettingsModal = {
        bind,
        performFullReset,
        persistModalAiSettings,
        populateAssemblyAiInput,
        populateGoogleTtsInput,
        populateOpenrouterModelInput,
        populateOpenrouterOcrModelInput,
        populateOpenrouterEmbeddingsModelInput,
        prepareCategorySettings: async function (modalId = "settingsModal") {
            const modal = doc.getElementById(modalId);
            if (!modal) return null;
            return prepareCategorySettingsTab(modal);
        },
        saveCategorySettingsDraft: async function (modalId = "settingsModal") {
            const modal = doc.getElementById(modalId);
            if (!modal) return null;
            return saveCategorySettingsDraft(modal);
        },
        resetCategorySettingsDraft: function (modalId = "settingsModal") {
            const modal = doc.getElementById(modalId);
            if (!modal) return;
            resetCategorySettingsDraft(modal);
        },
        activateSettingsTab: function (tabId, modalId = "settingsModal") {
            const modal = doc.getElementById(modalId);
            activateSettingsTab(modal, tabId);
        },
        syncSettingsTabHeights: function (modalId = "settingsModal") {
            const modal = doc.getElementById(modalId);
            syncSettingsTabHeights(modal);
        },
        formatLatencyMs,
        appendLatencyToLabel,
        testAssemblyAiConnection,
        testGoogleTtsConnection,
        testOpenRouterConnection
    };

    global.GoToolkitCategoryConfig = {
        ensureLoaded: ensureCategorySettingsLoaded,
        getSettingsSnapshot: async function () {
            return ensureCategorySettingsLoaded();
        },
        getDisplayEnabled: function () {
            const displayEnabled = categorySettingsCache?.displayEnabled;
            return displayEnabled !== false;
        },
        getActiveCategories: function (options = {}) {
            const includeDisabled = Boolean(options?.includeDisabled);
            const settings = categorySettingsCache;
            if (!settings) return [];
            return getActiveCategoriesFromSettings(settings, includeDisabled).map(item => ({ ...item }));
        },
        saveSettings: saveCategorySettings,
        eventName: CATEGORY_SETTINGS_CHANGE_EVENT
    };

    function ensureSharedSettingsModalStructure() {
        const modal = doc.getElementById("settingsModal");
        if (!modal) return;
        if (!modal.querySelector(".settings-modal")) {
            const fragment = doc.createRange().createContextualFragment(SHARED_SETTINGS_MODAL_HTML);
            modal.replaceChildren(fragment);
        }
        bindSettingsTabs(modal);
        bindCategoryResetButton(modal);
        activateSettingsTab(modal, "servicesTab");
        populateAssemblyAiInput();
        populateGoogleTtsInput();
        populateOpenrouterModelInput();
        populateOpenrouterOcrModelInput();
        populateOpenrouterEmbeddingsModelInput();
        populateOpenrouterEffortSelect();
        bindRepairButton();
        bindVerifyButtons();
        bindSettingsHelp();
        prepareCategorySettingsTab(modal).catch(() => { /* noop */ });
    }

    ensureSharedSettingsModalStructure();
    global.GoToolkitResetApp = performFullReset;

    global.GoToolkitSettingsModal.setIntegrationConnected = function (anchorEl, connected) {
        if (!anchorEl || !anchorEl.parentElement) return;
        const label = anchorEl.parentElement.querySelector(".label-title");
        if (!label) return;
        const legacyIndicator = anchorEl.parentElement.querySelector('[data-integration-connected]');
        if (legacyIndicator && !label.contains(legacyIndicator)) {
            legacyIndicator.remove();
        }
        let indicator = label.querySelector('[data-integration-connected]');
        if (!connected) {
            indicator?.remove();
            return;
        }
        if (!indicator) {
            indicator = doc.createElement("i");
            indicator.setAttribute("data-integration-connected", "1");
            indicator.setAttribute("data-lucide", "circle-check");
            indicator.style.width = "14px";
            indicator.style.height = "14px";
            indicator.style.verticalAlign = "middle";
            indicator.style.marginLeft = "6px";
            label.appendChild(indicator);
        }
        if (global.lucide?.createIcons) {
            global.lucide.createIcons();
        }
    };

    const DEFAULT_NOTION_API_BASE = (global.GO_TOOLKIT_NOTION_API_URL || "https://notion.gotoolkit.workers.dev").replace(/\/$/, "");

    function getNotionApiBaseUrl() {
        return (global.GO_TOOLKIT_NOTION_API_URL || DEFAULT_NOTION_API_BASE).replace(/\/$/, "");
    }

    function getNotionDeviceId() {
        // Deprecated: Notion auth no longer uses device identifiers.
        return "";
    }

    async function notionJsonPost(path, body) {
        const response = await fetch(`${getNotionApiBaseUrl()}${path}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur Notion (${response.status})`);
        }
        return payload;
    }

    function openNotionOAuthPopup() {
        const origin = global.location.origin;
        const api = getNotionApiBaseUrl();
        const url = `${api}/oauth/start?origin=${encodeURIComponent(origin)}`;
        const popup = global.open(url, "gotoolkit-notion-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-notion-oauth") return;
                cleanup();
                if (event.data?.ok) {
                    resolve(event.data);
                    return;
                }
                reject(new Error(event.data?.error || "Connexion Notion refusee"));
            };
            function cleanup() {
                global.removeEventListener("message", onMessage);
                if (closedTimer) clearInterval(closedTimer);
            }
            global.addEventListener("message", onMessage);
            closedTimer = setInterval(() => {
                if (!popup || popup.closed) {
                    cleanup();
                    reject(new Error("Connexion Notion annulee"));
                }
            }, 300);
        });
    }

    async function notionGetAuthStatus() {
        return notionJsonPost("/auth/status", {});
    }

    async function notionGetWorkspaces() {
        return notionJsonPost("/auth/workspaces", {});
    }

    async function notionSelectWorkspace(workspaceId) {
        return notionJsonPost("/auth/workspace/select", {
            workspaceId: String(workspaceId || "").trim()
        });
    }

    async function notionDisconnect() {
        return notionJsonPost("/auth/disconnect", {});
    }

    async function notionEnsureConnected() {
        const status = await notionGetAuthStatus();
        if (status?.connected) return true;
        await openNotionOAuthPopup();
        return true;
    }

    async function notionListPages(options) {
        return notionJsonPost("/pages/list", {
            workspaceId: String(options?.workspaceId || "").trim(),
            parentId: String(options?.parentId || "").trim()
        });
    }

    async function notionPublishPage(options) {
        return notionJsonPost("/pages/publish", {
            workspaceId: String(options?.workspaceId || "").trim(),
            parentId: String(options?.parentId || "").trim(),
            pageId: String(options?.pageId || "").trim(),
            eraseContent: Boolean(options?.eraseContent),
            path: String(options?.path || "").trim(),
            title: String(options?.title || "Document").trim() || "Document",
            content: String(options?.content || ""),
            blocks: Array.isArray(options?.blocks) ? options.blocks : [],
            assets: Array.isArray(options?.assets) ? options.assets : [],
            format: String(options?.format || "markdown").trim() || "markdown",
            hasRecording: Boolean(options?.hasRecording)
        });
    }

    async function notionGetPageContent(options) {
        return notionJsonPost("/pages/content", {
            workspaceId: String(options?.workspaceId || "").trim(),
            pageId: String(options?.pageId || "").trim()
        });
    }

    global.GoToolkitNotionPublish = {
        getDeviceId: getNotionDeviceId,
        getAuthStatus: notionGetAuthStatus,
        getWorkspaces: notionGetWorkspaces,
        selectWorkspace: notionSelectWorkspace,
        ensureConnected: notionEnsureConnected,
        disconnect: notionDisconnect,
        listPages: notionListPages,
        publishPage: notionPublishPage,
        getPageContent: notionGetPageContent
    };

    const DEFAULT_MICROSOFT_API_BASE = (global.GO_TOOLKIT_MICROSOFT_API_URL || "https://ms.gotoolkit.workers.dev").replace(/\/$/, "");

    function getMicrosoftApiBaseUrl() {
        return (global.GO_TOOLKIT_MICROSOFT_API_URL || DEFAULT_MICROSOFT_API_BASE).replace(/\/$/, "");
    }

    function getMicrosoftDeviceId() {
        // Deprecated: Microsoft auth no longer uses device identifiers.
        return "";
    }

    async function microsoftJsonPost(path, body) {
        const response = await fetch(`${getMicrosoftApiBaseUrl()}${path}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur Microsoft (${response.status})`);
        }
        return payload;
    }

    function openMicrosoftOAuthPopup() {
        const origin = global.location.origin;
        const api = getMicrosoftApiBaseUrl();
        const url = `${api}/oauth/start?origin=${encodeURIComponent(origin)}`;
        const popup = global.open(url, "gotoolkit-microsoft-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            let statusPollTimer = null;
            let postCloseDeadlineMs = 0;
            let settled = false;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-microsoft-oauth") return;
                settled = true;
                cleanup();
                if (event.data?.ok) {
                    resolve(event.data);
                    return;
                }
                reject(new Error(event.data?.error || "Connexion Outlook refusee"));
            };
            function cleanup() {
                global.removeEventListener("message", onMessage);
                if (closedTimer) clearInterval(closedTimer);
                if (statusPollTimer) clearInterval(statusPollTimer);
                try {
                    if (popup && !popup.closed) {
                        const popupOrigin = String(popup.location?.origin || "").trim();
                        if (popupOrigin === global.location.origin) {
                            popup.close();
                        }
                    }
                } catch (err) {
                    // Cross-origin popup access may be blocked by COOP; ignore.
                }
            }
            global.addEventListener("message", onMessage);
            statusPollTimer = setInterval(async () => {
                if (settled) return;
                try {
                    const status = await microsoftGetAuthStatus();
                    if (status?.connected) {
                        settled = true;
                        cleanup();
                        resolve({ ok: true, source: "status-polling" });
                    }
                } catch (err) {
                    // noop
                }
            }, 1000);
            closedTimer = setInterval(async () => {
                if (!popup || popup.closed) {
                    if (settled) return;
                    if (!postCloseDeadlineMs) {
                        postCloseDeadlineMs = Date.now() + 8000;
                    }
                    try {
                        const statusAfterClose = await microsoftGetAuthStatus();
                        if (statusAfterClose?.connected) {
                            settled = true;
                            cleanup();
                            resolve({ ok: true, source: "status-after-close" });
                            return;
                        }
                    } catch (err) {
                    }
                    if (Date.now() < postCloseDeadlineMs) return;
                    settled = true;
                    cleanup();
                    reject(new Error("Connexion Outlook annulee"));
                }
            }, 300);
        });
    }

    async function microsoftGetAuthStatus() {
        return microsoftJsonPost("/auth/status", {});
    }

    async function microsoftGetIdentity() {
        return microsoftJsonPost("/auth/identity", {});
    }

    async function microsoftDisconnect() {
        return microsoftJsonPost("/auth/disconnect", {});
    }

    async function microsoftEnsureConnected() {
        try {
            const status = await microsoftGetAuthStatus();
            if (status?.connected) {
                try {
                    const identityFromStatus = await microsoftGetIdentity();
                    const statusEmail = String(identityFromStatus?.accountEmail || "").trim().toLowerCase();
                    if (statusEmail) {
                        return identityFromStatus;
                    }
                } catch (err) {
                }
            }
        } catch (err) {
        }
        await openMicrosoftOAuthPopup();
        let identity = null;
        try {
            identity = await microsoftGetIdentity();
        } catch (err) {
        }
        const accountEmail = String(identity?.accountEmail || "").trim().toLowerCase();
        const accountName = String(identity?.accountName || "").trim();
        if (!accountEmail) {
            throw new Error("Connexion Outlook incomplète: email du compte indisponible");
        }
        try {
            global.dispatchEvent(new CustomEvent("go-toolkit:microsoft-oauth-success", {
                detail: {
                    provider: "Microsoft",
                    accountEmail,
                    accountName,
                    identityToken: String(identity?.identityToken || "").trim(),
                    expiresAt: Number(identity?.expiresAt || 0)
                }
            }));
        } catch (err) {
            // noop
        }
        return identity;
    }

    global.GoToolkitMicrosoftPublish = {
        getDeviceId: getMicrosoftDeviceId,
        getAuthStatus: microsoftGetAuthStatus,
        getIdentity: microsoftGetIdentity,
        ensureConnected: microsoftEnsureConnected,
        disconnect: microsoftDisconnect
    };

    const DEFAULT_GMAIL_API_BASE = (global.GO_TOOLKIT_GMAIL_API_URL || "https://gmail.gotoolkit.workers.dev").replace(/\/$/, "");

    function getGmailApiBaseUrl() {
        return (global.GO_TOOLKIT_GMAIL_API_URL || DEFAULT_GMAIL_API_BASE).replace(/\/$/, "");
    }

    function getGmailDeviceId() {
        // Deprecated: Gmail auth no longer uses device identifiers.
        return "";
    }

    async function gmailJsonPost(path, body) {
        const response = await fetch(`${getGmailApiBaseUrl()}${path}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur Gmail (${response.status})`);
        }
        return payload;
    }

    function openGmailOAuthPopup() {
        const origin = global.location.origin;
        const api = getGmailApiBaseUrl();
        const url = `${api}/oauth/start?origin=${encodeURIComponent(origin)}`;
        const popup = global.open(url, "gotoolkit-gmail-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-gmail-oauth") return;
                cleanup();
                if (event.data?.ok) {
                    resolve(event.data);
                    return;
                }
                reject(new Error(event.data?.error || "Connexion Gmail refusee"));
            };
            function cleanup() {
                global.removeEventListener("message", onMessage);
                if (closedTimer) clearInterval(closedTimer);
            }
            global.addEventListener("message", onMessage);
            closedTimer = setInterval(() => {
                if (!popup || popup.closed) {
                    cleanup();
                    reject(new Error("Connexion Gmail annulee"));
                }
            }, 300);
        });
    }

    async function gmailGetAuthStatus() {
        return gmailJsonPost("/auth/status", {});
    }

    async function gmailGetIdentityStatus() {
        return gmailJsonPost("/auth/identity-status", {});
    }

    async function gmailGetOneTapConfig() {
        return gmailJsonPost("/auth/onetap/config", {});
    }

    async function gmailGetIdentity() {
        return gmailJsonPost("/auth/identity", {});
    }

    async function gmailDisconnect() {
        return gmailJsonPost("/auth/disconnect", {});
    }

    async function gmailConnectWithOneTap(credential) {
        return gmailJsonPost("/auth/onetap", {
            credential: String(credential || "").trim()
        });
    }

    async function gmailEnsureConnected() {
        const status = await gmailGetAuthStatus();
        if (status?.connected) return true;
        await openGmailOAuthPopup();
        let identity = null;
        try {
            identity = await gmailGetIdentity();
        } catch (err) {
        }
        try {
            global.dispatchEvent(new CustomEvent("go-toolkit:gmail-oauth-success", {
                detail: {
                    provider: "Google",
                    accountEmail: String(identity?.accountEmail || "").trim().toLowerCase(),
                    accountName: String(identity?.accountName || "").trim(),
                    identityToken: String(identity?.identityToken || "").trim(),
                    expiresAt: Number(identity?.expiresAt || 0)
                }
            }));
        } catch (err) {
            // noop
        }
        return true;
    }

    async function gmailCreateDraft(options = {}) {
        return gmailJsonPost("/mail/draft/create", {
            subject: String(options?.subject || "Document").trim() || "Document",
            html: String(options?.html || ""),
            text: String(options?.text || ""),
            attachments: Array.isArray(options?.attachments) ? options.attachments : []
        });
    }

    global.GoToolkitGmailPublish = {
        getDeviceId: getGmailDeviceId,
        getAuthStatus: gmailGetAuthStatus,
        getIdentityStatus: gmailGetIdentityStatus,
        getOneTapConfig: gmailGetOneTapConfig,
        getIdentity: gmailGetIdentity,
        ensureConnected: gmailEnsureConnected,
        connectWithOneTap: gmailConnectWithOneTap,
        disconnect: gmailDisconnect,
        createDraft: gmailCreateDraft
    };
})(window);
