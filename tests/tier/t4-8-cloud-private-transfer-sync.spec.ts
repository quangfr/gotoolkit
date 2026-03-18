import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "../helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "../helpers/cloud-auth";
import {
  clickMemoDoc,
  dismissDocsTour,
  dragMemoDocToSection,
  getMemoDocItem,
  refreshMemoExplorer,
  syncGolive
} from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test.describe("Cloud/private transfer sync", () => {
  test("covers cloud copy, private promote, and archived promote flows with shared setup", async ({ page, context }) => {
    test.setTimeout(240_000);
    const logStep = createStepLogger("cloud-private-transfer-sync:grouped");
    attachPageDebugLogging(page, "cloud-private-transfer-sync:grouped");
    await page.addInitScript(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });

    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const cloudToken = `pw-transfer-cloud-${ts}`;
    const promotedToken = `pw-transfer-promote-${ts}`;
    const deletedCloudToken = `pw-archived-deleted-origin-${ts}`;
    const cloudMarker = `PW_TRANSFER_CLOUD_${ts}`;
    const privateMarker = `PW_TRANSFER_PRIVATE_${ts}`;
    const archivedMarker = `PW_ARCHIVED_FRESH_TOKEN_${ts}`;
    const cleanupShareTokens = new Set<string>([cloudToken, promotedToken, deletedCloudToken]);
    const cleanupLocalDocIds = new Set<string>();
    let promotedPrivateId = "";
    let archivedId = "";
    let archivedPromotedToken = "";

    async function waitForCloudApis() {
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi?.getRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitCloudDrafts?.set), null, { timeout: 45_000 });
    }

    try {
      logStep("connect-space:start");
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      await dismissDocsTour(page);
      await waitForCloudApis();
      logStep("connect-space:done");

      logStep("seed-cloud-doc:start", { cloudToken });
      await page.evaluate(async ({ cloudToken, cloudMarker, spaceId, spaceCode }) => {
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const spaces = (window as any).GoToolkitSpaces;
        spaces?.upsertSpace?.({ id: spaceId, name: "Go Live", icon: "cloud-upload", spaceJoinCode: spaceCode, isDefault: true });

        const cloudPayload = {
          tabs: [{ id: `tab-${cloudToken}`, title: `Cloud ${cloudToken}`, description: "", superpowers: [], content: `<p>${cloudMarker}</p>` }],
          activeTabId: `tab-${cloudToken}`,
          parentId: "",
          spaceId,
          status: "active",
          position: Date.now()
        };

        await worker.saveSharePayload("pages-meta", cloudToken, {
          title: `Cloud ${cloudToken}`,
          description: "",
          superpowers: [],
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          status: "active"
        });
        await worker.saveSharePayload("pages", cloudToken, cloudPayload);
        await history.upsertRecord("memo", {
          token: cloudToken,
          title: `Cloud ${cloudToken}`,
          description: "",
          superpowers: [],
          payload: cloudPayload,
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          updatedAt: new Date().toISOString()
        });
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      }, { cloudToken, cloudMarker, spaceId: PW_TEST_SPACE_ID, spaceCode: PW_TEST_SPACE_CODE });
      logStep("seed-cloud-doc:done");

      logStep("drag-to-private:start");
      await dragMemoDocToSection(page, `share:${cloudToken}`, "private");
      logStep("drag-to-private:done");
      await expect(getMemoDocItem(page, `share:${cloudToken}`)).toHaveCount(1, { timeout: 20_000 });

      const privateCopyState = await page.evaluate(async ({ cloudMarker }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const all = await docApi?.getAllRecords?.();
        const rows = Array.isArray(all) ? all : [];
        const copied = rows.find((row: any) => {
          if (String(row?.app || "") !== "memo") return false;
          if (String(row?.id || "").startsWith("share:")) return false;
          const tabContent = String(row?.payload?.tabs?.[0]?.content || "");
          return tabContent.includes(String(cloudMarker || ""));
        });
        return {
          copiedId: String(copied?.id || ""),
          found: Boolean(copied),
          hasCloudMarker: String(copied?.payload?.tabs?.[0]?.content || "").includes(String(cloudMarker || "")),
          hasCloudOriginToken: Boolean(String(copied?.cloudOriginToken || "").trim())
        };
      }, { cloudMarker });
      logStep("private-copy:result", privateCopyState);

      expect(privateCopyState.found).toBe(true);
      expect(privateCopyState.hasCloudMarker).toBe(true);
      expect(privateCopyState.hasCloudOriginToken).toBe(false);
      if (privateCopyState.copiedId) cleanupLocalDocIds.add(privateCopyState.copiedId);

      logStep("seed-private-promote:start", { promotedToken });
      const seededPromote = await page.evaluate(async ({ privateMarker, promotedToken, spaceId }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const history = (window as any).goToolkitShareHistory;
        const drafts = (window as any).goToolkitCloudDrafts;
        const privateId = docApi?.generateId?.() || `private-${Date.now()}`;
        const title = `Private ${Date.now()}`;
        await docApi?.upsertRecord?.({
          id: privateId,
          app: "memo",
          title,
          payload: {
            tabs: [{ id: `tab-${privateId}`, title, description: "", superpowers: [], content: `<p>${privateMarker}</p>` }],
            activeTabId: `tab-${privateId}`
          },
          updatedAt: new Date().toISOString()
        });
        const local = await docApi?.getRecord?.(privateId);
        const payload = {
          ...(local?.payload && typeof local.payload === "object" ? local.payload : {}),
          parentId: "",
          spaceId,
          status: "active",
          position: Date.now()
        };
        await history?.upsertRecord?.("memo", {
          token: promotedToken,
          title: String(local?.title || local?.name || "Promoted private").trim() || "Promoted private",
          description: "",
          superpowers: [],
          payload,
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          updatedAt: new Date().toISOString()
        });
        drafts?.set?.(`share:${promotedToken}`, {
          id: `share:${promotedToken}`,
          token: promotedToken,
          opType: "create",
          reason: "create",
          title: String(local?.title || local?.name || "Promoted private").trim() || "Promoted private",
          description: "",
          superpowers: [],
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          payload,
          updatedAt: new Date().toISOString()
        });
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
        return { privateId };
      }, { privateMarker, promotedToken, spaceId: PW_TEST_SPACE_ID });
      promotedPrivateId = seededPromote.privateId;
      if (promotedPrivateId) cleanupLocalDocIds.add(promotedPrivateId);
      logStep("seed-private-promote:done", seededPromote);

      logStep("sync-promote:start");
      await syncGolive(page, PW_TEST_SPACE_ID, 60_000);
      logStep("sync-promote:done");

      const promoteState = await page.evaluate(async ({ promotedToken, privateMarker, privateId, spaceId }) => {
        const history = (window as any).goToolkitShareHistory;
        const docApi = (window as any).goToolkitDocumentApi;
        const worker = (window as any).goToolkitShareWorker;
        const rows = await history.getRecordsByApp("memo");
        const promoted = (rows || []).find((row: any) => String(row?.token || "") === String(promotedToken || ""));
        const privateDoc = await docApi?.getRecord?.(privateId);
        const remote = await worker?.fetchSharePayload?.("pages", promotedToken, { spaceId });
        return {
          exists: Boolean(promoted),
          hasMarker: String(promoted?.payload?.tabs?.[0]?.content || "").includes(privateMarker),
          privateStillExists: Boolean(privateDoc),
          privateHasMarker: String(privateDoc?.payload?.tabs?.[0]?.content || "").includes(privateMarker),
          remoteHasMarker: String(remote?.payload?.tabs?.[0]?.content || "").includes(privateMarker)
        };
      }, { promotedToken, privateMarker, privateId: promotedPrivateId, spaceId: PW_TEST_SPACE_ID });
      logStep("promote-state", promoteState);

      expect(promoteState.exists).toBe(true);
      expect(promoteState.hasMarker).toBe(true);
      expect(promoteState.privateStillExists).toBe(true);
      expect(promoteState.privateHasMarker).toBe(true);
      expect(promoteState.remoteHasMarker).toBe(true);

      logStep("reload:start");
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await dismissDocsTour(page);
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      await dismissDocsTour(page);
      await waitForCloudApis();
      await refreshMemoExplorer(page);
      logStep("reload:done");

      const archivedPage = await context.newPage();
      attachPageDebugLogging(archivedPage, "cloud-private-transfer-sync:grouped:archived");
      await archivedPage.addInitScript(() => {
        try {
          localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
        } catch {
          // ignore
        }
      });
      await archivedPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await dismissDocsTour(archivedPage);
      await ensureCloudConnectedWithSpaceCode(archivedPage, baseUrl);
      await dismissDocsTour(archivedPage);
      await archivedPage.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await archivedPage.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi?.getRecord), null, { timeout: 45_000 });
      await archivedPage.waitForFunction(() => Boolean((window as any).goToolkitCloudDrafts?.set), null, { timeout: 45_000 });
      await refreshMemoExplorer(archivedPage);

      logStep("seed-archived-doc:start", { deletedCloudToken });
      const seededArchived = await archivedPage.evaluate(async ({ archivedMarker, deletedCloudToken, spaceId, spaceCode }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const worker = (window as any).goToolkitShareWorker;
        const spaces = (window as any).GoToolkitSpaces;
        const explorer = (window as any).GoToolkitMemoDocumentExplorer;
        const archivedId = docApi?.generateId?.() || `archived-${Date.now()}`;
        const title = `Archived ${Date.now()}`;
        spaces?.upsertSpace?.({ id: spaceId, name: "Go Live", icon: "cloud-upload", spaceJoinCode: spaceCode, isDefault: true });
        await worker?.saveSharePayload?.("pages-meta", deletedCloudToken, {
          title: `Deleted ${deletedCloudToken}`,
          description: "",
          superpowers: [],
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          status: "deleted"
        });
        await docApi?.upsertRecord?.({
          id: archivedId,
          app: "memo",
          title,
          payload: {
            tabs: [{ id: `tab-${archivedId}`, title, description: "", superpowers: [], content: `<p>${archivedMarker}</p>` }],
            activeTabId: `tab-${archivedId}`
          },
          status: "archived",
          cloudOriginToken: deletedCloudToken,
          updatedAt: new Date().toISOString()
        });
        await explorer?.upsertItem?.({
          id: archivedId,
          app: "memo",
          title,
          payload: {
            tabs: [{ id: `tab-${archivedId}`, title, description: "", superpowers: [], content: `<p>${archivedMarker}</p>` }],
            activeTabId: `tab-${archivedId}`
          },
          status: "archived",
          section: "archives",
          updatedAt: new Date().toISOString()
        });
        await explorer?.refresh?.({ forceReload: true });
        return { archivedId };
      }, {
        archivedMarker,
        deletedCloudToken,
        spaceId: PW_TEST_SPACE_ID,
        spaceCode: PW_TEST_SPACE_CODE
      });
      archivedId = seededArchived.archivedId;
      if (archivedId) cleanupLocalDocIds.add(archivedId);
      logStep("seed-archived-doc:done", seededArchived);

      logStep("promote-archived-locally:start");
      const archivedLocalState = await archivedPage.evaluate(async ({ archivedId, archivedMarker, deletedCloudToken, spaceId }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const history = (window as any).goToolkitShareHistory;
        const drafts = (window as any).goToolkitCloudDrafts;
        const explorer = (window as any).GoToolkitMemoDocumentExplorer;
        const source = await docApi?.getRecord?.(archivedId);
        const promotedToken = `pw-archived-promoted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const payload = {
          ...((source?.payload && typeof source.payload === "object") ? source.payload : {}),
          parentId: "",
          spaceId,
          status: "active",
          position: Date.now()
        };
        const title = String(source?.title || "Archived promoted").trim() || "Archived promoted";
        await history?.upsertRecord?.("memo", {
          token: promotedToken,
          title,
          description: "",
          superpowers: [],
          payload,
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          updatedAt: new Date().toISOString()
        });
        drafts?.set?.(`share:${promotedToken}`, {
          id: `share:${promotedToken}`,
          token: promotedToken,
          opType: "create",
          reason: "create",
          title,
          description: "",
          superpowers: [],
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          payload,
          updatedAt: new Date().toISOString()
        });
        await explorer?.upsertItem?.({
          id: `share:${promotedToken}`,
          token: promotedToken,
          title,
          description: "",
          superpowers: [],
          payload,
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          isShared: true,
          section: `shared:${spaceId}`,
          updatedAt: new Date().toISOString()
        });
        const rows = await history?.getRecordsByApp?.("memo");
        return {
          promotedToken,
          deletedTokenReusedInHistory: Boolean((Array.isArray(rows) ? rows : []).find((row: any) =>
            String(row?.token || "") === String(deletedCloudToken || "")
            && String(row?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || ""))
          )),
          draftToken: promotedToken,
          draftOpType: "create"
        };
      }, { archivedId, archivedMarker, deletedCloudToken, spaceId: PW_TEST_SPACE_ID });
      logStep("promote-archived-locally:done");
      logStep("archived-local-state", archivedLocalState);

      archivedPromotedToken = archivedLocalState.promotedToken || archivedLocalState.draftToken;
      if (archivedPromotedToken) cleanupShareTokens.add(archivedPromotedToken);
      expect(archivedLocalState.deletedTokenReusedInHistory).toBe(false);
      expect(archivedPromotedToken).toBeTruthy();
      expect(archivedPromotedToken).not.toBe(deletedCloudToken);
      expect(archivedLocalState.draftOpType).toBe("create");

      logStep("sync-archived-promote:start");
      await syncGolive(archivedPage, PW_TEST_SPACE_ID, 60_000);
      logStep("sync-archived-promote:done");

      const remoteState = await archivedPage.evaluate(async ({ promotedToken, deletedCloudToken, archivedMarker, spaceId }) => {
        const worker = (window as any).goToolkitShareWorker;
        const newRemote = await worker?.fetchSharePayload?.("pages", promotedToken, { spaceId });
        const deletedRemote = await worker?.fetchSharePayload?.("pages", deletedCloudToken, { spaceId }).catch?.(() => null);
        const deletedMeta = await worker?.fetchSharePayload?.("pages-meta", deletedCloudToken, { spaceId }).catch?.(() => null);
        return {
          newRemoteHasMarker: String(newRemote?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || "")),
          deletedRemoteHasMarker: String(deletedRemote?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || "")),
          deletedMetaStatus: String(deletedMeta?.payload?.status || "")
        };
      }, { promotedToken: archivedPromotedToken, deletedCloudToken, archivedMarker, spaceId: PW_TEST_SPACE_ID });
      logStep("archived-remote-state", remoteState);

      expect(remoteState.newRemoteHasMarker).toBe(true);
      expect(remoteState.deletedRemoteHasMarker).toBe(false);
      expect(remoteState.deletedMetaStatus).toBe("deleted");

      await archivedPage.close();

      logStep("open-promoted-doc:start");
      await clickMemoDoc(page, `share:${promotedToken}`);
      await expect
        .poll(async () => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || "")), { timeout: 20_000 })
        .toContain(privateMarker);
      logStep("open-promoted-doc:done");
    } finally {
      try {
        await page.evaluate(async ({ shareTokens, localDocIds }) => {
          const worker = (window as any).goToolkitShareWorker;
          const history = (window as any).goToolkitShareHistory;
          const drafts = (window as any).goToolkitCloudDrafts;
          const explorer = (window as any).GoToolkitMemoDocumentExplorer;
          const docApi = (window as any).goToolkitDocumentApi;

          for (const token of shareTokens || []) {
            try { await worker?.deleteSharePayload?.("pages", token); } catch {}
            try { await worker?.deleteSharePayload?.("pages-meta", token); } catch {}
            try { await history?.removeRecord?.("memo", token); } catch {}
            try { drafts?.remove?.(`share:${token}`); } catch {}
            try { await explorer?.removeItemById?.(`share:${token}`); } catch {}
          }

          for (const id of localDocIds || []) {
            try { await docApi?.deleteRecord?.(id); } catch {}
            try { await explorer?.removeItemById?.(id); } catch {}
          }

          try { await explorer?.refresh?.({ forceReload: true }); } catch {}
        }, {
          shareTokens: Array.from(cleanupShareTokens),
          localDocIds: Array.from(cleanupLocalDocIds)
        });
      } catch {
        // ignore teardown failures
      }
    }
  });
});
