import { expect, test } from "@playwright/test";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";

test.describe("Cloud spaceCode bootstrap", () => {
  test("bootstraps protected cloud access with spaceCode without OAuth UI", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const token = `pw-spacecode-${ts}`.toLowerCase();
    const marker = `PW_SPACECODE_OK_${ts}`;

    const bootstrap = await ensureCloudConnectedWithSpaceCode(page, baseUrl, {
      spaceId: PW_TEST_SPACE_ID,
      spaceCode: PW_TEST_SPACE_CODE
    });

    expect(bootstrap.verifiedOk).toBeTruthy();
    expect(bootstrap.verifiedSpaceId).toBe(PW_TEST_SPACE_ID);
    expect(bootstrap.microsoftConnected).toBeFalsy();

    const result = await page.evaluate(async ({ token: docToken, markerText, spaceId }) => {
      const worker = (window as any).goToolkitShareWorker;
      const history = (window as any).goToolkitShareHistory;
      if (!worker || !history) {
        throw new Error("worker/history indisponibles");
      }

      const metaSaved = await worker.saveSharePayload("pages-meta", docToken, {
        title: "spacecode-bootstrap-meta",
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: Date.now(),
        status: "active"
      });

      await worker.saveSharePayload("pages", docToken, {
        tabs: [{
          id: `tab-${docToken}`,
          title: "spacecode-bootstrap-page",
          description: "",
          superpowers: [],
          content: `<p>${markerText}</p>`
        }],
        activeTabId: `tab-${docToken}`,
        parentId: "",
        spaceId,
        status: "active",
        position: Date.now()
      });

      const meta = await worker.fetchSharePayload("pages-meta", docToken);
      const pagePayload = await worker.fetchSharePayload("pages", docToken);
      const tree = await worker.listShareTree("pages-meta", { spaceId, includeArchived: true });

      await history.removeRecord("memo", docToken).catch(() => null);
      await worker.deleteSharePayload("pages", docToken).catch(() => null);
      await worker.deleteSharePayload("pages-meta", docToken).catch(() => null);

      return {
        savedUpdatedAt: String(metaSaved?.updatedAt || ""),
        metaTitle: String(meta?.payload?.title || ""),
        content: String(pagePayload?.payload?.tabs?.[0]?.content || ""),
        appearsInTree: Boolean((tree?.documents || []).find((item: any) => String(item?.id || "") === String(docToken || "")))
      };
    }, { token, markerText: marker, spaceId: PW_TEST_SPACE_ID });

    expect(result.savedUpdatedAt).toBeTruthy();
    expect(result.metaTitle).toBe("spacecode-bootstrap-meta");
    expect(result.content).toContain(marker);
    expect(result.appearsInTree).toBeTruthy();
  });

  test("persists cloud drafts across reload and flushes them with sync", async ({ page }) => {
    test.setTimeout(180_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const token = `pw-spacecode-draft-${ts}`.toLowerCase();
    const docId = `share:${token}`;
    const marker = `PW_SPACECODE_DRAFT_${ts}`;

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

    const seeded = await page.evaluate(async ({ token: draftToken, docId: draftDocId, markerText, spaceId }) => {
      const drafts = (window as any).goToolkitCloudDrafts;
      const history = (window as any).goToolkitShareHistory;
      const explorer = (window as any).GoToolkitMemoDocumentExplorer;
      if (!drafts || !history || !explorer) {
        throw new Error("drafts/history/explorer indisponibles");
      }

      const payload = {
        tabs: [{
          id: `tab-${draftToken}`,
          title: `Draft ${draftToken}`,
          description: "",
          superpowers: [],
          content: `<p>${markerText}</p>`
        }],
        activeTabId: `tab-${draftToken}`,
        parentId: "",
        spaceId,
        status: "active",
        position: Date.now()
      };

      drafts.set(draftDocId, {
        id: draftDocId,
        token: draftToken,
        opType: "create",
        reason: "create",
        title: `Draft ${draftToken}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: payload.position,
        payload,
        updatedAt: new Date().toISOString()
      });

      await history.upsertRecord("memo", {
        token: draftToken,
        title: `Draft ${draftToken}`,
        description: "",
        superpowers: [],
        payload,
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: payload.position,
        updatedAt: new Date().toISOString()
      });

      await explorer.refresh?.({ forceReload: true });
      const before = await drafts.readAll();
      return {
        existsBeforeReload: Boolean(before?.[draftDocId]),
        hasCreateOp: String(before?.[draftDocId]?.opType || "") === "create"
      };
    }, { token, docId, markerText: marker, spaceId: PW_TEST_SPACE_ID });

    expect(seeded.existsBeforeReload).toBeTruthy();
    expect(seeded.hasCreateOp).toBeTruthy();

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitCloudDrafts?.readAll), null, { timeout: 45_000 });

    const reloaded = await page.evaluate(async draftDocId => {
      const drafts = (window as any).goToolkitCloudDrafts;
      const all = await drafts.readAll();
      return {
        existsAfterReload: Boolean(all?.[draftDocId]),
        opType: String(all?.[draftDocId]?.opType || "")
      };
    }, docId);

    expect(reloaded.existsAfterReload).toBeTruthy();
    expect(reloaded.opType).toBe("create");

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });
    await syncSpace();

    const flushed = await page.evaluate(async ({ token: draftToken, docId: draftDocId, markerText }) => {
      const drafts = (window as any).goToolkitCloudDrafts;
      const worker = (window as any).goToolkitShareWorker;
      const history = (window as any).goToolkitShareHistory;
      const all = await drafts.readAll();
      const remoteMeta = await worker.fetchSharePayload("pages-meta", draftToken).catch(() => null);
      const remotePage = await worker.fetchSharePayload("pages", draftToken).catch(() => null);
      const localRows = await history.getRecordsByApp("memo");
      const local = (localRows || []).find((item: any) => String(item?.token || "") === String(draftToken || ""));

      await worker.deleteSharePayload("pages", draftToken).catch(() => null);
      await worker.deleteSharePayload("pages-meta", draftToken).catch(() => null);
      await history.removeRecord("memo", draftToken).catch(() => null);
      drafts.remove(draftDocId);

      return {
        draftCleared: !all?.[draftDocId],
        remoteCreated: Boolean(remoteMeta?.payload && remotePage?.payload),
        remoteContent: String(remotePage?.payload?.tabs?.[0]?.content || ""),
        localPersisted: Boolean(local)
      };
    }, { token, docId, markerText: marker });

    expect(flushed.draftCleared).toBeTruthy();
    expect(flushed.remoteCreated).toBeTruthy();
    expect(flushed.remoteContent).toContain(marker);
    expect(flushed.localPersisted).toBeTruthy();
  });
});
