import { expect, test } from "@playwright/test";
import path from "node:path";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const SAMPLE_MARKDOWN_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const DEBUG_PREFIX = "[MemoImportDebug]";

type DebugEvent = {
  event: string;
  payload: Record<string, unknown>;
};

async function waitForMemoBootstrap(page: any, timeout = 60_000) {
  await page.waitForFunction(() => Boolean(
    (window as any).GoToolkitMemoCreateAutoDocument
    && (window as any).GoToolkitMemoInstance
    && (window as any).GoToolkitAssist?.mount
  ), { timeout });
}

async function ensureAssist(page: any) {
  await page.evaluate(async () => {
    const w = window as any;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (w.GoToolkitAssistInstance?.openMemoImportFileSelector) return;
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
          if (w.GoToolkitAssistInstance?.openMemoImportFileSelector) return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("GoToolkitAssistInstance.openMemoImportFileSelector unavailable");
  });
}

test.describe("Debug memoOpenImportBtn pipeline", () => {
  test("uses direct markdown path without ingestion or AI", async ({ page }) => {
    test.setTimeout(180_000);

    const debugEvents: DebugEvent[] = [];
    page.on("console", msg => {
      const text = msg.text();
      if (!text.includes(DEBUG_PREFIX)) return;
      const match = text.match(/^\[MemoImportDebug\]\s+([^\s]+)\s*(.*)$/);
      if (!match) return;
      const [, event, rawPayload] = match;
      let payload: Record<string, unknown> = {};
      if (rawPayload) {
        try {
          payload = JSON.parse(rawPayload);
        } catch {
          payload = { raw: rawPayload };
        }
      }
      debugEvents.push({ event, payload });
    });

    await page.goto(BASE_URL, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });

    await waitForMemoBootstrap(page);
    await ensureAssist(page);

    await page.evaluate(async () => {
      const w = window as any;
      await w.GoToolkitMemoCreateAutoDocument();
      w.GoToolkitMemoInstance?.setValue?.("");
    });

    await page.locator("#fileMenuBtn").click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#memoOpenImportBtn").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(SAMPLE_MARKDOWN_PATH);

    await expect.poll(() => debugEvents.map(item => item.event), { timeout: 60_000 }).toContain("direct-markdown:complete");

    await expect.poll(async () => {
      return page.evaluate(() => {
        const editorHtml = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
        const editorMarkdown = String((window as any).getEditorMarkdown?.() || "");
        return {
          length: editorHtml.length,
          markdownStartsWithHeading: /^#\s+\S/.test(editorMarkdown),
          markdownHasLeadingBlankLine: /^\s*\n#/.test(editorMarkdown),
          hasFixtureHeading: editorHtml.includes("Démarche d'analyse PO"),
        };
      });
    }, { timeout: 60_000 }).toMatchObject({
      hasFixtureHeading: true,
      markdownStartsWithHeading: true,
      markdownHasLeadingBlankLine: false,
    });

    const eventNames = debugEvents.map(item => item.event);
    console.log("=== memo-import-debug-events ===");
    console.log(JSON.stringify(debugEvents, null, 2));

    expect(eventNames).toContain("memo-open-import-btn");
    expect(eventNames).toContain("selector-open");
    expect(eventNames).toContain("files-selected");
    expect(eventNames).toContain("pipeline:start");
    expect(eventNames).toContain("direct-markdown:check");
    expect(eventNames).toContain("direct-markdown:start");
    expect(eventNames).toContain("direct-markdown:insert");
    expect(eventNames).toContain("direct-markdown:complete");
    expect(eventNames).toContain("pipeline:return-direct-markdown");

    expect(eventNames).not.toContain("skip-ingestion:enter");
    expect(eventNames).not.toContain("ingestion-route:enter");
    expect(eventNames).not.toContain("ingestion-route:doc-ingest:start");
    expect(eventNames).not.toContain("ingestion-route:media-ingest:start");
    expect(eventNames).not.toContain("ai-in:dispatch");
  });

  test("uses memo-like direct markdown path under presentation app id", async ({ page }) => {
    test.setTimeout(180_000);

    await page.addInitScript(() => {
      (window as any).GoToolkitChatAppId = "presentation-test";
    });

    const debugEvents: DebugEvent[] = [];
    page.on("console", msg => {
      const text = msg.text();
      if (!text.includes(DEBUG_PREFIX)) return;
      const match = text.match(/^\[MemoImportDebug\]\s+([^\s]+)\s*(.*)$/);
      if (!match) return;
      const [, event, rawPayload] = match;
      let payload: Record<string, unknown> = {};
      if (rawPayload) {
        try {
          payload = JSON.parse(rawPayload);
        } catch {
          payload = { raw: rawPayload };
        }
      }
      debugEvents.push({ event, payload });
    });

    await page.goto(BASE_URL, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });

    await waitForMemoBootstrap(page);
    await ensureAssist(page);

    const scopeSnapshot = await page.evaluate(async () => {
      const w = window as any;
      await w.GoToolkitMemoCreateAutoDocument();
      w.GoToolkitMemoInstance?.setValue?.("");
      return {
        appId: String(w.GoToolkitChatAppId || ""),
        scopeId: String(w.GoToolkitAssistInstance?.currentConversationScopeId || ""),
      };
    });

    await page.locator("#fileMenuBtn").click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#memoOpenImportBtn").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(SAMPLE_MARKDOWN_PATH);

    await expect.poll(() => debugEvents.map(item => item.event), { timeout: 60_000 }).toContain("direct-markdown:complete");

    const eventNames = debugEvents.map(item => item.event);
    console.log("=== presentation-memo-import-debug-events ===");
    console.log(JSON.stringify({ scopeSnapshot, debugEvents }, null, 2));

    expect(scopeSnapshot.appId).toBe("presentation-test");
    expect(scopeSnapshot.scopeId).toMatch(/^(tab:|doc:)/);
    expect(eventNames).toContain("memo-open-import-btn");
    expect(eventNames).toContain("pipeline:return-direct-markdown");
    expect(eventNames).not.toContain("ingestion-route:enter");
    expect(eventNames).not.toContain("ai-in:dispatch");
  });
});
