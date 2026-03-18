import { expect, test } from "@playwright/test";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test("root url ignores stale open-document state and stays on empty shell", async ({ page }) => {
  test.setTimeout(90_000);
  const baseUrl = "http://127.0.0.1:5000";
  const logStep = createStepLogger("root-empty-shell-stale-open-docs");
  attachPageDebugLogging(page, "root-empty-shell-stale-open-docs");

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "load", timeout: 20_000 });

  const seeded = await page.evaluate(async () => {
    const docApi = (window as any).goToolkitDocumentApi;
    const id = docApi?.generateId?.() || `root-stale-${Date.now()}`;
    const tabId = `tab-${id}`;
    await docApi?.upsertRecord?.({
      id,
      app: "memo",
      title: "Stale root doc",
      payload: {
        tabs: [{ id: tabId, title: "Stale root doc", content: "<p>stale content</p>" }],
        activeTabId: tabId,
      },
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem("goToolkit.memo.openDocuments", JSON.stringify({
      openDocumentIds: [id],
      activeDocumentId: id,
      activeDocumentBackup: {
        id,
        title: "Stale root doc",
        description: "",
        superpowers: [],
        updatedAt: new Date().toISOString(),
        payload: {
          tabs: [{ id: tabId, title: "Stale root doc", content: "<p>stale content</p>" }],
          activeTabId: tabId,
        },
      },
    }));
    return { id, tabId };
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForTimeout(1500);

  const diagnostics = await page.evaluate(() => {
    const memoCards = Array.from(document.querySelectorAll(".memo-card")) as HTMLElement[];
    const visibleMemoCard = memoCards.find((el) => window.getComputedStyle(el).display !== "none") || null;
    const breadcrumb = document.getElementById("breadcrumb") as HTMLElement | null;
    const emptyState = document.getElementById("memoEmptyState") as HTMLElement | null;
    const stored = localStorage.getItem("goToolkit.memo.openDocuments");
    return {
      pathname: window.location.pathname,
      href: window.location.href,
      activeId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      openDocIds: Array.isArray((window as any).GoToolkitMemoDocumentExplorer?.getItemsSnapshot?.())
        ? ((window as any).GoToolkitMemoDocumentExplorer.getItemsSnapshot() || [])
            .filter((item: any) => item && item.app === "memo")
            .map((item: any) => String(item.id || ""))
        : [],
      visibleMemoCardClassName: visibleMemoCard ? visibleMemoCard.className : null,
      breadcrumbDisplay: breadcrumb ? window.getComputedStyle(breadcrumb).display : null,
      emptyStateHidden: emptyState ? emptyState.hidden : null,
      storedOpenDocs: stored ? JSON.parse(stored) : null,
    };
  });

  logStep("diagnostics", { seeded, diagnostics });

  expect(diagnostics.pathname).toBe("/");
  expect(diagnostics.activeId).toBe("");
  expect(diagnostics.visibleMemoCardClassName).toBe(null);
  expect(diagnostics.breadcrumbDisplay).toBe("none");
  expect(diagnostics.emptyStateHidden).toBe(false);
  expect(Array.isArray(diagnostics.storedOpenDocs?.openDocumentIds)).toBe(true);
  expect(diagnostics.storedOpenDocs?.openDocumentIds).toHaveLength(0);
  expect(diagnostics.storedOpenDocs?.activeDocumentId).toBe(null);
});
