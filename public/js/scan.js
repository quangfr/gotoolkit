(() => {
  const STORAGE_KEY = "goToolkit.handoff.documents";
  const HANDOFF_COLLECTION = "handoffs";
  const CODE_COLLECTION = "codes_map";
  const OPENCV_URL = "https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.js";
  const OCR_MODEL = "qwen/qwen2.5-vl-72b-instruct";

  const shareWorker = window.goToolkitShareWorker;
  const handoffGrid = document.getElementById("handoffGrid");
  const handoffStatus = document.getElementById("handoffStatus");
  const scanQrBtn = document.getElementById("scanQrBtn");
  const scanCodeBtn = document.getElementById("scanCodeBtn");
  const newHandoffBtn = document.getElementById("newHandoffBtn");
  const captureModal = document.getElementById("captureModal");
  const captureModalClose = document.getElementById("captureModalClose");
  const captureSendBtn = document.getElementById("captureSendBtn");
  const captureSaveBtn = document.getElementById("captureSaveBtn");
  const captureInput = document.getElementById("captureInput");
  const captureAudioInput = document.getElementById("captureAudioInput");
  const captureTextBtn = document.getElementById("captureTextBtn");
  const capturePreview = document.getElementById("capturePreview");
  const captureLoader = document.getElementById("captureLoader");
  const captureInstruction = document.getElementById("captureInstruction");
  const captureStep1 = document.getElementById("captureStep1");
  const captureStep2 = document.getElementById("captureStep2");
  const captureCameraBtn = document.getElementById("captureCameraBtn");
  const captureAudioBtn = document.getElementById("captureAudioBtn");
  const captureDeleteBtn = document.getElementById("captureDeleteBtn");
  const captureDocTitle = document.getElementById("captureDocTitle");
  const captureDocMeta = document.getElementById("captureDocMeta");
  const codeModal = document.getElementById("codeModal");
  const codeModalClose = document.getElementById("codeModalClose");
  const codeCancelBtn = document.getElementById("codeCancelBtn");
  const codeSubmitBtn = document.getElementById("codeSubmitBtn");
  const codeInput = document.getElementById("codeInput");
  const sendMethodModal = document.getElementById("sendMethodModal");
  const sendMethodModalClose = document.getElementById("sendMethodModalClose");
  const sendViaQrBtn = document.getElementById("sendViaQrBtn");
  const sendViaCodeBtn = document.getElementById("sendViaCodeBtn");
  const qrModal = document.getElementById("qrModal");
  const qrModalClose = document.getElementById("qrModalClose");
  const qrCancelBtn = document.getElementById("qrCancelBtn");
  const qrVideo = document.getElementById("qrVideo");

  let handoffDocs = loadDocuments();
  let activeDocId = null;
  let captureCanvases = [];
  let qrStream = null;
  let qrScanActive = false;
  let openCvPromise = null;
  const isAutomation = typeof navigator !== "undefined" && navigator.webdriver === true;

  function setStatus(message) {
    if (handoffStatus) {
      handoffStatus.textContent = message || "";
    }
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
    const normalized = {
      id: doc.id,
      title: doc.title || "Document",
      updatedAt: doc.updatedAt || new Date().toISOString(),
      hasContent: Boolean(doc.hasContent),
      lastContent: typeof doc.lastContent === "string" ? doc.lastContent : undefined,
      lastCapturedAt: doc.lastCapturedAt || undefined,
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
    const doc = {
      id,
      title: draftTitle,
      isDraft: true,
      hasContent: false,
      updatedAt: new Date().toISOString()
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
    if (captureInstruction) captureInstruction.style.display = "block";
    if (captureDocMeta) captureDocMeta.textContent = `ID: ${linkDocId}`;

    // 4. Send to Firestore
    if (content && shareWorker?.saveSharePayload) {
      await shareWorker.saveSharePayload(HANDOFF_COLLECTION, linkDocId, {
        text: content,
        title: linkTitle || "Document",
        timestamp: new Date().toISOString()
      });
    }

    renderGrid();
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
      meta.textContent = formatRelativeTime(doc.lastCapturedAt);
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
      openBtn.addEventListener("click", () => openCaptureModal(doc.id));
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-secondary";
      removeBtn.innerHTML = "<i data-lucide=\"trash-2\"></i>";
      removeBtn.addEventListener("click", () => {
        removeDocument(doc.id);
        renderGrid();
        setStatus("Document retiré");
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
    if (capturePreview) capturePreview.value = doc.isDraft ? (doc.lastContent || "") : "";
    if (captureInput) captureInput.value = "";
    if (captureDocTitle) {
      const span = captureDocTitle.querySelector("span");
      if (span) span.textContent = doc.title || "Document";
    }
    if (captureDocMeta) captureDocMeta.textContent = doc.isDraft ? "" : `ID: ${docId}`;

    if (captureInstruction) {
      captureInstruction.style.display = doc.isDraft ? "none" : "block";
    }

    setCaptureStep(doc.hasContent ? 2 : 1);
    setCaptureTitle(doc.hasContent ? "scan" : "mobile");
    captureModal.classList.add("open");

    if (!doc.isDraft && doc.hasContent && shareWorker?.fetchSharePayload) {
      setLoaderActive(true);
      shareWorker
        .fetchSharePayload(HANDOFF_COLLECTION, docId)
        .then(result => {
          const text = result?.payload?.text || "";
          const timestamp = result?.payload?.timestamp || result?.meta?.updatedAt || new Date().toISOString();
          if (capturePreview) capturePreview.value = text;
          if (text) {
            upsertDocument({
              id: docId,
              title: doc.title,
              hasContent: true,
              lastContent: text,
              lastCapturedAt: timestamp
            });
            renderGrid();
          }
        })
        .catch(err => {
          console.error(err);
          setStatus("Chargement échoué");
        })
        .finally(() => {
          setLoaderActive(false);
        });
    }
  }

  function closeCaptureModal() {
    if (!captureModal) return;
    captureModal.classList.remove("open");
    activeDocId = null;
    captureCanvases = [];
    setCaptureStep(1);
    closeSendMethodModal();
  }

  function setCaptureStep(step) {
    if (captureStep1) captureStep1.classList.toggle("active", step === 1);
    if (captureStep2) captureStep2.classList.toggle("active", step === 2);
  }

  function setCaptureTitle(mode) {
    if (!captureDocTitle) return;
    const icon = captureDocTitle.querySelector("i");
    if (icon) {
      let iconName = "tablet-smartphone";
      if (mode === "scan") iconName = "image-up";
      if (mode === "audio") iconName = "audio-lines";
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

  function fallbackQrPrompt() {
    const input = prompt("Scanner QR indisponible. Collez le lien ou l'ID du document :");
    if (!input) return;
    handleIncomingDocInput(input);
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

  async function ensureOpenCvLoaded() {
    if (openCvPromise) return openCvPromise;
    openCvPromise = new Promise((resolve, reject) => {
      if (window.cv && typeof window.cv.Mat === "function") {
        resolve(window.cv);
        return;
      }
      const script = document.createElement("script");
      script.src = OPENCV_URL;
      script.async = true;
      script.onload = () => {
        if (window.cv?.Mat) {
          resolve(window.cv);
          return;
        }
        if (window.cv) {
          window.cv.onRuntimeInitialized = () => resolve(window.cv);
          return;
        }
        reject(new Error("OpenCV introuvable"));
      };
      script.onerror = () => reject(new Error("Chargement OpenCV échoué"));
      document.head.appendChild(script);
    });
    return openCvPromise;
  }

  async function preprocessCanvasWithOpenCv(canvas) {
    const cv = await ensureOpenCvLoaded();
    if (!cv || typeof cv.imread !== "function") {
      throw new Error("OpenCV indisponible");
    }
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    const dst = new cv.Mat();
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.equalizeHist(gray, gray);
      cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 2);
      cv.imshow(canvas, dst);
    } finally {
      src.delete();
      gray.delete();
      dst.delete();
    }
  }

  async function fileToCanvas(file) {
    if (!file) return null;
    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
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
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(img, 0, 0);
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
        captureLoader.innerHTML = "<i data-lucide=\"audio-lines\"></i><span>Transcription en cours...</span>";
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
      return;
    }
    if (!window.GoToolkitIA?.chatCompletion) {
      setStatus("Service OCR indisponible");
      return;
    }
    setCaptureStep(2);
    setCaptureTitle("scan");
    setLoaderActive(true, "scan");
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
      if (capturePreview) {
        capturePreview.value = combined;
      }
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
    try {
      const key = transcriptApi.getAssemblyApiKey?.() || "";
      const uploadUrl = await transcriptApi.uploadAudioToAssembly(file, key);
      const payload = transcriptApi.buildAssemblyTranscriptPayload(uploadUrl, 0);
      const transcriptId = await transcriptApi.requestAssemblyTranscript(payload, key);
      const result = await transcriptApi.pollAssemblyTranscript(transcriptId, key);
      const transcript =
        transcriptApi.buildTranscriptFromUtterances(result) || result?.text || "";
      if (!transcript) {
        throw new Error("Transcription vide");
      }
      if (capturePreview) capturePreview.value = transcript;
      await sendHandoff(transcript);
      setStatus("Transcription terminée");
    } catch (err) {
      console.error(err);
      setStatus("Transcription échouée");
    } finally {
      setLoaderActive(false);
    }
  }

  async function sendHandoff(textOverride) {
    if (!activeDocId) return;
    const doc = getDocumentById(activeDocId);
    const text = (textOverride || capturePreview?.value || "").trim();
    if (!text && !doc?.isDraft) {
      setStatus("Aucun texte à envoyer");
      return;
    }

    if (doc?.isDraft) {
      upsertDocument({
        id: activeDocId,
        title: doc.title,
        isDraft: true,
        hasContent: true,
        lastContent: text,
        lastCapturedAt: new Date().toISOString()
      });
      renderGrid();
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
      upsertDocument({
        id: activeDocId,
        title: doc?.title,
        hasContent: true,
        lastContent: text,
        lastCapturedAt: new Date().toISOString()
      });
      renderGrid();
    } catch (err) {
      console.error(err);
      setStatus("Envoi échoué");
    }
  }

  async function updateHandoffContent() {
    if (!activeDocId) return;
    const doc = getDocumentById(activeDocId);
    const text = (capturePreview?.value || "").trim();

    if (doc?.isDraft) {
      upsertDocument({
        id: activeDocId,
        title: doc.title,
        isDraft: true,
        hasContent: true,
        lastContent: text,
        lastCapturedAt: new Date().toISOString()
      });
      renderGrid();
      return;
    }

    if (!text) {
      setStatus("Aucun texte à envoyer");
      return;
    }
    if (!shareWorker?.saveSharePayload) {
      setStatus("Service de partage indisponible");
      return;
    }
    try {
      await shareWorker.saveSharePayload(HANDOFF_COLLECTION, activeDocId, {
        text,
        title: getDocumentById(activeDocId)?.title || "Document",
        timestamp: new Date().toISOString()
      });
      upsertDocument({
        id: activeDocId,
        title: getDocumentById(activeDocId)?.title,
        hasContent: true,
        lastContent: text,
        lastCapturedAt: new Date().toISOString()
      });
      renderGrid();
      setStatus("Contenu mis à jour");
    } catch (err) {
      console.error(err);
      setStatus("Mise à jour échouée");
    }
  }

  async function deleteHandoffContent() {
    if (!activeDocId) return;
    if (!shareWorker?.deleteSharePayload) {
      setStatus("Service de partage indisponible");
      return;
    }
    try {
      await shareWorker.deleteSharePayload(HANDOFF_COLLECTION, activeDocId);
      upsertDocument({
        id: activeDocId,
        title: getDocumentById(activeDocId)?.title,
        hasContent: false,
        lastContent: "",
        lastCapturedAt: ""
      });
      renderGrid();
      setStatus("Contenu supprimé");
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
    captureCanvases = [];
    if (!files || !files.length) return;
    if (captureDocMeta) {
      captureDocMeta.textContent = `${files.length} photo(s) sélectionnée(s)`;
    }
    for (const file of files) {
      const canvas = await fileToCanvas(file);
      if (!canvas) continue;
      if (!isAutomation) {
        try {
          await preprocessCanvasWithOpenCv(canvas);
        } catch (err) {
          console.warn("OpenCV preprocessing failed", err);
        }
      }
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

  scanQrBtn?.addEventListener("click", () => {
    if (typeof BarcodeDetector === "undefined") {
      fallbackQrPrompt();
      return;
    }
    openQrModal();
  });

  scanCodeBtn?.addEventListener("click", () => openCodeModal());
  newHandoffBtn?.addEventListener("click", () => createNewDraftHandoff());

  captureDocTitle?.addEventListener("click", () => {
    if (!activeDocId) return;
    const doc = getDocumentById(activeDocId);
    if (!doc) return;
    const newTitle = prompt("Nouveau nom du document :", doc.title);
    if (newTitle && newTitle.trim()) {
      upsertDocument({ ...doc, title: newTitle.trim() });
      if (captureDocTitle) {
        const span = captureDocTitle.querySelector("span");
        if (span) span.textContent = newTitle.trim();
      }
      renderGrid();
      setStatus("Document renommé");
    }
  });

  captureModalClose?.addEventListener("click", () => closeCaptureModal());
  captureSendBtn?.addEventListener("click", () => {
    const doc = getDocumentById(activeDocId);
    if (doc?.isDraft) {
      openSendMethodModal();
    } else {
      closeCaptureModal();
    }
  });

  captureSaveBtn?.addEventListener("click", () => {
    updateHandoffContent();
    closeCaptureModal();
  });

  captureModal?.addEventListener("click", event => {
    if (event.target === captureModal) closeCaptureModal();
  });

  captureDeleteBtn?.addEventListener("click", async () => {
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
    if (capturePreview) capturePreview.value = "";
    if (captureInput) captureInput.value = "";
    if (captureAudioInput) captureAudioInput.value = "";
    setCaptureStep(1);
    setCaptureTitle("mobile");
    setStatus("Prêt pour une nouvelle capture");
  });

  captureTextBtn?.addEventListener("click", () => {
    captureCanvases = [];
    if (capturePreview) capturePreview.value = "";
    setCaptureStep(2);
    setCaptureTitle("text");
    capturePreview?.focus();
  });

  captureCameraBtn?.addEventListener("click", () => {
    captureCanvases = [];
    if (capturePreview) capturePreview.value = "";
    if (captureInput) captureInput.value = "";
    if (captureAudioInput) captureAudioInput.value = "";
    setCaptureStep(1);
    captureInput?.click();
  });

  captureAudioBtn?.addEventListener("click", () => {
    captureCanvases = [];
    if (capturePreview) capturePreview.value = "";
    if (captureInput) captureInput.value = "";
    if (captureAudioInput) captureAudioInput.value = "";
    setCaptureStep(1);
    captureAudioInput?.click();
  });

  captureInput?.addEventListener("change", event => {
    const files = Array.from(event.target?.files || []);
    handleCaptureFiles(files);
  });

  captureAudioInput?.addEventListener("change", event => {
    const file = event.target?.files?.[0] || null;
    if (!file) return;
    runAudioTranscription(file);
  });

  capturePreview?.addEventListener("input", () => {
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
    }
  });

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
  } else {
    renderGrid();
  }
  pruneMissingHandoffs().catch(err => console.error("Vérification handoff globale échouée", err));
})();
