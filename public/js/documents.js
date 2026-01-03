(function (global) {
    const DEFAULT_SETTINGS = {
        chunkSize: 900,
        chunkOverlap: 120,
        topK: 6,
        minScore: 0.2,
        embedModelId: "Xenova/all-MiniLM-L6-v2"
    };

    const STORAGE_KEY = "goToolkit.documents.settings";
    const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/+esm";
    const PDFJS_WORKER = "js/pdf.worker.min.mjs";
    const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
    const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";

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
                this.jszip = jsZipModule?.default || jsZipModule;
                await this.loadSettings();
                await this.ensureDb();
                await this.ensureEmbedder();
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

        async ensureDb() {
            if (this.dbPromise) return this.dbPromise;
            this.dbPromise = new Promise((resolve, reject) => {
                if (typeof indexedDB === "undefined" || !indexedDB) {
                    reject(new Error("IndexedDB indisponible"));
                    return;
                }
                const request = indexedDB.open("gotoolkit-documents", 1);
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
            if (!conversationId) return [];
            const store = await this.getStore("documents");
            if (!store) return [];
            const index = store.index("conversationId");
            return new Promise((resolve, reject) => {
                const request = index.getAll(conversationId);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        }

        async getChunks(conversationId) {
            if (!conversationId) return [];
            const store = await this.getStore("chunks");
            if (!store) return [];
            const index = store.index("conversationId");
            return new Promise((resolve, reject) => {
                const request = index.getAll(conversationId);
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
            return this.deleteByIndex("chunks", "docId", docId);
        }

        async deleteDocumentsByNames(conversationId, names) {
            if (!conversationId || !Array.isArray(names) || !names.length) return;
            const targetNames = new Set(names.filter(Boolean));
            if (!targetNames.size) return;
            const docs = await this.getDocuments(conversationId);
            const toDelete = docs.filter(doc => targetNames.has(doc.name));
            if (!toDelete.length) return;
            await Promise.all(toDelete.map(async doc => {
                await this.deleteChunksByDocId(doc.id);
                await this.deleteDocumentById(doc.id);
            }));
            await this.emitStats(conversationId);
        }

        async deleteDocumentsBySourceTypes(conversationId, sourceTypes) {
            if (!conversationId || !Array.isArray(sourceTypes) || !sourceTypes.length) return;
            await this.waitReady();
            const targetTypes = new Set(sourceTypes.filter(Boolean));
            if (!targetTypes.size) return;
            const docs = await this.getDocuments(conversationId);
            const toDelete = docs.filter(doc => {
                const sourceType = doc.sourceType || "context";
                return targetTypes.has(sourceType);
            });
            if (!toDelete.length) return;
            await Promise.all(toDelete.map(async doc => {
                await this.deleteChunksByDocId(doc.id);
                await this.deleteDocumentById(doc.id);
            }));
            await this.emitStats(conversationId);
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
            if (!conversationId) return;
            await this.waitReady();
            await this.deleteByIndex("documents", "conversationId", conversationId);
            await this.deleteByIndex("chunks", "conversationId", conversationId);
            await this.emitStats(conversationId);
        }

        async getStats(conversationId) {
            if (!conversationId) {
                return { conversationId: "", docsUploaded: 0, docsParsed: 0, chunkCount: 0 };
            }
            const docs = await this.getDocuments(conversationId);
            const docsParsed = docs.filter((doc) => doc.status === "ready").length;
            const chunkCount = docs.reduce((acc, doc) => acc + (doc.chunkCount || 0), 0);
            return {
                conversationId,
                docsUploaded: docs.length,
                docsParsed,
                chunkCount
            };
        }

        async ingestFiles(files, conversationId, options = {}) {
            if (!files || !files.length || !conversationId) return [];
            await this.waitReady();
            const chunkSize = Number(this.settings.chunkSize) || DEFAULT_SETTINGS.chunkSize;
            const chunkOverlap = Number(this.settings.chunkOverlap) || DEFAULT_SETTINGS.chunkOverlap;
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
            const baseEntry = {
                id: docId,
                conversationId,
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
                sourceFileName
            };
            await this.putDocument(baseEntry);
            onProgress?.({ type: "file-start", index: i + 1, total: queue.length, file: file.name });
            let extracted = "";
            let success = true;
            let errorMessage = "";
                try {
                    extracted = await this.extractText(file);
                } catch (err) {
                    success = false;
                    errorMessage = err?.message || "Erreur d'extraction";
                    baseEntry.status = "error";
                    baseEntry.error = errorMessage;
                    await this.putDocument(baseEntry);
                }
                if (!success) {
                    results.push({ docId, name: file.name, success: false, error: errorMessage });
                    continue;
                }
                const normalized = normalizeText(extracted);
                const rawChunks = chunkText(normalized, chunkSize, chunkOverlap);
                const chunkList = rawChunks.length ? rawChunks : [""];
                const chunkTotal = chunkList.length;
                let lastProgress = 0;
                for (let c = 0; c < chunkTotal; c++) {
                    const chunk = chunkList[c];
                    const percent = Math.round(((c + 1) / chunkTotal) * 100);
                    if (percent !== lastProgress) {
                        onProgress?.({ type: "chunk", file: file.name, progress: percent });
                        lastProgress = percent;
                    }
                    const emb = await this.embed(chunk);
                    await this.putChunk({
                        id: crypto.randomUUID(),
                        conversationId,
                        docId,
                        idx: c,
                        text: chunk,
                        emb: Array.from(emb),
                        createdAt: Date.now()
                    });
                }
                baseEntry.status = "ready";
                baseEntry.parsedAt = Date.now();
                baseEntry.chunkCount = chunkTotal;
                await this.putDocument(baseEntry);
                results.push({ docId, name: file.name, success: true, chunkTotal });
                onProgress?.({ type: "file-done", file: file.name });
            }
            await this.emitStats(conversationId);
            return results;
        }

        async extractText(file) {
            const ext = getExtension(file.name);
            if (file.type === "application/pdf" || ext === "pdf") {
                return this.extractPdf(file);
            }
            if (ext === "docx") {
                return this.extractDocx(file);
            }
            if (ext === "pptx") {
                return this.extractPptx(file);
            }
            if (ext === "xlsx" || ext === "ods") {
                return this.extractSpreadsheet(file);
            }
            if (ext === "odt" || ext === "odf") {
                return this.extractOdf(file);
            }
            if (ext === "rtf" || ext === "doc") {
                return file.text();
            }
            if (ext === "txt" || !ext) {
                return file.text();
            }
            if (ACCEPTED_EXTENSIONS.has(ext)) {
                return file.text();
            }
            return file.text();
        }

        async extractPdf(file) {
            if (!this.pdfjs) return "";
            const buffer = await file.arrayBuffer();
            const pdf = await this.pdfjs.getDocument({ data: buffer }).promise;
            let full = "";
            for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
                const page = await pdf.getPage(pageIndex);
                const content = await page.getTextContent();
                const tokens = (content.items || [])
                    .map((item) => (item.str || ""))
                    .filter(Boolean);
                full += tokens.join(" ") + "\n\n";
            }
            return full;
        }

        async extractDocx(file) {
            const buffer = await file.arrayBuffer();
            const zip = await this.jszip.loadAsync(buffer);
            const entry = zip.file("word/document.xml");
            if (!entry) return "";
            const raw = await entry.async("string");
            return extractTextFromXml(raw);
        }

        async extractPptx(file) {
            const buffer = await file.arrayBuffer();
            const zip = await this.jszip.loadAsync(buffer);
            const slideNames = Object.keys(zip.files).filter((name) =>
                name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
            );
            const texts = [];
            for (const name of slideNames) {
                const entry = zip.file(name);
                if (!entry) continue;
                const raw = await entry.async("string");
                texts.push(extractTextFromXml(raw));
            }
            return texts.join("\n\n");
        }

        async extractSpreadsheet(file) {
            const buffer = await file.arrayBuffer();
            const zip = await this.jszip.loadAsync(buffer);
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
            const buffer = await file.arrayBuffer();
            const zip = await this.jszip.loadAsync(buffer);
            const entry = zip.file("content.xml");
            if (!entry) return "";
            const raw = await entry.async("string");
            return extractTextFromXml(raw);
        }

        async retrieve(query, conversationId, options = {}) {
            if (!conversationId || !query) return [];
            await this.waitReady();
            const vector = await this.embed(query);
            const chunks = await this.getChunks(conversationId);
            const docs = await this.getDocuments(conversationId);
            const docMap = new Map();
            docs.forEach((doc) => docMap.set(doc.id, doc));
            const scored = chunks.map((chunk) => {
                const docMeta = docMap.get(chunk.docId);
                const target = new Float32Array(chunk.emb);
                return {
                    ...chunk,
                    score: cosineSim(vector, target),
                    docName: docMeta?.name || "Document",
                    sourceType: docMeta?.sourceType || "context",
                    docAbstract: docMeta?.abstract || "",
                    text: chunk.text
                };
            });
            scored.sort((a, b) => b.score - a.score);
            const minScore = options.minScore ?? this.settings.minScore;
            const topK = options.topK ?? this.settings.topK;
            return scored.filter((hit) => hit.score >= minScore).slice(0, topK);
        }
    }

    const documents = global.GoToolkitDocumentManager || new DocumentManager();
    global.GoToolkitDocumentManager = documents;
})(typeof window !== "undefined" ? window : this);
