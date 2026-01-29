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
  const captureModal = document.getElementById("captureModal");
  const captureModalClose = document.getElementById("captureModalClose");
  const captureCancelBtn = document.getElementById("captureCancelBtn");
  const captureInput = document.getElementById("captureInput");
  const capturePreview = document.getElementById("capturePreview");
  const captureLoader = document.getElementById("captureLoader");
  const captureExtractBtn = document.getElementById("captureExtractBtn");
  const captureSendBtn = document.getElementById("captureSendBtn");
  const captureDocTitle = document.getElementById("captureDocTitle");
  const captureDocMeta = document.getElementById("captureDocMeta");
  const codeModal = document.getElementById("codeModal");
  const codeModalClose = document.getElementById("codeModalClose");
  const codeCancelBtn = document.getElementById("codeCancelBtn");
  const codeSubmitBtn = document.getElementById("codeSubmitBtn");
  const codeInput = document.getElementById("codeInput");
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
      updatedAt: doc.updatedAt || new Date().toISOString()
    };
    const index = handoffDocs.findIndex(item => item.id === normalized.id);
    if (index >= 0) {
      handoffDocs[index] = { ...handoffDocs[index], ...normalized };
    } else {
      handoffDocs.unshift(normalized);
    }
    saveDocuments();
  }

  function getDocumentById(id) {
    return handoffDocs.find(item => item.id === id) || null;
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
      const meta = document.createElement("span");
      meta.textContent = `ID: ${doc.id.slice(0, 8)}…`;
      const actions = document.createElement("div");
      actions.className = "handoff-card__actions";
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn-secondary";
      openBtn.textContent = "Capturer";
      openBtn.addEventListener("click", () => openCaptureModal(doc.id));
      actions.appendChild(openBtn);
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(actions);
      handoffGrid.appendChild(card);
    });
  }

  function openCaptureModal(docId) {
    const doc = getDocumentById(docId);
    if (!doc || !captureModal) return;
    activeDocId = docId;
    captureCanvases = [];
    if (capturePreview) capturePreview.value = "";
    if (captureInput) captureInput.value = "";
    if (captureDocTitle) captureDocTitle.textContent = doc.title || "Document";
    if (captureDocMeta) captureDocMeta.textContent = `ID: ${docId}`;
    captureModal.classList.add("open");
    ensureOpenCvLoaded();
  }

  function closeCaptureModal() {
    if (!captureModal) return;
    captureModal.classList.remove("open");
    activeDocId = null;
    captureCanvases = [];
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

  function setLoaderActive(active) {
    if (!captureLoader) return;
    if (active) {
      captureLoader.classList.add("active");
    } else {
      captureLoader.classList.remove("active");
    }
  }

  async function runOcr() {
    if (!captureCanvases.length) {
      setStatus("Ajoutez des photos avant d'extraire");
      return;
    }
    if (!window.GoToolkitIAClient?.chatCompletion) {
      setStatus("Service OCR indisponible");
      return;
    }
    setLoaderActive(true);
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
      const responseText = await window.GoToolkitIAClient.chatCompletion({ payload });
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
      setStatus("Extraction terminée");
    } catch (err) {
      console.error(err);
      setStatus("OCR échoué");
    } finally {
      setLoaderActive(false);
    }
  }

  async function sendHandoff() {
    if (!activeDocId) return;
    const doc = getDocumentById(activeDocId);
    const text = (capturePreview?.value || "").trim();
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
        title: doc?.title || "Document",
        timestamp: new Date().toISOString()
      });
      setStatus("Texte envoyé");
      closeCaptureModal();
    } catch (err) {
      console.error(err);
      setStatus("Envoi échoué");
    }
  }

  async function handleCodeSubmit() {
    const code = (codeInput?.value || "").trim().toUpperCase();
    if (!code || code.length !== 4) {
      setStatus("Code invalide");
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
      upsertDocument({ id: result.payload.docId, title: result.payload.title || "Document" });
      renderGrid();
      await shareWorker.deleteSharePayload(CODE_COLLECTION, code);
      closeCodeModal();
      setStatus("Document ajouté");
      openCaptureModal(result.payload.docId);
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
      try {
        await preprocessCanvasWithOpenCv(canvas);
      } catch (err) {
        console.warn("OpenCV preprocessing failed", err);
      }
      captureCanvases.push(canvas);
    }
    setStatus("Photos prêtes");
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
  captureModalClose?.addEventListener("click", () => closeCaptureModal());
  captureCancelBtn?.addEventListener("click", () => closeCaptureModal());
  captureModal?.addEventListener("click", event => {
    if (event.target === captureModal) closeCaptureModal();
  });
  captureExtractBtn?.addEventListener("click", () => runOcr());
  captureSendBtn?.addEventListener("click", () => sendHandoff());
  captureInput?.addEventListener("change", event => {
    const files = Array.from(event.target?.files || []);
    handleCaptureFiles(files);
  });

  codeModalClose?.addEventListener("click", () => closeCodeModal());
  codeCancelBtn?.addEventListener("click", () => closeCodeModal());
  codeModal?.addEventListener("click", event => {
    if (event.target === codeModal) closeCodeModal();
  });
  codeSubmitBtn?.addEventListener("click", () => handleCodeSubmit());
  codeInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      handleCodeSubmit();
    }
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
})();
