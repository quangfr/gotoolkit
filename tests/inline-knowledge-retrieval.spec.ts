import { expect, test } from "@playwright/test";

test.describe("Inline AI-IN knowledge retrieval", () => {
  test("injects selected Mémoire knowledge into inline edit payload", async ({ page }) => {
    test.setTimeout(90_000);
    const baseUrl = "http://127.0.0.1:5000";
    const sentinel = "SENTINEL_KNOWLEDGE_INLINE_42";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(
      () => Boolean((window as any).memoEditor && (window as any).GoToolkitAssistInstance && (window as any).goToolkitDocumentApi),
      null,
      { timeout: 30_000 }
    );

    await page.evaluate(async ({ sentinelText }) => {
      if (typeof (window as any).GoToolkitMemoCreateAutoDocument === "function") {
        await (window as any).GoToolkitMemoCreateAutoDocument();
      }

      const assist = (window as any).GoToolkitAssistInstance;
      const docApi = (window as any).goToolkitDocumentApi;
      const docManager = (window as any).GoToolkitDocumentManager;
      const ia = (window as any).GoToolkitIA;

      if (!assist || !docApi || !docManager || !ia?.chatCompletion) {
        throw new Error("Required APIs are not available");
      }

      assist.open?.();
      assist.setPromptPreset?.("edit");

      const knowledgeRecordId = `knowledge-inline-${Date.now()}`;
      await docApi.upsertRecord({
        id: knowledgeRecordId,
        app: "memo",
        title: "Knowledge Seed Doc",
        description: "Inline knowledge seed",
        superpowers: [],
        payload: {
          tabs: [
            {
              id: `${knowledgeRecordId}-tab`,
              title: "Knowledge Seed Doc",
              description: "",
              superpowers: [],
              content: "<p>Knowledge source</p>"
            }
          ],
          activeTabId: `${knowledgeRecordId}-tab`,
          promptPresetId: "edit"
        },
        parentId: "",
        icon: "file",
        updatedAt: new Date().toISOString()
      });

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });

      await assist.refreshKnowledgeModal({ skipAutoReindex: true });
      const entries = Array.isArray(assist.knowledgeManifestEntries) ? assist.knowledgeManifestEntries : [];
      const seedEntry = entries.find((entry: any) => String(entry?.documentId || "") === knowledgeRecordId);
      if (!seedEntry) {
        throw new Error("Unable to locate seeded Mémoire entry in knowledge modal");
      }

      const knowledgeKey = assist.normalizeKnowledgeKey(seedEntry.fileName || "");
      if (!knowledgeKey) {
        throw new Error("Unable to compute knowledge key for seeded entry");
      }

      const selection = new Set([knowledgeKey]);
      assist.setKnowledgeModalSelection(selection);
      assist.renderKnowledgeModalList(assist.knowledgeManifestEntries, selection);

      await docManager.deleteConversation?.(assist.knowledgeConversationId);
      const seededKnowledgeDocId = `kdoc-${Date.now()}`;
      await docManager.putDocument({
        id: seededKnowledgeDocId,
        conversationId: assist.knowledgeConversationId,
        name: seedEntry.name || "Knowledge Seed Doc",
        sourceFileName: seedEntry.fileName,
        sourceType: "embedded",
        updatedAt: Date.now(),
        scope: ["memo"]
      });
      await docManager.putChunk({
        id: `${seededKnowledgeDocId}:0`,
        conversationId: assist.knowledgeConversationId,
        docId: seededKnowledgeDocId,
        idx: 0,
        text: sentinelText,
        emb: [1, 0],
        size: "small"
      });

      (window as any).__inlineOriginalEmbed = docManager.embed?.bind(docManager);
      docManager.embed = async () => [1, 0];

      (window as any).__inlineCapturedPayloads = [];
      (window as any).__inlineOriginalChatCompletion = ia.chatCompletion.bind(ia);
      ia.chatCompletion = async (options: any) => {
        (window as any).__inlineCapturedPayloads.push(options?.payload || null);
        return {
          text: JSON.stringify({
            answer: "ok",
            output: "Inline output"
          }),
          usage: { completion_tokens: 16 }
        };
      };
    }, { sentinelText: sentinel });

    const textarea = page.locator("#assistSidebar textarea.chat-input");
    await textarea.waitFor({ state: "visible" });
    await textarea.fill("Use memo knowledge for this inline edit");
    await textarea.press("Enter");

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const payloads = (window as any).__inlineCapturedPayloads;
        return Array.isArray(payloads) ? payloads.length : 0;
      });
    }, { timeout: 30_000 }).toBeGreaterThan(0);

    const lastUserPayloadText = await page.evaluate(() => {
      const payloads = (window as any).__inlineCapturedPayloads;
      const payload = Array.isArray(payloads) && payloads.length ? payloads[payloads.length - 1] : null;
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      let userContent = "";
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (!msg || msg.role !== "user") continue;
        if (typeof msg.content === "string") {
          userContent = msg.content;
          break;
        }
        if (Array.isArray(msg.content)) {
          userContent = msg.content
            .map((part: any) => (part && typeof part.text === "string" ? part.text : ""))
            .join("\n");
          break;
        }
      }
      return userContent;
    });

    expect(lastUserPayloadText).toContain("KNOWLEDGE");
    expect(lastUserPayloadText).toContain(sentinel);
  });
});
