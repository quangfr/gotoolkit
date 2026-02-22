import { expect, test } from "@playwright/test";

function tokenFromDocId(docId: string) {
  return String(docId || "").replace(/^share:/, "").trim();
}

test.describe("Cloud local-first sync stress", () => {
  test("stresses manual and reload sync with higher operation count", async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000";
    const prefix = `sync-stress-${Date.now()}`;
    const createdDocIds: string[] = [];
    const operationCount = 12;

    page.on("dialog", async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        // ignore
      }
    });

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.isReady), null, { timeout: 45_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.getRecordsByApp), null, { timeout: 45_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout: 45_000 });

    const isPanelOpen = await page.evaluate(
      () => !document.querySelector("#documentExplorer")?.classList.contains("document-explorer--collapsed")
    );
    if (!isPanelOpen) await page.click("#documentExplorerToggle");

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    });
    await page.waitForFunction(
      () => Boolean(document.querySelector(".document-explorer__section-body[data-section^='shared:']")),
      null,
      { timeout: 30_000 }
    );

    const sharedSection = await page.evaluate(() => {
      const body = document.querySelector(".document-explorer__section-body[data-section^='shared:']") as HTMLElement | null;
      return String(body?.dataset?.section || "").trim();
    });
    expect(sharedSection).toBeTruthy();

    const clickSectionAdd = async () => {
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const addBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action") as HTMLButtonElement | null;
        addBtn?.click();
      }, sharedSection);
    };

    const clickSectionRefresh = async () => {
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const refreshBtn = root?.querySelector(
          '.document-explorer__section-actions .document-explorer__item-action[title="Rafraîchir cet espace"]'
        ) as HTMLButtonElement | null;
        refreshBtn?.click();
      }, sharedSection);
    };

    const createSharedDoc = async () => {
      const beforeTokens = await page.evaluate(async () => {
        const records = await (window as any).goToolkitShareHistory?.getRecordsByApp?.("memo");
        return (records || []).map((r: any) => String(r?.token || "")).filter(Boolean);
      });
      await clickSectionAdd();
      const token = await expect
        .poll(async () => {
          return await page.evaluate(async (before) => {
            const seen = new Set(before || []);
            const records = await (window as any).goToolkitShareHistory?.getRecordsByApp?.("memo");
            const found = (records || []).find((r: any) => {
              const t = String(r?.token || "");
              return t && !seen.has(t);
            });
            return String(found?.token || "");
          }, beforeTokens);
        }, { timeout: 25_000, intervals: [250, 500, 1000] })
        .not.toBe("")
        .then(async () => {
          return await page.evaluate(async (before) => {
            const seen = new Set(before || []);
            const records = await (window as any).goToolkitShareHistory?.getRecordsByApp?.("memo");
            const found = (records || []).find((r: any) => {
              const t = String(r?.token || "");
              return t && !seen.has(t);
            });
            return String(found?.token || "");
          }, beforeTokens);
        });
      const docId = `share:${token}`;
      createdDocIds.push(docId);
      return docId;
    };

    const getRemote = async (docId: string) => {
      const token = tokenFromDocId(docId);
      return await page.evaluate(async (docToken) => {
        const worker = (window as any).goToolkitShareWorker;
        const data = await worker.fetchSharePayload("memos", docToken);
        return {
          title: String(data?.payload?.tabs?.[0]?.title || ""),
          parentId: String(data?.payload?.parentId || ""),
          updatedAt: String(data?.meta?.updatedAt || "")
        };
      }, token);
    };

    const allDocsMatch = async (expectedMap: Map<string, { title: string; parentId: string }>, timeoutMs = 30_000) => {
      const startedAt = Date.now();
      while ((Date.now() - startedAt) < timeoutMs) {
        let ok = true;
        for (const [docId, expected] of expectedMap.entries()) {
          const remote = await getRemote(docId);
          if (!(remote.title === expected.title && remote.parentId === expected.parentId)) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
        await page.waitForTimeout(900);
      }
      return false;
    };

    const setLocalShared = async (
      docId: string,
      patch: { title?: string; content?: string; parentId?: string; position?: number; updatedAtMs?: number }
    ) => {
      const token = tokenFromDocId(docId);
      await page.evaluate(async ({ docToken, next }) => {
        const history = (window as any).goToolkitShareHistory;
        const explorer = (window as any).GoToolkitMemoDocumentExplorer;
        const records = await history.getRecordsByApp("memo");
        const record = (records || []).find((r: any) => String(r?.token || "") === String(docToken || ""));
        if (!record) throw new Error(`Missing local shared record: ${docToken}`);
        const payload = { ...(record.payload || {}) };
        const tabs = Array.isArray(payload.tabs) ? payload.tabs.slice() : [];
        if (!tabs.length) {
          tabs.push({
            id: `${Date.now()}-${Math.random()}`,
            title: "New page",
            description: "",
            superpowers: [],
            content: "",
            metadata: {}
          });
        }
        if (typeof next.title === "string") tabs[0] = { ...(tabs[0] || {}), title: next.title };
        if (typeof next.content === "string") tabs[0] = { ...(tabs[0] || {}), content: next.content };
        payload.tabs = tabs;
        if (Object.prototype.hasOwnProperty.call(next, "parentId")) payload.parentId = String(next.parentId || "");
        if (typeof next.position === "number") payload.position = next.position;
        const updatedAt = new Date(
          Number.isFinite(Number(next.updatedAtMs)) ? Number(next.updatedAtMs) : Date.now()
        ).toISOString();
        await history.upsertRecord("memo", {
          ...record,
          token: docToken,
          title: typeof next.title === "string" ? next.title : String(record.title || ""),
          payload,
          parentId: Object.prototype.hasOwnProperty.call(next, "parentId")
            ? String(next.parentId || "")
            : String(record.parentId || ""),
          position: typeof next.position === "number" ? next.position : record.position,
          updatedAt
        });
        await explorer?.upsertItem?.({
          id: `share:${docToken}`,
          token: docToken,
          title: typeof next.title === "string" ? next.title : String(record.title || ""),
          payload,
          parentId: Object.prototype.hasOwnProperty.call(next, "parentId")
            ? String(next.parentId || "")
            : String(record.parentId || ""),
          position: typeof next.position === "number" ? next.position : record.position,
          isShared: true,
          section: String(record.section || "")
        });
      }, { docToken: token, next: patch });
    };

    try {
      const parentDoc = await createSharedDoc();
      const docs: string[] = [parentDoc];
      for (let i = 0; i < 4; i += 1) {
        docs.push(await createSharedDoc());
      }

      const expectedAfterManual = new Map<string, { title: string; parentId: string }>();
      let manualClock = Date.now() + 20_000;
      for (let i = 0; i < operationCount; i += 1) {
        const targetDoc = docs[(i % (docs.length - 1)) + 1];
        const parentDocId = i % 3 === 0 ? parentDoc : "";
        const title = `${prefix}-m-${String(i + 1).padStart(2, "0")}`;
        const parentId = parentDocId ? `share:${tokenFromDocId(parentDocId)}` : "";
        manualClock += 11;
        await setLocalShared(targetDoc, {
          title,
          content: `manual-${i}-${Date.now()}`,
          parentId,
          position: Date.now() + i,
          updatedAtMs: manualClock
        });
        expectedAfterManual.set(targetDoc, { title, parentId });
      }

      for (const [docId, expected] of expectedAfterManual.entries()) {
        const remote = await getRemote(docId);
        expect(remote.title).not.toBe(expected.title);
      }

      let manualSynced = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await clickSectionRefresh();
        manualSynced = await allDocsMatch(expectedAfterManual, 45_000);
        if (manualSynced) break;
      }
      expect(manualSynced).toBe(true);

      const expectedAfterReload = new Map<string, { title: string; parentId: string }>();
      let reloadClock = Date.now() + 120_000;
      for (let i = 0; i < operationCount; i += 1) {
        const targetDoc = docs[(i % (docs.length - 1)) + 1];
        const parentDocId = i % 2 === 0 ? parentDoc : "";
        const title = `${prefix}-r-${String(i + 1).padStart(2, "0")}`;
        const parentId = parentDocId ? `share:${tokenFromDocId(parentDocId)}` : "";
        reloadClock += 17;
        await setLocalShared(targetDoc, {
          title,
          content: `reload-${i}-${Date.now()}`,
          parentId,
          position: Date.now() + 10_000 + i,
          updatedAtMs: reloadClock
        });
        expectedAfterReload.set(targetDoc, { title, parentId });
      }

      for (const [docId, expected] of expectedAfterReload.entries()) {
        const remote = await getRemote(docId);
        expect(remote.title).not.toBe(expected.title);
      }

      let reloadSynced = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.reload({ waitUntil: "load" });
        await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.isReady), null, { timeout: 45_000 });
        await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.getRecordsByApp), null, { timeout: 45_000 });
        reloadSynced = await allDocsMatch(expectedAfterReload, 50_000);
        if (reloadSynced) break;
      }
      expect(reloadSynced).toBe(true);
    } finally {
      await page.evaluate(async (ids) => {
        const worker = (window as any).goToolkitShareWorker;
        await Promise.all(
          (ids || []).map(async (docId: string) => {
            const token = String(docId || "").replace(/^share:/, "").trim();
            if (!token) return;
            try {
              await worker.deleteSharePayload("memos", token);
            } catch {
              // ignore
            }
          })
        );
      }, createdDocIds);
    }
  });
});
