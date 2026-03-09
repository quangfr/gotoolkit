import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import {
  clickMemoDoc,
  dismissDocsTour,
  dragMemoDocToSection,
  getMemoDocItem,
  refreshMemoExplorer,
  syncGolive
} from "./helpers/memo-ui";

test.describe("Cloud/private transfer sync", () => {
  test("copies a cloud doc to private storage while keeping the cloud source", async ({ page }) => {
    test.setTimeout(180_000);
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
    const cleanupTokens = [cloudToken];
    const cloudMarker = `PW_TRANSFER_CLOUD_${ts}`;

    try {
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      await dismissDocsTour(page);
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi?.getRecord), null, { timeout: 45_000 });

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

      await dismissDocsTour(page);
      await dragMemoDocToSection(page, `share:${cloudToken}`, "private");
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
          found: Boolean(copied),
          hasCloudMarker: String(copied?.payload?.tabs?.[0]?.content || "").includes(String(cloudMarker || "")),
          hasCloudOriginToken: Boolean(String(copied?.cloudOriginToken || "").trim())
        };
      }, { cloudMarker });

      expect(privateCopyState.found).toBe(true);
      expect(privateCopyState.hasCloudMarker).toBe(true);
      expect(privateCopyState.hasCloudOriginToken).toBe(false);
    } finally {
      try {
        await page.evaluate(async ({ tokens }) => {
          const worker = (window as any).goToolkitShareWorker;
          const history = (window as any).goToolkitShareHistory;
          const explorer = (window as any).GoToolkitMemoDocumentExplorer;
          for (const token of tokens || []) {
            try { await worker?.deleteSharePayload?.("pages", token); } catch {}
            try { await worker?.deleteSharePayload?.("pages-meta", token); } catch {}
            try { await history?.removeRecord?.("memo", token); } catch {}
            try { await explorer?.removeItemById?.(`share:${token}`); } catch {}
          }
          try { await explorer?.refresh?.({ forceReload: true }); } catch {}
        }, { tokens: cleanupTokens });
      } catch {
        // ignore teardown failures
      }
    }
  });

  test("promotes a private doc to cloud and persists it across sync and reload", async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const promotedToken = `pw-transfer-promote-${ts}`;
    const privateMarker = `PW_TRANSFER_PRIVATE_${ts}`;

    try {
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      await dismissDocsTour(page);
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi?.getRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitCloudDrafts?.set), null, { timeout: 45_000 });

      const seeded = await page.evaluate(async ({ privateMarker, promotedToken, spaceId }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const history = (window as any).goToolkitShareHistory;
        const drafts = (window as any).goToolkitCloudDrafts;
        const privateId = docApi?.generateId?.() || `private-${Date.now()}`;
        await docApi?.upsertRecord?.({
          id: privateId,
          app: "memo",
          title: `Private ${Date.now()}`,
          payload: {
            tabs: [{ id: `tab-${privateId}`, title: `Private ${Date.now()}`, description: "", superpowers: [], content: `<p>${privateMarker}</p>` }],
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

      await syncGolive(page, PW_TEST_SPACE_ID, 60_000);

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
      }, { promotedToken, privateMarker, privateId: seeded.privateId, spaceId: PW_TEST_SPACE_ID });

      expect(promoteState.exists).toBe(true);
      expect(promoteState.hasMarker).toBe(true);
      expect(promoteState.privateStillExists).toBe(true);
      expect(promoteState.privateHasMarker).toBe(true);
      expect(promoteState.remoteHasMarker).toBe(true);

      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await dismissDocsTour(page);
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      await refreshMemoExplorer(page);

      await clickMemoDoc(page, `share:${promotedToken}`);
      await expect
        .poll(async () => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || "")), { timeout: 20_000 })
        .toContain(privateMarker);
    } finally {
      try {
        await page.evaluate(async ({ token }) => {
          const worker = (window as any).goToolkitShareWorker;
          const history = (window as any).goToolkitShareHistory;
          const drafts = (window as any).goToolkitCloudDrafts;
          const explorer = (window as any).GoToolkitMemoDocumentExplorer;
          try { await worker?.deleteSharePayload?.("pages", token); } catch {}
          try { await worker?.deleteSharePayload?.("pages-meta", token); } catch {}
          try { await history?.removeRecord?.("memo", token); } catch {}
          try { drafts?.remove?.(`share:${token}`); } catch {}
          try { await explorer?.removeItemById?.(`share:${token}`); } catch {}
          try { await explorer?.refresh?.({ forceReload: true }); } catch {}
        }, { token: promotedToken });
      } catch {
        // ignore teardown failures
      }
    }
  });

  test("promotes an archived local doc to cloud with a fresh token instead of reusing cloudOriginToken", async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const deletedCloudToken = `pw-archived-deleted-origin-${ts}`;
    const archivedMarker = `PW_ARCHIVED_FRESH_TOKEN_${ts}`;
    let promotedToken = "";

    try {
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      await dismissDocsTour(page);
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi?.getRecord), null, { timeout: 45_000 });

      const seeded = await page.evaluate(async ({ archivedMarker, deletedCloudToken, spaceId, spaceCode }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const worker = (window as any).goToolkitShareWorker;
        const spaces = (window as any).GoToolkitSpaces;
        const explorer = (window as any).GoToolkitMemoDocumentExplorer;
        const archivedId = docApi?.generateId?.() || `archived-${Date.now()}`;
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
          title: `Archived ${Date.now()}`,
          payload: {
            tabs: [{ id: `tab-${archivedId}`, title: `Archived ${Date.now()}`, description: "", superpowers: [], content: `<p>${archivedMarker}</p>` }],
            activeTabId: `tab-${archivedId}`
          },
          status: "archived",
          cloudOriginToken: deletedCloudToken,
          updatedAt: new Date().toISOString()
        });
        await explorer?.upsertItem?.({
          id: archivedId,
          app: "memo",
          title: `Archived ${Date.now()}`,
          payload: {
            tabs: [{ id: `tab-${archivedId}`, title: `Archived ${Date.now()}`, description: "", superpowers: [], content: `<p>${archivedMarker}</p>` }],
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

      await dragMemoDocToSection(page, seeded.archivedId, `shared:${PW_TEST_SPACE_ID}`);

      const localPromoteState = await page.evaluate(async ({ archivedMarker, deletedCloudToken }) => {
        const history = (window as any).goToolkitShareHistory;
        const drafts = (window as any).goToolkitCloudDrafts;
        const rows = await history?.getRecordsByApp?.("memo");
        const promoted = (Array.isArray(rows) ? rows : []).find((row: any) =>
          String(row?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || ""))
          && String(row?.token || "") !== String(deletedCloudToken || "")
        );
        const allDrafts = await drafts?.readAll?.().catch?.(() => ({})) || {};
        const matchingDraft = Object.values(allDrafts).find((draft: any) =>
          String(draft?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || ""))
        ) as any;
        return {
          promotedToken: String(promoted?.token || ""),
          deletedTokenReusedInHistory: Boolean((Array.isArray(rows) ? rows : []).find((row: any) =>
            String(row?.token || "") === String(deletedCloudToken || "")
            && String(row?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || ""))
          )),
          draftToken: String(matchingDraft?.token || ""),
          draftOpType: String(matchingDraft?.opType || "")
        };
      }, { archivedMarker, deletedCloudToken });

      promotedToken = localPromoteState.promotedToken || localPromoteState.draftToken;
      expect(localPromoteState.deletedTokenReusedInHistory).toBe(false);
      expect(promotedToken).toBeTruthy();
      expect(promotedToken).not.toBe(deletedCloudToken);
      expect(localPromoteState.draftOpType).toBe("create");

      await syncGolive(page, PW_TEST_SPACE_ID, 60_000);

      const remoteState = await page.evaluate(async ({ promotedToken, deletedCloudToken, archivedMarker, spaceId }) => {
        const worker = (window as any).goToolkitShareWorker;
        const newRemote = await worker?.fetchSharePayload?.("pages", promotedToken, { spaceId });
        const deletedRemote = await worker?.fetchSharePayload?.("pages", deletedCloudToken, { spaceId }).catch?.(() => null);
        const deletedMeta = await worker?.fetchSharePayload?.("pages-meta", deletedCloudToken, { spaceId }).catch?.(() => null);
        return {
          newRemoteHasMarker: String(newRemote?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || "")),
          deletedRemoteHasMarker: String(deletedRemote?.payload?.tabs?.[0]?.content || "").includes(String(archivedMarker || "")),
          deletedMetaStatus: String(deletedMeta?.payload?.status || "")
        };
      }, { promotedToken, deletedCloudToken, archivedMarker, spaceId: PW_TEST_SPACE_ID });

      expect(remoteState.newRemoteHasMarker).toBe(true);
      expect(remoteState.deletedRemoteHasMarker).toBe(false);
      expect(remoteState.deletedMetaStatus).toBe("deleted");
    } finally {
      try {
        await page.evaluate(async ({ promotedToken, deletedCloudToken }) => {
          const worker = (window as any).goToolkitShareWorker;
          const history = (window as any).goToolkitShareHistory;
          const drafts = (window as any).goToolkitCloudDrafts;
          const explorer = (window as any).GoToolkitMemoDocumentExplorer;
          if (promotedToken) {
            try { await worker?.deleteSharePayload?.("pages", promotedToken); } catch {}
            try { await worker?.deleteSharePayload?.("pages-meta", promotedToken); } catch {}
            try { await history?.removeRecord?.("memo", promotedToken); } catch {}
            try { drafts?.remove?.(`share:${promotedToken}`); } catch {}
            try { await explorer?.removeItemById?.(`share:${promotedToken}`); } catch {}
          }
          try { await worker?.deleteSharePayload?.("pages", deletedCloudToken); } catch {}
          try { await worker?.deleteSharePayload?.("pages-meta", deletedCloudToken); } catch {}
          try { await explorer?.refresh?.({ forceReload: true }); } catch {}
        }, { promotedToken, deletedCloudToken });
      } catch {
        // ignore teardown failures
      }
    }
  });
});
