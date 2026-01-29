import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Assist attachments persistence", () => {
  test("keeps attachments across messages and refresh with enabled state", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const fileA = path.resolve(__dirname, "..", "test-data", "sample.pdf");
    const fileB = path.resolve(__dirname, "..", "test-data", "sample.json");

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitAssistInstance));
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoGetActiveDocumentId?.()));
    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.open?.();
    });
    await page.waitForSelector("#assistSidebar");

    const attachBtn = page.locator("#assistSidebar #chatAttachFilesBtn");
    const textarea = page.locator("#assistSidebar textarea.chat-input");
    const list = page.locator("#assistSidebar .chat-composer-attachments--pending .chat-composer-attachments__list");

    await attachBtn.click();
    const fileInputHandle = await page.evaluateHandle(() => (window as any).GoToolkitAssistInstance?.documentsFileInput);
    await (fileInputHandle as any).setInputFiles(fileA);

    await page.waitForFunction(() => {
      const inst = (window as any).GoToolkitAssistInstance;
      return inst?.pendingDocumentAttachments?.includes("sample.pdf");
    });
    await expect(list).toContainText("sample.pdf");

    await textarea.fill("Message 1");
    await textarea.press("Enter");
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: "Message 1" })).toBeVisible();

    await page.waitForFunction(() => {
      const input = (window as any).GoToolkitAssistInstance?.documentsFileInput as HTMLInputElement | undefined;
      return Boolean(input && !input.disabled);
    });
    await attachBtn.click();
    const fileInputHandleB = await page.evaluateHandle(() => (window as any).GoToolkitAssistInstance?.documentsFileInput);
    await (fileInputHandleB as any).setInputFiles(fileB);

    await page.waitForFunction(() => {
      const inst = (window as any).GoToolkitAssistInstance;
      return inst?.pendingDocumentAttachments?.includes("sample.pdf")
        && inst?.pendingDocumentAttachments?.includes("sample.json")
        && inst?.attachmentsTotalCount === 0;
    });
    await expect(list).toContainText("sample.pdf");
    await expect(list).toContainText("sample.json");

    await textarea.fill("Message 2");
    await textarea.press("Enter");
    await expect(page.locator("#assistSidebar .chat-message--user", { hasText: "Message 2" })).toBeVisible();
    await expect(list).toContainText("sample.pdf");
    await expect(list).toContainText("sample.json");

    const secondItem = page.locator(
      "#assistSidebar .chat-composer-attachments--pending .chat-composer-attachment",
      { hasText: "sample.json" }
    );
    await secondItem.locator(".chat-composer-attachment__name").click();
    await expect(secondItem).toHaveAttribute("data-enabled", "false");

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitAssistInstance));
    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.open?.();
    });
    await page.waitForSelector("#assistSidebar");

    const listAfter = page.locator("#assistSidebar .chat-composer-attachments--pending .chat-composer-attachments__list");
    await expect(listAfter).toContainText("sample.pdf");
    await expect(listAfter).toContainText("sample.json");

    const firstItemAfter = page.locator(
      "#assistSidebar .chat-composer-attachments--pending .chat-composer-attachment",
      { hasText: "sample.pdf" }
    );
    const secondItemAfter = page.locator(
      "#assistSidebar .chat-composer-attachments--pending .chat-composer-attachment",
      { hasText: "sample.json" }
    );
    await expect(firstItemAfter).toHaveAttribute("data-enabled", "true");
    await expect(secondItemAfter).toHaveAttribute("data-enabled", "false");
  });
});
