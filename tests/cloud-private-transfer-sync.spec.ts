import { expect, test } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";

test.describe("Cloud/private transfer sync", () => {
  test("copies cloud doc to private and promotes private doc to cloud with sync persist", async ({ page }) => {
    test.setTimeout(240_000);
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
    const cleanupTokens = [cloudToken, promotedToken];
    const cloudMarker = `PW_TRANSFER_CLOUD_${ts}`;
    const privateMarker = `PW_TRANSFER_PRIVATE_${ts}`;

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
          { timeout: 60_000 }
        );
      } catch {
        await page.waitForTimeout(1500);
      }
    };

    const clickDoc = async (docId: string) => {
      const item = page.locator(`.document-explorer__item[data-document-id="${docId}"]`).first();
      const visible = await item.isVisible().catch(() => false);
      if (visible) {
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

    const dismissUiBlockers = async () => {
      await page.evaluate(() => {
        try {
          localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
        } catch {
          // ignore
        }
        try {
          const cleanup = (window as any).__goToolkitDocsTourCleanup;
          if (typeof cleanup === "function") cleanup();
        } catch {
          // ignore
        }
        document.querySelectorAll(".docs-tour-overlay, .docs-tour-highlight, .docs-tour-card").forEach(el => {
          try { (el as HTMLElement).remove(); } catch { /* ignore */ }
        });
        document.querySelectorAll("[data-tour-forced-visible='1']").forEach(el => {
          const node = el as HTMLElement;
          node.style.pointerEvents = "none";
        });
      });
    };

    try {
      await ensureCloudConnectedWithSpaceCode(page, baseUrl);
      await dismissUiBlockers();
      await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitCloudDrafts?.set), null, { timeout: 45_000 });

    const seeded = await page.evaluate(async ({ cloudToken, cloudMarker, privateMarker, spaceId, spaceCode }) => {
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

      const privateId = await (window as any).GoToolkitMemoCreateDocument({
        name: `Private ${Date.now()}`,
        initialContent: `<p>${privateMarker}</p>`
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return { privateId };
    }, { cloudToken, cloudMarker, privateMarker, spaceId: PW_TEST_SPACE_ID, spaceCode: PW_TEST_SPACE_CODE });

    const cloudRow = page.locator(`.document-explorer__item[data-document-id="share:${cloudToken}"]`).first();
    const privateSectionHeader = page.locator('.document-explorer__section-header[data-section="private"]').first();
    await expect(cloudRow).toBeVisible({ timeout: 30_000 });
    await expect(privateSectionHeader).toBeVisible({ timeout: 30_000 });
    await dismissUiBlockers();
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
      const tabContent = String(copied?.payload?.tabs?.[0]?.content || "");
      const hasContentToken = (() => {
        const walk = (node: any): boolean => {
          if (!node || typeof node !== "object") return false;
          if (Array.isArray(node)) return node.some(walk);
          if (Object.prototype.hasOwnProperty.call(node, "contentToken")) return true;
          return Object.values(node).some(walk);
        };
        return walk(copied?.payload);
      })();
      return {
        found: Boolean(copied),
        hasCloudMarker: tabContent.includes(String(cloudMarker || "")),
        hasCloudOriginToken: Boolean(String(copied?.cloudOriginToken || "").trim()),
        hasContentToken,
      };
    }, { cloudMarker });
    expect(privateCopyState.found).toBe(true);
    expect(privateCopyState.hasCloudMarker).toBe(true);
    expect(privateCopyState.hasCloudOriginToken).toBe(false);
    expect(privateCopyState.hasContentToken).toBe(false);

      await page.evaluate(async ({ privateId, promotedToken, spaceId }) => {
      const docApi = (window as any).goToolkitDocumentApi;
      const history = (window as any).goToolkitShareHistory;
      const local = await docApi.getRecord(privateId);
      const payload = local?.payload && typeof local.payload === "object"
        ? { ...local.payload, spaceId, parentId: "", status: "active", position: Date.now() }
        : { tabs: [{ id: "tab-1", title: "Page 1", description: "", superpowers: [], content: "<p></p>" }], activeTabId: "tab-1", spaceId, parentId: "", status: "active", position: Date.now() };
      const title = String(local?.name || local?.title || "Promoted private").trim() || "Promoted private";
      const docId = `share:${promotedToken}`;
      (window as any).goToolkitCloudDrafts.set(docId, {
        id: docId,
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
      await history.upsertRecord("memo", {
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
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      }, { privateId: seeded.privateId, promotedToken, spaceId: PW_TEST_SPACE_ID });

      await syncGolive();

      const promoteState = await page.evaluate(async ({ promotedToken, privateMarker, privateId }) => {
      const history = (window as any).goToolkitShareHistory;
      const docApi = (window as any).goToolkitDocumentApi;
      const worker = (window as any).goToolkitShareWorker;
      const rows = await history.getRecordsByApp("memo");
      const promoted = (rows || []).find((row: any) => String(row?.token || "") === String(promotedToken || ""));
      const content = String(promoted?.payload?.tabs?.[0]?.content || "");
      const privateDoc = await docApi?.getRecord?.(privateId);
      const privateContent = String(privateDoc?.payload?.tabs?.[0]?.content || "");
      const remote = await worker?.fetchSharePayload?.("pages", promotedToken);
      const remoteContent = String(remote?.payload?.tabs?.[0]?.content || "");
      return {
        exists: Boolean(promoted),
        hasMarker: content.includes(privateMarker),
        privateStillExists: Boolean(privateDoc),
        privateHasMarker: privateContent.includes(privateMarker),
        remoteHasMarker: remoteContent.includes(privateMarker)
      };
      }, { promotedToken, privateMarker, privateId: seeded.privateId });
      expect(promoteState.exists).toBe(true);
      expect(promoteState.hasMarker).toBe(true);
      expect(promoteState.privateStillExists).toBe(true);
      expect(promoteState.privateHasMarker).toBe(true);
      expect(promoteState.remoteHasMarker).toBe(true);

      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await dismissUiBlockers();
      await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 45_000 });
      await page.evaluate(async () => {
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      });

      await expect(page.locator(`.document-explorer__item[data-document-id="share:${cloudToken}"]`)).toHaveCount(1, { timeout: 20_000 });

      await clickDoc(`share:${promotedToken}`);
      await expect
        .poll(async () => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || "")), { timeout: 20_000 })
        .toContain(privateMarker);
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
        }, { tokens: cleanupTokens });
      } catch (err) {
        // Ignore teardown failures to avoid masking assertion outcomes.
      }
    }
  });
});
