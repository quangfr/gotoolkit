import { expect, test } from "@playwright/test";
import { refreshMemoExplorer, syncGolive, waitForMemoReady } from "./helpers/memo-ui";

const SHARE_WORKER_BASE = "https://share.gotoolkit.workers.dev";

function logStep(label: string, details?: unknown) {
  if (typeof details === "undefined") {
    console.log(`[space-code-rotate] ${label}`);
    return;
  }
  console.log(`[space-code-rotate] ${label}`, details);
}

test.describe("Protected space create/rotate/delete", () => {
  test("space-create-code-rotate-delete keeps cloud content readable", async ({ page }) => {
    test.setTimeout(240_000);
    const createSecret = String(process.env.SHARE_SPACE_CREATE_SECRET || "").trim();
    test.skip(!createSecret, "SHARE_SPACE_CREATE_SECRET is required");

    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const spaceId = `pw-rotate-${ts}`.toLowerCase();
    const token = `pw-rotate-doc-${ts}`.toLowerCase();
    const oldCode = `atelier projet ${ts} securise cloud donnees`;
    const newCode = `nuage equipe ${ts} rotation lecture memo`;
    const initialMarker = `PRE_ROTATE_READ_OK_${ts}`;
    const afterRotateMarker = `POST_ROTATE_READ_OK_${ts}`;

    try {
      logStep("space-create:start", { spaceId });
      const createResponse = await fetch(`${SHARE_WORKER_BASE}/v1/spaces/auth/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Space-Create-Secret": createSecret
        },
        body: JSON.stringify({
          spaceId,
          spaceCode: oldCode
        })
      });
      const createText = await createResponse.text();
      let created: any = null;
      try {
        created = JSON.parse(createText);
      } catch {
        created = null;
      }
      expect(createResponse.ok, createText).toBe(true);
      expect(Boolean(created?.created), JSON.stringify(created)).toBe(true);
      logStep("space-create:done", { created: Boolean(created?.created), hasToken: Boolean(created?.token) });

      await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.rotateSpaceJoinCode), null, { timeout: 60_000 });
      await page.waitForFunction(() => Boolean((window as any).GoToolkitSpaces?.upsertSpace), null, { timeout: 60_000 });
      await waitForMemoReady(page, 60_000);

      logStep("space-bootstrap:start");
      const initial = await page.evaluate(async ({ spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker }) => {
        const spaces = (window as any).GoToolkitSpaces;
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        if (!spaces || !worker || !history) throw new Error("spaces/worker/history indisponibles");

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

        const writePage = async (label: string, marker: string) => worker.saveSharePayload("pages", token, {
          tabs: [{
            id: `tab-${token}`,
            title: label,
            description: "",
            superpowers: [],
            content: `<p>${marker}</p>`
          }],
          activeTabId: `tab-${token}`,
          parentId: "",
          spaceId,
          status: "active",
          position: Date.now()
        });

        upsertWithCode(oldCode);
        await writeMeta("before-rotate-meta");
        await writePage("before-rotate-page", initialMarker);
        await history.upsertRecord("memo", {
          token,
          title: "before-rotate-meta",
          description: "",
          superpowers: [],
          payload: {
            tabs: [{
              id: `tab-${token}`,
              title: "before-rotate-page",
              description: "",
              superpowers: [],
              content: `<p>${initialMarker}</p>`
            }],
            activeTabId: `tab-${token}`,
            parentId: "",
            spaceId,
            status: "active",
            position: Date.now()
          },
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          updatedAt: new Date().toISOString()
        });

        const preRotatePage = await worker.fetchSharePayload("pages", token);
        const preRotateContent = String(preRotatePage?.payload?.tabs?.[0]?.content || "");
        const rotate = await worker.rotateSpaceJoinCode(spaceId, oldCode, newCode);

        upsertWithCode(newCode);
        await writeMeta("after-rotate-meta");
        await writePage("after-rotate-page", afterRotateMarker);

        const meta = await worker.fetchSharePayload("pages-meta", token);
        const pagePayload = await worker.fetchSharePayload("pages", token);
        const decryptedContent = String(pagePayload?.payload?.tabs?.[0]?.content || "");

        return {
          rotateOk: Boolean(rotate?.ok),
          rotated: Boolean(rotate?.rotated),
          preRotateReadable: preRotateContent.includes(initialMarker),
          finalMetaTitle: String(meta?.payload?.title || ""),
          finalContent: decryptedContent
        };
      }, { spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker });
      logStep("space-bootstrap:done", initial);

      expect(initial.preRotateReadable).toBeTruthy();
      expect(initial.rotateOk).toBeTruthy();
      expect(initial.rotated).toBeTruthy();
      expect(initial.finalMetaTitle).toBe("after-rotate-meta");
      expect(initial.finalContent).toContain(afterRotateMarker);

      logStep("reload-check:start");
      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await refreshMemoExplorer(page, 60_000);

      const afterReload = await page.evaluate(async ({ spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker }) => {
        const spaces = (window as any).GoToolkitSpaces;
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        if (!spaces || !worker || !history) throw new Error("spaces/worker/history indisponibles");

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
        const meta = await worker.fetchSharePayload("pages-meta", token);
        const pagePayload = await worker.fetchSharePayload("pages", token);
        const decryptedContent = String(pagePayload?.payload?.tabs?.[0]?.content || "");

        const syncToken = `${token}-sync`;
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
            content: `<p>${initialMarker}:${afterRotateMarker}</p>`
          }],
          activeTabId: `tab-${syncToken}`,
          parentId: "",
          spaceId,
          status: "active",
          position: Date.now()
        });
        await history.removeRecord("memo", syncToken).catch(() => null);
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });

        return {
          oldCodeWriteError,
          finalMetaTitle: String(meta?.payload?.title || ""),
          decryptedContent,
          syncToken
        };
      }, { spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker });
      logStep("reload-check:state", afterReload);

      expect(afterReload.oldCodeWriteError).toBeTruthy();
      expect(afterReload.oldCodeWriteError).toMatch(/Code d['’]accès d['’]espace invalide|Code espace invalide|Auth espace impossible|403/i);
      expect(afterReload.finalMetaTitle).toBe("after-rotate-meta");
      expect(afterReload.decryptedContent).toContain(afterRotateMarker);

      logStep("sync-check:start");
      await syncGolive(page, spaceId, 60_000);
      const syncCheck = await page.evaluate(async ({ syncToken, initialMarker, afterRotateMarker, token }) => {
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const rows = await history?.getRecordsByApp?.("memo");
        const hasLocal = Boolean((rows || []).find((item: any) => String(item?.token || "") === String(syncToken || "")));
        const syncPayload = await worker.fetchSharePayload("pages", syncToken).catch(() => null);
        const syncText = String(syncPayload?.payload?.tabs?.[0]?.content || "");
        const originalPayload = await worker.fetchSharePayload("pages", token).catch(() => null);
        const originalText = String(originalPayload?.payload?.tabs?.[0]?.content || "");

        await worker.deleteSharePayload("pages", syncToken).catch(() => null);
        await worker.deleteSharePayload("pages-meta", syncToken).catch(() => null);
        await history.removeRecord("memo", syncToken).catch(() => null);
        await history.removeRecord("memo", token).catch(() => null);
        await worker.deleteSharePayload("pages", token).catch(() => null);
        await worker.deleteSharePayload("pages-meta", token).catch(() => null);

        return {
          hasLocal,
          syncReadable: syncText.includes(`${initialMarker}:${afterRotateMarker}`),
          originalReadable: originalText.includes(afterRotateMarker)
        };
      }, { syncToken: afterReload.syncToken, initialMarker, afterRotateMarker, token });
      logStep("sync-check:done", syncCheck);

      expect(syncCheck.hasLocal).toBeFalsy();
      expect(syncCheck.syncReadable).toBeTruthy();
    } finally {
      logStep("space-delete:start", { spaceId });
      const deleteResponse = await fetch(`${SHARE_WORKER_BASE}/v1/spaces/auth/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Space-Create-Secret": createSecret
        },
        body: JSON.stringify({ spaceId })
      });
      const deleteText = await deleteResponse.text();
      let deleted: any = null;
      try {
        deleted = JSON.parse(deleteText);
      } catch {
        deleted = null;
      }
      logStep("space-delete:done", {
        status: deleteResponse.status,
        ok: deleteResponse.ok,
        deleted: Boolean(deleted?.deleted),
        body: deleted || deleteText
      });
      expect(deleteResponse.ok, deleteText).toBe(true);
      expect(Boolean(deleted?.deleted), JSON.stringify(deleted)).toBe(true);
    }
  });
});
