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
    page.on("console", message => {
      const text = message.text();
      if (!/\[AssistScopeDebug\]|\[AssistPendingInline\]/.test(text)) return;
      console.log(`[assist-page-switch-conversation] browser:${message.type()}`, text);
    });

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
        explorerMarker: `EXPLORER_MARKER_${ts}`,
        explorerMarker2: `EXPLORER_MARKER_2_${ts}`,
        askA: `Replace the selected paragraph with INLINE_A_MARKER_${ts}.`,
        askB: `Rewrite the page so it includes SEND_B_MARKER_${ts}.`,
        askExplorer: `Remember EXPLORER_MARKER_${ts} for the empty page mode.`,
        askExplorer2: `Also remember EXPLORER_MARKER_2_${ts} for the empty page mode.`
      };
    });
    logStep("seed-private-docs:done", seed);

    logStep("install-fake-ai:start");
    await page.evaluate(({ pageAId, pageBId, pageAHeading, pageBHeading, pageAMarker, pageBMarker, explorerMarker, explorerMarker2 }) => {
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

        if (!activeDocumentId) {
          await wait(150);
          const marker = userContent.includes(explorerMarker2) ? explorerMarker2 : explorerMarker;
          w.__assistSwitchTest.responses.push({
            activeDocumentId,
            type: "explorer",
            currentScopeId: String(w.GoToolkitAssistInstance?.currentConversationScopeId || ""),
            marker
          });
          return {
            text: `Remembered ${marker}`,
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
      pageBMarker: seed.pageBMarker,
      explorerMarker: seed.explorerMarker,
      explorerMarker2: seed.explorerMarker2
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
      assist.setPromptPreset?.("suggest", { persist: true });
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
    const pageAScopeSnapshot = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        promptPresetId: String(assist?.promptPresetId || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(pageAScopeSnapshot.promptPresetId).toBe("edit");
    expect(pageAScopeSnapshot.messages.some(message => message.content.includes(seed.askA))).toBeTruthy();
    expect(pageAScopeSnapshot.messages.some(message => message.content.includes(seed.askB))).toBeFalsy();
    expect(pageAScopeSnapshot.messages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(pageAScopeSnapshot.messages.some(message => message.content.includes(seed.explorerMarker))).toBeFalsy();
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
    const pageBScopeSnapshot = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        promptPresetId: String(assist?.promptPresetId || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(pageBScopeSnapshot.promptPresetId).toBe("suggest");
    expect(pageBScopeSnapshot.messages.some(message => message.content.includes(seed.askB))).toBeTruthy();
    expect(pageBScopeSnapshot.messages.some(message => message.content.includes(seed.askA))).toBeFalsy();
    expect(pageBScopeSnapshot.messages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(pageBScopeSnapshot.messages.some(message => message.content.includes(seed.explorerMarker))).toBeFalsy();
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
    expect(storeWithB.scopeAMessages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(storeWithB.scopeAMessages.some(message => message.content.includes(seed.explorerMarker))).toBeFalsy();
    expect(storeWithB.scopeBMessages.some(message => message.content.includes(seed.askB))).toBeTruthy();
    expect(storeWithB.scopeBMessages.some(message => message.content.includes(seed.askA))).toBeFalsy();
    expect(storeWithB.scopeBMessages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(storeWithB.scopeBMessages.some(message => message.content.includes(seed.explorerMarker))).toBeFalsy();
    logStep("verify-conversation-store:done", {
      scopeA: scopeA.scopeId,
      scopeB,
      scopeKeys: storeWithB.scopeKeys
    });

    logStep("empty-shell-open:start");
    await page.locator("#closeActivePageBtn").click();
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "")), { timeout: 15_000 }).toBe("");
    const explorerScope = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        conversationId: String(assist?.conversation?.id || ""),
        isOpen: Boolean(assist?.isOpen),
        promptPresetId: String(assist?.promptPresetId || ""),
        promptLabel: String(assist?.promptDropdownButton?.textContent || "").trim(),
        followDisplay: String(assist?.memoSelectionFollowButton?.style?.display || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(explorerScope.scopeId).toBe("memo-explorer");
    expect(explorerScope.scopeId).not.toBe(scopeA.scopeId);
    expect(explorerScope.scopeId).not.toBe(scopeB);
    expect(explorerScope.conversationId).toBeTruthy();
    expect(explorerScope.conversationId).not.toBe(scopeA.conversationId);
    expect(explorerScope.isOpen).toBeTruthy();
    expect(explorerScope.promptPresetId).toBe("explore");
    expect(explorerScope.promptLabel).toContain("Explorer");
    expect(explorerScope.followDisplay).toBe("none");
    expect(explorerScope.messages).toEqual([]);
    logStep("empty-shell-open:done", explorerScope);

    logStep("empty-shell-send:start");
    await page.evaluate(({ askExplorer }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (!assist) throw new Error("GoToolkitAssistInstance unavailable");
      assist.open?.();
      assist.setPromptPreset?.("explore", { persist: true });
      if (!assist.textarea || !assist.sendButton) {
        throw new Error("Assist composer unavailable");
      }
      assist.textarea.value = askExplorer;
      assist.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      assist.textarea.dispatchEvent(new Event("change", { bubbles: true }));
      assist.handleComposerManualInput?.();
      assist.updateComposerState?.();
      assist.sendButton.click();
    }, { askExplorer: seed.askExplorer });
    await expect.poll(() => page.evaluate(({ explorerMarker }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      return Array.isArray(assist?.conversation?.messages)
        ? assist.conversation.messages.some((message: any) => String(message?.content || "").includes(explorerMarker))
        : false;
    }, { explorerMarker: seed.explorerMarker }), { timeout: 15_000 }).toBeTruthy();
    const explorerAfterSend = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        conversationId: String(assist?.conversation?.id || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(explorerAfterSend.scopeId).toBe("memo-explorer");
    logStep("empty-shell-send:done", explorerAfterSend);

    logStep("verify-explorer-restoration:start");
    await clickMemoDoc(page, seed.pageAId);
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitAssistInstance?.currentConversationScopeId || "")), { timeout: 15_000 }).toBe(scopeA.scopeId);
    await page.locator("#closeActivePageBtn").click();
    await expect.poll(() => page.evaluate(() => ({
      emptyExists: Boolean(document.getElementById("memoEmptyState")),
      scopeId: String((window as any).GoToolkitAssistInstance?.currentConversationScopeId || ""),
      activeDocumentId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      pathname: String(window.location.pathname || ""),
      memoCardHidden: (() => {
        const memoCard = document.querySelector(".memo-card");
        return !memoCard || getComputedStyle(memoCard).display === "none";
      })(),
      emptyVisible: (() => {
        const emptyState = document.getElementById("memoEmptyState");
        return Boolean(emptyState) && getComputedStyle(emptyState).display !== "none";
      })()
    })), { timeout: 15_000 }).toMatchObject({
      emptyExists: true,
      scopeId: "memo-explorer",
      activeDocumentId: "",
      pathname: "/",
      memoCardHidden: true,
      emptyVisible: true
    });
    const explorerRestored = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        conversationId: String(assist?.conversation?.id || ""),
        promptPresetId: String(assist?.promptPresetId || ""),
        followDisplay: String(assist?.memoSelectionFollowButton?.style?.display || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(explorerRestored.scopeId).toBe("memo-explorer");
    expect(explorerRestored.conversationId).toBe(explorerAfterSend.conversationId);
    expect(explorerRestored.promptPresetId).toBe("explore");
    expect(explorerRestored.followDisplay).toBe("none");
    expect(explorerRestored.messages.some(message => message.content.includes(seed.askExplorer))).toBeTruthy();
    expect(explorerRestored.messages.some(message => message.content.includes(seed.explorerMarker))).toBeTruthy();
    expect(explorerRestored.messages.some(message => message.content.includes(seed.askA))).toBeFalsy();
    expect(explorerRestored.messages.some(message => message.content.includes(seed.askB))).toBeFalsy();
    logStep("verify-explorer-restoration:done", explorerRestored);

    logStep("explorer-second-pass:start");
    await page.evaluate(({ askExplorer2 }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (!assist) throw new Error("GoToolkitAssistInstance unavailable");
      assist.open?.();
      assist.setPromptPreset?.("explore", { persist: true });
      if (!assist.textarea || !assist.sendButton) {
        throw new Error("Assist composer unavailable");
      }
      assist.textarea.value = askExplorer2;
      assist.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      assist.textarea.dispatchEvent(new Event("change", { bubbles: true }));
      assist.handleComposerManualInput?.();
      assist.updateComposerState?.();
      assist.sendButton.click();
    }, { askExplorer2: seed.askExplorer2 });
    await expect.poll(() => page.evaluate(({ explorerMarker2 }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      return Array.isArray(assist?.conversation?.messages)
        ? assist.conversation.messages.some((message: any) => String(message?.content || "").includes(explorerMarker2))
        : false;
    }, { explorerMarker2: seed.explorerMarker2 }), { timeout: 15_000 }).toBeTruthy();
    const explorerSecondPass = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        promptPresetId: String(assist?.promptPresetId || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(explorerSecondPass.scopeId).toBe("memo-explorer");
    expect(explorerSecondPass.promptPresetId).toBe("explore");
    expect(explorerSecondPass.messages.some(message => message.content.includes(seed.askExplorer))).toBeTruthy();
    expect(explorerSecondPass.messages.some(message => message.content.includes(seed.explorerMarker))).toBeTruthy();
    expect(explorerSecondPass.messages.some(message => message.content.includes(seed.askExplorer2))).toBeTruthy();
    expect(explorerSecondPass.messages.some(message => message.content.includes(seed.explorerMarker2))).toBeTruthy();
    expect(explorerSecondPass.messages.some(message => message.content.includes(seed.askA))).toBeFalsy();
    expect(explorerSecondPass.messages.some(message => message.content.includes(seed.askB))).toBeFalsy();
    logStep("explorer-second-pass:done", explorerSecondPass);

    logStep("verify-conversation-store-with-explorer:start");
    const storeWithExplorer = await page.evaluate(({ scopeAId, scopeBId, explorerScopeId }) => {
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
        scopeBMessages: summarize(scopeBId),
        explorerMessages: summarize(explorerScopeId),
        promptPresets: (() => {
          const rawPresetStore = localStorage.getItem("goToolkit.chat.prompt.preset.memo");
          return rawPresetStore ? JSON.parse(rawPresetStore) : {};
        })()
      };
    }, {
      scopeAId: scopeA.scopeId,
      scopeBId: scopeB,
      explorerScopeId: "memo-explorer"
    });
    expect(storeWithExplorer.scopeKeys).toEqual(expect.arrayContaining([scopeA.scopeId, scopeB, "memo-explorer"]));
    expect(storeWithExplorer.explorerMessages.some(message => message.content.includes(seed.askExplorer))).toBeTruthy();
    expect(storeWithExplorer.explorerMessages.some(message => message.content.includes(seed.explorerMarker))).toBeTruthy();
    expect(storeWithExplorer.explorerMessages.some(message => message.content.includes(seed.askExplorer2))).toBeTruthy();
    expect(storeWithExplorer.explorerMessages.some(message => message.content.includes(seed.explorerMarker2))).toBeTruthy();
    expect(storeWithExplorer.explorerMessages.some(message => message.content.includes(seed.askA))).toBeFalsy();
    expect(storeWithExplorer.explorerMessages.some(message => message.content.includes(seed.askB))).toBeFalsy();
    expect(storeWithExplorer.scopeAMessages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(storeWithExplorer.scopeAMessages.some(message => message.content.includes(seed.explorerMarker))).toBeFalsy();
    expect(storeWithExplorer.scopeAMessages.some(message => message.content.includes(seed.askExplorer2))).toBeFalsy();
    expect(storeWithExplorer.scopeAMessages.some(message => message.content.includes(seed.explorerMarker2))).toBeFalsy();
    expect(storeWithExplorer.scopeBMessages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(storeWithExplorer.scopeBMessages.some(message => message.content.includes(seed.explorerMarker))).toBeFalsy();
    expect(storeWithExplorer.scopeBMessages.some(message => message.content.includes(seed.askExplorer2))).toBeFalsy();
    expect(storeWithExplorer.scopeBMessages.some(message => message.content.includes(seed.explorerMarker2))).toBeFalsy();
    expect(storeWithExplorer.promptPresets[scopeA.scopeId]).toBe("edit");
    expect(storeWithExplorer.promptPresets[scopeB]).toBe("suggest");
    expect(storeWithExplorer.promptPresets["memo-explorer"]).toBe("explore");
    logStep("verify-conversation-store-with-explorer:done", {
      scopeKeys: storeWithExplorer.scopeKeys
    });

    logStep("verify-page-presets-after-explorer:start");
    await page.evaluate(async (docId) => {
      await (window as any).GoToolkitMemoOpenDocumentByLink?.(docId);
    }, seed.pageAId);
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "")), { timeout: 15_000 }).toBe(seed.pageAId);
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitAssistInstance?.currentConversationScopeId || "")), { timeout: 15_000 }).toBe(scopeA.scopeId);
    const pageAAfterExplorer = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        promptPresetId: String(assist?.promptPresetId || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(pageAAfterExplorer.scopeId).toBe(scopeA.scopeId);
    expect(pageAAfterExplorer.promptPresetId).toBe("edit");
    expect(pageAAfterExplorer.messages.some(message => message.content.includes(seed.askA))).toBeTruthy();
    expect(pageAAfterExplorer.messages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(pageAAfterExplorer.messages.some(message => message.content.includes(seed.askExplorer2))).toBeFalsy();

    await page.evaluate(async (docId) => {
      await (window as any).GoToolkitMemoOpenDocumentByLink?.(docId);
    }, seed.pageBId);
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "")), { timeout: 15_000 }).toBe(seed.pageBId);
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitAssistInstance?.currentConversationScopeId || "")), { timeout: 15_000 }).toBe(scopeB);
    const pageBAfterExplorer = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        promptPresetId: String(assist?.promptPresetId || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(pageBAfterExplorer.scopeId).toBe(scopeB);
    expect(pageBAfterExplorer.promptPresetId).toBe("suggest");
    expect(pageBAfterExplorer.messages.some(message => message.content.includes(seed.askB))).toBeTruthy();
    expect(pageBAfterExplorer.messages.some(message => message.content.includes(seed.askExplorer))).toBeFalsy();
    expect(pageBAfterExplorer.messages.some(message => message.content.includes(seed.askExplorer2))).toBeFalsy();

    await page.locator("#closeActivePageBtn").click();
    await expect.poll(() => page.evaluate(() => String((window as any).GoToolkitAssistInstance?.currentConversationScopeId || "")), { timeout: 15_000 }).toBe("memo-explorer");
    const explorerFinal = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        scopeId: String(assist?.currentConversationScopeId || ""),
        promptPresetId: String(assist?.promptPresetId || ""),
        messages: Array.isArray(assist?.conversation?.messages)
          ? assist.conversation.messages.map((message: any) => ({
            role: String(message?.role || ""),
            content: String(message?.content || "")
          }))
          : []
      };
    });
    expect(explorerFinal.scopeId).toBe("memo-explorer");
    expect(explorerFinal.promptPresetId).toBe("explore");
    expect(explorerFinal.messages.some(message => message.content.includes(seed.askExplorer))).toBeTruthy();
    expect(explorerFinal.messages.some(message => message.content.includes(seed.askExplorer2))).toBeTruthy();
    expect(explorerFinal.messages.some(message => message.content.includes(seed.askA))).toBeFalsy();
    expect(explorerFinal.messages.some(message => message.content.includes(seed.askB))).toBeFalsy();
    logStep("verify-page-presets-after-explorer:done", {
      pageAAfterExplorer,
      pageBAfterExplorer,
      explorerFinal
    });

    await refreshMemoExplorer(page, 5_000);
    logStep("done");
  });
});
