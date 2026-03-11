import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 180_000;
const SAMPLE_MARKDOWN_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const SAMPLE_MARKDOWN = readFileSync(SAMPLE_MARKDOWN_PATH, "utf8");
const MERMAID_BLOCKS = Array.from(
  SAMPLE_MARKDOWN.matchAll(/```[ \t]*mermaid[^\n\r]*\r?\n([\s\S]*?)\r?\n?```/gi),
  match => String(match[1] || "").trim()
).filter(Boolean);

if (MERMAID_BLOCKS.length !== 3) {
  throw new Error(`Expected 3 mermaid blocks in tests/fixtures/sample.md, found ${MERMAID_BLOCKS.length}`);
}

const FIRST_MERMAID_BLOCK = MERMAID_BLOCKS[0];
const FIRST_FLOWCHART_LABELS = [
  "Invitation",
  "Réponse",
  "Planif RDV",
  "Fin",
  "Test réalisé",
  "Analyse labo",
  "Résultat",
  "Notif Négatif",
  "Notif Positif",
  "Consultation",
  "Suivi patient",
  "Notif Inconnu",
  "Re‑test",
  "Oui",
  "Non",
  "Négatif",
  "Positif",
  "Inconnu",
];

const normalizeSvgText = (value: string) => value
  .normalize("NFKC")
  .replace(/\s+/g, " ")
  .trim();

test.describe("Memo Mermaid import regression", () => {
  test("imports sample markdown into a blank private doc without OpenRouter and shows modal parity", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    const logStep = createStepLogger("memo-import-mermaid-regression");
    attachPageDebugLogging(page, "memo-import-mermaid-regression");

    const openrouterRequests: Array<{ method: string; url: string }> = [];
    page.on("request", request => {
      const url = request.url();
      if (!/openrouter\.gotoolkit\.workers\.dev|\/api\/v1\/chat\/completions/i.test(url)) return;
      openrouterRequests.push({ method: request.method(), url });
    });

    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => {
      const w = window as any;
      return Boolean(
        w.GoToolkitMemoInstance
        && (w.GoToolkitMemoCreateAutoDocument || w.GoToolkitMemoGetActiveDocumentId || w.GoToolkitMemoOpenDocumentByLink)
      );
    }, null, { timeout: 60_000 });
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

    const docId = await page.evaluate(async () => {
      if (typeof (window as any).GoToolkitMemoCreateAutoDocument !== "function") {
        throw new Error("GoToolkitMemoCreateAutoDocument unavailable");
      }
      await (window as any).GoToolkitMemoCreateAutoDocument();
      const activeId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim();
      if (!activeId) {
        throw new Error("Failed to create private memo document");
      }
      const memo = (window as any).GoToolkitMemoInstance;
      memo?.setValue?.("");
      return activeId;
    });
    logStep("private-doc-created", { docId });

    await page.waitForFunction(expectedId => {
      return String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim() === String(expectedId || "").trim();
    }, docId, { timeout: 30_000 });

    await expect.poll(async () => {
      return page.evaluate(() => String((window as any).getMemoEditorSource?.("markdown") || "").trim());
    }, { timeout: 15_000 }).toBe("");
    logStep("private-doc-blank");

    openrouterRequests.length = 0;

    await page.locator("#fileMenuBtn").click();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("#memoOpenImportBtn").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(SAMPLE_MARKDOWN_PATH);
    logStep("file-selected", { file: SAMPLE_MARKDOWN_PATH });

    await expect.poll(async () => {
      return page.evaluate((expectedCode: string) => {
        const wrappers = document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length;
        const visibleSvgCount = Array.from(document.querySelectorAll(".mermaid-svg-container svg"))
          .filter((node) => {
            const el = node as SVGSVGElement;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          }).length;
        const markdown = String((window as any).getMemoEditorSource?.("markdown") || "");
        return {
          wrappers,
          visibleSvgCount,
          svgTextCount: document.querySelectorAll(".mermaid-svg-container svg text").length,
          svgPathCount: document.querySelectorAll(".mermaid-svg-container svg path").length,
          hasMermaidDiagram: markdown.includes("```mermaid"),
          mermaidCodeBlocks: document.querySelectorAll("pre code.language-mermaid").length,
        };
      }, FIRST_MERMAID_BLOCK);
    }, { timeout: 60_000 }).toMatchObject({
      wrappers: 3,
      visibleSvgCount: 3,
      hasMermaidDiagram: true,
      mermaidCodeBlocks: 0,
    });

    const importSnapshot = await page.evaluate(() => ({
      wrappers: document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length,
      visibleSvgCount: Array.from(document.querySelectorAll(".mermaid-svg-container svg"))
        .filter((node) => {
          const el = node as SVGSVGElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        }).length,
      svgTextCount: document.querySelectorAll(".mermaid-svg-container svg text").length,
      svgPathCount: document.querySelectorAll(".mermaid-svg-container svg path").length,
      hasMermaidDiagram: String((window as any).getMemoEditorSource?.("markdown") || "").includes("```mermaid"),
      mermaidCodeBlocks: document.querySelectorAll("pre code.language-mermaid").length,
      firstInlineSvgText: (() => {
        const firstSvg = document.querySelector(".mermaid-diagram-wrapper .mermaid-svg-container svg");
        return String(firstSvg?.textContent || "");
      })(),
      firstInlineSvgShapeStats: (() => {
        const firstSvg = document.querySelector(".mermaid-diagram-wrapper .mermaid-svg-container svg");
        if (!firstSvg) return null;
        return {
          textNodes: firstSvg.querySelectorAll("text").length,
          tspanNodes: firstSvg.querySelectorAll("tspan").length,
          rectNodes: firstSvg.querySelectorAll("rect").length,
          polygonNodes: firstSvg.querySelectorAll("polygon").length,
          pathNodes: firstSvg.querySelectorAll("path").length,
        };
      })(),
    }));

    const firstDiagram = page.locator(".mermaid-diagram-wrapper .mermaid-diagram-container:visible").first();
    await expect(firstDiagram).toBeVisible({ timeout: 30_000 });
    await firstDiagram.screenshot({ path: "tests/results/mermaid-import-first-block.png" });
    await page.screenshot({ path: "tests/results/mermaid-import-page.png", fullPage: true });

    expect(importSnapshot.wrappers).toBe(3);
    expect(importSnapshot.visibleSvgCount).toBe(3);
    expect(importSnapshot.svgTextCount).toBeGreaterThan(0);
    expect(importSnapshot.svgPathCount).toBeGreaterThan(0);
    expect(importSnapshot.hasMermaidDiagram).toBe(true);
    expect(importSnapshot.mermaidCodeBlocks).toBe(0);
    expect(importSnapshot.firstInlineSvgShapeStats).not.toBeNull();
    expect(importSnapshot.firstInlineSvgShapeStats?.textNodes || 0).toBeGreaterThan(10);
    expect(importSnapshot.firstInlineSvgShapeStats?.rectNodes || 0).toBeGreaterThan(3);
    expect(importSnapshot.firstInlineSvgShapeStats?.pathNodes || 0).toBeGreaterThan(10);
    const normalizedFirstSvgText = normalizeSvgText(importSnapshot.firstInlineSvgText);
    for (const label of FIRST_FLOWCHART_LABELS) {
      expect(normalizedFirstSvgText).toContain(normalizeSvgText(label));
    }

    expect(openrouterRequests).toEqual([]);
    logStep("import-complete", { openrouterRequests: openrouterRequests.length });
    await firstDiagram.dblclick();

    const modal = page.locator(".mermaid-modal").first();
    const drawPane = page.locator(".mermaid-modal-draw-container").first();
    const editorPane = page.locator(".mermaid-modal-editor").first();
    const modalTextarea = page.locator(".mermaid-modal-textarea").first();
    const modalCanvas = page.locator(".mermaid-modal .excalidraw__canvas").first();

    await expect(modal).toBeVisible({ timeout: 60_000 });
    await expect(drawPane).toBeVisible({ timeout: 60_000 });
    await expect(editorPane).toBeVisible({ timeout: 60_000 });
    await expect(modalTextarea).toBeVisible({ timeout: 60_000 });
    await expect(modalCanvas).toBeVisible({ timeout: 60_000 });

    await expect(modalTextarea).toHaveValue(FIRST_MERMAID_BLOCK, { timeout: 30_000 });

    await page.waitForFunction(() => {
      const api = (window as any).GoToolkitDrawMemo?.getApi?.();
      const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
      return elements.some((element: any) => !element?.isDeleted);
    }, null, { timeout: 60_000 });

    await page.locator(".mermaid-modal-sync").click();
    await expect.poll(async () => {
      return page.evaluate(() => {
        const api = (window as any).GoToolkitDrawMemo?.getApi?.();
        const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
        const liveElements = elements.filter((element: any) => !element?.isDeleted);
        return {
          modalError: String(document.querySelector(".mermaid-modal-error-display")?.textContent || ""),
          liveElementCount: liveElements.length,
          liveTextCount: liveElements.filter((element: any) => {
            const text = String(element?.text || element?.label?.text || "");
            return text.trim().length > 0;
          }).length,
        };
      });
    }, { timeout: 60_000 }).toMatchObject({
      modalError: "",
    });

    const generateSnapshot = await page.evaluate(() => {
      const api = (window as any).GoToolkitDrawMemo?.getApi?.();
      const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
      const liveElements = elements.filter((element: any) => !element?.isDeleted);
      return {
        modalError: String(document.querySelector(".mermaid-modal-error-display")?.textContent || ""),
        liveElementCount: liveElements.length,
        liveTextCount: liveElements.filter((element: any) => {
          const text = String(element?.text || element?.label?.text || "");
          return text.trim().length > 0;
        }).length,
      };
    });

    expect(generateSnapshot.modalError).toBe("");
    expect(generateSnapshot.liveElementCount).toBeGreaterThan(0);
    expect(generateSnapshot.liveTextCount).toBeGreaterThan(0);

    const panePositions = await Promise.all([
      drawPane.boundingBox(),
      editorPane.boundingBox(),
    ]);
    const [drawBox, editorBox] = panePositions;
    expect(drawBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect((drawBox?.x || 0) + (drawBox?.width || 0) / 2).toBeLessThan((editorBox?.x || 0) + (editorBox?.width || 0) / 2);

    const finalSnapshot = await page.evaluate(() => ({
      wrappers: document.querySelectorAll(".mermaid-diagram-wrapper, mermaid-diagram").length,
      visibleSvgCount: Array.from(document.querySelectorAll(".mermaid-svg-container svg"))
        .filter((node) => {
          const el = node as SVGSVGElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        }).length,
      markdown: String((window as any).getMemoEditorSource?.("markdown") || "").slice(0, 2000),
      modalCode: String((document.querySelector(".mermaid-modal-textarea") as HTMLTextAreaElement | null)?.value || "").slice(0, 1200),
    }));
    logStep("final-snapshot", finalSnapshot);
  });
});
