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
    const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/+esm";
    const PDFJS_WORKER = "js/pdf.worker.min.mjs";
    const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
    const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

    const ACCEPTED_EXTENSIONS = new Set([
        "pdf",
        "docx",
        "pptx",
        "xlsx",
        "txt",
        "md",
        "rtf",
        "doc",
        "odf",
        "odt",
        "ods"
    ]);

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

    function cosineSim(a, b) {
        let dot = 0;
        let na = 0;
        let nb = 0;
        for (let i = 0; i < a.length; i++) {
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

    function extractTextFromXml(xmlContent) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlContent, "application/xml");
            return doc?.documentElement?.textContent || "";
        } catch (err) {
            return xmlContent.replace(/<[^>]+>/g, " ");
        }
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
            this.keywordIndex = global.GoToolkitKeywordIndex || null;
            this.readyPromise = this.initialize();
        }

        async initialize() {
            try {
                const [transformers, pdfModule, jsZipModule] = await Promise.all([
                    import(TRANSFORMERS_URL),
                    import(PDFJS_URL),
                    import(JSZIP_URL)
                ]);
                this.pipelineFactory = transformers.pipeline;
                this.env = transformers.env;
                if (this.env) {
                    this.env.allowLocalModels = false;
                    this.env.useBrowserCache = true;
                }
                this.pdfjs = pdfModule?.default || pdfModule;
                if (this.pdfjs?.GlobalWorkerOptions) {
                    this.pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                }
                // JSZip from ESM CDN should have loadAsync directly
                this.jszip = jsZipModule;
                console.log("JSZip loaded, type:", typeof this.jszip, "has loadAsync:", typeof this.jszip?.loadAsync);
                if (!this.jszip?.loadAsync) {
                    console.warn("JSZip.loadAsync not found, checking .default...", typeof this.jszip?.default?.loadAsync);
                }
                await this.loadSettings();
                await this.ensureDb();
                await this.ensureEmbedder();
                if (this.keywordIndex) {
                    await this.rebuildKeywordIndex();
                }
                this.emitSettings();
            } catch (err) {
                console.error("Documents manager initialisation failed", err);
                throw err;
            }
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
                const request = indexedDB.open("gotoolkit-documents", 2);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains("documents")) {
                        const docs = db.createObjectStore("documents", { keyPath: "id" });
                        docs.createIndex("conversationId", "conversationId", { unique: false });
                    }
                    if (!db.objectStoreNames.contains("chunks")) {
                        const chunks = db.createObjectStore("chunks", { keyPath: "id" });
                        chunks.createIndex("conversationId", "conversationId", { unique: false });
                        chunks.createIndex("docId", "docId", { unique: false });
                    }
                    if (!db.objectStoreNames.contains("keyword_meta")) {
                        db.createObjectStore("keyword_meta", { keyPath: "id" });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error("IndexedDB ouverture échouée"));
            });
            return this.dbPromise;
        }

        async getStore(storeName, mode = "readonly") {
            const db = await this.ensureDb();
            if (!db) return null;
            return db.transaction(storeName, mode).objectStore(storeName);
        }

        async ensureEmbedder() {
            const modelId = this.settings.embedModelId || DEFAULT_SETTINGS.embedModelId;
            if (this.embedder && this.embedModelId === modelId) return;
            if (!this.pipelineFactory) return;
            this.embedder = await this.pipelineFactory("feature-extraction", modelId, { quantized: true });
            this.embedModelId = modelId;
        }

        async embed(text) {
            await this.waitReady();
            await this.ensureEmbedder();
            if (!this.embedder) throw new Error("Embedder indisponible");
            const output = await this.embedder(text, { pooling: "mean", normalize: true });
            return output.data;
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
            if (!this.keywordIndex || !chunk) return;
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
            await this.waitReady();
            const onProgress = options.onProgress;
            const sourceType = typeof options.sourceType === "string" && options.sourceType
                ? options.sourceType
                : "context";
            const results = [];
            const queue = Array.from(files);
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
                const isPdf = (file.type || "").toLowerCase().includes("pdf")
                    || (file.name || "").toLowerCase().endsWith(".pdf");
                const shouldStoreBuffer = docScopes.includes("attachments") || isPdf;
                let attachmentBuffer = null;
                if (shouldStoreBuffer) {
                    try {
                        attachmentBuffer = await file.arrayBuffer();
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
                    sourceFileName
                };
                await this.putDocument(baseEntry);
                onProgress?.({ type: "file-start", index: i + 1, total: queue.length, file: file.name });
                let extractionResult = null;
                let success = true;
                let errorMessage = "";
                try {
                    extractionResult = await this.extractText(file);
                } catch (err) {
                    success = false;
                    errorMessage = err?.message || "Erreur d'extraction";
                    baseEntry.status = "error";
                    baseEntry.error = errorMessage;
                    console.error(`Text extraction failed for ${file.name}:`, err);
                    await this.putDocument(baseEntry);
                }
                if (!success) {
                    console.warn(`File ${file.name} marked as failed: ${errorMessage}`);
                    results.push({ docId, name: file.name, success: false, error: errorMessage });
                    continue;
                }
                const extractedText = typeof extractionResult?.text === "string" ? extractionResult.text : "";
                console.log(`Successfully extracted ${extractedText.length} characters from ${file.name}`);
                const normalized = normalizeText(extractedText);
                const chunkConfig = this.getChunkConfigForText(extractedText || normalized);
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
                const chunkList = [];
                segments.forEach((segment) => {
                    const segmentChunks = chunkText(segment.text, chunkConfig.chunkSize, chunkConfig.chunkOverlap);
                    const sourceChunks = segmentChunks.length ? segmentChunks : [""];
                    sourceChunks.forEach((chunkText) => {
                        chunkList.push({ text: chunkText, pageNumber: segment.pageNumber });
                    });
                });
                const chunkTotal = chunkList.length;
                let lastProgress = 0;
                for (let c = 0; c < chunkTotal; c++) {
                    const chunkMeta = chunkList[c];
                    const percent = Math.round(((c + 1) / chunkTotal) * 100);
                    if (percent !== lastProgress) {
                        onProgress?.({ type: "chunk", file: file.name, progress: percent });
                        lastProgress = percent;
                    }
                    const chunkText = chunkMeta?.text || "";
                    const emb = await this.embed(chunkText);
                    const chunkEntry = {
                        id: crypto.randomUUID(),
                        conversationId: convId,
                        docId,
                        idx: c,
                        text: chunkText,
                        page: Number.isFinite(chunkMeta?.pageNumber) ? chunkMeta.pageNumber : undefined,
                        emb: Array.from(emb),
                        createdAt: Date.now(),
                        size: chunkConfig.category,
                        sourceType
                    };
                    await this.putChunk(chunkEntry);
                    await this.addChunkToKeywordIndex(chunkEntry, baseEntry);
                }
                baseEntry.status = "ready";
                baseEntry.parsedAt = Date.now();
                baseEntry.chunkCount = chunkTotal;
                baseEntry.chunkSizeCategory = chunkConfig.category;
                baseEntry.chunkSize = chunkConfig.chunkSize;
                baseEntry.chunkOverlap = chunkConfig.chunkOverlap;
                baseEntry.rawText = extractedText;
                await this.putDocument(baseEntry);
                results.push({ docId, name: file.name, success: true, chunkTotal });
                onProgress?.({ type: "file-done", file: file.name });
            }
            await this.emitStats(convId);
            return results;
        }

        async extractText(file) {
            const ext = getExtension(file.name);
            console.log("extractText called for:", file.name, "extension:", ext, "type:", file.type);
            // Ensure jszip is loaded for format-specific operations
            if ((ext === "docx" || ext === "pptx" || ext === "xlsx" || ext === "ods") && !this.jszip) {
                throw new Error("Modules de traitement de fichiers non chargés - veuillez attendre et réessayer");
            }
            if (file.type === "application/pdf" || ext === "pdf") {
                return this.extractPdf(file);
            }
            if (ext === "docx") {
                console.log("Processing DOCX file");
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

        async extractPdf(file) {
            if (!this.pdfjs) return { text: "" };
            const buffer = await file.arrayBuffer();
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
                pages.push({ pageNumber: pageIndex, text: pageText });
                full += pageText;
            }
            return { text: full, pdfPages: pages };
        }

        async extractDocx(file) {
            console.log("Extracting DOCX:", file.name, "jszip available:", !!this.jszip);
            if (!this.jszip) {
                throw new Error("JSZip n'est pas chargé - impossible d'extraire le DOCX");
            }
            const buffer = await file.arrayBuffer();
            console.log("Buffer loaded, size:", buffer.byteLength);

            let zip;
            try {
                // Try direct loadAsync first
                if (typeof this.jszip.loadAsync === "function") {
                    console.log("Using JSZip.loadAsync API");
                    zip = await this.jszip.loadAsync(buffer);
                } else if (typeof this.jszip.default?.loadAsync === "function") {
                    // Fallback for wrapped export
                    console.log("Using JSZip.default.loadAsync API");
                    zip = await this.jszip.default.loadAsync(buffer);
                } else if (typeof this.jszip === "function") {
                    // Constructor API
                    console.log("Using JSZip constructor API");
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

            console.log("ZIP loaded, files:", Object.keys(zip.files).length);
            const entry = zip.file("word/document.xml");
            if (!entry) {
                console.error("word/document.xml not found in DOCX");
                throw new Error("Fichier DOCX invalide: word/document.xml non trouvé");
            }
            const raw = await entry.async("string");
            console.log("XML loaded, size:", raw.length);
            const text = extractTextFromXml(raw);
            console.log("Text extracted, length:", text.length);
            return text || "";
        }

        async extractPptx(file) {
            if (!this.jszip) {
                throw new Error("JSZip n'est pas chargé - impossible d'extraire le PPTX");
            }
            const buffer = await file.arrayBuffer();
            let zip;
            if (typeof this.jszip.loadAsync === "function") {
                zip = await this.jszip.loadAsync(buffer);
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
            const texts = [];
            for (const name of slideNames) {
                const entry = zip.file(name);
                if (!entry) continue;
                const raw = await entry.async("string");
                texts.push(extractTextFromXml(raw));
            }
            return texts.join("\n\n") || "";
        }

        async extractSpreadsheet(file) {
            const buffer = await file.arrayBuffer();
            let zip;
            if (typeof this.jszip.loadAsync === "function") {
                zip = await this.jszip.loadAsync(buffer);
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
            if (!this.jszip) {
                throw new Error("JSZip n'est pas chargé - impossible d'extraire le fichier ODF");
            }
            const buffer = await file.arrayBuffer();
            let zip;
            if (typeof this.jszip.loadAsync === "function") {
                zip = await this.jszip.loadAsync(buffer);
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
            const vector = options.vector || await this.embed(query);
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
                const target = new Float32Array(chunk.emb);
                const similarity = cosineSim(vector, target);
                if (similarity < minScore) continue;
                scored.push(this.buildChunkResult(chunk, docMap, similarity));
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topK);
        }

        async searchKeywordCandidates(query, conversationId, limit) {
            if (!query || !this.keywordIndex) return null;
            const cappedLimit = typeof limit === "number" ? limit : 200;
            try {
                await this.waitReady();
                return this.keywordIndex.search(query, normalizeConversationId(conversationId), cappedLimit);
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
