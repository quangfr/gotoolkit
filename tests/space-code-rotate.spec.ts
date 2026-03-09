import { expect, test } from "@playwright/test";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import { refreshMemoExplorer, syncGolive } from "./helpers/memo-ui";

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
    const historyMarker = `HISTORY_PRE_ROTATE_OK_${ts}`;
    const syncHistoryMarker = `HISTORY_POST_ROTATE_SYNC_OK_${ts}`;

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
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 60_000 });

      logStep("space-bootstrap:start");
      const initial = await page.evaluate(async ({ spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker, historyMarker }) => {
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
        }, { spaceId });

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
        }, { spaceId });

        upsertWithCode(oldCode);
        await writeMeta("before-rotate-meta");
        await writePage("before-rotate-page", initialMarker);
        await worker.saveSharePayload("pages-history", token, {
          versions: [{
            versionId: `history-pre-rotate-${Date.now()}`,
            createdAt: new Date().toISOString(),
            reason: "pre-rotate",
            scope: "remote",
            documentId: `share:${token}`,
            title: "before-rotate-page",
            description: "",
            payload: {
              tabs: [{
                id: `tab-${token}`,
                title: "before-rotate-page",
                description: "",
                superpowers: [],
                content: `<p>${historyMarker}</p>`
              }],
              activeTabId: `tab-${token}`,
              parentId: "",
              spaceId,
              status: "active",
              position: Date.now()
            }
          }]
        }, { spaceId });
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

        const preRotatePage = await worker.fetchSharePayload("pages", token, { spaceId });
        const preRotateContent = String(preRotatePage?.payload?.tabs?.[0]?.content || "");
        const preRotateHistory = await worker.fetchSharePayload("pages-history", token, { spaceId });
        const preRotateHistoryContent = String(preRotateHistory?.payload?.versions?.[0]?.payload?.tabs?.[0]?.content || "");
        const rotate = await worker.rotateSpaceJoinCode(spaceId, oldCode, newCode);

        upsertWithCode(newCode);
        await writeMeta("after-rotate-meta");
        await writePage("after-rotate-page", afterRotateMarker);

        const meta = await worker.fetchSharePayload("pages-meta", token, { spaceId });
        const pagePayload = await worker.fetchSharePayload("pages", token, { spaceId });
        const decryptedContent = String(pagePayload?.payload?.tabs?.[0]?.content || "");
        const historyPayload = await worker.fetchSharePayload("pages-history", token, { spaceId });
        const decryptedHistoryContent = String(historyPayload?.payload?.versions?.[0]?.payload?.tabs?.[0]?.content || "");

        return {
          rotateOk: Boolean(rotate?.ok),
          rotated: Boolean(rotate?.rotated),
          preRotateReadable: preRotateContent.includes(initialMarker),
          preRotateHistoryReadable: preRotateHistoryContent.includes(historyMarker),
          finalMetaTitle: String(meta?.payload?.title || ""),
          finalContent: decryptedContent,
          finalHistoryContent: decryptedHistoryContent
        };
      }, { spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker, historyMarker });
      logStep("space-bootstrap:done", initial);

      expect(initial.preRotateReadable).toBeTruthy();
      expect(initial.preRotateHistoryReadable).toBeTruthy();
      expect(initial.rotateOk).toBeTruthy();
      expect(initial.rotated).toBeTruthy();
      expect(initial.finalMetaTitle).toBe("after-rotate-meta");
      expect(initial.finalContent).toContain(afterRotateMarker);
      expect(initial.finalHistoryContent).toContain(historyMarker);

      logStep("reload-check:start");
      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await ensureCloudConnectedWithSpaceCode(page, baseUrl, { spaceId, spaceCode: newCode });
      await refreshMemoExplorer(page, 60_000);

      const afterReload = await page.evaluate(async ({ spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker, historyMarker, syncHistoryMarker }) => {
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
        }, { spaceId });

        let oldCodeWriteError = "";
        upsertWithCode(oldCode);
        try {
          await writeMeta("old-code-should-fail");
        } catch (err: any) {
          oldCodeWriteError = String(err?.message || err || "");
        }

        upsertWithCode(newCode);
        const verified = await worker.verifySpaceCredentials?.(spaceId, newCode).catch(() => null);
        const meta = await worker.fetchSharePayload("pages-meta", token, { spaceId });
        const pagePayload = await worker.fetchSharePayload("pages", token, { spaceId });
        const decryptedContent = String(pagePayload?.payload?.tabs?.[0]?.content || "");
        const historyPayload = await worker.fetchSharePayload("pages-history", token, { spaceId });
        const decryptedHistoryContent = String(historyPayload?.payload?.versions?.[0]?.payload?.tabs?.[0]?.content || "");

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
        }, { spaceId });
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
        }, { spaceId });
        await worker.saveSharePayload("pages-history", syncToken, {
          versions: [{
            versionId: `history-post-rotate-${Date.now()}`,
            createdAt: new Date().toISOString(),
            reason: "post-rotate",
            scope: "remote",
            documentId: `share:${syncToken}`,
            title: "sync-rotate-page",
            description: "",
            payload: {
              tabs: [{
                id: `tab-${syncToken}`,
                title: "sync-rotate-page",
                description: "",
                superpowers: [],
                content: `<p>${syncHistoryMarker}</p>`
              }],
              activeTabId: `tab-${syncToken}`,
              parentId: "",
              spaceId,
              status: "active",
              position: Date.now()
            }
          }]
        }, { spaceId });
        await history.removeRecord("memo", syncToken).catch(() => null);
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });

        return {
          oldCodeWriteError,
          verifiedOk: Boolean(verified?.ok),
          finalMetaTitle: String(meta?.payload?.title || ""),
          decryptedContent,
          decryptedHistoryContent,
          syncToken
        };
      }, { spaceId, token, oldCode, newCode, initialMarker, afterRotateMarker, historyMarker, syncHistoryMarker });
      logStep("reload-check:state", afterReload);

      expect(afterReload.oldCodeWriteError).toBeTruthy();
      expect(afterReload.oldCodeWriteError).toMatch(/Code d['’]accès d['’]espace invalide|Code espace invalide|Auth espace impossible|403/i);
      expect(afterReload.verifiedOk).toBeTruthy();
      expect(afterReload.finalMetaTitle).toBe("after-rotate-meta");
      expect(afterReload.decryptedContent).toContain(afterRotateMarker);
      expect(afterReload.decryptedHistoryContent).toContain(historyMarker);

      logStep("sync-check:start");
      await syncGolive(page, spaceId, 60_000);
      const syncCheck = await page.evaluate(async ({ syncToken, initialMarker, afterRotateMarker, historyMarker, syncHistoryMarker, token }) => {
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const rows = await history?.getRecordsByApp?.("memo");
        const hasLocal = Boolean((rows || []).find((item: any) => String(item?.token || "") === String(syncToken || "")));
        const syncPayload = await worker.fetchSharePayload("pages", syncToken).catch(() => null);
        const syncText = String(syncPayload?.payload?.tabs?.[0]?.content || "");
        const syncHistoryPayload = await worker.fetchSharePayload("pages-history", syncToken).catch(() => null);
        const syncHistoryText = String(syncHistoryPayload?.payload?.versions?.[0]?.payload?.tabs?.[0]?.content || "");
        const originalPayload = await worker.fetchSharePayload("pages", token).catch(() => null);
        const originalText = String(originalPayload?.payload?.tabs?.[0]?.content || "");
        const originalHistoryPayload = await worker.fetchSharePayload("pages-history", token).catch(() => null);
        const originalHistoryText = String(originalHistoryPayload?.payload?.versions?.[0]?.payload?.tabs?.[0]?.content || "");

        await worker.deleteSharePayload("pages", syncToken).catch(() => null);
        await worker.deleteSharePayload("pages-meta", syncToken).catch(() => null);
        await worker.deleteSharePayload("pages-history", syncToken).catch(() => null);
        await history.removeRecord("memo", syncToken).catch(() => null);
        await history.removeRecord("memo", token).catch(() => null);
        await worker.deleteSharePayload("pages", token).catch(() => null);
        await worker.deleteSharePayload("pages-meta", token).catch(() => null);
        await worker.deleteSharePayload("pages-history", token).catch(() => null);

        return {
          hasLocal,
          syncReadable: syncText.includes(`${initialMarker}:${afterRotateMarker}`),
          syncHistoryReadable: syncHistoryText.includes(syncHistoryMarker),
          originalReadable: originalText.includes(afterRotateMarker),
          originalHistoryReadable: originalHistoryText.includes(historyMarker)
        };
      }, { syncToken: afterReload.syncToken, initialMarker, afterRotateMarker, historyMarker, syncHistoryMarker, token });
      logStep("sync-check:done", syncCheck);

      expect(syncCheck.syncReadable).toBeTruthy();
      expect(syncCheck.syncHistoryReadable).toBeTruthy();
      expect(syncCheck.originalReadable).toBeTruthy();
      expect(syncCheck.originalHistoryReadable).toBeTruthy();
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
