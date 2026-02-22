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
  cloudMs: number;
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
      const cloud = rows.map((row) => row.cloudMs);
      return {
        operation,
        runs: rows.length,
        uiMeanMs: Math.round(mean(ui)),
        uiP95Ms: Math.round(percentile(ui, 95)),
        cloudMeanMs: Math.round(mean(cloud)),
        cloudP95Ms: Math.round(percentile(cloud, 95)),
      };
    })
    .sort((a, b) => b.cloudP95Ms - a.cloudP95Ms);
}

function tokenFromDocId(docId: string) {
  return String(docId || "").replace(/^share:/, "").trim();
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
  const fallback = "Cloud perf sample page content.";
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

test.describe("Cloud same-doc-ops performance", () => {
  test("runs same ops on own 40 cloud docs and cleans up with multi-delete", async ({ page }) => {
    test.setTimeout(25 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";
    const metrics: Metric[] = [];
    const createdDocIds: string[] = [];
    const samples = readSampleCorpus();
    const prefix = `perf-cloud-${Date.now()}`;

    page.on("dialog", async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        // ignore
      }
    });

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.isReady), null, { timeout: 45_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.getRecordsByApp), null, { timeout: 45_000 });
    await page.waitForFunction(() => typeof (window as any).GoToolkitMemoGetActiveDocumentId === "function", null, { timeout: 45_000 });

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });
    await page.waitForFunction(
      () => Boolean(document.querySelector(".document-explorer__section-body[data-section^='shared:']")),
      null,
      { timeout: 30_000 }
    );

    const isPanelOpen = await page.evaluate(() => !document.querySelector("#documentExplorer")?.classList.contains("document-explorer--collapsed"));
    if (!isPanelOpen) await page.click("#documentExplorerToggle");

    const sharedSection = await page.evaluate(() => {
      const body = document.querySelector(".document-explorer__section-body[data-section^='shared:']") as HTMLElement | null;
      return String(body?.dataset?.section || "").trim();
    });
    expect(sharedSection).toBeTruthy();

    const docItem = (docId: string) =>
      page.locator(`.document-explorer__section-body[data-section="${sharedSection}"] .document-explorer__item[data-document-id="${docId}"]`).first();

    const waitRemote = async (token: string, predicate: (payload: any) => boolean, timeout = 45_000) => {
      await expect.poll(async () => {
        return await page.evaluate(
          async ({ docToken, predSrc }) => {
            const worker = (window as any).goToolkitShareWorker;
            const data = await worker.fetchSharePayload("memos", docToken);
            const fn = new Function("payload", `return (${predSrc})(payload);`);
            return Boolean(fn(data?.payload));
          },
          { docToken: token, predSrc: predicate.toString() }
        );
      }, { timeout, intervals: [250, 500, 1000] }).toBe(true);
    };

    const setDocTitleAndContent = async (docId: string, title: string, content: string) => {
      const token = tokenFromDocId(docId);
      await page.evaluate(
        async ({ docToken, nextTitle, nextContent }) => {
          const worker = (window as any).goToolkitShareWorker;
          const history = (window as any).goToolkitShareHistory;
          const existing = await worker.fetchSharePayload("memos", docToken);
          const payload = existing?.payload || {};
          const tabs = Array.isArray(payload.tabs) ? payload.tabs.slice() : [];
          if (!tabs.length) {
            tabs.push({
              id: `${Date.now()}-${Math.random()}`,
              title: nextTitle,
              description: "",
              superpowers: [],
              content: nextContent,
              metadata: {}
            });
          } else {
            tabs[0] = {
              ...(tabs[0] || {}),
              title: nextTitle,
              content: nextContent
            };
          }
          const nextPayload = {
            ...payload,
            tabs,
            activeTabId: payload.activeTabId || tabs[0].id
          };
          const meta = await worker.saveSharePayload("memos", docToken, nextPayload);
          const records = await history.getRecordsByApp("memo");
          const rec = (records || []).find((r: any) => String(r?.token || "") === docToken);
          await history.upsertRecord("memo", {
            ...(rec || {}),
            token: docToken,
            title: nextTitle,
            payload: nextPayload,
            updatedAt: meta?.updatedAt || new Date().toISOString()
          });
          await (window as any).GoToolkitMemoDocumentExplorer?.upsertItem?.({
            id: `share:${docToken}`,
            token: docToken,
            title: nextTitle,
            payload: nextPayload,
            isShared: true,
            section: String((window as any).GoToolkitMemoDocumentExplorer?.getItemsSnapshot?.()
              ?.find((x: any) => String(x?.id || "") === `share:${docToken}`)?.section || "")
          });
        },
        { docToken: token, nextTitle: title, nextContent: content }
      );
      await waitRemote(token, (p: any) => String(p?.tabs?.[0]?.title || "") === String(title));
    };

    const addRoot = async (index: number) => {
      const start = Date.now();
      const prev = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const addBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action") as HTMLButtonElement | null;
        addBtn?.click();
      }, sharedSection);
      await page.waitForFunction((previous) => {
        const id = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
        return Boolean(id) && id !== String(previous || "") && id.startsWith("share:");
      }, prev, { timeout: 45_000 });
      const docId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
      createdDocIds.push(docId);
      const token = tokenFromDocId(docId);
      const uiMs = Date.now() - start;
      await waitRemote(token, (p: any) => Boolean(p));
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "add_root", uiMs, cloudMs, details: { docId, index } });
      return docId;
    };

    const addInParent = async (parentDocId: string) => {
      const start = Date.now();
      const addChildBtn = page.locator(
        `.document-explorer__section-body[data-section="${sharedSection}"] .document-explorer__item[data-document-id="${parentDocId}"] .document-explorer__item-action[title="Créer une sous-page"]`
      ).first();
      await docItem(parentDocId).hover();
      await addChildBtn.click({ force: true });
      const childToken = await expect.poll(async () => {
        return await page.evaluate(async (pid) => {
          const history = (window as any).goToolkitShareHistory;
          const records = await history.getRecordsByApp("memo");
          const parentToken = String(pid || "").replace(/^share:/, "");
          const found = (records || []).find((r: any) => {
            const p = String(r?.parentId || "");
            return p === `share:${parentToken}` || p === parentToken;
          });
          return String(found?.token || "");
        }, parentDocId);
      }, { timeout: 45_000, intervals: [300, 600, 1000] }).not.toBe("");

      const token = await page.evaluate(async (pid) => {
        const history = (window as any).goToolkitShareHistory;
        const records = await history.getRecordsByApp("memo");
        const parentToken = String(pid || "").replace(/^share:/, "");
        const matches = (records || []).filter((r: any) => {
          const p = String(r?.parentId || "");
          return p === `share:${parentToken}` || p === parentToken;
        });
        matches.sort((a: any, b: any) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
        return String(matches[0]?.token || "");
      }, parentDocId);
      const childDocId = `share:${token}`;
      createdDocIds.push(childDocId);
      const uiMs = Date.now() - start;
      const expectedParent = `share:${tokenFromDocId(parentDocId)}`;
      await waitRemote(token, (p: any) => {
        const v = String(p?.parentId || "");
        return v === expectedParent || v === expectedParent.replace(/^share:/, "");
      });
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "add_in_parent", uiMs, cloudMs, details: { parentDocId, childDocId } });
      return childDocId;
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
      const token = tokenFromDocId(docId);
      await waitRemote(token, (p: any) => String(p?.tabs?.[0]?.title || "") === String(nextName), 60_000);
      const uiMs = Date.now() - start;
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "rename", uiMs, cloudMs, details: { docId, nextName } });
    };

    const moveSorting = async (movingDocId: string, beforeDocId: string) => {
      const start = Date.now();
      const moving = docItem(movingDocId);
      const before = docItem(beforeDocId);
      await moving.hover();
      await moving.dragTo(before, { targetPosition: { x: 30, y: 3 } });
      const movingToken = tokenFromDocId(movingDocId);
      const beforeToken = tokenFromDocId(beforeDocId);
      await waitRemote(movingToken, (_p: any) => true);
      await waitRemote(beforeToken, (_p: any) => true);
      const uiMs = Date.now() - start;
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "move_sorting", uiMs, cloudMs, details: { movingDocId, beforeDocId } });
    };

    const moveInParent = async (childDocId: string, parentDocId: string) => {
      const start = Date.now();
      const child = docItem(childDocId);
      const parent = docItem(parentDocId);
      await child.hover();
      await child.dragTo(parent, { targetPosition: { x: 30, y: 14 } });
      const childToken = tokenFromDocId(childDocId);
      const expectedParent = `share:${tokenFromDocId(parentDocId)}`;
      await waitRemote(childToken, (p: any) => {
        const v = String(p?.parentId || "");
        return v === expectedParent || v === expectedParent.replace(/^share:/, "");
      });
      const uiMs = Date.now() - start;
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "move_in_parent", uiMs, cloudMs, details: { childDocId, parentDocId } });
    };

    const deleteOne = async (docId: string) => {
      const start = Date.now();
      const row = docItem(docId);
      await row.hover();
      await row.locator(".document-explorer__delete").click();
      await expect(row).toHaveCount(0, { timeout: 30_000 });
      const token = tokenFromDocId(docId);
      await expect.poll(async () => {
        return await page.evaluate(async (docToken) => {
          const worker = (window as any).goToolkitShareWorker;
          return (await worker.fetchSharePayload("memos", docToken)) === null;
        }, token);
      }, { timeout: 60_000, intervals: [250, 500, 1000] }).toBe(true);
      const uiMs = Date.now() - start;
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "delete", uiMs, cloudMs, details: { docId } });
    };

    const multiSelectDelete = async (docIds: string[]) => {
      const start = Date.now();
      for (let i = 0; i < docIds.length; i += 1) {
        const row = docItem(docIds[i]);
        await expect(row).toHaveCount(1, { timeout: 20_000 });
        if (i === 0) await row.click();
        else await row.click({ modifiers: ["Control"] });
      }
      await docItem(docIds[0]).hover();
      await docItem(docIds[0]).locator(".document-explorer__delete").click();
      await expect.poll(async () => {
        return await page.evaluate((ids) => ids.every((id: string) => !document.querySelector(`.document-explorer__item[data-document-id="${id}"]`)), docIds);
      }, { timeout: 45_000, intervals: [250, 500, 1000] }).toBe(true);
      await expect.poll(async () => {
        return await page.evaluate(async (ids) => {
          const worker = (window as any).goToolkitShareWorker;
          const checks = await Promise.all(ids.map((id: string) => worker.fetchSharePayload("memos", String(id).replace(/^share:/, ""))));
          return checks.every((item: any) => item === null);
        }, docIds);
      }, { timeout: 60_000, intervals: [250, 500, 1000] }).toBe(true);
      const uiMs = Date.now() - start;
      const cloudMs = Date.now() - start;
      metrics.push({ operation: "multi_select_delete", uiMs, cloudMs, details: { docIds } });
    };

    try {
      const roots: string[] = [];
      for (let i = 1; i <= 40; i += 1) {
        const rootId = await addRoot(i);
        roots.push(rootId);
        const title = `${prefix}-${String(i).padStart(2, "0")}`;
        const content = samples[(i - 1) % samples.length];
        await setDocTitleAndContent(rootId, title, content);
      }

      const parentId = roots[0];
      const root2 = roots[1];
      const root3 = roots[2];
      const root4 = roots[3];
      const root5 = roots[4];

      const childId = await addInParent(parentId);
      await renameDoc(root2, `${prefix}-renamed`);
      await moveSorting(root5, root4);
      await moveInParent(root2, parentId);
      await deleteOne(root3);
      await multiSelectDelete([roots[5], roots[6], roots[7]]);
      createdDocIds.push(childId);
    } finally {
      // Cleanup: delete only docs created by this test using multi-delete batches.
      await page.evaluate(async () => {
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      }).catch(() => null);
      const uniqueCreated = Array.from(new Set(createdDocIds.filter(Boolean)));
      const leftovers = [];
      for (const id of uniqueCreated) {
        const exists = await page.evaluate(async (docId) => {
          const token = String(docId || "").replace(/^share:/, "");
          const worker = (window as any).goToolkitShareWorker;
          return Boolean(await worker.fetchSharePayload("memos", token));
        }, id).catch(() => false);
        if (exists) leftovers.push(id);
      }
      for (let i = 0; i < leftovers.length; i += 5) {
        const batch = leftovers.slice(i, i + 5);
        if (!batch.length) continue;
        try {
          for (let j = 0; j < batch.length; j += 1) {
            const row = docItem(batch[j]);
            if (await row.count()) {
              if (j === 0) await row.click();
              else await row.click({ modifiers: ["Control"] });
            }
          }
          await docItem(batch[0]).hover();
          await docItem(batch[0]).locator(".document-explorer__delete").click();
          await page.waitForTimeout(400);
        } catch {
          // ignore cleanup errors
        }
      }
    }

    const summary = aggregate(metrics);
    const report = {
      runAt: new Date().toISOString(),
      summary,
      details: metrics
    };
    fs.mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });
    fs.writeFileSync(
      path.join(process.cwd(), "test-results", "cloud-doc-ops-same-perf-summary.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );

    console.log("Cloud same ops perf summary:", JSON.stringify(summary, null, 2));
    console.log("Cloud same ops perf details:", JSON.stringify(metrics, null, 2));
    expect(summary.length).toBeGreaterThanOrEqual(7);
  });
});

