import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { clickMemoDoc, waitForMemoReady } from "./helpers/memo-ui";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const SAMPLE_MARKDOWN_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const TEST_TIMEOUT = 180_000;

function collectExpectedHeadingsFromSample(markdown: string) {
  const headings = {
    h1: [] as string[],
    h2: [] as string[],
    h3: [] as string[],
  };
  for (const match of markdown.matchAll(/^(#{1,3})\s+(.+)$/gm)) {
    const level = match[1].length;
    const text = String(match[2] || "")
      .replace(/\*\*/g, "")
      .replace(/__/g, "")
      .replace(/[`*_~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    if (level === 1) headings.h1.push(text);
    if (level === 2) headings.h2.push(text);
    if (level === 3) headings.h3.push(text);
  }
  return headings;
}

const SAMPLE_MARKDOWN = fs.readFileSync(SAMPLE_MARKDOWN_PATH, "utf8");
const EXPECTED_VISIBLE_HEADINGS = collectExpectedHeadingsFromSample(SAMPLE_MARKDOWN);
const EXPECTED_TAIL_H2 = EXPECTED_VISIBLE_HEADINGS.h2.slice(EXPECTED_VISIBLE_HEADINGS.h2.indexOf("Cas limite"));

async function importSampleIntoAutoDoc(page: any) {
  await page.evaluate(async () => {
    const w = window as any;
    await w.GoToolkitMemoCreateAutoDocument();
    w.GoToolkitMemoInstance?.setValue?.("");
  });
  await page.locator("#fileMenuBtn").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#memoOpenImportBtn").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(SAMPLE_MARKDOWN_PATH);
  await expect.poll(async () => {
    return page.evaluate(() => {
      const w = window as any;
      const html = String(w.GoToolkitMemoInstance?.getValue?.() || "");
      return {
        docId: String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim(),
        tabId: String(w.getMemoActiveTabId?.() || "").trim(),
        htmlLength: html.length,
      };
    });
  }, { timeout: 90_000 }).toMatchObject({
    htmlLength: expect.any(Number),
  });
  return page.evaluate(() => {
    const w = window as any;
    return {
      docId: String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim(),
      tabId: String(w.getMemoActiveTabId?.() || "").trim(),
      html: String(w.GoToolkitMemoInstance?.getValue?.() || ""),
    };
  });
}

async function installBlankHeadingSwitchCorruption(page: any, options: { targetTabId?: string; matchHtmlNeedle?: string }) {
  await page.evaluate(({ targetTabId, matchHtmlNeedle }) => {
    const w = window as any;
    const bridge = w.GoToolkitMemoInstance;
    if (!bridge || typeof bridge.switchTo !== "function") {
      throw new Error("GoToolkitMemoInstance.switchTo unavailable");
    }
    if (bridge.__pwBlankHeadingSwitchPatch?.restore) {
      bridge.__pwBlankHeadingSwitchPatch.restore();
    }
    const originalSwitchTo = bridge.switchTo.bind(bridge);
    let didCorrupt = false;
    const shouldCorrupt = (tabId: unknown, html: unknown) => {
      if (didCorrupt) return false;
      const normalizedTabId = String(tabId || "").trim();
      const normalizedHtml = String(html || "");
      if (targetTabId && normalizedTabId === String(targetTabId || "").trim()) return true;
      if (matchHtmlNeedle && normalizedHtml.includes(String(matchHtmlNeedle || ""))) return true;
      return false;
    };
    bridge.switchTo = function patchedSwitchTo(tabId: unknown, html: unknown, ...rest: unknown[]) {
      let nextHtml = String(html || "");
      if (shouldCorrupt(tabId, html)) {
        didCorrupt = true;
        const doc = new DOMParser().parseFromString(nextHtml, "text/html");
        doc.body.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(heading => {
          heading.innerHTML = "";
        });
        nextHtml = doc.body.innerHTML;
      }
      return originalSwitchTo(tabId, nextHtml, ...rest);
    };
    bridge.__pwBlankHeadingSwitchPatch = {
      restore() {
        bridge.switchTo = originalSwitchTo;
      }
    };
  }, options);
}

async function expectVisibleSampleHeadings(page: any) {
  await expect.poll(async () => {
    return page.evaluate(() => {
      const html = String((window as any).__memoState?.tabs?.[0]?.content || "");
      const doc = new DOMParser().parseFromString(html, "text/html");
      const root = doc.body;
      return {
        h1: Array.from(root.querySelectorAll("h1")).map((el: any) => String(el.textContent || "").trim()).filter(Boolean),
        h2: Array.from(root.querySelectorAll("h2")).map((el: any) => String(el.textContent || "").trim()).filter(Boolean),
        h3: Array.from(root.querySelectorAll("h3")).map((el: any) => String(el.textContent || "").trim()).filter(Boolean),
      };
    });
  }, { timeout: 30_000 }).toEqual(EXPECTED_VISIBLE_HEADINGS);
}

async function expectVisibleTailSampleHeadings(page: any) {
  await expect.poll(async () => {
    return page.evaluate(() => {
      const html = String((window as any).__memoState?.tabs?.[0]?.content || "");
      const doc = new DOMParser().parseFromString(html, "text/html");
      return Array.from(doc.body.querySelectorAll("h2"))
        .map((el: any) => String(el.textContent || "").trim())
        .filter(Boolean);
    });
  }, { timeout: 30_000 }).toEqual(EXPECTED_VISIBLE_HEADINGS.h2);

  await expect.poll(async () => {
    return page.evaluate(() => {
      const html = String((window as any).__memoState?.tabs?.[0]?.content || "");
      const doc = new DOMParser().parseFromString(html, "text/html");
      return Array.from(doc.body.querySelectorAll("h2"))
        .map((el: any) => String(el.textContent || "").trim())
        .filter(Boolean)
        .slice(2);
    });
  }, { timeout: 30_000 }).toEqual(EXPECTED_TAIL_H2);
}

async function createBlankChildPageFromExplorer(page: any, parentDocId: string) {
  const createdId = await page.evaluate(async (docId: string) => {
    const w = window as any;
    const explorer = w.GoToolkitMemoDocumentExplorer;
    if (!explorer?.getItemsSnapshot) {
      throw new Error("GoToolkitMemoDocumentExplorer.getItemsSnapshot unavailable");
    }
    const item = (explorer.getItemsSnapshot() || []).find((entry: any) => String(entry?.id || "").trim() === String(docId || "").trim());
    if (!item) {
      throw new Error(`Parent item not found: ${docId}`);
    }
    const titleBase = "Playwright Blank Child";
    await explorer.expandItem?.(docId);
    await w.GoToolkitMemoCreateDocument({
      name: `${titleBase} ${Date.now()}`,
      initialContent: "",
      parentId: docId,
    });
    return String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
  }, parentDocId);
  expect(createdId).toBeTruthy();
  expect(createdId).not.toBe(parentDocId);
  return createdId;
}

test.describe("Private heading repair entrypoints", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    await waitForMemoReady(page, 60_000);
  });

  test("repairs blank headings when reopening a private sample doc from the explorer", async ({ page }) => {
    const sampleDoc = await importSampleIntoAutoDoc(page);
    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);

    const otherDocId = await page.evaluate(async () => {
      const w = window as any;
      await w.GoToolkitMemoCreateDocument({
        name: "Playwright Other Page",
        initialContent: "<p>Other page</p>",
      });
      return String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    });
    expect(otherDocId).not.toBe(sampleDoc.docId);

    await installBlankHeadingSwitchCorruption(page, { targetTabId: sampleDoc.tabId });
    await clickMemoDoc(page, sampleDoc.docId, { allowProgrammaticOpen: true, timeout: 60_000 });
    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);
  });

  test("repairs blank headings when creating a new private sample doc from initial content", async ({ page }) => {
    const imported = await importSampleIntoAutoDoc(page);
    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);

    await installBlankHeadingSwitchCorruption(page, { matchHtmlNeedle: "Requêtes API" });
    const created = await page.evaluate(async ({ html }) => {
      const w = window as any;
      await w.GoToolkitMemoCreateDocument({
        name: "Playwright Sample Clone",
        initialContent: html,
      });
      return {
        docId: String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim(),
        tabId: String(w.getMemoActiveTabId?.() || "").trim(),
      };
    }, { html: imported.html });

    expect(created.docId).not.toBe(imported.docId);
    expect(created.tabId).not.toBe(imported.tabId);
    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);
  });

  test("keeps all sample headings after a full page reload", async ({ page }) => {
    await importSampleIntoAutoDoc(page);
    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);

    await page.reload({ waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(5_000);

    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);
  });

  test("keeps all sample headings after creating a blank child page and switching back to the parent", async ({ page }) => {
    const sampleDoc = await importSampleIntoAutoDoc(page);
    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);

    await createBlankChildPageFromExplorer(page, sampleDoc.docId);
    await clickMemoDoc(page, sampleDoc.docId, { allowProgrammaticOpen: true, timeout: 60_000 });

    await expectVisibleSampleHeadings(page);
    await expectVisibleTailSampleHeadings(page);
  });
});
