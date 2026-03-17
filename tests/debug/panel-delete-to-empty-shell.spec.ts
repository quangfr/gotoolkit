import { expect, test } from "@playwright/test";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";
import { clickMemoDoc, refreshMemoExplorer, waitForMemoReady } from "../helpers/memo-ui";

test("document panel delete returns to empty shell like close page", async ({ page }) => {
  test.setTimeout(90_000);
  const baseUrl = "http://127.0.0.1:5000";
  const logStep = createStepLogger("panel-delete-empty-shell");
  attachPageDebugLogging(page, "panel-delete-empty-shell");

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "load", timeout: 20_000 });
  await waitForMemoReady(page, 30_000);

  const docId = await page.evaluate(async () => {
    localStorage.removeItem("goToolkit.memo.openDocuments");
    const docApi = (window as any).goToolkitDocumentApi;
    const id = docApi?.generateId?.() || `panel-delete-${Date.now()}`;
    const tabId = `tab-${id}`;
    await docApi?.upsertRecord?.({
      id,
      app: "memo",
      title: "Panel delete doc",
      payload: {
        tabs: [{ id: tabId, title: "Panel delete doc", content: "<p>panel delete me</p>" }],
        activeTabId: tabId,
      },
      updatedAt: new Date().toISOString(),
    });
    await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    return id;
  });

  await refreshMemoExplorer(page, 15_000);
  await clickMemoDoc(page, docId, { allowProgrammaticOpen: false, waitForContentMatch: false });

  const deleteBtn = page.locator(`.document-explorer__item[data-document-id="${docId}"] .document-explorer__delete`).first();
  await expect(deleteBtn).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await deleteBtn.click();
  await page.waitForFunction(expectedId => {
    const activeId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
    const memoCard = document.querySelector(".memo-card") as HTMLElement | null;
    const emptyState = document.getElementById("memoEmptyState") as HTMLElement | null;
    return activeId !== String(expectedId || "")
      && (!!memoCard ? window.getComputedStyle(memoCard).display === "none" : true)
      && (!!emptyState ? emptyState.hidden === false : false);
  }, docId, { timeout: 10_000 });

  const after = await page.evaluate(async (openedId) => {
    const memoCard = document.querySelector(".memo-card") as HTMLElement | null;
    const emptyState = document.getElementById("memoEmptyState") as HTMLElement | null;
    const breadcrumb = document.getElementById("breadcrumb") as HTMLElement | null;
    const explorer = (window as any).GoToolkitMemoDocumentExplorer;
    const items = explorer?.getItemsSnapshot?.() || [];
    const docApi = (window as any).goToolkitDocumentApi;
    const record = await docApi?.getRecord?.(openedId);
    return {
      activeId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      memoCardDisplay: memoCard ? window.getComputedStyle(memoCard).display : null,
      emptyStateHidden: emptyState ? emptyState.hidden : null,
      breadcrumbDisplay: breadcrumb ? window.getComputedStyle(breadcrumb).display : null,
      explorerStillHasDoc: items.some((item: any) => String(item?.id || "") === String(openedId || "")),
      recordStillExists: Boolean(record),
      openDocsRaw: localStorage.getItem("goToolkit.memo.openDocuments"),
    };
  }, docId);

  logStep("after-panel-delete", after);

  expect(after.activeId).toBe("");
  expect(after.memoCardDisplay).toBe("none");
  expect(after.emptyStateHidden).toBe(false);
  expect(after.breadcrumbDisplay).toBe("none");
  expect(after.explorerStillHasDoc).toBe(false);
  expect(after.recordStillExists).toBe(false);
});
