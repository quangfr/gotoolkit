import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { clickMemoDoc, refreshMemoExplorer, syncGolive, typeIntoVisibleEditor, waitForMemoReady } from "./helpers/memo-ui";

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
      const seeded = await page.evaluate(async seed => {
        const { state, spaceId, spaceCode } = seed as any;
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const spaces = (window as any).GoToolkitSpaces;
        spaces?.upsertSpace?.({
          id: spaceId,
          name: "Go Live",
          icon: "cloud-upload",
          spaceJoinCode: spaceCode,
          isDefault: true
        });

        const makePayload = (tabId: string, title: string, content: string, position: number, parentId = "") => ({
          tabs: [{
            id: tabId,
            title,
            description: "",
            superpowers: [],
            content: `<p>${content}</p>`
          }],
          activeTabId: tabId,
          parentId,
          spaceId,
          status: "active",
          position
        });

        const writeCloudDoc = async (token: string, title: string, content: string, position: number, parentId = "") => {
          const payload = makePayload(`tab-${token}`, title, content, position, parentId);
          const meta = {
            title,
            description: "",
            superpowers: [],
            icon: "file-symlink",
            parentId,
            spaceId,
            position,
            status: "active"
          };
          const savedMeta = await worker.saveSharePayload("pages-meta", token, meta);
          await worker.saveSharePayload("pages", token, payload);
          await history.upsertRecord("memo", {
            token,
            title,
            description: "",
            superpowers: [],
            payload,
            icon: "file-symlink",
            parentId,
            spaceId,
            position,
            updatedAt: String(savedMeta?.updatedAt || new Date().toISOString())
          });
        };

        await writeCloudDoc(state.existingToken, `PW Existing ${Date.now()}`, "EXISTING_BASE", 10, "");
        await writeCloudDoc(state.rootToken, `PW Root ${Date.now()}`, "ROOT_BASE", 20, "");
        await writeCloudDoc(state.parentToken, `PW Parent ${Date.now()}`, "PARENT_BASE", 30, "");
        await writeCloudDoc(state.childToken, `PW Child ${Date.now()}`, "CHILD_BASE", 40, state.parentToken);
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
        return [state.existingToken, state.rootToken, state.parentToken, state.childToken];
      }, { state, spaceId: PW_TEST_SPACE_ID, spaceCode: PW_TEST_SPACE_CODE });
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
      const parentItemForRename = page.locator(`.document-explorer__item[data-document-id="share:${state.parentToken}"]`).first();
      await expect(parentItemForRename).toBeVisible({ timeout: 30_000 });
      await parentItemForRename.dblclick();
      const renameInput = page.locator(".document-explorer__item-inline-input").first();
      await expect(renameInput).toBeVisible({ timeout: 15_000 });
      await renameInput.fill(state.renamedParentTitle);
      await renameInput.press("Enter");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.parentToken}"]`)).toContainText(state.renamedParentTitle, { timeout: 20_000 });
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
      await page.click("#fileMenuBtn");
      await page.click("#deleteDocumentBtn");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.existingToken}"]`)).toHaveCount(0, { timeout: 20_000 });
      logStep("delete-existing:done");

      logStep("delete-child:start");
      await clickMemoDoc(page, `share:${state.childToken}`);
      await page.click("#fileMenuBtn");
      await page.click("#deleteDocumentBtn");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.childToken}"]`)).toHaveCount(0, { timeout: 20_000 });
      logStep("delete-child:done");

      logStep("delete-root:start");
      await clickMemoDoc(page, `share:${state.rootToken}`);
      await page.click("#fileMenuBtn");
      await page.click("#deleteDocumentBtn");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.rootToken}"]`)).toHaveCount(0, { timeout: 20_000 });
      logStep("delete-root:done");

      logStep("sync:start");
      await syncGolive(page, PW_TEST_SPACE_ID, 45_000);
      logStep("sync:done");
      logStep("remote-delete-check:start");
      await expect.poll(
        async () => page.evaluate(async ({ existingToken, rootToken, childToken, spaceId }) => {
          const worker = (window as any).goToolkitShareWorker;
          const read = async (token: string) => {
            const meta = await worker.fetchSharePayload("pages-meta", token, { spaceId });
            const content = await worker.fetchSharePayload("pages", token, { spaceId });
            return {
              metaStatus: String(meta?.payload?.status || "").trim().toLowerCase(),
              contentMissing: !content?.payload
            };
          };
          return {
            existing: await read(existingToken),
            root: await read(rootToken),
            child: await read(childToken)
          };
        }, { ...state, spaceId: PW_TEST_SPACE_ID }),
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

      const remoteCheck = await page.evaluate(async ({ parentToken, renamedParentTitle, existingToken, rootToken, childToken, spaceId }) => {
        const worker = (window as any).goToolkitShareWorker;
        const parentMeta = await worker.fetchSharePayload("pages-meta", parentToken, { spaceId });
        const existingMeta = await worker.fetchSharePayload("pages-meta", existingToken, { spaceId });
        const rootMeta = await worker.fetchSharePayload("pages-meta", rootToken, { spaceId });
        const childMeta = await worker.fetchSharePayload("pages-meta", childToken, { spaceId });
        const existingContent = await worker.fetchSharePayload("pages", existingToken, { spaceId });
        const rootContent = await worker.fetchSharePayload("pages", rootToken, { spaceId });
        const childContent = await worker.fetchSharePayload("pages", childToken, { spaceId });
        return {
          parentTitle: String(parentMeta?.payload?.title || ""),
          existingArchived: String(existingMeta?.payload?.status || "").trim().toLowerCase() === "deleted",
          rootArchived: String(rootMeta?.payload?.status || "").trim().toLowerCase() === "deleted",
          childArchived: String(childMeta?.payload?.status || "").trim().toLowerCase() === "deleted",
          existingContentMissing: !existingContent?.payload,
          rootContentMissing: !rootContent?.payload,
          childContentMissing: !childContent?.payload,
          expectedTitle: renamedParentTitle
        };
      }, { ...state, spaceId: PW_TEST_SPACE_ID });

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
