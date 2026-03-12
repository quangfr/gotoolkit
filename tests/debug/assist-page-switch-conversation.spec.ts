import { expect, Page, test } from "@playwright/test";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

async function readTocItems(page: Page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-document-toc] .toc-item"))
      .map(node => String((node as HTMLElement).textContent || "").trim())
      .filter(Boolean);
  });
}

async function openTocTab(page: Page) {
  await page.locator('.document-explorer__tab-btn[data-tab="library"]').click();
  await page.locator('.document-explorer__tab-btn[data-tab="toc"]').click();
}

test.describe("Assist conversation scope across private page switches", () => {
  test("keeps assist conversations and summary tab aligned with the active page", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("assist-page-switch-conversation");

    attachPageDebugLogging(page, "assist-page-switch-conversation");

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    logStep("memo-ready");

    logStep("seed-private-docs:start");
    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const pageAId = docApi?.generateId?.() || `assist-page-a-${ts}`;
      const pageBId = docApi?.generateId?.() || `assist-page-b-${ts}`;
      const pageATitle = `PW Assist A ${ts}`;
      const pageBTitle = `PW Assist B ${ts}`;
      const pageAHeading = `Alpha Heading ${ts}`;
      const pageBHeading = `Beta Heading ${ts}`;
      const pageABase = `Paragraph A base ${ts}`;
      const pageBBase = `Paragraph B base ${ts}`;

      await docApi?.upsertRecord?.({
        id: pageAId,
        app: "memo",
        title: pageATitle,
        payload: {
          tabs: [{
            id: `tab-${pageAId}`,
            title: pageATitle,
            description: "",
            superpowers: [],
            content: `<h1>${pageAHeading}</h1><p>${pageABase}</p>`
          }],
          activeTabId: `tab-${pageAId}`
        },
        updatedAt: new Date().toISOString()
      });

      await docApi?.upsertRecord?.({
        id: pageBId,
        app: "memo",
        title: pageBTitle,
        payload: {
          tabs: [{
            id: `tab-${pageBId}`,
            title: pageBTitle,
            description: "",
            superpowers: [],
            content: `<h1>${pageBHeading}</h1><p>${pageBBase}</p>`
          }],
          activeTabId: `tab-${pageBId}`
        },
        updatedAt: new Date().toISOString()
      });

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });

      return {
        pageAId,
        pageBId,
        pageATitle,
        pageBTitle,
        pageAHeading,
        pageBHeading,
        pageABase,
        pageBBase,
        pageAMarker: `INLINE_A_MARKER_${ts}`,
        pageBMarker: `SEND_B_MARKER_${ts}`,
        askA: `Replace the selected paragraph with INLINE_A_MARKER_${ts}.`,
        askB: `Rewrite the page so it includes SEND_B_MARKER_${ts}.`
      };
    });
    logStep("seed-private-docs:done", seed);

    logStep("install-fake-ai:start");
    await page.evaluate(({ pageAId, pageBId, pageAHeading, pageBHeading, pageAMarker, pageBMarker }) => {
      const w = window as any;
      const root = document.getElementById("chat-root");
      if (!w.GoToolkitAssistInstance && w.GoToolkitAssist?.mount && root) {
        w.GoToolkitAssistInstance = w.GoToolkitAssist.mount(root);
      }
      if (!w.GoToolkitAssistInstance) {
        throw new Error("GoToolkitAssistInstance unavailable");
      }

      w.__assistSwitchTest = {
        requests: [],
        responses: [],
        pendingLifecycle: []
      };
      const assist = w.GoToolkitAssistInstance;
      if (assist && !assist.__assistSwitchWrapped) {
        const originalQueuePendingInlineEdit = assist.queuePendingInlineEdit?.bind(assist);
        const originalApplyPendingInlineEditForScope = assist.applyPendingInlineEditForScope?.bind(assist);
        if (originalQueuePendingInlineEdit) {
          assist.queuePendingInlineEdit = function (scopeId: string, payload: any) {
            w.__assistSwitchTest.pendingLifecycle.push({
              step: "queue",
              scopeId: String(scopeId || ""),
              hasSelection: Boolean(payload?.editMetadata?.sOutput?.text),
              hasOutput: Boolean(payload?.editMetadata?.output)
            });
            return originalQueuePendingInlineEdit(scopeId, payload);
          };
        }
        if (originalApplyPendingInlineEditForScope) {
          assist.applyPendingInlineEditForScope = function (scopeId: string, attempt: number) {
            w.__assistSwitchTest.pendingLifecycle.push({
              step: "apply",
              scopeId: String(scopeId || ""),
              attempt: Number(attempt || 0),
              pendingScopes: assist.pendingInlineEditsByScope instanceof Map
                ? Array.from(assist.pendingInlineEditsByScope.keys())
                : []
            });
            return originalApplyPendingInlineEditForScope(scopeId, attempt);
          };
        }
        assist.__assistSwitchWrapped = true;
      }

      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      w.GoToolkitIA = w.GoToolkitIA || {};
      w.GoToolkitIA.chatCompletion = async ({ payload }: any) => {
        const activeDocumentId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "");
        const userMessage = Array.isArray(payload?.messages)
          ? [...payload.messages].reverse().find((entry: any) => entry?.role === "user")
          : null;
        const userContent = String(userMessage?.content || "");
        const hasSelection = /SELECTION:\s*/.test(userContent);

        w.__assistSwitchTest.requests.push({
          activeDocumentId,
          hasSelection,
          userContent,
          scopeId: String(w.GoToolkitAssistInstance?.currentConversationScopeId || "")
        });

        if (activeDocumentId === pageAId) {
          await wait(4000);
          w.__assistSwitchTest.responses.push({
            activeDocumentId,
            type: "inline-a",
            currentScopeId: String(w.GoToolkitAssistInstance?.currentConversationScopeId || "")
          });
          return {
            text: JSON.stringify({
              content: `Applied ${pageAMarker}`,
              s_output: {
                text: pageAMarker
              }
            }),
            usage: { total_tokens: 1 }
          };
        }

        if (activeDocumentId === pageBId) {
          await wait(350);
          w.__assistSwitchTest.responses.push({
            activeDocumentId,
            type: "send-b",
            currentScopeId: String(w.GoToolkitAssistInstance?.currentConversationScopeId || "")
          });
          return {
            text: JSON.stringify({
              content: `Applied ${pageBMarker}`,
              output: `# ${pageBHeading}\n\n${pageBMarker}`
            }),
            usage: { total_tokens: 1 }
          };
        }

        throw new Error(`Unexpected fake AI document id: ${activeDocumentId}`);
      };

      w.GoToolkitAssistInstance.open?.();
    }, {
      pageAId: seed.pageAId,
      pageBId: seed.pageBId,
      pageAHeading: seed.pageAHeading,
      pageBHeading: seed.pageBHeading,
      pageAMarker: seed.pageAMarker,
      pageBMarker: seed.pageBMarker
    });
    logStep("install-fake-ai:done");

    logStep("open-page-a:start");
    await clickMemoDoc(page, seed.pageAId);
    await openTocTab(page);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).toContain(seed.pageAHeading);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).not.toContain(seed.pageBHeading);
    const scopeA = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        conversationId: String(assist?.conversation?.id || "")
      };
    });
    expect(scopeA.scopeId).toBeTruthy();
    logStep("open-page-a:done", scopeA);

    logStep("page-a-inline-send:start");
    await page.evaluate(({ pageABase, askA }) => {
      const editor = (window as any).memoEditor || (window as any).MemoEditor;
      if (!editor?.state?.doc) {
        throw new Error("memoEditor unavailable");
      }
      let from = -1;
      let to = -1;
      editor.state.doc.descendants((node: any, pos: number) => {
        if (!node?.isText || typeof node.text !== "string") return true;
        const index = node.text.indexOf(pageABase);
        if (index === -1) return true;
        from = pos + index;
        to = from + pageABase.length;
        return false;
      });
      if (from < 0 || to < from) {
        throw new Error(`Unable to find selected text: ${pageABase}`);
      }
      editor.chain().focus().setTextSelection({ from, to }).run();
      const selectedText = String(editor.state.doc.textBetween(from, to, " ") || "").trim();
      const documentMarkdown = String((window as any).getEditorMarkdown?.() || "");
      const assist = (window as any).GoToolkitAssistInstance;
      if (!assist) {
        throw new Error("GoToolkitAssistInstance unavailable");
      }
      assist.open?.();
      assist.setPromptPreset?.("edit", { persist: true });
      const systemPrompt = typeof assist.getActiveSystemPrompt === "function"
        ? assist.getActiveSystemPrompt()
        : "Edit the selected text.";
      (window as any).__assistInlinePending = (window as any).sendInlineEditToAssist({
        payload: {
          system: systemPrompt,
          promptPresetId: "edit",
          messages: [
            {
              role: "user",
              content: `DOCUMENT: \n${documentMarkdown} \n\nSELECTION: \n${JSON.stringify({
                text: selectedText,
                start: 0,
                end: 1
              })} \n\nASK: \n${askA}`
            }
          ],
          stream: false
        },
        askText: askA,
        selectionExcerpt: selectedText,
        selectionPos: { from, to },
        editor,
        docSnapshotId: (window as any).getMemoActiveTabId?.() || null,
        docSnapshotContent: documentMarkdown || ""
      });
      return true;
    }, {
      pageABase: seed.pageABase,
      askA: seed.askA
    });
    logStep("page-a-inline-send:submitted");

    logStep("switch-to-page-b-during-a-wait:start");
    await clickMemoDoc(page, seed.pageBId);
    await openTocTab(page);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).toContain(seed.pageBHeading);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).not.toContain(seed.pageAHeading);

    const afterSwitch = await page.evaluate(({ askA }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        conversationId: String(assist?.conversation?.id || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : [],
        requestLog: Array.isArray((window as any).__assistSwitchTest?.requests)
          ? (window as any).__assistSwitchTest.requests.slice()
          : [],
        composerValue: String(assist?.textarea?.value || ""),
        containsAskA: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.some((message: any) => String(message?.content || "").includes(askA))
          : false
      };
    }, { askA: seed.askA });

    expect(afterSwitch.scopeId).toBeTruthy();
    expect(afterSwitch.scopeId).not.toBe(scopeA.scopeId);
    expect(afterSwitch.conversationId).not.toBe(scopeA.conversationId);
    expect(afterSwitch.containsAskA).toBeFalsy();
    expect(afterSwitch.messages.length).toBe(0);
    expect(afterSwitch.requestLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        activeDocumentId: seed.pageAId,
        hasSelection: true
      })
    ]));
    logStep("switch-to-page-b-during-a-wait:done", afterSwitch);

    logStep("page-b-send-button:start");
    await page.evaluate(({ askB }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (!assist) {
        throw new Error("GoToolkitAssistInstance unavailable");
      }
      assist.open?.();
      assist.setPromptPreset?.("edit", { persist: true });
      if (!assist.textarea || !assist.sendButton) {
        throw new Error("Assist composer unavailable");
      }
      assist.textarea.value = askB;
      assist.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      assist.textarea.dispatchEvent(new Event("change", { bubbles: true }));
      assist.handleComposerManualInput?.();
      assist.updateComposerState?.();
      assist.sendButton.click();
    }, { askB: seed.askB });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.pageBMarker);
    await expect.poll(async () => {
      return page.evaluate(({ scopeAId, pageAMarker, pageAId }) => {
        const assist = (window as any).GoToolkitAssistInstance;
        const pendingScopes = assist?.pendingInlineEditsByScope instanceof Map
          ? Array.from(assist.pendingInlineEditsByScope.keys())
          : [];
        const raw = localStorage.getItem("goToolkit.chat.conversations.memo");
        const parsed = raw ? JSON.parse(raw) : {};
        const messages = Array.isArray(parsed?.[scopeAId]?.messages) ? parsed[scopeAId].messages : [];
        const hasMarkerMessage = messages.some((message: any) => {
          const role = String(message?.role || "");
          const content = String(message?.content || "");
          return role === "bot" && content.includes(pageAMarker);
        });
        const responses = Array.isArray((window as any).__assistSwitchTest?.responses)
          ? (window as any).__assistSwitchTest.responses
          : [];
        const hasResponse = responses.some((entry: any) => String(entry?.activeDocumentId || "") === String(pageAId || ""));
        return pendingScopes.includes(scopeAId) || hasMarkerMessage || hasResponse;
      }, {
        scopeAId: scopeA.scopeId,
        pageAMarker: seed.pageAMarker,
        pageAId: seed.pageAId
      });
    }, { timeout: 15_000 }).toBeTruthy();
    logStep("page-b-send-button:done");

    logStep("verify-page-a-result:start");
    await clickMemoDoc(page, seed.pageAId);
    const pageADiagnostics = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      const pendingScopes = assist?.pendingInlineEditsByScope instanceof Map
        ? Array.from(assist.pendingInlineEditsByScope.keys())
        : [];
      const raw = localStorage.getItem("goToolkit.chat.conversations.memo");
      const parsed = raw ? JSON.parse(raw) : {};
      const scopeMessages = Array.isArray(parsed?.[String(assist?.currentConversationScopeId || "")]?.messages)
        ? parsed[String(assist?.currentConversationScopeId || "")].messages.map((message: any) => ({
          role: String(message?.role || ""),
          content: String(message?.content || "")
        }))
        : [];
      return {
        activeDocumentId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
        editorHtml: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
        headings: Array.isArray((window as any).MemoHeadings)
          ? (window as any).MemoHeadings.map((heading: any) => String(heading?.textContent || heading?.text || "")).filter(Boolean)
          : [],
        pendingScopes,
        responses: Array.isArray((window as any).__assistSwitchTest?.responses)
          ? (window as any).__assistSwitchTest.responses.slice()
          : [],
        pendingLifecycle: Array.isArray((window as any).__assistSwitchTest?.pendingLifecycle)
          ? (window as any).__assistSwitchTest.pendingLifecycle.slice()
          : [],
        scopeMessages,
        currentScopeId: String(assist?.currentConversationScopeId || "")
      };
    });
    logStep("verify-page-a-result:pre-toc", {
      activeDocumentId: pageADiagnostics.activeDocumentId,
      headings: pageADiagnostics.headings,
      pendingScopes: pageADiagnostics.pendingScopes,
      responses: pageADiagnostics.responses,
      pendingLifecycle: pageADiagnostics.pendingLifecycle,
      scopeMessages: pageADiagnostics.scopeMessages,
      currentScopeId: pageADiagnostics.currentScopeId,
      hasPageAMarker: pageADiagnostics.editorHtml.includes(seed.pageAMarker),
      hasPageBMarker: pageADiagnostics.editorHtml.includes(seed.pageBMarker)
    });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.pageAMarker);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).not.toContain(seed.pageBMarker);
    await openTocTab(page);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).toContain(seed.pageAHeading);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).not.toContain(seed.pageBHeading);
    logStep("verify-page-a-result:done");

    logStep("verify-page-b-result:start");
    await clickMemoDoc(page, seed.pageBId);
    const pageBDiagnostics = await page.evaluate(() => {
      return {
        activeDocumentId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
        editorHtml: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
        headings: Array.isArray((window as any).MemoHeadings)
          ? (window as any).MemoHeadings.map((heading: any) => String(heading?.textContent || heading?.text || "")).filter(Boolean)
          : []
      };
    });
    logStep("verify-page-b-result:pre-toc", {
      activeDocumentId: pageBDiagnostics.activeDocumentId,
      headings: pageBDiagnostics.headings,
      hasPageAMarker: pageBDiagnostics.editorHtml.includes(seed.pageAMarker),
      hasPageBMarker: pageBDiagnostics.editorHtml.includes(seed.pageBMarker)
    });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.pageBMarker);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).not.toContain(seed.pageAMarker);
    await openTocTab(page);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).toContain(seed.pageBHeading);
    await expect.poll(() => readTocItems(page), { timeout: 15_000 }).not.toContain(seed.pageAHeading);
    logStep("verify-page-b-result:done");

    logStep("verify-conversation-store:start");
    const scopeB = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return String(assist?.currentConversationScopeId || "");
    });
    const storeWithB = await page.evaluate(({ scopeAId, scopeBId }) => {
      const raw = localStorage.getItem("goToolkit.chat.conversations.memo");
      const parsed = raw ? JSON.parse(raw) : {};
      const summarize = (scopeId: string) => {
        const messages = Array.isArray(parsed?.[scopeId]?.messages) ? parsed[scopeId].messages : [];
        return messages.map((message: any) => ({
          role: String(message?.role || ""),
          content: String(message?.content || "")
        }));
      };
      return {
        scopeKeys: Object.keys(parsed || {}),
        scopeAMessages: summarize(scopeAId),
        scopeBMessages: summarize(scopeBId)
      };
    }, {
      scopeAId: scopeA.scopeId,
      scopeBId: scopeB
    });

    expect(storeWithB.scopeKeys).toEqual(expect.arrayContaining([scopeA.scopeId, scopeB]));
    expect(storeWithB.scopeAMessages.some(message => message.content.includes(seed.askA))).toBeTruthy();
    expect(storeWithB.scopeAMessages.some(message => message.content.includes(seed.askB))).toBeFalsy();
    expect(storeWithB.scopeBMessages.some(message => message.content.includes(seed.askB))).toBeTruthy();
    expect(storeWithB.scopeBMessages.some(message => message.content.includes(seed.askA))).toBeFalsy();
    logStep("verify-conversation-store:done", {
      scopeA: scopeA.scopeId,
      scopeB,
      scopeKeys: storeWithB.scopeKeys
    });

    await refreshMemoExplorer(page, 5_000);
    logStep("done");
  });
});
