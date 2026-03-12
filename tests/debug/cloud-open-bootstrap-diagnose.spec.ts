import { expect, test } from "@playwright/test";
import { ensureCloudConnectedWithSpaceCode } from "../helpers/cloud-auth";
import { seedCloudMemoDocs } from "../helpers/cloud-state";
import { clickMemoDoc, refreshMemoExplorer } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "../helpers/share-test-space";

const BASE_URL = "http://127.0.0.1:5000";

async function collectCloudOpenSnapshot(page: any, docId = "") {
  return page.evaluate(async (expectedDocId: string) => {
    const w = window as any;
    const explorer = w.GoToolkitMemoDocumentExplorer;
    const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const item = expectedDocId
      ? document.querySelector(`.document-explorer__item[data-document-id="${expectedDocId}"]`)
      : null;
    const editorNodes = Array.from(document.querySelectorAll(".ProseMirror")) as HTMLElement[];
    const visibleEditors = editorNodes.filter(node => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const emptyState = document.getElementById("memoEmptyState");
    const shellCard = document.querySelector(".memo-card") as HTMLElement | null;
    const record = activeId && w.goToolkitDocumentApi?.getRecord
      ? await w.goToolkitDocumentApi.getRecord(activeId).catch(() => null)
      : null;
    const shareRows = await w.goToolkitShareHistory?.getRecordsByApp?.("memo").catch?.(() => []) || [];
    const targetToken = String(expectedDocId || "").replace(/^share:/, "").trim();
    const shareRow = Array.isArray(shareRows)
      ? shareRows.find((row: any) => String(row?.token || "").trim() === targetToken)
      : null;

    return {
      expectedDocId,
      activeDocId: activeId,
      locationPath: String(location.pathname || ""),
      emptyStateHidden: emptyState ? (emptyState as HTMLElement).hidden : null,
      shellCardHidden: shellCard ? shellCard.hidden : null,
      visibleEditors: visibleEditors.length,
      totalEditors: editorNodes.length,
      explorerItems: explorer?.getItemsSnapshot?.()?.length || 0,
      explorerHasExpected: Boolean(item),
      expectedItemText: String((item as HTMLElement | null)?.textContent || "").trim(),
      activeTabId: String(w.__memoState?.activeTabId || ""),
      stateTabs: Array.isArray(w.__memoState?.tabs) ? w.__memoState.tabs.length : 0,
      stateActiveHtmlLength: (() => {
        const state = w.__memoState;
        const tab = Array.isArray(state?.tabs) ? state.tabs.find((entry: any) => String(entry?.id || "") === String(state?.activeTabId || "")) : null;
        return String(tab?.content || "").length;
      })(),
      editorHtmlLength: String(w.GoToolkitMemoInstance?.getValue?.() || "").length,
      localRecordHtmlLength: String(record?.payload?.tabs?.[0]?.content || record?.payload || "").length,
      shareHistoryHtmlLength: String(shareRow?.payload?.tabs?.[0]?.content || "").length,
      memoApis: {
        createAutoDocument: Boolean(w.GoToolkitMemoCreateAutoDocument),
        getActiveDocumentId: Boolean(w.GoToolkitMemoGetActiveDocumentId),
        openDocumentByLink: Boolean(w.GoToolkitMemoOpenDocumentByLink),
        docApi: Boolean(w.goToolkitDocumentApi?.getRecord),
      }
    };
  }, docId);
}

test.describe("Cloud open bootstrap diagnose", () => {
  test("opens one seeded cloud page and logs shell/bootstrap state", async ({ page }) => {
    test.setTimeout(180_000);
    const logStep = createStepLogger("cloud-open-bootstrap");
    attachPageDebugLogging(page, "cloud-open-bootstrap");

    logStep("connect-space:start");
    await ensureCloudConnectedWithSpaceCode(page, BASE_URL);
    logStep("connect-space:done");

    const token = `pw-cloud-open-${Date.now()}`;
    const docId = `share:${token}`;

    logStep("seed:start", { token, docId });
    await seedCloudMemoDocs(page, {
      spaceId: PW_TEST_SPACE_ID,
      spaceCode: PW_TEST_SPACE_CODE,
      docs: [
        {
          token,
          title: `PW Cloud Open ${Date.now()}`,
          content: "<p>PW cloud bootstrap body</p>",
          position: Date.now()
        }
      ]
    });
    await refreshMemoExplorer(page, 30_000);
    logStep("seed:done");

    const beforeOpen = await collectCloudOpenSnapshot(page, docId);
    logStep("snapshot:before-open", beforeOpen);

    await clickMemoDoc(page, docId, { allowProgrammaticOpen: false, waitForContentMatch: false, timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(3_000);

    const afterOpen = await collectCloudOpenSnapshot(page, docId);
    logStep("snapshot:after-open", afterOpen);

    console.log("=== cloud-open-before ===");
    console.log(JSON.stringify(beforeOpen, null, 2));
    console.log("=== cloud-open-after ===");
    console.log(JSON.stringify(afterOpen, null, 2));

    expect(beforeOpen.explorerHasExpected).toBe(true);
    expect(afterOpen.activeDocId || afterOpen.visibleEditors > 0).toBeTruthy();
  });
});
