import { expect, test } from "@playwright/test";
import path from "node:path";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const TEST_TIMEOUT = 180_000;
const SAMPLE_MARKDOWN_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const DEBUG_PREFIX = "[MemoRefreshDebug]";
const EXPECTED_VISIBLE_H2S = [
  "Spécifications fonctionnelles",
  "Spécifications techniques",
  "Cas limite",
  "Diagramme des flux",
  "Diagramme de séquence",
  "Diagramme d'objet",
  "Diagramme de structure",
  "Requêtes API",
];

type RefreshDebugEvent = {
  event: string;
  payload: Record<string, unknown>;
};

async function waitForMemoBootstrap(page: any, timeout = 60_000) {
  await page.waitForFunction(() => Boolean(
    (window as any).GoToolkitMemoCreateAutoDocument
    && (window as any).GoToolkitMemoInstance
  ), { timeout });
}

async function ensureAssist(page: any) {
  await page.evaluate(async () => {
    const w = window as any;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (w.GoToolkitAssistInstance?.openImportFileSelector) return;
      if (w.GoToolkitAssist?.mount && !w.GoToolkitAssistInstance) {
        const chatRoot = document.getElementById("chat-root");
        if (chatRoot) {
          const instance = w.GoToolkitAssist.mount(chatRoot);
          w.GoToolkitAssistInstance = instance;
          try {
            instance?.close?.();
          } catch {
            // ignore
          }
          if (w.GoToolkitAssistInstance?.openImportFileSelector) return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("GoToolkitAssistInstance.openImportFileSelector unavailable");
  });
}

async function collectSnapshot(page: any, activeDocId = "") {
  return page.evaluate(async (docId: string) => {
    const w = window as any;
    const activeId = String(docId || w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const record = activeId ? await w.goToolkitDocumentApi?.getRecord?.(activeId).catch(() => null) : null;
    const state = w.__memoState || {};
    const liveRoot = document.querySelector(".editor-wrap .ProseMirror");
    const editorHtml = String(w.GoToolkitMemoInstance?.getValue?.() || "");
    const stateHtml = String(state?.tabs?.[0]?.content || "");
    const recordHtml = String(record?.payload?.tabs?.[0]?.content || record?.payload || "");
    return {
      activeDocId: activeId,
      stateActiveTabId: String(state?.activeTabId || ""),
      mermaidWrappers: document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length,
      stateHtmlLength: stateHtml.length,
      recordHtmlLength: recordHtml.length,
      editorHtmlLength: editorHtml.length,
      stateHasTableaux: stateHtml.includes("Tableaux des définitions"),
      stateHasRequetes: stateHtml.includes("Requêtes API"),
      editorHasTableaux: editorHtml.includes("Tableaux des définitions"),
      editorHasRequetes: editorHtml.includes("Requêtes API"),
      recordHasTableaux: recordHtml.includes("Tableaux des définitions"),
      recordHasRequetes: recordHtml.includes("Requêtes API"),
      visibleHeadings: Array.from((liveRoot || document).querySelectorAll?.("h2") || []).map((el: any) => String(el.textContent || "").trim()),
    };
  }, activeDocId);
}

test.describe("Debug sample refresh heading diagnosis", () => {
  test("captures IndexedDB/state/editor/visible heading snapshots through refresh", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    const refreshEvents: RefreshDebugEvent[] = [];
    page.on("console", msg => {
      const text = msg.text();
      if (!text.includes(DEBUG_PREFIX)) return;
      const match = text.match(/\[MemoRefreshDebug\]\s+([^\s]+)\s+(.*)$/);
      if (!match) {
        refreshEvents.push({ event: "unparsed", payload: { raw: text } });
        return;
      }
      const [, event, rawPayload] = match;
      refreshEvents.push({ event, payload: { raw: rawPayload } });
    });

    await page.goto(BASE_URL, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
        localStorage.setItem("goToolkit.memo.refreshDebug.v1", "1");
      } catch {
        // ignore
      }
    });

    await waitForMemoBootstrap(page);
    await ensureAssist(page);

    const docId = await page.evaluate(async () => {
      const w = window as any;
      await w.GoToolkitMemoCreateAutoDocument();
      const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
      if (!activeId) throw new Error("Failed to create private memo document");
      w.GoToolkitMemoInstance?.setValue?.("");
      return activeId;
    });

    await page.locator("#fileMenuBtn").click();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("#memoOpenImportBtn").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(SAMPLE_MARKDOWN_PATH);

    await expect.poll(async () => {
      const snapshot = await collectSnapshot(page, docId);
      return {
        mermaidWrappers: snapshot.mermaidWrappers,
        someEditorHtml: snapshot.editorHtmlLength > 0,
        someRecordHtml: snapshot.recordHtmlLength > 0,
      };
    }, { timeout: 90_000 }).toMatchObject({
      someEditorHtml: true,
      someRecordHtml: true,
    });

    const beforeRefresh = await collectSnapshot(page, docId);

    await page.reload({ waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(5_000);

    const afterRefresh = await collectSnapshot(page);

    const relevantEvents = refreshEvents.filter(item => (
      item.event.startsWith("lifecycle-flush:")
      || item.event.startsWith("restore-storage:")
      || item.event.startsWith("open-record:")
      || item.event.startsWith("set-active-tab:")
      || item.event.startsWith("force-active-tab:")
      || item.event.startsWith("document-api:upsert:")
    ));

    console.log("=== before-refresh ===");
    console.log(JSON.stringify(beforeRefresh, null, 2));
    console.log("=== after-refresh ===");
    console.log(JSON.stringify(afterRefresh, null, 2));
    console.log("=== refresh-events ===");
    console.log(JSON.stringify(relevantEvents, null, 2));

    expect(beforeRefresh.recordHtmlLength).toBeGreaterThan(0);
    expect(relevantEvents.length).toBeGreaterThan(0);
    expect(afterRefresh.recordHtmlLength).toBeGreaterThan(20_000);
    expect(afterRefresh.visibleHeadings).toEqual(EXPECTED_VISIBLE_H2S);
  });
});
