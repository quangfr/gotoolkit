import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Memo import + AI performance", () => {
  test("imports files then asks AI in edit mode", async ({ page }) => {
    test.setTimeout(180_000);
    const baseUrl = "http://127.0.0.1:5000";
    const dataDir = path.resolve(process.cwd(), "test-data");
    const filePaths = [
      path.join(dataDir, "sample.json"),
    ];

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    await page.waitForFunction(
      () => Boolean((window as any).GoToolkitAssistInstance),
      null,
      { timeout: 30_000 }
    );

    await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (assist?.open && !assist.isOpen) {
        assist.open();
      }
      if (assist?.setPromptPreset) {
        assist.setPromptPreset("edit");
      }
    });

    await page.waitForSelector("textarea.chat-input", { timeout: 30_000 });
    await page.waitForFunction(
      () => Boolean((window as any).GoToolkitAssistInstance?.docManager),
      null,
      { timeout: 30_000 }
    );

    await page.waitForSelector("#chatAttachFilesBtn", { timeout: 30_000 });
    await page.click("#chatAttachFilesBtn");

    const inputHandle = await page.waitForFunction(
      () => {
        const input = (window as any).GoToolkitAssistInstance?.documentsFileInput;
        return input instanceof HTMLInputElement ? input : null;
      },
      null,
      { timeout: 10_000 }
    );
    const inputElement = inputHandle.asElement();
    if (!inputElement) {
      throw new Error("documentsFileInput not available");
    }
    await inputElement.setInputFiles(filePaths);

    await page.waitForFunction(
      () => {
        const assist = (window as any).GoToolkitAssistInstance;
        return Boolean(assist?.attachmentsIngestionStart);
      },
      null,
      { timeout: 30_000 }
    );

    await page.waitForFunction(
      () => {
        const assist = (window as any).GoToolkitAssistInstance;
        return (
          assist?.attachmentsIngestionStart &&
          assist?.attachmentsIngestionEnd &&
          assist.attachmentsIngestionEnd >= assist.attachmentsIngestionStart
        );
      },
      null,
      { timeout: 120_000 }
    );

    const importMetrics = await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      return {
        start: assist?.attachmentsIngestionStart || 0,
        end: assist?.attachmentsIngestionEnd || 0,
        status: assist?.documentUploadStatus || "",
      };
    });

    const importDurationMs = importMetrics.end - importMetrics.start;
    console.log(
      `Import finished in ${importDurationMs} ms (status: ${importMetrics.status})`
    );

    expect(importDurationMs).toBeGreaterThan(0);

    const sampleRaw = fs.readFileSync(filePaths[0], "utf8");
    const sampleChunk = await page.evaluate((raw) => {
      const data = JSON.parse(raw);
      const chunker = (window as any).GoToolkitBuildJsonChunks;
      const chunks = typeof chunker === "function" ? chunker(data) : [];
      return chunks[0] || null;
    }, sampleRaw);
    console.log("Sample chunk:", JSON.stringify(sampleChunk, null, 2));

    const message = "Donne-moi un resume rapide des documents importes.";
    await page.fill("textarea.chat-input", message);

    const responsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "POST" &&
        response.url().includes("/chat/completions")
      );
    });

    const startChat = Date.now();
    await page.click("button.chat-send-btn");
    await responsePromise;

    await page.waitForFunction(
      () => {
        const entry = document.querySelector(".chat-message--bot .chat-content");
        return Boolean(entry?.textContent?.trim());
      },
      null,
      { timeout: 120_000 }
    );

    const responseDurationMs = Date.now() - startChat;
    const content = await page
      .locator(".chat-message--bot .chat-content")
      .innerText();

    console.log(
      `AI response ready after ${responseDurationMs} ms:`,
      content.trim()
    );

    expect(content.trim().length).toBeGreaterThan(0);
  });
});
