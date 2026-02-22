import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type Metric = {
  operation:
    | "add_root"
    | "add_in_parent"
    | "rename"
    | "move_sorting"
    | "move_in_parent"
    | "delete"
    | "multi_select_delete";
  uiMs: number;
  storeMs: number;
  details?: Record<string, unknown>;
};

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
  const mean = (arr: number[]) => (arr.reduce((acc, n) => acc + n, 0) / Math.max(1, arr.length));
  return Array.from(byOp.entries())
    .map(([operation, rows]) => {
      const ui = rows.map((row) => row.uiMs);
      const store = rows.map((row) => row.storeMs);
      return {
        operation,
        runs: rows.length,
        uiMeanMs: Math.round(mean(ui)),
        uiP95Ms: Math.round(percentile(ui, 95)),
        storeMeanMs: Math.round(mean(store)),
        storeP95Ms: Math.round(percentile(store, 95)),
      };
    })
    .sort((a, b) => b.storeP95Ms - a.storeP95Ms);
}

function readSampleCorpus() {
  const root = process.cwd();
  const samplePaths = [
    "public/content/context_safran.md",
    "public/content/index_roadmap.md",
    "public/content/toolkit_import.md",
  ].map((rel) => path.join(root, rel));
  const joined = samplePaths
    .map((filePath) => {
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
  const fallback = "Private perf sample page content.";
  const base = joined || fallback;
  const chunks = [
    base.slice(0, 320),
    base.slice(0, 1200),
    base.slice(0, 3600),
    `${base.slice(0, 2200)}\n\n${base.slice(400, 2600)}`,
    `${base.slice(0, 1800)}\n\n${base.slice(0, 1800)}\n\n${base.slice(0, 1800)}`,
  ];
  return chunks.map((chunk) => chunk || fallback);
}

test.describe("Private documents operations performance", () => {
  test("measures private doc ops with varied page lengths", async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";
    const metrics: Metric[] = [];
    const samples = readSampleCorpus();
    const prefix = `perf-private-${Date.now()}`;

    page.on("dialog", async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        // ignore
      }
    });

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof (window as any).GoToolkitMemoGetActiveDocumentId === "function", null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi?.upsertRecord), null, { timeout: 30_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 30_000 });

    const isPanelOpen = await page.evaluate(() => !document.querySelector("#documentExplorer")?.classList.contains("document-explorer--collapsed"));
    if (!isPanelOpen) await page.click("#documentExplorerToggle");

    const privateSection = "private";
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });
    await page.waitForFunction(
      () => Boolean(document.querySelector('.document-explorer__section-body[data-section="private"]')),
      null,
      { timeout: 20_000 }
    );

    await page.evaluate((sectionName) => {
      const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
      const hidden = !body || body.style.display === "none";
      if (hidden) {
        const header = body?.previousElementSibling as HTMLElement | null;
        header?.click();
      }
    }, privateSection);

    const seededDocIds = await page.evaluate(async ({ count, titlePrefix, sampleTexts }) => {
      const docApi = (window as any).goToolkitDocumentApi;
      const activeDocId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
      if (!activeDocId && typeof (window as any).GoToolkitMemoCreateAutoDocument === "function") {
        await (window as any).GoToolkitMemoCreateAutoDocument();
      }
      const resolvedActiveId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
      const activeRecord = resolvedActiveId ? await docApi.getRecord(resolvedActiveId) : null;
      const payloadTemplate = activeRecord?.payload || {
        tabs: [{ id: `${Date.now()}-tab`, title: "New page", description: "", superpowers: [], content: "" }],
        activeTabId: "",
        promptPresetId: "edit",
      };
      const ids: string[] = [];
      for (let i = 1; i <= count; i += 1) {
        const id = docApi.generateId ? docApi.generateId() : `${Date.now()}-${Math.random()}`;
        const payload = JSON.parse(JSON.stringify(payloadTemplate));
        const sample = String(sampleTexts[(i - 1) % sampleTexts.length] || "");
        if (Array.isArray(payload.tabs) && payload.tabs[0]) {
          payload.tabs[0].id = `${id}-tab`;
          payload.tabs[0].title = `${titlePrefix}-${String(i).padStart(2, "0")}`;
          payload.tabs[0].description = `Perf sample ${i}`;
          payload.tabs[0].content = sample;
          payload.activeTabId = payload.tabs[0].id;
        }
        await docApi.upsertRecord({
          id,
          app: "memo",
          title: `${titlePrefix}-${String(i).padStart(2, "0")}`,
          description: `Perf sample ${i}`,
          superpowers: [],
          payload,
          parentId: "",
          icon: "file",
          updatedAt: new Date().toISOString(),
        });
        ids.push(String(id));
      }
      return ids;
    }, { count: 40, titlePrefix: prefix, sampleTexts: samples });

    expect(seededDocIds.length).toBe(40);
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });

    const docItem = (docId: string) =>
      page.locator(`.document-explorer__section-body[data-section="private"] .document-explorer__item[data-document-id="${docId}"]`).first();

    for (const id of seededDocIds.slice(0, 8)) {
      await expect(docItem(id)).toHaveCount(1, { timeout: 20_000 });
    }

    const addRoot = async () => {
      const start = Date.now();
      const prev = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const addBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action") as HTMLButtonElement | null;
        addBtn?.click();
      }, privateSection);
      await page.waitForFunction((previous) => {
        const id = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
        return Boolean(id) && id !== String(previous || "") && !id.startsWith("share:") && !id.startsWith("common:");
      }, prev, { timeout: 45_000 });
      const docId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
      await expect(docItem(docId)).toHaveCount(1, { timeout: 20_000 });
      const uiMs = Date.now() - start;
      await expect.poll(async () => {
        return await page.evaluate(async (id) => Boolean(await (window as any).goToolkitDocumentApi?.getRecord?.(id)), docId);
      }, { timeout: 20_000, intervals: [150, 300, 500] }).toBe(true);
      const storeMs = Date.now() - start;
      metrics.push({ operation: "add_root", uiMs, storeMs, details: { docId } });
      return docId;
    };

    const addInParent = async (parentId: string) => {
      const start = Date.now();
      const addChildBtn = page.locator(
        `.document-explorer__section-body[data-section="private"] .document-explorer__item[data-document-id="${parentId}"] .document-explorer__item-action[title="Créer une sous-page"]`
      ).first();
      await expect(addChildBtn).toHaveCount(1, { timeout: 20_000 });
      await docItem(parentId).hover();
      await addChildBtn.click({ force: true });
      await expect.poll(async () => {
        return await page.evaluate(async (pid) => {
          const all = await (window as any).goToolkitDocumentApi?.getAllRecords?.();
          const rows = (all || []).filter((r: any) => r && r.app === "memo" && String(r.parentId || "") === String(pid));
          rows.sort((a: any, b: any) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
          return String(rows[0]?.id || "");
        }, parentId);
      }, { timeout: 45_000, intervals: [200, 400, 800] }).not.toBe("");
      const childId = await page.evaluate(async (pid) => {
        const all = await (window as any).goToolkitDocumentApi?.getAllRecords?.();
        const rows = (all || []).filter((r: any) => r && r.app === "memo" && String(r.parentId || "") === String(pid));
        rows.sort((a: any, b: any) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return String(rows[0]?.id || "");
      }, parentId);
      const uiMs = Date.now() - start;
      await expect.poll(async () => {
        return await page.evaluate(async (id) => String((await (window as any).goToolkitDocumentApi?.getRecord?.(id))?.parentId || ""), childId);
      }, { timeout: 20_000, intervals: [150, 300, 500] }).toBe(parentId);
      const storeMs = Date.now() - start;
      metrics.push({ operation: "add_in_parent", uiMs, storeMs, details: { parentId, childId } });
      return childId;
    };

    const renameDoc = async (docId: string, nextName: string) => {
      const start = Date.now();
      const row = docItem(docId);
      await row.dblclick();
      const input = row.locator(".document-explorer__item-inline-input");
      await expect(input).toHaveCount(1, { timeout: 10_000 });
      await input.fill(nextName);
      await input.evaluate((el) => {
        const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
      });
      await expect.poll(async () => {
        return await page.evaluate(async (id) => String((await (window as any).goToolkitDocumentApi?.getRecord?.(id))?.title || ""), docId);
      }, { timeout: 20_000, intervals: [150, 300, 500] }).toBe(nextName);
      const uiMs = Date.now() - start;
      const storeMs = Date.now() - start;
      metrics.push({ operation: "rename", uiMs, storeMs, details: { docId, nextName } });
    };

    const moveSorting = async (movingId: string, beforeId: string) => {
      const start = Date.now();
      const moving = docItem(movingId);
      const before = docItem(beforeId);
      await moving.hover();
      await moving.dragTo(before, { targetPosition: { x: 30, y: 3 } });
      await expect.poll(async () => {
        return await page.evaluate(({ a, b }) => {
          const ids = Array.from(document.querySelectorAll('.document-explorer__section-body[data-section="private"] .document-explorer__item[data-document-id]'))
            .map((el) => String((el as HTMLElement).dataset.documentId || ""));
          const ai = ids.indexOf(String(a));
          const bi = ids.indexOf(String(b));
          return ai >= 0 && bi >= 0 && ai < bi;
        }, { a: movingId, b: beforeId });
      }, { timeout: 20_000, intervals: [150, 300, 500] }).toBe(true);
      const uiMs = Date.now() - start;
      const localOrderPersisted = await page.evaluate(({ a, b }) => {
        const key = "goToolkit.memo.treeOrder";
        const raw = localStorage.getItem(key) || "[]";
        const ids = JSON.parse(raw);
        const ai = Array.isArray(ids) ? ids.indexOf(String(a)) : -1;
        const bi = Array.isArray(ids) ? ids.indexOf(String(b)) : -1;
        return { ok: ai >= 0 && bi >= 0 && ai < bi, ai, bi };
      }, { a: movingId, b: beforeId });
      const storeMs = Date.now() - start;
      metrics.push({
        operation: "move_sorting",
        uiMs,
        storeMs,
        details: {
          movingId,
          beforeId,
          localOrderPersisted: Boolean(localOrderPersisted?.ok),
          orderIndexA: Number(localOrderPersisted?.ai ?? -1),
          orderIndexB: Number(localOrderPersisted?.bi ?? -1),
        }
      });
    };

    const moveInParent = async (childId: string, parentId: string) => {
      const start = Date.now();
      const child = docItem(childId);
      const parent = docItem(parentId);
      await child.hover();
      await child.dragTo(parent, { targetPosition: { x: 30, y: 14 } });
      await expect.poll(async () => {
        return await page.evaluate(async (id) => String((await (window as any).goToolkitDocumentApi?.getRecord?.(id))?.parentId || ""), childId);
      }, { timeout: 20_000, intervals: [150, 300, 500] }).toBe(parentId);
      const uiMs = Date.now() - start;
      const storeMs = Date.now() - start;
      metrics.push({ operation: "move_in_parent", uiMs, storeMs, details: { childId, parentId } });
    };

    const deleteOne = async (docId: string) => {
      const start = Date.now();
      const row = docItem(docId);
      await row.hover();
      await row.locator(".document-explorer__delete").click();
      await expect(row).toHaveCount(0, { timeout: 30_000 });
      const uiMs = Date.now() - start;
      await expect.poll(async () => {
        return await page.evaluate(async (id) => (await (window as any).goToolkitDocumentApi?.getRecord?.(id)) === null, docId);
      }, { timeout: 20_000, intervals: [150, 300, 500] }).toBe(true);
      const storeMs = Date.now() - start;
      metrics.push({ operation: "delete", uiMs, storeMs, details: { docId } });
    };

    const multiSelectDelete = async (ids: string[]) => {
      const start = Date.now();
      for (let i = 0; i < ids.length; i += 1) {
        const row = docItem(ids[i]);
        await expect(row).toHaveCount(1, { timeout: 15_000 });
        if (i === 0) await row.click();
        else await row.click({ modifiers: ["Control"] });
      }
      const deleteBtn = docItem(ids[0]).locator(".document-explorer__delete");
      await deleteBtn.click();
      await expect.poll(async () => {
        return await page.evaluate((targets) => {
          return targets.every((id: string) => !document.querySelector(`.document-explorer__item[data-document-id="${id}"]`));
        }, ids);
      }, { timeout: 30_000, intervals: [200, 400, 800] }).toBe(true);
      const uiMs = Date.now() - start;
      await expect.poll(async () => {
        return await page.evaluate(async (targets) => {
          const checks = await Promise.all(targets.map((id: string) => (window as any).goToolkitDocumentApi?.getRecord?.(id)));
          return checks.every((record: any) => record === null);
        }, ids);
      }, { timeout: 20_000, intervals: [150, 300, 500] }).toBe(true);
      const storeMs = Date.now() - start;
      metrics.push({ operation: "multi_select_delete", uiMs, storeMs, details: { ids } });
    };

    const rootAddedId = await addRoot();
    await page.evaluate(({ text }) => {
      if (typeof (window as any).GoToolkitMemoAppendText === "function") {
        (window as any).GoToolkitMemoAppendText(text);
      }
    }, { text: samples[4] });

    const parentId = seededDocIds[0];
    const secondRootId = seededDocIds[1];
    const thirdRootId = seededDocIds[2];
    const childAddedId = await addInParent(parentId);
    await renameDoc(rootAddedId, `${prefix}-renamed-root`);
    await moveSorting(rootAddedId, secondRootId);
    await moveInParent(rootAddedId, parentId);
    await deleteOne(thirdRootId);
    await multiSelectDelete([seededDocIds[5], seededDocIds[6], seededDocIds[7]]);

    const summary = aggregate(metrics);
    const report = {
      runAt: new Date().toISOString(),
      summary,
      details: metrics,
    };
    fs.mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
    fs.writeFileSync(
      path.join(process.cwd(), "test-results", "private-doc-ops-perf-summary.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );

    console.log("Private ops perf summary:", JSON.stringify(summary, null, 2));
    console.log("Private ops perf details:", JSON.stringify(metrics, null, 2));
    expect(summary.length).toBeGreaterThanOrEqual(7);
  });
});
