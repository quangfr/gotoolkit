import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("Cloud sync performance", () => {
  test("measures sync timing by phase", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const token = `perf-sync-${Date.now()}`;

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker), null, { timeout: 30_000 });

    await page.evaluate(async ({ sharedToken }) => {
      const now = new Date().toISOString();
      const shareHistory = (window as any).goToolkitShareHistory;
      const shareWorker = (window as any).goToolkitShareWorker || {};
      const diagnostics = {
        listShareTreeCalls: 0,
        fetchSharePayloadBatchCalls: [] as string[][],
        saveSharePayloadBatchCalls: [] as Array<{ collection: string; ids: string[] }>,
      };
      (window as any).__cloudSyncPerfDiagnostics = diagnostics;
      const remotePayload = {
        tabs: [{ id: "tab-1", title: "Perf cloud doc", description: "", content: "Cloud payload", superpowers: [] }],
        activeTabId: "tab-1",
      };

      if (shareHistory?.upsertRecord) {
        await shareHistory.upsertRecord("memo", {
          token: sharedToken,
          title: "Perf cloud doc",
          description: "Local stale copy",
          payload: {
            tabs: [{ id: "tab-1", title: "Perf cloud doc", description: "", content: "Local payload", superpowers: [] }],
            activeTabId: "tab-1",
          },
          spaceId: "golive",
          parentId: "",
          icon: "file-symlink",
          position: 1024,
          updatedAt: "2025-01-01T00:00:00.000Z",
        });
      }

      (window as any).goToolkitShareWorker = {
        ...shareWorker,
        isReady: true,
        listShareTree: async () => {
          diagnostics.listShareTreeCalls += 1;
          return {
            documents: [{
              id: sharedToken,
              title: "Perf cloud doc",
              description: "Remote newer copy",
              superpowers: [],
              icon: "file-symlink",
              parentId: "",
              spaceId: "golive",
              position: 1024,
              status: "active",
              updatedAt: now,
            }],
          };
        },
        fetchSharePayloadBatch: async (_collection: string, ids: string[]) => {
          diagnostics.fetchSharePayloadBatchCalls.push([...ids]);
          return {
            documents: ids.map((id) => ({ id, payload: remotePayload, meta: { updatedAt: now } })),
          };
        },
        saveSharePayloadBatch: async (collection: string, writes: Array<{ id: string }>) => {
          diagnostics.saveSharePayloadBatchCalls.push({
            collection,
            ids: writes.map((w) => String(w.id || "")),
          });
          return {
            results: writes.map((item) => ({ id: item.id, meta: { updatedAt: now } })),
          };
        },
        deleteSharePayloadBatch: async () => ({ ok: true }),
        createSharePayloadBatch: async (_collection: string, writes: Array<{ id: string }>) => ({
          results: writes.map((item) => ({ id: item.id, meta: { updatedAt: now } })),
        }),
        fetchSharePayload: async () => ({ payload: {}, meta: { updatedAt: now } }),
        saveSharePayload: async () => ({ ok: true }),
      };
    }, { sharedToken: token });

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });

    const syncButton = page.locator('.document-explorer__item-action--sync-refresh[data-space-id="golive"]').first();
    await expect(syncButton).toBeVisible({ timeout: 30_000 });

    const runSync = async () => {
      const previousStartedAt = await page.evaluate(
        () => String((window as any).__goToolkitLastCloudSyncTiming?.startedAt || "")
      );
      const clickStart = Date.now();
      await page.evaluate(() => {
        const button = document.querySelector('.document-explorer__item-action--sync-refresh[data-space-id="golive"]');
        if (!(button instanceof HTMLElement)) {
          throw new Error("Sync button not found");
        }
        button.click();
      });
      await page.waitForFunction(
        (prev) => {
          const timing = (window as any).__goToolkitLastCloudSyncTiming;
          return Boolean(
            timing &&
            typeof timing.totalMs === "number" &&
            timing.totalMs >= 0 &&
            String(timing.startedAt || "") !== String(prev || "")
          );
        },
        previousStartedAt,
        { timeout: 45_000 }
      );
      const clickEnd = Date.now();
      const timing = await page.evaluate(() => (window as any).__goToolkitLastCloudSyncTiming || null);
      expect(timing).toBeTruthy();
      expect(Number(timing.totalMs)).toBeGreaterThanOrEqual(0);
      return {
        e2eClickMs: clickEnd - clickStart,
        syncTiming: timing,
      };
    };

    const firstRun = await runSync();
    const secondRun = await runSync();
    const diagnostics = await page.evaluate(async () => {
      const shareRecords = await (window as any).goToolkitShareHistory?.getRecordsByApp?.("memo");
      return {
        worker: (window as any).__cloudSyncPerfDiagnostics || null,
        memoRecords: Array.isArray(shareRecords)
          ? shareRecords.map((r: any) => ({
            token: String(r?.token || ""),
            title: String(r?.title || ""),
            updatedAt: String(r?.updatedAt || ""),
            syncedAt: String(r?.syncedAt || ""),
            cloudSyncedAt: String(r?.cloudSyncedAt || ""),
            spaceId: String(r?.spaceId || ""),
          }))
          : [],
      };
    });

    const result = {
      measuredAt: new Date().toISOString(),
      firstRun,
      secondRun,
      diagnostics,
    };

    fs.mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
    fs.writeFileSync(
      path.join(process.cwd(), "test-results", "cloud-sync-perf.json"),
      JSON.stringify(result, null, 2)
    );
  });
});
