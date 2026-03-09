import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, syncGolive, typeIntoVisibleEditor, waitForMemoReady } from "./helpers/memo-ui";

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
      const cloudBEdit = `CLOUD_B_EDIT_${ts}`;
      const cloudABase = `CLOUD_A_BASE_${ts}`;
      const cloudBBase = `CLOUD_B_BASE_${ts}`;

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

      const payloadA = makePayload(cloudATabId, `PW Cloud A ${ts}`, cloudABase);
      const payloadB = makePayload(cloudBTabId, `PW Cloud B ${ts}`, cloudBBase);
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
      return { cloudAId, cloudBId, cloudAEdit, cloudBEdit, cloudABase, cloudBBase, tokenA, tokenB, spaceId };
    }, { spaceId: PW_TEST_SPACE_ID, spaceCode: PW_TEST_SPACE_CODE });

    const readDocState = async (docId: string, token: string) => page.evaluate(async ({ currentDocId, currentToken }) => {
      const history = (window as any).goToolkitShareHistory;
      const drafts = (window as any).goToolkitCloudDrafts;
      const worker = (window as any).goToolkitShareWorker;
      const historyRows = await history?.getRecordsByApp?.("memo").catch?.(() => []) || [];
      const historyRow = Array.isArray(historyRows)
        ? historyRows.find((row: any) => String(row?.token || "") === String(currentToken || ""))
        : null;
      const allDrafts = await drafts?.readAll?.().catch?.(() => ({})) || {};
      const draft = allDrafts?.[currentDocId] || null;
      const remotePage = currentToken ? await worker?.fetchSharePayload?.("pages", currentToken).catch?.(() => null) : null;
      return {
        activeDocId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
        editorHtml: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
        historyHtml: String(historyRow?.payload?.tabs?.[0]?.content || ""),
        draftHtml: String(draft?.payload?.tabs?.[0]?.content || ""),
        remoteHtml: String(remotePage?.payload?.tabs?.[0]?.content || "")
      };
    }, { currentDocId: docId, currentToken: token });

    const expectExcludesOnly = (label: string, html: string, excludes: string[]) => {
      excludes.forEach(marker => {
        expect.soft(html, `${label}: mixed with ${marker}`).not.toContain(marker);
      });
    };

    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.cloudAEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudAEdit);

    await clickMemoDoc(page, seed.cloudBId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.cloudBEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudBEdit);

    const stateBLocal = await readDocState(seed.cloudBId, seed.tokenB);
    expectExcludesOnly("cloudB editor before switch back", stateBLocal.editorHtml, [seed.cloudABase, seed.cloudAEdit]);
    expectExcludesOnly("cloudB history before switch back", stateBLocal.historyHtml, [seed.cloudABase, seed.cloudAEdit]);

    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudAEdit);

    const stateALocal = await readDocState(seed.cloudAId, seed.tokenA);
    expectExcludesOnly("cloudA editor after switch back", stateALocal.editorHtml, [seed.cloudBBase, seed.cloudBEdit]);
    expectExcludesOnly("cloudA history after switch back", stateALocal.historyHtml, [seed.cloudBBase, seed.cloudBEdit]);

    await syncGolive(page, seed.spaceId, 60_000);

    const stateARemoteAfterSync = await readDocState(seed.cloudAId, seed.tokenA);
    const stateBRemoteAfterSync = await readDocState(seed.cloudBId, seed.tokenB);
    expectExcludesOnly("cloudA remote after sync", stateARemoteAfterSync.remoteHtml, [seed.cloudBBase, seed.cloudBEdit]);
    expectExcludesOnly("cloudB remote after sync", stateBRemoteAfterSync.remoteHtml, [seed.cloudABase, seed.cloudAEdit]);

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);

    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.cloudAEdit);
    const stateAAfterReload = await readDocState(seed.cloudAId, seed.tokenA);
    expectExcludesOnly("cloudA editor after reload", stateAAfterReload.editorHtml, [seed.cloudBBase, seed.cloudBEdit]);

    await clickMemoDoc(page, seed.cloudBId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.cloudBEdit);
    const stateBAfterReload = await readDocState(seed.cloudBId, seed.tokenB);
    expectExcludesOnly("cloudB editor after reload", stateBAfterReload.editorHtml, [seed.cloudABase, seed.cloudAEdit]);
  });
});
