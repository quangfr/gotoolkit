import { expect, test } from "@playwright/test";
import { clickMemoDoc, refreshMemoExplorer, waitForMemoReady } from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 120_000;

const DIAGRAM_DOCS = [
  {
    key: "flowchart",
    title: "Flowchart",
    initialCode: `flowchart TD
A[Start] --> B{Check}
B -->|Yes| C[Done]
B -->|No| D[Retry]`,
    expectedTexts: ["Start", "Check", "Done", "Retry"],
    manualEditText: "Flowchart manual edit",
  },
  {
    key: "sequence",
    title: "Sequence",
    initialCode: `sequenceDiagram
Alice->>Bob: Hello
Bob-->>Alice: Hi`,
    expectedTexts: ["Alice", "Bob", "Hello", "Hi"],
  },
  {
    key: "class",
    title: "Class",
    initialCode: `classDiagram
class Animal
class Dog
Animal <|-- Dog`,
    expectedTexts: ["Animal", "Dog"],
  },
] as const;

async function getSceneTextContent(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const api = (window as any).GoToolkitDrawMemo?.getApi?.();
    const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
    return elements
      .map((element: any) => String(element?.text || element?.label?.text || ""))
      .filter(Boolean)
      .join("\n");
  });
}

async function getElementSnapshot(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const api = (window as any).GoToolkitDrawMemo?.getApi?.();
    const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
    return elements.map((element: any) => ({
      id: String(element?.id || ""),
      type: String(element?.type || ""),
      text: String(element?.text || element?.label?.text || ""),
      x: Number(element?.x || 0),
      y: Number(element?.y || 0),
      isDeleted: Boolean(element?.isDeleted),
    }));
  });
}

async function openMermaidModal(page: import("@playwright/test").Page) {
  const block = page.locator(".mermaid-diagram-wrapper .mermaid-diagram-container:visible").first();
  await expect(block).toBeVisible({ timeout: 60_000 });
  await block.dblclick();

  const modal = page.locator(".mermaid-modal").first();
  const textarea = page.locator(".mermaid-modal-textarea").first();
  const canvas = page.locator(".mermaid-modal .excalidraw__canvas").first();

  await expect(modal).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".mermaid-modal-excalidraw-host")).toBeVisible({ timeout: 60_000 });
  await expect(textarea).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const api = (window as any).GoToolkitDrawMemo?.getApi?.();
    return Boolean(api && typeof api.getSceneElements === "function");
  }, null, { timeout: 60_000 });
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  return { block, modal, textarea };
}

async function closeMermaidModal(page: import("@playwright/test").Page, modal: import("@playwright/test").Locator) {
  const closeButton = page.locator(".mermaid-modal-close").first();
  const closeButtonVisible = await closeButton.isVisible().catch(() => false);
  if (closeButtonVisible) {
    await closeButton.click({ force: true });
  }
  await expect(modal).toBeHidden({ timeout: 60_000 });
}

async function waitForBlockTexts(page: import("@playwright/test").Page, texts: readonly string[]) {
  await page.waitForFunction((expectedTexts: string[]) => {
    const containers = Array.from(document.querySelectorAll(".mermaid-diagram-wrapper .mermaid-diagram-container")) as HTMLElement[];
    const container = containers.find((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }) || null;
    const haystack = String(container?.innerHTML || container?.textContent || "");
    return expectedTexts.every(text => haystack.includes(text));
  }, [...texts], { timeout: 60_000 });
}

async function waitForEditorHtmlTexts(page: import("@playwright/test").Page, texts: readonly string[]) {
  await page.waitForFunction((expectedTexts: string[]) => {
    const html = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
    return html.includes("mermaid-diagram") && expectedTexts.every(text => html.includes(text));
  }, [...texts], { timeout: 30_000 });
}

test.describe("Excalidraw regression", () => {
  test("three mermaid docs persist across switch and reload", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    const logStep = createStepLogger("excalidraw-regression:grouped");

    attachPageDebugLogging(page, "excalidraw-regression:grouped");

    logStep("goto:start");
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });

    await waitForMemoReady(page, 60_000);
    logStep("memo-ready");
    await page.evaluate(async () => {
      await (window as any).GoToolkitLazyCdn.loadMermaid();
      await (window as any).GoToolkitLazyCdn.loadExcalidraw();
    });
    logStep("draw-deps-ready");

    logStep("seed-private-docs:start");
    const seed = await page.evaluate(async (docs: Array<{ key: string; title: string }>) => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const seeded = [];

      for (const doc of docs) {
        const id = docApi?.generateId?.() || `pw-excalidraw-${doc.key}-${ts}`;
        const title = `PW Excalidraw ${doc.title} ${ts}`;
        await docApi?.upsertRecord?.({
          id,
          app: "memo",
          title,
          payload: {
            tabs: [{ id: `tab-${id}`, title, description: "", superpowers: [], content: `<p>${doc.key.toUpperCase()}_${ts}</p>` }],
            activeTabId: `tab-${id}`,
          },
          updatedAt: new Date().toISOString(),
        });
        seeded.push({ key: doc.key, id, title });
      }

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return seeded;
    }, DIAGRAM_DOCS.map(doc => ({ key: doc.key, title: doc.title })));
    logStep("seed-private-docs:done", seed);

    await refreshMemoExplorer(page, 30_000);

    for (const doc of DIAGRAM_DOCS) {
      const seededDoc = seed.find((item: any) => item.key === doc.key);
      if (!seededDoc) throw new Error(`Missing seeded doc for ${doc.key}`);

      await clickMemoDoc(page, seededDoc.id, { allowProgrammaticOpen: false });
      logStep("open-doc", { key: doc.key, id: seededDoc.id });

      await page.evaluate(() => {
        (window as any).setEditorMarkdown("```mermaid\n\n```");
      });

      const { block, modal, textarea } = await openMermaidModal(page);
      await textarea.fill(doc.initialCode);
      await page.locator(".mermaid-modal-sync").click();
      await page.waitForFunction((texts: string[]) => {
        const api = (window as any).GoToolkitDrawMemo?.getApi?.();
        const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
        const haystack = elements.map((element: any) => String(element?.text || element?.label?.text || "")).join("\n");
        return texts.every(text => haystack.includes(text));
      }, [...doc.expectedTexts], { timeout: 60_000 });

      if (doc.manualEditText) {
        const snapshot = await getElementSnapshot(page);
        const movable = snapshot.find((element) => !element.isDeleted && (element.type === "text" || element.type === "rectangle" || element.type === "diamond"));
        if (!movable) {
          throw new Error(`No movable element found for ${doc.key}`);
        }
        await page.evaluate(({ targetId, extraText }) => {
          const api = (window as any).GoToolkitDrawMemo?.getApi?.();
          if (!api?.updateScene || !api?.getAppState || !api?.getSceneElements) {
            throw new Error("Excalidraw API unavailable for manual edit");
          }
          const nextElements = api.getSceneElements().map((element: any) => (
            String(element?.id || "") === String(targetId || "")
              ? { ...element, x: Number(element?.x || 0) + 40, y: Number(element?.y || 0) + 20, version: Number(element?.version || 1) + 1, updated: Date.now() }
              : element
          ));
          nextElements.push({
            id: `pw-manual-${Date.now()}`,
            type: "text",
            x: 420,
            y: 220,
            width: 190,
            height: 25,
            angle: 0,
            strokeColor: "#111827",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 0,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: null,
            seed: 7,
            version: 1,
            versionNonce: 7,
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            text: String(extraText || ""),
            fontSize: 20,
            fontFamily: 1,
            textAlign: "left",
            verticalAlign: "top",
            baseline: 18,
            containerId: null,
            originalText: String(extraText || ""),
            lineHeight: 1.25,
          });
          api.updateScene({
            elements: nextElements,
            appState: {
              ...api.getAppState(),
              activeTool: { type: "selection" },
            },
          });
          api.refresh?.();
        }, { targetId: movable.id, extraText: doc.manualEditText });
      }

      const modalTextContent = await getSceneTextContent(page);
      for (const text of [...doc.expectedTexts, ...(doc.manualEditText ? [doc.manualEditText] : [])]) {
        expect(modalTextContent).toContain(text);
      }

      await closeMermaidModal(page, modal);
      await waitForBlockTexts(page, doc.expectedTexts);

      const blockHtml = await block.innerHTML();
      for (const text of doc.expectedTexts) {
        expect(blockHtml).toContain(text);
      }

      await waitForEditorHtmlTexts(page, [...doc.expectedTexts, ...(doc.manualEditText ? [doc.manualEditText] : [])]);
    }

    for (const doc of DIAGRAM_DOCS) {
      const seededDoc = seed.find((item: any) => item.key === doc.key);
      if (!seededDoc) throw new Error(`Missing seeded doc for ${doc.key}`);
      await clickMemoDoc(page, seededDoc.id, { allowProgrammaticOpen: false });
      const block = page.locator(".mermaid-diagram-wrapper .mermaid-diagram-container:visible").first();
      await expect(block).toBeVisible({ timeout: 30_000 });
      await waitForBlockTexts(page, doc.expectedTexts);
      const blockHtml = await block.innerHTML();
      for (const text of doc.expectedTexts) {
        expect(blockHtml).toContain(text);
      }
      if (doc.manualEditText) {
        const editorHtml = await page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));
        expect(editorHtml).toContain(doc.manualEditText);
      }
    }

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    await waitForMemoReady(page, 60_000);
    await refreshMemoExplorer(page, 30_000);

    for (const doc of DIAGRAM_DOCS) {
      const seededDoc = seed.find((item: any) => item.key === doc.key);
      if (!seededDoc) throw new Error(`Missing seeded doc for ${doc.key}`);
      await clickMemoDoc(page, seededDoc.id, { allowProgrammaticOpen: false });
      const block = page.locator(".mermaid-diagram-wrapper .mermaid-diagram-container:visible").first();
      await expect(block).toHaveCount(1, { timeout: 30_000 });
      await waitForBlockTexts(page, doc.expectedTexts);
      const blockHtml = await block.evaluate((node) => {
        const element = node as HTMLElement;
        return String(element.innerHTML || element.textContent || "");
      });
      for (const text of doc.expectedTexts) {
        expect(blockHtml).toContain(text);
      }
      if (doc.manualEditText) {
        const editorHtml = await page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));
        expect(editorHtml).toContain(doc.manualEditText);
      }
    }
  });
});
