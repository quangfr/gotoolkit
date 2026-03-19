import { expect, Page, test } from "@playwright/test";
import { dismissDocsTour, waitForMemoEditorVisible, waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const DEBUG_PREFIX = "assist-selection-modes";
const INITIAL_MARKDOWN = [
  "# PW Selection Modes",
  "",
  "Alpha paragraph with selection target and inline focus coverage.",
  "",
  "Beta paragraph keeps the rest of the document stable.",
].join("\n");

async function ensureAssistOpen(page: Page) {
  await page.evaluate(async () => {
    const w = window as any;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (w.GoToolkitAssistInstance?.open && w.GoToolkitAssistInstance?.textarea) {
        w.GoToolkitAssistInstance.open();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Assist instance unavailable");
  });
  await expect(page.locator("#assistSidebar")).toBeVisible({ timeout: 30_000 });
}

async function installStubbedAi(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__pwAssistRequests = [];
    w.GoToolkitIA = w.GoToolkitIA || {};
    w.GoToolkitIA.chatCompletion = async ({ payload }: any) => {
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const userMessage = [...messages].reverse().find((entry: any) => entry?.role === "user");
      const userContent = String(userMessage?.content || "");
      const pwTokenMatch = userContent.match(/PW_[A-Z0-9_]+/g);
      const askMatch = userContent.match(/ASK:\s*\n([\s\S]*?)(?:\n\n[A-Z_]+:|\s*$)/);
      const askText = String(
        (Array.isArray(pwTokenMatch) && pwTokenMatch.length ? pwTokenMatch[pwTokenMatch.length - 1] : "")
        || askMatch?.[1]
        || ""
      ).trim();
      const hasSelection = /\n\nSELECTION:\s*\n/.test(userContent);
      w.__pwAssistRequests.push({
        askText,
        hasSelection,
        userContent,
      });
      if (hasSelection) {
        return JSON.stringify({
          content: `selection:${askText}`,
          s_output: {
            text: `${askText} selection rewrite`
          }
        });
      }
      return JSON.stringify({
        content: `document:${askText}`,
        output: `# ${askText}\n\nPW_FULL_DOC_OUTPUT_${askText}`
      });
    };
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

async function collectBootstrapSnapshot(page: Page) {
  return page.evaluate(async () => {
    const w = window as any;
    const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const editors = Array.from(document.querySelectorAll(".ProseMirror")) as HTMLElement[];
    const visibleEditors = editors.filter(node => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 0
        && rect.height > 0;
    });
    const record = activeId && w.goToolkitDocumentApi?.getRecord
      ? await w.goToolkitDocumentApi.getRecord(activeId).catch(() => null)
      : null;
    return {
      activeId,
      visibleEditors: visibleEditors.length,
      totalEditors: editors.length,
      memoEmptyStateHidden: (document.getElementById("memoEmptyState") as HTMLElement | null)?.hidden ?? null,
      memoCardHidden: (document.querySelector(".memo-card") as HTMLElement | null)?.hidden ?? null,
      stateActiveTabId: String(w.__memoState?.activeTabId || ""),
      stateTabs: Array.isArray(w.__memoState?.tabs) ? w.__memoState.tabs.length : 0,
      stateActiveContentLength: (() => {
        const tabs = Array.isArray(w.__memoState?.tabs) ? w.__memoState.tabs : [];
        const activeTabId = String(w.__memoState?.activeTabId || "");
        const activeTab = tabs.find((tab: any) => String(tab?.id || "") === activeTabId) || tabs[0] || null;
        return String(activeTab?.content || "").length;
      })(),
      instanceValueLength: String(w.GoToolkitMemoInstance?.getValue?.() || "").length,
      recordValueLength: String(record?.payload?.tabs?.[0]?.content || record?.payload || "").length,
      apis: {
        createDocument: Boolean(w.GoToolkitMemoCreateDocument),
        getActiveDocumentId: Boolean(w.GoToolkitMemoGetActiveDocumentId),
        openDocumentByLink: Boolean(w.GoToolkitMemoOpenDocumentByLink),
        setEditorMarkdown: Boolean(w.setEditorMarkdown),
      }
    };
  });
}

async function createLocalMemoPageDirect(page: Page, logStep: (label: string, details?: unknown) => void) {
  const seed = await page.evaluate(async () => {
    const w = window as any;
    if (typeof w.GoToolkitMemoCreateDocument !== "function") {
      throw new Error("GoToolkitMemoCreateDocument unavailable");
    }
    await w.GoToolkitMemoCreateDocument({
      name: `PW Selection Modes ${Date.now()}`,
      initialContent: "<p>bootstrap</p>",
    });
    const docId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    if (!docId) throw new Error("Failed to create active memo document");
    return { docId };
  });
  logStep("created-memo-doc", seed);
  try {
    await waitForMemoEditorVisible(page, 45_000);
  } catch (error) {
    logStep("memo-bootstrap-snapshot", await collectBootstrapSnapshot(page));
    throw error;
  }
}

async function setActiveMemoMarkdown(page: Page, markdown: string) {
  await page.evaluate(async (nextMarkdown) => {
    const w = window as any;
    if (typeof w.setEditorMarkdown === "function") {
      w.setEditorMarkdown(String(nextMarkdown || ""));
    } else if (w.GoToolkitMemoInstance?.setValue) {
      w.GoToolkitMemoInstance.setValue(String(nextMarkdown || ""));
    } else {
      throw new Error("No editor setter available");
    }
    await w.GoToolkitMemoAfterProgrammaticInsert?.();

    const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const docApi = w.goToolkitDocumentApi;
    if (!activeId || !docApi?.getRecord || !docApi?.upsertRecord) return;
    const record = await docApi.getRecord(activeId);
    if (!record) return;
    const payload = record.payload && typeof record.payload === "object"
      ? structuredClone(record.payload)
      : { tabs: [] };
    const tabs = Array.isArray(payload.tabs) ? payload.tabs.slice() : [];
    const activeTabId = String(payload.activeTabId || tabs[0]?.id || "").trim();
    const nextTabs = tabs.length
      ? tabs.map((tab: any, index: number) => {
          const tabId = String(tab?.id || "").trim();
          const shouldUpdate = (activeTabId && tabId === activeTabId) || (!activeTabId && index === 0);
          return shouldUpdate ? { ...tab, content: String(nextMarkdown || "") } : tab;
        })
      : [{
          id: activeTabId || `tab-${activeId}`,
          title: record.title || "Page",
          content: String(nextMarkdown || ""),
        }];
    payload.tabs = nextTabs;
    payload.activeTabId = activeTabId || String(nextTabs[0]?.id || `tab-${activeId}`);
    await docApi.upsertRecord({
      ...record,
      payload,
      updatedAt: new Date().toISOString(),
    });
  }, markdown);

  await expect.poll(async () => {
    return page.evaluate(() => String((window as any).getEditorMarkdown?.() || ""));
  }, { timeout: 15_000 }).toContain(markdown.split("\n")[0]);
}

async function setAssistMode(page: Page, mode: "auto" | "manual") {
  const button = page.locator("#assistSidebar .chat-selection-follow-btn");
  await expect(button).toBeVisible({ timeout: 30_000 });
  const pressed = await button.getAttribute("aria-pressed");
  const shouldBePressed = mode === "auto";
  if (String(pressed) !== String(shouldBePressed)) {
    await button.click();
  }
  await expect(button).toHaveAttribute("aria-pressed", String(shouldBePressed));
}

async function setPromptPreset(page: Page, presetId: string) {
  await page.evaluate((nextPresetId) => {
    (window as any).GoToolkitAssistInstance?.setPromptPreset?.(String(nextPresetId || "edit"));
  }, presetId);
}

async function setEditorCaretAtPhrase(page: Page, phrase: string, offset = 0) {
  await page.evaluate(({ phrase, offset }) => {
    const w = window as any;
    const editor = w.memoEditor;
    if (!editor?.state?.doc || !editor?.chain) throw new Error("memo editor unavailable");
    let targetPos: number | null = null;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (targetPos !== null || !node?.isText || typeof node.text !== "string") return;
      const index = node.text.indexOf(String(phrase || ""));
      if (index >= 0) {
        targetPos = pos + index + Math.max(0, Number(offset || 0));
      }
    });
    if (targetPos === null) throw new Error(`Phrase not found for caret: ${phrase}`);
    editor.chain().focus().setTextSelection({ from: targetPos, to: targetPos }).run();
  }, { phrase, offset });
  await page.waitForTimeout(450);
}

async function setEditorSelectionByPhrase(page: Page, phrase: string) {
  await page.evaluate((phraseToFind) => {
    const w = window as any;
    const editor = w.memoEditor;
    if (!editor?.state?.doc || !editor?.chain) throw new Error("memo editor unavailable");
    let targetRange: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (targetRange || !node?.isText || typeof node.text !== "string") return;
      const index = node.text.indexOf(String(phraseToFind || ""));
      if (index >= 0) {
        const from = pos + index;
        targetRange = { from, to: from + String(phraseToFind || "").length };
      }
    });
    if (!targetRange) throw new Error(`Phrase not found for selection: ${phraseToFind}`);
    editor.chain().focus().setTextSelection(targetRange).run();
  }, phrase);
  await page.waitForTimeout(450);
}

async function getLastAiRequest(page: Page) {
  return page.evaluate(() => {
    const requests = ((window as any).__pwAssistRequests || []) as any[];
    return requests[requests.length - 1] || null;
  });
}

async function getEditorMarkdown(page: Page) {
  return page.evaluate(() => String((window as any).getEditorMarkdown?.() || ""));
}

async function getNormalizedEditorMarkdown(page: Page) {
  const markdown = await getEditorMarkdown(page);
  return String(markdown || "").replace(/\\_/g, "_");
}

async function getSelectionSnapshot(page: Page) {
  return page.evaluate(() => {
    const w = window as any;
    const assist = w.GoToolkitAssistInstance;
    return {
      assistSelection: assist?.memoSelection || null,
      overlayDisplay: assist?.memoSelectionOverlay?.style?.display || "",
      inlineOverlayDisplay: (document.getElementById("chat-selection-overlay") as HTMLElement | null)?.style.display || "",
      inlineVisible: (document.getElementById("chat-inline-editor-container") as HTMLElement | null)?.style.display || "",
      editorSelection: w.memoEditor?.state?.selection
        ? {
            from: Number(w.memoEditor.state.selection.from),
            to: Number(w.memoEditor.state.selection.to),
            empty: Boolean(w.memoEditor.state.selection.empty),
          }
        : null,
    };
  });
}

async function openInlineEditForLastUserMessage(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const assist = w.GoToolkitAssistInstance;
    const messages = Array.isArray(assist?.conversation?.messages) ? assist.conversation.messages : [];
    const lastUserMessage = [...messages].reverse().find((message: any) => message?.role === "user");
    if (!assist?.handleEditPrompt || !lastUserMessage) {
      throw new Error("Unable to resolve last user message for inline edit");
    }
    assist.handleEditPrompt(lastUserMessage);
  });
}

test("selection auto/manual cover composer, inline editor, and inline message edit", async ({ page }) => {
  test.setTimeout(180_000);
  const logStep = createStepLogger(DEBUG_PREFIX);
  attachPageDebugLogging(page, DEBUG_PREFIX, { urlPattern: /./ });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
    } catch {
      // ignore
    }
  });
  await page.goto(BASE_URL, { waitUntil: "commit", timeout: 30_000 });
  await dismissDocsTour(page).catch(() => null);
  await waitForMemoReady(page);
  await createLocalMemoPageDirect(page, logStep);
  await ensureAssistOpen(page);
  await installFastEmbeddingHarness(page);
  await installStubbedAi(page);
  await setActiveMemoMarkdown(page, INITIAL_MARKDOWN);
  await setPromptPreset(page, "edit");

  const mainComposer = page.locator("#assistSidebar .chat-composer").first();
  const mainTextarea = page.locator("#assistSidebar .chat-input").first();
  const mainSend = page.locator("#assistSidebar .chat-send-btn").first();

  await test.step("selection auto + caret focus in main composer uses SELECTION / s_output", async () => {
    await setActiveMemoMarkdown(page, INITIAL_MARKDOWN);
    await setAssistMode(page, "auto");
    await setEditorCaretAtPhrase(page, "Alpha paragraph", 6);
    await mainTextarea.click();
    await mainTextarea.fill("PW_AUTO_CARET_MAIN");
    await mainSend.click();

    await expect.poll(() => getLastAiRequest(page), { timeout: 15_000 }).toMatchObject({
      askText: "PW_AUTO_CARET_MAIN",
      hasSelection: true,
    });
    await expect.poll(() => getNormalizedEditorMarkdown(page), { timeout: 15_000 }).toContain("PW_AUTO_CARET_MAIN selection rewrite");
  });

  await test.step("selection manuelle + caret focus in main composer uses whole-document output", async () => {
    await setActiveMemoMarkdown(page, INITIAL_MARKDOWN);
    await setAssistMode(page, "manual");
    await setEditorCaretAtPhrase(page, "Alpha paragraph", 6);
    await mainTextarea.click();
    await mainTextarea.fill("PW_MANUAL_CARET_MAIN");
    await mainSend.click();

    await expect.poll(() => getLastAiRequest(page), { timeout: 15_000 }).toMatchObject({
      askText: "PW_MANUAL_CARET_MAIN",
      hasSelection: false,
    });
    await expect.poll(() => getNormalizedEditorMarkdown(page), { timeout: 15_000 }).toContain("PW_FULL_DOC_OUTPUT_PW_MANUAL_CARET_MAIN");
  });

  await test.step("selection manuelle + explicit text selection in main composer still uses SELECTION / s_output", async () => {
    await setActiveMemoMarkdown(page, INITIAL_MARKDOWN);
    await setAssistMode(page, "manual");
    await setEditorSelectionByPhrase(page, "selection target");
    await mainTextarea.click();
    await mainTextarea.fill("PW_MANUAL_TEXT_MAIN");
    await mainSend.click();

    await expect.poll(() => getLastAiRequest(page), { timeout: 15_000 }).toMatchObject({
      askText: "PW_MANUAL_TEXT_MAIN",
      hasSelection: true,
    });
    await expect.poll(() => getNormalizedEditorMarkdown(page), { timeout: 15_000 }).toContain("PW_MANUAL_TEXT_MAIN selection rewrite");
  });

  await test.step("chat composer inline restores saved selection when reopening a sent user message", async () => {
    await setActiveMemoMarkdown(page, INITIAL_MARKDOWN);
    await setAssistMode(page, "auto");
    await setEditorSelectionByPhrase(page, "selection target");
    await mainTextarea.click();
    await mainTextarea.fill("PW_INLINE_EDIT_RESTORE");
    await mainSend.click();

    await expect.poll(() => getLastAiRequest(page), { timeout: 15_000 }).toMatchObject({
      askText: "PW_INLINE_EDIT_RESTORE",
      hasSelection: true,
    });

    await openInlineEditForLastUserMessage(page);
    await expect(page.locator("#assistSidebar .chat-composer--inline")).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => getSelectionSnapshot(page), { timeout: 15_000 }).toMatchObject({
      overlayDisplay: "block",
    });
    const restored = await getSelectionSnapshot(page);
    logStep("inline-edit-restored-selection", restored);
    expect(restored.assistSelection).not.toBeNull();
    expect(Number(restored.assistSelection?.to)).toBeGreaterThan(Number(restored.assistSelection?.from));

    const inlineEditTextarea = page.locator("#assistSidebar .chat-composer--inline .chat-input");
    await inlineEditTextarea.fill("PW_INLINE_EDIT_RESTORE_RESEND");
    await page.locator("#assistSidebar .chat-composer--inline .chat-send-btn").click();

    await expect.poll(() => getLastAiRequest(page), { timeout: 15_000 }).toMatchObject({
      askText: "PW_INLINE_EDIT_RESTORE_RESEND",
      hasSelection: true,
    });
  });

  await page.screenshot({ path: "tests/results/assist-selection-modes-debug.png", fullPage: true });
});
