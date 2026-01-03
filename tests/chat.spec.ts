import { expect, test } from "@playwright/test";

test.describe("Chat IA smoke", () => {
  test("opens the chat, sends a message, and measures response latency", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    const logs: string[] = [];
    page.on("console", (message) => {
      logs.push(message.text());
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("button.chat-toggle-button", { timeout: 30_000 });
    await page.click("button.chat-toggle-button");
    await page.waitForSelector("textarea.chat-input", { timeout: 30_000 });

    const message = "Bonjour, peux-tu répondre sommairement ?";
    await page.fill("textarea.chat-input", message);

    const responsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "POST" &&
        response.url().includes("/chat/completions")
      );
    });

    const start = Date.now();
    await page.click("button.chat-send-btn");

    const response = await responsePromise;
    const headersLatency = Date.now() - start;
    console.log(
      `chat/completions headers received in ${headersLatency} ms (status ${response.status()})`
    );

    await page.waitForFunction(() => {
      const entry = document.querySelector(".chat-message--bot .chat-content");
      return Boolean(entry?.textContent?.trim());
    }, { timeout: 60_000 });

    const renderLatency = Date.now() - start;
    const content = await page
      .locator(".chat-message--bot .chat-content")
      .innerText();
    console.log(`bot response ready after ${renderLatency} ms:`, content.trim());
    console.log("page console logs:", logs);

    expect(content.trim().length).toBeGreaterThan(0);
  });
});
