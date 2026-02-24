import { expect, test } from "@playwright/test";

test.describe("Assist per-page conversations", () => {
  test("keeps distinct chat threads when switching memo pages", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const runId = Date.now().toString(36);
    const markerA = `PAGE-A-${runId}`;
    const markerB = `PAGE-B-${runId}`;

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitAssistInstance));
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitAssistInstance));
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));

    await page.evaluate(() => {
      const ia = (window as any).GoToolkitIA;
      const original = ia?.chatCompletion?.bind(ia);
      if (!original) return;
      (window as any).__assistOriginalChatCompletion = original;
      ia.chatCompletion = async () => ({
        text: JSON.stringify({
          answer: "ok",
          output: "ok"
        }),
        usage: { completion_tokens: 12 }
      });
    });

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoGetActiveDocumentId?.()));
    const docA = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
    expect(docA).toBeTruthy();

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction((previous) => {
      return String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") !== String(previous || "");
    }, docA);
    const docB = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
    expect(docB).toBeTruthy();
    expect(docB).not.toBe(docA);

    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.open?.();
      (window as any).GoToolkitAssistInstance?.setPromptPreset?.("ask");
    });
    await page.waitForSelector("#assistSidebar");

    const sendPrompt = async (value: string) => {
      await page.evaluate(async (text) => {
        await (window as any).GoToolkitAssistInstance?.handleSend?.({ value: text });
      }, value);
    };

    await page.locator(`#document-tabs .document-tab[data-document-id="${docA}"]`).click();
    await page.waitForFunction((id) => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(id), docA);
    await sendPrompt(`${markerA} one line`);
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: markerA })).toBeVisible();

    await page.locator(`#document-tabs .document-tab[data-document-id="${docB}"]`).click();
    await page.waitForFunction((id) => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(id), docB);
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: markerA })).toHaveCount(0);
    await sendPrompt(`${markerB} one line`);
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: markerB })).toBeVisible();

    await page.locator(`#document-tabs .document-tab[data-document-id="${docA}"]`).click();
    await page.waitForFunction((id) => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(id), docA);
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: markerA })).toBeVisible();
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: markerB })).toHaveCount(0);

    const persisted = await page.evaluate(({ a, b, mA, mB }) => {
      const key = "goToolkit.chat.conversations.memo";
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      const tabA = (window as any).GoToolkitMemoGetDocumentActiveTabId?.(a) || "";
      const tabB = (window as any).GoToolkitMemoGetDocumentActiveTabId?.(b) || "";
      const convA = parsed?.[`doc:${tabA}`];
      const convB = parsed?.[`doc:${tabB}`];
      const msgsA = Array.isArray(convA?.messages) ? convA.messages : [];
      const msgsB = Array.isArray(convB?.messages) ? convB.messages : [];
      return {
        hasA: msgsA.some((m: any) => m?.role === "user" && String(m?.content || "").includes(mA)),
        hasB: msgsB.some((m: any) => m?.role === "user" && String(m?.content || "").includes(mB)),
      };
    }, { a: docA, b: docB, mA: markerA, mB: markerB });

    expect(persisted.hasA).toBeTruthy();
    expect(persisted.hasB).toBeTruthy();
  });
});

