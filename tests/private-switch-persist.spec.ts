import { expect, test } from "@playwright/test";

test.describe("Private page switching persistency", () => {
  test("keeps private edits across panel switches and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateDocument), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });
    await page.waitForSelector(".ProseMirror:visible", { timeout: 30_000 });

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const privateAId = await (window as any).GoToolkitMemoCreateDocument({
        name: `PW Private A ${ts}`,
        initialContent: `<p>PRIVATE_A_BASE_${ts}</p>`,
      });
      const privateBId = await (window as any).GoToolkitMemoCreateDocument({
        name: `PW Private B ${ts}`,
        initialContent: `<p>PRIVATE_B_BASE_${ts}</p>`,
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return {
        privateAId,
        privateBId,
        privateEdit: `PRIVATE_A_EDIT_${ts}`,
      };
    });

    const clickDoc = async (docId: string) => {
      const item = page.locator(`.document-explorer__item[data-document-id="${docId}"]`).first();
      await expect(item).toBeVisible({ timeout: 30_000 });
      await item.click();
      await page.waitForFunction(
        (expectedId) => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
        docId,
        { timeout: 30_000 }
      );
    };

    const getEditorHtml = async () =>
      page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));

    const appendByTyping = async (text: string) => {
      const editor = page.locator(".ProseMirror:visible").first();
      await expect(editor).toBeVisible({ timeout: 30_000 });
      await editor.click();
      await page.keyboard.type(text);
    };

    await clickDoc(seed.privateAId);
    await appendByTyping(` ${seed.privateEdit}`);
    await expect.poll(getEditorHtml, { timeout: 15_000 }).toContain(seed.privateEdit);

    await clickDoc(seed.privateBId);
    await page.waitForFunction(
      (expectedId) => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
      seed.privateBId,
      { timeout: 15_000 }
    );

    await clickDoc(seed.privateAId);
    await expect.poll(getEditorHtml, { timeout: 15_000 }).toContain(seed.privateEdit);

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });

    await clickDoc(seed.privateAId);
    await expect.poll(getEditorHtml, { timeout: 20_000 }).toContain(seed.privateEdit);
  });
});
