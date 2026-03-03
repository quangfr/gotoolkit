import { expect, test } from "@playwright/test";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";

test.describe("Cloud archive retry", () => {
  test("keeps pending archive after transient failure and retries on next sync", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const token = `pw-archive-retry-${ts}`.toLowerCase();
    const docId = `share:${token}`;

    const syncSpace = async () => {
      const syncBtn = page.locator(`.document-explorer__item-action--sync-refresh[data-space-id="${PW_TEST_SPACE_ID}"]`).first();
      await expect(syncBtn).toBeVisible({ timeout: 30_000 });
      const prev = await page.evaluate(() => String((window as any).__goToolkitLastCloudSyncTiming?.startedAt || ""));
      await syncBtn.click();
      await page.waitForFunction(
        previous => {
          const timing = (window as any).__goToolkitLastCloudSyncTiming;
          return Boolean(timing && typeof timing.totalMs === "number" && String(timing.startedAt || "") !== String(previous || ""));
        },
        prev,
        { timeout: 60_000 }
      );
    };

    await ensureCloudConnectedWithSpaceCode(page, baseUrl, {
      spaceId: PW_TEST_SPACE_ID,
      spaceCode: PW_TEST_SPACE_CODE
    });

    try {
      await page.evaluate(async ({ token: seededToken, docId: seededDocId, spaceId }) => {
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const drafts = (window as any).goToolkitCloudDrafts;
        const explorer = (window as any).GoToolkitMemoDocumentExplorer;
        if (!worker || !history || !drafts || !explorer) {
          throw new Error("deps indisponibles");
        }

        const payload = {
          tabs: [{
            id: `tab-${seededToken}`,
            title: `Archive Retry ${seededToken}`,
            description: "",
            superpowers: [],
            content: `<p>ARCHIVE_RETRY_${seededToken}</p>`
          }],
          activeTabId: `tab-${seededToken}`,
          parentId: "",
          spaceId,
          status: "active",
          position: Date.now()
        };

        await worker.saveSharePayload("pages-meta", seededToken, {
          title: `Archive Retry ${seededToken}`,
          description: "",
          superpowers: [],
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: payload.position,
          status: "active"
        });
        await worker.saveSharePayload("pages", seededToken, payload);
        await history.upsertRecord("memo", {
          token: seededToken,
          title: `Archive Retry ${seededToken}`,
          description: "",
          superpowers: [],
          payload,
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: payload.position,
          updatedAt: new Date().toISOString()
        });
        drafts.set(seededDocId, {
          id: seededDocId,
          token: seededToken,
          opType: "archive",
          reason: "moved-to-local",
          title: `Archive Retry ${seededToken}`,
          description: "",
          superpowers: [],
          spaceId,
          parentId: "",
          updatedAt: new Date().toISOString()
        });
        await explorer.refresh?.({ forceReload: true });
      }, { token, docId, spaceId: PW_TEST_SPACE_ID });

      await page.evaluate(targetToken => {
        const worker = (window as any).goToolkitShareWorker;
        if (!worker) throw new Error("worker indisponible");
        if (!(window as any).__pwOriginalSaveSharePayload) {
          (window as any).__pwOriginalSaveSharePayload = worker.saveSharePayload.bind(worker);
        }
        (window as any).__pwArchiveFailureTriggered = false;
        worker.saveSharePayload = async function (collection: string, currentToken: string, payload: any, options: any) {
          const original = (window as any).__pwOriginalSaveSharePayload;
          if (
            collection === "pages-meta"
            && String(currentToken || "") === String(targetToken || "")
            && payload
            && String(payload.status || "").trim().toLowerCase() === "archived"
            && !(window as any).__pwArchiveFailureTriggered
          ) {
            (window as any).__pwArchiveFailureTriggered = true;
            throw new Error("Simulated transient archive failure");
          }
          return original(collection, currentToken, payload, options);
        };
      }, token);

      await syncSpace();

      const afterFirstSync = await page.evaluate(async ({ seededToken, seededDocId }) => {
        const drafts = (window as any).goToolkitCloudDrafts;
        const worker = (window as any).goToolkitShareWorker;
        const allDrafts = await drafts.readAll();
        const meta = await worker.fetchSharePayload("pages-meta", seededToken).catch(() => null);
        return {
          draftStillPresent: Boolean(allDrafts?.[seededDocId]),
          draftOpType: String(allDrafts?.[seededDocId]?.opType || ""),
          remoteStatus: String(meta?.payload?.status || "").trim().toLowerCase(),
          failureTriggered: Boolean((window as any).__pwArchiveFailureTriggered)
        };
      }, { seededToken: token, seededDocId: docId });

      expect(afterFirstSync.failureTriggered).toBeTruthy();
      expect(afterFirstSync.draftStillPresent).toBeTruthy();
      expect(afterFirstSync.draftOpType).toBe("archive");
      expect(afterFirstSync.remoteStatus).not.toBe("archived");

      await page.evaluate(() => {
        const worker = (window as any).goToolkitShareWorker;
        const original = (window as any).__pwOriginalSaveSharePayload;
        if (worker && original) {
          worker.saveSharePayload = original;
        }
      });

      await syncSpace();

      const afterSecondSync = await page.evaluate(async ({ seededToken, seededDocId }) => {
        const drafts = (window as any).goToolkitCloudDrafts;
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const allDrafts = await drafts.readAll();
        const meta = await worker.fetchSharePayload("pages-meta", seededToken).catch(() => null);
        const rows = await history.getRecordsByApp("memo");
        const local = (rows || []).find((item: any) => String(item?.token || "") === String(seededToken || ""));
        return {
          draftCleared: !allDrafts?.[seededDocId],
          remoteStatus: String(meta?.payload?.status || "").trim().toLowerCase(),
          localRemoved: !local
        };
      }, { seededToken: token, seededDocId: docId });

      expect(afterSecondSync.draftCleared).toBeTruthy();
      expect(afterSecondSync.remoteStatus).toBe("archived");
      expect(afterSecondSync.localRemoved).toBeTruthy();
    } finally {
      await page.evaluate(({ seededDocId }) => {
        const worker = (window as any).goToolkitShareWorker;
        const drafts = (window as any).goToolkitCloudDrafts;
        const original = (window as any).__pwOriginalSaveSharePayload;
        if (worker && original) {
          worker.saveSharePayload = original;
        }
        delete (window as any).__pwOriginalSaveSharePayload;
        delete (window as any).__pwArchiveFailureTriggered;
        try { drafts?.remove?.(seededDocId); } catch (err) { /* noop */ }
      }, { seededDocId: docId });
    }
  });
});
