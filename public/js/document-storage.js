(function () {
    const DB_NAME = "go-toolkit";
    const DB_VERSION = 8;
    const STORES = [
        "document-api",
        "share-history",
        "documents-settings",
        "memo-images",
        "voice-recordings",
        "knowledge-manifest",
        "knowledge-manifest-cache",
        "knowledge-overrides",
        "knowledge-selection",
        "knowledge-descriptions-overrides",
        "knowledge-local-docs"
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
})();
