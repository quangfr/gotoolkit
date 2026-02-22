import { expect, test } from "@playwright/test";

type Metric = {
  operation: string;
  uiMs: number;
  cloudMs: number;
  details?: Record<string, unknown>;
};

function tokenFromDocId(docId: string) {
  return String(docId || "").replace(/^share:/, "").trim();
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

function aggregate(metrics: Metric[]) {
  const byOp = new Map<string, Metric[]>();
  for (const metric of metrics) {
    const list = byOp.get(metric.operation) || [];
    list.push(metric);
    byOp.set(metric.operation, list);
  }
  const summary = Array.from(byOp.entries()).map(([operation, rows]) => {
    const ui = rows.map((m) => m.uiMs);
    const cloud = rows.map((m) => m.cloudMs);
    const mean = (arr: number[]) => (arr.reduce((acc, n) => acc + n, 0) / Math.max(1, arr.length));
    return {
      operation,
      runs: rows.length,
      uiMeanMs: Math.round(mean(ui)),
      uiP95Ms: Math.round(percentile(ui, 95)),
      cloudMeanMs: Math.round(mean(cloud)),
      cloudP95Ms: Math.round(percentile(cloud, 95)),
    };
  });
  return summary.sort((a, b) => b.cloudP95Ms - a.cloudP95Ms);
}

test.describe("Cloud documents operations performance", () => {
  test("measures add/remove/move latency for shared documents", async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";
    const metrics: Metric[] = [];
    const createdDocIds: string[] = [];

    page.on("dialog", async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        // ignore
      }
    });

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.isReady), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.getRecordsByApp), null, { timeout: 30_000 });
    await page.waitForFunction(() => typeof (window as any).GoToolkitMemoGetActiveDocumentId === "function", null, { timeout: 30_000 });

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });
    await page.waitForTimeout(400);
    await page.waitForFunction(() => {
      return Boolean(document.querySelector(".document-explorer__section-body[data-section^='shared:']"));
    }, null, { timeout: 20_000 }).catch(() => null);
    const hasSharedSection = await page.evaluate(() =>
      Boolean(document.querySelector(".document-explorer__section-body[data-section^='shared:']"))
    );
    test.skip(!hasSharedSection, "No shared section visible in document explorer");

    const isPanelOpen = await page.evaluate(() => {
      return !document.querySelector("#documentExplorer")?.classList.contains("document-explorer--collapsed");
    });
    if (!isPanelOpen) {
      await page.click("#documentExplorerToggle");
    }

    const sharedSection = await page.evaluate(() => {
      const body = document.querySelector(".document-explorer__section-body[data-section^='shared:']") as HTMLElement | null;
      return String(body?.dataset?.section || "").trim();
    });
    expect(sharedSection).toBeTruthy();

    await page.evaluate((sectionName) => {
      const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
      const hidden = !body || body.style.display === "none";
      if (hidden) {
        const header = body?.previousElementSibling as HTMLElement | null;
        header?.click();
      }
    }, sharedSection);
    await page.evaluate((sectionName) => {
      const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
      const root = body?.closest(".document-explorer__section") as HTMLElement | null;
      const refreshBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action:nth-child(2)") as HTMLButtonElement | null;
      refreshBtn?.click();
    }, sharedSection);
    await page.waitForTimeout(1500);

    const docItem = (docId: string) =>
      page.locator(`.document-explorer__section-body[data-section="${sharedSection}"] .document-explorer__item[data-document-id="${docId}"]`).first();

    const waitCloudPayload = async (token: string) => {
      await expect.poll(async () => {
        return await page.evaluate(async (docToken) => {
          const worker = (window as any).goToolkitShareWorker;
          const data = await worker.fetchSharePayload("memos", docToken);
          return Boolean(data?.payload);
        }, token);
      }, { timeout: 45_000, intervals: [300, 600, 1000] }).toBe(true);
    };

    const createSharedRootDoc = async (index: number) => {
      const start = Date.now();
      const previousActive = await page.evaluate(() => (window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const addBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action") as HTMLButtonElement | null;
        addBtn?.click();
      }, sharedSection);

      await page.waitForFunction((prev) => {
        const id = (window as any).GoToolkitMemoGetActiveDocumentId?.() || "";
        return typeof id === "string" && id.startsWith("share:") && id !== prev;
      }, previousActive, { timeout: 45_000 });

      const docId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
      const uiMs = Date.now() - start;
      const token = tokenFromDocId(docId);
      await waitCloudPayload(token);
      const cloudMs = Date.now() - start;
      createdDocIds.push(docId);
      metrics.push({
        operation: "add_root",
        uiMs,
        cloudMs,
        details: { docId, token, index }
      });
      return docId;
    };

    const moveInsideParent = async (childDocId: string, parentDocId: string) => {
      const childToken = tokenFromDocId(childDocId);
      const parentToken = tokenFromDocId(parentDocId);
      const expectedParent = `share:${parentToken}`;
      const start = Date.now();

      const child = docItem(childDocId);
      const parent = docItem(parentDocId);
      await child.hover();
      await child.dragTo(parent, { targetPosition: { x: 30, y: 14 } });

      await expect.poll(async () => {
        return await page.evaluate(async (token) => {
          const history = (window as any).goToolkitShareHistory;
          const records = await history.getRecordsByApp("memo");
          const match = (records || []).find((r: any) => String(r?.token || "") === token);
          return String(match?.parentId || "");
        }, childToken);
      }, { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(expectedParent);

      const uiMs = Date.now() - start;

      await expect.poll(async () => {
        return await page.evaluate(async (token) => {
          const worker = (window as any).goToolkitShareWorker;
          const data = await worker.fetchSharePayload("memos", token);
          return String(data?.payload?.parentId || "");
        }, childToken);
      }, { timeout: 45_000, intervals: [300, 600, 1000] }).toBe(expectedParent);

      const cloudMs = Date.now() - start;
      metrics.push({
        operation: "move_inside_parent",
        uiMs,
        cloudMs,
        details: { childDocId, parentDocId, expectedParent }
      });
    };

    const moveSortBefore = async (movingDocId: string, beforeDocId: string) => {
      const movingToken = tokenFromDocId(movingDocId);
      const beforeToken = tokenFromDocId(beforeDocId);
      const start = Date.now();

      const moving = docItem(movingDocId);
      const before = docItem(beforeDocId);
      await moving.hover();
      await moving.dragTo(before, { targetPosition: { x: 30, y: 3 } });

      await expect.poll(async () => {
        return await page.evaluate(async ({ tokenA, tokenB }) => {
          const history = (window as any).goToolkitShareHistory;
          const records = await history.getRecordsByApp("memo");
          const a = (records || []).find((r: any) => String(r?.token || "") === tokenA);
          const b = (records || []).find((r: any) => String(r?.token || "") === tokenB);
          const ap = Number(a?.position);
          const bp = Number(b?.position);
          const sameParent = String(a?.parentId || "") === String(b?.parentId || "");
          return Number.isFinite(ap) && Number.isFinite(bp) && sameParent && ap < bp;
        }, { tokenA: movingToken, tokenB: beforeToken });
      }, { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(true);

      const uiMs = Date.now() - start;

      await expect.poll(async () => {
        return await page.evaluate(async ({ tokenA, tokenB }) => {
          const worker = (window as any).goToolkitShareWorker;
          const pa = await worker.fetchSharePayload("memos", tokenA);
          const pb = await worker.fetchSharePayload("memos", tokenB);
          const ap = Number(pa?.payload?.position);
          const bp = Number(pb?.payload?.position);
          const sameParent = String(pa?.payload?.parentId || "") === String(pb?.payload?.parentId || "");
          return Number.isFinite(ap) && Number.isFinite(bp) && sameParent && ap < bp;
        }, { tokenA: movingToken, tokenB: beforeToken });
      }, { timeout: 45_000, intervals: [300, 600, 1000] }).toBe(true);

      const cloudMs = Date.now() - start;
      metrics.push({
        operation: "move_sort",
        uiMs,
        cloudMs,
        details: { movingDocId, beforeDocId }
      });
    };

    const deleteSharedDoc = async (docId: string) => {
      const token = tokenFromDocId(docId);
      const start = Date.now();
      const target = docItem(docId);
      await target.hover();
      await target.locator(".document-explorer__delete").click();
      await expect(target).toHaveCount(0, { timeout: 30_000 });
      const uiMs = Date.now() - start;

      await expect.poll(async () => {
        return await page.evaluate(async (docToken) => {
          const worker = (window as any).goToolkitShareWorker;
          const data = await worker.fetchSharePayload("memos", docToken);
          return data === null;
        }, token);
      }, { timeout: 45_000, intervals: [300, 600, 1000] }).toBe(true);

      const cloudMs = Date.now() - start;
      metrics.push({
        operation: "remove",
        uiMs,
        cloudMs,
        details: { docId, token }
      });
    };

    const d1 = await createSharedRootDoc(1);
    const d2 = await createSharedRootDoc(2);
    const d3 = await createSharedRootDoc(3);
    const d4 = await createSharedRootDoc(4);
    const d5 = await createSharedRootDoc(5);

    await moveInsideParent(d3, d1);
    await moveSortBefore(d5, d2);
    await deleteSharedDoc(d4);

    const summary = aggregate(metrics);
    console.log("Cloud ops perf summary:", JSON.stringify(summary, null, 2));
    console.log("Cloud ops perf details:", JSON.stringify(metrics, null, 2));

    expect(summary.length).toBeGreaterThanOrEqual(4);
  });
});
