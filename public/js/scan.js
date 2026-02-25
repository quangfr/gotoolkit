(() => {
  const STORAGE_KEY = "goToolkit.handoff.documents";
  const HANDOFF_COLLECTION = "handoffs";
  const CODE_COLLECTION = "codes_map";
  const OCR_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
  const MOBILE_EDIT_MODEL = "openai/gpt-oss-120b";
  const MOBILE_EDIT_TEMPERATURE = 0.3;
  const MOBILE_EDIT_PRESET_FALLBACK =
    "Tu modifies le HANDOFF selon ASK. Réponds uniquement avec un objet JSON strict: {\"title\":\"résumé 2-3 mots\",\"content\":\"contenu final complet\"}. Ne pas ajouter spontanément des émojis si ce n'est pas demandé. Pas de tableau. Pas de Markdown.";
  const MOBILE_CHAT_HISTORY_KEY = "goToolkit.hub.mobileChatHistory";
  const HANDOFF_HISTORY_KEY = "goToolkit.handoff.history";
  const HANDOFF_HISTORY_LIMIT = 30;
  const HANDOFF_HISTORY_INPUT_DEBOUNCE_MS = 450;
  const MOBILE_CHAT_DISMISSED_DEFAULTS_KEY = "goToolkit.hub.mobileChatDismissedDefaults";
  const MOBILE_CHAT_DEFAULT_SUGGESTIONS = Array.isArray(window.GoToolkitPromptShortcuts?.mobileSuggestions)
    ? window.GoToolkitPromptShortcuts.mobileSuggestions
    : [
      "Faire le compte-rendu",
      "Résumer en 3 lignes",
      "Faire une foire aux questions"
    ];
  const MAX_IMAGE_DIM = 2048;

  const shareWorker = window.goToolkitShareWorker;
  const handoffGrid = document.getElementById("handoffGrid");
  const handoffStatus = document.getElementById("handoffStatus");
  const scanQrBtn = document.getElementById("scanQrBtn");
  const scanCodeBtn = document.getElementById("scanCodeBtn");
  const newHandoffBtn = document.getElementById("newHandoffBtn");
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const captureModal = document.getElementById("captureModal");
  const captureModalClose = document.getElementById("captureModalClose");
  const captureSendBtn = document.getElementById("captureSendBtn");
  const captureSaveBtn = document.getElementById("captureSaveBtn");
  const captureInput = document.getElementById("captureInput");
  const captureGalleryInput = document.getElementById("captureGalleryInput");
  const captureAudioInput = document.getElementById("captureAudioInput");
  const captureTextBtn = document.getElementById("captureTextBtn");
  const capturePreview = document.getElementById("capturePreview");
  const captureLoader = document.getElementById("captureLoader");
  const captureInstruction = document.getElementById("captureInstruction");
  const captureStep1 = document.getElementById("captureStep1");
  const captureStep2 = document.getElementById("captureStep2");
  const captureCameraBtn = document.getElementById("captureCameraBtn");
  const captureGalleryBtn = document.getElementById("captureGalleryBtn");
  const captureAudioBtn = document.getElementById("captureAudioBtn");
  const captureDeleteBtn = document.getElementById("captureDeleteBtn");
  const captureUndoBtn = document.getElementById("captureUndoBtn");
  const captureRedoBtn = document.getElementById("captureRedoBtn");
  const captureReadAloudBtn = document.getElementById("captureReadAloudBtn");
  const captureBotBtn = document.getElementById("captureBotBtn");
  const captureDocTitle = document.getElementById("captureDocTitle");
  const captureDocMeta = document.getElementById("captureDocMeta");
  const mobileBotModal = document.getElementById("mobileBotModal");
  const mobileBotModalClose = document.getElementById("mobileBotModalClose");
  const mobileBotSuggestions = document.getElementById("mobileBotSuggestions");
  const mobileChatTextarea = document.getElementById("mobileChatTextarea");
  const mobileChatSendBtn = document.getElementById("mobileChatSendBtn");
  const hubToast = document.getElementById("hubToast");
  const codeModal = document.getElementById("codeModal");
  const codeModalClose = document.getElementById("codeModalClose");
  const codeCancelBtn = document.getElementById("codeCancelBtn");
  const codeSubmitBtn = document.getElementById("codeSubmitBtn");
  const codeInput = document.getElementById("codeInput");
  const sendMethodModal = document.getElementById("sendMethodModal");
  const sendMethodModalClose = document.getElementById("sendMethodModalClose");
  const sendViaQrBtn = document.getElementById("sendViaQrBtn");
  const sendViaCodeBtn = document.getElementById("sendViaCodeBtn");
  const sendViaMailtoBtn = document.getElementById("sendViaMailtoBtn");
  const sendViaGmailBtn = document.getElementById("sendViaGmailBtn");
  const sendViaOutlookBtn = document.getElementById("sendViaOutlookBtn");
  const qrModal = document.getElementById("qrModal");
  const qrModalClose = document.getElementById("qrModalClose");
  const qrCancelBtn = document.getElementById("qrCancelBtn");
  const qrVideo = document.getElementById("qrVideo");
  const renameModal = document.getElementById("renameModal");
  const renameModalClose = document.getElementById("renameModalClose");
  const renameCancelBtn = document.getElementById("renameCancelBtn");
  const renameSubmitBtn = document.getElementById("renameSubmitBtn");
  const renameInput = document.getElementById("renameInput");
  const settingsModal = document.getElementById("settingsModal");
  const settingsModalApi = window.GoToolkitSettingsModal?.bind?.({
    modalId: "settingsModal",
    closeBtnId: "closeSettingsBtn",
    triggerIds: []
  });

  let handoffDocs = loadDocuments();
  let activeDocId = null;
  let syncedContent = "";
  let captureCanvases = [];
  let qrStream = null;
  let qrScanActive = false;
  let googleTtsController = null;
  let mobileEditLoading = false;
  let toastTimer = null;
  let captureHistoryBufferTimer = null;
  let skipCapturePreviewHistorySync = false;
  const isAutomation = typeof navigator !== "undefined" && navigator.webdriver === true;

  function setStatus(message) {
    if (handoffStatus) {
      handoffStatus.textContent = message || "";
    }
  }

  function isLikelyIOSDevice() {
    try {
      const ua = String(navigator?.userAgent || "");
      const platform = String(navigator?.platform || "");
      const maxTouchPoints = Number(navigator?.maxTouchPoints || 0);
      return /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
    } catch (err) {
      return false;
    }
  }

  async function saveAudioBlobWithFallback(audioBlob, filename) {
    const normalizedBlob =
      audioBlob instanceof Blob ? audioBlob : new Blob([audioBlob], { type: "audio/mpeg" });
    const safeName = String(filename || "hub-audio.mp3");
    const isIOS = isLikelyIOSDevice();

    if (isIOS && typeof File === "function" && navigator?.share && navigator?.canShare) {
      try {
        const shareFile = new File([normalizedBlob], safeName, {
          type: normalizedBlob.type || "audio/mpeg"
        });
        if (navigator.canShare({ files: [shareFile] })) {
          await navigator.share({
            files: [shareFile],
            title: safeName
          });
          return { ok: true, mode: "share" };
        }
      } catch (err) {
        // Ignore and fallback to direct download/open.
      }
    }

    const url = URL.createObjectURL(normalizedBlob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = safeName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (isIOS) {
        setTimeout(() => {
          try {
            window.open(url, "_blank", "noopener");
          } catch (err) {
            // ignore popup/open failures
          }
        }, 120);
      }

      return { ok: true, mode: "download" };
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  function showHubToast(message) {
    if (!hubToast) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    hubToast.textContent = message || "";
    hubToast.classList.add("visible");
    toastTimer = setTimeout(() => {
      hubToast.classList.remove("visible");
      toastTimer = null;
    }, 2000);
  }

  function getMobileEditPresetPrompt() {
    return (
      window.GoToolkitPromptPresets?.["mobile-edit"]?.prompt ||
      window.GoToolkitChatPrompt?.PRESETS?.["mobile-edit"]?.prompt ||
      MOBILE_EDIT_PRESET_FALLBACK
    );
  }

  function parseMobileEditJsonResponse(rawText) {
    const raw = String(rawText || "").trim();
    if (!raw) return { ok: false, reason: "EMPTY_RESPONSE" };

    let candidate = raw;
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) {
      candidate = fencedMatch[1].trim();
    }

    let parsed = null;
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      const firstBrace = candidate.indexOf("{");
      const lastBrace = candidate.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
        } catch (innerErr) {
          parsed = null;
        }
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "INVALID_JSON" };
    }

    const title = String(parsed.title || "").trim();
    const content = String(parsed.content || "").trim();
    if (!content) {
      return { ok: false, reason: "MISSING_CONTENT" };
    }

    return {
      ok: true,
      title: title || "Document",
      content
    };
  }

  function loadMobileChatHistory() {
    try {
      const raw = localStorage.getItem(MOBILE_CHAT_HISTORY_KEY);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(item => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 20);
    } catch (err) {
      return [];
    }
  }

  function loadDismissedDefaultSuggestions() {
    try {
      const raw = localStorage.getItem(MOBILE_CHAT_DISMISSED_DEFAULTS_KEY);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.map(item => String(item || "").trim()).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  function saveDismissedDefaultSuggestions(list) {
    try {
      localStorage.setItem(
        MOBILE_CHAT_DISMISSED_DEFAULTS_KEY,
        JSON.stringify((list || []).map(item => String(item || "").trim()).filter(Boolean))
      );
    } catch (err) {
      // ignore
    }
  }

  function saveMobileChatHistory(list) {
    try {
      localStorage.setItem(MOBILE_CHAT_HISTORY_KEY, JSON.stringify((list || []).slice(0, 20)));
    } catch (err) {
      // ignore storage failures
    }
  }

  function addMobileChatSuggestion(text) {
    const normalized = String(text || "").trim();
    if (!normalized) return;
    const existing = loadMobileChatHistory().filter(item => item !== normalized);
    existing.unshift(normalized);
    saveMobileChatHistory(existing);
  }

  function removeMobileChatSuggestion(text) {
    const normalized = String(text || "").trim();
    if (!normalized) return;
    const next = loadMobileChatHistory().filter(item => item !== normalized);
    saveMobileChatHistory(next);
  }

  function removeDefaultSuggestion(text) {
    const normalized = String(text || "").trim();
    if (!normalized) return;
    const next = loadDismissedDefaultSuggestions().filter(item => item !== normalized);
    next.push(normalized);
    saveDismissedDefaultSuggestions(next);
  }

  function loadHandoffHistoryMap() {
    try {
      const raw = localStorage.getItem(HANDOFF_HISTORY_KEY);
      const parsed = JSON.parse(raw || "{}");
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch (err) {
      return {};
    }
  }

  function saveHandoffHistoryMap(map) {
    try {
      localStorage.setItem(HANDOFF_HISTORY_KEY, JSON.stringify(map || {}));
    } catch (err) {
      // ignore
    }
  }

  function normalizeHistoryArray(input) {
    if (!Array.isArray(input)) return [];
    return input.map(item => String(item || "")).slice(-HANDOFF_HISTORY_LIMIT);
  }

  function normalizeHandoffHistoryState(value) {
    if (Array.isArray(value)) {
      const history = normalizeHistoryArray(value);
      return {
        past: history.slice(0, -1),
        present: history[history.length - 1] || "",
        future: []
      };
    }
    if (!value || typeof value !== "object") {
      return { past: [], present: "", future: [] };
    }
    const past = normalizeHistoryArray(value.past || value.undo);
    const future = normalizeHistoryArray(value.future || value.redo).reverse();
    return {
      past,
      present: String(value.present || ""),
      future
    };
  }

  function getHandoffHistoryState(docId) {
    if (!docId) return { past: [], present: "", future: [] };
    const map = loadHandoffHistoryMap();
    return normalizeHandoffHistoryState(map[docId]);
  }

  function saveHandoffHistoryState(docId, state) {
    const id = String(docId || "").trim();
    if (!id) return;
    const map = loadHandoffHistoryMap();
    map[id] = {
      past: normalizeHistoryArray(state?.past),
      present: String(state?.present || ""),
      future: normalizeHistoryArray(state?.future).reverse()
    };
    saveHandoffHistoryMap(map);
  }

  function ensureHandoffHistoryState(docId, initialValue) {
    const id = String(docId || "").trim();
    if (!id) return;
    const state = getHandoffHistoryState(id);
    if (!state.present && !state.past.length && !state.future.length) {
      saveHandoffHistoryState(id, {
        past: [],
        present: String(initialValue || ""),
        future: []
      });
    }
  }

  function recordHandoffOperation(docId, value, clearFuture = true) {
    const id = String(docId || "").trim();
    if (!id) return;
    const nextValue = String(value || "");
    const state = getHandoffHistoryState(id);
    if (state.present === nextValue) return;
    const nextPast = state.past.concat(state.present).slice(-HANDOFF_HISTORY_LIMIT);
    saveHandoffHistoryState(id, {
      past: nextPast,
      present: nextValue,
      future: clearFuture ? [] : state.future
    });
  }

  function undoHandoffOperation(docId) {
    const id = String(docId || "").trim();
    if (!id) return { ok: false, value: "" };
    const state = getHandoffHistoryState(id);
    if (!state.past.length) return { ok: false, value: state.present };
    const previous = state.past[state.past.length - 1];
    const nextPast = state.past.slice(0, -1);
    const nextFuture = [state.present, ...state.future].slice(0, HANDOFF_HISTORY_LIMIT);
    saveHandoffHistoryState(id, {
      past: nextPast,
      present: previous,
      future: nextFuture
    });
    return { ok: true, value: previous };
  }

  function redoHandoffOperation(docId) {
    const id = String(docId || "").trim();
    if (!id) return { ok: false, value: "" };
    const state = getHandoffHistoryState(id);
    if (!state.future.length) return { ok: false, value: state.present };
    const next = state.future[0];
    const nextFuture = state.future.slice(1);
    const nextPast = state.past.concat(state.present).slice(-HANDOFF_HISTORY_LIMIT);
    saveHandoffHistoryState(id, {
      past: nextPast,
      present: next,
      future: nextFuture
    });
    return { ok: true, value: next };
  }

  function canUndoHandoffOperation(docId) {
    return getHandoffHistoryState(docId).past.length > 0;
  }

  function canRedoHandoffOperation(docId) {
    return getHandoffHistoryState(docId).future.length > 0;
  }

  function flushCaptureHistoryBuffer() {
    if (captureHistoryBufferTimer) {
      clearTimeout(captureHistoryBufferTimer);
      captureHistoryBufferTimer = null;
    }
    if (!activeDocId || !capturePreview) return;
    recordHandoffOperation(activeDocId, capturePreview.value || "", true);
    updateHistoryButtons();
  }

  function scheduleCaptureHistoryCommit() {
    if (captureHistoryBufferTimer) {
      clearTimeout(captureHistoryBufferTimer);
    }
    captureHistoryBufferTimer = setTimeout(() => {
      captureHistoryBufferTimer = null;
      if (!activeDocId || !capturePreview) return;
      recordHandoffOperation(activeDocId, capturePreview.value || "", true);
      updateHistoryButtons();
    }, HANDOFF_HISTORY_INPUT_DEBOUNCE_MS);
  }

  function setCapturePreviewValue(value) {
    if (!capturePreview) return;
    skipCapturePreviewHistorySync = true;
    capturePreview.value = String(value || "");
    skipCapturePreviewHistorySync = false;
  }

  function updateHistoryButtons() {
    const hasActive = Boolean(activeDocId);
    if (captureUndoBtn) {
      captureUndoBtn.disabled = !hasActive || !canUndoHandoffOperation(activeDocId);
    }
    if (captureRedoBtn) {
      captureRedoBtn.disabled = !hasActive || !canRedoHandoffOperation(activeDocId);
    }
  }

  function autoResizeMobileChatInput() {
    if (!mobileChatTextarea) return;
    mobileChatTextarea.style.height = "auto";
    mobileChatTextarea.style.height = `${mobileChatTextarea.scrollHeight}px`;
  }

  function applySuggestionToMobileChat(text) {
    if (!mobileChatTextarea) return;
    const current = mobileChatTextarea.value || "";
    const nextValue = current.trim() ? `${current}\n${text}` : text;
    mobileChatTextarea.value = nextValue;
    autoResizeMobileChatInput();
    mobileChatTextarea.focus();
  }

  function renderMobileBotSuggestions() {
    if (!mobileBotSuggestions) return;
    const history = loadMobileChatHistory();
    const dismissedDefaults = new Set(loadDismissedDefaultSuggestions());
    const entries = history.map(text => ({ text, isHistory: true }))
      .concat(
        MOBILE_CHAT_DEFAULT_SUGGESTIONS
          .filter(text => !dismissedDefaults.has(text))
          .map(text => ({ text, isHistory: false }))
      );
    mobileBotSuggestions.innerHTML = "";

    entries.forEach(entry => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "mobile-bot-suggestion";

      const textEl = document.createElement("span");
      textEl.className = "mobile-bot-suggestion-text";
      textEl.textContent = entry.text;
      row.appendChild(textEl);

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "mobile-bot-suggestion-clear";
      clearBtn.title = "Supprimer";
      clearBtn.innerHTML = "<i data-lucide=\"x\" style=\"width:14px;height:14px;\"></i>";
      clearBtn.addEventListener("click", event => {
        event.stopPropagation();
        if (entry.isHistory) {
          removeMobileChatSuggestion(entry.text);
        } else {
          removeDefaultSuggestion(entry.text);
        }
        renderMobileBotSuggestions();
      });
      row.appendChild(clearBtn);

      row.addEventListener("click", () => {
        applySuggestionToMobileChat(entry.text);
      });

      mobileBotSuggestions.appendChild(row);
    });

    if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  }

  function setMobileChatLoading(loading) {
    mobileEditLoading = Boolean(loading);
    if (!mobileChatSendBtn) return;
    mobileChatSendBtn.disabled = mobileEditLoading;
    mobileChatSendBtn.classList.toggle("is-loading", mobileEditLoading);
    mobileChatSendBtn.innerHTML = mobileEditLoading
      ? "<i data-lucide=\"loader-circle\" style=\"width:16px;height:16px;\"></i>"
      : "<i data-lucide=\"send\" style=\"width:16px;height:16px;\"></i>";
    if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  }

  function openMobileBotModal() {
    if (!mobileBotModal) return;
    renderMobileBotSuggestions();
    mobileBotModal.classList.add("open");
    if (mobileChatTextarea && !mobileChatTextarea.value) {
      mobileChatTextarea.value = "";
    }
    autoResizeMobileChatInput();
    mobileChatTextarea?.focus();
  }

  function closeMobileBotModal() {
    if (!mobileBotModal) return;
    mobileBotModal.classList.remove("open");
    setMobileChatLoading(false);
  }

  function updateUIState() {
    if (!activeDocId) return;
    const doc = getDocumentById(activeDocId);
    const currentContent = (capturePreview?.value || "").trim();
    const isLinked = doc && !doc.isDraft;
    const isModified = currentContent !== syncedContent;

    // Toggle Buttons
    if (!isLinked || isModified) {
      if (captureSendBtn) captureSendBtn.style.display = "flex";
      if (captureSaveBtn) captureSaveBtn.style.display = "none";
    } else {
      if (captureSendBtn) captureSendBtn.style.display = "none";
      if (captureSaveBtn) captureSaveBtn.style.display = "flex";
    }

    // Toggle Instructions
    if (captureInstruction) {
      const showInstruction = isLinked && syncedContent.length > 0 && !isModified;
      captureInstruction.style.display = showInstruction ? "block" : "none";
    }
    updateHistoryButtons();
  }

  function loadDocuments() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) {
        return parsed.filter(doc => doc && doc.id);
      }
    } catch (err) {
      console.warn("Handoff storage read failed", err);
    }
    return [];
  }

  function saveDocuments() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(handoffDocs));
    } catch (err) {
      console.warn("Handoff storage write failed", err);
    }
  }

  function upsertDocument(doc) {
    const now = new Date().toISOString();
    const normalized = {
      id: doc.id,
      title: doc.title || "Document",
      updatedAt: now,
      hasContent: Boolean(doc.hasContent),
      lastContent: typeof doc.lastContent === "string" ? doc.lastContent : undefined,
      lastCapturedAt: doc.lastCapturedAt || now,
      isDraft: Boolean(doc.isDraft)
    };
    const index = handoffDocs.findIndex(item => item.id === normalized.id);
    if (index >= 0) {
      handoffDocs[index] = { ...handoffDocs[index], ...normalized };
    } else {
      handoffDocs.unshift(normalized);
    }
    saveDocuments();
  }

  function createNewDraftHandoff() {
    const id = "draft-" + Math.random().toString(36).substr(2, 9);
    const drafts = handoffDocs.filter(d => d.isDraft);
    const draftTitle = `Brouillon ${drafts.length + 1}`;
    const now = new Date().toISOString();
    const doc = {
      id,
      title: draftTitle,
      isDraft: true,
      hasContent: false,
      updatedAt: now,
      lastCapturedAt: now
    };
    handoffDocs.unshift(doc);
    saveDocuments();
    renderGrid();
    openCaptureModal(id);
  }

  async function linkDraftToDoc(linkDocId, linkTitle) {
    const draftDoc = getDocumentById(activeDocId);
    if (!draftDoc || !draftDoc.isDraft) return;

    const content = (capturePreview?.value || "").trim();

    // 1. Remove draft
    removeDocument(activeDocId);

    // 2. Add as real doc
    upsertDocument({
      id: linkDocId,
      title: linkTitle || "Document",
      isDraft: false,
      hasContent: Boolean(content),
      lastContent: content,
      lastCapturedAt: new Date().toISOString()
    });

    // 3. Update UI
    activeDocId = linkDocId;
    if (captureDocTitle) {
      const span = captureDocTitle.querySelector("span");
      if (span) span.textContent = linkTitle || "Document";
    }
    if (captureDocMeta) captureDocMeta.textContent = `ID: ${linkDocId}`;

    // 4. Send to Firestore
    if (content && shareWorker?.saveSharePayload) {
      await shareWorker.saveSharePayload(HANDOFF_COLLECTION, linkDocId, {
        text: content,
        title: linkTitle || "Document",
        timestamp: new Date().toISOString()
      });
      syncedContent = content;
    }

    renderGrid();
    updateUIState();
    setStatus("Document lié et envoyé");
  }

  function removeDocument(id) {
    if (!id) return;
    handoffDocs = handoffDocs.filter(item => item.id !== id);
    saveDocuments();
  }

  function getDocumentById(id) {
    return handoffDocs.find(item => item.id === id) || null;
  }

  function formatRelativeTime(isoDate) {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "À l'instant";
    if (diffMinutes < 60) return `Il y a ${diffMinutes} mn`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Il y a ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Il y a ${diffDays} j`;
    const diffWeeks = Math.floor(diffDays / 7);
    return `Il y a ${diffWeeks} sem`;
  }

  function renderGrid() {
    if (!handoffGrid) return;
    handoffGrid.innerHTML = "";
    if (!handoffDocs.length) {
      const empty = document.createElement("div");
      empty.className = "handoff-empty";
      empty.textContent = "Aucun document appairé. Scannez un QR Code ou entrez un code session.";
      handoffGrid.appendChild(empty);
      return;
    }
    handoffDocs.forEach(doc => {
      const card = document.createElement("div");
      card.className = "handoff-card";
      const title = document.createElement("h3");
      title.textContent = doc.title || "Document";
      const desc = document.createElement("div");
      desc.className = "handoff-card__desc";
      desc.textContent = doc.lastContent || "";
      const footer = document.createElement("div");
      footer.className = "handoff-card__footer";
      const meta = document.createElement("span");
      meta.className = "handoff-card__meta";
      meta.textContent = formatRelativeTime(doc.lastCapturedAt || doc.updatedAt);
      const actions = document.createElement("div");
      actions.className = "handoff-card__actions";
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn-secondary";
      if (doc.hasContent) {
        openBtn.innerHTML = "<i data-lucide=\"pen\"></i>";
      } else {
        openBtn.innerHTML = "<i data-lucide=\"text-select\"></i>";
      }
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-secondary";
      removeBtn.innerHTML = "<i data-lucide=\"trash-2\"></i>";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeDocument(doc.id);
        renderGrid();
        setStatus("Document retiré");
      });

      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openCaptureModal(doc.id);
      });

      card.addEventListener("click", () => {
        activeDocId = doc.id;
        openRenameModal(doc.title);
      });

      actions.appendChild(openBtn);
      actions.appendChild(removeBtn);
      card.appendChild(title);
      if (doc.lastContent) {
        card.appendChild(desc);
      }
      footer.appendChild(meta);
      footer.appendChild(actions);
      card.appendChild(footer);
      handoffGrid.appendChild(card);
    });
    if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  }

  async function pruneMissingHandoffs() {
    if (!shareWorker?.fetchSharePayload) return;
    const candidates = handoffDocs.filter(doc => doc?.id && doc.hasContent && !doc.isDraft);
    if (!candidates.length) return;
    const missingIds = [];
    for (const doc of candidates) {
      try {
        const result = await shareWorker.fetchSharePayload(HANDOFF_COLLECTION, doc.id);
        if (!result) {
          missingIds.push(doc.id);
        }
      } catch (err) {
        console.warn("Vérification handoff échouée", doc.id, err);
      }
    }
    if (!missingIds.length) return;
    handoffDocs = handoffDocs.filter(doc => !missingIds.includes(doc.id));
    saveDocuments();
    renderGrid();
    setStatus("Certains documents ne sont plus disponibles.");
  }

  function openCaptureModal(docId) {
    const doc = getDocumentById(docId);
    if (!doc || !captureModal) return;
    activeDocId = docId;
    captureCanvases = [];
    syncedContent = "";

    setCapturePreviewValue(doc.isDraft ? (doc.lastContent || "") : "");
    if (captureInput) captureInput.value = "";
    if (captureGalleryInput) captureGalleryInput.value = "";
    if (captureAudioInput) captureAudioInput.value = "";
    if (captureDocTitle) {
      const span = captureDocTitle.querySelector("span");
      if (span) span.textContent = doc.title || "Document";
    }
    if (captureDocMeta) captureDocMeta.textContent = doc.isDraft ? "" : `ID: ${docId}`;
    ensureHandoffHistoryState(docId, capturePreview?.value || "");
    updateHistoryButtons();

    setCaptureStep(doc.hasContent ? 2 : 1);
    setCaptureTitle(doc.hasContent ? "scan" : "mobile");
    captureModal.classList.add("open");

    if (!doc.isDraft && shareWorker?.fetchSharePayload) {
      setLoaderActive(true);
      shareWorker
        .fetchSharePayload(HANDOFF_COLLECTION, docId)
        .then(result => {
          const text = result?.payload?.text || "";
          syncedContent = text;
          setCapturePreviewValue(text);
          ensureHandoffHistoryState(docId, text);
          if (text) {
            setCaptureStep(2);
            upsertDocument({
              id: docId,
              title: doc.title,
              hasContent: true,
              lastContent: text,
              lastCapturedAt: result?.meta?.updatedAt || new Date().toISOString()
            });
            renderGrid();
          } else {
            setCaptureStep(1);
          }
        })
        .catch(err => {
          console.error(err);
          setStatus("Chargement échoué");
        })
        .finally(() => {
          setLoaderActive(false);
          updateUIState();
        });
    } else {
      updateUIState();
      updateHistoryButtons();
    }
  }

  function closeCaptureModal() {
    if (!captureModal) return;
    captureModal.classList.remove("open");
    closeMobileBotModal();
    activeDocId = null;
    if (captureHistoryBufferTimer) {
      clearTimeout(captureHistoryBufferTimer);
      captureHistoryBufferTimer = null;
    }
    captureCanvases = [];
    setCaptureStep(1);
    closeSendMethodModal();
    updateHistoryButtons();
  }

  function setCaptureStep(step) {
    if (captureStep1) captureStep1.classList.toggle("active", step === 1);
    if (captureStep2) captureStep2.classList.toggle("active", step === 2);
    const actions = document.getElementById("captureModalActions");
    if (actions) actions.style.display = (step === 2) ? "flex" : "none";
    if (captureReadAloudBtn) {
      if (step === 2) {
        captureReadAloudBtn.classList.add("active");
      } else {
        captureReadAloudBtn.classList.remove("active");
        if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
      }
    }
    if (captureBotBtn) {
      if (step === 2) {
        captureBotBtn.classList.add("active");
      } else {
        captureBotBtn.classList.remove("active");
        closeMobileBotModal();
      }
    }
    if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
      setTimeout(() => lucide.createIcons(), 0);
    }
  }

  function setCaptureTitle(mode) {
    if (!captureDocTitle) return;
    const icon = captureDocTitle.querySelector("i");
    if (icon) {
      let iconName = "tablet-smartphone";
      if (mode === "scan") iconName = "camera";
      if (mode === "gallery") iconName = "image";
      if (mode === "audio") iconName = "cassette-tape";
      if (mode === "text") iconName = "text";
      icon.setAttribute("data-lucide", iconName);
    }
    if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  }

  function openSendMethodModal() {
    if (!sendMethodModal) return;
    sendMethodModal.classList.add("open");
  }

  function closeSendMethodModal() {
    if (!sendMethodModal) return;
    sendMethodModal.classList.remove("open");
  }

  function openCodeModal() {
    if (!codeModal) return;
    if (codeInput) codeInput.value = "";
    codeModal.classList.add("open");
    codeInput?.focus();
  }

  function closeCodeModal() {
    if (!codeModal) return;
    codeModal.classList.remove("open");
  }

  function openQrModal() {
    if (!qrModal) return;
    qrModal.classList.add("open");
    startQrScanner().catch(err => {
      console.warn("QR scanner failed", err);
      closeQrModal();
      fallbackQrPrompt();
    });
  }

  function closeQrModal() {
    if (!qrModal) return;
    qrModal.classList.remove("open");
    stopQrScanner();
  }

  function openRenameModal(initialTitle) {
    if (!renameModal) return;
    if (renameInput) renameInput.value = initialTitle || "";
    renameModal.classList.add("open");
    renameInput?.focus();
  }

  function closeRenameModal() {
    if (!renameModal) return;
    renameModal.classList.remove("open");
  }

  function fallbackQrPrompt() {
    const input = prompt("Scanner QR indisponible. Collez le lien ou l'ID du document :");
    if (!input) return;
    handleIncomingDocInput(input);
  }

  function getEmailComposePayload() {
    const doc = getDocumentById(activeDocId);
    const title = String(doc?.title || "Document").trim() || "Document";
    const text = String(capturePreview?.value || "").trim();
    return { title, text };
  }

  function openMailtoFallback() {
    const { title, text } = getEmailComposePayload();
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
    window.open(mailtoUrl, "_blank", "noopener,noreferrer");
    setStatus("Brouillon messagerie ouvert");
  }

  function openGmailWebFallback() {
    const { text } = getEmailComposePayload();
    const url = `https://mail.google.com/mail/?view=cm&body=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setStatus("Rédaction Gmail web ouverte");
  }

  function openOutlookWebFallback() {
    const { text } = getEmailComposePayload();
    const url = `https://outlook.office.com/mail/deeplink/compose?body=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setStatus("Rédaction Outlook web ouverte");
  }

  function parseDocId(value) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const url = new URL(trimmed);
      const id = url.searchParams.get("id");
      if (id) return id;
    } catch (err) {
      // ignore
    }
    return trimmed;
  }

  function handleIncomingDocInput(input) {
    const docId = parseDocId(input);
    if (!docId) {
      setStatus("Lien invalide");
      return;
    }
    const currentDoc = getDocumentById(activeDocId);
    if (activeDocId && currentDoc?.isDraft) {
      linkDraftToDoc(docId, `Document ${docId.slice(0, 4).toUpperCase()}`).catch(err => {
        console.error(err);
        setStatus("Liaison échouée");
      });
      return;
    }
    const title = `Document ${docId.slice(0, 4).toUpperCase()}`;
    upsertDocument({ id: docId, title });
    renderGrid();
    setStatus("Document ajouté");
    openCaptureModal(docId);
  }

  async function fileToCanvas(file) {
    if (!file) return null;
    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file);
        let w = bitmap.width;
        let h = bitmap.height;
        if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
          const ratio = Math.min(MAX_IMAGE_DIM / w, MAX_IMAGE_DIM / h);
          w = Math.floor(w * ratio);
          h = Math.floor(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, w, h);
        }
        if (typeof bitmap.close === "function") {
          bitmap.close();
        }
        return canvas;
      }
    } catch (err) {
      // fallback below
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Lecture image échouée"));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
            const ratio = Math.min(MAX_IMAGE_DIM / w, MAX_IMAGE_DIM / h);
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
          }
          resolve(canvas);
        };
        img.onerror = () => reject(new Error("Chargement image échoué"));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function encodeImageAsBase64(imageOrCanvas) {
    if (!imageOrCanvas) return "";
    if (typeof HTMLCanvasElement !== "undefined" && imageOrCanvas instanceof HTMLCanvasElement) {
      return imageOrCanvas.toDataURL("image/jpeg", 0.92);
    }
    if (imageOrCanvas instanceof Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error("Lecture image échouée"));
        reader.onload = () => resolve(reader.result || "");
        reader.readAsDataURL(imageOrCanvas);
      });
    }
    return "";
  }

  function setLoaderActive(active, mode = "scan") {
    if (!captureLoader) return;
    if (active) {
      if (mode === "audio") {
        captureLoader.innerHTML = "<i data-lucide=\"cassette-tape\"></i><span>Transcription en cours...</span>";
      } else {
        captureLoader.innerHTML = "<i data-lucide=\"image-up\"></i><span>OCR en cours...</span>";
      }
      captureLoader.classList.add("active");
      if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
        lucide.createIcons();
      }
    } else {
      captureLoader.classList.remove("active");
    }
  }

  async function runOcr() {
    if (!captureCanvases.length) {
      setStatus("Ajoutez des photos avant d'extraire");
      setCaptureStep(1);
      setLoaderActive(false);
      return;
    }
    if (!window.GoToolkitIA?.chatCompletion) {
      setStatus("Service OCR indisponible");
      setCaptureStep(1);
      setLoaderActive(false);
      return;
    }

    try {
      const prompt =
        "Extrayez tout le texte de ces images. Soyez précis. Retournez uniquement le texte brut. " +
        "Langues possibles : français, anglais, vietnamien. Séparez chaque image par une ligne contenant uniquement ---.";
      const content = [{ type: "text", text: prompt }];
      for (const canvas of captureCanvases) {
        const dataUrl = await encodeImageAsBase64(canvas);
        if (!dataUrl) continue;
        content.push({ type: "image_url", image_url: { url: dataUrl } });
      }
      if (content.length <= 1) {
        setStatus("Images invalides");
        return;
      }
      const payload = {
        model: OCR_MODEL,
        stream: false,
        messages: [{ role: "user", content }],
        usage: { include: true }
      };
      const result = await window.GoToolkitIA.chatCompletion({ payload });
      const responseText = typeof result === "string" ? result : (result?.text || "");
      if (!responseText || typeof responseText !== "string") {
        throw new Error("Réponse OCR invalide");
      }
      const raw = responseText.trim();
      let parts = raw.split(/\n\s*-{3,}\s*\n/);
      if (parts.length < captureCanvases.length) {
        const fallback = raw.split(/\n-{3,}\n/);
        if (fallback.length >= parts.length) {
          parts = fallback;
        }
      }
      const combined = parts.map(part => part.trim()).filter(Boolean).join("\n\n");
      setCapturePreviewValue(combined);
      recordHandoffOperation(activeDocId, combined, true);
      updateHistoryButtons();
      await sendHandoff(combined);
      setStatus("Texte envoyé");
    } catch (err) {
      console.error(err);
      setStatus("OCR échoué");
    } finally {
      setLoaderActive(false);
    }
  }

  async function runAudioTranscription(file) {
    if (!file) return;
    const transcriptApi = window.GoToolkitVoiceTranscript;
    if (!transcriptApi) {
      setStatus("Transcription indisponible");
      return;
    }
    setCaptureStep(2);
    setCaptureTitle("audio");
    setLoaderActive(true, "audio");
    let transcriptId = "";
    let storedTranscript = false;
    const key = transcriptApi.getAssemblyApiKey?.() || "";
    const shouldDeleteTranscript =
      window.GO_TOOLKIT_DELETE_ASSEMBLY_TRANSCRIPT_AFTER_STORE !== false;
    try {
      const uploadUrl = await transcriptApi.uploadAudioToAssembly(file, key);
      const payload = transcriptApi.buildAssemblyTranscriptPayload(uploadUrl, 0);
      transcriptId = await transcriptApi.requestAssemblyTranscript(payload, key);
      const result = await transcriptApi.pollAssemblyTranscript(transcriptId, key);
      const transcript =
        transcriptApi.buildTranscriptFromUtterances(result) || result?.text || "";
      if (!transcript) {
        throw new Error("Transcription vide");
      }
      setCapturePreviewValue(transcript);
      recordHandoffOperation(activeDocId, transcript, true);
      storedTranscript = true;
      updateHistoryButtons();
      await sendHandoff(transcript);
      setStatus("Transcription terminée");
    } catch (err) {
      console.error(err);
      setStatus("Transcription échouée");
    } finally {
      if (
        shouldDeleteTranscript &&
        storedTranscript &&
        transcriptId &&
        transcriptApi.deleteAssemblyTranscript
      ) {
        await transcriptApi.deleteAssemblyTranscript(transcriptId, key);
      }
      setLoaderActive(false);
    }
  }

  async function runMobileBotEdit() {
    if (mobileEditLoading) return;
    const handoffText = String(capturePreview?.value || "").trim();
    const askText = String(mobileChatTextarea?.value || "").trim();
    if (!handoffText) {
      setStatus("Contenu handoff vide");
      return;
    }
    if (!askText) {
      setStatus("Demande vide");
      return;
    }
    if (!window.GoToolkitIA?.chatCompletion) {
      setStatus("Service IA indisponible");
      return;
    }

    setMobileChatLoading(true);
    setStatus("Modification IA...");
    try {
      const payload = {
        model: MOBILE_EDIT_MODEL,
        temperature: MOBILE_EDIT_TEMPERATURE,
        stream: false,
        messages: [
          { role: "system", content: getMobileEditPresetPrompt() },
          {
            role: "user",
            content: `HANDOFF\n${handoffText}\n\nASK\n${askText}`
          }
        ],
        usage: { include: true }
      };

      const result = await window.GoToolkitIA.chatCompletion({ payload });
      const responseText = typeof result === "string" ? result : (result?.text || "");
      const parsed = parseMobileEditJsonResponse(responseText);
      if (!parsed.ok) {
        throw new Error(`Réponse IA invalide: ${parsed.reason}`);
      }
      const nextTitle = parsed.title;
      const nextContent = parsed.content;

      setCapturePreviewValue(nextContent);
      recordHandoffOperation(activeDocId, nextContent, true);
      updateHistoryButtons();
      const doc = getDocumentById(activeDocId);
      upsertDocument({
        ...doc,
        id: activeDocId,
        title: nextTitle,
        hasContent: true,
        lastContent: nextContent,
        lastCapturedAt: new Date().toISOString()
      });
      if (captureDocTitle) {
        const span = captureDocTitle.querySelector("span");
        if (span) span.textContent = nextTitle;
      }
      renderGrid();
      updateUIState();
      addMobileChatSuggestion(askText);
      closeMobileBotModal();
      showHubToast("Contenu modifié");
      setStatus("Contenu modifié");
    } catch (err) {
      console.error("Mobile bot edit failed", err);
      setStatus("Modification IA échouée");
    } finally {
      setMobileChatLoading(false);
    }
  }

  async function sendHandoff(textOverride) {
    if (!activeDocId) return;
    const doc = getDocumentById(activeDocId);
    const text = (textOverride || capturePreview?.value || "").trim();

    if (doc?.isDraft) {
      upsertDocument({
        id: activeDocId,
        title: doc.title,
        isDraft: true,
        hasContent: text.length > 0,
        lastContent: text,
        lastCapturedAt: new Date().toISOString()
      });
      renderGrid();
      updateUIState();
      return;
    }

    if (!shareWorker?.saveSharePayload) {
      setStatus("Service de partage indisponible");
      return;
    }
    try {
      await shareWorker.saveSharePayload(HANDOFF_COLLECTION, activeDocId, {
        text,
        title: doc?.title || "Document",
        timestamp: new Date().toISOString()
      });
      syncedContent = text;
      upsertDocument({
        id: activeDocId,
        title: doc?.title,
        hasContent: text.length > 0,
        lastContent: text,
        lastCapturedAt: new Date().toISOString()
      });
      renderGrid();
      setStatus("Contenu envoyé");
      updateUIState();
    } catch (err) {
      console.error(err);
      setStatus("Envoi échoué");
    }
  }

  async function updateHandoffContent() {
    if (!activeDocId) return;
    const doc = getDocumentById(activeDocId);
    const text = (capturePreview?.value || "").trim();

    upsertDocument({
      ...doc,
      hasContent: text.length > 0 || doc.hasContent,
      lastContent: text,
      updatedAt: new Date().toISOString()
    });
    renderGrid();
    updateUIState();
  }

  async function deleteHandoffContent() {
    if (!activeDocId) return;
    if (!shareWorker?.deleteSharePayload) {
      setStatus("Service de partage indisponible");
      return;
    }
    try {
      await shareWorker.deleteSharePayload(HANDOFF_COLLECTION, activeDocId);
      syncedContent = "";
      upsertDocument({
        id: activeDocId,
        title: getDocumentById(activeDocId)?.title,
        hasContent: false,
        lastContent: "",
        lastCapturedAt: ""
      });
      renderGrid();
      setStatus("Contenu supprimé");
      updateUIState();
    } catch (err) {
      console.error(err);
      setStatus("Suppression échouée");
    }
  }

  async function handleCodeSubmit() {
    const code = (codeInput?.value || "").trim().toUpperCase();
    if (!code || code.length !== 4) {
      if (code.length === 4) setStatus("Code invalide");
      return;
    }
    if (!shareWorker?.fetchSharePayload) {
      setStatus("Service de partage indisponible");
      return;
    }
    try {
      const result = await shareWorker.fetchSharePayload(CODE_COLLECTION, code);
      if (!result?.payload?.docId) {
        setStatus("Code introuvable");
        return;
      }
      const currentDoc = getDocumentById(activeDocId);
      if (activeDocId && currentDoc?.isDraft) {
        await linkDraftToDoc(result.payload.docId, result.payload.title || "Document");
      } else {
        upsertDocument({ id: result.payload.docId, title: result.payload.title || "Document" });
        renderGrid();
        openCaptureModal(result.payload.docId);
      }
      await shareWorker.deleteSharePayload(CODE_COLLECTION, code);
      closeCodeModal();
      setStatus("Document ajouté");
    } catch (err) {
      console.error(err);
      setStatus("Code invalide");
    }
  }

  async function handleCaptureFiles(files) {
    if (!files || !files.length) return;

    // Show loader and step 2 immediately while we process images
    setCaptureStep(2);
    setCaptureTitle("scan");
    setLoaderActive(true, "scan");

    captureCanvases = [];
    if (captureDocMeta) {
      captureDocMeta.textContent = `${files.length} photo(s) sélectionnée(s)`;
    }
    for (const file of files) {
      const canvas = await fileToCanvas(file);
      if (!canvas) continue;
      // Skip OpenCV - Qwen VL handles raw images better than pre-processed ones
      captureCanvases.push(canvas);
    }
    setStatus("Photos reçues");
    await runOcr();
  }

  async function startQrScanner() {
    if (!navigator.mediaDevices?.getUserMedia || typeof BarcodeDetector === "undefined") {
      throw new Error("QR scanner unavailable");
    }
    if (qrScanActive) return;
    qrScanActive = true;
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    if (qrVideo) {
      qrVideo.srcObject = qrStream;
      await qrVideo.play();
    }
    const scanLoop = async () => {
      if (!qrScanActive || !qrVideo) return;
      try {
        const barcodes = await detector.detect(qrVideo);
        if (barcodes && barcodes.length) {
          const value = barcodes[0].rawValue || "";
          if (value) {
            handleIncomingDocInput(value);
            closeQrModal();
            return;
          }
        }
      } catch (err) {
        console.warn("QR detect failed", err);
      }
      requestAnimationFrame(scanLoop);
    };
    requestAnimationFrame(scanLoop);
  }

  function stopQrScanner() {
    qrScanActive = false;
    if (qrVideo) {
      qrVideo.pause();
      qrVideo.srcObject = null;
    }
    if (qrStream) {
      qrStream.getTracks().forEach(track => track.stop());
      qrStream = null;
    }
  }

  function init() {
    renderGrid();
    setupListeners();

    pruneMissingHandoffs().catch(err => console.error("Vérification handoff globale échouée", err));

    const params = new URLSearchParams(window.location.search);
    const incomingId = params.get("id");
    const incomingTitle = params.get("title");
    if (incomingId) {
      upsertDocument({
        id: incomingId,
        title: incomingTitle || `Document ${incomingId.slice(0, 4).toUpperCase()}`
      });
      renderGrid();
      openCaptureModal(incomingId);
    }
  }

  function setupListeners() {
    if (window.GoToolkitGoogleTTS?.createController) {
      googleTtsController = window.GoToolkitGoogleTTS.createController();
    }

    scanQrBtn?.addEventListener("click", () => {
      if (typeof BarcodeDetector === "undefined") {
        fallbackQrPrompt();
        return;
      }
      openQrModal();
    });

    scanCodeBtn?.addEventListener("click", () => openCodeModal());
    newHandoffBtn?.addEventListener("click", () => createNewDraftHandoff());
    openSettingsBtn?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      settingsModalApi?.open?.();
    });

    captureDocTitle?.addEventListener("click", () => {
      if (!activeDocId) return;
      const doc = getDocumentById(activeDocId);
      if (!doc) return;
      openRenameModal(doc.title);
    });

    renameModalClose?.addEventListener("click", () => closeRenameModal());
    renameCancelBtn?.addEventListener("click", () => closeRenameModal());
    renameSubmitBtn?.addEventListener("click", () => {
      if (!activeDocId) return;
      const doc = getDocumentById(activeDocId);
      if (!doc) return;
      const newTitle = (renameInput?.value || "").trim();
      if (newTitle) {
        upsertDocument({ ...doc, title: newTitle });
        if (captureDocTitle) {
          const span = captureDocTitle.querySelector("span");
          if (span) span.textContent = newTitle;
        }
        renderGrid();
        setStatus("Document renommé");
        closeRenameModal();
      }
    });

    renameInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        renameSubmitBtn?.click();
      }
    });

    captureModalClose?.addEventListener("click", () => closeCaptureModal());
    captureSendBtn?.addEventListener("click", () => {
      flushCaptureHistoryBuffer();
      const doc = getDocumentById(activeDocId);
      if (doc?.isDraft) {
        openSendMethodModal();
      } else {
        sendHandoff();
      }
    });

    captureSaveBtn?.addEventListener("click", () => {
      closeCaptureModal();
    });

    captureBotBtn?.addEventListener("click", () => {
      const text = (capturePreview?.value || "").trim();
      if (!text) {
        setStatus("Aucun texte à modifier.");
        return;
      }
      openMobileBotModal();
    });

    mobileBotModalClose?.addEventListener("click", () => closeMobileBotModal());
    mobileBotModal?.addEventListener("click", event => {
      if (event.target === mobileBotModal) closeMobileBotModal();
    });

    mobileChatTextarea?.addEventListener("input", () => {
      autoResizeMobileChatInput();
    });

    mobileChatSendBtn?.addEventListener("click", () => {
      runMobileBotEdit();
    });

    captureReadAloudBtn?.addEventListener("click", async () => {
      // Always get the latest value from the preview textarea
      const textarea = document.getElementById("capturePreview");
      const text = (textarea?.value || "").trim();

      if (!text) {
        setStatus("Aucun texte à convertir.");
        return;
      }

      if (!window.GoToolkitGoogleTTS?.synthesize) {
        setStatus("Google TTS indisponible.", true);
        return;
      }

      captureReadAloudBtn.classList.add("speaking");
      setStatus("Génération audio...");
      try {
        const languageCode = window.GoToolkitGoogleTTS.detectLanguage(text);
        const result = await window.GoToolkitGoogleTTS.synthesize(text, { languageCode });
        if (!result?.ok || !result?.audioBlob) {
          console.warn("Google TTS synthesis failed", result?.reason || result);
          setStatus("Google TTS indisponible pour le téléchargement.", true);
          return;
        }
        const meta = result?.payload?.meta || {};
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `hub-audio-${meta?.languageCode || languageCode}-${stamp}.mp3`;
        const saved = await saveAudioBlobWithFallback(result.audioBlob, filename);
        if (saved?.ok && saved.mode === "share") {
          setStatus("Audio MP3 prêt à enregistrer.");
        } else {
          setStatus("Audio MP3 téléchargé.");
        }
      } catch (err) {
        console.error("Hub audio download failed", err);
        setStatus("Échec du téléchargement audio.", true);
      } finally {
        captureReadAloudBtn.classList.remove("speaking");
      }
    });

    captureModal?.addEventListener("click", event => {
      if (event.target === captureModal) closeCaptureModal();
    });

    captureDeleteBtn?.addEventListener("click", async () => {
      flushCaptureHistoryBuffer();
      const doc = getDocumentById(activeDocId);
      if (doc?.isDraft) {
        upsertDocument({
          id: activeDocId,
          title: doc.title,
          isDraft: true,
          hasContent: false,
          lastContent: "",
          lastCapturedAt: ""
        });
        renderGrid();
      } else {
        await deleteHandoffContent();
      }
      captureCanvases = [];
      setCapturePreviewValue("");
      recordHandoffOperation(activeDocId, "", true);
      if (captureInput) captureInput.value = "";
      if (captureGalleryInput) captureGalleryInput.value = "";
      if (captureAudioInput) captureAudioInput.value = "";
      setCaptureStep(1);
      setCaptureTitle("mobile");
      updateUIState();
      updateHistoryButtons();
      setStatus("Prêt pour une nouvelle capture");
    });

    captureUndoBtn?.addEventListener("click", async () => {
      if (!activeDocId) return;
      flushCaptureHistoryBuffer();
      const previous = undoHandoffOperation(activeDocId);
      if (!previous.ok) {
        setStatus("Aucune version précédente");
        return;
      }
      setCapturePreviewValue(previous.value);
      autoResizeMobileChatInput();
      updateHistoryButtons();
      await sendHandoff(previous.value);
      setStatus("Version précédente restaurée");
    });

    captureRedoBtn?.addEventListener("click", async () => {
      if (!activeDocId) return;
      flushCaptureHistoryBuffer();
      const next = redoHandoffOperation(activeDocId);
      if (!next.ok) {
        setStatus("Aucune version à rétablir");
        return;
      }
      setCapturePreviewValue(next.value);
      autoResizeMobileChatInput();
      updateHistoryButtons();
      await sendHandoff(next.value);
      setStatus("Version suivante rétablie");
    });

    captureTextBtn?.addEventListener("click", () => {
      captureCanvases = [];
      setCapturePreviewValue("");
      recordHandoffOperation(activeDocId, "", true);
      if (captureInput) captureInput.value = "";
      if (captureGalleryInput) captureGalleryInput.value = "";
      if (captureAudioInput) captureAudioInput.value = "";
      setCaptureStep(2);
      setCaptureTitle("text");
      capturePreview?.focus();
      updateUIState();
      updateHistoryButtons();
    });

    captureCameraBtn?.addEventListener("click", () => {
      captureCanvases = [];
      setCapturePreviewValue("");
      recordHandoffOperation(activeDocId, "", true);
      if (captureInput) captureInput.value = "";
      if (captureGalleryInput) captureGalleryInput.value = "";
      if (captureAudioInput) captureAudioInput.value = "";
      setCaptureStep(1);
      captureInput?.click();
      updateUIState();
      updateHistoryButtons();
    });

    captureGalleryBtn?.addEventListener("click", () => {
      captureCanvases = [];
      setCapturePreviewValue("");
      recordHandoffOperation(activeDocId, "", true);
      if (captureInput) captureInput.value = "";
      if (captureGalleryInput) captureGalleryInput.value = "";
      if (captureAudioInput) captureAudioInput.value = "";
      setCaptureStep(1);
      captureGalleryInput?.click();
      updateUIState();
      updateHistoryButtons();
    });

    captureAudioBtn?.addEventListener("click", () => {
      captureCanvases = [];
      setCapturePreviewValue("");
      recordHandoffOperation(activeDocId, "", true);
      if (captureInput) captureInput.value = "";
      if (captureGalleryInput) captureGalleryInput.value = "";
      if (captureAudioInput) captureAudioInput.value = "";
      setCaptureStep(1);
      captureAudioInput?.click();
      updateUIState();
      updateHistoryButtons();
    });

    captureInput?.addEventListener("change", event => {
      const files = Array.from(event.target?.files || []);
      handleCaptureFiles(files);
    });

    captureGalleryInput?.addEventListener("change", event => {
      const files = Array.from(event.target?.files || []);
      handleCaptureFiles(files);
    });

    captureAudioInput?.addEventListener("change", event => {
      const file = event.target?.files?.[0] || null;
      if (!file) return;
      runAudioTranscription(file);
    });

    capturePreview?.addEventListener("input", () => {
      if (skipCapturePreviewHistorySync) return;
      scheduleCaptureHistoryCommit();
      updateHandoffContent();
    });

    codeModalClose?.addEventListener("click", () => closeCodeModal());
    codeCancelBtn?.addEventListener("click", () => closeCodeModal());
    codeModal?.addEventListener("click", event => {
      if (event.target === codeModal) closeCodeModal();
    });
    codeSubmitBtn?.addEventListener("click", () => handleCodeSubmit());
    codeInput?.addEventListener("input", () => {
      if (codeInput.value.length === 4) {
        handleCodeSubmit();
      }
    });
    codeInput?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        handleCodeSubmit();
      }
    });

    sendMethodModalClose?.addEventListener("click", () => closeSendMethodModal());
    sendViaQrBtn?.addEventListener("click", () => {
      closeSendMethodModal();
      if (typeof BarcodeDetector === "undefined") {
        fallbackQrPrompt();
        return;
      }
      openQrModal();
    });
    sendViaCodeBtn?.addEventListener("click", () => {
      closeSendMethodModal();
      openCodeModal();
    });
    sendViaMailtoBtn?.addEventListener("click", () => {
      closeSendMethodModal();
      openMailtoFallback();
    });
    sendViaGmailBtn?.addEventListener("click", () => {
      closeSendMethodModal();
      openGmailWebFallback();
    });
    sendViaOutlookBtn?.addEventListener("click", () => {
      closeSendMethodModal();
      openOutlookWebFallback();
    });
    sendMethodModal?.addEventListener("click", event => {
      if (event.target === sendMethodModal) closeSendMethodModal();
    });

    qrModalClose?.addEventListener("click", () => closeQrModal());
    qrCancelBtn?.addEventListener("click", () => closeQrModal());
    qrModal?.addEventListener("click", event => {
      if (event.target === qrModal) closeQrModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (captureModal?.classList.contains("open")) closeCaptureModal();
        if (codeModal?.classList.contains("open")) closeCodeModal();
        if (qrModal?.classList.contains("open")) closeQrModal();
        if (sendMethodModal?.classList.contains("open")) closeSendMethodModal();
        if (settingsModal?.classList.contains("open")) settingsModalApi?.close?.();
      }
    });
  }

  // Final check for DOM readiness
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
