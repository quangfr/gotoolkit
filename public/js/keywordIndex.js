(function (global) {
    const MINI_SEARCH_URL = "https://cdn.jsdelivr.net/npm/minisearch@7.2.0/dist/umd/index.min.js";
    const FLEXSEARCH_URL = "https://cdn.jsdelivr.net/npm/flexsearch@0.7.31/dist/flexsearch.bundle.js";

    function clampPositive(value, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return max;
        if (max && numeric > max) return max;
        return numeric;
    }

    class SimpleKeywordEngine {
        constructor() {
            this.docs = new Map();
        }

        add(doc) {
            if (!doc || !doc.id) return;
            this.docs.set(doc.id, doc);
        }

        addAll(docs) {
            (docs || []).forEach((doc) => this.add(doc));
        }

        remove(docId) {
            this.docs.delete(docId);
        }

        clear() {
            this.docs.clear();
        }

        search(query, limit, conversationId) {
            const normalized = (query || "").toLowerCase();
            if (!normalized) return [];
            const max = clampPositive(limit, 500);
            const results = [];
            for (const doc of this.docs.values()) {
                if (conversationId && doc.conversationId !== conversationId) continue;
                const haystack = (doc.text || "").toLowerCase();
                if (!haystack) continue;
                if (haystack.includes(normalized)) {
                    results.push({ ...doc, score: normalized.length / Math.max(haystack.length, 1) });
                }
                if (results.length >= max) break;
            }
            return results;
        }
    }

    class KeywordIndex {
        constructor() {
            this.engineType = "none";
            this.index = null;
            this.meta = {
                total: 0,
                perConversation: new Map()
            };
        }

        getEngineType() {
            return this.engineType;
        }

        async ensureEngine() {
            if (this.index) return this.index;
            if (typeof global.MiniSearch === "undefined") {
                try {
                    await import(MINI_SEARCH_URL);
                } catch (err) {
                    // ignore, fall back
                }
            }
            if (typeof global.MiniSearch === "function") {
                this.engineType = "minisearch";
                this.index = new global.MiniSearch({
                    fields: ["text"],
                    idField: "id",
                    storeFields: ["id", "docId", "conversationId", "section", "page", "line", "size", "sourceType"]
                });
                return this.index;
            }
            if (typeof global.FlexSearch === "undefined") {
                try {
                    await import(FLEXSEARCH_URL);
                } catch (err) {
                    // ignore, fall back
                }
            }
            if (global.FlexSearch?.Document) {
                this.engineType = "flexsearch";
                this.index = new global.FlexSearch.Document({
                    document: {
                        id: "id",
                        index: ["text"],
                        store: ["id", "docId", "conversationId", "section", "page", "line", "size", "sourceType"]
                    },
                    tokenize: "forward"
                });
                return this.index;
            }
            this.engineType = "simple";
            this.index = new SimpleKeywordEngine();
            return this.index;
        }

        async resetEngine() {
            this.index = null;
            await this.ensureEngine();
        }

        updateMetaForDoc(doc, delta) {
            this.meta.total = Math.max(0, this.meta.total + delta);
            const convId = doc?.conversationId || "global";
            const current = this.meta.perConversation.get(convId) || 0;
            this.meta.perConversation.set(convId, Math.max(0, current + delta));
        }

        recalcMetaFromDocs(docs) {
            this.meta.total = 0;
            this.meta.perConversation.clear();
            (docs || []).forEach((doc) => this.updateMetaForDoc(doc, 1));
        }

        getMetaSnapshot() {
            return {
                total: this.meta.total,
                perConversation: Array.from(this.meta.perConversation.entries()),
                engine: this.engineType
            };
        }

        async buildIndex(docs) {
            await this.resetEngine();
            const entries = Array.isArray(docs) ? docs : [];
            if (this.engineType === "minisearch") {
                this.index.addAll(entries);
            } else if (this.engineType === "flexsearch") {
                entries.forEach((doc) => this.index.add(doc));
            } else if (this.engineType === "simple") {
                this.index.clear();
                this.index.addAll(entries);
            }
            this.recalcMetaFromDocs(entries);
            this.docsCache = new Map(entries.map((doc) => [doc.id, doc]));
        }

        async addDocs(docs) {
            if (!docs || !docs.length) return;
            await this.ensureEngine();
            docs.forEach((doc) => {
                if (!doc || !doc.id) return;
                if (this.engineType === "minisearch") {
                    this.index.add(doc);
                } else if (this.engineType === "flexsearch") {
                    this.index.add(doc);
                } else if (this.engineType === "simple") {
                    this.index.add(doc);
                }
                this.updateMetaForDoc(doc, 1);
                if (!this.docsCache) this.docsCache = new Map();
                this.docsCache.set(doc.id, doc);
            });
        }

        async removeByDocIds(docIds) {
            if (!Array.isArray(docIds) || !docIds.length || !this.docsCache) return;
            const toRemove = [];
            docIds.forEach((docId) => {
                for (const doc of this.docsCache.values()) {
                    if (doc.docId === docId) {
                        toRemove.push(doc);
                    }
                }
            });
            if (!toRemove.length) return;
            await this.ensureEngine();
            toRemove.forEach((doc) => {
                try {
                    if (this.engineType === "minisearch") {
                        this.index.remove(doc);
                    } else if (this.engineType === "flexsearch") {
                        this.index.remove(doc);
                    } else {
                        this.index.remove(doc.id);
                    }
                } catch (err) {
                    console.warn("Keyword index remove failed", err);
                }
                this.updateMetaForDoc(doc, -1);
                this.docsCache.delete(doc.id);
            });
        }

        async removeByConversation(conversationId) {
            if (!conversationId || !this.docsCache) return;
            const docIds = [];
            for (const doc of this.docsCache.values()) {
                if (doc.conversationId === conversationId) {
                    docIds.push(doc.docId);
                }
            }
            if (docIds.length) {
                await this.removeByDocIds(docIds);
            }
        }

        search(query, conversationId, limit) {
            if (!query || !this.index) return null;
            const max = clampPositive(limit, 500);
            if (this.engineType === "minisearch") {
                try {
                    const hits = this.index.search(query, {
                        limit: max,
                        filter: (result) => result.conversationId === conversationId,
                        boost: { text: 2 },
                        prefix: true
                    });
                    return hits.map((hit) => ({
                        ...hit,
                        chunkId: hit.id
                    }));
                } catch (err) {
                    console.warn("Keyword index search failed", err);
                    return null;
                }
            }
            if (this.engineType === "flexsearch") {
                try {
                    const hits = this.index.search({
                        query,
                        limit: max
                    });
                    const flattened = Array.isArray(hits) ? hits.flat() : [];
                    const filtered = [];
                    for (const id of flattened) {
                        const doc = this.docsCache?.get(id);
                        if (!doc) continue;
                        if (conversationId && doc.conversationId !== conversationId) continue;
                        filtered.push({ ...doc, chunkId: doc.id });
                        if (filtered.length >= max) break;
                    }
                    return filtered;
                } catch (err) {
                    console.warn("Keyword index search failed", err);
                    return null;
                }
            }
            if (this.engineType === "simple") {
                const hits = this.index.search(query, max, conversationId);
                return hits.map((hit) => ({
                    ...hit,
                    chunkId: hit.id
                }));
            }
            return null;
        }

        getSize(conversationId) {
            if (!conversationId) return this.meta.total || 0;
            return this.meta.perConversation.get(conversationId) || 0;
        }
    }

    const keywordIndex = global.GoToolkitKeywordIndex || new KeywordIndex();
    global.GoToolkitKeywordIndex = keywordIndex;
})(typeof window !== "undefined" ? window : this);
