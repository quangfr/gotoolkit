import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  clickMemoDoc,
  createLocalMemoPageFromUi,
  getMemoDocItem,
  getMemoEditorHtml,
  typeIntoVisibleEditor,
  waitForMemoReady,
} from "../helpers/memo-ui";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const SAMPLE_1_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const SAMPLE_2_PATH = path.resolve(process.cwd(), "tests/fixtures/sample2.md");
const DEBUG_PREFIX = "private-performance-audit";
const DEFAULT_TIMEOUT = 120_000;
const SAMPLE_1_TOKEN = "Démarche d'analyse PO";
const SAMPLE_2_TOKEN = "Guide Mémo";

type StepTiming = {
  name: string;
  durationMs: number;
  docId?: string;
  htmlLength?: number;
  storedLength?: number;
};

type RefreshDebugEvent = {
  event: string;
  payload: Record<string, unknown>;
};

type SmallEditMetrics = {
  visibleDurationMs: number;
  persistenceDurationMs: number | null;
  htmlLength: number;
  storedLength: number;
};

function requireFixturePath(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required fixture: ${filePath}`);
  }
  return filePath;
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

async function openImportDialogAndSetFile(page: any, filePath: string) {
  await page.locator("#fileMenuBtn").click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#memoOpenImportBtn").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
}

async function waitForPrivateRecordContent(page: any, docId: string, predicate: (html: string) => boolean, timeout = DEFAULT_TIMEOUT) {
  await expect.poll(async () => {
    const html = await page.evaluate(async (currentDocId: string) => {
      const docApi = (window as any).goToolkitDocumentApi;
      const record = currentDocId && docApi?.getRecord ? await docApi.getRecord(currentDocId).catch(() => null) : null;
      return String(record?.payload?.tabs?.[0]?.content || record?.payload || "");
    }, docId);
    return predicate(html);
  }, { timeout }).toBe(true);
}

async function getStoredLength(page: any, docId: string) {
  return page.evaluate(async (currentDocId: string) => {
    const docApi = (window as any).goToolkitDocumentApi;
    const record = currentDocId && docApi?.getRecord ? await docApi.getRecord(currentDocId).catch(() => null) : null;
    return String(record?.payload?.tabs?.[0]?.content || record?.payload || "").length;
  }, docId);
}

async function getActiveDocId(page: any) {
  return page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim());
}

async function createImportedPrivateDoc(page: any, filePath: string, sampleToken: string) {
  await createLocalMemoPageFromUi(page, DEFAULT_TIMEOUT);
  const docId = await getActiveDocId(page);
  if (!docId) throw new Error("Missing active doc id after creating private page");
  await openImportDialogAndSetFile(page, filePath);
  await expect.poll(() => getMemoEditorHtml(page), { timeout: DEFAULT_TIMEOUT }).toContain(sampleToken);
  await waitForPrivateRecordContent(page, docId, html => html.includes(sampleToken));
  const htmlLength = await getMemoEditorHtml(page).then(html => html.length);
  const storedLength = await getStoredLength(page, docId);
  return { docId, htmlLength, storedLength };
}

async function appendLargeEdit(page: any, docId: string, marker: string) {
  const markdownBlock = Array.from({ length: 80 }, (_, index) => (
    `### ${marker} section ${index + 1}\n\n` +
    `- ${marker} bullet ${index + 1}A\n` +
    `- ${marker} bullet ${index + 1}B\n` +
    `- ${marker} bullet ${index + 1}C\n`
  )).join("\n");
  const insertValue = `\n\n## ${marker}\n\n${markdownBlock}\n`;
  await page.evaluate(async (value: string) => {
    const w = window as any;
    if (typeof w.insertEditorMarkdownAtEnd === "function") {
      w.insertEditorMarkdownAtEnd(value);
    } else if (typeof w.GoToolkitMemoAppendText === "function") {
      w.GoToolkitMemoAppendText(value);
    } else {
      throw new Error("No programmatic memo insert API available");
    }
    await w.GoToolkitMemoAfterProgrammaticInsert?.();
  }, insertValue);
  await expect.poll(() => getMemoEditorHtml(page), { timeout: DEFAULT_TIMEOUT }).toContain(marker);
  await waitForPrivateRecordContent(page, docId, html => html.includes(marker));
  return {
    htmlLength: await getMemoEditorHtml(page).then(html => html.length),
    storedLength: await getStoredLength(page, docId),
  };
}

async function applySmallEdit(page: any, docId: string, marker: string): Promise<SmallEditMetrics> {
  const startedAt = performance.now();
  await typeIntoVisibleEditor(page, ` ${marker}`, 30_000, { clickBeforeType: true });
  await expect.poll(() => getMemoEditorHtml(page), { timeout: DEFAULT_TIMEOUT }).toContain(marker);
  const visibleDurationMs = Math.round(performance.now() - startedAt);
  let persistenceDurationMs: number | null = null;
  try {
    await waitForPrivateRecordContent(page, docId, html => html.includes(marker), 15_000);
    persistenceDurationMs = Math.round(performance.now() - startedAt);
  } catch {
    persistenceDurationMs = null;
  }
  return {
    visibleDurationMs,
    persistenceDurationMs,
    htmlLength: await getMemoEditorHtml(page).then(html => html.length),
    storedLength: await getStoredLength(page, docId),
  };
}

async function switchToDoc(page: any, docId: string, expectedToken: string) {
  const item = getMemoDocItem(page, docId);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await clickMemoDoc(page, docId, { allowProgrammaticOpen: false });
  await expect.poll(() => getActiveDocId(page), { timeout: 30_000 }).toBe(docId);
  await expect.poll(() => getMemoEditorHtml(page), { timeout: 30_000 }).toContain(expectedToken);
  const htmlLength = await getMemoEditorHtml(page).then(html => html.length);
  const storedLength = await getStoredLength(page, docId);
  return { htmlLength, storedLength };
}

async function measureStep<T>(steps: StepTiming[], name: string, run: () => Promise<T & { docId?: string; htmlLength?: number; storedLength?: number }>) {
  const startedAt = performance.now();
  const result = await run();
  steps.push({
    name,
    durationMs: Math.round(performance.now() - startedAt),
    docId: result.docId,
    htmlLength: result.htmlLength,
    storedLength: result.storedLength,
  });
  return result;
}

test.describe("Private performance audit", () => {
  test("measures create/import, edit, and page switch timings on private storage", async ({ page }) => {
    test.setTimeout(240_000);

    const sample1Path = requireFixturePath(SAMPLE_1_PATH);
    const sample2Path = requireFixturePath(SAMPLE_2_PATH);
    const runId = Date.now();
    const smallEditMarker = `SMALL_EDIT_${runId}`;
    const largeEditMarker = `LARGE_EDIT_${runId}`;
    const steps: StepTiming[] = [];
    let smallEditMetrics: SmallEditMetrics | null = null;
    const refreshEvents: RefreshDebugEvent[] = [];

    page.on("console", msg => {
      const text = msg.text();
      const match = text.match(/\[MemoRefreshDebug\]\s+([^\s]+)\s+(.*)$/);
      if (!match) return;
      const [, event, rawPayload] = match;
      let payload: Record<string, unknown> = {};
      try {
        payload = rawPayload ? JSON.parse(rawPayload) : {};
      } catch {
        payload = { raw: rawPayload };
      }
      refreshEvents.push({ event, payload });
    });

    console.log(`[${DEBUG_PREFIX}] fixture-paths`, {
      sample1Path,
      sample2Path,
    });

    await page.goto(BASE_URL, { waitUntil: "commit", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
        localStorage.setItem("goToolkit.memo.refreshDebug.v1", "1");
      } catch {
        // ignore
      }
    });
    await waitForMemoReady(page, 45_000);
    await ensureAssist(page);

    const create1 = await measureStep(steps, "create 1", async () => {
      return createImportedPrivateDoc(page, sample1Path, SAMPLE_1_TOKEN);
    });

    const create2 = await measureStep(steps, "create 2", async () => {
      return createImportedPrivateDoc(page, sample2Path, SAMPLE_2_TOKEN);
    });

    await expect(getMemoDocItem(page, create1.docId)).toBeVisible({ timeout: 30_000 });
    await expect(getMemoDocItem(page, create2.docId)).toBeVisible({ timeout: 30_000 });

    await measureStep(steps, "large edit 2", async () => {
      return appendLargeEdit(page, create2.docId, largeEditMarker);
    });

    await measureStep(steps, "page switch to 1", async () => {
      return switchToDoc(page, create1.docId, SAMPLE_1_TOKEN);
    });

    await measureStep(steps, "small edit 1", async () => {
      smallEditMetrics = await applySmallEdit(page, create1.docId, smallEditMarker);
      return {
        htmlLength: smallEditMetrics.htmlLength,
        storedLength: smallEditMetrics.storedLength,
      };
    });

    await measureStep(steps, "page switch to 2", async () => {
      return switchToDoc(page, create2.docId, SAMPLE_2_TOKEN);
    });

    const summary = Object.fromEntries(steps.map(step => [step.name, step.durationMs]));
    const smallEditSummary = smallEditMetrics
      ? {
          visibleResponseMs: smallEditMetrics.visibleDurationMs,
          persistenceMs: smallEditMetrics.persistenceDurationMs,
        }
      : null;
    const relevantRefreshEvents = refreshEvents.filter(item => (
      item.event.startsWith("update-active-tab-content:")
      || item.event.startsWith("persist-state:")
      || item.event.startsWith("document-api:upsert:")
      || item.event.startsWith("schedule-local-save")
      || item.event.startsWith("save-document:")
    ));
    console.log(`[${DEBUG_PREFIX}] timings`, JSON.stringify(steps, null, 2));
    console.log(`[${DEBUG_PREFIX}] summary`, JSON.stringify(summary, null, 2));
    console.log(`[${DEBUG_PREFIX}] small-edit`, JSON.stringify(smallEditSummary, null, 2));
    console.log(`[${DEBUG_PREFIX}] refresh-events`, JSON.stringify(relevantRefreshEvents, null, 2));

    expect(steps).toHaveLength(6);
    expect(summary["create 1"]).toBeGreaterThan(0);
    expect(summary["create 2"]).toBeGreaterThan(0);
    expect(summary["large edit 2"]).toBeGreaterThan(0);
    expect(summary["page switch to 1"]).toBeGreaterThan(0);
    expect(summary["small edit 1"]).toBeGreaterThan(0);
    expect(summary["page switch to 2"]).toBeGreaterThan(0);
  });
});
