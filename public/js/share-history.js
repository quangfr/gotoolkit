(function () {
    const STORAGE_KEY = "go-toolkit-share-records";
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
                console.warn("goToolkitShareHistory: fallback read failed", err);
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
                console.warn("goToolkitShareHistory: fallback write failed", err);
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
            storeName: "share-history",
            localStorageKey: STORAGE_KEY,
            defaultValue: () => ({}),
            normalize: value => (value && typeof value === "object" ? value : null),
            logPrefix: "goToolkitShareHistory"
        }) || fallbackStore;

    async function readRecords() {
        return store.read();
    }

    async function writeRecords(records) {
        return store.write(records || {});
    }

    async function refreshFromStore() {
        await store.refresh();
        return readRecords();
    }

    async function getRecords() {
        return readRecords();
    }

    async function upsertRecord(app, record) {
        if (!app || !record || !record.token) {
            return null;
        }
        const normalizedApp = String(app).trim();
        if (!normalizedApp) {
            return null;
        }
        const token = String(record.token).trim();
        if (!token) {
            return null;
        }
        const records = await readRecords();
        const next = Object.assign({}, records[normalizedApp] || {}, record, {
            token,
            updatedAt: record.updatedAt || new Date().toISOString()
        });
        records[normalizedApp] = next;
        await writeRecords(records);
        return next;
    }

    function formatRelativeDate(value) {
        if (!value) return "";
        try {
            const timestamp = typeof value === "number" ? value : Date.parse(value);
            if (!Number.isFinite(timestamp)) return "";
            const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
            if (deltaSeconds < 60) {
                return "Mis à jour à l'instant";
            }
            const deltaMinutes = Math.floor(deltaSeconds / 60);
            if (deltaMinutes < 60) {
                return `Mis à jour il y a ${deltaMinutes} minute${deltaMinutes > 1 ? "s" : ""}`;
            }
            const deltaHours = Math.floor(deltaMinutes / 60);
            if (deltaHours < 24) {
                return `Mis à jour il y a ${deltaHours} heure${deltaHours > 1 ? "s" : ""}`;
            }
            const deltaDays = Math.floor(deltaHours / 24);
            return `Mis à jour il y a ${deltaDays} jour${deltaDays > 1 ? "s" : ""}`;
        } catch (err) {
            return "";
        }
    }

    async function removeRecord(app) {
        const records = await readRecords();
        if (records && Object.prototype.hasOwnProperty.call(records, app)) {
            delete records[app];
            await writeRecords(records);
        }
    }

    window.goToolkitShareHistory = window.goToolkitShareHistory || {
        getRecords,
        upsertRecord,
        removeRecord,
        refreshFromStore,
        STORAGE_KEY
    };
})();
