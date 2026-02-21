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
        const hasVoiceRecordingId = Object.prototype.hasOwnProperty.call(value, "voiceRecordingId");
        const hasHandoffId = Object.prototype.hasOwnProperty.call(value, "handoffId");
        const hasNotionPageId = Object.prototype.hasOwnProperty.call(value, "notionPageId");
        const hasNotionPageUrl = Object.prototype.hasOwnProperty.call(value, "notionPageUrl");
        const hasNotionPath = Object.prototype.hasOwnProperty.call(value, "notionPath");
        const hasNotionWorkspaceId = Object.prototype.hasOwnProperty.call(value, "notionWorkspaceId");
        const hasParentId = Object.prototype.hasOwnProperty.call(value, "parentId");
        const hasIcon = Object.prototype.hasOwnProperty.call(value, "icon");
        const hasSpaceId = Object.prototype.hasOwnProperty.call(value, "spaceId");
        const hasShareToken = Object.prototype.hasOwnProperty.call(value, "shareToken");
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
            pinned: Boolean(value.pinned),
            voiceRecordingId: hasVoiceRecordingId ? (value.voiceRecordingId || null) : undefined,
            handoffId: hasHandoffId ? (typeof value.handoffId === "string" ? value.handoffId : null) : undefined,
            notionPageId: hasNotionPageId ? String(value.notionPageId || "").trim() : undefined,
            notionPageUrl: hasNotionPageUrl ? String(value.notionPageUrl || "").trim() : undefined,
            notionPath: hasNotionPath ? String(value.notionPath || "").trim() : undefined,
            notionWorkspaceId: hasNotionWorkspaceId ? String(value.notionWorkspaceId || "").trim() : undefined,
            parentId: hasParentId ? String(value.parentId || "").trim() : undefined,
            icon: hasIcon ? String(value.icon || "").trim() : undefined,
            spaceId: hasSpaceId ? String(value.spaceId || "").trim() : undefined,
            shareToken: hasShareToken ? String(value.shareToken || "").trim() : undefined
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
        const hasVoiceRecordingId = Object.prototype.hasOwnProperty.call(record, "voiceRecordingId");
        const hasHandoffId = Object.prototype.hasOwnProperty.call(record, "handoffId");
        const hasNotionPageId = Object.prototype.hasOwnProperty.call(record, "notionPageId");
        const hasNotionPageUrl = Object.prototype.hasOwnProperty.call(record, "notionPageUrl");
        const hasNotionPath = Object.prototype.hasOwnProperty.call(record, "notionPath");
        const hasNotionWorkspaceId = Object.prototype.hasOwnProperty.call(record, "notionWorkspaceId");
        const hasParentId = Object.prototype.hasOwnProperty.call(record, "parentId");
        const hasIcon = Object.prototype.hasOwnProperty.call(record, "icon");
        const hasSpaceId = Object.prototype.hasOwnProperty.call(record, "spaceId");
        const hasShareToken = Object.prototype.hasOwnProperty.call(record, "shareToken");
        const next = {
            id: normalized.id,
            app: normalized.app,
            payload: normalized.payload,
            title: normalized.title || (existing && existing.title) || "",
            description: normalized.description || (existing && existing.description) || "",
            category: normalized.category || (existing && existing.category) || "",
            superpowers: record.superpowers !== undefined ? normalized.superpowers : (existing && existing.superpowers) || [],
            updatedAt: normalized.updatedAt || new Date().toISOString(),
            lastOpenedAt: normalized.lastOpenedAt || (existing && existing.lastOpenedAt) || "",
            pinned:
                typeof record.pinned === "boolean"
                    ? record.pinned
                    : (existing && existing.pinned) || false
        };
        if (hasVoiceRecordingId) {
            next.voiceRecordingId = normalized.voiceRecordingId || null;
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "voiceRecordingId")) {
            next.voiceRecordingId = existing.voiceRecordingId;
        }
        if (hasHandoffId) {
            next.handoffId = normalized.handoffId === undefined ? null : normalized.handoffId;
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "handoffId")) {
            next.handoffId = existing.handoffId;
        }
        if (hasNotionPageId) {
            next.notionPageId = normalized.notionPageId || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "notionPageId")) {
            next.notionPageId = existing.notionPageId || "";
        }
        if (hasNotionPageUrl) {
            next.notionPageUrl = normalized.notionPageUrl || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "notionPageUrl")) {
            next.notionPageUrl = existing.notionPageUrl || "";
        }
        if (hasNotionPath) {
            next.notionPath = normalized.notionPath || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "notionPath")) {
            next.notionPath = existing.notionPath || "";
        }
        if (hasNotionWorkspaceId) {
            next.notionWorkspaceId = normalized.notionWorkspaceId || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "notionWorkspaceId")) {
            next.notionWorkspaceId = existing.notionWorkspaceId || "";
        }
        if (hasParentId) {
            next.parentId = normalized.parentId || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "parentId")) {
            next.parentId = existing.parentId || "";
        }
        if (hasIcon) {
            next.icon = normalized.icon || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "icon")) {
            next.icon = existing.icon || "";
        }
        if (hasSpaceId) {
            next.spaceId = normalized.spaceId || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "spaceId")) {
            next.spaceId = existing.spaceId || "";
        }
        if (hasShareToken) {
            next.shareToken = normalized.shareToken || "";
        } else if (existing && Object.prototype.hasOwnProperty.call(existing, "shareToken")) {
            next.shareToken = existing.shareToken || "";
        }
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
