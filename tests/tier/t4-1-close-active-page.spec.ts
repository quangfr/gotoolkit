import { expect, test } from "@playwright/test";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test("close active page button returns to empty shell and stays visually plain", async ({ page }) => {
  test.setTimeout(90_000);
  const baseUrl = "http://127.0.0.1:5000";
  const logStep = createStepLogger("close-active-page");
  attachPageDebugLogging(page, "close-active-page");

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "load", timeout: 20_000 });

  const docId = await page.evaluate(async () => {
    localStorage.removeItem("goToolkit.memo.openDocuments");
    const docApi = (window as any).goToolkitDocumentApi;
    const id = docApi?.generateId?.() || `close-debug-${Date.now()}`;
    const tabId = `tab-${id}`;
    await docApi?.upsertRecord?.({
      id,
      app: "memo",
      title: "Close debug doc",
      payload: {
        tabs: [{ id: tabId, title: "Close debug doc", content: "<p>close me</p>" }],
        activeTabId: tabId,
      },
      updatedAt: new Date().toISOString(),
    });
    await (window as any).GoToolkitMemoOpenDocumentByLink?.(id);
    return id;
  });

  await page.waitForFunction(() => {
    return String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim().length > 0;
  });

  const closeBtn = page.locator("#closeActivePageBtn");
  await expect(closeBtn).toBeVisible();

  const before = await page.evaluate(() => {
    const btn = document.getElementById("closeActivePageBtn") as HTMLElement | null;
    const memoCard = document.querySelector(".memo-card") as HTMLElement | null;
    const emptyState = document.getElementById("memoEmptyState") as HTMLElement | null;
    if (!btn) return null;
    const style = window.getComputedStyle(btn);
    return {
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      borderTopStyle: style.borderTopStyle,
      borderTopColor: style.borderTopColor,
      boxShadow: style.boxShadow,
      memoCardDisplay: memoCard ? window.getComputedStyle(memoCard).display : null,
      emptyStateHidden: emptyState ? emptyState.hidden : null,
    };
  });

  logStep("before-close", before);

  await closeBtn.click();
  await page.waitForTimeout(600);

  const after = await page.evaluate(async (openedId) => {
    const btn = document.getElementById("closeActivePageBtn") as HTMLElement | null;
    const memoCard = document.querySelector(".memo-card") as HTMLElement | null;
    const emptyState = document.getElementById("memoEmptyState") as HTMLElement | null;
    const breadcrumb = document.getElementById("breadcrumb") as HTMLElement | null;
    const docApi = (window as any).goToolkitDocumentApi;
    const record = await docApi?.getRecord?.(openedId);
    const style = btn ? window.getComputedStyle(btn) : null;
    return {
      activeId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      memoCardDisplay: memoCard ? window.getComputedStyle(memoCard).display : null,
      memoCardHidden: memoCard ? memoCard.hidden : null,
      emptyStateHidden: emptyState ? emptyState.hidden : null,
      breadcrumbDisplay: breadcrumb ? window.getComputedStyle(breadcrumb).display : null,
      closeBtnDisplay: btn ? window.getComputedStyle(btn).display : null,
      backgroundColor: style?.backgroundColor || null,
      borderTopWidth: style?.borderTopWidth || null,
      borderTopStyle: style?.borderTopStyle || null,
      borderTopColor: style?.borderTopColor || null,
      boxShadow: style?.boxShadow || null,
      persistedTitle: String(record?.title || ""),
    };
  }, docId);

  logStep("after-close", after);
  await page.screenshot({ path: "tests/results/close-active-page.png", fullPage: true });

  expect(before?.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(before?.borderTopWidth).toBe("0px");
  expect(after.activeId).toBe("");
  expect(after.memoCardDisplay).toBe("none");
  expect(after.emptyStateHidden).toBe(false);
  expect(after.breadcrumbDisplay).toBe("none");
  expect(after.closeBtnDisplay).toBe("none");
  expect(after.persistedTitle).toBe("Close debug doc");
});
