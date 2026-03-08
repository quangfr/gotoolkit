import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, typeIntoVisibleEditor, waitForMemoReady } from "./helpers/memo-ui";

test.describe("Cloud page switching persistency", () => {
  test("keeps cloud edits across cloud page switches and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await ensureCloudConnectedWithSpaceCode(page, baseUrl);
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 30_000 });
    await waitForMemoReady(page, 30_000);

    const seed = await page.evaluate(async ({ spaceId, spaceCode }) => {
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
        spaceId,
        status: "active",
        position: ts
      });

      (window as any).GoToolkitSpaces?.upsertSpace?.({
        id: spaceId,
        name: "Go Live",
        icon: "cloud-upload",
        spaceJoinCode: spaceCode,
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
        spaceId,
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
        spaceId,
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
        spaceId,
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
        spaceId,
        position: ts + 1,
        updatedAt: String(savedMetaB?.updatedAt || new Date().toISOString())
      });

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return { cloudAId, cloudBId, cloudAEdit };
    }, { spaceId: PW_TEST_SPACE_ID, spaceCode: PW_TEST_SPACE_CODE });

    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.cloudAEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudAEdit);

    await clickMemoDoc(page, seed.cloudBId, { allowProgrammaticOpen: false });
    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudAEdit);

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);

    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.cloudAEdit);
  });
});
