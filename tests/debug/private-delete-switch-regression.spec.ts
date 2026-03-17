import { expect, test } from "@playwright/test";
import {
  clickMemoDoc,
  deleteActiveMemoDoc,
  getMemoEditorHtml,
  refreshMemoExplorer,
  typeIntoVisibleEditor,
  waitForMemoReady,
} from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

async function getDocSnapshot(page: any, docId: string) {
  return page.evaluate(async (targetId: string) => {
    const normalizedId = String(targetId || "").trim();
    const activeId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const html = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
    const docApi = (window as any).goToolkitDocumentApi;
    const record = normalizedId && docApi?.getRecord ? await docApi.getRecord(normalizedId).catch(() => null) : null;
    const state = (window as any).__memoState || null;
    const activeTabId = String(state?.activeTabId || "");
    const activeTab = Array.isArray(state?.tabs)
      ? state.tabs.find((tab: any) => String(tab?.id || "") === activeTabId) || null
      : null;
    return {
      activeId,
      activeTabId,
      html,
      activeTabContent: String(activeTab?.content || ""),
      recordPayload: record?.payload || null,
      openDocumentsRaw: localStorage.getItem("goToolkit.memo.openDocuments"),
    };
  }, docId);
}

test.describe("Private delete switch regression", () => {
  test("deleting a private page does not blank or duplicate the next page during switches", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("private-delete-switch");

    attachPageDebugLogging(page, "private-delete-switch");

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);

    logStep("seed:start");
    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const makeDoc = async (suffix: string, marker: string) => {
        const id = docApi?.generateId?.() || `${suffix}-${ts}`;
        const tabId = `tab-${id}`;
        await docApi?.upsertRecord?.({
          id,
          app: "memo",
          title: `PW ${suffix} ${ts}`,
          payload: {
            tabs: [{ id: tabId, title: `PW ${suffix} ${ts}`, description: "", superpowers: [], content: `<p>${marker}</p>` }],
            activeTabId: tabId,
          },
          updatedAt: new Date().toISOString(),
        });
        return { id, marker, title: `PW ${suffix} ${ts}` };
      };
      const docs = {
        alpha: await makeDoc("Alpha", `PRIVATE_DELETE_ALPHA_${ts}`),
        beta: await makeDoc("Beta", `PRIVATE_DELETE_BETA_${ts}`),
        gamma: await makeDoc("Gamma", `PRIVATE_DELETE_GAMMA_${ts}`),
      };
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return docs;
    });
    logStep("seed:done", seed);

    await clickMemoDoc(page, seed.alpha.id, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, `\n${seed.alpha.marker}_EDIT`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(`${seed.alpha.marker}_EDIT`);

    logStep("delete-alpha:start");
    page.once("dialog", dialog => dialog.accept());
    await deleteActiveMemoDoc(page, { expectedDocId: seed.alpha.id });
    await refreshMemoExplorer(page, 15_000);
    logStep("delete-alpha:done", await getDocSnapshot(page, seed.beta.id));

    await expect.poll(async () => {
      const snapshot = await getDocSnapshot(page, seed.beta.id);
      return {
        activeId: snapshot.activeId,
        openDocumentsRaw: snapshot.openDocumentsRaw,
      };
    }, { timeout: 20_000 }).toMatchObject({
      activeId: "",
      openDocumentsRaw: JSON.stringify({ openDocumentIds: [], activeDocumentId: null }),
    });

    await clickMemoDoc(page, seed.beta.id, { allowProgrammaticOpen: false, waitForContentMatch: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.beta.marker);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.alpha.marker);

    for (let index = 0; index < 3; index += 1) {
      logStep(`switch-cycle-${index}:beta-to-gamma:start`);
      await clickMemoDoc(page, seed.gamma.id, { allowProgrammaticOpen: false });
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.gamma.marker);
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.beta.marker);
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.alpha.marker);

      logStep(`switch-cycle-${index}:gamma-to-beta:start`);
      await clickMemoDoc(page, seed.beta.id, { allowProgrammaticOpen: false });
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.beta.marker);
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.gamma.marker);
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.alpha.marker);

      const betaSnapshot = await getDocSnapshot(page, seed.beta.id);
      logStep(`switch-cycle-${index}:beta-snapshot`, {
        activeId: betaSnapshot.activeId,
        htmlLength: String(betaSnapshot.html || "").length,
        recordJsonLength: JSON.stringify(betaSnapshot.recordPayload || {}).length,
      });
      expect(String(betaSnapshot.activeTabContent || "")).toContain(seed.beta.marker);
      expect(JSON.stringify(betaSnapshot.recordPayload || {})).toContain(seed.beta.marker);
      expect(JSON.stringify(betaSnapshot.recordPayload || {})).not.toContain(seed.alpha.marker);
    }
  });
});
