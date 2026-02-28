import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";

test.describe("Cloud page switching persistency", () => {
  test("keeps cloud edits across cloud page switches and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 30_000 });
    await page.waitForSelector(".ProseMirror:visible", { timeout: 30_000 });

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const tokenA = `pw-cloud-a-${ts}`;
      const tokenB = `pw-cloud-b-${ts}`;
      const cloudAId = `share:${tokenA}`;
      const cloudBId = `share:${tokenB}`;
      const cloudATabId = `tab-a-${ts}`;
      const cloudBTabId = `tab-b-${ts}`;
      const cloudAEdit = `CLOUD_A_EDIT_${ts}`;

      const makePayload = (tabId: string, title: string, base: string) => ({
        tabs: [
          {
            id: tabId,
            title,
            description: "",
            superpowers: [],
            content: `<p>${base}</p>`
          }
        ],
        activeTabId: tabId,
        parentId: "",
        spaceId: PW_TEST_SPACE_ID,
        status: "active",
        position: ts
      });

      (window as any).GoToolkitSpaces?.upsertSpace?.({
        id: PW_TEST_SPACE_ID,
        name: "Go Live",
        icon: "cloud-upload",
        spaceJoinCode: PW_TEST_SPACE_CODE,
        isDefault: true
      });

      const payloadA = makePayload(cloudATabId, `PW Cloud A ${ts}`, `CLOUD_A_BASE_${ts}`);
      const payloadB = makePayload(cloudBTabId, `PW Cloud B ${ts}`, `CLOUD_B_BASE_${ts}`);
      const worker = (window as any).goToolkitShareWorker;
      const savedMetaA = await worker.saveSharePayload("pages-meta", tokenA, {
        title: `PW Cloud A ${ts}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId: PW_TEST_SPACE_ID,
        position: ts,
        status: "active"
      });
      await worker.saveSharePayload("pages", tokenA, payloadA);

      const savedMetaB = await worker.saveSharePayload("pages-meta", tokenB, {
        title: `PW Cloud B ${ts}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId: PW_TEST_SPACE_ID,
        position: ts + 1,
        status: "active"
      });
      await worker.saveSharePayload("pages", tokenB, payloadB);

      await (window as any).goToolkitShareHistory.upsertRecord("memo", {
        token: tokenA,
        title: `PW Cloud A ${ts}`,
        description: "",
        superpowers: [],
        payload: payloadA,
        icon: "file-symlink",
        parentId: "",
        spaceId: PW_TEST_SPACE_ID,
        position: ts,
        updatedAt: String(savedMetaA?.updatedAt || new Date().toISOString())
      });

      await (window as any).goToolkitShareHistory.upsertRecord("memo", {
        token: tokenB,
        title: `PW Cloud B ${ts}`,
        description: "",
        superpowers: [],
        payload: payloadB,
        icon: "file-symlink",
        parentId: "",
        spaceId: PW_TEST_SPACE_ID,
        position: ts + 1,
        updatedAt: String(savedMetaB?.updatedAt || new Date().toISOString())
      });

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return { cloudAId, cloudBId, cloudAEdit };
    });

    const clickDoc = async (docId: string) => {
      const item = page.locator(`.document-explorer__item[data-document-id="${docId}"]`).first();
      await expect(item).toBeVisible({ timeout: 30_000 });
      await item.click();
      await page.waitForFunction(
        expectedId => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
        docId,
        { timeout: 30_000 }
      );
    };

    const getEditorHtml = async () => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));

    await clickDoc(seed.cloudAId);
    const editor = page.locator(".ProseMirror:visible").first();
    await editor.click();
    await page.keyboard.type(` ${seed.cloudAEdit}`);
    await expect.poll(getEditorHtml, { timeout: 15_000 }).toContain(seed.cloudAEdit);

    await clickDoc(seed.cloudBId);
    await clickDoc(seed.cloudAId);
    await expect.poll(getEditorHtml, { timeout: 15_000 }).toContain(seed.cloudAEdit);

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });

    await clickDoc(seed.cloudAId);
    await expect.poll(getEditorHtml, { timeout: 20_000 }).toContain(seed.cloudAEdit);
  });
});
