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
    const DB_VERSION = 5;
    const REQUIRED_STORES = ["documents", "chunks", "keyword_meta", "memo_context_embeddings"];
    const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/+esm";
    const PDFJS_WORKER = "js/pdf.worker.min.mjs";
    const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
    const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
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
            if (!this.keywordIndex) {
                console.warn("Keyword index unavailable: GoToolkitKeywordIndex not found.");
            }
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
                await this.migrateMemoEmbeddingsEnabled();
                await this.cleanupExpiredEmbeddings();
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
            const targets = entries.filter((entry) => entry?.docId === docId);
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
            const results = [];
            const queue = Array.from(files);
            const existingDocs = await this.getDocuments(convId);
            const existingHashes = new Map();
            (existingDocs || []).forEach((doc) => {
                const hash = (doc?.fileHash || "").toString();
                if (hash) {
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
                        if (existingDoc.deletedAt) {
                            existingDoc.deletedAt = null;
                            await this.putDocument(existingDoc);
                        }
                        results.push({
                            docId: existingDoc.id,
                            name: file.name,
                            success: true,
                            reused: true,
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
                }
                if (!success) {
                    console.warn(`File ${file.name} marked as failed: ${errorMessage}`);
                    results.push({ docId, name: file.name, success: false, error: errorMessage });
                    continue;
                }
                const {
                    chunkList,
                    chunkConfig,
                    totalChars,
                    extractedText
                } = this.buildChunkList(file, extractionResult);
                const extractedCount = extractedText.length || totalChars;
                console.log(`Successfully extracted ${extractedCount} characters from ${file.name}`);
                onProgress?.({
                    type: "chars",
                    file: file.name,
                    processedChars: 0,
                    totalChars
                });
                const chunkTotal = chunkList.length;
                const allTexts = chunkList.map((meta) => meta?.text || "");
                onProgress?.({ type: "chunk", file: file.name, progress: 5 });
                console.log(`Batch embedding ${chunkTotal} chunks for ${file.name}...`);
                const startEmbedTime = performance.now();
                const allEmbeddings = await this.embedBatch(allTexts);
                const embedDuration = performance.now() - startEmbedTime;
                console.log(`Batch embedding took ${(embedDuration / 1000).toFixed(2)}s for ${chunkTotal} chunks`);
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
                baseEntry.status = "ready";
                baseEntry.parsedAt = Date.now();
                baseEntry.chunkCount = chunkTotal;
                baseEntry.chunkSizeCategory = chunkConfig.category;
                baseEntry.chunkSize = chunkConfig.chunkSize;
                baseEntry.chunkOverlap = chunkConfig.chunkOverlap;
                baseEntry.rawText = extractedText;
                await this.putDocument(baseEntry);
                if (memoId) {
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
            if (ext === "json") {
                return this.extractJson(file);
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
            const vector = options.vector || await this.embed(query);
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
                const target = quantizeEmbedding(chunk.emb);
                const similarity = cosineSimInt8(queryVector, target);
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
                await this.ensureKeywordIndexReady();
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
