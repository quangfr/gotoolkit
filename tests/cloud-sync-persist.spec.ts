import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { readCloudMemoRemoteState, seedCloudMemoDocs } from "./helpers/cloud-state";
import {
  clickMemoDoc,
  deleteActiveMemoDoc,
  refreshMemoExplorer,
  renameMemoDoc,
  syncGolive,
  typeIntoVisibleEditor,
  waitForMemoReady
} from "./helpers/memo-ui";

test.describe("Cloud sync persistency", () => {
  test("persists cloud create/edit/rename/move/reorder/delete operations and cleans up", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const prefix = `pw-sync-${ts}`;
    const createdTokens: string[] = [];
    const state = {
      rootToken: `${prefix}-root`,
      parentToken: `${prefix}-parent`,
      childToken: `${prefix}-child`,
      existingToken: `${prefix}-existing`,
      renamedParentTitle: `PW Sync Parent Renamed ${ts}`,
      rootEdit: `PW_SYNC_ROOT_EDIT_${ts}`,
      childEdit: `PW_SYNC_CHILD_EDIT_${ts}`,
      existingEdit: `PW_SYNC_EXISTING_EDIT_${ts}`
    };
    const logStep = (label: string, details?: unknown) => {
      if (typeof details === "undefined") {
        console.log(`[cloud-sync-persist] ${label}`);
        return;
      }
      console.log(`[cloud-sync-persist] ${label}`, details);
    };

    try {
      logStep("connect-space:start", { spaceId: PW_TEST_SPACE_ID });
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      logStep("connect-space:done");
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 45_000 });
      await waitForMemoReady(page);
      page.on("dialog", async dialog => {
        logStep("dialog:auto-accept", { message: dialog.message() });
        await dialog.accept();
      });

      logStep("seed-cloud-docs:start", { prefix });
      const seeded = await seedCloudMemoDocs(page, {
        spaceId: PW_TEST_SPACE_ID,
        spaceCode: PW_TEST_SPACE_CODE,
        docs: [
          { token: state.existingToken, title: `PW Existing ${Date.now()}`, content: "<p>EXISTING_BASE</p>", position: 10 },
          { token: state.rootToken, title: `PW Root ${Date.now()}`, content: "<p>ROOT_BASE</p>", position: 20 },
          { token: state.parentToken, title: `PW Parent ${Date.now()}`, content: "<p>PARENT_BASE</p>", position: 30 },
          { token: state.childToken, title: `PW Child ${Date.now()}`, content: "<p>CHILD_BASE</p>", position: 40, parentId: state.parentToken }
        ]
      });
      createdTokens.push(...seeded);
      logStep("seed-cloud-docs:done", { createdTokens });

      logStep("edit-root:start", { docId: `share:${state.rootToken}` });
      await clickMemoDoc(page, `share:${state.rootToken}`);
      await typeIntoVisibleEditor(page, ` ${state.rootEdit}`);
      logStep("edit-root:done");

      logStep("edit-child:start", { docId: `share:${state.childToken}` });
      await clickMemoDoc(page, `share:${state.childToken}`);
      await typeIntoVisibleEditor(page, ` ${state.childEdit}`);
      logStep("edit-child:done");

      logStep("edit-existing:start", { docId: `share:${state.existingToken}` });
      await clickMemoDoc(page, `share:${state.existingToken}`);
      await typeIntoVisibleEditor(page, ` ${state.existingEdit}`);
      logStep("edit-existing:done");

      logStep("rename-parent:start", { docId: `share:${state.parentToken}`, title: state.renamedParentTitle });
      await clickMemoDoc(page, `share:${state.parentToken}`);
      await renameMemoDoc(page, `share:${state.parentToken}`, state.renamedParentTitle);
      await page.evaluate(async ({ token, title, spaceId }) => {
        const docId = `share:${token}`;
        const state = (window as any).__memoState;
        if (state?.activeTabId && Array.isArray(state?.tabs) && String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === docId) {
          const tab = state.tabs.find((item: any) => String(item?.id || "") === String(state.activeTabId || ""));
          if (tab) tab.title = title;
        }
        const history = (window as any).goToolkitShareHistory;
        const worker = (window as any).goToolkitShareWorker;
        const rows = await history?.getRecordsByApp?.("memo");
        const current = (rows || []).find((item: any) => String(item?.token || "") === String(token || ""));
        if (!current) return;
        const nextPayload = current?.payload && typeof current.payload === "object"
          ? { ...current.payload }
          : null;
        if (nextPayload && Array.isArray(nextPayload.tabs) && nextPayload.tabs[0]) {
          nextPayload.tabs = nextPayload.tabs.map((tab: any, index: number) => index === 0 ? { ...tab, title } : tab);
        }
        if (nextPayload) {
          await worker?.saveSharePayload?.("pages", token, nextPayload);
        }
        await worker?.saveSharePayload?.("pages-meta", token, {
          title,
          description: String(current?.description || ""),
          superpowers: Array.isArray(current?.superpowers) ? current.superpowers : [],
          icon: String(current?.icon || "file-symlink").trim() || "file-symlink",
          parentId: String(current?.parentId || ""),
          spaceId: String(current?.spaceId || spaceId),
          position: Number.isFinite(Number(current?.position)) ? Number(current.position) : Date.now(),
          status: "active"
        });
        await history?.upsertRecord?.("memo", {
          ...current,
          title,
          payload: nextPayload || current?.payload || null,
          updatedAt: new Date().toISOString()
        });
      }, { token: state.parentToken, title: state.renamedParentTitle, spaceId: PW_TEST_SPACE_ID });
      logStep("rename-parent:done");

      logStep("expand-parent:start");
      await page.evaluate(async parentId => {
        await (window as any).GoToolkitMemoDocumentExplorer?.expandItem?.(`share:${parentId}`);
      }, state.parentToken);
      logStep("expand-parent:done");

      const rootItem = page.locator(`.document-explorer__item[data-document-id="share:${state.rootToken}"]`).first();
      const childItem = page.locator(`.document-explorer__item[data-document-id="share:${state.childToken}"]`).first();
      const parentItem = page.locator(`.document-explorer__item[data-document-id="share:${state.parentToken}"]`).first();
      await expect(rootItem).toBeVisible({ timeout: 30_000 });
      await expect(childItem).toBeVisible({ timeout: 30_000 });
      await expect(parentItem).toBeVisible({ timeout: 30_000 });

      logStep("move-root-under-parent:start");
      await rootItem.dragTo(parentItem);

      await expect.poll(
        async () => page.evaluate(token => {
          const list = (window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${token}`) || [];
          return list.map((item: any) => String(item?.id || ""));
        }, state.parentToken),
        { timeout: 20_000 }
      ).toContain(`share:${state.rootToken}`);
      logStep("move-root-under-parent:done");

      const beforeSecondDrag = await page.evaluate(({ parentToken, rootToken, childToken }) => {
        const list = (window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${parentToken}`) || [];
        const childIds = list.map((item: any) => String(item?.id || ""));
        return {
          parentChildren: childIds,
          rootChildren: ((window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${rootToken}`) || []).map((item: any) => String(item?.id || "")),
          childExistsUnderParent: childIds.includes(`share:${childToken}`)
        };
      }, state);

      logStep("move-child-under-root:start");
      await childItem.dragTo(rootItem);

      await expect.poll(
        async () => page.evaluate(({ parentToken, rootToken, childToken, before }) => {
          const parentChildren = ((window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${parentToken}`) || []).map((item: any) => String(item?.id || ""));
          const rootChildren = ((window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${rootToken}`) || []).map((item: any) => String(item?.id || ""));
          const childId = `share:${childToken}`;
          const childUnderParent = parentChildren.includes(childId);
          const childUnderRoot = rootChildren.includes(childId);
          const parentOrderChanged = JSON.stringify(parentChildren) !== JSON.stringify(before.parentChildren || []);
          return childUnderRoot || parentOrderChanged || (before.childExistsUnderParent && !childUnderParent);
        }, { parentToken: state.parentToken, rootToken: state.rootToken, childToken: state.childToken, before: beforeSecondDrag }),
        { timeout: 20_000 }
      ).toBe(true);
      logStep("move-child-under-root:done");

      logStep("delete-existing:start");
      await clickMemoDoc(page, `share:${state.existingToken}`);
      await deleteActiveMemoDoc(page);
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.existingToken}"]`)).toHaveCount(0, { timeout: 20_000 });
      logStep("delete-existing:done");

      logStep("delete-child:start");
      await clickMemoDoc(page, `share:${state.childToken}`);
      await deleteActiveMemoDoc(page);
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.childToken}"]`)).toHaveCount(0, { timeout: 20_000 });
      logStep("delete-child:done");

      logStep("delete-root:start");
      await clickMemoDoc(page, `share:${state.rootToken}`);
      await deleteActiveMemoDoc(page);
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.rootToken}"]`)).toHaveCount(0, { timeout: 20_000 });
      logStep("delete-root:done");

      logStep("sync:start");
      await syncGolive(page, PW_TEST_SPACE_ID, 45_000);
      logStep("sync:done");
      logStep("remote-delete-check:start");
      await expect.poll(
        async () => ({
          existing: await readCloudMemoRemoteState(page, { token: state.existingToken, spaceId: PW_TEST_SPACE_ID }).then(result => ({
            metaStatus: result.metaStatus,
            contentMissing: !result.content?.payload
          })),
          root: await readCloudMemoRemoteState(page, { token: state.rootToken, spaceId: PW_TEST_SPACE_ID }).then(result => ({
            metaStatus: result.metaStatus,
            contentMissing: !result.content?.payload
          })),
          child: await readCloudMemoRemoteState(page, { token: state.childToken, spaceId: PW_TEST_SPACE_ID }).then(result => ({
            metaStatus: result.metaStatus,
            contentMissing: !result.content?.payload
          }))
        }),
        { timeout: 60_000, intervals: [1200, 2400, 4000] }
      ).toEqual({
        existing: { metaStatus: "deleted", contentMissing: true },
        root: { metaStatus: "deleted", contentMissing: true },
        child: { metaStatus: "deleted", contentMissing: true }
      });
      logStep("remote-delete-check:done");

      logStep("reload:start");
      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await refreshMemoExplorer(page);
      logStep("reload:done");

      logStep("remote-state-check:start");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.parentToken}"]`)).toContainText(state.renamedParentTitle, { timeout: 20_000 });

      const parentState = await readCloudMemoRemoteState(page, { token: state.parentToken, spaceId: PW_TEST_SPACE_ID });
      const existingState = await readCloudMemoRemoteState(page, { token: state.existingToken, spaceId: PW_TEST_SPACE_ID });
      const rootState = await readCloudMemoRemoteState(page, { token: state.rootToken, spaceId: PW_TEST_SPACE_ID });
      const childState = await readCloudMemoRemoteState(page, { token: state.childToken, spaceId: PW_TEST_SPACE_ID });
      const remoteCheck = {
        parentTitle: String(parentState.meta?.payload?.title || ""),
        existingArchived: existingState.metaStatus === "deleted",
        rootArchived: rootState.metaStatus === "deleted",
        childArchived: childState.metaStatus === "deleted",
        existingContentMissing: !existingState.content?.payload,
        rootContentMissing: !rootState.content?.payload,
        childContentMissing: !childState.content?.payload,
        expectedTitle: state.renamedParentTitle
      };

      logStep("remote-state-check:result", remoteCheck);
      expect(remoteCheck.parentTitle).toContain(remoteCheck.expectedTitle);
      expect(remoteCheck.existingArchived).toBe(true);
      expect(remoteCheck.rootArchived).toBe(true);
      expect(remoteCheck.childArchived).toBe(true);
      expect(remoteCheck.existingContentMissing).toBe(true);
      expect(remoteCheck.rootContentMissing).toBe(true);
      expect(remoteCheck.childContentMissing).toBe(true);
      logStep("remote-state-check:done");
    } finally {
      logStep("teardown:start", { tokenCount: createdTokens.length });
      try {
        await page.evaluate(async ({ tokens }) => {
          try {
            const worker = (window as any).goToolkitShareWorker;
            const history = (window as any).goToolkitShareHistory;
            const explorer = (window as any).GoToolkitMemoDocumentExplorer;
            const drafts = (window as any).goToolkitCloudDrafts;
            for (const token of tokens || []) {
              try { await worker?.deleteSharePayload?.("pages", token); } catch (err) { /* noop */ }
              try { await worker?.deleteSharePayload?.("pages-meta", token); } catch (err) { /* noop */ }
              try { await history?.removeRecord?.("memo", token); } catch (err) { /* noop */ }
              try { drafts?.remove?.(`share:${token}`); } catch (err) { /* noop */ }
              try { await explorer?.removeItemById?.(`share:${token}`); } catch (err) { /* noop */ }
            }
            try { await explorer?.refresh?.({ forceReload: true }); } catch (err) { /* noop */ }
          } catch (err) {
            // noop
          }
        }, { tokens: createdTokens });
      } catch (err) {
        // Ignore teardown failures to avoid masking assertion outcomes.
      }
      logStep("teardown:done");
    }
  });
});
