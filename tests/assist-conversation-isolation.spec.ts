import { expect, test } from "@playwright/test";

test.describe("Assist conversation isolation", () => {
  test("keeps one conversation per document tab even with delayed response", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitAssistInstance));
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));

    await page.evaluate(() => {
      (window as any).__assistMockDoneB = false;
      (window as any).GoToolkitIA.chatCompletion = async (options: any) => {
        const messages = Array.isArray(options?.payload?.messages) ? options.payload.messages : [];
        const userMsg = [...messages].reverse().find((m) => m && m.role === "user" && typeof m.content === "string");
        const userContent = (userMsg?.content || "").toString();
        const askMatch = userContent.match(/ASK[:\n]\s*([\s\S]*)$/i);
        const ask = (askMatch?.[1] || userContent).trim();
        const isB = /generate\s*["']?B["']?/i.test(ask);
        const delayMs = isB ? 2200 : 120;
        const answer = isB ? "B response" : "A response";
        const text = JSON.stringify({
          answer,
          suggestions: [],
          references: []
        });

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (typeof options?.onChunk === "function") {
          options.onChunk(text);
        }
        if (isB) {
          (window as any).__assistMockDoneB = true;
        }
        return {
          text,
          usage: { total_tokens: 42, prompt_tokens: 21, completion_tokens: 21 }
        };
      };
    });

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoGetActiveDocumentId?.()));
    const doc1Id = await page.evaluate(() => (window as any).GoToolkitMemoGetActiveDocumentId?.() || null);
    expect(doc1Id).toBeTruthy();

    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.open?.();
    });
    await page.waitForSelector("#assistSidebar");

    const textarea = page.locator("#assistSidebar textarea.chat-input");
    await textarea.fill('generate "A"');
    await textarea.press("Enter");

    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: 'generate "A"' })).toBeVisible();
    await expect(page.locator("#assistSidebar .chat-message--bot .chat-content", { hasText: "A response" })).toBeVisible({
      timeout: 15_000
    });

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

    await page.locator(`#document-tabs .document-tab[data-document-id="${doc2Id}"]`).click();
    await page.waitForFunction(
      (id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() === id,
      doc2Id
    );
    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.syncScopeFromActiveDocument?.({ force: true });
    });
    await expect(page.locator("#assistSidebar .chat-message")).toHaveCount(0, { timeout: 30_000 });

    await textarea.fill('generate "B"');
    await textarea.press("Enter");
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: 'generate "B"' })).toBeVisible();

    await page.locator(`#document-tabs .document-tab[data-document-id="${doc1Id}"]`).click();
    await page.waitForFunction(
      (id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() === id,
      doc1Id
    );

    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: 'generate "A"' })).toBeVisible();
    await expect(page.locator("#assistSidebar .chat-message--bot .chat-content", { hasText: "A response" })).toBeVisible();
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: 'generate "B"' })).toHaveCount(0);
    await expect(page.locator("#assistSidebar .chat-message--bot .chat-content", { hasText: "B response" })).toHaveCount(0);

    await page.waitForFunction(() => Boolean((window as any).__assistMockDoneB), null, { timeout: 20_000 });
    await expect(page.locator("#assistSidebar .chat-message--bot .chat-content", { hasText: "B response" })).toHaveCount(0);

    await page.locator(`#document-tabs .document-tab[data-document-id="${doc2Id}"]`).click();
    await page.waitForFunction(
      (id) => (window as any).GoToolkitMemoGetActiveDocumentId?.() === id,
      doc2Id
    );
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: 'generate "B"' })).toBeVisible();
    await expect(page.locator("#assistSidebar .chat-message--bot .chat-content", { hasText: "B response" })).toBeVisible({
      timeout: 20_000
    });
  });
});
