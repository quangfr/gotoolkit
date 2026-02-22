import { expect, test } from "@playwright/test";

function tokenFromDocId(docId: string) {
  return String(docId || "").replace(/^share:/, "").trim();
}

test.describe("Cloud sync across two browser instances", () => {
  test("syncs tree and page ops with manual refresh and browser restart", async ({ browser }) => {
    test.setTimeout(10 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000/index.html";
    const prefix = `two-inst-${Date.now()}`;
    const createdDocIds: string[] = [];

    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();

    const initPage = async (page: any) => {
      page.on("dialog", async (dialog: any) => {
        try {
          await dialog.accept();
        } catch {
          // ignore
        }
      });
      await page.goto(baseUrl, { waitUntil: "load" });
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
      return await page.evaluate(() => {
        const body = document.querySelector(".document-explorer__section-body[data-section^='shared:']") as HTMLElement | null;
        return String(body?.dataset?.section || "").trim();
      });
    };

    const clickSectionAction = async (page: any, sectionName: string, title: string) => {
      await page.evaluate(({ sectionName, title }) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const button = root?.querySelector(
          `.document-explorer__section-actions .document-explorer__item-action[title="${title}"]`
        ) as HTMLButtonElement | null;
        button?.click();
      }, { sectionName, title });
    };

    const createSharedDoc = async (page: any, sectionName: string) => {
      const beforeTokens = await page.evaluate(async () => {
        const records = await (window as any).goToolkitShareHistory?.getRecordsByApp?.("memo");
        return (records || []).map((r: any) => String(r?.token || "")).filter(Boolean);
      });
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const addBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action") as HTMLButtonElement | null;
        addBtn?.click();
      }, sectionName);
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

    const setLocalShared = async (
      page: any,
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

    const getRemote = async (page: any, docId: string) => {
      const token = tokenFromDocId(docId);
      return await page.evaluate(async (docToken) => {
        const worker = (window as any).goToolkitShareWorker;
        const data = await worker.fetchSharePayload("memos", docToken);
        return {
          title: String(data?.payload?.tabs?.[0]?.title || ""),
          content: String(data?.payload?.tabs?.[0]?.content || ""),
          parentId: String(data?.payload?.parentId || ""),
          position: Number(data?.payload?.position || 0)
        };
      }, token);
    };

    try {
      const sharedSectionA = await initPage(pageA);
      const sharedSectionB = await initPage(pageB);
      expect(sharedSectionA).toBeTruthy();
      expect(sharedSectionB).toBeTruthy();

      const rootParent = await createSharedDoc(pageA, sharedSectionA);
      const pageA1 = await createSharedDoc(pageA, sharedSectionA);
      const pageA2 = await createSharedDoc(pageA, sharedSectionA);

      const parentToken = tokenFromDocId(rootParent);
      const expectedParentId = `share:${parentToken}`;
      let t = Date.now() + 10_000;

      // create root with content + rename
      t += 11;
      await setLocalShared(pageA, rootParent, {
        title: `${prefix}-parent`,
        content: `${prefix} parent content`,
        parentId: "",
        position: 1000,
        updatedAtMs: t
      });
      t += 11;
      await setLocalShared(pageA, pageA1, {
        title: `${prefix}-child-1`,
        content: `${prefix} child 1 content v1`,
        parentId: "",
        position: 2000,
        updatedAtMs: t
      });
      t += 11;
      await setLocalShared(pageA, pageA2, {
        title: `${prefix}-child-2`,
        content: `${prefix} child 2 content v1`,
        parentId: "",
        position: 3000,
        updatedAtMs: t
      });

      // move page into parent + edit + reorder
      t += 11;
      await setLocalShared(pageA, pageA1, {
        parentId: expectedParentId,
        position: 1100,
        updatedAtMs: t
      });
      t += 11;
      await setLocalShared(pageA, pageA2, {
        parentId: expectedParentId,
        position: 1200,
        updatedAtMs: t
      });
      t += 11;
      await setLocalShared(pageA, pageA1, {
        title: `${prefix}-child-1-renamed`,
        content: `${prefix} child 1 content v2`,
        updatedAtMs: t
      });
      // reorder: child-2 before child-1
      t += 11;
      await setLocalShared(pageA, pageA2, {
        position: 1050,
        updatedAtMs: t
      });

      // Manual sync in instance A
      await clickSectionAction(pageA, sharedSectionA, "Rafraîchir cet espace");

      // Verify remote from A
      await expect.poll(async () => await getRemote(pageA, pageA1), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-1-renamed`,
        content: `${prefix} child 1 content v2`,
        parentId: expectedParentId
      });
      await expect.poll(async () => await getRemote(pageA, pageA2), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-2`,
        parentId: expectedParentId
      });

      // Sync instance B manually and verify same tree/page state
      await clickSectionAction(pageB, sharedSectionB, "Rafraîchir cet espace");
      await expect.poll(async () => await getRemote(pageB, pageA1), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-1-renamed`,
        content: `${prefix} child 1 content v2`,
        parentId: expectedParentId
      });
      await expect.poll(async () => await getRemote(pageB, pageA2), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-2`,
        parentId: expectedParentId
      });

      const remoteA1 = await getRemote(pageB, pageA1);
      const remoteA2 = await getRemote(pageB, pageA2);
      expect(remoteA2.position).toBeLessThan(remoteA1.position);

      // Browser restart (instance B)
      await ctxB.close();
      const ctxB2 = await browser.newContext();
      const pageB2 = await ctxB2.newPage();
      const sharedSectionB2 = await initPage(pageB2);
      await clickSectionAction(pageB2, sharedSectionB2, "Rafraîchir cet espace");

      await expect.poll(async () => await getRemote(pageB2, pageA1), { timeout: 75_000 }).toMatchObject({
        title: `${prefix}-child-1-renamed`,
        content: `${prefix} child 1 content v2`,
        parentId: expectedParentId
      });
      await expect.poll(async () => await getRemote(pageB2, pageA2), { timeout: 75_000 }).toMatchObject({
        title: `${prefix}-child-2`,
        parentId: expectedParentId
      });

      await ctxB2.close();
    } finally {
      try {
        await pageA.evaluate(async (ids) => {
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
      } catch {
        // ignore
      }
      await ctxA.close();
      try {
        await ctxB.close();
      } catch {
        // ignore
      }
    }
  });
});
