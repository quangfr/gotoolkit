import { expect, test } from "@playwright/test";

type Metric = {
  operation: "add_root" | "add_child";
  uiMs: number;
  cloudMs: number;
  details?: Record<string, unknown>;
};

function tokenFromDocId(docId: string) {
  return String(docId || "").replace(/^share:/, "").trim();
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

test.describe("Cloud add performance", () => {
  test("measures add_root and add_child latency", async ({ page }) => {
    test.setTimeout(8 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";
    const metrics: Metric[] = [];

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.isReady), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.getRecordsByApp), null, { timeout: 30_000 });
    await page.waitForFunction(() => typeof (window as any).GoToolkitMemoGetActiveDocumentId === "function", null, { timeout: 30_000 });

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });
    await page.waitForFunction(
      () => Boolean(document.querySelector(".document-explorer__section-body[data-section^='shared:']")),
      null,
      { timeout: 20_000 }
    );

    const isPanelOpen = await page.evaluate(() => {
      return !document.querySelector("#documentExplorer")?.classList.contains("document-explorer--collapsed");
    });
    if (!isPanelOpen) await page.click("#documentExplorerToggle");

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
      const root = body?.closest(".document-explorer__section") as HTMLElement | null;
      const refreshBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action:nth-child(2)") as HTMLButtonElement | null;
      refreshBtn?.click();
    }, sharedSection);
    await page.waitForTimeout(1500);

    const docItem = (docId: string) =>
      page.locator(`.document-explorer__section-body[data-section="${sharedSection}"] .document-explorer__item[data-document-id="${docId}"]`).first();

    const waitRemotePayload = async (token: string) => {
      await expect.poll(async () => {
        return await page.evaluate(async (docToken) => {
          const worker = (window as any).goToolkitShareWorker;
          const data = await worker.fetchSharePayload("memos", docToken);
          return Boolean(data?.payload);
        }, token);
      }, { timeout: 45_000, intervals: [300, 600, 1000] }).toBe(true);
    };

    const addRoot = async (index: number) => {
      const start = Date.now();
      const previous = await page.evaluate(() => (window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const addBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action") as HTMLButtonElement | null;
        addBtn?.click();
      }, sharedSection);

      await page.waitForFunction((prev) => {
        const id = (window as any).GoToolkitMemoGetActiveDocumentId?.() || "";
        return typeof id === "string" && id.startsWith("share:") && id !== prev;
      }, previous, { timeout: 45_000 });

      const docId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
      const token = tokenFromDocId(docId);
      const inlineInput = page.locator(".document-explorer__item-inline-input").first();
      if (await inlineInput.count()) {
        try {
          await inlineInput.press("Escape");
        } catch {
          // ignore
        }
      }
      const uiMs = Date.now() - start;
      await waitRemotePayload(token);
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "add_root", uiMs, cloudMs, details: { index, docId, token } });
      return docId;
    };

    const addChild = async (parentDocId: string, index: number) => {
      const start = Date.now();
      const parentToken = tokenFromDocId(parentDocId);
      const expectedParent = `share:${parentToken}`;
      const beforeTokens = await page.evaluate(async () => {
        const records = await (window as any).goToolkitShareHistory.getRecordsByApp("memo");
        return (records || []).map((r: any) => String(r?.token || "")).filter(Boolean);
      });
      const addChildBtn = page.locator(
        `.document-explorer__section-body[data-section="${sharedSection}"] .document-explorer__item[data-document-id="${parentDocId}"] .document-explorer__item-action[title="Créer une sous-page"]`
      ).first();
      await expect(addChildBtn).toHaveCount(1, { timeout: 15_000 });
      await addChildBtn.click({ force: true });

      const childToken = await expect
        .poll(async () => {
          return await page.evaluate(async ({ tokensBefore, parentId }) => {
            const records = await (window as any).goToolkitShareHistory.getRecordsByApp("memo");
            const before = new Set(tokensBefore || []);
            const found = (records || []).find((r: any) => {
              const token = String(r?.token || "");
              if (!token || before.has(token)) return false;
              return true;
            });
            return String(found?.token || "");
          }, { tokensBefore: beforeTokens, parentId: expectedParent });
        }, { timeout: 45_000, intervals: [300, 600, 1000] })
        .toBeTruthy();

      const uiMs = Date.now() - start;
      let localParentSynced = false;
      try {
        await expect.poll(async () => {
          return await page.evaluate(async ({ token, parentId }) => {
            const records = await (window as any).goToolkitShareHistory.getRecordsByApp("memo");
            const record = (records || []).find((r: any) => String(r?.token || "") === token);
            return String(record?.parentId || "") === parentId;
          }, { token: childToken, parentId: expectedParent });
        }, { timeout: 15_000, intervals: [300, 600, 1000] }).toBe(true);
        localParentSynced = true;
      } catch {
        localParentSynced = false;
      }
      let remoteSynced = false;
      try {
        await expect.poll(async () => {
          return await page.evaluate(async ({ token, parentId }) => {
            const worker = (window as any).goToolkitShareWorker;
            const data = await worker.fetchSharePayload("memos", token);
            return String(data?.payload?.parentId || "") === parentId;
          }, { token: childToken, parentId: expectedParent });
        }, { timeout: 15_000, intervals: [300, 600, 1000] }).toBe(true);
        remoteSynced = true;
      } catch {
        remoteSynced = false;
      }
      const cloudMs = Date.now() - start;
      metrics.push({
        operation: "add_child",
        uiMs,
        cloudMs,
        details: { index, parentDocId, childToken, localParentSynced, remoteSynced }
      });
      return `share:${childToken}`;
    };

    const roots: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      roots.push(await addRoot(i));
    }
    for (let i = 1; i <= 3; i += 1) {
      await addChild(roots[0], i);
    }

    const rootRows = metrics.filter((m) => m.operation === "add_root");
    const childRows = metrics.filter((m) => m.operation === "add_child");
    const summary = {
      add_root: {
        runs: rootRows.length,
        uiMeanMs: Math.round(mean(rootRows.map((r) => r.uiMs))),
        cloudMeanMs: Math.round(mean(rootRows.map((r) => r.cloudMs))),
      },
      add_child: {
        runs: childRows.length,
        uiMeanMs: Math.round(mean(childRows.map((r) => r.uiMs))),
        cloudMeanMs: Math.round(mean(childRows.map((r) => r.cloudMs))),
      }
    };

    console.log("Cloud add perf summary:", JSON.stringify(summary, null, 2));
    console.log("Cloud add perf details:", JSON.stringify(metrics, null, 2));

    expect(rootRows.length).toBe(5);
    expect(childRows.length).toBe(3);
  });
});
