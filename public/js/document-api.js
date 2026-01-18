(() => {
    const STORAGE_KEY = "go-toolkit-document-api";
    const storageService = window.goToolkitStorageService;

    const fallbackStore = (() => {
        let cached = null;

        async function read() {
            if (cached) {
                return cached;
            }
            if (typeof localStorage === "undefined") {
                cached = {};
                return cached;
            }
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === "object") {
                        cached = parsed;
                        return cached;
                    }
                }
            } catch (err) {
                console.warn("goToolkitDocumentApi: fallback read failed", err);
            }
            cached = {};
            return cached;
        }

        async function write(records) {
            const next = records && typeof records === "object" ? records : {};
            cached = next;
            if (typeof localStorage === "undefined") {
                return next;
            }
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch (err) {
                console.warn("goToolkitDocumentApi: fallback write failed", err);
            }
            return next;
        }

        async function refresh() {
            cached = null;
            return read();
        }

        return {
            STORAGE_KEY,
            read,
            write,
            refresh
        };
    })();

    const store =
        storageService?.createStore({
            storeName: "document-api",
            localStorageKey: STORAGE_KEY,
            defaultValue: () => ({}),
            normalize: value => (value && typeof value === "object" ? value : null),
            logPrefix: "goToolkitDocumentApi"
        }) || fallbackStore;

    function normalizeRecord(value) {
        if (!value || typeof value !== "object") {
            return null;
        }
        const id = (value.id || value.uuid || "").toString().trim();
        if (!id) {
            return null;
        }
        const app = (value.app || "").toString().trim();
        if (!app) {
            return null;
        }
        return {
            id,
            app,
            payload: value.payload,
            title: typeof value.title === "string" ? value.title : "",
            description: typeof value.description === "string" ? value.description : "",
            category: typeof value.category === "string" ? value.category : "",
            superpowers: Array.isArray(value.superpowers) ? value.superpowers : [],
            updatedAt: value.updatedAt || new Date().toISOString(),
            lastOpenedAt: value.lastOpenedAt || "",
            pinned: Boolean(value.pinned)
        };
    }

    async function readRecords() {
        return store.read();
    }

    async function writeRecords(records) {
        return store.write(records || {});
    }

    async function getAllRecords() {
        const records = await readRecords();
        return Object.values(records)
            .map(normalizeRecord)
            .filter(Boolean);
    }

    async function getRecord(id) {
        if (!id) {
            return null;
        }
        const records = await readRecords();
        return normalizeRecord(records[id]);
    }

    async function upsertRecord(record) {
        const normalized = normalizeRecord(record);
        if (!normalized) {
            return null;
        }
        const stored = await readRecords();
        const existing = normalizeRecord(stored[normalized.id]);
        const next = {
            id: normalized.id,
            app: normalized.app,
            payload: normalized.payload,
            title: normalized.title || (existing && existing.title) || "",
            description: normalized.description || (existing && existing.description) || "",
            category: normalized.category || (existing && existing.category) || "",
            updatedAt: normalized.updatedAt || new Date().toISOString(),
            lastOpenedAt: normalized.lastOpenedAt || (existing && existing.lastOpenedAt) || "",
            pinned:
                typeof record.pinned === "boolean"
                    ? record.pinned
                    : (existing && existing.pinned) || false
        };
        stored[next.id] = next;
        await writeRecords(stored);
        return next;
    }

    async function removeRecord(id) {
        if (!id) {
            return false;
        }
        const records = await readRecords();
        if (!Object.prototype.hasOwnProperty.call(records, id)) {
            return false;
        }
        delete records[id];
        await writeRecords(records);
        return true;
    }

    async function setPinned(id, pinned) {
        const record = await getRecord(id);
        if (!record) {
            return null;
        }
        return upsertRecord({
            ...record,
            pinned: Boolean(pinned),
            updatedAt: new Date().toISOString()
        });
    }

    function generateId() {
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

    window.goToolkitDocumentApi = window.goToolkitDocumentApi || {
        STORAGE_KEY,
        getAllRecords,
        getRecord,
        upsertRecord,
        removeRecord,
        setPinned,
        generateId
    };
})();
