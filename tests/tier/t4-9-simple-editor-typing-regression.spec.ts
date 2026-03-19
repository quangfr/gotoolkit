import { expect, Page, test } from "@playwright/test";
import path from "node:path";

import { waitForMemoReady } from "../helpers/memo-ui";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const SAMPLE_MARKDOWN_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const HUMAN_DELAYS = [34, 62, 49, 88, 41, 73, 57];
const MID_SENTENCE_NEEDLE = "Un diagramme de séquence décrit les interactions entre les acteurs humains / systèmes.";
const MID_INSERT_TEXT = " [PW_MID_EDIT]";
const MID_TAIL_TEXT = " et garde le curseur stable";
const INSERTED_H2_TEXT = "Playwright H2 Heading";
const INSERTED_LINK_LABEL = "Playwright Link";
const INSERTED_LINK_URL = "https://example.com/playwright-regression";

type EditorSnapshot = {
  text: string;
  html: string;
  selection: { from: number; to: number; empty: boolean } | null;
  inlineDisplay: string;
  inlineInputValue: string;
};

async function importSampleIntoAutoDoc(page: Page) {
  await page.evaluate(async () => {
    const w = window as any;
    await w.GoToolkitMemoCreateAutoDocument();
  });
  await page.waitForFunction(() => Boolean(String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim()), null, { timeout: 45_000 });
  await waitForVisibleEditor(page);
  await page.evaluate(() => {
    (window as any).GoToolkitMemoInstance?.setValue?.("");
  });
  await page.locator("#fileMenuBtn").click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#memoOpenImportBtn").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(SAMPLE_MARKDOWN_PATH);
  await expect.poll(() => readSnapshot(page), { timeout: 90_000 }).toMatchObject({
    text: expect.stringContaining("Artefacts PO"),
    html: expect.stringContaining("Requêtes API"),
  });
  const docId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim());
  expect(docId).toBeTruthy();
  return docId;
}

async function waitForVisibleEditor(page: Page, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(async () => {
      const memoState = (window as any).__memoState;
      const activeTabId = String(memoState?.activeTabId || "").trim();
      const activeTab = Array.isArray(memoState?.tabs)
        ? memoState.tabs.find((tab: any) => String(tab?.id || "").trim() === activeTabId) || null
        : null;
      const proseMirror = document.querySelector(".editor-wrap .ProseMirror") as HTMLElement | null;
      if (proseMirror && proseMirror.offsetWidth > 0 && proseMirror.offsetHeight > 0) {
        return true;
      }
      const activeDocId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim();
      if (activeDocId) {
        await (window as any).GoToolkitMemoSetActiveDocument?.(activeDocId);
      }
      const bridge = (window as any).GoToolkitMemoInstance;
      if (bridge && typeof bridge.switchTo === "function" && activeTabId) {
        bridge.switchTo(activeTabId, String(activeTab?.content || ""));
      }
      return false;
    });
    if (ready) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`Visible memo editor did not appear within ${timeout}ms`);
}

async function readSnapshot(page: Page): Promise<EditorSnapshot> {
  return page.evaluate(() => {
    const editor = (window as any).memoEditor || (window as any).MemoEditor;
    const proseMirror = document.querySelector(".editor-wrap .ProseMirror") as HTMLElement | null;
    const inlineContainer = document.getElementById("chat-inline-editor-container") as HTMLElement | null;
    const inlineInput = document.getElementById("chat-inline-editor-input") as HTMLTextAreaElement | null;
    const selection = editor?.state?.selection
      ? {
          from: Number(editor.state.selection.from),
          to: Number(editor.state.selection.to),
          empty: Boolean(editor.state.selection.empty),
        }
      : null;
    return {
      text: String(proseMirror?.textContent || ""),
      html: String(editor?.getHTML?.() || ""),
      selection,
      inlineDisplay: inlineContainer ? getComputedStyle(inlineContainer).display : "missing",
      inlineInputValue: String(inlineInput?.value || ""),
    };
  });
}

async function waitForEditorSettle(page: Page, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  let previousFingerprint = "";
  while (Date.now() < deadline) {
    const snapshot = await readSnapshot(page);
    const nextFingerprint = JSON.stringify({
      html: snapshot.html,
      selection: snapshot.selection,
      inlineDisplay: snapshot.inlineDisplay,
    });
    if (previousFingerprint && previousFingerprint === nextFingerprint) {
      return snapshot;
    }
    previousFingerprint = nextFingerprint;
    await page.waitForTimeout(200);
  }
  return readSnapshot(page);
}

async function expectStableEditor(page: Page, expectedText: string, minimumCaretFrom: number, label: string) {
  const snapshot = await readSnapshot(page);
  expect(snapshot.inlineDisplay, `${label}: inline editor should stay hidden`).toBe("none");
  expect(snapshot.inlineInputValue, `${label}: inline input should stay empty`).toBe("");
  expect(snapshot.text, `${label}: editor text mismatch`).toContain(expectedText);
  expect(snapshot.selection?.empty, `${label}: selection should stay collapsed`).toBe(true);
  expect(snapshot.selection?.from ?? 0, `${label}: caret should keep moving forward`).toBeGreaterThanOrEqual(minimumCaretFrom);
}

async function humanType(page: Page, value: string, options: { label: string; allowSamePosition?: boolean }) {
  let lastCaretFrom = (await readSnapshot(page)).selection?.from ?? 0;
  let delayIndex = 0;
  for (const char of value) {
    const nextDelay = HUMAN_DELAYS[delayIndex % HUMAN_DELAYS.length];
    delayIndex += 1;
    if (char === "\n") {
      await page.keyboard.press("Enter");
    } else if (char === " ") {
      await page.keyboard.press("Space");
    } else {
      await page.keyboard.type(char);
    }
    await page.waitForTimeout(nextDelay);
    const snapshot = await readSnapshot(page);
    expect(snapshot.inlineDisplay, `${options.label}: inline editor should stay hidden while typing`).toBe("none");
    expect(snapshot.inlineInputValue, `${options.label}: inline input should stay empty while typing`).toBe("");
    expect(snapshot.selection?.empty, `${options.label}: selection should stay collapsed while typing`).toBe(true);
    const currentCaretFrom = snapshot.selection?.from ?? 0;
    if (options.allowSamePosition) {
      expect(currentCaretFrom, `${options.label}: caret moved backwards after typing ${JSON.stringify(char)}`).toBeGreaterThanOrEqual(lastCaretFrom);
    } else {
      expect(currentCaretFrom, `${options.label}: caret did not advance after typing ${JSON.stringify(char)}`).toBeGreaterThan(lastCaretFrom);
    }
    lastCaretFrom = currentCaretFrom;
  }
}

async function setCaretAfterNeedle(page: Page, needle: string, occurrence = 1) {
  await page.evaluate(({ textNeedle, targetOccurrence }) => {
    const editor = (window as any).memoEditor || (window as any).MemoEditor;
    if (!editor?.state?.doc || typeof editor.chain?.().focus !== "function") {
      throw new Error("Memo editor is unavailable");
    }
    const expectedOccurrence = Math.max(1, Number(targetOccurrence) || 1);
    let seen = 0;
    let resolvedPos: number | null = null;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (resolvedPos !== null || !node?.isText || !node.text) return true;
      const text = String(node.text || "");
      const index = text.indexOf(String(textNeedle || ""));
      if (index < 0) return true;
      seen += 1;
      if (seen !== expectedOccurrence) return true;
      resolvedPos = pos + index + String(textNeedle || "").length;
      return false;
    });
    if (!resolvedPos) {
      throw new Error(`Needle not found in editor text: ${textNeedle}`);
    }
    editor.chain().focus().setTextSelection({ from: resolvedPos, to: resolvedPos }).run();
  }, { textNeedle: needle, targetOccurrence: occurrence });
}

async function setCaretToDocumentEnd(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).memoEditor || (window as any).MemoEditor;
    if (!editor?.state?.doc || typeof editor.chain?.().focus !== "function") {
      throw new Error("Memo editor is unavailable");
    }
    const endPos = Math.max(1, Number(editor.state.doc.content.size || 1));
    editor.chain().focus().setTextSelection({ from: endPos, to: endPos }).run();
  });
}

async function waitForSlashMenu(page: Page) {
  const menu = page.locator(".memo-slash-actions-menu").first();
  await expect(menu).toBeVisible({ timeout: 10_000 });
  return menu;
}

async function runSlashAction(page: Page, query: string) {
  await humanType(page, `/${query}`, { label: `slash-${query}` });
  await waitForSlashMenu(page);
  await page.keyboard.press("Enter");
}

async function insertLinkViaSlashMenu(page: Page, url: string, label: string) {
  await runSlashAction(page, "link");
  const queryInput = page.locator(".link-search-modal__search-input").first();
  const labelInput = page.locator(".link-search-modal__query").first();
  await expect(queryInput).toBeVisible({ timeout: 10_000 });
  await queryInput.fill(url);
  await labelInput.fill(label);
  await labelInput.press("Enter");
}

test.describe("Simple editor typing regression", () => {
  test("keeps mid-document typing stable and supports slash h2/link insertion in sample content", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(`${BASE_URL}/index.html`);
    await waitForMemoReady(page, 45_000);
    const docId = await importSampleIntoAutoDoc(page);
    await waitForVisibleEditor(page);

    const editor = page.locator(".editor-wrap .ProseMirror[contenteditable='true']").first();
    await expect(editor).toBeVisible();
    await editor.click();
    await waitForEditorSettle(page);

    await setCaretAfterNeedle(page, MID_SENTENCE_NEEDLE);
    const beforeMidEdit = await readSnapshot(page);
    const midEditMinimumCaret = Number(beforeMidEdit.selection?.from || 1) + MID_INSERT_TEXT.length;
    await humanType(page, MID_INSERT_TEXT, { label: "mid-edit" });
    await expectStableEditor(page, `${MID_SENTENCE_NEEDLE}${MID_INSERT_TEXT}`, midEditMinimumCaret, "after-mid-edit");

    await page.waitForTimeout(150);
    await page.evaluate(async currentDocId => {
      await (window as any).GoToolkitMemoSetActiveDocument?.(String(currentDocId || ""));
    }, docId);
    await page.waitForTimeout(220);
    await expectStableEditor(page, `${MID_SENTENCE_NEEDLE}${MID_INSERT_TEXT}`, midEditMinimumCaret, "after-same-doc-refresh");

    const beforeTailEdit = await readSnapshot(page);
    const tailMinimumCaret = Number(beforeTailEdit.selection?.from || 1) + MID_TAIL_TEXT.length;
    await humanType(page, MID_TAIL_TEXT, { label: "mid-tail-edit" });
    await expectStableEditor(page, `${MID_SENTENCE_NEEDLE}${MID_INSERT_TEXT}${MID_TAIL_TEXT}`, tailMinimumCaret, "after-mid-tail-edit");

    await setCaretToDocumentEnd(page);
    await humanType(page, "\n", { label: "before-slash-h2" });
    await runSlashAction(page, "h2");
    const beforeHeadingText = await readSnapshot(page);
    const headingMinimumCaret = Number(beforeHeadingText.selection?.from || 1) + INSERTED_H2_TEXT.length;
    await humanType(page, INSERTED_H2_TEXT, { label: "slash-h2-text" });
    await expectStableEditor(page, INSERTED_H2_TEXT, headingMinimumCaret, "after-slash-h2");

    await humanType(page, "\n", { label: "before-slash-link" });
    await insertLinkViaSlashMenu(page, INSERTED_LINK_URL, INSERTED_LINK_LABEL);
    const finalSnapshot = await readSnapshot(page);
    expect(finalSnapshot.text, "after-link: link label should be visible").toContain(INSERTED_LINK_LABEL);
    expect(finalSnapshot.html, "after-link: heading should be persisted as h2").toContain(`>${INSERTED_H2_TEXT}</h2>`);
    expect(finalSnapshot.html, "after-link: link href should be persisted").toContain(`href="${INSERTED_LINK_URL}"`);
    expect(finalSnapshot.inlineDisplay, "after-link: inline editor should stay hidden").toBe("none");
    expect(finalSnapshot.inlineInputValue, "after-link: inline input should stay empty").toBe("");
  });
});
