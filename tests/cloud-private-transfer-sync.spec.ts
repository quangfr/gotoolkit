import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { clickMemoDoc, dismissDocsTour, refreshMemoExplorer, syncGolive } from "./helpers/memo-ui";

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

      const cloudRow = page.locator(`.document-explorer__item[data-document-id="share:${cloudToken}"]`).first();
      const privateSectionHeader = page.locator('.document-explorer__section-header[data-section="private"]').first();
      await expect(cloudRow).toBeVisible({ timeout: 30_000 });
      await expect(privateSectionHeader).toBeVisible({ timeout: 30_000 });
      await dismissDocsTour(page);
      await cloudRow.dragTo(privateSectionHeader);
      await expect(page.locator(`.document-explorer__item[data-document-id="share:${cloudToken}"]`)).toHaveCount(1, { timeout: 20_000 });

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
});
