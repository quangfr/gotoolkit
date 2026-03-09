import { expect, test } from "@playwright/test";
import { clickMemoDoc, refreshMemoExplorer, waitForMemoReady } from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 120_000;

const SURFACES = ["block", "modal"] as const;

const SCENARIOS = [
  {
    name: "manual",
    initialCode: "",
    expectedTexts: ["Manual text updated"],
  },
  {
    name: "mermaid-flowchart",
    initialCode: `flowchart TD
A[Start] --> B{Check}
B -->|Yes| C[Done]
B -->|No| D[Retry]`,
    expectedTexts: ["Start", "Check", "Done", "Retry"],
  },
  {
    name: "mermaid-sequence",
    initialCode: `sequenceDiagram
Alice->>Bob: Hello
Bob-->>Alice: Hi`,
    expectedTexts: ["Alice", "Bob", "Hello", "Hi"],
  },
  {
    name: "mermaid-class",
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
      text: String(element?.text || ""),
      x: Number(element?.x || 0),
      y: Number(element?.y || 0),
      width: Number(element?.width || 0),
      height: Number(element?.height || 0),
      isDeleted: Boolean(element?.isDeleted),
    }));
  });
}

async function deleteElementById(page: import("@playwright/test").Page, elementId: string) {
  await page.evaluate((targetId: string) => {
    const api = (window as any).GoToolkitDrawMemo?.getApi?.();
    if (!api?.getSceneElements || !api?.updateScene || !api?.getAppState) {
      throw new Error("Excalidraw API unavailable for deletion");
    }
    const nextElements = api.getSceneElements().map((element: any) => (
      String(element?.id || "") === String(targetId || "")
        ? { ...element, isDeleted: true }
        : element
    ));
    api.updateScene({
      elements: nextElements,
      appState: {
        ...api.getAppState(),
        activeTool: { type: "selection" },
      },
    });
    api.refresh?.();
  }, elementId);
}

async function setActiveTool(page: import("@playwright/test").Page, tool: string) {
  await page.evaluate((toolName: string) => {
    const api = (window as any).GoToolkitDrawMemo?.getApi?.();
    if (!api?.setActiveTool) {
      throw new Error(`Excalidraw API unavailable for tool ${toolName}`);
    }
    api.setActiveTool({ type: toolName });
    api.refresh?.();
  }, tool);
}

test.describe("Excalidraw regression", () => {
  for (const surface of SURFACES) {
    for (const scenario of SCENARIOS) {
      test(`${surface} :: ${scenario.name}`, async ({ page }) => {
        test.setTimeout(TEST_TIMEOUT);
        const logStep = createStepLogger(`excalidraw-regression:${surface}:${scenario.name}`);

        attachPageDebugLogging(page, `excalidraw-regression:${surface}:${scenario.name}`);

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
        const seed = await page.evaluate(async (scenarioName: string) => {
          const ts = Date.now();
          const docApi = (window as any).goToolkitDocumentApi;
          const privateAId = docApi?.generateId?.() || `pw-excalidraw-a-${ts}`;
          const privateBId = docApi?.generateId?.() || `pw-excalidraw-b-${ts}`;
          const docAContent = `<p>EXCALI_A_${scenarioName}_${ts}</p>`;
          const docBContent = `\`\`\`mermaid
flowchart LR
X[Other ${scenarioName}] --> Y[Page]
\`\`\``;

          await docApi?.upsertRecord?.({
            id: privateAId,
            app: "memo",
            title: `PW Excalidraw A ${scenarioName} ${ts}`,
            payload: {
              tabs: [{ id: `tab-${privateAId}`, title: `PW Excalidraw A ${scenarioName} ${ts}`, description: "", superpowers: [], content: docAContent }],
              activeTabId: `tab-${privateAId}`
            },
            updatedAt: new Date().toISOString()
          });
          await docApi?.upsertRecord?.({
            id: privateBId,
            app: "memo",
            title: `PW Excalidraw B ${scenarioName} ${ts}`,
            payload: {
              tabs: [{ id: `tab-${privateBId}`, title: `PW Excalidraw B ${scenarioName} ${ts}`, description: "", superpowers: [], content: docBContent }],
              activeTabId: `tab-${privateBId}`
            },
            updatedAt: new Date().toISOString()
          });
          await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
          return { privateAId, privateBId };
        }, scenario.name);
        logStep("seed-private-docs:done", seed);

        await refreshMemoExplorer(page, 30_000);
        await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
        logStep("open-primary-doc:done");

        await page.evaluate(() => {
          (window as any).setEditorMarkdown("```mermaid\n\n```");
        });

        const block = page.locator(".mermaid-diagram-wrapper .mermaid-diagram-container").first();
        await expect(block).toBeVisible({ timeout: 60_000 });
        await block.dblclick();
        const modal = page.locator(".mermaid-modal");
        const modalTextarea = page.locator(".mermaid-modal-textarea");
        await expect(modal).toBeVisible({ timeout: 60_000 });
        await expect(page.locator(".mermaid-modal-excalidraw-host")).toBeVisible({ timeout: 60_000 });
        await expect(modalTextarea).toBeVisible({ timeout: 60_000 });
        await page.waitForFunction(() => {
          const api = (window as any).GoToolkitDrawMemo?.getApi?.();
          return Boolean(api && typeof api.getSceneElements === "function");
        }, null, { timeout: 60_000 });
        const canvas = page.locator(".mermaid-modal .excalidraw__canvas").first();
        await expect(canvas).toBeVisible({ timeout: 60_000 });
        logStep("modal-ready");

        if (scenario.name === "manual") {
          await page.evaluate(() => {
            const api = (window as any).GoToolkitDrawMemo?.getApi?.();
            if (!api?.updateScene || !api?.getAppState || !api?.getSceneElements) {
              throw new Error("Excalidraw API unavailable for manual scenario");
            }
            const rectangle = {
              id: `pw-rect-${Date.now()}`,
              type: "rectangle",
              x: 96,
              y: 84,
              width: 180,
              height: 90,
              angle: 0,
              strokeColor: "#1f2937",
              backgroundColor: "transparent",
              fillStyle: "solid",
              strokeWidth: 1,
              strokeStyle: "solid",
              roughness: 0,
              opacity: 100,
              groupIds: [],
              frameId: null,
              roundness: null,
              seed: 1,
              version: 1,
              versionNonce: 1,
              isDeleted: false,
              boundElements: null,
              updated: Date.now(),
              link: null,
              locked: false,
            };
            const text = {
              id: `pw-text-${Date.now()}`,
              type: "text",
              x: 340,
              y: 152,
              width: 150,
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
              seed: 2,
              version: 1,
              versionNonce: 2,
              isDeleted: false,
              boundElements: null,
              updated: Date.now(),
              link: null,
              locked: false,
              text: "Manual text updated",
              fontSize: 20,
              fontFamily: 1,
              textAlign: "left",
              verticalAlign: "top",
              baseline: 18,
              containerId: null,
              originalText: "Manual text updated",
              lineHeight: 1.25,
            };
            api.updateScene({
              elements: [rectangle, text],
              appState: {
                ...api.getAppState(),
                activeTool: { type: "selection" },
              },
            });
            api.refresh?.();
          });

          await page.waitForFunction(() => {
            const api = (window as any).GoToolkitDrawMemo?.getApi?.();
            const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
            return elements.some((element: any) => !element?.isDeleted && element?.type === "rectangle")
              && elements.some((element: any) => !element?.isDeleted && element?.type === "text" && String(element?.text || "").includes("Manual text updated"));
          }, null, { timeout: 30_000 });

          const beforeMove = await getElementSnapshot(page);
          const rectangle = beforeMove.find((element) => element.type === "rectangle" && !element.isDeleted);
          if (!rectangle) throw new Error("Rectangle not found after injection");

          await page.evaluate((rectangleId: string) => {
            const api = (window as any).GoToolkitDrawMemo?.getApi?.();
            if (!api?.updateScene || !api?.getAppState || !api?.getSceneElements) {
              throw new Error("Excalidraw API unavailable for manual move");
            }
            const nextElements = api.getSceneElements().map((element: any) => (
              String(element?.id || "") === String(rectangleId || "")
                ? { ...element, x: Number(element?.x || 0) + 120, y: Number(element?.y || 0) + 40, version: Number(element?.version || 1) + 1, updated: Date.now() }
                : element
            ));
            api.updateScene({
              elements: nextElements,
              appState: {
                ...api.getAppState(),
                activeTool: { type: "selection" },
              },
            });
            api.refresh?.();
          }, rectangle.id);

          await page.waitForFunction((rectangleId: string) => {
            const api = (window as any).GoToolkitDrawMemo?.getApi?.();
            const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
            const rectangle = elements.find((element: any) => String(element?.id || "") === rectangleId);
            return Number(rectangle?.x || 0) >= 216 && Number(rectangle?.y || 0) >= 124;
          }, rectangle.id, { timeout: 30_000 });

          await deleteElementById(page, rectangle.id);

          await page.waitForFunction(() => {
            const api = (window as any).GoToolkitDrawMemo?.getApi?.();
            const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
            const activeRectangles = elements.filter((element: any) => !element?.isDeleted && element?.type === "rectangle");
            return activeRectangles.length === 0;
          }, null, { timeout: 30_000 });
        } else {
          await modalTextarea.fill(scenario.initialCode);
          await page.locator(".mermaid-modal-sync").click();
          await page.waitForFunction((texts: string[]) => {
            const api = (window as any).GoToolkitDrawMemo?.getApi?.();
            const elements = Array.isArray(api?.getSceneElements?.()) ? api.getSceneElements() : [];
            const haystack = elements.map((element: any) => String(element?.text || element?.label?.text || "")).join("\n");
            return texts.every(text => haystack.includes(text));
          }, scenario.expectedTexts, { timeout: 60_000 });
        }

        const modalTextContent = await getSceneTextContent(page);
        for (const text of scenario.expectedTexts) {
          expect(modalTextContent).toContain(text);
        }

        const modalRoot = page.locator(".mermaid-modal").first();
        const closeButton = page.locator(".mermaid-modal-close").first();
        const closeButtonVisible = await closeButton.isVisible().catch(() => false);
        if (closeButtonVisible) {
          await closeButton.click({ force: true });
        }
        await expect(modalRoot).toBeHidden({ timeout: 60_000 });
        if (scenario.name !== "manual") {
          await page.waitForFunction((texts: string[]) => {
            const container = document.querySelector(".mermaid-diagram-wrapper .mermaid-diagram-container") as HTMLElement | null;
            const haystack = String(container?.innerHTML || container?.textContent || "");
            return texts.every(text => haystack.includes(text));
          }, scenario.expectedTexts, { timeout: 60_000 });

          const blockHtmlAfter = await block.innerHTML();
          for (const text of scenario.expectedTexts) {
            expect(blockHtmlAfter).toContain(text);
          }
        }

        const sceneHtml = await page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));
        expect(sceneHtml).toContain("mermaid-diagram");

        await page.evaluate(() => {
          (document.getElementById("saveDocumentBtn") as HTMLButtonElement | null)?.click();
        });
        await page.waitForTimeout(500);

        await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
        await expect(page.locator(".ProseMirror:visible").first()).toBeVisible({ timeout: 30_000 });

        await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
        const blockAfterSwitch = page.locator(".mermaid-diagram-wrapper .mermaid-diagram-container").first();
        await expect(blockAfterSwitch).toBeVisible({ timeout: 30_000 });
        if (scenario.name !== "manual") {
          const blockHtmlAfterSwitch = await blockAfterSwitch.innerHTML();
          for (const text of scenario.expectedTexts) {
            expect(blockHtmlAfterSwitch).toContain(text);
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
        await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
        const blockAfterReload = page.locator(".mermaid-diagram-wrapper .mermaid-diagram-container").first();
        await expect(blockAfterReload).toHaveCount(1, { timeout: 30_000 });
        if (scenario.name !== "manual") {
          const blockHtmlAfterReload = await blockAfterReload.evaluate((node) => {
            const element = node as HTMLElement;
            return String(element.innerHTML || element.textContent || "");
          });
          for (const text of scenario.expectedTexts) {
            expect(blockHtmlAfterReload).toContain(text);
          }
        }

      });
    }
  }
});
