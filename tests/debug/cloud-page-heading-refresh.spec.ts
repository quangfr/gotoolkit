import { expect, test } from "@playwright/test";
import { ensureCloudConnectedWithSpaceCode, reloadIndex } from "../helpers/cloud-auth";
import { clickMemoDoc, refreshMemoExplorer } from "../helpers/memo-ui";
import { GOLIVE_SPACE_CODE, GOLIVE_SPACE_ID } from "../helpers/share-test-space";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 180_000;
const PAGE_TOKEN = "b3f41e62-9b09-4b35-8b70-21179ebfcaf3";
const DOC_ID = `share:${PAGE_TOKEN}`;

type VisibleHeadingsSnapshot = {
  h1: string[];
  h2: string[];
  h3: string[];
};

async function collectCloudHeadingSnapshot(page: any) {
  return page.evaluate(async ({ token, docId, spaceId }) => {
    const w = window as any;
    const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const record = activeId ? await w.goToolkitDocumentApi?.getRecord?.(activeId).catch(() => null) : null;
    const shareRows = await w.goToolkitShareHistory?.getRecordsByApp?.("memo").catch?.(() => []) || [];
    const shareRow = Array.isArray(shareRows)
      ? shareRows.find((row: any) => String(row?.token || "").trim() === String(token || "").trim())
      : null;
    const remotePage = await w.goToolkitShareWorker?.fetchSharePayload?.("pages", token, { spaceId }).catch?.(() => null);
    const root = document.querySelector(".editor-wrap .ProseMirror");
    const collect = (selector: string) => Array.from((root || document).querySelectorAll?.(selector) || [])
      .map((el: any) => String(el.textContent || "").trim())
      .filter(Boolean);

    return {
      activeDocId: activeId,
      pathname: String(location.pathname || ""),
      stateActiveTabId: String(w.__memoState?.activeTabId || ""),
      editorHtmlLength: String(w.GoToolkitMemoInstance?.getValue?.() || "").length,
      localRecordHtmlLength: String(record?.payload?.tabs?.[0]?.content || record?.payload || "").length,
      shareHistoryHtmlLength: String(shareRow?.payload?.tabs?.[0]?.content || "").length,
      remoteHtmlLength: String(remotePage?.payload?.tabs?.[0]?.content || remotePage?.payload || "").length,
      spaceAccessOverlayOpen: Boolean(document.querySelector("#spaceAccessOverlay.open")),
      connectionModalOpen: Boolean(document.querySelector("#memoConnectionModal.open")),
      visibleHeadings: {
        h1: collect("h1"),
        h2: collect("h2"),
        h3: collect("h3"),
      },
    };
  }, { token: PAGE_TOKEN, docId: DOC_ID, spaceId: GOLIVE_SPACE_ID });
}

test.describe("Cloud page heading refresh", () => {
  test("keeps visible headings after refresh for the target cloud page", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });

    await ensureCloudConnectedWithSpaceCode(page, BASE_URL, {
      spaceId: GOLIVE_SPACE_ID,
      spaceCode: GOLIVE_SPACE_CODE,
    });
    await refreshMemoExplorer(page, 30_000);

    await page.goto(`${BASE_URL}/${PAGE_TOKEN}`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(5_000);

    await page.waitForFunction(expectedId => {
      const w = window as any;
      return String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim() === String(expectedId || "").trim();
    }, DOC_ID, { timeout: 30_000 }).catch(() => null);

    let beforeRefresh = await collectCloudHeadingSnapshot(page);

    if (beforeRefresh.activeDocId !== DOC_ID) {
      await clickMemoDoc(page, DOC_ID, {
        allowProgrammaticOpen: true,
        timeout: 30_000,
        waitForContentMatch: false,
      }).catch(() => null);
      await page.waitForTimeout(3_000);
      beforeRefresh = await collectCloudHeadingSnapshot(page);
    }

    await reloadIndex(page, BASE_URL);
    await page.goto(`${BASE_URL}/${PAGE_TOKEN}`, { waitUntil: "load", timeout: 30_000 }).catch(() => null);
    await page.waitForFunction(expectedId => {
      const w = window as any;
      return String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim() === String(expectedId || "").trim();
    }, DOC_ID, { timeout: 60_000 }).catch(() => null);
    await page.waitForTimeout(5_000);

    const afterRefresh = await collectCloudHeadingSnapshot(page);

    console.log("=== cloud-page-heading-before ===");
    console.log(JSON.stringify(beforeRefresh, null, 2));
    console.log("=== cloud-page-heading-after ===");
    console.log(JSON.stringify(afterRefresh, null, 2));

    expect(beforeRefresh.activeDocId).toBe(DOC_ID);
    expect(beforeRefresh.remoteHtmlLength).toBeGreaterThan(0);
    expect(beforeRefresh.visibleHeadings.h1.length + beforeRefresh.visibleHeadings.h2.length + beforeRefresh.visibleHeadings.h3.length).toBeGreaterThan(0);
    expect(afterRefresh.visibleHeadings).toEqual(beforeRefresh.visibleHeadings);
  });
});
