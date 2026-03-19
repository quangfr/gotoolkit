import { expect, Page, test } from "@playwright/test";
import { waitForMemoReady } from "../helpers/memo-ui";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const HUMAN_DELAYS = [34, 62, 49, 88, 41, 73, 57];

type EditorSnapshot = {
  text: string;
  html: string;
  selection: { from: number; to: number; empty: boolean } | null;
  inlineDisplay: string;
  inlineInputValue: string;
};

async function createLocalTypingDoc(page: Page) {
  const docId = await page.evaluate(async () => {
    const createDocument = (window as any).GoToolkitMemoCreateDocument;
    if (typeof createDocument !== "function") {
      throw new Error("GoToolkitMemoCreateDocument is unavailable");
    }
    return await createDocument({
      name: "Typing Regression",
      initialContent: "",
    });
  });
  return String(docId || "").trim();
}

async function reopenLocalTypingDoc(page: Page, docId: string, timeout = 45_000) {
  await page.goto(`${BASE_URL}/index.html`);
  await waitForMemoReady(page, timeout);
  await page.evaluate(async currentDocId => {
    await (window as any).GoToolkitMemoOpenDocumentByLink?.(String(currentDocId || ""));
  }, docId);
  await page.waitForFunction(expectedId => {
    return String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim() === String(expectedId || "").trim();
  }, docId, { timeout });
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
    const activeDocId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim());
    if (activeDocId) {
      const explorerItem = page.locator(`.document-explorer__item[data-document-id="${activeDocId}"]`).first();
      if (await explorerItem.isVisible().catch(() => false)) {
        await explorerItem.click({ force: true }).catch(() => null);
      }
    }
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

async function humanType(page: Page, value: string) {
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
  }
}

test.describe("Simple editor typing regression", () => {
  test("keeps human-paced typing stable across same-document refresh", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(`${BASE_URL}/index.html`);
    await waitForMemoReady(page, 45_000);

    const docId = await createLocalTypingDoc(page);
    await reopenLocalTypingDoc(page, docId);
    await waitForVisibleEditor(page);

    const editor = page.locator(".editor-wrap .ProseMirror[contenteditable='true']").first();
    await expect(editor).toBeVisible();
    await editor.click();
    await waitForEditorSettle(page);

    await humanType(page, "hello world");
    await expectStableEditor(page, "hello world", 12, "after-first-line");

    await page.waitForTimeout(150);
    await humanType(page, "\nslow human typing");
    await expectStableEditor(page, "hello worldslow human typing", 31, "after-second-line");

    await page.waitForTimeout(150);
    await page.evaluate(async currentDocId => {
      await (window as any).GoToolkitMemoSetActiveDocument?.(String(currentDocId || ""));
    }, docId);
    await page.waitForTimeout(220);
    await expectStableEditor(page, "hello worldslow human typing", 31, "after-same-doc-refresh");

    await humanType(page, " with more words");
    await expectStableEditor(page, "hello worldslow human typing with more words", 47, "after-tail-text");
  });
});
