import { expect, test } from "@playwright/test";

test.describe("Assist conversation isolation", () => {
  test("routes real AI responses to the right document scope across tab switches", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const testRunId = Date.now().toString(36);
    const markerA = `ISO-A-${testRunId}`;
    const markerB = `ISO-B-${testRunId}`;
    const markerC = `ISO-C-${testRunId}`;

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitAssistInstance));
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));

    const aiReady = await page.evaluate(() => {
      const client = (window as any).GoToolkitIA;
      const hasClient = Boolean(client && typeof client.chatCompletion === "function");
      const cfg = (window as any).GoToolkitIAConfig;
      const hasOpenRouter = typeof cfg?.isOpenRouterAvailable === "function"
        ? Boolean(cfg.isOpenRouterAvailable())
        : Boolean(cfg?.getOpenRouterApiKey?.() || cfg?.OPENROUTER_PROXY_ENDPOINT);
      const hasOpenAI = Boolean(cfg?.getOpenAIApiKey?.() || cfg?.OPENAI_PROXY_ENDPOINT);
      return { hasClient, hasOpenRouter, hasOpenAI };
    });
    test.skip(!aiReady.hasClient || (!aiReady.hasOpenRouter && !aiReady.hasOpenAI), "AI backend not configured");

    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitAssistInstance));
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));

    await page.evaluate(() => {
      (window as any).__assistRealRequests = [];
      (window as any).__assistRealResponses = [];
      const ia = (window as any).GoToolkitIA;
      const original = ia?.chatCompletion?.bind(ia);
      if (!original) return;
      (window as any).__assistOriginalChatCompletion = original;
      ia.chatCompletion = async (options: any) => {
        const messages = Array.isArray(options?.payload?.messages) ? options.payload.messages : [];
        const userMsg = [...messages].reverse().find((m) => m && m.role === "user" && typeof m.content === "string");
        const raw = (userMsg?.content || "").toString();
        const marker = /ISO-[ABC]-[a-z0-9]+/i.exec(raw)?.[0] || "UNKNOWN";
        (window as any).__assistRealRequests.push({ marker, at: Date.now() });
        const result = await original(options);
        (window as any).__assistRealResponses.push({ marker, at: Date.now() });
        return result;
      };
    });

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoGetActiveDocumentId?.()));
    const doc1Id = await page.evaluate(() => (window as any).GoToolkitMemoGetActiveDocumentId?.() || null);
    expect(doc1Id).toBeTruthy();

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction(
      (id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() && (window as any).GoToolkitMemoGetActiveDocumentId?.() !== id,
      doc1Id
    );
    const doc2Id = await page.evaluate(() => (window as any).GoToolkitMemoGetActiveDocumentId?.() || null);
    expect(doc2Id).toBeTruthy();
    expect(doc2Id).not.toBe(doc1Id);

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction(
      (id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() && (window as any).GoToolkitMemoGetActiveDocumentId?.() !== id,
      doc2Id
    );
    const doc3Id = await page.evaluate(() => (window as any).GoToolkitMemoGetActiveDocumentId?.() || null);
    expect(doc3Id).toBeTruthy();
    expect(doc3Id).not.toBe(doc1Id);
    expect(doc3Id).not.toBe(doc2Id);

    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.open?.();
      (window as any).GoToolkitAssistInstance.promptPresetId = "ask";
      (window as any).GoToolkitAssistInstance?.syncScopeFromActiveDocument?.({ force: true });
    });
    await page.waitForSelector("#assistSidebar");

    const sendPrompt = async (text: string) => {
      await page.evaluate(async (prompt) => {
        await (window as any).GoToolkitAssistInstance?.handleSend?.({ value: prompt });
      }, text);
    };

    await page.locator(`#document-tabs .document-tab[data-document-id="${doc2Id}"]`).click();
    await page.waitForFunction((id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() === id, doc2Id);
    await page.evaluate(() => (window as any).GoToolkitAssistInstance?.syncScopeFromActiveDocument?.({ force: true }));
    await sendPrompt(`${markerB} Reply in one short line.`);

    await page.locator(`#document-tabs .document-tab[data-document-id="${doc3Id}"]`).click();
    await page.waitForFunction((id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() === id, doc3Id);
    await page.evaluate(() => (window as any).GoToolkitAssistInstance?.syncScopeFromActiveDocument?.({ force: true }));
    await sendPrompt(`${markerC} Reply in one short line.`);

    await page.locator(`#document-tabs .document-tab[data-document-id="${doc1Id}"]`).click();
    await page.waitForFunction((id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() === id, doc1Id);
    await page.evaluate(() => (window as any).GoToolkitAssistInstance?.syncScopeFromActiveDocument?.({ force: true }));
    await sendPrompt(`${markerA} Reply in one short line.`);

    await page.waitForFunction(
      ({ a, b, c }) => {
        const req = Array.isArray((window as any).__assistRealRequests) ? (window as any).__assistRealRequests : [];
        const res = Array.isArray((window as any).__assistRealResponses) ? (window as any).__assistRealResponses : [];
        const reqMarkers = req.map((e: any) => e?.marker).filter(Boolean);
        const resMarkers = res.map((e: any) => e?.marker).filter(Boolean);
        return reqMarkers.includes(a) && reqMarkers.includes(b) && reqMarkers.includes(c)
          && resMarkers.includes(a) && resMarkers.includes(b) && resMarkers.includes(c);
      },
      { a: markerA, b: markerB, c: markerC },
      { timeout: 150_000 }
    );

    const persisted = await page.evaluate(({ d1, d2, d3, a, b, c }) => {
      const key = "goToolkit.chat.conversations.memo";
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      const targets = [
        { key: `doc:${d1}`, marker: a },
        { key: `doc:${d2}`, marker: b },
        { key: `doc:${d3}`, marker: c },
      ];
      return targets.map((target) => {
        const conv = parsed?.[target.key];
        const msgs = Array.isArray(conv?.messages) ? conv.messages : [];
        const hasUser = msgs.some((m: any) => m?.role === "user" && typeof m?.content === "string" && m.content.includes(target.marker));
        const hasBotFinal = msgs.some((m: any) => m?.role === "bot" && typeof m?.content === "string" && m.content.trim() && m.content.trim() !== "...");
        return { scope: target.key, hasUser, hasBotFinal, messageCount: msgs.length };
      });
    }, { d1: doc1Id, d2: doc2Id, d3: doc3Id, a: markerA, b: markerB, c: markerC });

    for (const scope of persisted) {
      expect(scope.hasUser, `missing user message in ${scope.scope}`).toBeTruthy();
      expect(scope.hasBotFinal, `missing final bot response in ${scope.scope}`).toBeTruthy();
    }
  });
});

