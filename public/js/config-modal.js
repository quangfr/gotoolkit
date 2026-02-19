; (function (global) {
    const doc = global.document;
    if (!doc) return;
    const SHARED_SETTINGS_MODAL_HTML = `
        <div class="modal settings-modal" style="max-height: 98vh; overflow-y: auto; display: flex; flex-direction: column; max-width: 640px; width: min(640px, 94vw); min-width: min(100vw, 520px); min-height: min(100vh, 720px); padding: 12px; margin-right: -8px;">
            <header style="flex-shrink: 0;">
                <h3><i data-lucide="settings" style="width:20px;height:20px;vertical-align:middle;margin-right:8px;"></i>Paramètres</h3>
                <button id="closeSettingsBtn" class="btn-secondary" type="button" aria-label="Fermer"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
            </header>
            <form class="feedback-form" onsubmit="return false;" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding-right: 8px; margin-right: -8px;">
                <div class="settings-tabs tabs">
                    <button type="button" class="tab-btn active" data-tab="servicesTab"><i data-lucide="cpu" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Services IA</button>
                    <button type="button" class="tab-btn" data-tab="paramsTab"><i data-lucide="sliders" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Personnalisation</button>
                    <button type="button" class="tab-btn" data-tab="integrationsTab"><i data-lucide="plug-zap" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Intégrations</button>
                </div>
                <div class="settings-tab-panels-wrapper" style="flex: 1; overflow-y: auto; padding-right: 8px; margin-right: -8px;">
                    <div class="settings-tab-panel" data-panel="servicesTab">
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                                    <div>
                                        <a class="label-title dashed-link" href="https://www.assemblyai.com/dashboard/api-keys" target="_blank" rel="noopener noreferrer">Clé AssemblyAI</a>
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
                            <label>
                                <span class="label-title">Moteur IA</span>
                                <select id="aiBackendSelect">
                                    <option value="openrouter" selected>OpenRouter (recommandé)</option>
                                    <option value="openai">OpenAI</option>
                                </select>
                            </label>
                        </div>
                        <div id="openaiSettings">
                            <div class="field-row">
                                <label style="width:100%">
                                    <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
                                        <div>
                                            <a href="https://platform.openai.com/settings/organization/api-keys" class="label-title dashed-link" target="_blank" rel="noopener noreferrer">Clé OpenAI</a>
                                            <span class="ia-status" id="openaiStatus" aria-hidden="true"></span>
                                        </div>
                                        <div style="display:flex; gap:0.35rem;">
                                            <button id="openaiVerifyBtn" type="button" class="btn-secondary">Vérifier</button>
                                        </div>
                                    </div>
                                    <input id="iaApiKeyInput" type="text" placeholder="sk-..." />
                                </label>
                            </div>
                            <div class="field-row">
                                <label>
                                    <span class="label-title">Modèle OpenAI</span>
                                    <select id="openaiModelSelect">
                                        <option value="gpt-5-nano">gpt-5-nano</option>
                                        <option value="gpt-5-mini">gpt-5-mini</option>
                                    </select>
                                </label>
                            </div>
                            <div class="field-row">
                                <label>
                                    <span class="label-title">Effort de raisonnement OpenAI</span>
                                    <select id="reasoningEffortSelect">
                                        <option value="minimal">Minimal</option>
                                        <option value="low">Faible</option>
                                        <option value="medium">Moyen</option>
                                        <option value="high">Élevé</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                        <div id="openrouterSettings" style="display:none;">
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
                            <div class="field-row">
                                <label style="width:100%">
                                    <span class="label-title">Modèle IA</span>
                                    <input id="openrouterModelInput" type="text" placeholder="@preset/gotoolkit ou openai/gpt-oss-120b" />
                                </label>
                            </div>
                            <div class="field-row" id="openrouterOcrModelRow">
                                <label style="width:100%">
                                    <span class="label-title">Modèle OCR</span>
                                    <input id="openrouterOcrModelInput" type="text" placeholder="qwen/qwen3-vl-8b-instruct" />
                                </label>
                            </div>
                            <div class="field-row">
                                <label style="width:100%">
                                    <span class="label-title">Modèle Embeddings</span>
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
                    <div class="settings-tab-panel" data-panel="paramsTab" hidden>
                        <div class="field-row">
                            <label style="width:100%">
                                <span class="label-title">Prénom</span>
                                <div style="position:relative; width:100%;">
                                    <i data-lucide="user" style="width:14px;height:14px;position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:0.7;pointer-events:none;"></i>
                                    <input id="ownerToken" type="text" style="padding-left:34px;" />
                                </div>
                            </label>
                        </div>
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
                                <span class="label-title">Vitesse d'enregistrement</span>
                                <select id="voiceRecordingSpeedSelect"></select>
                            </label>
                        </div>
                    </div>
                    <div class="settings-tab-panel" data-panel="integrationsTab" hidden>
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                                    <span class="label-title">Notion</span>
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
                                    <span class="label-title">YouTube</span>
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
                                    <span class="label-title">Outlook</span>
                                    <a id="microsoftAuthLink" class="label-title dashed-link" href="#">Se connecter</a>
                                </div>
                            </label>
                        </div>
                        <hr style="width:100%; border:none; border-top:1px solid var(--border-main); margin:8px 0;">
                        <div class="field-row">
                            <label style="width:100%">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                                    <span class="label-title">Gmail</span>
                                    <a id="gmailAuthLink" class="label-title dashed-link" href="#">Se connecter</a>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div class="settings-tab-panel" data-panel="promptTab" hidden>
                        <div class="field-row">
                            <label>
                                <span class="label-title">Preset</span>
                                <select id="chatPromptPresetSelect">
                                    <option value="advice">Conseiller</option>
                                    <option value="ask">Explorer</option>
                                    <option value="suggest">Suggérer</option>
                                    <option value="edit">Éditer</option>
                                </select>
                            </label>
                        </div>
                        <div class="field-row">
                            <label>
                                <span class="label-title">Prompt</span>
                                <textarea id="chatPromptTextarea" rows="15" placeholder="Entrez le prompt personnalisé..."></textarea>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="feedback-actions" style="margin-top: auto;">
                    <button id="refreshCacheBtn" type="button" class="btn-secondary" title="Réparer">Réparer</button>
                    <div style="flex: 1;"></div>
                    <button id="resetChatPromptBtn" type="button" class="btn-secondary" hidden>Réinitialiser</button>
                    <button id="saveSettingsBtn" type="button" class="btn-primary" style="margin-left:auto;">Sauvegarder</button>
                </div>
            </form>
        </div>
    `;

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
        const stored = (
            (global.GoToolkitIAConfig && typeof global.GoToolkitIAConfig.getOpenRouterModel === "function"
                ? global.GoToolkitIAConfig.getOpenRouterModel()
                : "") ||
            (global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_MODEL || "")
        );
        if (stored) input.value = stored;
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

    async function performFullReset() {
        try {
            const databases = ["go-toolkit", "gotoolkit-documents"];
            databases.forEach(dbName => {
                try { indexedDB.deleteDatabase(dbName); } catch (err) { /* noop */ }
            });
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

        const today = new Date();
        const version = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}.1`;
        const targetUrl = "/?v=" + version;
        if ("caches" in global) {
            try {
                const names = await caches.keys();
                await Promise.all(names.map(name => caches.delete(name)));
            } catch (err) { /* noop */ }
        }
        global.location.href = targetUrl;
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

    function setStatus(el, { state = null, label = "" } = {}) {
        if (!el) return;
        if (state === "verifying") {
            el.innerHTML = '<i data-lucide="loader-circle" class="lucide-spin" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>' + (label || "Vérification...");
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
        el.innerHTML = (icon ? `<i data-lucide="${icon}" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>` : "") + (label || "");
        if (state === "error") {
            el.classList.add("ia-status--error");
        } else {
            el.classList.remove("ia-status--error");
        }
        global.lucide?.createIcons?.();
    }

    function persistModalAiSettings() {
        const cfg = global.GoToolkitIAConfig;
        const apiKeyInput = doc.getElementById("iaApiKeyInput");
        const openaiModelSelect = doc.getElementById("openaiModelSelect");
        const aiBackendSelect = doc.getElementById("aiBackendSelect");
        const openrouterApiKeyInput = doc.getElementById("openrouterApiKeyInput");
        const openrouterDataCollectionSelect = doc.getElementById("openrouterDataCollectionSelect");
        const openrouterModelInput = doc.getElementById("openrouterModelInput");
        const openrouterOcrModelInput = doc.getElementById("openrouterOcrModelInput");
        const openrouterEmbeddingsModelInput = doc.getElementById("openrouterEmbeddingsModelInput");

        const openAiKey = (apiKeyInput?.value || "").trim();
        const openAiModel = (openaiModelSelect?.value || "").trim();
        const backend = (aiBackendSelect?.value || "openrouter").trim();
        const openRouterKey = (openrouterApiKeyInput?.value || "").trim();
        const openRouterData = (openrouterDataCollectionSelect?.value || cfg?.DEFAULTS?.OPENROUTER_DATA_COLLECTION || "deny").trim();
        const openRouterModel = (openrouterModelInput?.value || "").trim() || (cfg?.DEFAULTS?.OPENROUTER_MODEL || "");
        const openRouterOcrModel = (openrouterOcrModelInput?.value || "").trim() || (cfg?.DEFAULTS?.OPENROUTER_OCR_MODEL || "");
        const openRouterEmbModel = (openrouterEmbeddingsModelInput?.value || "").trim() || (cfg?.DEFAULTS?.OPENROUTER_EMBEDDINGS_MODEL || "");

        try {
            if (cfg?.setApiKey) cfg.setApiKey(openAiKey);
            if (cfg?.setOpenAiModel && openAiModel) cfg.setOpenAiModel(openAiModel);
            if (cfg?.setBackend) cfg.setBackend(backend);
            if (cfg?.setOpenRouterApiKey) cfg.setOpenRouterApiKey(openRouterKey);
            if (cfg?.setOpenRouterDataCollection) cfg.setOpenRouterDataCollection(openRouterData);
            if (cfg?.setOpenRouterModel) cfg.setOpenRouterModel(openRouterModel);
            if (cfg?.setOpenRouterOcrModel) cfg.setOpenRouterOcrModel(openRouterOcrModel);
            if (cfg?.setOpenRouterEmbeddingsModel) cfg.setOpenRouterEmbeddingsModel(openRouterEmbModel);
        } catch (err) { /* noop */ }
        try {
            localStorage.setItem("go-toolkit-ai-backend", backend || "openrouter");
        } catch (err) { /* noop */ }
    }

    async function testOpenAiConnection() {
        persistModalAiSettings();
        const statusEl = doc.getElementById("openaiStatus");
        const cfg = global.GoToolkitIAConfig;
        const endpoint = (cfg?.PROXY_ENDPOINTS?.responses) || "https://openai.gotoolkit.workers.dev/v1/responses";
        const model = (cfg?.getOpenAiModel?.() || cfg?.DEFAULTS?.OPENAI_MODEL || "gpt-5-nano");
        const apiKey = (cfg?.getApiKey?.() || "").trim();
        setStatus(statusEl, { state: "verifying", label: "Vérification..." });
        if (apiKey) {
            try {
                const start = getTimestampMs();
                const response = await fetch("https://api.openai.com/v1/models", {
                    method: "GET",
                    headers: { Authorization: "Bearer " + apiKey }
                });
                if (!response.ok) throw new Error("HTTP " + response.status);
                const latency = Math.max(0, getTimestampMs() - start);
                const remain = getRateLimitRemaining(response.headers);
                let label = appendLatencyToLabel("Accès privé", latency);
                if (remain) label += ` • Disponible : ${remain}`;
                setStatus(statusEl, { state: "ready", label });
                return true;
            } catch (err) {
                // fallback to proxy below
            }
        }
        try {
            const start = getTimestampMs();
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model,
                    input: [{ role: "user", content: [{ type: "input_text", text: "Vérification" }] }],
                    stream: false
                })
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const latency = Math.max(0, getTimestampMs() - start);
            setStatus(statusEl, { state: "ready", label: appendLatencyToLabel("Accès partagé", latency) });
            return true;
        } catch (err) {
            setStatus(statusEl, { state: "warning", label: "Clé invalide" });
            return false;
        }
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
            const response = await fetch("https://api.assemblyai.com/v2/transcript", {
                method: "GET",
                headers: { Authorization: key }
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            setStatus(statusEl, { state: "ready", label: "Accès privé" });
            return true;
        } catch (err) {
            const proxyBase = (global.GO_TOOLKIT_ASSEMBLYAI_TOKEN_URL || "https://assemblyai.gotoolkit.workers.dev/token").replace(/\/token$/, "");
            try {
                const proxyResponse = await fetch(proxyBase + "/transcript", {
                    method: "GET",
                    headers: { Authorization: key }
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
            if (!response.ok) throw new Error("HTTP " + response.status);
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
            setStatus(statusEl, { state: "error", label: "Accès partagé indisponible" });
            if (modelLabelEl) modelLabelEl.textContent = "Accès partagé indisponible";
            return false;
        }
    }

    function bindVerifyButtons() {
        const openaiVerifyBtn = doc.getElementById("openaiVerifyBtn");
        const assemblyAiVerifyBtn = doc.getElementById("assemblyAiVerifyBtn");
        const openrouterVerifyBtn = doc.getElementById("openrouterVerifyBtn");

        if (openaiVerifyBtn && openaiVerifyBtn.dataset.verifyBound !== "1") {
            openaiVerifyBtn.addEventListener("click", async function () {
                try {
                    const handlers = global.GoToolkitSettingsModalHandlers || {};
                    if (typeof handlers.onVerifyOpenAi === "function") {
                        await handlers.onVerifyOpenAi();
                    } else {
                        await testOpenAiConnection();
                    }
                } catch (err) { /* noop */ }
            });
            openaiVerifyBtn.dataset.verifyBound = "1";
        }

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

    function syncBackendSettingsVisibility() {
        const aiBackendSelect = doc.getElementById("aiBackendSelect");
        const openaiSettingsEl = doc.getElementById("openaiSettings");
        const openrouterSettingsEl = doc.getElementById("openrouterSettings");
        if (!aiBackendSelect) return;
        const value = (aiBackendSelect.value || "openrouter").toLowerCase();
        if (openaiSettingsEl) openaiSettingsEl.style.display = value === "openai" ? "" : "none";
        if (openrouterSettingsEl) openrouterSettingsEl.style.display = value === "openrouter" ? "" : "none";
        if (value === "openrouter") {
            populateOpenrouterModelInput();
            populateOpenrouterOcrModelInput();
            populateOpenrouterEmbeddingsModelInput();
        }
    }

    function bindBackendSelector() {
        const aiBackendSelect = doc.getElementById("aiBackendSelect");
        if (!aiBackendSelect || aiBackendSelect.dataset.backendBound === "1") return;
        try {
            const stored = localStorage.getItem("go-toolkit-ai-backend");
            if (stored && !aiBackendSelect.value) {
                aiBackendSelect.value = stored;
            }
        } catch (err) { /* noop */ }
        aiBackendSelect.addEventListener("change", function () {
            try {
                localStorage.setItem("go-toolkit-ai-backend", aiBackendSelect.value || "openrouter");
            } catch (err) { /* noop */ }
            syncBackendSettingsVisibility();
        });
        aiBackendSelect.dataset.backendBound = "1";
        syncBackendSettingsVisibility();
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
        const resetChatPromptBtn = modal?.querySelector("#resetChatPromptBtn");
        if (!resetChatPromptBtn) return;
        resetChatPromptBtn.hidden = tabId !== "promptTab";
    }

    function activateSettingsTab(modal, tabId) {
        const { buttons, panels } = getSettingsTabNodes(modal);
        if (!buttons.length || !panels.length) return;
        const resolvedTabId = tabId || buttons[0]?.dataset?.tab || "servicesTab";
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
                if (onTabChange) onTabChange(nextTab);
            });
        });
        modal.dataset.settingsTabsBound = "1";
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

        const api = {
            open: function () {
                if (onOpen) onOpen();
                bindBackendSelector();
                syncBackendSettingsVisibility();
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
                api.close();
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
        populateOpenrouterModelInput,
        populateOpenrouterOcrModelInput,
        populateOpenrouterEmbeddingsModelInput,
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
        testOpenAiConnection,
        testAssemblyAiConnection,
        testOpenRouterConnection
    };

    function ensureSharedSettingsModalStructure() {
        const modal = doc.getElementById("settingsModal");
        if (!modal) return;
        if (!modal.querySelector(".settings-modal")) {
            modal.innerHTML = SHARED_SETTINGS_MODAL_HTML;
        }
        bindSettingsTabs(modal);
        activateSettingsTab(modal, "servicesTab");
        bindBackendSelector();
        syncBackendSettingsVisibility();
        bindRepairButton();
        bindVerifyButtons();
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

    const NOTION_STORAGE_DEVICE_KEY = "go-toolkit-notion-device-id";
    const DEFAULT_NOTION_API_BASE = (global.GO_TOOLKIT_NOTION_API_URL || "https://notion.gotoolkit.workers.dev").replace(/\/$/, "");

    function getNotionApiBaseUrl() {
        return (global.GO_TOOLKIT_NOTION_API_URL || DEFAULT_NOTION_API_BASE).replace(/\/$/, "");
    }

    function getNotionDeviceId() {
        try {
            const existing = (localStorage.getItem(NOTION_STORAGE_DEVICE_KEY) || "").trim();
            if (existing) return existing;
            const next = (crypto?.randomUUID?.() || `notion-${Date.now()}-${Math.random().toString(16).slice(2)}`).trim();
            localStorage.setItem(NOTION_STORAGE_DEVICE_KEY, next);
            return next;
        } catch (err) {
            return `notion-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    }

    async function notionJsonPost(path, body) {
        const response = await fetch(`${getNotionApiBaseUrl()}${path}`, {
            method: "POST",
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
        const deviceId = getNotionDeviceId();
        const origin = global.location.origin;
        const api = getNotionApiBaseUrl();
        const url = `${api}/oauth/start?deviceId=${encodeURIComponent(deviceId)}&origin=${encodeURIComponent(origin)}`;
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
                try { popup.close(); } catch (err) { /* noop */ }
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
        return notionJsonPost("/auth/status", { deviceId: getNotionDeviceId() });
    }

    async function notionGetWorkspaces() {
        return notionJsonPost("/auth/workspaces", { deviceId: getNotionDeviceId() });
    }

    async function notionSelectWorkspace(workspaceId) {
        return notionJsonPost("/auth/workspace/select", {
            deviceId: getNotionDeviceId(),
            workspaceId: String(workspaceId || "").trim()
        });
    }

    async function notionDisconnect() {
        return notionJsonPost("/auth/disconnect", { deviceId: getNotionDeviceId() });
    }

    async function notionEnsureConnected() {
        const status = await notionGetAuthStatus();
        if (status?.connected) return true;
        await openNotionOAuthPopup();
        return true;
    }

    async function notionListPages(options) {
        return notionJsonPost("/pages/list", {
            deviceId: getNotionDeviceId(),
            workspaceId: String(options?.workspaceId || "").trim(),
            parentId: String(options?.parentId || "").trim()
        });
    }

    async function notionPublishPage(options) {
        return notionJsonPost("/pages/publish", {
            deviceId: getNotionDeviceId(),
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
            deviceId: getNotionDeviceId(),
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

    const MICROSOFT_STORAGE_DEVICE_KEY = "go-toolkit-microsoft-device-id";
    const DEFAULT_MICROSOFT_API_BASE = (global.GO_TOOLKIT_MICROSOFT_API_URL || "https://ms.gotoolkit.workers.dev").replace(/\/$/, "");

    function getMicrosoftApiBaseUrl() {
        return (global.GO_TOOLKIT_MICROSOFT_API_URL || DEFAULT_MICROSOFT_API_BASE).replace(/\/$/, "");
    }

    function getMicrosoftDeviceId() {
        try {
            const existing = (localStorage.getItem(MICROSOFT_STORAGE_DEVICE_KEY) || "").trim();
            if (existing) return existing;
            const next = (crypto?.randomUUID?.() || `ms-${Date.now()}-${Math.random().toString(16).slice(2)}`).trim();
            localStorage.setItem(MICROSOFT_STORAGE_DEVICE_KEY, next);
            return next;
        } catch (err) {
            return `ms-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    }

    async function microsoftJsonPost(path, body) {
        const response = await fetch(`${getMicrosoftApiBaseUrl()}${path}`, {
            method: "POST",
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
        const deviceId = getMicrosoftDeviceId();
        const origin = global.location.origin;
        const api = getMicrosoftApiBaseUrl();
        const url = `${api}/oauth/start?deviceId=${encodeURIComponent(deviceId)}&origin=${encodeURIComponent(origin)}`;
        const popup = global.open(url, "gotoolkit-microsoft-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-microsoft-oauth") return;
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
                try { popup.close(); } catch (err) { /* noop */ }
            }
            global.addEventListener("message", onMessage);
            closedTimer = setInterval(() => {
                if (!popup || popup.closed) {
                    cleanup();
                    reject(new Error("Connexion Outlook annulee"));
                }
            }, 300);
        });
    }

    async function microsoftGetAuthStatus() {
        return microsoftJsonPost("/auth/status", { deviceId: getMicrosoftDeviceId() });
    }

    async function microsoftDisconnect() {
        return microsoftJsonPost("/auth/disconnect", { deviceId: getMicrosoftDeviceId() });
    }

    async function microsoftEnsureConnected() {
        const status = await microsoftGetAuthStatus();
        if (status?.connected) return true;
        await openMicrosoftOAuthPopup();
        return true;
    }

    async function microsoftCreateDraft(options = {}) {
        return microsoftJsonPost("/mail/draft/create", {
            deviceId: getMicrosoftDeviceId(),
            subject: String(options?.subject || "Document").trim() || "Document",
            html: String(options?.html || ""),
            text: String(options?.text || ""),
            attachments: Array.isArray(options?.attachments) ? options.attachments : []
        });
    }

    global.GoToolkitMicrosoftPublish = {
        getDeviceId: getMicrosoftDeviceId,
        getAuthStatus: microsoftGetAuthStatus,
        ensureConnected: microsoftEnsureConnected,
        disconnect: microsoftDisconnect,
        createDraft: microsoftCreateDraft
    };

    const GMAIL_STORAGE_DEVICE_KEY = "go-toolkit-gmail-device-id";
    const DEFAULT_GMAIL_API_BASE = (global.GO_TOOLKIT_GMAIL_API_URL || "https://gmail.gotoolkit.workers.dev").replace(/\/$/, "");

    function getGmailApiBaseUrl() {
        return (global.GO_TOOLKIT_GMAIL_API_URL || DEFAULT_GMAIL_API_BASE).replace(/\/$/, "");
    }

    function getGmailDeviceId() {
        try {
            const existing = (localStorage.getItem(GMAIL_STORAGE_DEVICE_KEY) || "").trim();
            if (existing) return existing;
            const next = (crypto?.randomUUID?.() || `gmail-${Date.now()}-${Math.random().toString(16).slice(2)}`).trim();
            localStorage.setItem(GMAIL_STORAGE_DEVICE_KEY, next);
            return next;
        } catch (err) {
            return `gmail-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    }

    async function gmailJsonPost(path, body) {
        const response = await fetch(`${getGmailApiBaseUrl()}${path}`, {
            method: "POST",
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
        const deviceId = getGmailDeviceId();
        const origin = global.location.origin;
        const api = getGmailApiBaseUrl();
        const url = `${api}/oauth/start?deviceId=${encodeURIComponent(deviceId)}&origin=${encodeURIComponent(origin)}`;
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
                try { popup.close(); } catch (err) { /* noop */ }
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
        return gmailJsonPost("/auth/status", { deviceId: getGmailDeviceId() });
    }

    async function gmailDisconnect() {
        return gmailJsonPost("/auth/disconnect", { deviceId: getGmailDeviceId() });
    }

    async function gmailEnsureConnected() {
        const status = await gmailGetAuthStatus();
        if (status?.connected) return true;
        await openGmailOAuthPopup();
        return true;
    }

    async function gmailCreateDraft(options = {}) {
        return gmailJsonPost("/mail/draft/create", {
            deviceId: getGmailDeviceId(),
            subject: String(options?.subject || "Document").trim() || "Document",
            html: String(options?.html || ""),
            text: String(options?.text || ""),
            attachments: Array.isArray(options?.attachments) ? options.attachments : []
        });
    }

    global.GoToolkitGmailPublish = {
        getDeviceId: getGmailDeviceId,
        getAuthStatus: gmailGetAuthStatus,
        ensureConnected: gmailEnsureConnected,
        disconnect: gmailDisconnect,
        createDraft: gmailCreateDraft
    };
})(window);
