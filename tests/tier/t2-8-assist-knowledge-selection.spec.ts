import fs from "node:fs";
import path from "node:path";
import { expect, Page, test } from "@playwright/test";
import {
  clickMemoDoc,
  createLocalMemoPageFromUiAndReturnId,
  importMemoFileViaMenu,
  refreshMemoExplorer,
  waitForMemoReady,
} from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const PRIVATE_SPACE_ID = "__private__";
const SAMPLE_1_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const SAMPLE_2_PATH = path.resolve(process.cwd(), "tests/fixtures/sample2.md");
const SAMPLE_1_TEXT = fs.readFileSync(SAMPLE_1_PATH, "utf8");
const SAMPLE_2_TEXT = fs.readFileSync(SAMPLE_2_PATH, "utf8");

function createImportedFixtureWithSharedMarker(baseText: string, sharedMarker: string, fileName: string) {
  const outPath = path.resolve(process.cwd(), "tests/results", fileName);
  const nextText = `${String(baseText || "").trim()}\n\n${String(sharedMarker || "").trim()}\n`;
  fs.writeFileSync(outPath, nextText, "utf8");
  return outPath;
}

async function ensureAssist(page: Page) {
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

async function installFastEmbeddingHarness(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const docManager = w.GoToolkitDocumentManager;
    if (!docManager || docManager.__pwFastEmbeddingsInstalled) return;
    const toVector = (text: string) => {
      const source = String(text || "");
      const out = new Array(8).fill(0);
      for (let i = 0; i < source.length; i += 1) {
        out[i % out.length] += source.charCodeAt(i);
      }
      const norm = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0)) || 1;
      return out.map(value => value / norm);
    };
    docManager.embed = async (text: string) => toVector(text);
    docManager.embedBatch = async (texts: string[]) => (Array.isArray(texts) ? texts : []).map(toVector);
    docManager.embedBatchCloud = async (texts: string[]) => (Array.isArray(texts) ? texts : []).map(toVector);
    docManager.ensureEmbedder = async () => true;
    docManager.__pwFastEmbeddingsInstalled = true;
  });
}

async function setActiveDocHtml(page: Page, html: string) {
  await page.evaluate(async (nextHtml) => {
    const w = window as any;
    const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    if (!activeId) throw new Error("No active memo document");
    const docApi = w.goToolkitDocumentApi;
    if (!docApi?.getRecord || !docApi?.upsertRecord) throw new Error("document api unavailable");
    const record = await docApi.getRecord(activeId);
    if (!record) throw new Error(`Missing memo record ${activeId}`);
    const payload = record.payload && typeof record.payload === "object"
      ? structuredClone(record.payload)
      : { tabs: [] };
    const tabs = Array.isArray(payload.tabs) ? payload.tabs.slice() : [];
    const activeTabId = String(payload.activeTabId || tabs[0]?.id || "").trim();
    const nextTabs = tabs.map((tab: any, index: number) => {
      const tabId = String(tab?.id || "").trim();
      const shouldUpdate = (activeTabId && tabId === activeTabId) || (!activeTabId && index === 0);
      if (!shouldUpdate) return tab;
      return {
        ...tab,
        content: String(nextHtml || ""),
      };
    });
    payload.tabs = nextTabs.length ? nextTabs : [{
      id: activeTabId || `tab-${activeId}`,
      title: record.title || "Page",
      content: String(nextHtml || ""),
    }];
    if (!payload.activeTabId) {
      payload.activeTabId = String(payload.tabs[0]?.id || `tab-${activeId}`);
    }
    await docApi.upsertRecord({
      ...record,
      payload,
      updatedAt: new Date().toISOString(),
    });
    await w.GoToolkitMemoOpenDocumentByLink?.(activeId);
    if (w.GoToolkitMemoInstance?.setValue) {
      w.GoToolkitMemoInstance.setValue(String(nextHtml || ""));
    }
  }, html);
}

async function renameMemoDocViaApi(page: Page, docId: string, nextTitle: string) {
  await page.evaluate(async ({ activeDocId, title }) => {
    const w = window as any;
    const docApi = w.goToolkitDocumentApi;
    if (!docApi?.getRecord || !docApi?.upsertRecord) throw new Error("document api unavailable");
    const record = await docApi.getRecord(String(activeDocId || "").trim());
    if (!record) throw new Error(`Missing memo record ${activeDocId}`);
    await docApi.upsertRecord({
      ...record,
      title: String(title || "").trim(),
      updatedAt: new Date().toISOString(),
    });
    await w.GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
  }, { activeDocId: docId, title: nextTitle });
}

async function getKnowledgePageCheckboxMeta(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll(".chat-memory-page-checkbox")).map((node: any) => {
      const input = node as HTMLInputElement;
      const label = input.closest("label");
      const text = String(label?.textContent || "").trim();
      return {
        rootId: String(input.dataset.rootId || ""),
        spaceId: String(input.dataset.spaceId || ""),
        checked: Boolean(input.checked),
        text,
      };
    });
  });
}

async function openKnowledgeMenu(page: Page) {
  const trigger = page.locator("#chatMemoryBtn");
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await expect(page.locator(".chat-memory-spaces-menu.open")).toBeVisible({ timeout: 30_000 });
}

async function waitForKnowledgeState(page: Page, expectedAllowedDocCount: number) {
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const w = window as any;
      const assist = w.GoToolkitAssistInstance;
      if (!assist) {
        return { ready: false, indexing: true, allowedDocCount: -1, selectedSpaceCount: -1 };
      }
      const allowed = await assist.getKnowledgeAllowedDocIdsForCurrentScope();
      return {
        ready: true,
        indexing: Boolean(assist.knowledgeIndexing),
        allowedDocCount: allowed instanceof Set ? allowed.size : -1,
        selectedSpaceCount: assist.selectedKnowledgeSpaceIds instanceof Set ? assist.selectedKnowledgeSpaceIds.size : -1,
      };
    });
  }, { timeout: 90_000 }).toMatchObject({
    ready: true,
    indexing: false,
    allowedDocCount: expectedAllowedDocCount,
  });
}

async function seedKnowledgeIndexFromMemoPages(page: Page, expectedDocumentIds: string[]) {
  return page.evaluate(async ({ documentIds, privateSpaceId }) => {
    const w = window as any;
    const assist = w.GoToolkitAssistInstance;
    if (!assist?.docManager) throw new Error("Assist/doc manager unavailable");
    await assist.docManager.waitReady?.();
    await assist.refreshKnowledgeModal({ skipAutoReindex: true });
    const allEntries = (Array.isArray(assist.knowledgeManifestEntries) ? assist.knowledgeManifestEntries : []);
    const entries = allEntries
      .filter((entry: any) => String(assist.getKnowledgeSpaceIdFromEntry?.(entry) || "") === String(privateSpaceId || ""))
      .filter((entry: any) => documentIds.includes(String(entry?.documentId || "").trim()));
    if (entries.length !== documentIds.length) {
      throw new Error(`Expected ${documentIds.length} private knowledge entries, found ${entries.length}. names=${JSON.stringify(allEntries.map((entry: any) => ({ documentId: String(entry?.documentId || ""), name: String(entry?.name || ""), title: String(entry?.fileName || "") })))}`);
    }
    await assist.docManager.deleteDocumentsBySourceTypes?.(assist.knowledgeConversationId, ["embedded"]);
    const files = entries.map((entry: any) => assist.createKnowledgeFile(String(entry?.memoText || ""), String(entry?.fileName || ""), "text/plain"));
    const metadata = new Map();
    entries.forEach((entry: any) => {
      metadata.set(String(entry?.fileName || ""), {
        name: String(entry?.name || ""),
        abstract: String(entry?.abstract || ""),
        updatedAt: Number(entry?.updatedAt || 0) || Date.now(),
        fileName: String(entry?.fileName || ""),
        scope: ["memo"],
      });
    });
    await assist.docManager.ingestFiles(files, assist.knowledgeConversationId, {
      sourceType: "embedded",
      metadata,
      skipEmbeddings: true,
      suppressEmbeddingsToaster: true,
    });
    await assist.refreshKnowledgeModal({ skipAutoReindex: true });
    return entries.map((entry: any) => ({
      documentId: String(entry?.documentId || ""),
      name: String(entry?.name || ""),
      fileName: String(entry?.fileName || ""),
    }));
  }, { documentIds: expectedDocumentIds, privateSpaceId: PRIVATE_SPACE_ID });
}

async function applyKnowledgeSelection(page: Page, selectedRootIds: string[]) {
  await page.evaluate(async ({ privateSpaceId, rootIds }) => {
    const w = window as any;
    const assist = w.GoToolkitAssistInstance;
    if (!assist) throw new Error("GoToolkitAssistInstance unavailable");
    await assist.refreshKnowledgeModal({ skipAutoReindex: true });
    const nextRoots = new Set((Array.isArray(rootIds) ? rootIds : []).map((value: any) => String(value || "").trim()).filter(Boolean));
    assist.selectedKnowledgeSpaceIds = nextRoots.size ? new Set([String(privateSpaceId || "")]) : new Set();
    assist.selectedKnowledgePageRootsBySpace = new Map();
    if (nextRoots.size) {
      assist.selectedKnowledgePageRootsBySpace.set(String(privateSpaceId || ""), nextRoots);
    }
    assist.persistSelectedKnowledgeSpaces(assist.selectedKnowledgeSpaceIds);
    assist.persistSelectedKnowledgePageRootsBySpace(assist.selectedKnowledgePageRootsBySpace);
    const selection = assist.buildKnowledgeSelectionFromSpaces(assist.knowledgeManifestEntries || []);
    assist.setKnowledgeModalSelection(selection);
    assist.renderMemorySpacesMenu?.();
    assist.updateHeaderDocumentCount?.();
  }, { privateSpaceId: PRIVATE_SPACE_ID, rootIds: selectedRootIds });
}

async function runKnowledgeQuery(page: Page, query: string) {
  return page.evaluate(async (value) => {
    const w = window as any;
    const assist = w.GoToolkitAssistInstance;
    if (!assist) throw new Error("GoToolkitAssistInstance unavailable");
    await assist.docManager?.waitReady?.();
    const params = assist.getRetrievalParamsForQuestion(String(value || ""));
    const hits = await assist.retrieveWithFallback(
      String(value || ""),
      assist.knowledgeConversationId,
      params,
      "knowledge",
      `pw-knowledge-${Date.now()}`
    );
    return (Array.isArray(hits) ? hits : []).map((hit: any) => ({
      docId: String(hit?.docId || ""),
      docName: String(hit?.docName || ""),
      text: String(hit?.text || ""),
    }));
  }, query);
}

function getHitDocNames(hits: Array<{ docName: string }>) {
  const names = Array.from(new Set(hits.map(hit => hit.docName).filter(Boolean)));
  return names;
}

function getTokenMatchingHits(hits: Array<{ text: string }>, token: string) {
  const needle = String(token || "").trim();
  if (!needle) return [];
  return hits.filter(hit => String(hit?.text || "").includes(needle));
}

function expectHitNamesToInclude(hits: Array<{ docName: string }>, expectedNames: string[]) {
  const names = getHitDocNames(hits);
  for (const expectedName of expectedNames) {
    expect(names).toContain(expectedName);
  }
}

function expectHitNamesToExclude(hits: Array<{ docName: string }>, forbiddenNames: string[]) {
  const names = getHitDocNames(hits);
  for (const forbiddenName of forbiddenNames) {
    expect(names).not.toContain(forbiddenName);
  }
}

function expectHitNamesToEqual(hits: Array<{ docName: string }>, expectedNames: string[]) {
  expect(getHitDocNames(hits).slice().sort()).toEqual(expectedNames.slice().sort());
}

test.describe("Assist knowledge selection", () => {
  test("returns chunk hits only for currently selected knowledge pages", async ({ page }) => {
    test.setTimeout(240_000);
    const logStep = createStepLogger("assist-knowledge-selection");
    attachPageDebugLogging(page, "assist-knowledge-selection");

    const ts = Date.now();
    const sharedToken = `PW_SHARED_SELECTION_${ts}_FANOUT`;
    const sample1SharedPath = createImportedFixtureWithSharedMarker(SAMPLE_1_TEXT, sharedToken, `assist-knowledge-selection-sample1-${ts}.md`);
    const sample2SharedPath = createImportedFixtureWithSharedMarker(SAMPLE_2_TEXT, sharedToken, `assist-knowledge-selection-sample2-${ts}.md`);
    const generatedA = {
      title: `PW Knowledge A ${ts}`,
      token: `PW_ALPHA_CONTEXT_${ts}_ZXQH`,
      html: `<h1>PW Knowledge A ${ts}</h1><p>${`Alpha unique context ${ts} `.repeat(80)}PW_ALPHA_CONTEXT_${ts}_ZXQH</p><p>${sharedToken}</p>`,
    };
    const generatedB = {
      title: `PW Knowledge B ${ts}`,
      token: `PW_BETA_CONTEXT_${ts}_RMDV`,
      html: `<h1>PW Knowledge B ${ts}</h1><p>${`Beta unique context ${ts} `.repeat(80)}PW_BETA_CONTEXT_${ts}_RMDV</p><p>${sharedToken}</p>`,
    };
    const importedA = {
      title: `PW Sample One ${ts}`,
      token: "tentative de renseigner plusieurs fois un faux code",
    };
    const importedB = {
      title: `PW Sample Two ${ts}`,
      token: "L'assistance IA puissante",
    };

    await page.goto(BASE_URL, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    await waitForMemoReady(page, 45_000);
    await ensureAssist(page);
    await installFastEmbeddingHarness(page);
    logStep("memo-ready");

    const generatedADocId = await createLocalMemoPageFromUiAndReturnId(page, 45_000);
    await renameMemoDocViaApi(page, generatedADocId, generatedA.title);
    await setActiveDocHtml(page, generatedA.html);

    const generatedBDocId = await createLocalMemoPageFromUiAndReturnId(page, 45_000);
    await renameMemoDocViaApi(page, generatedBDocId, generatedB.title);
    await setActiveDocHtml(page, generatedB.html);

    const importedADocId = await createLocalMemoPageFromUiAndReturnId(page, 45_000);
    await renameMemoDocViaApi(page, importedADocId, importedA.title);
    await importMemoFileViaMenu(page, sample1SharedPath, 45_000);
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || "")), { timeout: 60_000 }).toContain("tentative de renseigner plusieurs fois un faux code");
    await expect.poll(() => page.evaluate((marker) => String((window as any).GoToolkitMemoInstance?.getValue?.() || "").includes(String(marker || "")), sharedToken), { timeout: 60_000 }).toBeTruthy();

    const importedBDocId = await createLocalMemoPageFromUiAndReturnId(page, 45_000);
    await renameMemoDocViaApi(page, importedBDocId, importedB.title);
    await importMemoFileViaMenu(page, sample2SharedPath, 45_000);
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || "")), { timeout: 60_000 }).toContain("L'assistance IA puissante");
    await expect.poll(() => page.evaluate((marker) => String((window as any).GoToolkitMemoInstance?.getValue?.() || "").includes(String(marker || "")), sharedToken), { timeout: 60_000 }).toBeTruthy();

    await refreshMemoExplorer(page);
    await page.evaluate(() => (window as any).GoToolkitAssistInstance?.open?.());
    await page.waitForTimeout(500);

    const ingestedEntries = await seedKnowledgeIndexFromMemoPages(page, [
      generatedADocId,
      generatedBDocId,
      importedADocId,
      importedBDocId,
    ]);
    logStep("ingested-entries", ingestedEntries);

    await openKnowledgeMenu(page);

    const initialPageBoxes = await getKnowledgePageCheckboxMeta(page);
    logStep("initial-knowledge-page-boxes", initialPageBoxes);
    expect(initialPageBoxes).toHaveLength(4);

    const rootIds = new Set(initialPageBoxes.map(item => item.rootId));
    const generatedARootId = rootIds.has(generatedADocId) ? generatedADocId : "";
    const generatedBRootId = rootIds.has(generatedBDocId) ? generatedBDocId : "";
    const importedARootId = rootIds.has(importedADocId) ? importedADocId : "";
    const importedBRootId = rootIds.has(importedBDocId) ? importedBDocId : "";
    expect(generatedARootId).toBeTruthy();
    expect(generatedBRootId).toBeTruthy();
    expect(importedARootId).toBeTruthy();
    expect(importedBRootId).toBeTruthy();
    const pageLabelByRootId = new Map(initialPageBoxes.map(item => [item.rootId, item.text]));

    const allSelectedExpectedNames = [
      pageLabelByRootId.get(String(generatedARootId)),
      pageLabelByRootId.get(String(generatedBRootId)),
      pageLabelByRootId.get(String(importedARootId)),
      pageLabelByRootId.get(String(importedBRootId)),
    ].filter(Boolean) as string[];

    await applyKnowledgeSelection(page, [
      String(generatedARootId),
      String(generatedBRootId),
      String(importedARootId),
      String(importedBRootId),
    ]);
    await waitForKnowledgeState(page, 4);

    const allGeneratedAHits = await runKnowledgeQuery(page, generatedA.token);
    const allGeneratedBHits = await runKnowledgeQuery(page, generatedB.token);
    const allImportedAHits = await runKnowledgeQuery(page, importedA.token);
    const allImportedBHits = await runKnowledgeQuery(page, importedB.token);
    logStep("all-selection-hits", {
      generatedA: allGeneratedAHits,
      generatedB: allGeneratedBHits,
      importedA: allImportedAHits,
      importedB: allImportedBHits,
    });
    const allSharedHits = await runKnowledgeQuery(page, sharedToken);
    logStep("all-selection-shared-hits", allSharedHits);
    expect(getTokenMatchingHits(allGeneratedAHits, generatedA.token)).not.toHaveLength(0);
    expect(getTokenMatchingHits(allGeneratedBHits, generatedB.token)).not.toHaveLength(0);
    expect(getTokenMatchingHits(allImportedAHits, importedA.token)).not.toHaveLength(0);
    expect(getTokenMatchingHits(allImportedBHits, importedB.token)).not.toHaveLength(0);
    expectHitNamesToEqual(getTokenMatchingHits(allSharedHits, sharedToken) as Array<{ docName: string }>, allSelectedExpectedNames);

    await applyKnowledgeSelection(page, [
      String(generatedARootId),
      String(importedARootId),
    ]);
    await waitForKnowledgeState(page, 2);

    const twoOfFourGeneratedAHits = await runKnowledgeQuery(page, generatedA.token);
    const twoOfFourGeneratedBHits = await runKnowledgeQuery(page, generatedB.token);
    const twoOfFourImportedAHits = await runKnowledgeQuery(page, importedA.token);
    const twoOfFourImportedBHits = await runKnowledgeQuery(page, importedB.token);
    logStep("two-of-four-hits", {
      generatedA: twoOfFourGeneratedAHits,
      generatedB: twoOfFourGeneratedBHits,
      importedA: twoOfFourImportedAHits,
      importedB: twoOfFourImportedBHits,
    });
    const twoOfFourSharedHits = await runKnowledgeQuery(page, sharedToken);
    logStep("two-of-four-shared-hits", twoOfFourSharedHits);
    expect(getTokenMatchingHits(twoOfFourGeneratedAHits, generatedA.token)).not.toHaveLength(0);
    expectHitNamesToExclude(twoOfFourGeneratedAHits, [generatedB.title, "Page 5"]);
    expect(getTokenMatchingHits(twoOfFourGeneratedBHits, generatedB.token)).toHaveLength(0);
    expect(getTokenMatchingHits(twoOfFourImportedAHits, importedA.token)).not.toHaveLength(0);
    expectHitNamesToExclude(twoOfFourImportedAHits, [generatedB.title, "Page 5"]);
    expect(getTokenMatchingHits(twoOfFourImportedBHits, importedB.token)).toHaveLength(0);
    expectHitNamesToEqual(
      getTokenMatchingHits(twoOfFourSharedHits, sharedToken) as Array<{ docName: string }>,
      [
        pageLabelByRootId.get(String(generatedARootId)),
        pageLabelByRootId.get(String(importedARootId)),
      ].filter(Boolean) as string[]
    );

    await applyKnowledgeSelection(page, [
      String(generatedARootId),
      String(generatedBRootId),
      String(importedARootId),
    ]);
    await waitForKnowledgeState(page, 3);

    const threeOfFourGeneratedAHits = await runKnowledgeQuery(page, generatedA.token);
    const threeOfFourGeneratedBHits = await runKnowledgeQuery(page, generatedB.token);
    const threeOfFourImportedAHits = await runKnowledgeQuery(page, importedA.token);
    const threeOfFourImportedBHits = await runKnowledgeQuery(page, importedB.token);
    logStep("three-of-four-hits", {
      generatedA: threeOfFourGeneratedAHits,
      generatedB: threeOfFourGeneratedBHits,
      importedA: threeOfFourImportedAHits,
      importedB: threeOfFourImportedBHits,
    });
    const threeOfFourSharedHits = await runKnowledgeQuery(page, sharedToken);
    logStep("three-of-four-shared-hits", threeOfFourSharedHits);
    expect(getTokenMatchingHits(threeOfFourGeneratedAHits, generatedA.token)).not.toHaveLength(0);
    expectHitNamesToExclude(threeOfFourGeneratedAHits, ["Page 5"]);
    expect(getTokenMatchingHits(threeOfFourGeneratedBHits, generatedB.token)).not.toHaveLength(0);
    expectHitNamesToExclude(threeOfFourGeneratedBHits, ["Page 5"]);
    expect(getTokenMatchingHits(threeOfFourImportedAHits, importedA.token)).not.toHaveLength(0);
    expectHitNamesToExclude(threeOfFourImportedAHits, ["Page 5"]);
    expect(getTokenMatchingHits(threeOfFourImportedBHits, importedB.token)).toHaveLength(0);
    expectHitNamesToEqual(
      getTokenMatchingHits(threeOfFourSharedHits, sharedToken) as Array<{ docName: string }>,
      [
        pageLabelByRootId.get(String(generatedARootId)),
        pageLabelByRootId.get(String(generatedBRootId)),
        pageLabelByRootId.get(String(importedARootId)),
      ].filter(Boolean) as string[]
    );

    await applyKnowledgeSelection(page, []);
    await waitForKnowledgeState(page, 0);

    const noSelectionGeneratedAHits = await runKnowledgeQuery(page, generatedA.token);
    const noSelectionGeneratedBHits = await runKnowledgeQuery(page, generatedB.token);
    const noSelectionImportedAHits = await runKnowledgeQuery(page, importedA.token);
    const noSelectionImportedBHits = await runKnowledgeQuery(page, importedB.token);
    logStep("no-selection-hits", {
      generatedA: noSelectionGeneratedAHits,
      generatedB: noSelectionGeneratedBHits,
      importedA: noSelectionImportedAHits,
      importedB: noSelectionImportedBHits,
    });
    const noSelectionSharedHits = await runKnowledgeQuery(page, sharedToken);
    logStep("no-selection-shared-hits", noSelectionSharedHits);
    expect(getTokenMatchingHits(noSelectionGeneratedAHits, generatedA.token)).toHaveLength(0);
    expect(getTokenMatchingHits(noSelectionGeneratedBHits, generatedB.token)).toHaveLength(0);
    expect(getTokenMatchingHits(noSelectionImportedAHits, importedA.token)).toHaveLength(0);
    expect(getTokenMatchingHits(noSelectionImportedBHits, importedB.token)).toHaveLength(0);
    expectHitNamesToEqual(getTokenMatchingHits(noSelectionSharedHits, sharedToken) as Array<{ docName: string }>, []);

    const finalSnapshot = await page.evaluate(() => {
      const w = window as any;
      const assist = w.GoToolkitAssistInstance;
      return {
        currentScopeId: String(assist?.currentConversationScopeId || ""),
        selectedSpaces: assist?.selectedKnowledgeSpaceIds instanceof Set
          ? Array.from(assist.selectedKnowledgeSpaceIds)
          : [],
        currentDocId: String(w.GoToolkitMemoGetActiveDocumentId?.() || ""),
        sample1Length: String((window as any).GoToolkitMemoInstance?.getValue?.() || "").length,
      };
    });
    logStep("final-snapshot", finalSnapshot);

    await page.screenshot({ path: "tests/results/assist-knowledge-selection.png", fullPage: true });

    expect(SAMPLE_1_TEXT).toContain(importedA.token);
    expect(SAMPLE_2_TEXT).toContain(importedB.token);
    expect([generatedADocId, generatedBDocId, importedADocId, importedBDocId].filter(Boolean)).toHaveLength(4);
  });
});
