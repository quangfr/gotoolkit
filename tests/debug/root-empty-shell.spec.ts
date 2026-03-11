import { expect, test } from "@playwright/test";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test("root url stays on empty shell without showing memo card", async ({ page }) => {
  test.setTimeout(90_000);
  const baseUrl = "http://127.0.0.1:5000";
  const logStep = createStepLogger("root-empty-shell");
  attachPageDebugLogging(page, "root-empty-shell");

  await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });

  await page.evaluate(async () => {
    localStorage.removeItem("goToolkit.memo.openDocuments");
    const docApi = (window as any).goToolkitDocumentApi;
    const id = docApi?.generateId?.() || `root-debug-${Date.now()}`;
    await docApi?.upsertRecord?.({
      id,
      app: "memo",
      title: `Root debug ${Date.now()}`,
      payload: {
        tabs: [{ id: `tab-${id}`, title: "Root debug", content: "<p>seed</p>" }],
        activeTabId: `tab-${id}`,
      },
      updatedAt: new Date().toISOString(),
    });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForTimeout(1500);

  const diagnostics = await page.evaluate(() => {
    const memoCards = Array.from(document.querySelectorAll(".memo-card")) as HTMLElement[];
    const memoCard = memoCards[0] || null;
    const breadcrumb = document.getElementById("breadcrumb") as HTMLElement | null;
    const emptyState = document.getElementById("memoEmptyState") as HTMLElement | null;
    const sw = navigator.serviceWorker;
    return {
      pathname: window.location.pathname,
      href: window.location.href,
      activeId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      openDocIds: Array.isArray((window as any).GoToolkitMemoDocumentExplorer?.getItemsSnapshot?.())
        ? ((window as any).GoToolkitMemoDocumentExplorer.getItemsSnapshot() || [])
            .filter((item: any) => item && item.app === "memo")
            .map((item: any) => String(item.id || ""))
        : [],
      memoCardDisplay: memoCard ? window.getComputedStyle(memoCard).display : null,
      memoCardInlineDisplay: memoCard ? memoCard.style.display : null,
      memoCardHidden: memoCard ? memoCard.hidden : null,
      memoCards: memoCards.map((el) => ({
        id: el.id || "",
        className: el.className,
        computedDisplay: window.getComputedStyle(el).display,
        inlineDisplay: el.style.display,
        hidden: el.hidden,
      })),
      breadcrumbDisplay: breadcrumb ? window.getComputedStyle(breadcrumb).display : null,
      emptyStateExists: Boolean(emptyState),
      emptyStateHidden: emptyState ? emptyState.hidden : null,
      serviceWorkerControlled: Boolean(sw?.controller),
      serviceWorkerScript: sw?.controller?.scriptURL || "",
    };
  });

  logStep("diagnostics", diagnostics);
  await page.screenshot({ path: "tests/results/root-empty-shell.png", fullPage: true });

  expect(diagnostics.activeId).toBe("");
  expect(diagnostics.memoCardDisplay).toBe("none");
  expect(diagnostics.breadcrumbDisplay).toBe("none");
});
