(function (global) {
    function resolveBreadcrumbSpaceLabel(deps, activeDocument) {
        var d = deps || {};
        var doc = activeDocument || null;
        if (!doc || !d.getSpaceById) return "";
        var normalizeSpaceId = typeof d.normalizeSpaceId === "function"
            ? d.normalizeSpaceId
            : function (value) { return String(value || "").trim().toLowerCase(); };
        var defaultSpaceId = normalizeSpaceId(d.defaultSpaceId || "");
        var rawSpaceId = doc.spaceId || doc.payload?.spaceId || "";
        var spaceId = normalizeSpaceId(rawSpaceId);
        if (!spaceId || (defaultSpaceId && spaceId === defaultSpaceId)) return "";
        var space = d.getSpaceById(spaceId);
        var label = String(space?.name || space?.id || spaceId || "").trim();
        return label;
    }

    async function renderDocumentTabs(deps) {
        var d = deps || {};
        var documentBreadcrumbEl = d.documentBreadcrumbEl;
        if (!documentBreadcrumbEl) return;

        var nextRenderToken = typeof d.nextRenderToken === "function" ? d.nextRenderToken : function () { return 0; };
        var getRenderToken = typeof d.getRenderToken === "function" ? d.getRenderToken : function () { return 0; };
        var renderToken = nextRenderToken();

        documentBreadcrumbEl.textContent = "";

        var activeDocumentId = d.activeDocumentId;
        if (!activeDocumentId) {
            await d.renderActiveDocumentHeaderMeta?.();
            return;
        }

        var openDocuments = Array.isArray(d.openDocuments) ? d.openDocuments : [];
        var documentApi = d.documentApi;
        var walker = openDocuments.find(function (doc) { return doc.id === activeDocumentId; }) || null;
        if (!walker && documentApi?.getRecord) {
            walker = await documentApi.getRecord(activeDocumentId);
        }

        var chain = [];
        var seen = new Set();
        while (walker) {
            if (seen.has(walker.id)) break;
            seen.add(walker.id);
            chain.unshift(walker);
            var pid = String(walker.parentId || "").trim();
            if (!pid) {
                walker = null;
            } else {
                walker = openDocuments.find(function (doc) { return doc.id === pid; }) || null;
                if (!walker && documentApi?.getRecord) {
                    walker = await documentApi.getRecord(pid);
                }
            }
        }

        if (!chain.length) {
            var activeDoc = openDocuments.find(function (item) { return item.id === activeDocumentId; });
            if (activeDoc) chain.push(activeDoc);
        }

        if (d.isCloudDocumentId?.(activeDocumentId) && chain.length <= 1) {
            var active = openDocuments.find(function (item) { return item.id === activeDocumentId; }) || chain[0] || null;
            var cloudChain = d.buildCloudBreadcrumbChainFromExplorer?.(activeDocumentId, active) || [];
            if (cloudChain.length > chain.length) {
                chain.length = 0;
                chain.push.apply(chain, cloudChain);
            }
        }

        var activeChainDoc = chain[chain.length - 1]
            || openDocuments.find(function (item) { return item.id === activeDocumentId; })
            || null;
        var spaceLabel = resolveBreadcrumbSpaceLabel(d, activeChainDoc);
        if (spaceLabel) {
            var firstCrumbTitle = String(chain[0]?.title || "").trim().toLowerCase();
            if (firstCrumbTitle !== spaceLabel.trim().toLowerCase()) {
                chain.unshift({
                    id: "",
                    title: spaceLabel,
                    isSpaceCrumb: true
                });
            }
        }

        chain.forEach(function (doc, index) {
            if (renderToken !== getRenderToken()) return;
            var isSpaceCrumb = Boolean(doc?.isSpaceCrumb);
            var crumb = document.createElement(isSpaceCrumb ? "span" : "button");
            var fullTitle = String(doc.title || "Document");
            var isActiveCrumb = index === chain.length - 1;
            crumb.className = "document-breadcrumb__item" + (isActiveCrumb ? " active" : "");
            crumb.textContent = isActiveCrumb ? fullTitle : d.formatMiddleEllipsis(fullTitle, 22);
            crumb.title = fullTitle;
            if (!isSpaceCrumb) {
                crumb.type = "button";
                crumb.addEventListener("click", function () {
                var targetId = String(doc?.id || "").trim();
                var targetSection = String(doc?.section || d.inferSectionFromId(targetId)).trim();
                if (targetId && d.isSharedSection(targetSection) && !targetId.startsWith("share:")) {
                    targetId = "share:" + targetId;
                }
                if (targetId && targetSection === "common" && !targetId.startsWith("common:")) {
                    targetId = "common:" + targetId;
                }
                if (isActiveCrumb) {
                    d.renameDocument?.(targetId || doc.id, doc.title || "", doc.description || "", doc.superpowers || []);
                    return;
                }
                if (!targetId) return;
                d.setActiveDocument?.(targetId);
                });
            }
            documentBreadcrumbEl.appendChild(crumb);
            if (index < chain.length - 1) {
                var sep = document.createElement("span");
                sep.className = "document-breadcrumb__sep";
                sep.textContent = "/";
                documentBreadcrumbEl.appendChild(sep);
            }
        });

        await d.updateCurrentDocumentIconButton?.();
        await d.renderActiveDocumentHeaderMeta?.();
        d.persistOpenDocumentState?.();
        d.updateEmptyState?.();
        d.memoExplorer?.refreshIndicators?.();
        if (global.lucide) global.lucide.createIcons();
    }

    global.GoToolkitDocumentTabs = {
        renderDocumentTabs: renderDocumentTabs
    };
})(window);
