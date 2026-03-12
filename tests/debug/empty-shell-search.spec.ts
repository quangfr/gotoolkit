import { expect, test } from "@playwright/test";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";

async function seedDocs(page: any) {
  return page.evaluate(async () => {
    localStorage.removeItem("goToolkit.memo.openDocuments");
    localStorage.removeItem("goToolkit.memo.recentDocuments");
    const docApi = (window as any).goToolkitDocumentApi;
    if (!docApi?.upsertRecord) throw new Error("document api unavailable");
    const docs = [
      {
        id: docApi.generateId?.() || `seed-a-${Date.now()}`,
        app: "memo",
        title: "Recherche Alpha",
        payload: {
          tabs: [{ id: "tab-a", title: "Recherche Alpha", content: "<p>alpha keyword unique</p>" }],
          activeTabId: "tab-a",
        },
        updatedAt: new Date().toISOString(),
      },
      {
        id: docApi.generateId?.() || `seed-b-${Date.now() + 1}`,
        app: "memo",
        title: "Recherche Beta",
        payload: {
          tabs: [{ id: "tab-b", title: "Recherche Beta", content: "<p>beta keyword unique</p>" }],
          activeTabId: "tab-b",
        },
        updatedAt: new Date().toISOString(),
      },
    ];
    for (const doc of docs) {
      await docApi.upsertRecord(doc);
    }
    return docs.map((doc) => doc.id);
  });
}

async function captureSearchState(page: any) {
  return page.evaluate(() => {
    const app = document.getElementById("app") as HTMLElement | null;
    const shell = document.getElementById("memoEmptyState") as HTMLElement | null;
    const card = document.getElementById("memoSearchCard") as HTMLElement | null;
    const appRect = app?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    const shellStyle = shell ? window.getComputedStyle(shell) : null;
    const cardStyle = card ? window.getComputedStyle(card) : null;
    return {
      pathname: window.location.pathname,
      href: window.location.href,
      bodySearchMode: document.body.classList.contains("memo-search-mode"),
      activeId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      shellExists: Boolean(shell),
      shellHidden: shell ? shell.hidden : null,
      shellDisplay: shellStyle?.display || null,
      cardExists: Boolean(card),
      cardHidden: card ? card.hidden : null,
      cardDisplay: cardStyle?.display || null,
      resultCount: document.querySelectorAll("#memoSearchResults .memo-search-result").length,
      appWidth: appRect?.width || 0,
      appHeight: appRect?.height || 0,
      cardWidth: cardRect?.width || 0,
      cardHeight: cardRect?.height || 0,
    };
  });
}

test.describe("Empty shell search", () => {
  test("document-panel and empty-panel search both replace the shell with full search card", async ({ page }) => {
    test.setTimeout(120_000);
    const logStep = createStepLogger("empty-shell-search");
    attachPageDebugLogging(page, "empty-shell-search");

    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi), null, { timeout: 60_000 });
    await seedDocs(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => {
      const shell = document.getElementById("memoEmptyState");
      return Boolean(shell && !shell.hidden);
    }, null, { timeout: 30_000 });

    const explorerSearch = page.locator("#documentExplorer .document-explorer__search-input").first();
    await expect(explorerSearch).toBeVisible({ timeout: 30_000 });
    await explorerSearch.fill("Alpha");
    await explorerSearch.press("Enter");

    await expect.poll(async () => {
      const state = await captureSearchState(page);
      return {
        bodySearchMode: state.bodySearchMode,
        shellVisible: state.shellExists && !state.shellHidden && state.shellDisplay !== "none",
        cardHidden: state.cardHidden,
      };
    }, { timeout: 30_000 }).toMatchObject({
      bodySearchMode: true,
      shellVisible: false,
      cardHidden: false,
    });

    const panelSearchState = await captureSearchState(page);
    logStep("panel-search-state", panelSearchState);
    expect(panelSearchState.activeId).toBe("");
    expect(panelSearchState.cardWidth).toBeGreaterThan(panelSearchState.appWidth * 0.9);
    expect(panelSearchState.cardHeight).toBeGreaterThan(panelSearchState.appHeight * 0.9);

    await page.goto(`${BASE_URL}/`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => {
      const shell = document.getElementById("memoEmptyState");
      return Boolean(shell && !shell.hidden);
    }, null, { timeout: 30_000 });

    const emptySearch = page.locator("#memoEmptyStateSearchInput");
    await expect(emptySearch).toBeVisible({ timeout: 30_000 });
    await emptySearch.fill("Beta");
    await emptySearch.press("Enter");

    await expect.poll(async () => {
      const state = await captureSearchState(page);
      return {
        bodySearchMode: state.bodySearchMode,
        shellVisible: state.shellExists && !state.shellHidden && state.shellDisplay !== "none",
        cardHidden: state.cardHidden,
      };
    }, { timeout: 30_000 }).toMatchObject({
      bodySearchMode: true,
      shellVisible: false,
      cardHidden: false,
    });

    const emptyPanelSearchState = await captureSearchState(page);
    logStep("empty-panel-search-state", emptyPanelSearchState);
    expect(emptyPanelSearchState.resultCount).toBeGreaterThan(0);
    expect(emptyPanelSearchState.activeId).toBe("");
    expect(emptyPanelSearchState.cardWidth).toBeGreaterThan(emptyPanelSearchState.appWidth * 0.9);
    expect(emptyPanelSearchState.cardHeight).toBeGreaterThan(emptyPanelSearchState.appHeight * 0.9);
    expect(emptyPanelSearchState.pathname).toBe("/");

    await page.screenshot({ path: "tests/results/empty-shell-search-results.png", fullPage: true });
  });
});
