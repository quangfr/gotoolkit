import { expect, test } from "@playwright/test";

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

test.describe("Share sync response time", () => {
  test("compares full tree fetch vs delta sync from 2026-01-01", async ({ page }) => {
    test.setTimeout(3 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker), null, { timeout: 30_000 });

    const workerReady = await page.evaluate(() => Boolean((window as any).goToolkitShareWorker?.isReady));
    test.skip(!workerReady, "Share worker client is not configured in this environment");

    const syncAvailable = await page.evaluate(async () => {
      try {
        await (window as any).goToolkitShareWorker.syncShareTree("memos-meta", {
          since: new Date(Date.now() - 60_000).toISOString(),
          spaceId: "golive",
          includeArchived: true,
          includeContent: false,
        });
        return true;
      } catch (error) {
        const message = String((error as any)?.message || "").toLowerCase();
        if (message.includes("ressource introuvable") || message.includes("404")) {
          return false;
        }
        throw error;
      }
    });
    test.skip(!syncAvailable, "Share worker :sync endpoint is not deployed in this environment yet");

    const result = await page.evaluate(async () => {
      const worker = (window as any).goToolkitShareWorker;
      const spaceId = "golive";
      const runs = 3;
      const since = "2026-01-01T00:00:00.000Z";
      const fullMs: number[] = [];
      const deltaMs: number[] = [];
      let deltaCount = 0;
      let fullCount = 0;

      for (let i = 0; i < runs; i += 1) {
        const startFull = performance.now();
        const full = await worker.listShareTree("memos-meta", {
          spaceId,
          includeArchived: true,
        });
        fullMs.push(Math.round(performance.now() - startFull));
        fullCount = Math.max(fullCount, Array.isArray(full?.documents) ? full.documents.length : 0);

        const startDelta = performance.now();
        const delta = await worker.syncShareTree("memos-meta", {
          since,
          spaceId,
          includeArchived: true,
          includeContent: true,
        });
        deltaMs.push(Math.round(performance.now() - startDelta));
        deltaCount = Math.max(deltaCount, Array.isArray(delta?.documents) ? delta.documents.length : 0);
      }

      return {
        runs,
        since,
        fullMs,
        deltaMs,
        fullCount,
        deltaCount,
      };
    });

    const fullMean = Math.round(mean(result.fullMs));
    const deltaMean = Math.round(mean(result.deltaMs));

    console.log("[share-sync-perf]", {
      runs: result.runs,
      since: result.since,
      fullMs: result.fullMs,
      deltaMs: result.deltaMs,
      fullMean,
      deltaMean,
      fullCount: result.fullCount,
      deltaCount: result.deltaCount,
    });

    expect(result.fullMs.length).toBe(result.runs);
    expect(result.deltaMs.length).toBe(result.runs);
    expect(fullMean).toBeGreaterThanOrEqual(0);
    expect(deltaMean).toBeGreaterThanOrEqual(0);
  });

  test("measures end-to-end sync UI cycle in document panel", async ({ page }) => {
    test.setTimeout(4 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });

    const workerReady = await page.evaluate(() => Boolean((window as any).goToolkitShareWorker?.isReady));
    test.skip(!workerReady, "Share worker client is not configured in this environment");

    const isPanelOpen = await page.evaluate(() => !document.querySelector("#documentExplorer")?.classList.contains("document-explorer--collapsed"));
    if (!isPanelOpen) {
      await page.click("#documentExplorerToggle");
    }

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });

    const refreshButton = page.locator('.document-explorer__item-action--sync-refresh[data-space-id="golive"]').first();
    test.skip((await refreshButton.count()) === 0, "Shared space refresh button not found for golive");

    const result = await page.evaluate(async () => {
      const button = document.querySelector('.document-explorer__item-action--sync-refresh[data-space-id="golive"]') as HTMLButtonElement | null;
      const toast = document.getElementById("copyToast");
      const section = document.querySelector('.document-explorer__section-body[data-section="shared:golive"]') as HTMLElement | null;
      if (!button || !toast || !section) {
        throw new Error("Missing sync UI elements (button/toast/section)");
      }

      const beforeCount = section.querySelectorAll(".document-explorer__item").length;
      let mutationCount = 0;
      const observer = new MutationObserver((mutations) => {
        mutationCount += mutations.length;
      });
      observer.observe(section, { childList: true, subtree: true, attributes: false });

      try {
        (window as any).GoToolkitMemoToast?.("", false, { persist: false });
      } catch {
        toast.classList.remove("visible");
        toast.textContent = "";
      }

      const start = performance.now();
      button.click();

      let syncToastSeenAt = -1;
      let syncDoneAt = -1;
      let sawSpinner = false;
      const timeoutMs = 180_000;

      while (performance.now() - start < timeoutMs) {
        const now = performance.now();
        const text = String(toast.textContent || "").toLowerCase();
        const visible = toast.classList.contains("visible");
        const icon = button.querySelector('i[data-lucide="refresh-cw"], i');
        const spinning = Boolean(icon && icon.classList.contains("lucide-spin"));

        if (syncToastSeenAt < 0 && text.includes("synchronisation en cours") && visible) {
          syncToastSeenAt = now;
        }

        if (spinning) {
          sawSpinner = true;
        }

        if (syncToastSeenAt >= 0 && syncDoneAt < 0) {
          const syncMessageCleared = !text.includes("synchronisation en cours");
          if ((sawSpinner && !spinning) || syncMessageCleared) {
            syncDoneAt = now;
          }
        }

        if (syncToastSeenAt >= 0 && syncDoneAt >= 0 && !visible) {
          const end = now;
          observer.disconnect();
          const afterCount = section.querySelectorAll(".document-explorer__item").length;
          return {
            totalUiMs: Math.round(end - start),
            syncToastAppearedMs: Math.round(syncToastSeenAt - start),
            treeProcessedMs: Math.round(syncDoneAt - start),
            toastDisappearedMs: Math.round(end - start),
            beforeCount,
            afterCount,
            mutationCount,
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      observer.disconnect();
      throw new Error("Timed out waiting for full sync UI cycle completion");
    });

    console.log("[share-sync-ui-cycle]", result);

    expect(result.totalUiMs).toBeGreaterThan(0);
    expect(result.syncToastAppearedMs).toBeGreaterThanOrEqual(0);
    expect(result.treeProcessedMs).toBeGreaterThanOrEqual(result.syncToastAppearedMs);
    expect(result.toastDisappearedMs).toBeGreaterThanOrEqual(result.treeProcessedMs);
  });

  test("compares 2-requests (tree+batch) vs 1-request diff(meta+content)", async ({ page }) => {
    test.setTimeout(4 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker), null, { timeout: 30_000 });

    const workerReady = await page.evaluate(() => Boolean((window as any).goToolkitShareWorker?.isReady));
    test.skip(!workerReady, "Share worker client is not configured in this environment");

    const syncAvailable = await page.evaluate(async () => {
      try {
        await (window as any).goToolkitShareWorker.syncShareTree("memos-meta", {
          since: "2026-01-01T00:00:00.000Z",
          spaceId: "golive",
          includeArchived: true,
          includeContent: true,
        });
        return true;
      } catch (error) {
        const message = String((error as any)?.message || "").toLowerCase();
        if (message.includes("ressource introuvable") || message.includes("404")) {
          return false;
        }
        throw error;
      }
    });
    test.skip(!syncAvailable, "Share worker :sync endpoint is not deployed in this environment yet");

    const result = await page.evaluate(async () => {
      const worker = (window as any).goToolkitShareWorker;
      const spaceId = "golive";
      const baselineTree = await worker.listShareTree("memos-meta", {
        spaceId,
        includeArchived: true,
      });
      const summaries = (Array.isArray(baselineTree?.documents) ? baselineTree.documents : [])
        .map((doc: any) => ({
          id: String(doc?.id || "").trim(),
          updatedAt: String(doc?.updatedAt || "").trim(),
        }))
        .filter((doc: any) => Boolean(doc.id) && Boolean(doc.updatedAt))
        .sort((a: any, b: any) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));

      const targetChangedDocs = Math.min(20, summaries.length);
      const since = targetChangedDocs > 0 && summaries[targetChangedDocs - 1]?.updatedAt
        ? String(summaries[targetChangedDocs - 1].updatedAt)
        : "2026-01-01T00:00:00.000Z";
      const sinceMs = Date.parse(since);
      const runs = 3;

      const twoRequestMs: number[] = [];
      const oneRequestMs: number[] = [];
      let twoRequestMetaCount = 0;
      let twoRequestContentCount = 0;
      let oneRequestMetaCount = 0;
      let oneRequestContentCount = 0;

      for (let i = 0; i < runs; i += 1) {
        const startTwo = performance.now();
        const fullTree = await worker.listShareTree("memos-meta", {
          spaceId,
          includeArchived: true,
        });
        const ids = (Array.isArray(fullTree?.documents) ? fullTree.documents : [])
          .filter((d: any) => Date.parse(String(d?.updatedAt || "")) > sinceMs)
          .map((d: any) => String(d?.id || "").trim())
          .filter(Boolean);
        if (ids.length > 200) {
          throw new Error(`2-requests benchmark expects <=200 ids for one batchGet, got ${ids.length}`);
        }
        const batch = ids.length
          ? await worker.fetchSharePayloadBatch("memos", ids)
          : { documents: [] };
        twoRequestMs.push(Math.round(performance.now() - startTwo));
        twoRequestMetaCount = Math.max(twoRequestMetaCount, ids.length);
        twoRequestContentCount = Math.max(
          twoRequestContentCount,
          Array.isArray(batch?.documents) ? batch.documents.filter((d: any) => d?.payload).length : 0
        );

        const startOne = performance.now();
        const diff = await worker.syncShareTree("memos-meta", {
          since,
          spaceId,
          includeArchived: true,
          includeContent: true,
        });
        oneRequestMs.push(Math.round(performance.now() - startOne));
        oneRequestMetaCount = Math.max(oneRequestMetaCount, Array.isArray(diff?.documents) ? diff.documents.length : 0);
        oneRequestContentCount = Math.max(oneRequestContentCount, Array.isArray(diff?.contents) ? diff.contents.filter((d: any) => d?.payload).length : 0);
      }

      return {
        runs,
        since,
        twoRequestMs,
        oneRequestMs,
        twoRequestMetaCount,
        twoRequestContentCount,
        oneRequestMetaCount,
        oneRequestContentCount,
      };
    });

    const twoRequestMean = Math.round(mean(result.twoRequestMs));
    const oneRequestMean = Math.round(mean(result.oneRequestMs));

    console.log("[share-sync-2req-vs-1req]", {
      runs: result.runs,
      since: result.since,
      twoRequestMs: result.twoRequestMs,
      oneRequestMs: result.oneRequestMs,
      twoRequestMean,
      oneRequestMean,
      twoRequestMetaCount: result.twoRequestMetaCount,
      twoRequestContentCount: result.twoRequestContentCount,
      oneRequestMetaCount: result.oneRequestMetaCount,
      oneRequestContentCount: result.oneRequestContentCount,
    });

    expect(result.twoRequestMs.length).toBe(result.runs);
    expect(result.oneRequestMs.length).toBe(result.runs);
    expect(twoRequestMean).toBeGreaterThanOrEqual(0);
    expect(oneRequestMean).toBeGreaterThanOrEqual(0);
  });
});
