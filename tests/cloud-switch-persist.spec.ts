import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, syncGolive, typeIntoVisibleEditor, waitForMemoReady } from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";
import { readCloudMemoLocalState, readCloudMemoRemoteState, seedCloudMemoDocs, waitForCloudMemoApis } from "./helpers/cloud-state";

test.describe("Cloud page switching persistency", () => {
  test("keeps cloud edits across cloud page switches and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("cloud-switch-persist");

    attachPageDebugLogging(page, "cloud-switch-persist");

    logStep("connect-space:start");
    await ensureCloudConnectedWithSpaceCode(page, baseUrl);
    logStep("connect-space:done");
    await waitForCloudMemoApis(page, 30_000);
    await waitForMemoReady(page, 30_000);
    logStep("memo-ready");

    logStep("seed-cloud-docs:start");
    const ts = Date.now();
    const tokenA = `pw-cloud-a-${ts}`;
    const tokenB = `pw-cloud-b-${ts}`;
    const seed = {
      cloudAId: `share:${tokenA}`,
      cloudBId: `share:${tokenB}`,
      cloudAEdit: `CLOUD_A_EDIT_${ts}`,
      cloudBEdit: `CLOUD_B_EDIT_${ts}`,
      cloudABase: `CLOUD_A_BASE_${ts}`,
      cloudBBase: `CLOUD_B_BASE_${ts}`,
      tokenA,
      tokenB,
      spaceId: PW_TEST_SPACE_ID
    };
    await seedCloudMemoDocs(page, {
      spaceId: PW_TEST_SPACE_ID,
      spaceCode: PW_TEST_SPACE_CODE,
      docs: [
        {
          token: tokenA,
          title: `PW Cloud A ${ts}`,
          content: `<p>${seed.cloudABase}</p>`,
          position: ts
        },
        {
          token: tokenB,
          title: `PW Cloud B ${ts}`,
          content: `<p>${seed.cloudBBase}</p>`,
          position: ts + 1
        }
      ]
    });
    logStep("seed-cloud-docs:done", seed);

    const expectExcludesOnly = (label: string, html: string, excludes: string[]) => {
      excludes.forEach(marker => {
        expect.soft(html, `${label}: mixed with ${marker}`).not.toContain(marker);
      });
    };

    logStep("edit-cloud-a:start");
    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.cloudAEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudAEdit);
    logStep("edit-cloud-a:done");

    logStep("edit-cloud-b:start");
    await clickMemoDoc(page, seed.cloudBId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.cloudBEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudBEdit);
    logStep("edit-cloud-b:done");

    const stateBLocal = await readCloudMemoLocalState(page, seed.cloudBId);
    expectExcludesOnly("cloudB editor before switch back", stateBLocal.editorHtml, [seed.cloudABase, seed.cloudAEdit]);
    expectExcludesOnly("cloudB history before switch back", stateBLocal.historyHtml, [seed.cloudABase, seed.cloudAEdit]);

    logStep("switch-back-to-a:start");
    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.cloudAEdit);
    logStep("switch-back-to-a:done");

    const stateALocal = await readCloudMemoLocalState(page, seed.cloudAId);
    expectExcludesOnly("cloudA editor after switch back", stateALocal.editorHtml, [seed.cloudBBase, seed.cloudBEdit]);
    expectExcludesOnly("cloudA history after switch back", stateALocal.historyHtml, [seed.cloudBBase, seed.cloudBEdit]);

    logStep("sync:start");
    await syncGolive(page, seed.spaceId, 60_000);
    logStep("sync:done");

    const stateARemoteAfterSync = await readCloudMemoRemoteState(page, { token: seed.tokenA, spaceId: seed.spaceId });
    const stateBRemoteAfterSync = await readCloudMemoRemoteState(page, { token: seed.tokenB, spaceId: seed.spaceId });
    expectExcludesOnly("cloudA remote after sync", stateARemoteAfterSync.contentHtml, [seed.cloudBBase, seed.cloudBEdit]);
    expectExcludesOnly("cloudB remote after sync", stateBRemoteAfterSync.contentHtml, [seed.cloudABase, seed.cloudAEdit]);

    logStep("reload:start");
    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);
    logStep("reload:done");

    await clickMemoDoc(page, seed.cloudAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.cloudAEdit);
    const stateAAfterReload = await readCloudMemoLocalState(page, seed.cloudAId);
    expectExcludesOnly("cloudA editor after reload", stateAAfterReload.editorHtml, [seed.cloudBBase, seed.cloudBEdit]);

    await clickMemoDoc(page, seed.cloudBId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.cloudBEdit);
    const stateBAfterReload = await readCloudMemoLocalState(page, seed.cloudBId);
    expectExcludesOnly("cloudB editor after reload", stateBAfterReload.editorHtml, [seed.cloudABase, seed.cloudAEdit]);
  });
});
