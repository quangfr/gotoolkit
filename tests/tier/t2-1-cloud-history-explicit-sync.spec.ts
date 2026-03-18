import { expect, test } from "@playwright/test";
import { ensureCloudConnectedWithSpaceCode } from "../helpers/cloud-auth";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "../helpers/share-test-space";
import { clickMemoDoc, refreshMemoExplorer, syncGolive, typeIntoVisibleEditor, waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test.describe("Cloud history explicit sync", () => {
  test("keeps pages-history local during edit switch and save, then flushes on manual sync", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const pagesHistoryRequests: string[] = [];
    const logStep = createStepLogger("cloud-history-explicit-sync");

    attachPageDebugLogging(page, "cloud-history-explicit-sync");

    page.on("request", request => {
      const url = request.url();
      if (url.includes("/v1/shares/pages-history")) {
        pagesHistoryRequests.push(url);
      }
    });

    logStep("connect-space:start");
    await ensureCloudConnectedWithSpaceCode(page, baseUrl);
    logStep("connect-space:done");
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 30_000 });
    await waitForMemoReady(page, 30_000);
    logStep("memo-ready");

    logStep("seed-cloud-docs:start");
    const seed = await page.evaluate(async ({ spaceId, spaceCode }) => {
      const ts = Date.now();
      const tokenA = `pw-history-a-${ts}`;
      const tokenB = `pw-history-b-${ts}`;
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
            content: `<p>${base}</p>`
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

      const payloadA = makePayload(cloudATabId, `PW History A ${ts}`, `HISTORY_A_${ts}`, ts);
      const payloadB = makePayload(cloudBTabId, `PW History B ${ts}`, `HISTORY_B_${ts}`, ts + 1);
      const worker = (window as any).goToolkitShareWorker;
      const history = (window as any).goToolkitShareHistory;

      await worker.saveSharePayload("pages-meta", tokenA, {
        title: `PW History A ${ts}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: ts,
        status: "active"
      }, { spaceId });
      await worker.saveSharePayload("pages", tokenA, payloadA, { spaceId });
      await history.upsertRecord("memo", {
        token: tokenA,
        title: `PW History A ${ts}`,
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
        title: `PW History B ${ts}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: ts + 1,
        status: "active"
      }, { spaceId });
      await worker.saveSharePayload("pages", tokenB, payloadB, { spaceId });
      await history.upsertRecord("memo", {
        token: tokenB,
        title: `PW History B ${ts}`,
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
      return { cloudAId, cloudBId, tokenA, spaceId, marker: `HISTORY_EDIT_${ts}` };
    }, { spaceId: PW_TEST_SPACE_ID, spaceCode: PW_TEST_SPACE_CODE });
    logStep("seed-cloud-docs:done", seed);

    pagesHistoryRequests.length = 0;

    logStep("edit-save-switch:start");
    await refreshMemoExplorer(page, 30_000);
    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.marker}`);

    await page.evaluate(() => {
      const editor = (window as any).GoToolkitMemoInstance;
      editor.exportDocx = async () => new Blob(["ok"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
      (document.getElementById("saveDocumentBtn") as HTMLButtonElement | null)?.click();
    });
    await page.waitForTimeout(300);
    await clickMemoDoc(page, seed.cloudBId, { allowProgrammaticOpen: false });
    await page.waitForTimeout(1200);
    logStep("edit-save-switch:done", { pagesHistoryRequests: pagesHistoryRequests.length });

    expect(pagesHistoryRequests, "edit, save, and switch should not call pages-history before manual sync").toHaveLength(0);

    const pendingQueueBeforeSync = await page.evaluate(async () => {
      return await (window as any).goToolkitDocStore?.createStore?.("documents-settings")?.get?.("memo.pending-remote-history").catch?.(() => null);
    });
    expect(Object.keys(pendingQueueBeforeSync || {})).toContain(seed.tokenA);

    logStep("sync:start");
    await syncGolive(page, seed.spaceId, 60_000);
    logStep("sync:done");

    await expect.poll(async () => {
      const pendingQueueAfterSync = await page.evaluate(async () => {
        return await (window as any).goToolkitDocStore?.createStore?.("documents-settings")?.get?.("memo.pending-remote-history").catch?.(() => null);
      });
      return Object.keys(pendingQueueAfterSync || {});
    }, { timeout: 20_000, intervals: [500, 1000, 2000] }).not.toContain(seed.tokenA);
    expect(pagesHistoryRequests.some(url => url.includes(seed.tokenA))).toBeTruthy();

    const remoteHistory = await page.evaluate(async ({ token, spaceId }) => {
      return await (window as any).goToolkitShareWorker?.fetchSharePayload?.("pages-history", token, { spaceId }).catch?.(() => null);
    }, { token: seed.tokenA, spaceId: seed.spaceId });
    const remoteVersions = Array.isArray(remoteHistory?.payload?.versions) ? remoteHistory.payload.versions : [];
    const latestHtml = String(remoteVersions[0]?.payload?.tabs?.[0]?.content || "");
    logStep("remote-history:result", { versions: remoteVersions.length, latestHtml });
    expect(latestHtml).toContain(seed.marker);
  });
});
