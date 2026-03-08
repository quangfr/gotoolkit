(function () {
    const DB_NAME = "go-toolkit";
    const DB_VERSION = 14;
    const STORES = [
        "document-api",
        "share-history",
        "documents-settings",
        "memo-images",
        "memo-media-assets",
        "memo-media-pending",
        "voice-recordings",
        "knowledge-manifest",
        "knowledge-manifest-cache",
        "knowledge-overrides",
        "knowledge-selection",
        "knowledge-descriptions-overrides",
        "knowledge-local-docs",
        "templates",
        "cloud-drafts",
        "document-history"
    ];

    function isIndexedDbAvailable() {
        return typeof indexedDB !== "undefined" && indexedDB !== null;
    }

    function openDatabase() {
        if (!isIndexedDbAvailable()) {
            return Promise.reject(new Error("IndexedDB indisponible"));
        }
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                STORES.forEach(name => {
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name);
                    }
                });
            };
            request.onerror = () => reject(request.error || new Error("Impossible d'ouvrir IndexedDB"));
            request.onsuccess = () => resolve(request.result);
        });
    }

    async function withStore(storeName, mode, action) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = action(store);
            tx.onerror = () => reject(tx.error || new Error("Transaction IndexedDB échouée"));
            if (!request) {
                resolve(undefined);
                return;
            }
            request.onerror = () => reject(request.error || new Error("Requête IndexedDB échouée"));
            request.onsuccess = () => resolve(request.result);
        });
    }

    function createStore(storeName) {
        const fallback = {
            async get() { return null; },
            async set() { return null; },
            async remove() { return null; },
            async getAll() { return []; }
        };
        if (!isIndexedDbAvailable()) {
            return fallback;
        }
        return {
            async get(key) {
                return withStore(storeName, "readonly", store => store.get(key));
            },
            async set(key, value) {
                return withStore(storeName, "readwrite", store => store.put(value, key));
            },
            async remove(key) {
                return withStore(storeName, "readwrite", store => store.delete(key));
            },
            async getAll() {
                return withStore(storeName, "readonly", store => store.getAll());
            }
        };
    }

    window.goToolkitDocStore = window.goToolkitDocStore || {
        createStore
    };

    /**
     * Managed storage for templates in IndexedDB
     */
    const templateStore = {
        async list() {
            return (await withStore("templates", "readonly", s => s.getAll())) || [];
        },
        async save(template) {
            if (!template || !template.id) return;
            return withStore("templates", "readwrite", s => s.put(template, template.id));
        },
        async saveAll(templates) {
            if (!Array.isArray(templates)) return;
            const db = await openDatabase();
            return new Promise((resolve, reject) => {
                const tx = db.transaction("templates", "readwrite");
                const store = tx.objectStore("templates");
                templates.forEach(t => store.put(t, t.id));
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        },
        async delete(id) {
            return withStore("templates", "readwrite", s => s.delete(id));
        },
        async clear() {
            return withStore("templates", "readwrite", s => s.clear());
        }
    };

    window.goToolkitTemplateStore = templateStore;

    const documentHistoryStore = {
        async getTimeline(docId) {
            const id = String(docId || "").trim();
            if (!id) return null;
            return (await withStore("document-history", "readonly", s => s.get(id))) || null;
        },
        async saveTimeline(docId, timeline) {
            const id = String(docId || "").trim();
            if (!id || !timeline || typeof timeline !== "object") return null;
            const next = {
                id,
                versions: Array.isArray(timeline.versions) ? timeline.versions : [],
                updatedAt: String(timeline.updatedAt || new Date().toISOString()).trim() || new Date().toISOString()
            };
            await withStore("document-history", "readwrite", s => s.put(next, id));
            return next;
        },
        async deleteTimeline(docId) {
            const id = String(docId || "").trim();
            if (!id) return false;
            await withStore("document-history", "readwrite", s => s.delete(id));
            return true;
        }
    };

    window.goToolkitDocumentHistoryStore = documentHistoryStore;

    const memoMediaBlobUrlCache = new Map();
    const MEMO_MEDIA_STORE = "memo-media-assets";
    const MEMO_MEDIA_PENDING_STORE = "memo-media-pending";
    const MEMO_MEDIA_REF_PREFIX = "gtlocal://memo-media/";

    function createMemoMediaId() {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
            crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i += 1) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        return Array.from(bytes)
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    function createMemoMediaRef(id) {
        const normalizedId = String(id || "").trim();
        return normalizedId ? `${MEMO_MEDIA_REF_PREFIX}${normalizedId}` : "";
    }

    function parseMemoMediaRef(value) {
        const raw = String(value || "").trim();
        if (!raw.startsWith(MEMO_MEDIA_REF_PREFIX)) return "";
        return raw.slice(MEMO_MEDIA_REF_PREFIX.length).trim();
    }

    function revokeMemoMediaBlobUrl(id) {
        const key = String(id || "").trim();
        if (!key) return;
        const existing = memoMediaBlobUrlCache.get(key);
        if (!existing) return;
        try {
            URL.revokeObjectURL(existing);
        } catch (err) {
            // ignore
        }
        memoMediaBlobUrlCache.delete(key);
    }

    async function listMemoMedia() {
        return (await withStore(MEMO_MEDIA_STORE, "readonly", store => store.getAll())) || [];
    }

    async function getMemoMediaRecord(id) {
        const normalizedId = String(id || "").trim();
        if (!normalizedId) return null;
        return (await withStore(MEMO_MEDIA_STORE, "readonly", store => store.get(normalizedId))) || null;
    }

    async function saveMemoMediaRecord(record) {
        const id = String(record?.id || "").trim() || createMemoMediaId();
        const next = {
            id,
            kind: String(record?.kind || "").trim().toLowerCase(),
            mimeType: String(record?.mimeType || "").trim() || "application/octet-stream",
            fileName: String(record?.fileName || "asset.bin").trim() || "asset.bin",
            size: Number(record?.size || record?.blob?.size || 0) || 0,
            spaceId: String(record?.spaceId || "").trim().toLowerCase() || "",
            ownerDocumentId: String(record?.ownerDocumentId || "").trim(),
            sourceAssetId: String(record?.sourceAssetId || "").trim(),
            sourceUrl: String(record?.sourceUrl || "").trim(),
            createdAt: String(record?.createdAt || new Date().toISOString()).trim() || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            blob: record?.blob instanceof Blob ? record.blob : null
        };
        await withStore(MEMO_MEDIA_STORE, "readwrite", store => store.put(next, id));
        revokeMemoMediaBlobUrl(id);
        return next;
    }

    async function saveMemoMediaFile(file, options) {
        const nextOptions = options && typeof options === "object" ? options : {};
        const mimeType = String(file?.type || nextOptions.mimeType || "").trim() || "application/octet-stream";
        const kind = mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "";
        const record = await saveMemoMediaRecord({
            id: nextOptions.id,
            kind: String(nextOptions.kind || kind).trim().toLowerCase() || kind,
            mimeType,
            fileName: String(file?.name || nextOptions.fileName || "asset.bin").trim() || "asset.bin",
            size: Number(file?.size || 0),
            spaceId: String(nextOptions.spaceId || "").trim().toLowerCase(),
            ownerDocumentId: String(nextOptions.ownerDocumentId || "").trim(),
            sourceAssetId: String(nextOptions.sourceAssetId || "").trim(),
            sourceUrl: String(nextOptions.sourceUrl || "").trim(),
            blob: file instanceof Blob ? file : null
        });
        return {
            ...record,
            ref: createMemoMediaRef(record.id)
        };
    }

    async function resolveMemoMediaBlobUrl(value) {
        const id = parseMemoMediaRef(value) || String(value || "").trim();
        if (!id) return "";
        if (memoMediaBlobUrlCache.has(id)) {
            return memoMediaBlobUrlCache.get(id);
        }
        const record = await getMemoMediaRecord(id);
        if (!(record?.blob instanceof Blob)) return "";
        const blobUrl = URL.createObjectURL(record.blob);
        memoMediaBlobUrlCache.set(id, blobUrl);
        return blobUrl;
    }

    async function deleteMemoMedia(id) {
        const normalizedId = String(id || "").trim();
        if (!normalizedId) return false;
        await withStore(MEMO_MEDIA_STORE, "readwrite", store => store.delete(normalizedId));
        revokeMemoMediaBlobUrl(normalizedId);
        return true;
    }

    async function pruneMemoMedia(keepIds, options) {
        const keep = new Set(Array.isArray(keepIds) ? keepIds.map(id => String(id || "").trim()).filter(Boolean) : []);
        const nextOptions = options && typeof options === "object" ? options : {};
        const kinds = new Set(Array.isArray(nextOptions.kinds) ? nextOptions.kinds.map(kind => String(kind || "").trim().toLowerCase()).filter(Boolean) : []);
        const spaceId = String(nextOptions.spaceId || "").trim().toLowerCase();
        const records = await listMemoMedia();
        let removed = 0;
        for (const record of records) {
            const id = String(record?.id || "").trim();
            if (!id || keep.has(id)) continue;
            if (spaceId && String(record?.spaceId || "").trim().toLowerCase() !== spaceId) continue;
            if (kinds.size && !kinds.has(String(record?.kind || "").trim().toLowerCase())) continue;
            await deleteMemoMedia(id);
            removed += 1;
        }
        return removed;
    }

    async function readMemoMediaPendingStore() {
        return (await withStore(MEMO_MEDIA_PENDING_STORE, "readonly", store => store.get("records"))) || {};
    }

    async function writeMemoMediaPendingStore(value) {
        const next = value && typeof value === "object" ? value : {};
        await withStore(MEMO_MEDIA_PENDING_STORE, "readwrite", store => store.put(next, "records"));
        return next;
    }

    async function queueRemoteDelete(spaceId, assetId) {
        const normalizedSpaceId = String(spaceId || "").trim().toLowerCase();
        const normalizedAssetId = String(assetId || "").trim();
        if (!normalizedSpaceId || !normalizedAssetId) return false;
        const current = await readMemoMediaPendingStore();
        const nextList = Array.isArray(current[normalizedSpaceId]) ? current[normalizedSpaceId] : [];
        if (!nextList.includes(normalizedAssetId)) nextList.push(normalizedAssetId);
        current[normalizedSpaceId] = nextList;
        await writeMemoMediaPendingStore(current);
        return true;
    }

    async function listQueuedRemoteDeletes(spaceId) {
        const current = await readMemoMediaPendingStore();
        const normalizedSpaceId = String(spaceId || "").trim().toLowerCase();
        return Array.isArray(current[normalizedSpaceId]) ? current[normalizedSpaceId].slice() : [];
    }

    async function clearQueuedRemoteDeletes(spaceId, assetIds) {
        const normalizedSpaceId = String(spaceId || "").trim().toLowerCase();
        if (!normalizedSpaceId) return 0;
        const current = await readMemoMediaPendingStore();
        const existing = Array.isArray(current[normalizedSpaceId]) ? current[normalizedSpaceId] : [];
        const remove = new Set(Array.isArray(assetIds) ? assetIds.map(id => String(id || "").trim()).filter(Boolean) : []);
        if (!existing.length || !remove.size) return 0;
        const next = existing.filter(id => !remove.has(String(id || "").trim()));
        if (next.length) {
            current[normalizedSpaceId] = next;
        } else {
            delete current[normalizedSpaceId];
        }
        await writeMemoMediaPendingStore(current);
        return existing.length - next.length;
    }

    window.goToolkitMemoMediaStore = window.goToolkitMemoMediaStore || {
        STORE_NAME: MEMO_MEDIA_STORE,
        REF_PREFIX: MEMO_MEDIA_REF_PREFIX,
        isLocalRef(value) {
            return Boolean(parseMemoMediaRef(value));
        },
        createRef: createMemoMediaRef,
        parseRef: parseMemoMediaRef,
        list: listMemoMedia,
        get: getMemoMediaRecord,
        saveRecord: saveMemoMediaRecord,
        saveFile: saveMemoMediaFile,
        resolveBlobUrl: resolveMemoMediaBlobUrl,
        delete: deleteMemoMedia,
        prune: pruneMemoMedia,
        queueRemoteDelete,
        listQueuedRemoteDeletes,
        clearQueuedRemoteDeletes
    };
})();
