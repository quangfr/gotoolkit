import { expect, test } from "@playwright/test";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, typeIntoVisibleEditor, waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

async function collectPrivateDocSnapshot(page: any, docId: string) {
  return page.evaluate(async currentDocId => {
    const w = window as any;
    const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const html = String(w.MemoEditor?.getHTML?.() || w.memoEditor?.getHTML?.() || w.GoToolkitMemoInstance?.getValue?.() || "");
    const docApi = w.goToolkitDocumentApi;
    const record = currentDocId && docApi?.getRecord ? await docApi.getRecord(currentDocId).catch(() => null) : null;
    const recordHtml = String(record?.payload?.tabs?.[0]?.content || record?.payload || "");
    const openDocsRaw = localStorage.getItem("goToolkit.memo.openDocuments");
    return {
      activeId,
      html,
      recordHtml,
      openDocsRaw,
    };
  }, docId);
}

test.describe("Private immediate reload persistence", () => {
  test("keeps active private page content after an immediate reload right after editing", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("private-immediate-reload");

    attachPageDebugLogging(page, "private-immediate-reload");

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    logStep("memo-ready");

    logStep("seed:start");
    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const docId = docApi?.generateId?.() || `private-immediate-${ts}`;
      const baseToken = `PRIVATE_IMMEDIATE_BASE_${ts}`;
      const editToken = `PRIVATE_IMMEDIATE_EDIT_${ts}`;
      await docApi?.upsertRecord?.({
        id: docId,
        app: "memo",
        title: `PW Immediate Reload ${ts}`,
        payload: {
          tabs: [{
            id: `tab-${docId}`,
            title: `PW Immediate Reload ${ts}`,
            description: "",
            superpowers: [],
            content: `<p>${baseToken}</p>`
          }],
          activeTabId: `tab-${docId}`
        },
        updatedAt: new Date().toISOString()
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return { docId, baseToken, editToken };
    });
    logStep("seed:done", seed);

    logStep("edit:start");
    await clickMemoDoc(page, seed.docId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.baseToken);
    await typeIntoVisibleEditor(page, ` ${seed.editToken}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.editToken);
    logStep("edit:done");

    logStep("reload:start");
    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);
    logStep("reload:done");

    logStep("reopen:start");
    await clickMemoDoc(page, seed.docId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.baseToken);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.editToken);
    const snapshot = await collectPrivateDocSnapshot(page, seed.docId);
    expect(String(snapshot.activeId || "")).toBe(seed.docId);
    expect(String(snapshot.html || "")).toContain(seed.baseToken);
    expect(String(snapshot.html || "")).toContain(seed.editToken);
    expect(String(snapshot.recordHtml || "")).toContain(seed.baseToken);
    expect(String(snapshot.recordHtml || "")).toContain(seed.editToken);
    expect(String(snapshot.openDocsRaw || "")).toContain(seed.docId);
    logStep("reopen:done", {
      activeId: snapshot.activeId,
      htmlLength: String(snapshot.html || "").length,
      recordHtmlLength: String(snapshot.recordHtml || "").length,
      openDocsRaw: snapshot.openDocsRaw,
    });
  });
});
