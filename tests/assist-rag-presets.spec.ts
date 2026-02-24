import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Assist RAG payload by preset", () => {
  test("sends KNOWLEDGE and CONTEXT chunks for explorer/edit/suggest", async ({ page }) => {
    test.setTimeout(180_000);
    const baseUrl = "http://127.0.0.1:5000";
    const sampleDocx = path.resolve(__dirname, "..", "test-data", "sample.docx");
    const knowledgeSentinel = "SENTINEL_KNOWLEDGE_PRESET_2026";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(
      () => Boolean((window as any).GoToolkitAssistInstance && (window as any).goToolkitDocumentApi && (window as any).GoToolkitDocumentManager),
      null,
      { timeout: 30_000 }
    );

    await page.evaluate(async ({ knowledgeSentinelText }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      const docApi = (window as any).goToolkitDocumentApi;
      const docManager = (window as any).GoToolkitDocumentManager;
      const ia = (window as any).GoToolkitIA;

      if (!assist || !docApi || !docManager || !ia?.chatCompletion) {
        throw new Error("Required APIs unavailable");
      }

      if (typeof (window as any).GoToolkitMemoCreateAutoDocument === "function") {
        await (window as any).GoToolkitMemoCreateAutoDocument();
      }

      assist.open?.();
      assist.setPromptPreset?.("advice");

      // Deterministic query embeddings for retrieval.
      (window as any).__ragOriginalEmbed = docManager.embed?.bind(docManager);
      docManager.embed = async () => [1, 0];

      // Capture AI-IN payloads for assertions.
      (window as any).__ragCapturedPayloads = [];
      (window as any).__ragOriginalChatCompletion = ia.chatCompletion.bind(ia);
      ia.chatCompletion = async (options: any) => {
        (window as any).__ragCapturedPayloads.push(options?.payload || null);
        return {
          text: JSON.stringify({
            answer: "ok",
            output: "ok"
          }),
          usage: { completion_tokens: 24 }
        };
      };

      // Seed a selectable Mémoire entry and force a known knowledge chunk.
      const knowledgeRecordId = `knowledge-preset-${Date.now()}`;
      await docApi.upsertRecord({
        id: knowledgeRecordId,
        app: "memo",
        title: "Knowledge Seed Preset",
        description: "Knowledge seed for preset coverage",
        superpowers: [],
        payload: {
          tabs: [
            {
              id: `${knowledgeRecordId}-tab`,
              title: "Knowledge Seed Preset",
              description: "",
              superpowers: [],
              content: "<p>Seed content</p>"
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
        throw new Error("Seed entry not found in Mémoire manifest");
      }

      const knowledgeKey = assist.normalizeKnowledgeKey(seedEntry.fileName || "");
      if (!knowledgeKey) {
        throw new Error("Unable to resolve seed knowledge key");
      }

      assist.setKnowledgeModalSelection(new Set([knowledgeKey]));
      assist.renderKnowledgeModalList(assist.knowledgeManifestEntries, new Set([knowledgeKey]));

      await docManager.deleteConversation?.(assist.knowledgeConversationId);
      const seededKnowledgeDocId = `kdoc-presets-${Date.now()}`;
      await docManager.putDocument({
        id: seededKnowledgeDocId,
        conversationId: assist.knowledgeConversationId,
        name: seedEntry.name || "Knowledge Seed Preset",
        sourceFileName: seedEntry.fileName || "knowledge-seed.md",
        sourceType: "embedded",
        updatedAt: Date.now(),
        scope: ["memo"]
      });
      await docManager.putChunk({
        id: `${seededKnowledgeDocId}:0`,
        conversationId: assist.knowledgeConversationId,
        docId: seededKnowledgeDocId,
        idx: 0,
        text: knowledgeSentinelText,
        emb: [1, 0],
        size: "small"
      });

    }, { knowledgeSentinelText: knowledgeSentinel });

    await page.waitForSelector("#assistSidebar");
    const attachBtn = page.locator("#assistSidebar #chatAttachFilesBtn");
    const textarea = page.locator("#assistSidebar textarea.chat-input");

    await attachBtn.click();
    const fileInputHandle = await page.evaluateHandle(() => (window as any).GoToolkitAssistInstance?.documentsFileInput);
    await (fileInputHandle as any).setInputFiles(sampleDocx);

    await page.waitForFunction(() => {
      const inst = (window as any).GoToolkitAssistInstance;
      return Boolean(inst?.pendingDocumentAttachments?.includes("sample.docx"));
    });

    const presets = [
      { id: "advice", label: "Explorer" },
      { id: "edit", label: "Éditer" },
      { id: "suggest", label: "Suggérer" }
    ];

    for (const preset of presets) {
      const beforeCount = await page.evaluate(() => {
        const payloads = (window as any).__ragCapturedPayloads;
        return Array.isArray(payloads) ? payloads.length : 0;
      });

      await page.evaluate((presetId) => {
        (window as any).GoToolkitAssistInstance?.setPromptPreset?.(presetId);
      }, preset.id);

      await textarea.fill(`Verify RAG payload for preset ${preset.id}`);
      await textarea.press("Enter");

      await expect.poll(async () => {
        return await page.evaluate(() => {
          const payloads = (window as any).__ragCapturedPayloads;
          return Array.isArray(payloads) ? payloads.length : 0;
        });
      }, { timeout: 30_000 }).toBeGreaterThan(beforeCount);

      const payloadSummary = await page.evaluate(() => {
        const payloads = (window as any).__ragCapturedPayloads;
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

      expect(payloadSummary, `${preset.label}: KNOWLEDGE block missing`).toContain("KNOWLEDGE");
      expect(payloadSummary, `${preset.label}: CONTEXT block missing`).toContain("CONTEXT");
      expect(payloadSummary, `${preset.label}: seeded knowledge chunk missing`).toContain(knowledgeSentinel);
      expect(
        payloadSummary,
        `${preset.label}: expected attachment context chunk not found`
      ).toMatch(/"documentName":"sample"/);
    }
  });
});
