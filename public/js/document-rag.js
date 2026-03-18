(function (global) {
    const DEFAULT_SETTINGS = {
        chunkSize: 360,
        chunkOverlap: 120,
        embedModelId: "Xenova/all-MiniLM-L6-v2"
    };

    const DEFAULT_RETRIEVAL_TOP_K = 10;
    const DEFAULT_RETRIEVAL_MIN_SCORE = 0.1;

    const CHUNK_CATEGORY_DEFINITIONS = {
        small: {
            key: "small",
            chunkSizeRange: { min: 300, max: 420 },
            overlapRange: { min: 120, max: 180 },
            defaultChunkSize: 360,
            defaultOverlap: 120
        },
        medium: {
            key: "medium",
            chunkSizeRange: { min: 520, max: 680 },
            overlapRange: { min: 180, max: 240 },
            defaultChunkSize: 600,
            defaultOverlap: 210
        }
    };

    const CHUNK_HEURISTICS = {
        lineBreakThreshold: 1500,
        bulletThreshold: 30,
        tableThreshold: 80,
        charThreshold: 80000,
        bulletRegex: /(^|\n)\s*[-*+•]\s+/g
    };

    function clampNumber(value, min, max, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return fallback;
        }
        return Math.min(Math.max(numeric, min), max);
    }

    function countMatches(text, regex) {
        if (!text || !regex) return 0;
        const matches = text.match(regex);
        return Array.isArray(matches) ? matches.length : 0;
    }

    function shouldUseSmallChunks(text) {
        if (!text) return false;
        const sample = text.toString();
        if (sample.length > CHUNK_HEURISTICS.charThreshold) {
            return true;
        }
        const lineBreaks = countMatches(sample, /\n/g);
        if (lineBreaks > CHUNK_HEURISTICS.lineBreakThreshold) {
            return true;
        }
        const bulletCount = countMatches(sample, CHUNK_HEURISTICS.bulletRegex);
        if (bulletCount > CHUNK_HEURISTICS.bulletThreshold) {
            return true;
        }
        const tableMarkers = countMatches(sample, /\|/g);
        if (tableMarkers > CHUNK_HEURISTICS.tableThreshold) {
            return true;
        }
        return false;
    }

    const STORAGE_KEY = "goToolkit.documents.settings";
    const MEMO_EMBEDDINGS_ENABLED_MIGRATION_KEY = "goToolkit.memoEmbeddings.enabledMigrated";
    const DB_NAME = "gotoolkit-documents";
    const DB_VERSION = 6;
    const REQUIRED_STORES = ["documents", "chunks", "keyword_meta", "memo_context_embeddings"];
    const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/+esm";
    const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.esm.min.js";
    const PDFJS_WORKER = "js/pdf.worker.min.mjs";
    const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";
    const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

    function normalizeJsZipModule(module) {
        if (!module) return null;
        // Already a function/constructor (direct export or CommonJS style)
        if (typeof module === "function") {
            return module;
        }
        // Wrapped in .default (common with some bundlers/transpilers)
        if (module.default && typeof module.default === "function") {
            return module.default;
        }
        // Has loadAsync as named export (modern ESM pattern)
        if (typeof module.loadAsync === "function") {
            return module;
        }
        // Named export pattern - try to find the constructor
        if (module.JSZip && typeof module.JSZip === "function") {
            return module.JSZip;
        }
        // Fallback: return as-is, methods will check for loadAsync
        return module;
    }
    const EMBED_BATCH_MAX = 64;

    function getMissingStores(db) {
        if (!db || !db.objectStoreNames) return REQUIRED_STORES.slice();
        return REQUIRED_STORES.filter((name) => !db.objectStoreNames.contains(name));
    }

    function isMissingStoreError(err) {
        if (!err) return false;
        if (err.name === "NotFoundError") return true;
        const msg = String(err && (err.message || err)).toLowerCase();
        return msg.includes("object store") && msg.includes("not found");
    }

    function isDbClosingError(err) {
        if (!err) return false;
        if (err.name === "InvalidStateError") {
            const msg = String(err && (err.message || err)).toLowerCase();
            return msg.includes("database connection is closing");
        }
        return false;
    }

    const ACCEPTED_EXTENSIONS = new Set([
        "pdf",
        "docx",
        "pptx",
        "xlsx",
        "json",
        "csv",
        "tsv",
        "log",
        "jsonl",
        "ndjson",
        "txt",
        "md",
        "rtf",
        "doc",
        "odf",
        "odt",
        "ods",
        "vtt",
        "png",
        "jpg",
        "jpeg",
        "webp",
        "gif",
        "bmp",
        "tif",
        "tiff"
    ]);
    const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"]);
    const OCR_TEXT_MIN_LENGTH = 40;
    const OCR_QUALITY_CONTRAST_THRESHOLD = 30;
    const OCR_QUALITY_BLUR_THRESHOLD = 0.8;
    const OCR_LAPLACIAN_NORM = 1000;
    const MAX_IMAGE_DIM = 2048;
    const DEFAULT_QWEN_VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
    const QWEN_OCR_TOAST_MESSAGE = "OCR : Reconnaissance en cours";
    const OCR_TOAST_ID = "aiRequestCounterToasterOcr";
    let qwenOcrToastCount = 0;
    const CLOUD_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
    const CLOUD_EMBEDDING_BATCH_SIZE = 64;

    function getFileSizeLimitConfig(fileName) {
        try {
            const limits = global?.GoToolkitSiteConfig?.get?.("fileImport.fileSizeLimits", {}) || {};
            const ext = (fileName || "").toLowerCase();
            const lastDotIndex = ext.lastIndexOf(".");
            if (lastDotIndex < 0) return null;
            const suffix = ext.substring(lastDotIndex);
            for (const typeKey in limits) {
                const typeLimit = limits[typeKey];
                if (!typeLimit || !Array.isArray(typeLimit.extensions)) continue;
                if (typeLimit.extensions.includes(suffix)) {
                    return typeLimit;
                }
            }
        } catch (err) {
            console.warn("Failed to read file size limits", err);
        }
        return null;
    }

    function shouldUseCloudEmbeddingsForFile(file) {
        if (!file || !file.name || !file.size) return false;
        const limitConfig = getFileSizeLimitConfig(file.name);
        if (!limitConfig) return false;
        if (limitConfig.useCloudEmbeddings || limitConfig.cloudEmbeddings) return true;
        const allowOverLimit = Boolean(global?.GoToolkitSiteConfig?.get?.("fileImport.allowOverLimitEmbeddings", false));
        if (!allowOverLimit) return false;
        const maxMB = Number(limitConfig.maxMB) || 0;
        if (!maxMB) return false;
        const limitBytes = maxMB * 1048576;
        return file.size > limitBytes;
    }

    function canUseOpenRouterEmbeddings() {
        const hasKey = Boolean(global.GoToolkitIAConfig?.getOpenRouterApiKey?.());
        const hasProxy = Boolean(global.GoToolkitIAConfig?.OPENROUTER_EMBEDDINGS_PROXY_ENDPOINT);
        return hasKey || hasProxy;
    }

    function resolveOpenRouterEmbeddingModel() {
        return global?.GoToolkitIAConfig?.getOpenRouterEmbeddingsModel?.() || CLOUD_EMBEDDING_MODEL;
    }

    function resolveOpenRouterEmbeddingBackend() {
        const config = global.GoToolkitIAConfig;
        if (!config) return null;
        const hasKey = Boolean(config.getOpenRouterApiKey?.());
        const forceProxy = Boolean(global.GoToolkitForceOpenRouterProxy);
        const useProxy = forceProxy || !hasKey;
        const endpoint = useProxy
            ? config.OPENROUTER_EMBEDDINGS_PROXY_ENDPOINT
            : config.OPENROUTER_EMBEDDINGS_ENDPOINT;
        if (!endpoint) return null;
        return {
            endpoint,
            apiKey: useProxy ? "" : config.getOpenRouterApiKey?.() || "",
            sort: "throughput"
        };
    }

    function buildOpenRouterEmbeddingPayload(texts, backend) {
        const sortBy = (typeof backend?.sort === "string" && backend.sort.trim()) ? backend.sort.trim() : "throughput";
        return {
            model: resolveOpenRouterEmbeddingModel(),
            input: texts,
            provider: {
                allow_fallbacks: true,
                sort: { by: sortBy, partition: null },
                data_collection: "deny",
                zdr: true
            }
        };
    }

    function buildOpenRouterEmbeddingHeaders(apiKey) {
        const headers = {
            "Content-Type": "application/json"
        };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }
        return headers;
    }

    function clampDuration(value, minMs, maxMs) {
        const num = Number.isFinite(value) ? value : 0;
        return Math.min(Math.max(num, minMs), maxMs);
    }

    function ensureAiRequestToaster(toasterId) {
        if (typeof document === "undefined") return null;
        const id = toasterId || OCR_TOAST_ID;
        let toast = document.getElementById(id);
        if (toast) return toast;
        toast = document.createElement("div");
        toast.id = id;
        toast.className = "ai-request-counter-toaster";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.setAttribute("aria-atomic", "true");
        toast.style.display = "none";
        document.body.appendChild(toast);
        return toast;
    }

    function setAiRequestToasterVisible(toasterId, iconName, message, isVisible, options = {}) {
        if (global.GoToolkitAIRequestToaster?.startIcon && global.GoToolkitAIRequestToaster?.stop) {
            if (isVisible) {
                global.GoToolkitAIRequestToaster.startIcon(toasterId, iconName, message, options?.durationMs);
            } else {
                global.GoToolkitAIRequestToaster.stop(toasterId);
            }
            return;
        }
        const toast = ensureAiRequestToaster(toasterId);
        if (!toast) return;
        if (isVisible) {
            toast.textContent = "";
            const icon = document.createElement("i");
            icon.setAttribute("data-lucide", String(iconName || "loader-2"));
            icon.className = "lucide-pulse";
            icon.style.width = "14px";
            icon.style.height = "14px";
            icon.style.verticalAlign = "middle";
            icon.style.marginRight = "4px";
            toast.appendChild(icon);
            toast.appendChild(document.createTextNode(" 00:00"));
            toast.style.display = "block";
            toast.classList.add("visible");
            if (window.lucide) window.lucide.createIcons();
            return;
        }
        toast.classList.remove("visible");
        toast.style.display = "none";
        toast.textContent = "";
    }

    function emitDocumentsImportMessage(message, isError) {
        if (typeof document === "undefined") return;
        document.dispatchEvent(new CustomEvent("goToolkitDocumentsImportMessage", {
            detail: { message, isError: Boolean(isError) }
        }));
    }

    function canUseQwenFallback() {
        try {
            var backend = (localStorage.getItem("go-toolkit-ai-backend") || "").trim().toLowerCase();
            if (backend === "openai") return false;
        } catch (err) {
            // ignore
        }
        if (global.GoToolkitIAConfig?.isOpenRouterAvailable) {
            return global.GoToolkitIAConfig.isOpenRouterAvailable();
        }
        const hasKey = Boolean(global.GoToolkitIAConfig?.getOpenRouterApiKey?.());
        const hasProxy = Boolean(global.GoToolkitIAConfig?.OPENROUTER_PROXY_ENDPOINT);
        return hasKey || hasProxy;
    }

    function resolveOpenRouterOcrModel() {
        const hasKey = Boolean(global.GoToolkitIAConfig?.getOpenRouterApiKey?.());
        const forceProxy = Boolean(global.GoToolkitForceOpenRouterProxy);
        if (!hasKey || forceProxy) {
            return DEFAULT_QWEN_VISION_MODEL;
        }
        const configured = global.GoToolkitIAConfig?.getOpenRouterOcrModel?.();
        return (configured && configured.trim()) ? configured.trim() : DEFAULT_QWEN_VISION_MODEL;
    }

    function ensureQwenOcrToast() {
        return ensureAiRequestToaster(OCR_TOAST_ID);
    }

    function setQwenOcrToastVisible(isVisible, durationMs) {
        if (isVisible) {
            qwenOcrToastCount += 1;
            setAiRequestToasterVisible(OCR_TOAST_ID, "scan-text", QWEN_OCR_TOAST_MESSAGE, true, { durationMs });
            return;
        }
        qwenOcrToastCount = Math.max(0, qwenOcrToastCount - 1);
        if (qwenOcrToastCount === 0) {
            setAiRequestToasterVisible(OCR_TOAST_ID, "scan-text", QWEN_OCR_TOAST_MESSAGE, false);
        }
    }

    function isOfflineOcrDisabled() {
        return Boolean(global?.GoToolkitSiteConfig?.get?.("memo.ocr.disableOffline", false));
    }

    function normalizeText(value) {
        return (value || "")
            .replace(/\s+\n/g, "\n")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    function chunkText(text, size = 900, overlap = 120) {
        const chunks = [];
        let i = 0;
        while (i < text.length) {
            const end = Math.min(text.length, i + size);
            const chunk = text.slice(i, end);
            chunks.push(chunk);
            if (end === text.length) break;
            i = Math.max(0, end - overlap);
        }
        return chunks;
    }

    function splitLines(text) {
        return (text || "").split(/\r?\n/);
    }

    function detectDelimiter(line) {
        if (line.includes("\t")) return "\t";
        if (line.includes(";")) return ";";
        return ",";
    }

    function chunkRows(text, options = {}) {
        const lines = splitLines(text).filter((line) => line.trim().length);
        if (!lines.length) return [];
        const header = lines[0];
        const delimiter = detectDelimiter(header);
        const minRows = options.minRows ?? 20;
        const maxRows = options.maxRows ?? 200;
        const chunks = [];
        let start = 1;
        while (start < lines.length) {
            const end = Math.min(lines.length, start + maxRows);
            const rows = lines.slice(start, end);
            const payload = [header, ...rows].join("\n");
            chunks.push({
                text: payload,
                metadata: {
                    delimiter,
                    header,
                    startRow: start,
                    endRow: end - 1
                }
            });
            start = end;
        }
        if (!chunks.length && lines.length === 1) {
            chunks.push({
                text: header,
                metadata: { delimiter, header, startRow: 0, endRow: 0 }
            });
        }
        return chunks;
    }

    function countTokens(text) {
        if (!text) return 0;
        const tokens = text.trim().split(/\s+/);
        return tokens.filter(Boolean).length;
    }

    function chunkByTokens(text, options = {}) {
        const target = options.targetTokens ?? 600;
        const minTokens = options.minTokens ?? 300;
        const maxTokens = options.maxTokens ?? 800;
        const words = (text || "").trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const chunks = [];
        let start = 0;
        while (start < words.length) {
            const end = Math.min(words.length, start + target);
            const slice = words.slice(start, end);
            if (slice.length < minTokens && end < words.length) {
                const extra = Math.min(words.length, start + maxTokens);
                chunks.push(slice.concat(words.slice(end, extra)).join(" "));
                start = extra;
            } else {
                chunks.push(slice.join(" "));
                start = end;
            }
        }
        return chunks;
    }

    function chunkMarkdownSections(text) {
        const lines = splitLines(text);
        const sections = [];
        let current = { headingPath: [], lines: [] };
        const flush = () => {
            const body = current.lines.join("\n").trim();
            if (!body) return;
            sections.push({
                headingPath: current.headingPath.slice(),
                text: body
            });
            current.lines = [];
        };
        for (const line of lines) {
            const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line.trim());
            if (headingMatch) {
                flush();
                const level = headingMatch[1].length;
                const title = headingMatch[2].trim();
                current.headingPath = current.headingPath.slice(0, level - 1);
                current.headingPath[level - 1] = title;
                current.lines.push(line);
                continue;
            }
            current.lines.push(line);
        }
        flush();
        return sections;
    }

    let tesseractPromise = null;
    let ocrWorkerPromise = null;

    async function loadTesseract() {
        if (tesseractPromise) return tesseractPromise;
        tesseractPromise = import(TESSERACT_URL).then((mod) => mod?.default || mod);
        return tesseractPromise;
    }

    function analyzeCanvasQuality(canvas) {
        if (!canvas) {
            return { contrastVariance: 0, laplacianVariance: 0, blurScore: 1, needsPreprocess: true };
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
            return { contrastVariance: 0, laplacianVariance: 0, blurScore: 1, needsPreprocess: true };
        }
        const width = canvas.width || 0;
        const height = canvas.height || 0;
        if (!width || !height) {
            return { contrastVariance: 0, laplacianVariance: 0, blurScore: 1, needsPreprocess: true };
        }
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const count = width * height;
        let sum = 0;
        let sumSq = 0;
        const gray = new Uint8Array(count);
        for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const value = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            gray[p] = value;
            sum += value;
            sumSq += value * value;
        }
        const mean = sum / count;
        const variance = Math.max(0, (sumSq / count) - (mean * mean));
        let laplacianSum = 0;
        let laplacianCount = 0;
        for (let y = 1; y < height - 1; y++) {
            const row = y * width;
            for (let x = 1; x < width - 1; x++) {
                const idx = row + x;
                const lap = (-4 * gray[idx])
                    + gray[idx - 1]
                    + gray[idx + 1]
                    + gray[idx - width]
                    + gray[idx + width];
                laplacianSum += lap * lap;
                laplacianCount += 1;
            }
        }
        const laplacianVariance = laplacianCount ? (laplacianSum / laplacianCount) : 0;
        const blurScore = 1 - clampNumber(laplacianVariance / OCR_LAPLACIAN_NORM, 0, 1, 0);
        const needsPreprocess = variance < OCR_QUALITY_CONTRAST_THRESHOLD
            || blurScore > OCR_QUALITY_BLUR_THRESHOLD;
        return {
            contrastVariance: Math.round(variance * 100) / 100,
            laplacianVariance: Math.round(laplacianVariance * 100) / 100,
            blurScore: Math.round(blurScore * 100) / 100,
            needsPreprocess
        };
    }

    function isLikelyEnFrText(text) {
        const sample = (text || "").toLowerCase();
        if (!sample.trim()) return false;
        const words = sample.match(/[a-zàâçéèêëîïôûùüÿœ]+/gi) || [];
        if (words.length < 6) return false;
        const alphaMatches = sample.match(/[a-zàâçéèêëîïôûùüÿœ]/gi) || [];
        const nonSpaceChars = sample.replace(/\s+/g, "");
        if (nonSpaceChars.length) {
            const alphaRatio = alphaMatches.length / nonSpaceChars.length;
            if (alphaRatio < 0.55) return false;
            const noiseMatches = sample.match(/[^\p{L}\p{N}\s.,;:!?'"()\-]/giu) || [];
            const noiseRatio = noiseMatches.length / nonSpaceChars.length;
            if (noiseRatio > 0.2) return false;
        }
        const hits = {
            en: 0,
            fr: 0
        };
        const enCommon = new Set([
            "the", "and", "of", "to", "in", "is", "for", "that", "with", "on",
            "this", "it", "as", "are", "was", "be", "by", "from", "or", "at",
            "not", "your", "we", "you", "i", "they", "their", "have", "has", "can"
        ]);
        const frCommon = new Set([
            "le", "la", "les", "et", "de", "des", "un", "une", "du", "pour", "dans",
            "ce", "ces", "sur", "par", "avec", "pas", "que", "qui", "est", "sont",
            "au", "aux", "en", "il", "elle", "nous", "vous", "ils", "elles", "mais"
        ]);
        words.forEach((word) => {
            if (enCommon.has(word)) hits.en += 1;
            if (frCommon.has(word)) hits.fr += 1;
        });
        const total = words.length;
        const enRatio = hits.en / total;
        const frRatio = hits.fr / total;
        return enRatio >= 0.04 || frRatio >= 0.04;
    }

    function isReadableOcrText(text) {
        const cleaned = (text || "").trim();
        if (cleaned.length < 20) return false;
        return isLikelyEnFrText(cleaned);
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

    let qwenVisionWorkerPromise = null;

    async function getQwenVisionWorker() {
        if (qwenVisionWorkerPromise) return qwenVisionWorkerPromise;
        qwenVisionWorkerPromise = Promise.resolve({
            model: DEFAULT_QWEN_VISION_MODEL
        });
        return qwenVisionWorkerPromise;
    }

    async function extractWithVisionModel(images) {
        if (!images || !images.length) return [];
        if (!global.GoToolkitIAClient?.chatCompletion) {
            throw new Error("OpenRouter : Service OCR indisponible");
        }
        await getQwenVisionWorker();
        const presetPrompt = global.GoToolkitChatPrompt?.PRESETS?.extract?.prompt
            || global.GoToolkitChatPrompt?.PRESETS?.extract?.defaultPrompt
            || "Extrayez tout le texte de cette image. Soyez précis. Retournez uniquement le texte brut.";
        const prompt = presetPrompt + " Langues possibles : français, anglais, vietnamien. Séparez chaque image par une ligne contenant uniquement ---.";
        const content = [{ type: "text", text: prompt }];
        for (const img of images) {
            const dataUrl = await encodeImageAsBase64(img);
            if (!dataUrl) continue;
            content.push({ type: "image_url", image_url: { url: dataUrl } });
        }
        if (content.length <= 1) {
            throw new Error("OpenRouter : Service OCR indisponible");
        }
        const payload = {
            model: resolveOpenRouterOcrModel(),
            stream: false,
            messages: [{ role: "user", content }],
            usage: { include: true }
        };
        const ocrDuration = clampDuration(15000 + images.length * 5000, 15000, 45000);
        setQwenOcrToastVisible(true, ocrDuration);
        try {
            const responseText = await global.GoToolkitIAClient.chatCompletion({ payload });
            if (!responseText || typeof responseText !== "string") {
                throw new Error("OpenRouter : Réponse OCR invalide");
            }
            const raw = responseText.trim();
            const parts = raw.split(/\n\s*-{3,}\s*\n/);
            if (!parts.length) return [];
            if (parts.length < images.length) {
                const fallback = raw.split(/\n-{3,}\n/);
                if (fallback.length >= parts.length) {
                    return fallback.map(item => item.trim());
                }
            }
            return parts.map(item => item.trim());
        } finally {
            setQwenOcrToastVisible(false);
        }
    }

    async function getOcrWorker() {
        if (ocrWorkerPromise) return ocrWorkerPromise;
        ocrWorkerPromise = (async () => {
            const Tesseract = await loadTesseract();
            if (!Tesseract || typeof Tesseract.createWorker !== "function") {
                throw new Error("OCR worker indisponible");
            }
            const worker = await Tesseract.createWorker("fra+eng");
            if (typeof worker.load === "function") await worker.load();
            if (typeof worker.loadLanguage === "function") await worker.loadLanguage("fra+eng");
            if (typeof worker.initialize === "function") await worker.initialize("fra+eng");
            return worker;
        })();
        return ocrWorkerPromise;
    }

    function shouldOcrText(text) {
        return (text || "").trim().length < OCR_TEXT_MIN_LENGTH;
    }

    function parseVttSegments(raw) {
        if (!raw) return [];
        const lines = splitLines(raw);
        const segments = [];
        let cueLines = [];
        let start = null;
        let end = null;

        const flush = () => {
            if (!cueLines.length) return;
            const combined = cueLines.join(" ").trim();
            cueLines = [];
            if (!combined) return;
            let speaker = null;
            let text = combined;
            const bracketMatch = combined.match(/^\s*\[Speaker\s+(\d+)\]\s*/i);
            const colonMatch = combined.match(/^\s*Speaker\s+(\d+)\s*:\s*/i);
            if (bracketMatch) {
                speaker = `Speaker ${bracketMatch[1]}`;
                text = combined.slice(bracketMatch[0].length).trim();
            } else if (colonMatch) {
                speaker = `Speaker ${colonMatch[1]}`;
                text = combined.slice(colonMatch[0].length).trim();
            }
            segments.push({
                speaker,
                text,
                start,
                end
            });
        };

        for (let i = 0; i < lines.length; i++) {
            const line = (lines[i] || "").trim();
            if (!line) {
                flush();
                continue;
            }
            if (/^WEBVTT/i.test(line)) {
                continue;
            }
            if (/^NOTE/i.test(line)) {
                continue;
            }
            if (line.includes("-->")) {
                flush();
                const parts = line.split("-->");
                start = parts[0].trim();
                const endPart = (parts[1] || "").trim();
                end = endPart.split(/\s+/)[0] || null;
                continue;
            }
            cueLines.push(line);
        }
        flush();
        return segments;
    }

    function chunkVttSegments(segments) {
        if (!segments.length) return [];
        const chunks = [];
        const maxChars = 1200;
        let currentSpeaker = null;
        let buffer = [];
        let bufferLen = 0;
        let startTime = null;
        let endTime = null;

        const flush = () => {
            if (!buffer.length) return;
            const text = buffer.join(" ").trim();
            if (!text) {
                buffer = [];
                bufferLen = 0;
                return;
            }
            chunks.push({
                text,
                metadata: {
                    chunkType: "vtt",
                    speaker: currentSpeaker || "Speaker",
                    start: startTime,
                    end: endTime,
                    segmentCount: buffer.length
                }
            });
            buffer = [];
            bufferLen = 0;
        };

        segments.forEach((segment) => {
            const speaker = segment.speaker || "Speaker";
            const line = (segment.text ? `[${speaker}] ${segment.text}` : "").trim();
            if (!line) return;
            if (!currentSpeaker) {
                currentSpeaker = speaker;
                startTime = segment.start || null;
            }
            if (currentSpeaker !== speaker && buffer.length) {
                flush();
                currentSpeaker = speaker;
                startTime = segment.start || null;
                endTime = null;
            }
            if (bufferLen + line.length > maxChars && buffer.length) {
                flush();
                currentSpeaker = speaker;
                startTime = segment.start || null;
                endTime = null;
            }
            buffer.push(line);
            bufferLen += line.length;
            endTime = segment.end || endTime;
        });
        flush();
        return chunks;
    }

    function chunkParagraphs(text, options = {}) {
        const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        if (!paragraphs.length) return [];
        const merged = [];
        for (const para of paragraphs) {
            if (!merged.length) {
                merged.push(para);
                continue;
            }
            if (para.length < 200) {
                merged[merged.length - 1] += "\n" + para;
            } else {
                merged.push(para);
            }
        }
        const chunks = [];
        const maxChars = options.maxChars ?? 2400;
        for (const para of merged) {
            if (para.length <= maxChars) {
                chunks.push(para);
                continue;
            }
            const sentences = para.split(/(?<=[.!?])\s+/);
            let current = "";
            for (const sentence of sentences) {
                if (!current.length) {
                    current = sentence;
                    continue;
                }
                if (current.length + sentence.length + 1 > maxChars) {
                    chunks.push(current);
                    current = sentence;
                } else {
                    current += " " + sentence;
                }
            }
            if (current) chunks.push(current);
        }
        return chunks;
    }

    function looksLikeLog(text) {
        const lines = splitLines(text).slice(0, 40);
        const timestampRegex = /^\[?\d{4}-\d{2}-\d{2}[T\s]/;
        let hits = 0;
        for (const line of lines) {
            if (timestampRegex.test(line.trim())) hits += 1;
        }
        return hits >= 6;
    }

    function parseLogMetadata(lines) {
        const timestampRegex = /^\[?(\d{4}-\d{2}-\d{2}[T\s][\d:.+-]+)\]?/;
        const levelRegex = /\b(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b/;
        const serviceRegex = /\bservice=([A-Za-z0-9_.-]+)\b|\[([A-Za-z0-9_.-]+)\]/;
        let firstTimestamp = null;
        let lastTimestamp = null;
        const levels = new Map();
        const services = new Map();
        lines.forEach((line) => {
            const ts = timestampRegex.exec(line);
            if (ts && ts[1]) {
                if (!firstTimestamp) firstTimestamp = ts[1];
                lastTimestamp = ts[1];
            }
            const level = levelRegex.exec(line);
            if (level && level[1]) {
                const key = level[1].toLowerCase();
                levels.set(key, (levels.get(key) || 0) + 1);
            }
            const service = serviceRegex.exec(line);
            const serviceValue = service && (service[1] || service[2]);
            if (serviceValue) {
                services.set(serviceValue, (services.get(serviceValue) || 0) + 1);
            }
        });
        return {
            firstTimestamp,
            lastTimestamp,
            levels: Array.from(levels.entries()),
            services: Array.from(services.entries())
        };
    }

    function chunkLogEvents(text, options = {}) {
        const lines = splitLines(text).filter((line) => line.trim().length);
        const batchSize = options.batchSize ?? 80;
        const chunks = [];
        let batch = [];
        for (const line of lines) {
            batch.push(line);
            if (batch.length >= batchSize) {
                const metadata = parseLogMetadata(batch);
                chunks.push({ text: batch.join("\n"), metadata });
                batch = [];
            }
        }
        if (batch.length) {
            const metadata = parseLogMetadata(batch);
            chunks.push({ text: batch.join("\n"), metadata });
        }
        return chunks;
    }

    function isPlainObject(value) {
        if (!value || typeof value !== "object") return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    function isPrimitive(value) {
        return value === null || (typeof value !== "object" && typeof value !== "function");
    }

    function isSafePathKey(key) {
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    }

    function joinJsonPath(parentPath, key) {
        if (parentPath === "$" || !parentPath) {
            return isSafePathKey(key) ? `$.${key}` : `$[\"${key.replace(/\"/g, "\\\"")}\"]`;
        }
        return isSafePathKey(key)
            ? `${parentPath}.${key}`
            : `${parentPath}[\"${key.replace(/\"/g, "\\\"")}\"]`;
    }

    function estimateJsonSize(node, limit = Infinity) {
        let total = 0;
        const stack = [{ value: node, state: "enter" }];
        while (stack.length) {
            const frame = stack.pop();
            const value = frame.value;
            if (frame.state === "exit") {
                total += 1;
                if (total > limit) return total;
                continue;
            }
            if (value === null) {
                total += 4;
                if (total > limit) return total;
                continue;
            }
            const type = typeof value;
            if (type === "string") {
                total += value.length + 2;
                if (total > limit) return total;
                continue;
            }
            if (type === "number" || type === "boolean") {
                total += String(value).length;
                if (total > limit) return total;
                continue;
            }
            if (Array.isArray(value)) {
                total += 1;
                if (total > limit) return total;
                stack.push({ value, state: "exit" });
                for (let i = value.length - 1; i >= 0; i--) {
                    if (i < value.length - 1) total += 1;
                    stack.push({ value: value[i], state: "enter" });
                    if (total > limit) return total;
                }
                continue;
            }
            if (isPlainObject(value)) {
                const keys = Object.keys(value);
                total += 1;
                if (total > limit) return total;
                stack.push({ value, state: "exit" });
                for (let i = keys.length - 1; i >= 0; i--) {
                    const key = keys[i];
                    if (i < keys.length - 1) total += 1;
                    total += key.length + 2 + 1;
                    stack.push({ value: value[key], state: "enter" });
                    if (total > limit) return total;
                }
                continue;
            }
            total += String(value).length;
            if (total > limit) return total;
        }
        return total;
    }

    function truncateString(value, maxChars) {
        if (typeof value !== "string") return value;
        if (value.length <= maxChars) return value;
        return value.slice(0, maxChars).trimEnd() + "...";
    }

    function renderJsonForEmbedding(node, path, options = {}) {
        const maxTotal = options.maxTotalChars || 1400;
        const maxString = options.maxStringChars || 600;
        const parts = [`path: ${path || "$"}`];
        let budget = maxTotal - parts[0].length;
        const pushLine = (line) => {
            if (budget <= 0) return;
            const clipped = line.length > budget ? line.slice(0, budget) : line;
            parts.push(clipped);
            budget -= clipped.length;
        };
        if (isPrimitive(node)) {
            if (typeof node === "string") {
                pushLine(`value: \"${truncateString(node, maxString)}\"`);
            } else {
                pushLine(`value: ${String(node)}`);
            }
            return parts.join("\n");
        }
        if (Array.isArray(node)) {
            pushLine(`type: array (${node.length})`);
            const preview = [];
            for (let i = 0; i < node.length && preview.length < 6; i++) {
                const value = node[i];
                if (isPrimitive(value)) {
                    preview.push(typeof value === "string"
                        ? `\"${truncateString(value, Math.min(maxString, 120))}\"`
                        : String(value));
                }
            }
            if (preview.length) {
                pushLine(`items: ${preview.join(" | ")}`);
            }
            return parts.join("\n");
        }
        if (isPlainObject(node)) {
            const keys = Object.keys(node);
            pushLine(`type: object (${keys.length})`);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const value = node[key];
                if (isPrimitive(value)) {
                    const rendered = typeof value === "string"
                        ? `\"${truncateString(value, Math.min(maxString, 220))}\"`
                        : String(value);
                    pushLine(`${key}: ${rendered}`);
                } else if (Array.isArray(value)) {
                    pushLine(`${key}: [array ${value.length}]`);
                } else if (isPlainObject(value)) {
                    pushLine(`${key}: {object}`);
                } else {
                    pushLine(`${key}: ${String(value)}`);
                }
                if (budget <= 0) break;
            }
            return parts.join("\n");
        }
        pushLine(`value: ${String(node)}`);
        return parts.join("\n");
    }

    function isArrayOfObjects(value) {
        if (!Array.isArray(value) || value.length === 0) return false;
        const sampleSize = Math.min(value.length, 6);
        for (let i = 0; i < sampleSize; i++) {
            if (!isPlainObject(value[i])) return false;
        }
        return true;
    }

    function isLikelyHtml(value) {
        if (typeof value !== "string") return false;
        if (value.length < 40) return false;
        return /<[^>]+>/.test(value);
    }

    function renderPrimitiveValue(value, options = {}) {
        if (typeof value === "string") {
            if (isLikelyHtml(value)) {
                return "[html omitted]";
            }
            const maxString = options.maxStringChars || 600;
            return `"${truncateString(value, Math.min(maxString, 220))}"`;
        }
        return String(value);
    }

    function pickKeyByHints(keys, hints) {
        for (const hint of hints) {
            const found = keys.find((key) => key.toLowerCase() === hint);
            if (found) return found;
        }
        for (const hint of hints) {
            const found = keys.find((key) => key.toLowerCase().includes(hint));
            if (found) return found;
        }
        return null;
    }

    function extractTopLevelPrimitives(record) {
        if (!isPlainObject(record)) return [];
        const keys = Object.keys(record);
        const entries = [];
        for (const key of keys) {
            const value = record[key];
            if (isPrimitive(value)) {
                entries.push({ key, value });
            }
        }
        return entries;
    }

    function buildRecordMeta(primitives) {
        const keys = primitives.map((entry) => entry.key);
        const titleKey = pickKeyByHints(keys, ["title", "name", "label"]);
        const typeKey = pickKeyByHints(keys, ["type", "kind", "category"]);
        const idKey = pickKeyByHints(keys, ["id", "uuid", "key", "code", "reference", "ref", "number"]);
        const lookup = (key) => primitives.find((entry) => entry.key === key)?.value;
        return {
            titleKey,
            typeKey,
            idKey,
            titleValue: titleKey ? lookup(titleKey) : null,
            typeValue: typeKey ? lookup(typeKey) : null,
            idValue: idKey ? lookup(idKey) : null
        };
    }

    function buildRecordEmbeddingText(record, path, options = {}, context = {}) {
        const maxTotal = options.maxTotalChars || 1400;
        const parts = [`path: ${path || "$"}`];
        let budget = maxTotal - parts[0].length;
        const pushLine = (line) => {
            if (budget <= 0) return;
            const clipped = line.length > budget ? line.slice(0, budget) : line;
            parts.push(clipped);
            budget -= clipped.length;
        };

        const primitives = extractTopLevelPrimitives(record);
        const meta = buildRecordMeta(primitives);
        if (meta.titleKey && meta.titleValue !== null) {
            pushLine(`title: ${renderPrimitiveValue(meta.titleValue, options)}`);
        }
        if (meta.typeKey && meta.typeValue !== null) {
            pushLine(`type: ${renderPrimitiveValue(meta.typeValue, options)}`);
        }
        if (meta.idKey && meta.idValue !== null) {
            pushLine(`id: ${renderPrimitiveValue(meta.idValue, options)}`);
        }
        if (context?.parentLabel) {
            pushLine(`parent: ${context.parentLabel}`);
        }
        if (context?.relation) {
            pushLine(`relation: ${context.relation}`);
        }

        const usedKeys = new Set([meta.titleKey, meta.typeKey, meta.idKey].filter(Boolean));
        const summaryPairs = [];
        for (const entry of primitives) {
            if (usedKeys.has(entry.key)) continue;
            summaryPairs.push(`${entry.key}=${renderPrimitiveValue(entry.value, options)}`);
            if (summaryPairs.length >= 3) break;
        }
        if (summaryPairs.length) {
            pushLine(`summary: ${summaryPairs.join("; ")}`);
        }

        let added = 0;
        for (const entry of primitives) {
            if (usedKeys.has(entry.key)) continue;
            pushLine(`${entry.key}: ${renderPrimitiveValue(entry.value, options)}`);
            added += 1;
            if (added >= 12 || budget <= 0) break;
        }
        return parts.join("\n");
    }

    function collectNestedArrayPaths(root, basePath, maxDepth = 4) {
        const results = [];
        const seen = new Set();
        const stack = [{ value: root, path: basePath, depth: 0 }];
        while (stack.length) {
            const current = stack.pop();
            if (!current) continue;
            const { value, path, depth } = current;
            if (depth > maxDepth) continue;
            if (Array.isArray(value)) {
                if (isArrayOfObjects(value)) {
                    if (!seen.has(path)) {
                        results.push({ path, items: value });
                        seen.add(path);
                    }
                }
                for (let i = value.length - 1; i >= 0; i--) {
                    const item = value[i];
                    if (isPlainObject(item) || Array.isArray(item)) {
                        stack.push({ value: item, path: `${path}[${i}]`, depth: depth + 1 });
                    }
                }
                continue;
            }
            if (isPlainObject(value)) {
                const keys = Object.keys(value);
                for (let i = keys.length - 1; i >= 0; i--) {
                    const key = keys[i];
                    const child = value[key];
                    if (isPlainObject(child) || Array.isArray(child)) {
                        stack.push({ value: child, path: joinJsonPath(path, key), depth: depth + 1 });
                    }
                }
            }
        }
        return results;
    }

    function chunkLongString(value, path, options) {
        const chunks = [];
        const maxChunkChars = options.maxStringChunkChars || 5000;
        const totalParts = Math.ceil(value.length / maxChunkChars);
        for (let i = 0; i < value.length; i += maxChunkChars) {
            const part = value.slice(i, i + maxChunkChars);
            const partIndex = Math.floor(i / maxChunkChars);
            const partPath = `${path}#part${partIndex + 1}`;
            chunks.push({
                path: partPath,
                parentPath: path,
                rawChunk: part,
                textForEmbedding: renderJsonForEmbedding(part, partPath, options),
                metadata: {
                    nodeType: "string",
                    partIndex: partIndex + 1,
                    partCount: totalParts,
                    totalLength: value.length
                }
            });
        }
        return chunks;
    }

    function chunkRecordSections(record, recordPath, options, chunks, skipKeys = []) {
        if (!isPlainObject(record)) return;
        const maxChunkChars = options.maxChunkChars || 6500;
        const keys = Object.keys(record).filter((key) => !skipKeys.includes(key));
        let batch = {};
        let batchKeys = [];
        let batchSize = 2;
        const flushBatch = () => {
            if (!batchKeys.length) return;
            const batchPath = batchKeys.length === 1
                ? joinJsonPath(recordPath, batchKeys[0])
                : `${recordPath}{${batchKeys.join(",")}}`;
            chunks.push({
                path: batchPath,
                parentPath: recordPath,
                rawChunk: { ...batch },
                textForEmbedding: renderJsonForEmbedding(batch, batchPath, options),
                metadata: {
                    nodeType: "record-section",
                    keys: batchKeys.slice()
                }
            });
            batch = {};
            batchKeys = [];
            batchSize = 2;
        };
        for (const key of keys) {
            const value = record[key];
            const entrySize = estimateJsonSize(value, maxChunkChars + 1) + key.length + 4;
            if (entrySize > maxChunkChars) {
                flushBatch();
                const childPath = joinJsonPath(recordPath, key);
                chunkJsonNode(value, childPath, recordPath, options, chunks);
                continue;
            }
            if (batchSize + entrySize > maxChunkChars) {
                flushBatch();
            }
            batch[key] = value;
            batchKeys.push(key);
            batchSize += entrySize + 1;
        }
        flushBatch();
    }

    function buildCollectionChunks(collectionPath, items, options, chunks) {
        const maxChunkChars = options.maxChunkChars || 6500;
        for (let i = 0; i < items.length; i++) {
            const record = items[i];
            const recordPath = `${collectionPath}[${i}]`;
            const primitives = extractTopLevelPrimitives(record);
            const meta = buildRecordMeta(primitives);
            chunks.push({
                path: recordPath,
                parentPath: collectionPath,
                rawChunk: record,
                textForEmbedding: buildRecordEmbeddingText(record, recordPath, options),
                metadata: {
                    nodeType: "record",
                    recordIndex: i,
                    collectionPath
                }
            });

            const subRecordPaths = collectNestedArrayPaths(record, recordPath);
            const subRecordKeys = subRecordPaths.map((entry) => {
                const match = entry.path.match(/\.([A-Za-z0-9_]+)$/);
                return match ? match[1] : null;
            }).filter(Boolean);
            subRecordPaths.forEach((entry) => {
                const parentLabel = meta.titleValue || meta.idValue || recordPath;
                for (let j = 0; j < entry.items.length; j++) {
                    const child = entry.items[j];
                    const childPath = `${entry.path}[${j}]`;
                    const relation = entry.path.startsWith(recordPath)
                        ? entry.path.slice(recordPath.length + 1) + `[${j}]`
                        : `${entry.path}[${j}]`;
                    chunks.push({
                        path: childPath,
                        parentPath: recordPath,
                        rawChunk: child,
                        textForEmbedding: buildRecordEmbeddingText(child, childPath, options, {
                            parentLabel,
                            relation
                        }),
                        metadata: {
                            nodeType: "sub-record",
                            recordIndex: i,
                            subIndex: j,
                            parentKey: relation
                        }
                    });
                }
            });

            const recordSize = estimateJsonSize(record, maxChunkChars + 1);
            if (recordSize > maxChunkChars) {
                chunkRecordSections(record, recordPath, options, chunks, subRecordKeys);
            }
        }
    }

    function chunkJsonNode(node, path, parentPath, options, chunks) {
        const maxChunkChars = options.maxChunkChars || 6500;
        const sizeEstimate = estimateJsonSize(node, maxChunkChars + 1);
        const nodeType = Array.isArray(node) ? "array" : isPlainObject(node) ? "object" : typeof node;
        if (sizeEstimate <= maxChunkChars) {
            chunks.push({
                path,
                parentPath,
                rawChunk: node,
                textForEmbedding: renderJsonForEmbedding(node, path, options),
                metadata: {
                    nodeType,
                    sizeEstimate
                }
            });
            return;
        }
        if (typeof node === "string") {
            chunks.push(...chunkLongString(node, path, options));
            return;
        }
        if (Array.isArray(node)) {
            const items = node;
            let batch = [];
            let batchStart = 0;
            let batchSize = 2;
            const flushBatch = (endIndex) => {
                if (!batch.length) return;
                const batchPath = `${path}[${batchStart}:${endIndex}]`;
                chunks.push({
                    path: batchPath,
                    parentPath: path,
                    rawChunk: batch.slice(),
                    textForEmbedding: renderJsonForEmbedding(batch, batchPath, options),
                    metadata: {
                        nodeType: "array",
                        startIndex: batchStart,
                        endIndex: endIndex - 1,
                        itemCount: batch.length
                    }
                });
                batch = [];
                batchStart = endIndex;
                batchSize = 2;
            };
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemSize = estimateJsonSize(item, maxChunkChars + 1);
                if (itemSize > maxChunkChars) {
                    flushBatch(i);
                    const itemPath = `${path}[${i}]`;
                    chunkJsonNode(item, itemPath, path, options, chunks);
                    continue;
                }
                if (batchSize + itemSize > maxChunkChars) {
                    flushBatch(i);
                }
                batch.push(item);
                batchSize += itemSize + 1;
            }
            flushBatch(items.length);
            return;
        }
        if (isPlainObject(node)) {
            const keys = Object.keys(node);
            let batch = {};
            let batchKeys = [];
            let batchSize = 2;
            const flushBatch = () => {
                if (!batchKeys.length) return;
                const batchPath = batchKeys.length === 1
                    ? joinJsonPath(path, batchKeys[0])
                    : `${path}{${batchKeys.join(",")}}`;
                chunks.push({
                    path: batchPath,
                    parentPath: path,
                    rawChunk: { ...batch },
                    textForEmbedding: renderJsonForEmbedding(batch, batchPath, options),
                    metadata: {
                        nodeType: "object",
                        keys: batchKeys.slice()
                    }
                });
                batch = {};
                batchKeys = [];
                batchSize = 2;
            };
            for (const key of keys) {
                const value = node[key];
                const entrySize = estimateJsonSize(value, maxChunkChars + 1) + key.length + 4;
                if (entrySize > maxChunkChars) {
                    flushBatch();
                    const childPath = joinJsonPath(path, key);
                    chunkJsonNode(value, childPath, path, options, chunks);
                    continue;
                }
                if (batchSize + entrySize > maxChunkChars) {
                    flushBatch();
                }
                batch[key] = value;
                batchKeys.push(key);
                batchSize += entrySize + 1;
            }
            flushBatch();
            return;
        }
        chunks.push({
            path,
            parentPath,
            rawChunk: node,
            textForEmbedding: renderJsonForEmbedding(node, path, options),
            metadata: {
                nodeType,
                sizeEstimate
            }
        });
    }

    function buildJsonChunks(data, options = {}) {
        const chunks = [];
        if (isArrayOfObjects(data)) {
            buildCollectionChunks("$", data, options, chunks);
            return chunks;
        }
        if (isPlainObject(data)) {
            const keys = Object.keys(data);
            const collectionKeys = keys.filter((key) => isArrayOfObjects(data[key]));
            if (collectionKeys.length) {
                collectionKeys.forEach((key) => {
                    const collectionPath = joinJsonPath("$", key);
                    buildCollectionChunks(collectionPath, data[key], options, chunks);
                });
                return chunks;
            }
        }
        chunkJsonNode(data, "$", null, options, chunks);
        return chunks;
    }

    // Export helper functions for testing/benchmarking
    if (typeof global !== "undefined") {
        global.GoToolkitBuildJsonChunks = buildJsonChunks;
        global.GoToolkitChunkJsonNode = chunkJsonNode;
        global.GoToolkitRenderJsonForEmbedding = renderJsonForEmbedding;
    }

    function parseTimestamp(value) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string" && value.trim()) {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
            const date = Date.parse(value);
            if (Number.isFinite(date)) return date;
        }
        return 0;
    }

    function isInt8Embedding(value) {
        return value instanceof Int8Array;
    }

    function quantizeEmbedding(values) {
        if (!values || !values.length) return new Int8Array(0);
        if (isInt8Embedding(values)) return values;
        const length = values.length;
        let maxAbs = 0;
        for (let i = 0; i < length; i++) {
            const val = values[i];
            if (!Number.isFinite(val)) continue;
            const abs = Math.abs(val);
            if (abs > maxAbs) maxAbs = abs;
        }
        if (!maxAbs) return new Int8Array(length);
        const scale = 127 / maxAbs;
        const out = new Int8Array(length);
        for (let i = 0; i < length; i++) {
            const val = values[i];
            const scaled = Math.round(val * scale);
            if (scaled > 127) {
                out[i] = 127;
            } else if (scaled < -128) {
                out[i] = -128;
            } else {
                out[i] = scaled;
            }
        }
        return out;
    }

    function cosineSimInt8(a, b) {
        let dot = 0;
        let na = 0;
        let nb = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const x = a[i];
            const y = b[i];
            dot += x * y;
            na += x * x;
            nb += y * y;
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom ? dot / denom : 0;
    }

    function normalizeScopes(value) {
        if (!Array.isArray(value)) return [];
        return value
            .map((scope) => (typeof scope === "string" ? scope.trim().toLowerCase() : ""))
            .filter(Boolean);
    }

    function normalizeConversationId(value) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        if (value && typeof value.toString === "function") {
            const str = value.toString().trim();
            if (str) return str;
        }
        return "global";
    }

    function getExtension(filename) {
        const match = /\.([^.]+)$/.exec(filename);
        return match ? match[1].toLowerCase() : "";
    }

    function bufferToHex(buffer) {
        const bytes = new Uint8Array(buffer || []);
        let out = "";
        for (let i = 0; i < bytes.length; i++) {
            out += bytes[i].toString(16).padStart(2, "0");
        }
        return out;
    }

    function extractTextFromXml(xmlContent) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlContent, "application/xml");
            return doc?.documentElement?.textContent || "";
        } catch (err) {
            return xmlContent.replace(/<[^>]+>/g, " ");
        }
    }

    function parseRelationships(xmlContent) {
        if (!xmlContent) return {};
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlContent, "application/xml");
            const rels = {};
            const nodes = doc.getElementsByTagName("Relationship");
            for (let i = 0; i < nodes.length; i++) {
                const rel = nodes[i];
                const id = rel.getAttribute("Id");
                const target = rel.getAttribute("Target");
                const type = rel.getAttribute("Type") || "";
                if (id && target && /\/image$/i.test(type)) {
                    rels[id] = target;
                }
            }
            return rels;
        } catch (err) {
            return {};
        }
    }

    function resolveZipTarget(basePath, target) {
        if (!target) return "";
        let normalized = target.replace(/^\/+/, "");
        while (normalized.startsWith("../")) {
            normalized = normalized.slice(3);
        }
        return basePath + normalized;
    }

    function createSettingsStore() {
        const factory = global.goToolkitStorageService?.createStore;
        if (typeof factory !== "function") {
            return {
                read: async () => DEFAULT_SETTINGS,
                write: async (value) => value
            };
        }
        return factory({
            storeName: "documents-settings",
            localStorageKey: STORAGE_KEY,
            defaultValue: () => DEFAULT_SETTINGS,
            logPrefix: "goToolkit.documents.settings"
        });
    }

    class DocumentManager {
        constructor() {
            this.settingsStore = createSettingsStore();
            this.settings = { ...DEFAULT_SETTINGS };
            this.statsListeners = new Set();
            this.settingsListeners = new Set();
            this.dbPromise = null;
            this.embedder = null;
            this.embedModelId = null;
            this.pipelineFactory = null;
            this.env = null;
            this.pdfjs = null;
            this.jszip = null;
            this.transformersPromise = null;
            this.pdfjsPromise = null;
            this.jszipPromise = null;
            this.keywordIndex = global.GoToolkitKeywordIndex || null;
            if (!this.keywordIndex) {
                console.warn("Keyword index unavailable: GoToolkitKeywordIndex not found.");
            }
            this.readyPromise = this.initialize();
        }

        async initialize() {
            try {
                await this.loadSettings();
                await this.ensureDb();
                await this.migrateMemoEmbeddingsEnabled();
                await this.cleanupExpiredEmbeddings();
                this.emitSettings();
                this.scheduleIdleHeavyModulesPrefetch();
            } catch (err) {
                console.error("Documents manager initialisation failed", err);
                throw err;
            }
        }

        scheduleIdleHeavyModulesPrefetch() {
            const runPrefetch = () => {
                Promise.allSettled([
                    this.ensurePdfJs(),
                    this.ensureJsZip(),
                    this.ensureTransformers()
                ]).catch(() => {
                    // noop
                });
            };
            const shouldPrefetch = !Boolean(global.GoToolkitDisableHeavyModulesPrefetch);
            if (!shouldPrefetch) return;
            if (typeof global.requestIdleCallback === "function") {
                global.requestIdleCallback(() => runPrefetch(), { timeout: 8000 });
                return;
            }
            global.setTimeout(runPrefetch, 1800);
        }

        async ensureTransformers() {
            if (this.pipelineFactory) return this.pipelineFactory;
            if (this.transformersPromise) return this.transformersPromise;
            this.transformersPromise = import(TRANSFORMERS_URL)
                .then((transformers) => {
                    this.pipelineFactory = transformers?.pipeline || null;
                    this.env = transformers?.env || null;
                    if (this.env) {
                        this.env.allowLocalModels = false;
                        this.env.useBrowserCache = true;
                    }
                    if (!this.pipelineFactory) {
                        throw new Error("Transformers pipeline indisponible");
                    }
                    return this.pipelineFactory;
                })
                .catch((err) => {
                    this.transformersPromise = null;
                    throw err;
                });
            return this.transformersPromise;
        }

        async ensurePdfJs() {
            if (this.pdfjs) return this.pdfjs;
            if (this.pdfjsPromise) return this.pdfjsPromise;
            this.pdfjsPromise = import(PDFJS_URL)
                .then((pdfModule) => {
                    this.pdfjs = pdfModule?.default || pdfModule || null;
                    if (this.pdfjs?.GlobalWorkerOptions) {
                        this.pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                    }
                    if (!this.pdfjs) {
                        throw new Error("pdfjs indisponible");
                    }
                    return this.pdfjs;
                })
                .catch((err) => {
                    this.pdfjsPromise = null;
                    throw err;
                });
            return this.pdfjsPromise;
        }

        async ensureJsZip() {
            if (this.jszip) return this.jszip;
            if (this.jszipPromise) return this.jszipPromise;
            this.jszipPromise = import(JSZIP_URL)
                .then((jsZipModule) => {
                    this.jszip = normalizeJsZipModule(jsZipModule);
                    if (!this.jszip) {
                        throw new Error("JSZip indisponible");
                    }
                    return this.jszip;
                })
                .catch((err) => {
                    this.jszipPromise = null;
                    throw err;
                });
            return this.jszipPromise;
        }

        async waitReady() {
            if (!this.readyPromise) {
                this.readyPromise = this.initialize();
            }
            return this.readyPromise;
        }

        async loadSettings() {
            try {
                const stored = await this.settingsStore.read();
                if (stored && typeof stored === "object") {
                    this.settings = { ...DEFAULT_SETTINGS, ...stored };
                }
            } catch (err) {
                console.warn("Documents: failed to load settings", err);
            }
            return this.settings;
        }

        async updateSettings(partial) {
            this.settings = { ...this.settings, ...partial };
            await this.settingsStore.write(this.settings);
            if (partial.embedModelId && partial.embedModelId !== this.embedModelId) {
                this.embedder = null;
                this.embedModelId = null;
            }
            this.emitSettings();
            return this.settings;
        }

        getMemoEmbeddingRetentionMs() {
            const days = Number(global?.GoToolkitSiteConfig?.get?.("memo.contextEmbeddings.retentionDays", 7)) || 7;
            return Math.max(1, days) * 24 * 60 * 60 * 1000;
        }

        onStatsChange(callback) {
            this.statsListeners.add(callback);
            return () => this.statsListeners.delete(callback);
        }

        onSettingsChange(callback) {
            this.settingsListeners.add(callback);
            try {
                callback(this.settings);
            } catch (err) {
                console.error(err);
            }
            return () => this.settingsListeners.delete(callback);
        }

        async emitStats(conversationId) {
            const snapshot = await this.getStats(conversationId);
            this.statsListeners.forEach((cb) => {
                try {
                    cb(snapshot);
                } catch (err) {
                    console.error(err);
                }
            });
        }

        emitSettings() {
            this.settingsListeners.forEach((cb) => {
                try {
                    cb(this.settings);
                } catch (err) {
                    console.error(err);
                }
            });
        }

        determineChunkCategory(text) {
            return shouldUseSmallChunks(text) ? "small" : "medium";
        }

        getChunkConfig(category) {
            const info = CHUNK_CATEGORY_DEFINITIONS[category] || CHUNK_CATEGORY_DEFINITIONS.medium;
            return {
                category: info.key,
                chunkSize: clampNumber(
                    this.settings.chunkSize,
                    info.chunkSizeRange.min,
                    info.chunkSizeRange.max,
                    info.defaultChunkSize
                ),
                chunkOverlap: clampNumber(
                    this.settings.chunkOverlap,
                    info.overlapRange.min,
                    info.overlapRange.max,
                    info.defaultOverlap
                )
            };
        }

        getChunkConfigForText(text) {
            return this.getChunkConfig(this.determineChunkCategory(text));
        }

        async ensureDb() {
            if (this.dbPromise) return this.dbPromise;
            this.dbPromise = new Promise((resolve, reject) => {
                if (typeof indexedDB === "undefined" || !indexedDB) {
                    reject(new Error("IndexedDB indisponible"));
                    return;
                }
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = request.result;
                    const oldVersion = event?.oldVersion || 0;
                    let docs = null;
                    if (!db.objectStoreNames.contains("documents")) {
                        docs = db.createObjectStore("documents", { keyPath: "id" });
                        docs.createIndex("conversationId", "conversationId", { unique: false });
                    } else {
                        docs = request.transaction?.objectStore("documents") || null;
                    }
                    if (docs && !docs.indexNames.contains("fileHash")) {
                        docs.createIndex("fileHash", "fileHash", { unique: false });
                    }
                    if (docs && !docs.indexNames.contains("memoId")) {
                        docs.createIndex("memoId", "memoId", { unique: false });
                    }
                    if (!db.objectStoreNames.contains("chunks")) {
                        const chunks = db.createObjectStore("chunks", { keyPath: "id" });
                        chunks.createIndex("conversationId", "conversationId", { unique: false });
                        chunks.createIndex("docId", "docId", { unique: false });
                        chunks.createIndex("sourceDocId", "sourceDocId", { unique: false });
                    } else {
                        const chunks = request.transaction?.objectStore("chunks");
                        if (chunks && !chunks.indexNames.contains("sourceDocId")) {
                            chunks.createIndex("sourceDocId", "sourceDocId", { unique: false });
                        }
                    }
                    if (!db.objectStoreNames.contains("keyword_meta")) {
                        db.createObjectStore("keyword_meta", { keyPath: "id" });
                    }
                    if (!db.objectStoreNames.contains("memo_context_embeddings")) {
                        const memoStore = db.createObjectStore("memo_context_embeddings", { keyPath: "id" });
                        memoStore.createIndex("memoId", "memoId", { unique: false });
                        memoStore.createIndex("docId", "docId", { unique: false });
                        memoStore.createIndex("fileHash", "fileHash", { unique: false });
                    }
                    if (oldVersion && oldVersion < 5 && db.objectStoreNames.contains("chunks")) {
                        const store = request.transaction?.objectStore("chunks");
                        if (store) {
                            store.openCursor().onsuccess = (cursorEvent) => {
                                const cursor = cursorEvent.target.result;
                                if (!cursor) return;
                                const value = cursor.value;
                                if (value?.emb && !isInt8Embedding(value.emb)) {
                                    value.emb = quantizeEmbedding(value.emb);
                                    cursor.update(value);
                                }
                                cursor.continue();
                            };
                        }
                    }
                };
                request.onsuccess = async () => {
                    const db = request.result;
                    db.onversionchange = () => {
                        try {
                            db.close();
                        } catch (err) {
                            // ignore
                        }
                    };
                    const missing = getMissingStores(db);
                    if (missing.length) {
                        try {
                            db.close();
                        } catch (err) {
                            // ignore
                        }
                        this.dbPromise = null;
                        try {
                            await this.repairIndexedDB({ reason: "missing-stores", missingStores: missing });
                            const repairedDb = await this.ensureDb();
                            resolve(repairedDb);
                        } catch (err) {
                            reject(err);
                        }
                        return;
                    }
                    resolve(db);
                };
                request.onerror = () => reject(request.error || new Error("IndexedDB ouverture échouée"));
            });
            return this.dbPromise;
        }

        async repairIndexedDB(info = {}) {
            if (typeof indexedDB === "undefined" || !indexedDB) {
                throw new Error("IndexedDB indisponible");
            }
            let db = null;
            try {
                db = await this.dbPromise;
            } catch (err) {
                db = null;
            }
            try {
                db?.close?.();
            } catch (err) {
                // ignore
            }
            this.dbPromise = null;

            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(DB_NAME);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error || new Error("IndexedDB suppression échouée"));
                request.onblocked = () => {
                    console.warn("IndexedDB delete blocked", { db: DB_NAME, info });
                    try {
                        document.dispatchEvent(new CustomEvent("goToolkitDocumentsDbStatus", {
                            detail: { status: "blocked", info }
                        }));
                    } catch (err) {
                        // ignore
                    }
                    reject(new Error("IndexedDB suppression bloquée"));
                };
            });

            // Re-open so stores exist again.
            await this.ensureDb();
            return true;
        }

        async getStore(storeName, mode = "readonly") {
            const db = await this.ensureDb();
            if (!db) return null;
            try {
                return db.transaction(storeName, mode).objectStore(storeName);
            } catch (err) {
                if (isMissingStoreError(err)) {
                    console.warn("IndexedDB store missing, repairing", { storeName, mode, err });
                    await this.repairIndexedDB({ reason: "transaction-missing-store", storeName });
                    const repaired = await this.ensureDb();
                    return repaired.transaction(storeName, mode).objectStore(storeName);
                }
                if (isDbClosingError(err)) {
                    console.warn("IndexedDB connection closing, reopening", { storeName, mode, err });
                    this.dbPromise = null;
                    const reopened = await this.ensureDb();
                    return reopened.transaction(storeName, mode).objectStore(storeName);
                }
                throw err;
            }
        }

        async ensureEmbedder() {
            const modelId = this.settings.embedModelId || DEFAULT_SETTINGS.embedModelId;
            const sharedCache = global.GoToolkitEmbedderCache || (global.GoToolkitEmbedderCache = {});
            if (this.embedder && this.embedModelId === modelId) return;
            await this.ensureTransformers();
            if (!this.pipelineFactory) return;
            if (sharedCache.modelId === modelId && sharedCache.embedder) {
                this.embedder = sharedCache.embedder;
                this.embedModelId = modelId;
                return;
            }
            if (sharedCache.modelId === modelId && sharedCache.promise) {
                this.embedder = await sharedCache.promise;
                this.embedModelId = modelId;
                return;
            }
            sharedCache.modelId = modelId;
            sharedCache.promise = this.pipelineFactory("feature-extraction", modelId, { quantized: true });
            this.embedder = await sharedCache.promise;
            sharedCache.embedder = this.embedder;
            sharedCache.promise = null;
            this.embedModelId = modelId;
        }

        async computeFileHash(file) {
            if (!file) return { hash: "", buffer: null };
            const buffer = await file.arrayBuffer();
            if (typeof crypto === "undefined" || !crypto.subtle?.digest) {
                return { hash: "", buffer };
            }
            const digest = await crypto.subtle.digest("SHA-256", buffer);
            return { hash: bufferToHex(digest), buffer };
        }

        async embed(text) {
            await this.waitReady();
            await this.ensureEmbedder();
            if (!this.embedder) throw new Error("Embedder indisponible");
            const output = await this.embedder(text, { pooling: "mean", normalize: true });
            return output.data;
        }

        async embedBatch(texts) {
            if (!texts || !texts.length) return [];
            await this.waitReady();
            await this.ensureEmbedder();
            if (!this.embedder) throw new Error("Embedder indisponible");
            const results = new Array(texts.length);
            const max = Math.max(1, Math.min(EMBED_BATCH_MAX, texts.length));
            for (let i = 0; i < texts.length; i += max) {
                const slice = texts.slice(i, i + max);
                const outputs = await this.embedder(slice, { pooling: "mean", normalize: true });
                if (Array.isArray(outputs)) {
                    outputs.forEach((out, idx) => {
                        results[i + idx] = out?.data || out;
                    });
                    continue;
                }
                if (outputs && outputs.data && Array.isArray(outputs.dims) && outputs.dims.length === 2) {
                    const batchSize = Number(outputs.dims[0]) || 0;
                    const dimSize = Number(outputs.dims[1]) || 0;
                    if (batchSize !== slice.length || !dimSize) {
                        throw new Error("Unexpected embedder output format");
                    }
                    const flat = outputs.data;
                    for (let j = 0; j < batchSize; j++) {
                        const start = j * dimSize;
                        const end = start + dimSize;
                        results[i + j] = flat.slice(start, end);
                    }
                    continue;
                }
                if (outputs && Array.isArray(outputs.data)) {
                    if (outputs.data.length !== slice.length) {
                        throw new Error("Unexpected embedder output format");
                    }
                    outputs.data.forEach((out, idx) => {
                        results[i + idx] = out;
                    });
                    continue;
                }
                if (outputs && outputs.data && slice.length === 1) {
                    results[i] = outputs.data;
                    continue;
                }
                throw new Error("Unexpected embedder output format");
            }
            return results;
        }

        async embedBatchCloud(texts, options = {}) {
            if (!texts || !texts.length) return [];
            const backend = resolveOpenRouterEmbeddingBackend();
            if (!backend) {
                throw new Error("OpenRouter embeddings indisponible");
            }
            const suppressToaster = Boolean(options?.suppressToaster);
            const embeddingDuration = clampDuration(20000 + texts.length * 200, 20000, 90000);
            if (!suppressToaster) {
                setAiRequestToasterVisible("aiRequestCounterToasterEmbeddings", "search", "Embeddings cloud", true, { durationMs: embeddingDuration });
            }
            const results = new Array(texts.length);
            const batchSize = Math.max(1, Math.min(CLOUD_EMBEDDING_BATCH_SIZE, texts.length));
            try {
                for (let i = 0; i < texts.length; i += batchSize) {
                    const slice = texts.slice(i, i + batchSize);
                    const payload = buildOpenRouterEmbeddingPayload(slice, backend);
                    const response = await fetch(backend.endpoint, {
                        method: "POST",
                        headers: buildOpenRouterEmbeddingHeaders(backend.apiKey),
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) {
                        const body = await response.text().catch(() => "");
                        throw new Error(body || "OpenRouter embeddings indisponible");
                    }
                    const data = await response.json();
                    const rows = Array.isArray(data?.data) ? data.data : [];
                    if (!rows.length) {
                        throw new Error("OpenRouter embeddings: réponse invalide");
                    }
                    rows.sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
                    rows.forEach((row, idx) => {
                        const emb = row?.embedding;
                        if (!emb || !emb.length) {
                            throw new Error("OpenRouter embeddings: vecteur manquant");
                        }
                        results[i + idx] = emb;
                    });
                }
            } finally {
                if (!suppressToaster) {
                    setAiRequestToasterVisible("aiRequestCounterToasterEmbeddings", "search", "Embeddings cloud", false);
                }
            }
            return results;
        }

        async ensureKeywordIndexReady() {
            if (!this.keywordIndex) return false;
            if (this.keywordIndex.index) return true;
            const size = await this.getKeywordIndexSize();
            if (!size) return false;
            await this.rebuildKeywordIndex();
            return !!this.keywordIndex.index;
        }

        async persistKeywordMeta() {
            if (!this.keywordIndex) return;
            const store = await this.getStore("keyword_meta", "readwrite");
            if (!store) return;
            const snapshot = this.keywordIndex.getMetaSnapshot();
            await new Promise((resolve, reject) => {
                const request = store.put({
                    id: "keyword-meta",
                    total: snapshot.total,
                    perConversation: snapshot.perConversation,
                    engine: snapshot.engine,
                    updatedAt: Date.now()
                });
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        }

        createKeywordDoc(chunk, docMeta) {
            if (!chunk || !chunk.id) return null;
            return {
                id: chunk.id,
                chunkId: chunk.id,
                docId: chunk.docId,
                conversationId: normalizeConversationId(chunk.conversationId),
                text: chunk.text || "",
                section: typeof chunk.idx === "number" ? chunk.idx : 0,
                page: chunk.page || undefined,
                line: chunk.line || undefined,
                size: chunk.size || "",
                sourceType: docMeta?.sourceType || "context"
            };
        }

        async rebuildKeywordIndex() {
            if (!this.keywordIndex) return;
            try {
                const [docs, chunks] = await Promise.all([this.getAllDocuments(), this.getAllChunks()]);
                const docMap = new Map();
                docs.forEach((doc) => docMap.set(doc.id, doc));
                const keywordDocs = [];
                chunks.forEach((chunk) => {
                    const entry = this.createKeywordDoc(chunk, docMap.get(chunk.docId));
                    if (entry) keywordDocs.push(entry);
                });
                await this.keywordIndex.buildIndex(keywordDocs);
                await this.persistKeywordMeta();
            } catch (err) {
                console.warn("Keyword index rebuild failed", err);
            }
        }

        async addChunkToKeywordIndex(chunk, docMeta) {
            if (!this.keywordIndex || !chunk) {
                if (!this.warnedMissingKeywordIndex) {
                    this.warnedMissingKeywordIndex = true;
                    console.warn("Keyword index skipped: GoToolkitKeywordIndex unavailable.");
                }
                return;
            }
            const doc = this.createKeywordDoc(chunk, docMeta);
            if (!doc) return;
            try {
                await this.keywordIndex.addDocs([doc]);
                await this.persistKeywordMeta();
            } catch (err) {
                console.warn("Keyword index add failed", err);
            }
        }

        async removeDocsFromKeywordIndex(docIds) {
            if (!this.keywordIndex || !Array.isArray(docIds) || !docIds.length) return;
            try {
                await this.keywordIndex.removeByDocIds(docIds);
                await this.persistKeywordMeta();
            } catch (err) {
                console.warn("Keyword index remove failed", err);
            }
        }

        async removeConversationFromKeywordIndex(conversationId) {
            if (!this.keywordIndex) return;
            try {
                await this.keywordIndex.removeByConversation(normalizeConversationId(conversationId));
                await this.persistKeywordMeta();
            } catch (err) {
                console.warn("Keyword index conversation remove failed", err);
            }
        }

        async getKeywordIndexSize(conversationId) {
            if (this.keywordIndex) {
                return this.keywordIndex.getSize(conversationId);
            }
            const store = await this.getStore("keyword_meta");
            if (!store) return 0;
            return new Promise((resolve) => {
                const request = store.get("keyword-meta");
                request.onsuccess = () => {
                    const value = request.result;
                    if (!value) {
                        resolve(0);
                        return;
                    }
                    if (!conversationId) {
                        resolve(Number(value.total) || 0);
                        return;
                    }
                    const perConv = Array.isArray(value.perConversation) ? new Map(value.perConversation) : new Map();
                    resolve(perConv.get(conversationId) || 0);
                };
                request.onerror = () => resolve(0);
            });
        }

        async putDocument(doc) {
            const store = await this.getStore("documents", "readwrite");
            if (!store) return;
            await new Promise((resolve, reject) => {
                const request = store.put(doc);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        }

        async putChunk(chunk) {
            const store = await this.getStore("chunks", "readwrite");
            if (!store) return;
            await new Promise((resolve, reject) => {
                const request = store.put(chunk);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        }

        async getDocuments(conversationId) {
            const convId = normalizeConversationId(conversationId);
            const store = await this.getStore("documents");
            if (!store) return [];
            const index = store.index("conversationId");
            return new Promise((resolve, reject) => {
                const request = index.getAll(convId);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async findDocumentByName(conversationId, name) {
            if (!name) return null;
            const docs = await this.getDocuments(conversationId);
            const target = name.toString().trim().toLowerCase();
            if (!target) return null;
            return docs.find((doc) => {
                return (doc?.name || "").toString().trim().toLowerCase() === target;
            }) || null;
        }

        async getChunks(conversationId) {
            const convId = normalizeConversationId(conversationId);
            const store = await this.getStore("chunks");
            if (!store) return [];
            const index = store.index("conversationId");
            return new Promise((resolve, reject) => {
                const request = index.getAll(convId);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async getDocumentById(docId) {
            if (!docId) return null;
            const store = await this.getStore("documents");
            if (!store) return null;
            return new Promise((resolve, reject) => {
                const request = store.get(docId);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        }

        async getAllChunks() {
            const store = await this.getStore("chunks");
            if (!store) return [];
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async getAllDocuments() {
            const store = await this.getStore("documents");
            if (!store) return [];
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async getChunksByDocId(docId) {
            if (!docId) return [];
            const store = await this.getStore("chunks");
            if (!store) return [];
            return new Promise((resolve, reject) => {
                const index = store.index("docId");
                const request = index.getAll(docId);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async deleteDocumentById(docId) {
            if (!docId) return;
            const store = await this.getStore("documents", "readwrite");
            if (!store) return;
            return new Promise((resolve, reject) => {
                const request = store.delete(docId);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        }

        async deleteChunksByDocId(docId) {
            if (!docId) return;
            await this.removeDocsFromKeywordIndex([docId]);
            return this.deleteByIndex("chunks", "docId", docId);
        }

        async deleteDocumentsByNames(conversationId, names) {
            if (!Array.isArray(names) || !names.length) return;
            const convId = normalizeConversationId(conversationId);
            const targetNames = new Set(names.filter(Boolean));
            if (!targetNames.size) return;
            const docs = await this.getDocuments(convId);
            const toDelete = docs.filter(doc => targetNames.has(doc.name));
            if (!toDelete.length) return;
            await this.removeDocsFromKeywordIndex(toDelete.map((doc) => doc.id));
            await Promise.all(toDelete.map(async doc => {
                await this.deleteChunksByDocId(doc.id);
                await this.deleteDocumentById(doc.id);
            }));
            await this.emitStats(convId);
        }

        async deleteDocumentsBySourceTypes(conversationId, sourceTypes) {
            if (!Array.isArray(sourceTypes) || !sourceTypes.length) return;
            const convId = normalizeConversationId(conversationId);
            await this.waitReady();
            const targetTypes = new Set(sourceTypes.filter(Boolean));
            if (!targetTypes.size) return;
            const docs = await this.getDocuments(convId);
            const toDelete = docs.filter(doc => {
                const sourceType = doc.sourceType || "context";
                return targetTypes.has(sourceType);
            });
            if (!toDelete.length) return;
            await this.removeDocsFromKeywordIndex(toDelete.map((doc) => doc.id));
            await Promise.all(toDelete.map(async doc => {
                await this.deleteChunksByDocId(doc.id);
                await this.deleteDocumentById(doc.id);
            }));
            await this.emitStats(convId);
        }

        async getDocumentsByMemoId(memoId) {
            if (!memoId) return [];
            const store = await this.getStore("documents");
            if (!store) return [];
            try {
                const index = store.index("memoId");
                return new Promise((resolve, reject) => {
                    const request = index.getAll(memoId);
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
            } catch (err) {
                const all = await this.getAllDocuments();
                return all.filter((doc) => doc?.memoId === memoId);
            }
        }

        async deleteDocumentsByMemoId(memoId) {
            if (!memoId) return;
            const docs = await this.getDocumentsByMemoId(memoId);
            if (!docs.length) return;
            await this.removeDocsFromKeywordIndex(docs.map((doc) => doc.id));
            await Promise.all(docs.map(async (doc) => {
                await this.deleteChunksByDocId(doc.id);
                await this.deleteDocumentById(doc.id);
            }));
        }

        async upsertMemoEmbedding(entry) {
            if (!entry) return;
            if (entry.memoId && entry.docId && !entry.id) {
                entry.id = `${entry.memoId}:${entry.docId}`;
            }
            if (!entry.id) return;
            if (typeof entry.enabled !== "boolean") {
                entry.enabled = true;
            }
            const store = await this.getStore("memo_context_embeddings", "readwrite");
            if (!store) return;
            await new Promise((resolve, reject) => {
                const request = store.put(entry);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        }

        async deleteMemoEmbeddingLink(memoId, docId) {
            if (!memoId || !docId) return;
            const store = await this.getStore("memo_context_embeddings", "readwrite");
            if (!store) return;
            const entries = await this.getMemoEmbeddings(memoId);
            const idMatch = `${memoId}:${docId}`;
            const targets = entries.filter((entry) => {
                if (entry?.docId === docId) return true;
                if (entry?.id === idMatch) return true;
                return typeof entry?.id === "string" && entry.id.endsWith(":" + docId);
            });
            await Promise.all(targets.map((entry) => {
                return new Promise((resolve, reject) => {
                    const request = store.delete(entry.id);
                    request.onsuccess = () => resolve(true);
                    request.onerror = () => reject(request.error);
                });
            }));
            const remaining = await this.getMemoEmbeddingsByDocId(docId);
            if (!remaining.length) {
                const doc = await this.getDocumentById(docId);
                if (doc) {
                    doc.deletedAt = Date.now();
                    await this.putDocument(doc);
                }
                await this.cleanupExpiredEmbeddings();
            }
        }

        async deleteMemoEmbeddingLinkAndCleanup(memoId, docId) {
            if (!memoId || !docId) return;
            const db = await this.ensureDb();
            if (!db) return;
            const idMatch = `${memoId}:${docId}`;
            await new Promise((resolve, reject) => {
                const tx = db.transaction(["memo_context_embeddings", "documents", "chunks"], "readwrite");
                const memoStore = tx.objectStore("memo_context_embeddings");
                const docStore = tx.objectStore("documents");
                const chunkStore = tx.objectStore("chunks");
                const memoIndex = memoStore.index("memoId");
                const docIndex = memoStore.index("docId");
                const chunkIndex = chunkStore.index("docId");

                const deleteMemoLinks = () => {
                    return new Promise((res, rej) => {
                        const request = memoIndex.openCursor(IDBKeyRange.only(memoId));
                        request.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (!cursor) {
                                res(true);
                                return;
                            }
                            const value = cursor.value;
                            const entryId = value?.id;
                            const matches = value?.docId === docId
                                || entryId === idMatch
                                || (typeof entryId === "string" && entryId.endsWith(":" + docId));
                            if (matches) {
                                cursor.delete();
                            }
                            cursor.continue();
                        };
                        request.onerror = () => rej(request.error);
                    });
                };

                const countRemaining = () => {
                    return new Promise((res, rej) => {
                        const request = docIndex.count(IDBKeyRange.only(docId));
                        request.onsuccess = () => res(request.result || 0);
                        request.onerror = () => rej(request.error);
                    });
                };

                const deleteChunks = () => {
                    return new Promise((res, rej) => {
                        const request = chunkIndex.openCursor(IDBKeyRange.only(docId));
                        request.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (!cursor) {
                                res(true);
                                return;
                            }
                            cursor.delete();
                            cursor.continue();
                        };
                        request.onerror = () => rej(request.error);
                    });
                };

                const run = async () => {
                    try {
                        await deleteMemoLinks();
                        const remaining = await countRemaining();
                        if (!remaining) {
                            docStore.delete(docId);
                            await deleteChunks();
                        }
                    } catch (err) {
                        try {
                            tx.abort();
                        } catch (abortErr) {
                            // ignore
                        }
                        reject(err);
                    }
                };

                run();
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
            });
        }

        async getMemoEmbeddings(memoId) {
            if (!memoId) return [];
            const store = await this.getStore("memo_context_embeddings");
            if (!store) return [];
            try {
                const index = store.index("memoId");
                return await new Promise((resolve, reject) => {
                    const request = index.getAll(memoId);
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
            } catch (err) {
                const all = await new Promise((resolve, reject) => {
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
                return all.filter((entry) => entry?.memoId === memoId);
            }
        }

        async migrateMemoEmbeddingsEnabled() {
            if (typeof localStorage === "undefined") return false;
            try {
                if (localStorage.getItem(MEMO_EMBEDDINGS_ENABLED_MIGRATION_KEY) === "1") {
                    return false;
                }
            } catch (err) {
                // ignore
            }
            const db = await this.ensureDb();
            if (!db) return false;
            return new Promise((resolve) => {
                const tx = db.transaction("memo_context_embeddings", "readwrite");
                const store = tx.objectStore("memo_context_embeddings");
                let updated = false;
                const request = store.getAll();
                request.onsuccess = () => {
                    const entries = request.result || [];
                    entries.forEach((entry) => {
                        if (entry && typeof entry.enabled !== "boolean") {
                            entry.enabled = true;
                            store.put(entry);
                            updated = true;
                        }
                    });
                };
                tx.oncomplete = () => {
                    try {
                        localStorage.setItem(MEMO_EMBEDDINGS_ENABLED_MIGRATION_KEY, "1");
                    } catch (err) {
                        // ignore
                    }
                    resolve(updated);
                };
                tx.onerror = () => resolve(false);
            });
        }

        async deleteMemoEmbeddingsByDocId(docId) {
            if (!docId) return;
            await this.deleteByIndex("memo_context_embeddings", "docId", docId);
        }

        async deleteMemoEmbeddingsByMemoId(memoId) {
            if (!memoId) return;
            await this.deleteByIndex("memo_context_embeddings", "memoId", memoId);
        }

        async deleteMemoEmbeddings(memoId) {
            if (!memoId) return;
            const entries = await this.getMemoEmbeddings(memoId);
            const docIds = Array.from(new Set(entries.map((entry) => entry?.docId).filter(Boolean)));
            await this.deleteMemoEmbeddingsByMemoId(memoId);
            for (const docId of docIds) {
                const remaining = await this.getMemoEmbeddingsByDocId(docId);
                if (remaining.length) continue;
                const doc = await this.getDocumentById(docId);
                if (!doc) continue;
                doc.deletedAt = Date.now();
                await this.putDocument(doc);
            }
            await this.cleanupExpiredEmbeddings();
        }

        async getMemoEmbeddingsByDocId(docId) {
            if (!docId) return [];
            const store = await this.getStore("memo_context_embeddings");
            if (!store) return [];
            try {
                const index = store.index("docId");
                return await new Promise((resolve, reject) => {
                    const request = index.getAll(docId);
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
            } catch (err) {
                const all = await new Promise((resolve, reject) => {
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
                return all.filter((entry) => entry?.docId === docId);
            }
        }

        async cleanupExpiredEmbeddings() {
            const retentionMs = this.getMemoEmbeddingRetentionMs();
            const cutoff = Date.now() - retentionMs;
            const docs = await this.getAllDocuments();
            const expired = (docs || []).filter((doc) => doc?.deletedAt && doc.deletedAt <= cutoff);
            if (!expired.length) return;
            for (const doc of expired) {
                const refs = await this.getMemoEmbeddingsByDocId(doc.id);
                if (refs.length) {
                    doc.deletedAt = null;
                    await this.putDocument(doc);
                    continue;
                }
                await this.deleteChunksByDocId(doc.id);
                await this.deleteDocumentById(doc.id);
            }
        }

        async deleteByIndex(storeName, indexName, value) {
            const db = await this.ensureDb();
            if (!db) return;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                const index = store.index(indexName);
                index.openCursor(value).onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) return;
                    cursor.delete();
                    cursor.continue();
                };
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        async clearConversation(conversationId) {
            const convId = normalizeConversationId(conversationId);
            await this.waitReady();
            await this.removeConversationFromKeywordIndex(convId);
            await this.deleteByIndex("documents", "conversationId", convId);
            await this.deleteByIndex("chunks", "conversationId", convId);
            await this.emitStats(convId);
        }

        async getStats(conversationId) {
            const convId = normalizeConversationId(conversationId);
            const docs = await this.getDocuments(convId);
            const docsParsed = docs.filter((doc) => doc.status === "ready").length;
            const chunkCount = docs.reduce((acc, doc) => acc + (doc.chunkCount || 0), 0);
            return {
                conversationId: convId,
                docsUploaded: docs.length,
                docsParsed,
                chunkCount
            };
        }

        async ingestFiles(files, conversationId, options = {}) {
            if (!files || !files.length) return [];
            const convId = normalizeConversationId(conversationId);
            try {
            } catch (err) {
                // ignore
            }
            await this.waitReady();
            const onProgress = options.onProgress;
            const sourceType = typeof options.sourceType === "string" && options.sourceType
                ? options.sourceType
                : "context";
            const memoId = typeof options.memoId === "string" && options.memoId.trim()
                ? options.memoId.trim()
                : null;
            const tabId = typeof options.tabId === "string" && options.tabId.trim()
                ? options.tabId.trim()
                : null;
            const skipEmbeddings = Boolean(options.skipEmbeddings);
            const suppressEmbeddingsToaster = Boolean(options.suppressEmbeddingsToaster);
            const results = [];
            const queue = Array.from(files);
            const allDocs = await this.getAllDocuments();
            const existingHashes = new Map();
            (allDocs || []).forEach((doc) => {
                const hash = (doc?.fileHash || "").toString();
                if (!hash) return;
                if (doc?.status !== "ready") return;
                if (doc?.deletedAt) return;
                if (!existingHashes.has(hash)) {
                    existingHashes.set(hash, doc);
                    return;
                }
                const current = existingHashes.get(hash);
                const currentTime = parseTimestamp(current?.updatedAt) || 0;
                const nextTime = parseTimestamp(doc?.updatedAt) || 0;
                if (nextTime > currentTime) {
                    existingHashes.set(hash, doc);
                }
            });
            const memoEmbeddings = memoId ? await this.getMemoEmbeddings(memoId) : [];
            const memoHashSet = new Set(
                (memoEmbeddings || [])
                    .map((entry) => (entry?.fileHash || "").toString())
                    .filter(Boolean)
            );
            const batchHashes = new Set();
            const metadataEntries = new Map();
            const rawMetadata = options.metadata;
            if (rawMetadata instanceof Map) {
                for (const [key, value] of rawMetadata.entries()) {
                    metadataEntries.set(key, value);
                }
            } else if (rawMetadata && typeof rawMetadata === "object") {
                Object.entries(rawMetadata).forEach(([key, value]) => metadataEntries.set(key, value));
            }
            for (let i = 0; i < queue.length; i++) {
                const file = queue[i];
                const docId = crypto.randomUUID();
                const meta = metadataEntries.get(file.name) || {};
                let hashInfo = null;
                try {
                    hashInfo = await this.computeFileHash(file);
                } catch (err) {
                    console.warn("Failed to hash file", file?.name, err);
                }
                const fileHash = hashInfo?.hash || "";
                const existingDoc = fileHash ? existingHashes.get(fileHash) : null;
                if (fileHash && existingDoc) {
                    if (memoId && memoHashSet.has(fileHash)) {
                        results.push({
                            docId: existingDoc?.id || null,
                            name: file.name,
                            success: false,
                            duplicate: true,
                            error: "duplicate"
                        });
                        onProgress?.({ type: "file-skip", file: file.name, reason: "duplicate" });
                        continue;
                    }
                    if (existingDoc.conversationId === convId) {
                        if (memoId) {
                            await this.upsertMemoEmbedding({
                                id: `${memoId}:${existingDoc.id}`,
                                memoId,
                                tabId: tabId || undefined,
                                docId: existingDoc.id,
                                fileHash: fileHash || "",
                                fileName: existingDoc.name || existingDoc.sourceFileName || file.name,
                                size: existingDoc.size,
                                importedAt: existingDoc.uploadedAt || Date.now(),
                                chunkCount: existingDoc.chunkCount || 0
                            });
                            memoHashSet.add(fileHash);
                            results.push({
                                docId: existingDoc.id,
                                name: file.name,
                                success: true,
                                reused: true,
                                duplicate: true,
                                chunkTotal: existingDoc.chunkCount || 0
                            });
                            onProgress?.({ type: "file-skip", file: file.name, reason: "reused" });
                            continue;
                        }
                        results.push({
                            docId: existingDoc.id,
                            name: file.name,
                            success: false,
                            duplicate: true,
                            error: "duplicate"
                        });
                        onProgress?.({ type: "file-skip", file: file.name, reason: "duplicate" });
                        continue;
                    }
                    onProgress?.({ type: "file-start", index: i + 1, total: queue.length, file: file.name });
                    const docId = crypto.randomUUID();
                    const baseEntry = {
                        id: docId,
                        conversationId: convId,
                        name: existingDoc.name || existingDoc.sourceFileName || file.name,
                        size: file.size,
                        mime: file.type || existingDoc.mime || "",
                        uploadedAt: Date.now(),
                        status: "ready",
                        chunkCount: existingDoc.chunkCount || 0,
                        sourceType,
                        abstract: existingDoc.abstract || "",
                        updatedAt: Date.now(),
                        scope: Array.isArray(existingDoc.scope) ? existingDoc.scope : [],
                        fileBuffer: existingDoc.fileBuffer || null,
                        sourceFileName: existingDoc.sourceFileName || file.name,
                        fileHash,
                        memoId: memoId || undefined,
                        tabId: tabId || undefined,
                        deletedAt: null,
                        parsedAt: Date.now(),
                        chunkSizeCategory: existingDoc.chunkSizeCategory,
                        chunkSize: existingDoc.chunkSize,
                        chunkOverlap: existingDoc.chunkOverlap,
                        rawText: existingDoc.rawText || "",
                        sourceDocId: existingDoc.id
                    };
                    await this.putDocument(baseEntry);
                    const existingChunks = await this.getChunksByDocId(existingDoc.id);
                    for (const existingChunk of existingChunks) {
                        const chunkEntry = {
                            id: crypto.randomUUID(),
                            conversationId: convId,
                            docId,
                            sourceDocId: existingDoc.id,
                            idx: existingChunk.idx,
                            text: existingChunk.text,
                            page: existingChunk.page,
                            path: existingChunk.path,
                            parentPath: existingChunk.parentPath,
                            rawChunk: existingChunk.rawChunk,
                            metadata: existingChunk.metadata,
                            emb: existingChunk.emb,
                            createdAt: Date.now(),
                            size: existingChunk.size,
                            sourceType
                        };
                        await this.putChunk(chunkEntry);
                        await this.addChunkToKeywordIndex(chunkEntry, baseEntry);
                    }
                    if (memoId) {
                        await this.upsertMemoEmbedding({
                            id: `${memoId}:${docId}`,
                            memoId,
                            tabId: tabId || undefined,
                            docId,
                            fileHash: fileHash || "",
                            fileName: baseEntry.name || baseEntry.sourceFileName || file.name,
                            size: file.size,
                            importedAt: Date.now(),
                            chunkCount: baseEntry.chunkCount || 0
                        });
                        memoHashSet.add(fileHash);
                    }
                    results.push({
                        docId,
                        name: file.name,
                        success: true,
                        reused: true,
                        duplicate: true,
                        chunkTotal: baseEntry.chunkCount || 0
                    });
                    onProgress?.({ type: "file-done", file: file.name });
                    continue;
                }
                if (fileHash && batchHashes.has(fileHash)) {
                    results.push({
                        docId: null,
                        name: file.name,
                        success: false,
                        duplicate: true,
                        error: "duplicate"
                    });
                    onProgress?.({ type: "file-skip", file: file.name, reason: "duplicate" });
                    continue;
                }
                if (fileHash) {
                    batchHashes.add(fileHash);
                }
                const friendlyName =
                    typeof meta.name === "string" && meta.name.trim()
                        ? meta.name.trim()
                        : file.name;
                const docAbstract = typeof meta.abstract === "string" ? meta.abstract : "";
                const docUpdatedAt = parseTimestamp(meta.updatedAt) || Date.now();
                const sourceFileName = typeof meta.fileName === "string" && meta.fileName.trim()
                    ? meta.fileName.trim()
                    : file.name;
                const docScopes = normalizeScopes(meta.scope);
                try {
                } catch (err) {
                    // ignore
                }
                const isPdf = (file.type || "").toLowerCase().includes("pdf")
                    || (file.name || "").toLowerCase().endsWith(".pdf");
                const shouldStoreBuffer = docScopes.includes("attachments") || isPdf;
                let attachmentBuffer = null;
                if (shouldStoreBuffer) {
                    try {
                        attachmentBuffer = hashInfo?.buffer || await file.arrayBuffer();
                    } catch (err) {
                        attachmentBuffer = null;
                        console.warn("Failed to read attachment data for storage", err);
                    }
                }
                const baseEntry = {
                    id: docId,
                    conversationId: convId,
                    name: friendlyName,
                    size: file.size,
                    mime: file.type || "",
                    uploadedAt: Date.now(),
                    status: "pending",
                    chunkCount: 0,
                    sourceType,
                    abstract: docAbstract,
                    updatedAt: docUpdatedAt,
                    scope: docScopes,
                    fileBuffer: attachmentBuffer,
                    sourceFileName,
                    fileHash,
                    memoId: memoId || undefined,
                    tabId: tabId || undefined,
                    deletedAt: null
                };
                await this.putDocument(baseEntry);
                onProgress?.({ type: "file-start", index: i + 1, total: queue.length, file: file.name });
                let extractionResult = null;
                let success = true;
                let errorMessage = "";
                try {
                    onProgress?.({ type: "extract", file: file.name, progress: 0 });
                    extractionResult = await this.extractText(file);
                    onProgress?.({ type: "extract", file: file.name, progress: 100 });
                } catch (err) {
                    success = false;
                    errorMessage = err?.message || "Erreur d'extraction";
                    baseEntry.status = "error";
                    baseEntry.error = errorMessage;
                    console.error(`Text extraction failed for ${file.name}:`, err);
                    await this.putDocument(baseEntry);
                    if (errorMessage === "OpenRouter : Réponse OCR invalide"
                        || errorMessage === "OpenRouter : Service OCR indisponible") {
                        emitDocumentsImportMessage(errorMessage, true);
                    }
                }
                if (!success) {
                    console.warn(`File ${file.name} marked as failed: ${errorMessage}`);
                    results.push({ docId, name: file.name, success: false, error: errorMessage });
                    continue;
                }
                if (extractionResult?.qualityMetrics) {
                    baseEntry.qualityMetrics = extractionResult.qualityMetrics;
                }
                const {
                    chunkList,
                    chunkConfig,
                    totalChars,
                    extractedText
                } = this.buildChunkList(file, extractionResult);
                const extractedCount = extractedText.length || totalChars;
                onProgress?.({
                    type: "chars",
                    file: file.name,
                    processedChars: 0,
                    totalChars
                });
                const chunkTotal = chunkList.length;
                const allTexts = chunkList.map((meta) => meta?.text || "");
                const wantsCloudEmbeddings = shouldUseCloudEmbeddingsForFile(file);
                const useCloudEmbeddings = wantsCloudEmbeddings && canUseOpenRouterEmbeddings();
                try {
                } catch (err) {
                    // ignore
                }
                if (wantsCloudEmbeddings && !useCloudEmbeddings) {
                    console.warn("Cloud embeddings unavailable, falling back to local embedder", file?.name);
                }
                if (skipEmbeddings) {
                    // Skip embeddings - store chunks without vector embeddings
                    onProgress?.({ type: "chunk", file: file.name, progress: 5 });
                    let processedChars = 0;
                    const zeroEmb = new Int8Array(384);
                    for (let c = 0; c < chunkTotal; c++) {
                        const chunkMeta = chunkList[c];
                        if (c % Math.ceil(chunkTotal / 20) === 0) {
                            const percent = Math.round((5 + (c / chunkTotal) * 95));
                            onProgress?.({ type: "chunk", file: file.name, progress: percent });
                        }
                        const chunkText = chunkMeta?.text || "";
                        processedChars += chunkText.length;
                        if (totalChars > 0 && (c % Math.ceil(chunkTotal / 20) === 0 || c === chunkTotal - 1)) {
                            onProgress?.({
                                type: "chars",
                                file: file.name,
                                processedChars,
                                totalChars
                            });
                        }
                        const chunkEntry = {
                            id: crypto.randomUUID(),
                            conversationId: convId,
                            docId,
                            idx: c,
                            text: chunkText,
                            page: Number.isFinite(chunkMeta?.pageNumber) ? chunkMeta.pageNumber : undefined,
                            path: chunkMeta?.path,
                            parentPath: chunkMeta?.parentPath,
                            rawChunk: chunkMeta?.rawChunk,
                            metadata: chunkMeta?.metadata,
                            emb: zeroEmb,
                            createdAt: Date.now(),
                            size: chunkConfig.category,
                            sourceType
                        };
                        await this.putChunk(chunkEntry);
                        await this.addChunkToKeywordIndex(chunkEntry, baseEntry);
                    }
                    onProgress?.({ type: "chunk", file: file.name, progress: 100 });
                } else {
                    // Normal embedding flow
                    onProgress?.({ type: "chunk", file: file.name, progress: 5 });
                    const startEmbedTime = performance.now();
                    let allEmbeddings;
                    if (useCloudEmbeddings) {
                        try {
                            allEmbeddings = await this.embedBatchCloud(allTexts, {
                                suppressToaster: suppressEmbeddingsToaster
                            });
                        } catch (cloudErr) {
                            console.warn("Cloud embeddings failed, fallback to local embedder", file?.name, cloudErr);
                            allEmbeddings = await this.embedBatch(allTexts);
                        }
                    } else {
                        allEmbeddings = await this.embedBatch(allTexts);
                    }
                    const embedDuration = performance.now() - startEmbedTime;
                    onProgress?.({ type: "chunk", file: file.name, progress: 50 });
                    const zeroEmb = new Int8Array(384);
                    let processedChars = 0;
                    for (let c = 0; c < chunkTotal; c++) {
                        const chunkMeta = chunkList[c];
                        if (c % Math.ceil(chunkTotal / 20) === 0) {
                            const percent = Math.round((50 + (c / chunkTotal) * 50));
                            onProgress?.({ type: "chunk", file: file.name, progress: percent });
                        }
                        const chunkText = chunkMeta?.text || "";
                        processedChars += chunkText.length;
                        if (totalChars > 0 && (c % Math.ceil(chunkTotal / 20) === 0 || c === chunkTotal - 1)) {
                            onProgress?.({
                                type: "chars",
                                file: file.name,
                                processedChars,
                                totalChars
                            });
                        }
                        let emb;
                        if (chunkText.trim().length < 20) {
                            emb = zeroEmb;
                        } else {
                            emb = allEmbeddings[c];
                            if (!emb || !emb.length) {
                                throw new Error(`Embedding failed for chunk ${c} (${file.name})`);
                            }
                        }
                        const chunkEntry = {
                            id: crypto.randomUUID(),
                            conversationId: convId,
                            docId,
                            idx: c,
                            text: chunkText,
                            page: Number.isFinite(chunkMeta?.pageNumber) ? chunkMeta.pageNumber : undefined,
                            path: chunkMeta?.path,
                            parentPath: chunkMeta?.parentPath,
                            rawChunk: chunkMeta?.rawChunk,
                            metadata: chunkMeta?.metadata,
                            emb: quantizeEmbedding(emb),
                            createdAt: Date.now(),
                            size: chunkConfig.category,
                            sourceType
                        };
                        await this.putChunk(chunkEntry);
                        await this.addChunkToKeywordIndex(chunkEntry, baseEntry);
                    }
                    onProgress?.({ type: "chunk", file: file.name, progress: 100 });
                }
                baseEntry.status = "ready";
                baseEntry.parsedAt = Date.now();
                baseEntry.chunkCount = chunkTotal;
                baseEntry.chunkSizeCategory = chunkConfig.category;
                baseEntry.chunkSize = chunkConfig.chunkSize;
                baseEntry.chunkOverlap = chunkConfig.chunkOverlap;
                baseEntry.rawText = extractedText;
                await this.putDocument(baseEntry);
                // Only add to memo context embeddings if embeddings were generated (not skipped)
                if (memoId && !skipEmbeddings) {
                    await this.upsertMemoEmbedding({
                        id: `${memoId}:${docId}`,
                        memoId,
                        tabId: tabId || undefined,
                        docId,
                        fileHash: fileHash || "",
                        fileName: friendlyName,
                        size: file.size,
                        importedAt: Date.now(),
                        chunkCount: chunkTotal
                    });
                }
                results.push({ docId, name: file.name, success: true, chunkTotal });
                onProgress?.({ type: "file-done", file: file.name });
            }
            try {
            } catch (err) {
                // ignore
            }
            await this.emitStats(convId);
            return results;
        }

        async extractText(file) {
            const ext = getExtension(file.name);
            if (ext === "docx" || ext === "pptx" || ext === "xlsx" || ext === "ods" || ext === "odt" || ext === "odf") {
                await this.ensureJsZip();
            }
            const mime = (file.type || "").toLowerCase();
            if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) {
                return await this.extractImageWithOcr(file, file.name);
            }
            if (file.type === "application/pdf" || ext === "pdf") {
                await this.ensurePdfJs();
                const pdfResult = await this.extractPdf(file);
                const pagesNeedingOcr = pdfResult?.pdfPages?.some((page) => {
                    return shouldOcrText(page?.text || "") || page?.hasImages;
                });
                if (pdfResult?.pdfPages && pdfResult.pdfPages.length && pagesNeedingOcr) {
                    const ocrResult = await this.extractPdfOcrText(pdfResult, file.name);
                    if (ocrResult?.text) {
                        return {
                            text: ocrResult.text,
                            pdfPages: pdfResult.pdfPages,
                            qualityMetrics: ocrResult.qualityMetrics
                        };
                    }
                }
                return pdfResult;
            }
            if (ext === "docx") {
                return { text: await this.extractDocx(file) };
            }
            if (ext === "pptx") {
                return { text: await this.extractPptx(file) };
            }
            if (ext === "xlsx" || ext === "ods") {
                return { text: await this.extractSpreadsheet(file) };
            }
            if (ext === "odt" || ext === "odf") {
                return { text: await this.extractOdf(file) };
            }
            if (ext === "json") {
                return this.extractJson(file);
            }
            if (ext === "vtt") {
                return { text: await file.text() };
            }
            if (ext === "csv" || ext === "tsv" || ext === "log" || ext === "jsonl" || ext === "ndjson") {
                return { text: await file.text() };
            }
            if (ext === "rtf" || ext === "doc") {
                return { text: await file.text() };
            }
            if (ext === "txt" || !ext) {
                return { text: await file.text() };
            }
            if (ACCEPTED_EXTENSIONS.has(ext)) {
                return { text: await file.text() };
            }
            return { text: await file.text() };
        }

        buildChunkList(file, extractionResult) {
            const extractedText = typeof extractionResult?.text === "string" ? extractionResult.text : "";
            const jsonChunks = Array.isArray(extractionResult?.jsonChunks) ? extractionResult.jsonChunks : null;
            const normalized = normalizeText(extractedText);
            let chunkConfig = this.getChunkConfigForText(extractedText || normalized);
            let chunkList = [];
            let totalChars = 0;
            const ext = getExtension(file.name);
            const isLogFile = ext === "log" || ext === "jsonl" || ext === "ndjson" || looksLikeLog(normalized);

            if (jsonChunks && jsonChunks.length) {
                chunkList = jsonChunks.map((chunk) => ({
                    text: chunk?.textForEmbedding || "",
                    rawChunk: chunk?.rawChunk,
                    path: chunk?.path || "$",
                    parentPath: chunk?.parentPath || null,
                    metadata: chunk?.metadata || null
                }));
                totalChars = chunkList.reduce((acc, chunk) => acc + (chunk.text || "").length, 0);
                chunkConfig = this.getChunkConfigForText(chunkList.map((chunk) => chunk.text).join("\n"));
                return { chunkList, chunkConfig, totalChars, extractedText, normalized };
            }

            if (ext === "csv" || ext === "tsv" || ext === "xlsx" || ext === "ods") {
                const rowChunks = chunkRows(normalized, { minRows: 20, maxRows: 200 });
                chunkList = rowChunks.map((chunk) => ({
                    text: chunk.text,
                    metadata: { ...(chunk.metadata || {}), chunkType: "table-rows" }
                }));
                totalChars = chunkList.reduce((acc, chunk) => acc + (chunk.text || "").length, 0);
                chunkConfig = this.getChunkConfigForText(chunkList.map((chunk) => chunk.text).join("\n"));
                return { chunkList, chunkConfig, totalChars, extractedText, normalized };
            }

            if (ext === "md" || ext === "docx" || ext === "pptx" || ext === "odt" || ext === "rtf" || ext === "doc") {
                const sections = chunkMarkdownSections(normalized);
                if (sections.length) {
                    sections.forEach((section) => {
                        const textBlocks = chunkByTokens(section.text, {
                            targetTokens: 600,
                            minTokens: 300,
                            maxTokens: 800
                        });
                        if (textBlocks.length) {
                            textBlocks.forEach((block) => {
                                chunkList.push({
                                    text: block,
                                    metadata: {
                                        chunkType: "section",
                                        headingPath: section.headingPath
                                    }
                                });
                            });
                        } else {
                            chunkList.push({
                                text: section.text,
                                metadata: {
                                    chunkType: "section",
                                    headingPath: section.headingPath
                                }
                            });
                        }
                    });
                } else {
                    const fallback = chunkByTokens(normalized, { targetTokens: 600, minTokens: 300, maxTokens: 800 });
                    chunkList = fallback.map((block) => ({ text: block, metadata: { chunkType: "section" } }));
                }
                totalChars = chunkList.reduce((acc, chunk) => acc + (chunk.text || "").length, 0);
                chunkConfig = this.getChunkConfigForText(chunkList.map((chunk) => chunk.text).join("\n"));
                return { chunkList, chunkConfig, totalChars, extractedText, normalized };
            }

            if (ext === "vtt") {
                const segments = parseVttSegments(extractedText);
                if (segments.length) {
                    chunkList = chunkVttSegments(segments);
                    totalChars = chunkList.reduce((acc, chunk) => acc + (chunk.text || "").length, 0);
                    chunkConfig = this.getChunkConfigForText(chunkList.map((chunk) => chunk.text).join("\n"));
                    return { chunkList, chunkConfig, totalChars, extractedText, normalized };
                }
                const fallback = chunkByTokens(normalized, { targetTokens: 600, minTokens: 300, maxTokens: 800 });
                chunkList = fallback.map((block) => ({ text: block, metadata: { chunkType: "vtt" } }));
                totalChars = chunkList.reduce((acc, chunk) => acc + (chunk.text || "").length, 0);
                chunkConfig = this.getChunkConfigForText(chunkList.map((chunk) => chunk.text).join("\n"));
                return { chunkList, chunkConfig, totalChars, extractedText, normalized };
            }

            if (isLogFile) {
                const eventChunks = chunkLogEvents(normalized, { batchSize: 80 });
                chunkList = eventChunks.map((block) => ({
                    text: block.text,
                    metadata: { chunkType: "events", ...(block.metadata || {}) }
                }));
                totalChars = chunkList.reduce((acc, chunk) => acc + (chunk.text || "").length, 0);
                chunkConfig = this.getChunkConfigForText(chunkList.map((chunk) => chunk.text).join("\n"));
                return { chunkList, chunkConfig, totalChars, extractedText, normalized };
            }

            const pageSegments = Array.isArray(extractionResult?.pdfPages) ? extractionResult.pdfPages : null;
            const segments = [];
            if (pageSegments && pageSegments.length) {
                pageSegments.forEach((pageEntry, pageIndex) => {
                    const pageText = normalizeText(pageEntry?.text || "");
                    if (!pageText) return;
                    const pageNumber = Number.isFinite(pageEntry.pageNumber)
                        ? pageEntry.pageNumber
                        : (pageIndex + 1);
                    segments.push({ text: pageText, pageNumber });
                });
            }
            if (!segments.length) {
                segments.push({ text: normalized, pageNumber: null });
            }
            totalChars = segments.reduce((acc, segment) => acc + (segment.text || "").length, 0);
            segments.forEach((segment) => {
                const paragraphChunks = chunkParagraphs(segment.text, { maxChars: 2400 });
                if (paragraphChunks.length) {
                    paragraphChunks.forEach((chunkText) => {
                        chunkList.push({
                            text: chunkText,
                            pageNumber: segment.pageNumber,
                            metadata: { chunkType: "pdf-paragraph" }
                        });
                    });
                    return;
                }
                const segmentChunks = chunkText(segment.text, chunkConfig.chunkSize, chunkConfig.chunkOverlap);
                const sourceChunks = segmentChunks.length ? segmentChunks : [""];
                sourceChunks.forEach((chunkText) => {
                    chunkList.push({ text: chunkText, pageNumber: segment.pageNumber });
                });
            });

            return { chunkList, chunkConfig, totalChars, extractedText, normalized };
        }

        async extractJson(file) {
            const raw = await file.text();
            if (!raw || !raw.trim()) {
                return { text: "" };
            }
            try {
                const data = JSON.parse(raw);
                const jsonChunks = buildJsonChunks(data, {
                    maxChunkChars: 6500,
                    maxStringChunkChars: 5000,
                    maxTotalChars: 1400,
                    maxStringChars: 600
                });
                return { text: "", jsonChunks };
            } catch (err) {
                console.warn("JSON parse failed, falling back to raw text", err);
                return { text: raw };
            }
        }

        async extractPdf(file) {
            await this.ensurePdfJs();
            if (!this.pdfjs) return { text: "" };
            const buffer = await file.arrayBuffer();
            // Keep a copy for OCR; pdfjs may transfer/detach the original buffer.
            const pdfBuffer = buffer.slice(0);
            const pdf = await this.pdfjs.getDocument({ data: buffer }).promise;
            let full = "";
            const pages = [];
            for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
                const page = await pdf.getPage(pageIndex);
                const content = await page.getTextContent();
                const tokens = (content.items || [])
                    .map((item) => (item.str || ""))
                    .filter(Boolean);
                const pageText = tokens.join(" ") + "\n\n";

                let hasImages = false;
                try {
                    const ops = await page.getOperatorList();
                    for (let i = 0; i < ops.fnArray.length; i++) {
                        const fn = ops.fnArray[i];
                        if (fn === global.pdfjsLib?.OPS?.paintImageXObject ||
                            fn === global.pdfjsLib?.OPS?.paintInlineImage ||
                            fn === 85 || fn === 82) {
                            hasImages = true;
                            break;
                        }
                    }
                } catch (e) {
                    // ignore
                }

                pages.push({ pageNumber: pageIndex, text: pageText, hasImages });
                full += pageText;
            }
            return { text: full, pdfPages: pages, pdfBuffer };
        }

        async extractImageWithOcr(file, fileName = "", options = null) {
            if (!file) return { text: "" };
            const opts = options && typeof options === "object" ? options : {};
            const skipOfflineOcr = Boolean(opts.skipOfflineOcr);
            const suppressErrors = Boolean(opts.suppressErrors);
            let canvas = null;
            let quality = null;
            let tesseractText = "";
            const offlineDisabled = isOfflineOcrDisabled() || skipOfflineOcr;
            try {
                canvas = await fileToCanvas(file);
                quality = analyzeCanvasQuality(canvas);
                if (!offlineDisabled) {
                    const worker = await getOcrWorker();
                    const target = canvas || file;
                    const result = await worker.recognize(target);
                    tesseractText = (result?.data?.text || "").trim();
                }
            } catch (err) {
                tesseractText = "";
            }

            if (!offlineDisabled && tesseractText.length >= 20 && isLikelyEnFrText(tesseractText)) {
                return {
                    text: tesseractText,
                    qualityMetrics: { type: "image", ...(quality || {}) }
                };
            }

            if (canUseQwenFallback()) {
                try {
                    const results = await extractWithVisionModel([canvas || file]);
                    const visionText = (results && results[0] ? results[0] : "").trim();
                    if (visionText && isReadableOcrText(visionText)) {
                        return {
                            text: visionText,
                            qualityMetrics: { type: "image", ...(quality || {}) }
                        };
                    }
                    if (visionText && !isReadableOcrText(visionText)) {
                        emitDocumentsImportMessage("OCR : texte illisible", true);
                    }
                } catch (err) {
                    // fall through
                }
            }

            if (!offlineDisabled && tesseractText) {
                return {
                    text: tesseractText,
                    qualityMetrics: { type: "image", ...(quality || {}) }
                };
            }

            if (suppressErrors) {
                return {
                    text: "",
                    qualityMetrics: { type: "image", ...(quality || {}) }
                };
            }

            emitDocumentsImportMessage("OpenRouter : Service OCR indisponible", true);
            throw new Error("OpenRouter : Service OCR indisponible");
        }

        async extractPdfOcrText(pdfResult, fileName = "") {
            await this.ensurePdfJs();
            if (!this.pdfjs || !pdfResult?.pdfBuffer) return "";
            const pdf = await this.pdfjs.getDocument({ data: pdfResult.pdfBuffer }).promise;
            const offlineDisabled = isOfflineOcrDisabled();
            let worker = null;
            if (!offlineDisabled) {
                try {
                    worker = await getOcrWorker();
                } catch (err) {
                    const label = fileName ? ` (${fileName})` : "";
                    throw new Error(`OCR échoué${label}`);
                }
            }
            const pages = pdfResult.pdfPages || [];
            const output = [];
            const metrics = [];
            const fallbackImages = [];
            const fallbackIndexMap = new Map();
            for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
                const page = await pdf.getPage(pageIndex);
                const pageInfo = pages[pageIndex - 1];
                const pageText = pageInfo?.text || "";
                const needsOcr = shouldOcrText(pageText) || pageInfo?.hasImages;

                if (!offlineDisabled && !needsOcr) {
                    output.push(pageText.trim());
                    continue;
                }
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", { willReadFrequently: true });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                try {
                    await page.render({ canvasContext: context, viewport }).promise;
                    let quality = analyzeCanvasQuality(canvas);
                    metrics.push({
                        pageNumber: pageIndex,
                        ...(quality || {})
                    });
                    let ocrText = "";
                    if (!offlineDisabled && worker) {
                        try {
                            const ocr = await worker.recognize(canvas);
                            ocrText = (ocr?.data?.text || "").trim();
                        } catch (err) {
                            ocrText = "";
                        }
                    }
                    if (ocrText && pageText.trim() && !shouldOcrText(pageText)) {
                        output.push(pageText.trim() + "\n\n" + ocrText);
                    } else {
                        output.push(ocrText || pageText.trim());
                    }

                    if (offlineDisabled || (ocrText.length < 20 && shouldOcrText(pageText)) || (ocrText.length < 5 && pageInfo?.hasImages)) {
                        fallbackIndexMap.set(fallbackImages.length, pageIndex - 1);
                        fallbackImages.push(canvas);
                    }
                } catch (err) {
                    const label = fileName ? ` (${fileName})` : "";
                    throw new Error(`OCR échoué${label}`);
                }
            }
            if (fallbackImages.length && canUseQwenFallback()) {
                const batchSize = 5;
                for (let i = 0; i < fallbackImages.length; i += batchSize) {
                    const batch = fallbackImages.slice(i, i + batchSize);
                    try {
                        const results = await extractWithVisionModel(batch);
                        results.forEach(function (text, idx) {
                            const fallbackIndex = i + idx;
                            const outputIndex = fallbackIndexMap.get(fallbackIndex);
                            if (typeof outputIndex !== "number") return;
                            const cleaned = (text || "").trim();
                            if (cleaned && isReadableOcrText(cleaned)) {
                                output[outputIndex] = cleaned;
                            } else if (cleaned) {
                                output[outputIndex] = "";
                            }
                        });
                    } catch (err) {
                        // ignore, use Tesseract output if any
                    }
                }
            }
            if (fallbackImages.length) {
                const hasEmpty = output.some(function (value) {
                    return !value || !value.trim();
                });
                if (hasEmpty) {
                    emitDocumentsImportMessage("OCR : texte illisible", true);
                    throw new Error("OpenRouter : Réponse OCR invalide");
                }
            }
            const combined = output.filter(Boolean).join("\n\n");
            if (combined && !isReadableOcrText(combined)) {
                emitDocumentsImportMessage("OCR : texte illisible", true);
                throw new Error("OpenRouter : Réponse OCR invalide");
            }
            return {
                text: combined,
                qualityMetrics: { type: "pdf", pages: metrics }
            };
        }

        async extractPdfCloudTextWithProgress(file, onPageText) {
            await this.ensurePdfJs();
            if (!file || !this.pdfjs) {
                throw new Error("PDF indisponible");
            }
            if (!canUseQwenFallback()) {
                emitDocumentsImportMessage("OpenRouter : Service OCR indisponible", true);
                throw new Error("OpenRouter : Service OCR indisponible");
            }
            const buffer = await file.arrayBuffer();
            const pdf = await this.pdfjs.getDocument({ data: buffer }).promise;
            const results = [];
            const batch = [];
            const batchPages = [];
            const flushBatch = async () => {
                if (!batch.length) return;
                const texts = await extractWithVisionModel(batch);
                texts.forEach((text, idx) => {
                    const pageNumber = batchPages[idx];
                    const clean = (text || "").trim();
                    results[pageNumber - 1] = clean;
                    if (typeof onPageText === "function") {
                        onPageText(pageNumber, clean);
                    }
                });
                batch.length = 0;
                batchPages.length = 0;
            };
            for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
                const page = await pdf.getPage(pageIndex);
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", { willReadFrequently: true });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport }).promise;
                batch.push(canvas);
                batchPages.push(pageIndex);
                if (batch.length >= 5) {
                    await flushBatch();
                }
            }
            await flushBatch();
            return results.filter(Boolean).join("\n\n");
        }

        async extractDocx(file) {
            await this.ensureJsZip();
            if (!this.jszip) throw new Error("JSZip n'est pas chargé - impossible d'extraire le DOCX");
            const buffer = await file.arrayBuffer();

            let zip;
            try {
                // Try direct loadAsync first
                if (typeof this.jszip.loadAsync === "function") {
                    zip = await this.jszip.loadAsync(buffer);
                } else if (typeof this.jszip.default?.loadAsync === "function") {
                    // Fallback for wrapped export
                    zip = await this.jszip.default.loadAsync(buffer);
                } else if (typeof this.jszip === "function") {
                    // Constructor API
                    zip = new this.jszip();
                    await zip.loadAsync(buffer);
                } else {
                    console.error("JSZip object:", this.jszip);
                    throw new Error("JSZip n'a pas l'API attendue - type: " + typeof this.jszip);
                }
            } catch (err) {
                console.error("JSZip loading error:", err);
                throw err;
            }

            const entry = zip.file("word/document.xml");
            if (!entry) {
                console.error("word/document.xml not found in DOCX");
                throw new Error("Fichier DOCX invalide: word/document.xml non trouvé");
            }
            const raw = await entry.async("string");
            const relsEntry = zip.file("word/_rels/document.xml.rels");
            const relsRaw = relsEntry ? await relsEntry.async("string") : "";
            const relsMap = parseRelationships(relsRaw);
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(raw, "application/xml");
                const body = doc.getElementsByTagName("w:body")[0] || doc.documentElement;
                const pieces = [];
                const appendText = (value) => {
                    if (!value) return;
                    pieces.push(value);
                };
                const handleImage = async (embedId) => {
                    if (!embedId || !relsMap[embedId]) return;
                    const target = resolveZipTarget("word/", relsMap[embedId]);
                    const imageEntry = zip.file(target);
                    if (!imageEntry) return;
                    try {
                        const blob = await imageEntry.async("blob");
                        const ocr = await this.extractImageWithOcr(blob, target, {
                            skipOfflineOcr: true,
                            suppressErrors: true
                        });
                        appendText(ocr?.text || "");
                    } catch (err) {
                        // ignore OCR failures here; ingest flow handles toasts
                    }
                };
                const walk = async (node) => {
                    if (!node) return;
                    if (node.nodeType === 1) {
                        const local = node.localName || "";
                        const ns = node.namespaceURI || "";
                        if (local === "p") {
                            for (const child of Array.from(node.childNodes || [])) {
                                await walk(child);
                            }
                            appendText("\n\n");
                            return;
                        }
                        if (local === "t" && /wordprocessingml/i.test(ns)) {
                            appendText(node.textContent || "");
                        } else if ((local === "tab" || local === "br" || local === "cr") && /wordprocessingml/i.test(ns)) {
                            appendText("\n");
                        } else if (local === "blip") {
                            const embedId =
                                node.getAttribute("r:embed") ||
                                node.getAttribute("embed") ||
                                node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
                            if (embedId) {
                                await handleImage(embedId);
                            }
                        }
                    }
                    for (const child of Array.from(node.childNodes || [])) {
                        await walk(child);
                    }
                };
                await walk(body);
                return pieces.join("") || "";
            } catch (err) {
                const text = extractTextFromXml(raw);
                return text || "";
            }
        }

        async extractPptx(file) {
            await this.ensureJsZip();
            if (!this.jszip) throw new Error("JSZip n'est pas chargé - impossible d'extraire le PPTX");
            const buffer = await file.arrayBuffer();
            let zip;
            if (typeof this.jszip.loadAsync === "function") {
                zip = await this.jszip.loadAsync(buffer);
            } else if (typeof this.jszip.default?.loadAsync === "function") {
                zip = await this.jszip.default.loadAsync(buffer);
            } else if (typeof this.jszip === "function") {
                zip = new this.jszip();
                await zip.loadAsync(buffer);
            } else {
                throw new Error("JSZip n'a pas l'API attendue");
            }
            const slideNames = Object.keys(zip.files).filter((name) =>
                name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
            );
            if (!slideNames.length) {
                throw new Error("Fichier PPTX invalide: aucune diapositive trouvée");
            }
            slideNames.sort((a, b) => {
                const aNum = parseInt((a.match(/slide(\d+)\.xml$/) || [])[1] || "0", 10);
                const bNum = parseInt((b.match(/slide(\d+)\.xml$/) || [])[1] || "0", 10);
                return aNum - bNum;
            });
            const texts = [];
            for (const name of slideNames) {
                const entry = zip.file(name);
                if (!entry) continue;
                const raw = await entry.async("string");
                const relsName = "ppt/slides/_rels/" + name.split("/").pop() + ".rels";
                const relsEntry = zip.file(relsName);
                const relsRaw = relsEntry ? await relsEntry.async("string") : "";
                const relsMap = parseRelationships(relsRaw);
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(raw, "application/xml");
                    const root = doc.documentElement;
                    const pieces = [];
                    const appendText = (value) => {
                        if (!value) return;
                        pieces.push(value);
                    };
                    const handleImage = async (embedId) => {
                        if (!embedId || !relsMap[embedId]) return;
                        const target = resolveZipTarget("ppt/", relsMap[embedId]);
                        const imageEntry = zip.file(target);
                        if (!imageEntry) return;
                        try {
                            const blob = await imageEntry.async("blob");
                            const ocr = await this.extractImageWithOcr(blob, target, {
                                skipOfflineOcr: true,
                                suppressErrors: true
                            });
                            appendText(ocr?.text || "");
                        } catch (err) {
                            // ignore OCR failures here; ingest flow handles toasts
                        }
                    };
                    const walk = async (node) => {
                        if (!node) return;
                        if (node.nodeType === 1) {
                            const local = node.localName || "";
                            const ns = node.namespaceURI || "";
                            if (local === "p" && /drawingml/i.test(ns)) {
                                for (const child of Array.from(node.childNodes || [])) {
                                    await walk(child);
                                }
                                appendText("\n");
                                return;
                            }
                            if (local === "t" && /drawingml/i.test(ns)) {
                                appendText(node.textContent || "");
                            } else if (local === "br" && /drawingml/i.test(ns)) {
                                appendText("\n");
                            } else if (local === "blip") {
                                const embedId =
                                    node.getAttribute("r:embed") ||
                                    node.getAttribute("embed") ||
                                    node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
                                if (embedId) {
                                    await handleImage(embedId);
                                }
                            }
                        }
                        for (const child of Array.from(node.childNodes || [])) {
                            await walk(child);
                        }
                    };
                    await walk(root);
                    texts.push(pieces.join(""));
                } catch (err) {
                    texts.push(extractTextFromXml(raw));
                }
            }
            return texts.join("\n\n") || "";
        }

        async extractSpreadsheet(file) {
            await this.ensureJsZip();
            if (!this.jszip) throw new Error("JSZip n'est pas chargé - impossible d'extraire le tableur");
            const buffer = await file.arrayBuffer();
            let zip;
            if (typeof this.jszip.loadAsync === "function") {
                zip = await this.jszip.loadAsync(buffer);
            } else if (typeof this.jszip.default?.loadAsync === "function") {
                zip = await this.jszip.default.loadAsync(buffer);
            } else if (typeof this.jszip === "function") {
                zip = new this.jszip();
                await zip.loadAsync(buffer);
            } else {
                throw new Error("JSZip n'a pas l'API attendue");
            }
            const pieces = [];
            const shared = zip.file("xl/sharedStrings.xml");
            if (shared) {
                const raw = await shared.async("string");
                pieces.push(extractTextFromXml(raw));
            }
            const worksheetNames = Object.keys(zip.files).filter((name) =>
                name.startsWith("xl/worksheets/") && name.endsWith(".xml")
            );
            for (const name of worksheetNames) {
                const entry = zip.file(name);
                if (!entry) continue;
                const raw = await entry.async("string");
                pieces.push(extractTextFromXml(raw));
            }
            return pieces.join("\n\n");
        }

        async extractOdf(file) {
            await this.ensureJsZip();
            if (!this.jszip) throw new Error("JSZip n'est pas chargé - impossible d'extraire le fichier ODF");
            const buffer = await file.arrayBuffer();
            let zip;
            if (typeof this.jszip.loadAsync === "function") {
                zip = await this.jszip.loadAsync(buffer);
            } else if (typeof this.jszip.default?.loadAsync === "function") {
                zip = await this.jszip.default.loadAsync(buffer);
            } else if (typeof this.jszip === "function") {
                zip = new this.jszip();
                await zip.loadAsync(buffer);
            } else {
                throw new Error("JSZip n'a pas l'API attendue");
            }
            const entry = zip.file("content.xml");
            if (!entry) {
                throw new Error("Fichier ODF invalide: content.xml non trouvé");
            }
            const raw = await entry.async("string");
            return extractTextFromXml(raw) || "";
        }

        buildChunkResult(chunk, docMap, score) {
            const docMeta = docMap.get(chunk.docId);
            return {
                ...chunk,
                score,
                docName: docMeta?.name || "Document",
                fileName: docMeta?.sourceFileName || docMeta?.name || "Document",
                sourceType: docMeta?.sourceType || "context",
                docScopes: Array.isArray(docMeta?.scope) ? docMeta.scope : [],
                docAbstract: docMeta?.abstract || "",
                text: chunk.text
            };
        }

        async vectorSearch(query, conversationId, options = {}) {
            if (!query) return [];
            const convId = normalizeConversationId(conversationId);
            await this.waitReady();
            const needsVector = !options.vector;
            if (needsVector) {
                const queryChars = (query || "").length;
                const searchDuration = clampDuration(8000 + queryChars * 30, 8000, 20000);
                setAiRequestToasterVisible("aiRequestCounterToasterSearch", "search", "Recherche", true, { durationMs: searchDuration });
            }
            let vector;
            try {
                vector = options.vector || await this.embed(query);
            } finally {
                if (needsVector) {
                    setAiRequestToasterVisible("aiRequestCounterToasterSearch", "search", "Recherche", false);
                }
            }
            const queryVector = quantizeEmbedding(vector);
            const candidateIds = Array.isArray(options.candidateIds)
                ? new Set(options.candidateIds.filter(Boolean))
                : null;
            const minScore = options.minScore ?? DEFAULT_RETRIEVAL_MIN_SCORE;
            const topK = options.topK ?? DEFAULT_RETRIEVAL_TOP_K;
            const chunks = Array.isArray(options.chunks) ? options.chunks : await this.getChunks(convId);
            const docs = Array.isArray(options.docs) ? options.docs : await this.getDocuments(convId);
            const docMap = new Map();
            docs.forEach((doc) => docMap.set(doc.id, doc));
            const scored = [];
            for (const chunk of chunks) {
                if (candidateIds && !candidateIds.has(chunk.id)) continue;
                if (!docMap.has(chunk.docId)) continue;
                const target = quantizeEmbedding(chunk.emb);
                const similarity = cosineSimInt8(queryVector, target);
                if (similarity < minScore) continue;
                scored.push(this.buildChunkResult(chunk, docMap, similarity));
            }
            scored.sort((a, b) => b.score - a.score);
            const out = scored.slice(0, topK);
            try {
            } catch (err) {
                // ignore
            }
            return out;
        }

        async searchKeywordCandidates(query, conversationId, limit, options = {}) {
            if (!query || !this.keywordIndex) return null;
            const cappedLimit = typeof limit === "number" ? limit : 200;
            try {
                await this.waitReady();
                await this.ensureKeywordIndexReady();
                const convId = normalizeConversationId(conversationId);
                const results = this.keywordIndex.search(query, convId, cappedLimit);
                try {
                } catch (err) {
                    // ignore
                }
                return results;
            } catch (err) {
                console.warn("Keyword search failed", err);
                return null;
            }
        }

        async retrieve(query, conversationId, options = {}) {
            return this.vectorSearch(query, conversationId, options);
        }
    }

    const documents = global.GoToolkitDocumentManager || new DocumentManager();
    global.GoToolkitDocumentManager = documents;
})(typeof window !== "undefined" ? window : this);
