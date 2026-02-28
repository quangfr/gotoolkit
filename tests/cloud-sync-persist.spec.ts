import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnected } from "./helpers/cloud-auth";

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

    const clickDoc = async (docId: string) => {
      const item = page.locator(`.document-explorer__item[data-document-id="${docId}"]`).first();
      const hasVisibleRow = await item.isVisible().catch(() => false);
      if (hasVisibleRow) {
        await item.click();
      } else {
        await page.evaluate(async id => {
          await (window as any).GoToolkitMemoOpenDocumentByLink?.(id);
        }, docId);
      }
      await page.waitForFunction(
        expectedId => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
        docId,
        { timeout: 30_000 }
      );
    };

    const typeIntoEditor = async (text: string) => {
      const editor = page.locator(".ProseMirror:visible").first();
      await expect(editor).toBeVisible({ timeout: 30_000 });
      await editor.click();
      await page.keyboard.type(` ${text}`);
      await expect.poll(
        async () => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || "")),
        { timeout: 15_000 }
      ).toContain(text);
    };

    const syncGolive = async () => {
      const syncBtn = page.locator(`.document-explorer__item-action--sync-refresh[data-space-id="${PW_TEST_SPACE_ID}"]`).first();
      await expect(syncBtn).toBeVisible({ timeout: 30_000 });
      const prev = await page.evaluate(() => String((window as any).__goToolkitLastCloudSyncTiming?.startedAt || ""));
      await syncBtn.click();
      try {
        await page.waitForFunction(
          previous => {
            const timing = (window as any).__goToolkitLastCloudSyncTiming;
            return Boolean(timing && typeof timing.totalMs === "number" && String(timing.startedAt || "") !== String(previous || ""));
          },
          prev,
          { timeout: 45_000 }
        );
      } catch (err) {
        await page.waitForTimeout(1500);
      }
    };

    try {
      await ensureCloudConnected(page, baseUrl);
      await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 45_000 });
      await page.waitForSelector(".ProseMirror:visible", { timeout: 45_000 });
      page.on("dialog", async dialog => {
        await dialog.accept();
      });

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

      await clickDoc(`share:${state.rootToken}`);
      await typeIntoEditor(state.rootEdit);

      await clickDoc(`share:${state.childToken}`);
      await typeIntoEditor(state.childEdit);

      await clickDoc(`share:${state.existingToken}`);
      await typeIntoEditor(state.existingEdit);

      await clickDoc(`share:${state.parentToken}`);
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

      await page.evaluate(async parentId => {
        await (window as any).GoToolkitMemoDocumentExplorer?.expandItem?.(`share:${parentId}`);
      }, state.parentToken);

      const rootItem = page.locator(`.document-explorer__item[data-document-id="share:${state.rootToken}"]`).first();
      const childItem = page.locator(`.document-explorer__item[data-document-id="share:${state.childToken}"]`).first();
      const parentItem = page.locator(`.document-explorer__item[data-document-id="share:${state.parentToken}"]`).first();
      await expect(rootItem).toBeVisible({ timeout: 30_000 });
      await expect(childItem).toBeVisible({ timeout: 30_000 });
      await expect(parentItem).toBeVisible({ timeout: 30_000 });

      await rootItem.dragTo(parentItem);

      await expect.poll(
        async () => page.evaluate(token => {
          const list = (window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${token}`) || [];
          return list.map((item: any) => String(item?.id || ""));
        }, state.parentToken),
        { timeout: 20_000 }
      ).toContain(`share:${state.rootToken}`);

      const beforeSecondDrag = await page.evaluate(({ parentToken, rootToken, childToken }) => {
        const list = (window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${parentToken}`) || [];
        const childIds = list.map((item: any) => String(item?.id || ""));
        return {
          parentChildren: childIds,
          rootChildren: ((window as any).GoToolkitMemoDocumentExplorer?.getChildrenOf?.(`share:${rootToken}`) || []).map((item: any) => String(item?.id || "")),
          childExistsUnderParent: childIds.includes(`share:${childToken}`)
        };
      }, state);

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

      await clickDoc(`share:${state.existingToken}`);
      await page.click("#fileMenuBtn");
      await page.click("#deleteDocumentBtn");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.existingToken}"]`)).toHaveCount(0, { timeout: 20_000 });

      await clickDoc(`share:${state.childToken}`);
      await page.click("#fileMenuBtn");
      await page.click("#deleteDocumentBtn");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.childToken}"]`)).toHaveCount(0, { timeout: 20_000 });

      await clickDoc(`share:${state.rootToken}`);
      await page.click("#fileMenuBtn");
      await page.click("#deleteDocumentBtn");
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.rootToken}"]`)).toHaveCount(0, { timeout: 20_000 });

      await syncGolive();
      await expect.poll(
        async () => page.evaluate(async ({ existingToken, rootToken, childToken }) => {
          const worker = (window as any).goToolkitShareWorker;
          const read = async (token: string) => {
            const meta = await worker.fetchSharePayload("pages-meta", token);
            const content = await worker.fetchSharePayload("pages", token);
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
        }, state),
        { timeout: 60_000, intervals: [1200, 2400, 4000] }
      ).toEqual({
        existing: { metaStatus: "deleted", contentMissing: true },
        root: { metaStatus: "deleted", contentMissing: true },
        child: { metaStatus: "deleted", contentMissing: true }
      });

      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 45_000 });
      await page.evaluate(async () => {
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      });

      await expect(page.locator(`.document-explorer__item[data-document-id="share:${state.parentToken}"]`)).toContainText(state.renamedParentTitle, { timeout: 20_000 });

      const remoteCheck = await page.evaluate(async ({ parentToken, renamedParentTitle, existingToken, rootToken, childToken }) => {
        const worker = (window as any).goToolkitShareWorker;
        const parentMeta = await worker.fetchSharePayload("pages-meta", parentToken);
        const existingMeta = await worker.fetchSharePayload("pages-meta", existingToken);
        const rootMeta = await worker.fetchSharePayload("pages-meta", rootToken);
        const childMeta = await worker.fetchSharePayload("pages-meta", childToken);
        const existingContent = await worker.fetchSharePayload("pages", existingToken);
        const rootContent = await worker.fetchSharePayload("pages", rootToken);
        const childContent = await worker.fetchSharePayload("pages", childToken);
        return {
          parentTitle: String(parentMeta?.payload?.title || ""),
          existingDeleted: String(existingMeta?.payload?.status || "").trim().toLowerCase() === "deleted",
          rootDeleted: String(rootMeta?.payload?.status || "").trim().toLowerCase() === "deleted",
          childDeleted: String(childMeta?.payload?.status || "").trim().toLowerCase() === "deleted",
          existingContentMissing: !existingContent?.payload,
          rootContentMissing: !rootContent?.payload,
          childContentMissing: !childContent?.payload,
          expectedTitle: renamedParentTitle
        };
      }, state);

      expect(remoteCheck.parentTitle).toContain(remoteCheck.expectedTitle);
      expect(remoteCheck.existingDeleted).toBe(true);
      expect(remoteCheck.rootDeleted).toBe(true);
      expect(remoteCheck.childDeleted).toBe(true);
      expect(remoteCheck.existingContentMissing).toBe(true);
      expect(remoteCheck.rootContentMissing).toBe(true);
      expect(remoteCheck.childContentMissing).toBe(true);
    } finally {
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
    }
  });
});
