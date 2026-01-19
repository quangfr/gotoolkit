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

    async function getRecordsByApp(app) {
        if (!app) return [];
        const records = await readRecords();
        const appData = records[app] || {};
        return Object.values(appData).sort((a, b) => {
            const dateA = Date.parse(a.updatedAt || 0);
            const dateB = Date.parse(b.updatedAt || 0);
            return dateB - dateA;
        });
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
        if (!records[normalizedApp] || Array.isArray(records[normalizedApp])) {
            records[normalizedApp] = {};
        }
        const existing = records[normalizedApp][token] || {};
        const next = Object.assign({}, existing, record, {
            token,
            updatedAt: record.updatedAt || new Date().toISOString()
        });
        records[normalizedApp][token] = next;
        await writeRecords(records);
        return next;
    }

    function formatFriendlyDate(isoString) {
        if (!isoString) return "Mis à jour";
        try {
            const value = new Date(isoString).getTime();
            if (Number.isNaN(value)) return "Mis à jour";
            const deltaSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
            if (deltaSeconds < 60) return "À l'instant";
            const deltaMinutes = Math.floor(deltaSeconds / 60);
            if (deltaMinutes < 60) return `Il y a ${deltaMinutes} min`;
            const deltaHours = Math.floor(deltaMinutes / 60);
            if (deltaHours < 24) return `Il y a ${deltaHours} h`;
            const deltaDays = Math.floor(deltaHours / 24);
            if (deltaDays < 30) return `Il y a ${deltaDays} j`;
            const formatter = new Intl.DateTimeFormat("fr-FR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
            });
            return formatter.format(new Date(value));
        } catch (err) {
            return "Mis à jour";
        }
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

    async function removeRecord(app, token) {
        const records = await readRecords();
        if (records && Object.prototype.hasOwnProperty.call(records, app)) {
            if (token) {
                if (records[app][token]) {
                    delete records[app][token];
                    await writeRecords(records);
                }
            } else {
                delete records[app];
                await writeRecords(records);
            }
        }
    }

    window.goToolkitShareHistory = window.goToolkitShareHistory || {
        getRecords,
        getRecordsByApp,
        upsertRecord,
        removeRecord,
        refreshFromStore,
        formatFriendlyDate,
        STORAGE_KEY
    };
})();
