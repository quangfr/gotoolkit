import { expect, test } from "@playwright/test";

test.describe("Space code rotation", () => {
  test("updates KV hash and invalidates old code for protected writes", async ({ page }) => {
    test.setTimeout(180_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const spaceId = `pw-rotate-${ts}`.toLowerCase();
    const token = `pw-rotate-doc-${ts}`.toLowerCase();
    const oldCode = "atelier projet donnees partage securise";
    const newCode = "nuage equipe memo export confiance durable";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.rotateSpaceJoinCode), null, { timeout: 60_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitSpaces?.upsertSpace), null, { timeout: 60_000 });

    const initialMarker = `PRE_ROTATE_READ_OK_${ts}`;
    const initial = await page.evaluate(async ({ spaceId, token, oldCode, newCode, initialMarker }) => {
      const spaces = (window as any).GoToolkitSpaces;
      const worker = (window as any).goToolkitShareWorker;
      if (!spaces || !worker) throw new Error("spaces/worker indisponibles");

      const upsertWithCode = (spaceCode: string) => {
        spaces.upsertSpace({
          id: spaceId,
          name: spaceId.toUpperCase(),
          icon: "cloud-upload",
          spaceJoinCode: spaceCode,
          isDefault: false
        });
      };

      const writeMeta = async (label: string) => worker.saveSharePayload("pages-meta", token, {
        title: label,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: Date.now(),
        status: "active"
      });

      const writePage = async (label: string) => worker.saveSharePayload("pages", token, {
        tabs: [{
          id: `tab-${token}`,
          title: label,
          description: "",
          superpowers: [],
          content: `<p>${label}</p>`
        }],
        activeTabId: `tab-${token}`,
        parentId: "",
        spaceId,
        status: "active",
        position: Date.now()
      });

      const readMeta = async () => worker.fetchSharePayload("pages-meta", token);
      const readPage = async () => worker.fetchSharePayload("pages", token);

      upsertWithCode(oldCode);
      await writeMeta("before-rotate-meta");
      await writePage(initialMarker);
      const preRotatePage = await readPage();
      const preRotateContent = String(preRotatePage?.payload?.tabs?.[0]?.content || "");
      const preRotateReadable = preRotateContent.includes(initialMarker);

      const rotate = await worker.rotateSpaceJoinCode(spaceId, oldCode, newCode);

      upsertWithCode(newCode);
      await writeMeta("new-code-meta-ok");
      await writePage("new-code-page-ok");
      const meta = await readMeta();

      return {
        rotateOk: Boolean(rotate?.ok),
        rotated: Boolean(rotate?.rotated),
        preRotateReadable,
        finalMetaTitle: String(meta?.payload?.title || "")
      };
    }, { spaceId, token, oldCode, newCode, initialMarker });

    expect(initial.preRotateReadable).toBeTruthy();
    expect(initial.rotateOk).toBeTruthy();
    expect(initial.rotated).toBeTruthy();
    expect(initial.finalMetaTitle).toBe("new-code-meta-ok");

    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 60_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitSpaces?.upsertSpace), null, { timeout: 60_000 });

    const afterReload = await page.evaluate(async ({ spaceId, token, oldCode, newCode }) => {
      const spaces = (window as any).GoToolkitSpaces;
      const worker = (window as any).goToolkitShareWorker;
      if (!spaces || !worker) throw new Error("spaces/worker indisponibles");

      const upsertWithCode = (spaceCode: string) => {
        spaces.upsertSpace({
          id: spaceId,
          name: spaceId.toUpperCase(),
          icon: "cloud-upload",
          spaceJoinCode: spaceCode,
          isDefault: false
        });
      };

      const writeMeta = async (label: string) => worker.saveSharePayload("pages-meta", token, {
        title: label,
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: Date.now(),
        status: "active"
      });

      let oldCodeWriteError = "";
      upsertWithCode(oldCode);
      try {
        await writeMeta("old-code-should-fail");
      } catch (err: any) {
        oldCodeWriteError = String(err?.message || err || "");
      }

      upsertWithCode(newCode);
      await writeMeta("new-code-after-reload-ok");
      const meta = await worker.fetchSharePayload("pages-meta", token);
      const pagePayload = await worker.fetchSharePayload("pages", token);
      const decryptedContent = String(pagePayload?.payload?.tabs?.[0]?.content || "");
      await worker.deleteSharePayload("pages", token).catch(() => null);
      await worker.deleteSharePayload("pages-meta", token).catch(() => null);
      spaces.deleteSpace?.(spaceId);

      return {
        oldCodeWriteError,
        finalMetaTitle: String(meta?.payload?.title || ""),
        decryptedContent
      };
    }, { spaceId, token, oldCode, newCode });

    expect(afterReload.oldCodeWriteError).toBeTruthy();
    expect(afterReload.oldCodeWriteError).toMatch(/Code espace invalide|Auth espace impossible|403/i);
    expect(afterReload.finalMetaTitle).toBe("new-code-after-reload-ok");
    expect(afterReload.decryptedContent).toContain("new-code-page-ok");

    const syncToken = `${token}-sync`;
    const syncMarker = `SYNC_ROTATE_OK_${ts}`;
    await page.evaluate(async ({ spaceId, syncToken, newCode, syncMarker }) => {
      const spaces = (window as any).GoToolkitSpaces;
      const worker = (window as any).goToolkitShareWorker;
      const history = (window as any).goToolkitShareHistory;
      if (!spaces || !worker || !history) throw new Error("deps sync indisponibles");

      spaces.upsertSpace({
        id: spaceId,
        name: spaceId.toUpperCase(),
        icon: "cloud-upload",
        spaceJoinCode: newCode,
        isDefault: false
      });

      await worker.saveSharePayload("pages-meta", syncToken, {
        title: "sync-rotate-meta",
        description: "",
        superpowers: [],
        icon: "file-symlink",
        parentId: "",
        spaceId,
        position: Date.now(),
        status: "active"
      });

      await worker.saveSharePayload("pages", syncToken, {
        tabs: [{
          id: `tab-${syncToken}`,
          title: "sync-rotate-page",
          description: "",
          superpowers: [],
          content: `<p>${syncMarker}</p>`
        }],
        activeTabId: `tab-${syncToken}`,
        parentId: "",
        spaceId,
        status: "active",
        position: Date.now()
      });

      await history.removeRecord("memo", syncToken).catch(() => null);
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    }, { spaceId, syncToken, newCode, syncMarker });

    const syncBtn = page.locator(`.document-explorer__item-action--sync-refresh[data-space-id="${spaceId}"]`).first();
    await expect(syncBtn).toBeVisible({ timeout: 45_000 });
    const prevSyncStartedAt = await page.evaluate(() => String((window as any).__goToolkitLastCloudSyncTiming?.startedAt || ""));
    await syncBtn.click();
    await page.waitForFunction(
      ({ sid, prev }) => {
        const timing = (window as any).__goToolkitLastCloudSyncTiming;
        return Boolean(
          timing
          && String(timing.spaceId || "") === String(sid || "")
          && typeof timing.totalMs === "number"
          && String(timing.startedAt || "") !== String(prev || "")
        );
      },
      { sid: spaceId, prev: prevSyncStartedAt },
      { timeout: 60_000 }
    );

    const syncCheck = await page.evaluate(async ({ syncToken, syncMarker }) => {
      const worker = (window as any).goToolkitShareWorker;
      const history = (window as any).goToolkitShareHistory;
      const rows = await history?.getRecordsByApp?.("memo");
      const hasLocal = Boolean((rows || []).find((item: any) => String(item?.token || "") === String(syncToken || "")));
      const remote = await worker.fetchSharePayload("pages", syncToken).catch(() => null);
      const text = String(remote?.payload?.tabs?.[0]?.content || "");

      await worker.deleteSharePayload("pages", syncToken).catch(() => null);
      await worker.deleteSharePayload("pages-meta", syncToken).catch(() => null);
      await history.removeRecord("memo", syncToken).catch(() => null);

      return {
        hasLocal,
        decryptedContainsMarker: text.includes(syncMarker)
      };
    }, { syncToken, syncMarker });

    expect(syncCheck.hasLocal).toBeTruthy();
    expect(syncCheck.decryptedContainsMarker).toBeTruthy();
  });
});
