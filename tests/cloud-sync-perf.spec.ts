import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("Cloud sync performance", () => {
  test("measures sync timing by phase", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const token = `perf-sync-${Date.now()}`;

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
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
      syncRuns: {
        firstRun,
        secondRun,
        diagnostics,
      },
    };

    fs.mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
    const outputPath = path.join(process.cwd(), "test-results", "cloud-sync-perf.json");
    let existing: any = {};
    try {
      existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } catch {
      existing = {};
    }
    const next = {
      ...existing,
      ...result,
    };
    fs.writeFileSync(
      outputPath,
      JSON.stringify(next, null, 2)
    );
  });

  test("measures e2ee encrypt/decrypt with delete + recreate", async ({ page }) => {
    test.setTimeout(180_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 45_000 });

    const result = await page.evaluate(async () => {
      const phrase = "equipe produit cloud securite intelligence";
      const spaceApi = (window as any).GoToolkitSpaces;
      if (spaceApi?.upsertSpace) {
        spaceApi.upsertSpace({
          id: "golive",
          name: "Go Live",
          icon: "cloud-upload",
          spaceJoinCode: phrase,
          isDefault: true,
        });
      }

      const metrics = {
        encryptMs: 0,
        decryptMs: 0,
        encryptCalls: 0,
        decryptCalls: 0,
      };
      const subtle = crypto.subtle;
      const originalEncrypt = subtle.encrypt.bind(subtle);
      const originalDecrypt = subtle.decrypt.bind(subtle);

      (subtle as any).encrypt = async (...args: any[]) => {
        const start = performance.now();
        try {
          return await originalEncrypt(...args as [AlgorithmIdentifier, CryptoKey, BufferSource]);
        } finally {
          metrics.encryptMs += performance.now() - start;
          metrics.encryptCalls += 1;
        }
      };

      (subtle as any).decrypt = async (...args: any[]) => {
        const start = performance.now();
        try {
          return await originalDecrypt(...args as [AlgorithmIdentifier, CryptoKey, BufferSource]);
        } finally {
          metrics.decryptMs += performance.now() - start;
          metrics.decryptCalls += 1;
        }
      };

      const worker = (window as any).goToolkitShareWorker;
      const token = `perf-e2ee-${Date.now()}`;
      const payload = {
        title: "Perf E2EE Document",
        description: "Delete + recreate benchmark",
        icon: "file-symlink",
        parentId: "",
        spaceId: "golive",
        status: "active",
        position: 2048,
        tabs: [
          {
            id: "tab-1",
            title: "Perf E2EE Document",
            description: "Delete + recreate benchmark",
            content: "Contenu de test identique pour delete puis recreate.",
            superpowers: ["perf", "e2ee"],
          },
        ],
        activeTabId: "tab-1",
      };

      const t0 = performance.now();
      await worker.saveSharePayload("pages", token, payload, { spaceId: "golive", inlineAssets: false });
      const saveInitialMs = performance.now() - t0;

      const t1 = performance.now();
      const firstRead = await worker.fetchSharePayload("pages", token);
      const fetchInitialMs = performance.now() - t1;

      const t2 = performance.now();
      await worker.deleteSharePayload("pages", token);
      const deleteMs = performance.now() - t2;

      const t3 = performance.now();
      await worker.saveSharePayload("pages", token, payload, { spaceId: "golive", inlineAssets: false });
      const recreateMs = performance.now() - t3;

      const t4 = performance.now();
      const secondRead = await worker.fetchSharePayload("pages", token);
      const fetchRecreatedMs = performance.now() - t4;

      await worker.deleteSharePayload("pages", token).catch(() => null);

      (subtle as any).encrypt = originalEncrypt;
      (subtle as any).decrypt = originalDecrypt;

      return {
        measuredAt: new Date().toISOString(),
        token,
        opsMs: {
          saveInitialMs,
          fetchInitialMs,
          deleteMs,
          recreateMs,
          fetchRecreatedMs,
        },
        cryptoMs: {
          encryptMs: Math.round(metrics.encryptMs * 100) / 100,
          decryptMs: Math.round(metrics.decryptMs * 100) / 100,
          encryptCalls: metrics.encryptCalls,
          decryptCalls: metrics.decryptCalls,
        },
        readabilityCheck: {
          firstTitle: String(firstRead?.payload?.tabs?.[0]?.title || ""),
          firstContentPreview: String(firstRead?.payload?.tabs?.[0]?.content || "").slice(0, 120),
          recreatedTitle: String(secondRead?.payload?.tabs?.[0]?.title || ""),
          recreatedContentPreview: String(secondRead?.payload?.tabs?.[0]?.content || "").slice(0, 120),
          looksEncryptedFirst: Boolean(firstRead?.payload?.ciphertext && firstRead?.payload?.iv),
          looksEncryptedRecreated: Boolean(secondRead?.payload?.ciphertext && secondRead?.payload?.iv),
        },
      };
    });

    expect(result.cryptoMs.encryptCalls).toBeGreaterThan(0);
    expect(result.cryptoMs.decryptCalls).toBeGreaterThan(0);
    expect(result.readabilityCheck.looksEncryptedFirst).toBeFalsy();
    expect(result.readabilityCheck.looksEncryptedRecreated).toBeFalsy();

    fs.mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
    const outputPath = path.join(process.cwd(), "test-results", "cloud-sync-perf.json");
    let existing: any = {};
    try {
      existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } catch {
      existing = {};
    }
    const next = {
      ...existing,
      e2eeDeleteRecreate: result,
    };
    fs.writeFileSync(outputPath, JSON.stringify(next, null, 2));
  });
});
