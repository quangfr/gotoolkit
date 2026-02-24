import { expect, test } from "@playwright/test";

test.describe("Assist RAG shared cloud cached docs", () => {
  test("sends selected local cached share doc chunks in AI IN", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const sharedSentinel = "SENTINEL_SHARED_CLOUD_LOCAL_CACHE_2026";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(
      () => Boolean((window as any).GoToolkitAssistInstance && (window as any).goToolkitShareHistory),
      null,
      { timeout: 30_000 }
    );

    await page.evaluate(async ({ sentinel }) => {
      if (typeof (window as any).GoToolkitMemoCreateAutoDocument === "function") {
        await (window as any).GoToolkitMemoCreateAutoDocument();
      }

      const assist = (window as any).GoToolkitAssistInstance;
      const shareHistory = (window as any).goToolkitShareHistory;
      const memoExplorer = (window as any).GoToolkitMemoDocumentExplorer;
      const docManager = (window as any).GoToolkitDocumentManager;
      const ia = (window as any).GoToolkitIA;

      if (!assist || !shareHistory || !memoExplorer || !docManager || !ia?.chatCompletion) {
        throw new Error("Required APIs unavailable");
      }

      assist.open?.();
      assist.setPromptPreset?.("advice");

      // Stable embedding for deterministic retrieval.
      (window as any).__sharedOriginalEmbed = docManager.embed?.bind(docManager);
      docManager.embed = async () => [1, 0];

      // Capture AI IN payloads.
      (window as any).__sharedCapturedPayloads = [];
      (window as any).__sharedOriginalChatCompletion = ia.chatCompletion.bind(ia);
      ia.chatCompletion = async (options: any) => {
        (window as any).__sharedCapturedPayloads.push(options?.payload || null);
        return {
          text: JSON.stringify({ answer: "ok", output: "ok" }),
          usage: { completion_tokens: 16 }
        };
      };

      const token = `shared-token-${Date.now()}`;
      const sharedId = `share:${token}`;
      const nowIso = new Date().toISOString();

      const sharedPayload = {
        tabs: [
          {
            id: `tab-${Date.now()}`,
            title: "Shared Local Copy",
            description: "",
            superpowers: [],
            content: `<p>${sentinel}</p>`
          }
        ],
        activeTabId: ""
      };
      sharedPayload.activeTabId = sharedPayload.tabs[0].id;

      await shareHistory.upsertRecord("memo", {
        token,
        title: "Shared Local Copy",
        description: "Cached shared payload for RAG",
        payload: sharedPayload,
        icon: "file-symlink",
        updatedAt: nowIso
      });

      await memoExplorer.upsertItem?.({
        id: sharedId,
        title: "Shared Local Copy",
        description: "Cached shared payload for RAG",
        icon: "file-symlink",
        section: "shared",
        updatedAt: nowIso
      });

      await assist.refreshKnowledgeModal({ skipAutoReindex: true });
      const entries = Array.isArray(assist.knowledgeManifestEntries) ? assist.knowledgeManifestEntries : [];
      const sharedEntry = entries.find((entry: any) => String(entry?.documentId || "") === sharedId);
      if (!sharedEntry) {
        throw new Error("Shared entry not found in knowledge manifest");
      }
      if (!String(sharedEntry.memoText || "").includes(sentinel)) {
        throw new Error("Shared entry memoText does not include local cached shared payload");
      }

      const key = assist.normalizeKnowledgeKey(sharedEntry.fileName || "");
      if (!key) throw new Error("Shared entry key missing");

      const selection = new Set([key]);
      assist.setKnowledgeModalSelection(selection);
      await docManager.deleteConversation?.(assist.knowledgeConversationId);
      const seededDocId = `shared-kdoc-${Date.now()}`;
      await docManager.putDocument({
        id: seededDocId,
        conversationId: assist.knowledgeConversationId,
        name: sharedEntry.name || "Shared Local Copy",
        sourceFileName: sharedEntry.fileName,
        sourceType: "embedded",
        updatedAt: Date.now(),
        scope: ["memo"]
      });
      await docManager.putChunk({
        id: `${seededDocId}:0`,
        conversationId: assist.knowledgeConversationId,
        docId: seededDocId,
        idx: 0,
        text: sharedEntry.memoText || sentinel,
        emb: [1, 0],
        size: "small"
      });
    }, { sentinel: sharedSentinel });

    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.setPromptPreset?.("advice");
    });

    const textarea = page.locator("#assistSidebar textarea.chat-input");
    await textarea.waitFor({ state: "visible" });
    await textarea.fill("Check shared cached cloud document usage");
    await textarea.press("Enter");

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const payloads = (window as any).__sharedCapturedPayloads;
        return Array.isArray(payloads) ? payloads.length : 0;
      });
    }, { timeout: 30_000 }).toBeGreaterThan(0);

    const userPayloadText = await page.evaluate(() => {
      const payloads = (window as any).__sharedCapturedPayloads;
      const payload = Array.isArray(payloads) && payloads.length ? payloads[payloads.length - 1] : null;
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (!msg || msg.role !== "user") continue;
        if (typeof msg.content === "string") return msg.content;
        if (Array.isArray(msg.content)) {
          return msg.content
            .map((part: any) => (part && typeof part.text === "string" ? part.text : ""))
            .join("\n");
        }
      }
      return "";
    });

    expect(userPayloadText).toContain("KNOWLEDGE");
    expect(userPayloadText).toContain(sharedSentinel);
  });
});
