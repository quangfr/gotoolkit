(() => {
    const globalScope = window;
    const docStoreFactory = globalScope.goToolkitDocStore?.createStore;
    const defaultNormalize = (value) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return value;
        }
        return null;
    };

    function isLocalStorageAvailable() {
        try {
            return typeof globalScope.localStorage !== "undefined";
        } catch {
            return false;
        }
    }

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function createStore(options = {}) {
        const {
            storeName,
            localStorageKey,
            recordKey = "records",
            defaultValue = () => ({}),
            normalize = defaultNormalize,
            logPrefix,
            persistToLocalStorage = true
        } = options;
        const prefix = logPrefix || localStorageKey || storeName || "goToolkitStorageService";
        const docStore = storeName && typeof docStoreFactory === "function" ? docStoreFactory(storeName) : null;
        const hasLocalStorage = Boolean(localStorageKey && isLocalStorageAvailable());
        const canWriteLocalStorage = hasLocalStorage && persistToLocalStorage !== false;

        let cachedValue = null;
        let loadPromise = null;

        const getDefaultValue = () =>
            typeof defaultValue === "function" ? defaultValue() : defaultValue;

        async function readLocalStorage() {
            if (!hasLocalStorage) return null;
            try {
                const raw = globalScope.localStorage.getItem(localStorageKey);
                if (!raw) return null;
                const parsed = safeParse(raw);
                return normalize(parsed);
            } catch (err) {
                console.warn(`${prefix}: failed to read localStorage`, err);
                return null;
            }
        }

        async function migrateFromLocalStorage() {
            if (!docStore || !hasLocalStorage) return null;
            try {
                const raw = globalScope.localStorage.getItem(localStorageKey);
                if (!raw) return null;
                const parsed = safeParse(raw);
                const normalized = normalize(parsed);
                if (!normalized) return null;
                await docStore.set(recordKey, normalized);
                globalScope.localStorage.removeItem(localStorageKey);
                return normalized;
            } catch (err) {
                console.warn(`${prefix}: failed to migrate localStorage`, err);
                return null;
            }
        }

        async function read() {
            if (cachedValue) return cachedValue;
            if (loadPromise) return loadPromise;
            loadPromise = (async () => {
                try {
                    if (docStore) {
                        const migrated = await migrateFromLocalStorage();
                        const stored = migrated || await docStore.get(recordKey);
                        if (stored) {
                            const normalized = normalize(stored);
                            if (normalized) {
                                cachedValue = normalized;
                                return normalized;
                            }
                        }
                    }
                    const fallback = await readLocalStorage();
                    if (fallback) {
                        cachedValue = fallback;
                        return fallback;
                    }
                } catch (err) {
                    console.warn(`${prefix}: failed to read store`, err);
                }
                cachedValue = getDefaultValue();
                return cachedValue;
            })();
            loadPromise.finally(() => {
                loadPromise = null;
            });
            return loadPromise;
        }

        async function write(value) {
            const next = value === null || value === undefined ? getDefaultValue() : value;
            cachedValue = next;
            if (canWriteLocalStorage) {
                try {
                    const serialized = JSON.stringify(next);
                    globalScope.localStorage.setItem(localStorageKey, serialized);
                } catch (err) {
                    console.warn(`${prefix}: failed to write localStorage`, err);
                }
            }
            if (docStore) {
                try {
                    await docStore.set(recordKey, next);
                } catch (err) {
                    console.warn(`${prefix}: failed to write IndexedDB`, err);
                }
            }
            return next;
        }

        async function refresh() {
            cachedValue = null;
            loadPromise = null;
            return read();
        }

        return {
            STORAGE_KEY: localStorageKey,
            read,
            write,
            refresh
        };
    }

    globalScope.goToolkitStorageService = globalScope.goToolkitStorageService || {};
    globalScope.goToolkitStorageService.createStore =
        globalScope.goToolkitStorageService.createStore || createStore;
})();
