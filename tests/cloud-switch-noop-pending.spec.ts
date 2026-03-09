import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { clickMemoDoc, refreshMemoExplorer, waitForMemoReady } from "./helpers/memo-ui";

test.describe("Cloud noop switch pending badge", () => {
  test("does not create pending state when switching cloud pages without edits", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await ensureCloudConnectedWithSpaceCode(page, baseUrl);
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 30_000 });
    await waitForMemoReady(page, 30_000);

    const seed = await page.evaluate(async ({ spaceId, spaceCode }) => {
      const ts = Date.now();
      const tokenA = `pw-noop-cloud-a-${ts}`;
      const tokenB = `pw-noop-cloud-b-${ts}`;
      const cloudAId = `share:${tokenA}`;
      const cloudBId = `share:${tokenB}`;
      const cloudATabId = `tab-a-${ts}`;
      const cloudBTabId = `tab-b-${ts}`;

      const makePayload = (tabId: string, title: string, base: string, position: number) => ({
        tabs: [
          {
            id: tabId,
            title,
            description: "",
            superpowers: [],
            content: `<h1>${base}</h1><p>${base} body</p>`
          }
        ],
        activeTabId: tabId,
        parentId: "",
        spaceId,
        status: "active",
        position
      });

      (window as any).GoToolkitSpaces?.upsertSpace?.({
        id: spaceId,
        name: "Go Live",
        icon: "cloud-upload",
        spaceJoinCode: spaceCode,
        isDefault: true
      });

      const payloadA = makePayload(cloudATabId, `PW Noop A ${ts}`, `NOOP_A_${ts}`, ts);
      const payloadB = makePayload(cloudBTabId, `PW Noop B ${ts}`, `NOOP_B_${ts}`, ts + 1);
      const worker = (window as any).goToolkitShareWorker;
      const history = (window as any).goToolkitShareHistory;

      await worker.saveSharePayload("pages-meta", tokenA, {
        title: `PW Noop A ${ts}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: ts,
        status: "active"
      });
      await worker.saveSharePayload("pages", tokenA, payloadA);
      await history.upsertRecord("memo", {
        token: tokenA,
        title: `PW Noop A ${ts}`,
        description: "",
        superpowers: [],
        payload: payloadA,
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: ts,
        updatedAt: new Date().toISOString()
      });

      await worker.saveSharePayload("pages-meta", tokenB, {
        title: `PW Noop B ${ts}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: ts + 1,
        status: "active"
      });
      await worker.saveSharePayload("pages", tokenB, payloadB);
      await history.upsertRecord("memo", {
        token: tokenB,
        title: `PW Noop B ${ts}`,
        description: "",
        superpowers: [],
        payload: payloadB,
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: ts + 1,
        updatedAt: new Date().toISOString()
      });

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return { cloudAId, cloudBId, spaceId };
    }, { spaceId: PW_TEST_SPACE_ID, spaceCode: PW_TEST_SPACE_CODE });

    const readState = async (docId: string) => page.evaluate(async ({ targetDocId, targetSpaceId }) => {
      const drafts = await (window as any).goToolkitCloudDrafts?.readAll?.().catch?.(() => ({}));
      const draft = drafts?.[targetDocId] || null;
      const pending = typeof (window as any).getPendingSharedSyncDetailsInSpace === "function"
        ? (window as any).getPendingSharedSyncDetailsInSpace(targetSpaceId)
        : null;
      return {
        activeDocumentId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
        draft,
        pendingCount: Number(pending?.count || 0)
      };
    }, { targetDocId: docId, targetSpaceId: seed.spaceId });

    await refreshMemoExplorer(page, 30_000);
    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    const afterOpenA = await readState(seed.cloudAId);
    await clickMemoDoc(page, seed.cloudBId, { allowProgrammaticOpen: false });

    const afterA = await readState(seed.cloudAId);
    const afterB = await readState(seed.cloudBId);

    expect(Boolean(afterOpenA.draft)).toBeFalsy();
    expect(Boolean(afterA.draft)).toBeFalsy();
    expect(Boolean(afterB.draft)).toBeFalsy();
    expect(afterB.pendingCount).toBe(0);
  });
});
