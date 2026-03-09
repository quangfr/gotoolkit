import { Page } from "@playwright/test";

export type CloudSeedDoc = {
  token: string;
  title: string;
  content: string;
  position?: number;
  parentId?: string;
  icon?: string;
};

export async function seedCloudMemoDocs(
  page: Page,
  options: { spaceId: string; spaceCode: string; docs: CloudSeedDoc[] }
) {
  return page.evaluate(async ({ spaceId, spaceCode, docs }) => {
    const worker = (window as any).goToolkitShareWorker;
    const history = (window as any).goToolkitShareHistory;
    const spaces = (window as any).GoToolkitSpaces;
    spaces?.upsertSpace?.({
      id: spaceId,
      name: String(spaceId || "").toUpperCase(),
      icon: "cloud-upload",
      spaceJoinCode: spaceCode,
      isDefault: true
    });
    const created: string[] = [];
    for (const doc of Array.isArray(docs) ? docs : []) {
      const token = String(doc?.token || "").trim();
      if (!token) continue;
      const position = Number.isFinite(Number(doc?.position)) ? Number(doc.position) : Date.now();
      const title = String(doc?.title || "Document partagé").trim() || "Document partagé";
      const parentId = String(doc?.parentId || "").trim();
      const icon = String(doc?.icon || "file-symlink").trim() || "file-symlink";
      const payload = {
        tabs: [{
          id: `tab-${token}`,
          title,
          description: "",
          superpowers: [],
          content: String(doc?.content || "")
        }],
        activeTabId: `tab-${token}`,
        parentId,
        spaceId,
        status: "active",
        position
      };
      const meta = {
        title,
        description: "",
        superpowers: [],
        icon,
        parentId,
        spaceId,
        position,
        status: "active"
      };
      const savedMeta = await worker.saveSharePayload("pages-meta", token, meta);
      await worker.saveSharePayload("pages", token, payload);
      await history.upsertRecord("memo", {
        token,
        title,
        description: "",
        superpowers: [],
        payload,
        icon,
        parentId,
        spaceId,
        position,
        updatedAt: String(savedMeta?.updatedAt || new Date().toISOString())
      });
      created.push(token);
    }
    await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    return created;
  }, options);
}

export async function readCloudMemoRemoteState(
  page: Page,
  options: { token: string; spaceId: string }
) {
  return page.evaluate(async ({ token, spaceId }) => {
    const worker = (window as any).goToolkitShareWorker;
    const meta = await worker?.fetchSharePayload?.("pages-meta", token, { spaceId }).catch?.(() => null);
    const content = await worker?.fetchSharePayload?.("pages", token, { spaceId }).catch?.(() => null);
    const history = await worker?.fetchSharePayload?.("pages-history", token, { spaceId }).catch?.(() => null);
    return {
      meta,
      content,
      history,
      metaStatus: String(meta?.payload?.status || "").trim().toLowerCase(),
      contentHtml: String(content?.payload?.tabs?.[0]?.content || ""),
      historyVersions: Array.isArray(history?.payload?.versions) ? history.payload.versions.length : 0
    };
  }, options);
}

export async function readCloudMemoLocalState(page: Page, docId: string) {
  return page.evaluate(async currentDocId => {
    const token = String(currentDocId || "").replace(/^share:/, "").trim();
    const history = (window as any).goToolkitShareHistory;
    const drafts = (window as any).goToolkitCloudDrafts;
    const historyRows = await history?.getRecordsByApp?.("memo").catch?.(() => []) || [];
    const historyRow = Array.isArray(historyRows)
      ? historyRows.find((row: any) => String(row?.token || "") === token)
      : null;
    const allDrafts = await drafts?.readAll?.().catch?.(() => ({})) || {};
    const draft = allDrafts?.[currentDocId] || null;
    return {
      activeDocId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      editorHtml: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
      historyHtml: String(historyRow?.payload?.tabs?.[0]?.content || ""),
      draftHtml: String(draft?.payload?.tabs?.[0]?.content || ""),
      draftOpType: String(draft?.opType || "")
    };
  }, docId);
}
