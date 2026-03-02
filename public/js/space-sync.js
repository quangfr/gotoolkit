(function (global) {
    function createSpaceSyncHelpers(deps) {
        var d = deps || {};
        var normalizeSharedToken = d.normalizeSharedToken;
        var normalizeSpaceId = d.normalizeSpaceId;
        var normalizeSharedParentId = d.normalizeSharedParentId;
        var parseSharedPosition = d.parseSharedPosition;
        var getCloudDraft = d.getCloudDraft;
        var setCloudDraft = d.setCloudDraft;
        var clearCloudDraft = d.clearCloudDraft;
        var getActiveDocumentId = d.getActiveDocumentId;
        var markActiveCloudDocumentDirty = d.markActiveCloudDocumentDirty;
        var setStatus = d.setStatus;
        var shareWorker = d.shareWorker;
        var FIRESTORE_META_COLLECTION = d.FIRESTORE_META_COLLECTION;
        var DEFAULT_SPACE_ID = d.DEFAULT_SPACE_ID;
        var hasPendingSharedSyncInSpace = d.hasPendingSharedSyncInSpace;
        var updateSharedSpaceSyncButtonState = d.updateSharedSpaceSyncButtonState;
        var syncSpaceFromRemote = d.syncSpaceFromRemote;
        var markSpaceLastSynced = d.markSpaceLastSynced;
        var getSpaceById = d.getSpaceById;
        var getSpaces = d.getSpaces;
        var shareHistory = d.shareHistory;
        var getMemoExplorer = typeof d.getMemoExplorer === "function" ? d.getMemoExplorer : function () { return null; };
        var parseIsoMs = d.parseIsoMs;
        var getSpaceLastSyncedAt = d.getSpaceLastSyncedAt;
        var SYNC_DEBUG_PREFIX = "[MemoCloudDebug]";
        var CLOUD_SYNC_DEBUG_ENABLED = global?.GO_TOOLKIT_DEBUG_CLOUD_SYNC === true;

        function logSync(event, payload) {
            if (!CLOUD_SYNC_DEBUG_ENABLED) return;
            try {
                console.log(SYNC_DEBUG_PREFIX, event, payload || {});
            } catch (err) {
                // ignore
            }
        }

        var SHARED_TREE_MOVE_BATCH_DELAY_MS = 180;
        var sharedTreeMoveBatchQueue = new Map();
        var sharedTreeMoveBatchTimer = null;

        function scheduleSharedMoveSave(token, payload, options) {
            options = options || {};
            var normalizedToken = normalizeSharedToken(token);
            if (!normalizedToken) return;
            var targetSpaceId = normalizeSpaceId(options.spaceId || DEFAULT_SPACE_ID);
            var activeId = "share:" + normalizedToken;
            var nextParentId = normalizeSharedParentId(options.parentId || payload?.parentId || "");
            var nextPosition = parseSharedPosition(options.position ?? payload?.position);
            var nowIso = new Date().toISOString();
            logSync("page-drag-cloud-move:queued", {
                token: normalizedToken,
                spaceId: targetSpaceId,
                parentId: nextParentId,
                position: nextPosition
            });
            var existingDraft = getCloudDraft(activeId) || {};
            var preservedOpType = String(existingDraft?.opType || "").trim().toLowerCase() === "create"
                ? "create"
                : "";
            setCloudDraft(activeId, {
                ...existingDraft,
                id: activeId,
                payload: (payload && typeof payload === "object") ? payload : (existingDraft?.payload || {}),
                title: String(options.title || existingDraft?.title || "").trim(),
                description: String(options.description || existingDraft?.description || "").trim(),
                superpowers: Array.isArray(options.superpowers)
                    ? options.superpowers
                    : (Array.isArray(existingDraft?.superpowers) ? existingDraft.superpowers : []),
                parentId: nextParentId,
                spaceId: targetSpaceId,
                position: nextPosition,
                opType: preservedOpType || String(options.opType || options.reason || "move").trim() || "move",
                updatedAt: nowIso
            });
            if (getActiveDocumentId && getActiveDocumentId() === activeId && payload) {
                markActiveCloudDocumentDirty?.("tree");
            }
            setStatus?.("Modifications locales en attente pour " + targetSpaceId.toUpperCase());
        }

        function scheduleSharedDeleteSave(token, options) {
            options = options || {};
            var normalizedToken = normalizeSharedToken(token);
            if (!normalizedToken) return;
            var activeId = "share:" + normalizedToken;
            var existingDraft = getCloudDraft(activeId) || {};
            var existingOpType = String(existingDraft?.opType || "").trim().toLowerCase();
            if (existingOpType === "create") {
                clearCloudDraft(activeId);
                setStatus?.("Création cloud annulée localement");
                return;
            }
            var targetSpaceId = normalizeSpaceId(options.spaceId || DEFAULT_SPACE_ID);
            setCloudDraft(activeId, {
                id: activeId,
                token: normalizedToken,
                opType: "delete",
                reason: "delete",
                title: String(options.title || "").trim(),
                description: String(options.description || "").trim(),
                superpowers: Array.isArray(options.superpowers) ? options.superpowers : [],
                spaceId: targetSpaceId,
                updatedAt: new Date().toISOString()
            });
        }

        function scheduleSharedArchiveSave(token, options) {
            options = options || {};
            var normalizedToken = normalizeSharedToken(token);
            if (!normalizedToken) return;
            var activeId = "share:" + normalizedToken;
            var targetSpaceId = normalizeSpaceId(options.spaceId || DEFAULT_SPACE_ID);
            var parentId = normalizeSharedParentId(options.parentId || "");
            logSync("page-drag-cloud-to-local:queued", {
                token: normalizedToken,
                spaceId: targetSpaceId,
                parentId: parentId,
                reason: String(options.reason || "moved-to-local").trim() || "moved-to-local"
            });
            setCloudDraft(activeId, {
                id: activeId,
                token: normalizedToken,
                opType: "archive",
                reason: String(options.reason || "moved-to-local").trim() || "moved-to-local",
                title: String(options.title || "").trim(),
                description: String(options.description || "").trim(),
                superpowers: Array.isArray(options.superpowers) ? options.superpowers : [],
                spaceId: targetSpaceId,
                parentId: parentId,
                updatedAt: new Date().toISOString()
            });
            setStatus?.("Archivage cloud en attente de sync pour " + targetSpaceId.toUpperCase());
        }

        function queueSharedTreeMoveMetaWrite(entry) {
            var token = normalizeSharedToken(entry?.token);
            if (!token) return Promise.resolve({ ok: false, error: new Error("Token partagé invalide") });
            return new Promise(function (resolve) {
                var existing = sharedTreeMoveBatchQueue.get(token) || null;
                var resolvers = Array.isArray(existing?.resolvers) ? existing.resolvers : [];
                resolvers.push(resolve);
                sharedTreeMoveBatchQueue.set(token, {
                    token: token,
                    payload: entry?.payload && typeof entry.payload === "object" ? entry.payload : {},
                    resolvers: resolvers
                });
                if (sharedTreeMoveBatchTimer) {
                    clearTimeout(sharedTreeMoveBatchTimer);
                }
                sharedTreeMoveBatchTimer = setTimeout(function () {
                    sharedTreeMoveBatchTimer = null;
                    flushSharedTreeMoveMetaBatch().catch(function (err) {
                        console.warn("Shared tree move meta batch flush failed", err);
                    });
                }, SHARED_TREE_MOVE_BATCH_DELAY_MS);
            });
        }

        async function flushSharedTreeMoveMetaBatch() {
            if (!sharedTreeMoveBatchQueue.size) return;
            if (!shareWorker?.saveSharePayloadBatch) {
                var unavailableErr = new Error("Batch endpoint indisponible");
                for (var entry of sharedTreeMoveBatchQueue.values()) {
                    var resolvers = Array.isArray(entry?.resolvers) ? entry.resolvers : [];
                    resolvers.forEach(function (resolve) { resolve({ ok: false, error: unavailableErr }); });
                }
                sharedTreeMoveBatchQueue.clear();
                return;
            }

            var queuedEntries = Array.from(sharedTreeMoveBatchQueue.values());
            sharedTreeMoveBatchQueue.clear();
            var writes = queuedEntries.map(function (item) {
                return {
                    id: item.token,
                    payload: item.payload
                };
            });
            logSync("page-drag-cloud-move:flush-start", {
                count: writes.length,
                tokens: writes.map(function (entry) { return entry.id; })
            });
            var updatedAtByToken = new Map();
            try {
                var batchResult = await shareWorker.saveSharePayloadBatch(FIRESTORE_META_COLLECTION, writes);
                var results = Array.isArray(batchResult?.results) ? batchResult.results : [];
                updatedAtByToken = new Map(
                    results
                        .map(function (item) { return [String(item?.id || "").trim(), String(item?.meta?.updatedAt || "").trim()]; })
                        .filter(function (pair) { return Boolean(pair[0]) && Boolean(pair[1]); })
                );
                logSync("page-drag-cloud-move:flush-done", {
                    count: results.length,
                    tokens: results.map(function (entry) { return entry?.id; }).filter(Boolean)
                });
            } catch (err) {
                logSync("page-drag-cloud-move:flush-error", {
                    message: String(err?.message || err || "")
                });
                for (var queued of queuedEntries) {
                    var queuedResolvers = Array.isArray(queued?.resolvers) ? queued.resolvers : [];
                    queuedResolvers.forEach(function (resolve) { resolve({ ok: false, error: err }); });
                }
                return;
            }

            for (var qe of queuedEntries) {
                var updatedAt = String(updatedAtByToken.get(qe.token) || "").trim();
                var qeResolvers = Array.isArray(qe?.resolvers) ? qe.resolvers : [];
                if (updatedAt) {
                    qeResolvers.forEach(function (resolve) { resolve({ ok: true, updatedAt: updatedAt }); });
                } else {
                    var err = new Error("Meta write not acknowledged");
                    qeResolvers.forEach(function (resolve) { resolve({ ok: false, error: err }); });
                }
            }
        }

        async function reloadSpaceFromRemote(spaceId) {
            var targetSpaceId = normalizeSpaceId(spaceId || DEFAULT_SPACE_ID);
            if (!shareWorker?.isReady || !shareHistory?.getRecordsByApp) {
                setStatus?.("Service de partage indisponible", true);
                return;
            }
            var attemptedReauth = false;
            try {
                var hadPendingSync = hasPendingSharedSyncInSpace(targetSpaceId);
                updateSharedSpaceSyncButtonState(targetSpaceId, true);
                await syncSpaceFromRemote(targetSpaceId, { refreshExplorer: true });
                markSpaceLastSynced(targetSpaceId);
                var hasPendingAfterSync = hasPendingSharedSyncInSpace(targetSpaceId);
                if (hadPendingSync && !hasPendingAfterSync) {
                    setStatus?.("Mise à jour réussie");
                } else {
                    var space = getSpaceById(targetSpaceId);
                    setStatus?.(("Espace " + (space?.name || "") + " récupéré").trim());
                }
            } catch (err) {
                if (typeof isSpaceAuthInvalidError === "function" && isSpaceAuthInvalidError(err)) {
                    const canAttemptOauthRefresh = isManagedOauthSpace?.(targetSpaceId) && typeof shareWorker?.refreshSpaceAuth === "function";
                    if (!attemptedReauth && canAttemptOauthRefresh) {
                        attemptedReauth = true;
                        try {
                            setStatus?.("Session cloud expirée. Reconnexion en cours...");
                            updateSharedSpaceSyncButtonState(targetSpaceId, true);
                            const refreshResult = await shareWorker.refreshSpaceAuth(targetSpaceId);
                            if (refreshResult?.ok) {
                                await syncSpaceFromRemote(targetSpaceId, { refreshExplorer: true });
                                markSpaceLastSynced(targetSpaceId);
                                d.setSpaceSyncError?.(targetSpaceId, "");
                                setStatus?.("Connexion rétablie, espace synchronisé");
                                return;
                            }
                        } catch (reauthErr) {
                            err = reauthErr;
                        }
                    }
                    d.setSpaceSyncError?.(targetSpaceId, String(err?.message || "Authentification espace requise"));
                    setStatus?.("Accès à l'espace cloud invalide. Réauthentifiez puis relancez la synchronisation.", true);
                    return;
                }
                console.error("Space refresh failed", err);
                d.setSpaceSyncError?.(targetSpaceId, String(err?.message || "Erreur Firestore"));
                setStatus?.("Impossible de rafraîchir cet espace", true);
            } finally {
                updateSharedSpaceSyncButtonState(targetSpaceId, false);
            }
        }

        async function backgroundSyncAllCloudDocuments(options) {
            options = options || {};
            if (!shareWorker?.isReady || !shareHistory?.getRecordsByApp) return;
            var announceStatus = Boolean(options.announceStatus);
            var forceSync = Boolean(options.force);
            var skipIfRecentMs = Math.max(0, Number(options.skipIfRecentMs) || 0);
            try {
                var activeDocId = String(getActiveDocumentId?.() || "").trim();
                var isSharedDocActive = activeDocId.indexOf("share:") === 0;
                if (!forceSync && isSharedDocActive) {
                    logSync("cloud-sync:skipped", {
                        reason: "active-shared-document"
                    });
                    return;
                }
                logSync("cloud-sync:start", {
                    force: forceSync,
                    skipIfRecentMs: skipIfRecentMs
                });
                var localRecords = await shareHistory.getRecordsByApp("memo");
                var knownSpaceIds = new Set(getSpaces().map(function (space) { return normalizeSpaceId(space?.id || DEFAULT_SPACE_ID); }));
                (Array.isArray(localRecords) ? localRecords : []).forEach(function (record) {
                    knownSpaceIds.add(normalizeSpaceId(record?.spaceId || DEFAULT_SPACE_ID));
                });
                var targetSpaceIds = Array.from(knownSpaceIds).filter(function (spaceId) {
                    if (forceSync || skipIfRecentMs <= 0) return true;
                    var lastSyncedIso = getSpaceLastSyncedAt(spaceId);
                    var lastSyncedMs = parseIsoMs(lastSyncedIso);
                    if (!lastSyncedMs) return true;
                    return (Date.now() - lastSyncedMs) >= skipIfRecentMs;
                });
                if (!targetSpaceIds.length) {
                    logSync("cloud-sync:skipped", { reason: "no-target-space" });
                    return;
                }

                for (var i = 0; i < targetSpaceIds.length; i++) {
                    var sid = targetSpaceIds[i];
                    logSync("cloud-sync:space-start", { spaceId: sid });
                    updateSharedSpaceSyncButtonState(sid, true);
                    await syncSpaceFromRemote(sid, { refreshExplorer: false });
                    markSpaceLastSynced(sid);
                    updateSharedSpaceSyncButtonState(sid, false);
                    logSync("cloud-sync:space-done", { spaceId: sid });
                }
                var explorer = getMemoExplorer();
                await explorer?.refresh?.({ forceReload: true });
                logSync("cloud-sync:done", { spaces: targetSpaceIds.length });
            } catch (err) {
                console.warn("Background cloud sync failed", err);
                logSync("cloud-sync:error", { message: String(err?.message || err || "") });
                if (announceStatus) {
                    setStatus?.("Impossible de rafraîchir le cloud", true);
                }
            } finally {
                var sharedSections = getSpaces().map(function (space) { return normalizeSpaceId(space?.id || DEFAULT_SPACE_ID); });
                sharedSections.forEach(function (spaceId) { updateSharedSpaceSyncButtonState(spaceId, false); });
            }
        }

        return {
            scheduleSharedMoveSave: scheduleSharedMoveSave,
            scheduleSharedDeleteSave: scheduleSharedDeleteSave,
            scheduleSharedArchiveSave: scheduleSharedArchiveSave,
            queueSharedTreeMoveMetaWrite: queueSharedTreeMoveMetaWrite,
            flushSharedTreeMoveMetaBatch: flushSharedTreeMoveMetaBatch,
            reloadSpaceFromRemote: reloadSpaceFromRemote,
            backgroundSyncAllCloudDocuments: backgroundSyncAllCloudDocuments
        };
    }

    global.GoToolkitSpaceSync = {
        create: createSpaceSyncHelpers
    };
})(window);
