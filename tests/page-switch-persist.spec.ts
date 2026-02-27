import { expect, test } from "@playwright/test";

test.describe("Page switching content persistency", () => {
  test("switches between private/cloud pages and keeps edits after reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateDocument), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 30_000 });
    await page.waitForSelector(".ProseMirror:visible", { timeout: 30_000 });

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const privateAName = `PW Private A ${ts}`;
      const privateBName = `PW Private B ${ts}`;
      const cloudName = `PW Cloud A ${ts}`;
      const privateABase = `PRIVATE_A_BASE_${ts}`;
      const privateBBase = `PRIVATE_B_BASE_${ts}`;
      const cloudBase = `CLOUD_A_BASE_${ts}`;

      const privateAId = await (window as any).GoToolkitMemoCreateDocument({
        name: privateAName,
        initialContent: `<p>${privateABase}</p>`,
      });
      const privateBId = await (window as any).GoToolkitMemoCreateDocument({
        name: privateBName,
        initialContent: `<p>${privateBBase}</p>`,
      });

      const token = `pw-cloud-${ts}`;
      const cloudId = `share:${token}`;
      const tabId = `tab-${ts}`;
      const payload = {
        tabs: [
          {
            id: tabId,
            title: cloudName,
            description: "",
            superpowers: [],
            content: `<p>${cloudBase}</p>`,
          },
        ],
        activeTabId: tabId,
      };

      (window as any).GoToolkitSpaces?.upsertSpace?.({
        id: "golive",
        name: "Go Live",
        icon: "cloud-upload",
        spaceJoinCode: "equipe produit cloud securite intelligence",
        isDefault: true,
      });

      await (window as any).goToolkitShareHistory.upsertRecord("memo", {
        token,
        title: cloudName,
        description: "",
        superpowers: [],
        payload,
        icon: "file-symlink",
        parentId: "",
        spaceId: "golive",
        position: ts,
        updatedAt: new Date().toISOString(),
      });

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });

      return {
        privateAId,
        privateBId,
        cloudId,
        privateEdit: `PRIVATE_A_EDIT_${ts}`,
        cloudEdit: `CLOUD_A_EDIT_${ts}`,
      };
    });

    const getEditorHtml = async () =>
      page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));

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

    const appendByTyping = async (text: string) => {
      const editor = page.locator(".ProseMirror:visible").first();
      await expect(editor).toBeVisible({ timeout: 30_000 });
      await editor.click();
      await page.evaluate((value) => {
        const editorApi = (window as any).MemoEditor || (window as any).memoEditor;
        if (!editorApi?.chain) {
          throw new Error("MemoEditor API unavailable for insertion");
        }
        editorApi.chain().focus().insertContent(value).run();
      }, text);
    };

    await clickDoc(seed.privateAId);
    await appendByTyping(` ${seed.privateEdit}`);
    await expect.poll(getEditorHtml, { timeout: 15_000 }).toContain(seed.privateEdit);

    await clickDoc(seed.cloudId);
    await appendByTyping(` ${seed.cloudEdit}`);
    await expect.poll(getEditorHtml, { timeout: 15_000 }).toContain(seed.cloudEdit);

    await clickDoc(seed.privateBId);
    await expect.poll(async () => String((await page.evaluate(() => (window as any).GoToolkitMemoGetActiveDocumentId?.() || ""))), { timeout: 15_000 }).toContain(seed.privateBId);

    await clickDoc(seed.privateAId);
    expect(await getEditorHtml()).toContain(seed.privateEdit);

    await clickDoc(seed.cloudId);
    expect(await getEditorHtml()).toContain(seed.cloudEdit);

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });

    await clickDoc(seed.privateAId);
    await expect.poll(getEditorHtml, { timeout: 20_000 }).toContain(seed.privateEdit);

    await clickDoc(seed.cloudId);
    await expect.poll(getEditorHtml, { timeout: 20_000 }).toContain(seed.cloudEdit);
  });
});
