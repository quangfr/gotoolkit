import { expect, test } from "@playwright/test";

test.describe("Cloud/private transfer sync", () => {
  test("archives cloud doc to private and promotes private doc to cloud with sync persist", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const cloudToken = `pw-transfer-cloud-${ts}`;
    const cloudMarker = `PW_TRANSFER_CLOUD_${ts}`;
    const privateMarker = `PW_TRANSFER_PRIVATE_${ts}`;

    const syncGolive = async () => {
      const syncBtn = page.locator('.document-explorer__item-action--sync-refresh[data-space-id="golive"]').first();
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

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 45_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitCloudDrafts?.set), null, { timeout: 45_000 });

    const seeded = await page.evaluate(async ({ cloudToken, cloudMarker, privateMarker }) => {
      const worker = (window as any).goToolkitShareWorker;
      const history = (window as any).goToolkitShareHistory;
      const spaces = (window as any).GoToolkitSpaces;
      spaces?.upsertSpace?.({ id: "golive", name: "Go Live", icon: "cloud-upload", isDefault: true });

      const cloudPayload = {
        tabs: [{ id: `tab-${cloudToken}`, title: `Cloud ${cloudToken}`, description: "", superpowers: [], content: `<p>${cloudMarker}</p>` }],
        activeTabId: `tab-${cloudToken}`,
        parentId: "",
        spaceId: "golive",
        status: "active",
        position: Date.now()
      };

      await worker.saveSharePayload("pages-meta", cloudToken, {
        title: `Cloud ${cloudToken}`,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId: "golive",
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
        spaceId: "golive",
        position: Date.now(),
        updatedAt: new Date().toISOString()
      });

      const privateId = await (window as any).GoToolkitMemoCreateDocument({
        name: `Private ${Date.now()}`,
        initialContent: `<p>${privateMarker}</p>`
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return { privateId };
    }, { cloudToken, cloudMarker, privateMarker });

    const cloudRow = page.locator(`.document-explorer__item[data-document-id="share:${cloudToken}"]`).first();
    const privateSectionHeader = page.locator('.document-explorer__section-header[data-section="private"]').first();
    await expect(cloudRow).toBeVisible({ timeout: 30_000 });
    await expect(privateSectionHeader).toBeVisible({ timeout: 30_000 });
    await cloudRow.dragTo(privateSectionHeader);
    await expect(page.locator(`.document-explorer__item[data-document-id="share:${cloudToken}"]`)).toHaveCount(0, { timeout: 20_000 });

    const promotedToken = `pw-transfer-promote-${ts}`;
    await page.evaluate(async ({ privateId, promotedToken }) => {
      const docApi = (window as any).goToolkitDocumentApi;
      const history = (window as any).goToolkitShareHistory;
      const local = await docApi.getRecord(privateId);
      const payload = local?.payload && typeof local.payload === "object"
        ? { ...local.payload, spaceId: "golive", parentId: "", status: "active", position: Date.now() }
        : { tabs: [{ id: "tab-1", title: "Page 1", description: "", superpowers: [], content: "<p></p>" }], activeTabId: "tab-1", spaceId: "golive", parentId: "", status: "active", position: Date.now() };
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
        spaceId: "golive",
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
        spaceId: "golive",
        position: Date.now(),
        updatedAt: new Date().toISOString()
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    }, { privateId: seeded.privateId, promotedToken });

    await syncGolive();

    const promoteState = await page.evaluate(async ({ promotedToken, privateMarker }) => {
      const history = (window as any).goToolkitShareHistory;
      const rows = await history.getRecordsByApp("memo");
      const promoted = (rows || []).find((row: any) => String(row?.token || "") === String(promotedToken || ""));
      const content = String(promoted?.payload?.tabs?.[0]?.content || "");
      return {
        exists: Boolean(promoted),
        hasMarker: content.includes(privateMarker)
      };
    }, { promotedToken, privateMarker });
    expect(promoteState.exists).toBe(true);
    expect(promoteState.hasMarker).toBe(true);

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 45_000 });
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });

    await expect(page.locator(`.document-explorer__item[data-document-id="share:${cloudToken}"]`)).toHaveCount(0, { timeout: 20_000 });

    await clickDoc(`share:${promotedToken}`);
    await expect
      .poll(async () => page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || "")), { timeout: 20_000 })
      .toContain(privateMarker);
  });
});
