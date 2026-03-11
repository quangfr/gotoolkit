import { expect, test } from "@playwright/test";
import { dismissDocsTour, waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 180_000;
const IMPORT_FILE = "/mnt/c/Users/tranx/Downloads/Analyse et Artefacts PO-2026-03-11 (5).md";

test.describe("Debug mermaid markdown import", () => {
  test("imports markdown file and converts mermaid fences into mermaid blocks", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    const logStep = createStepLogger("debug-mermaid-markdown-import");
    attachPageDebugLogging(page, "debug-mermaid-markdown-import");

    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    await dismissDocsTour(page).catch(() => null);
    await waitForMemoReady(page, 60_000);
    logStep("memo-ready");

    await page.evaluate(async () => {
      const w = window as any;
      if (w.GoToolkitAssistInstance?.openImportFileSelector) return;
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
    logStep("assist-ready");

    await page.locator("#fileMenuBtn").click();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("#memoOpenImportBtn").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(IMPORT_FILE);
    logStep("file-selected", { file: IMPORT_FILE });

    await expect.poll(async () => {
      return page.evaluate(() => {
        const wrappers = document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length;
        const visibleContainers = Array.from(document.querySelectorAll(".mermaid-diagram-container"))
          .filter((node) => {
            const el = node as HTMLElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length;
        const visibleSvgCount = Array.from(document.querySelectorAll(".mermaid-svg-container svg"))
          .filter((node) => {
            const el = node as SVGSVGElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length;
        const mermaidCodeBlocks = document.querySelectorAll("pre code.language-mermaid").length;
        const html = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
        return {
          wrappers,
          visibleContainers,
          visibleSvgCount,
          mermaidCodeBlocks,
          htmlHasMermaidDiagram: html.includes("mermaid-diagram"),
        };
      });
    }, { timeout: 60_000 }).toMatchObject({
      wrappers: 3,
      visibleSvgCount: 3,
      htmlHasMermaidDiagram: true,
    });

    const snapshot = await page.evaluate(() => {
      const html = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
      const markdown = String((window as any).getMemoEditorSource?.("markdown") || "");
      return {
        wrappers: document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length,
        visibleContainers: Array.from(document.querySelectorAll(".mermaid-diagram-container"))
          .filter((node) => {
            const el = node as HTMLElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length,
        visibleSvgCount: Array.from(document.querySelectorAll(".mermaid-svg-container svg"))
          .filter((node) => {
            const el = node as SVGSVGElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length,
        mermaidCodeBlocks: document.querySelectorAll("pre code.language-mermaid").length,
        htmlSnippet: html.slice(0, 2000),
        markdownSnippet: markdown.slice(0, 2000),
      };
    });
    logStep("post-import-snapshot", snapshot);

    expect(snapshot.wrappers).toBe(3);
    expect(snapshot.visibleSvgCount).toBe(3);
    expect(snapshot.mermaidCodeBlocks).toBe(0);

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await dismissDocsTour(page).catch(() => null);
    await waitForMemoReady(page, 60_000);
    logStep("memo-ready-after-reload");

    await expect.poll(async () => {
      return page.evaluate(() => {
        const wrappers = document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length;
        const visibleSvgCount = Array.from(document.querySelectorAll(".mermaid-svg-container svg"))
          .filter((node) => {
            const el = node as SVGSVGElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length;
        const mermaidCodeBlocks = document.querySelectorAll("pre code.language-mermaid").length;
        const html = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
        return {
          wrappers,
          visibleSvgCount,
          mermaidCodeBlocks,
          htmlHasMermaidDiagram: html.includes("mermaid-diagram"),
        };
      });
    }, { timeout: 60_000 }).toMatchObject({
      wrappers: 3,
      visibleSvgCount: 3,
      htmlHasMermaidDiagram: true,
    });

    const reloadSnapshot = await page.evaluate(() => {
      const html = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
      const markdown = String((window as any).getMemoEditorSource?.("markdown") || "");
      return {
        wrappers: document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length,
        visibleContainers: Array.from(document.querySelectorAll(".mermaid-diagram-container"))
          .filter((node) => {
            const el = node as HTMLElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length,
        visibleSvgCount: Array.from(document.querySelectorAll(".mermaid-svg-container svg"))
          .filter((node) => {
            const el = node as SVGSVGElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length,
        mermaidCodeBlocks: document.querySelectorAll("pre code.language-mermaid").length,
        htmlSnippet: html.slice(0, 2000),
        markdownSnippet: markdown.slice(0, 2000),
      };
    });
    logStep("post-reload-snapshot", reloadSnapshot);

    expect(reloadSnapshot.wrappers).toBe(3);
    expect(reloadSnapshot.visibleSvgCount).toBe(3);
    expect(reloadSnapshot.mermaidCodeBlocks).toBe(0);
  });
});
