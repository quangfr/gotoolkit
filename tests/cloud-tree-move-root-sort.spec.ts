import { expect, test } from "@playwright/test";

function tokenFromDocId(docId: string) {
  return String(docId || "").replace(/^share:/, "").trim();
}

test.describe("Cloud tree ops - parent/root/sort persistence", () => {
  test("persists move to parent, reorder, and move back to root", async ({ page }) => {
    test.setTimeout(8 * 60 * 1000);
    const baseUrl = "http://127.0.0.1:5000/index.html";
    const prefix = `tree-root-${Date.now()}`;
    const createdDocIds: string[] = [];

    page.on("dialog", async (dialog) => {
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
    const sharedSection = await page.evaluate(() => {
      const body = document.querySelector(".document-explorer__section-body[data-section^='shared:']") as HTMLElement | null;
      return String(body?.dataset?.section || "").trim();
    });
    expect(sharedSection).toBeTruthy();

    const clickSectionAction = async (title: string) => {
      await page.evaluate(({ sectionName, title }) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const button = root?.querySelector(
          `.document-explorer__section-actions .document-explorer__item-action[title="${title}"]`
        ) as HTMLButtonElement | null;
        button?.click();
      }, { sectionName: sharedSection, title });
    };

    const createSharedDoc = async () => {
      const beforeTokens = await page.evaluate(async () => {
        const records = await (window as any).goToolkitShareHistory?.getRecordsByApp?.("memo");
        return (records || []).map((r: any) => String(r?.token || "")).filter(Boolean);
      });
      await page.evaluate((sectionName) => {
        const body = document.querySelector(`.document-explorer__section-body[data-section="${sectionName}"]`) as HTMLElement | null;
        const root = body?.closest(".document-explorer__section") as HTMLElement | null;
        const addBtn = root?.querySelector(".document-explorer__section-actions .document-explorer__item-action") as HTMLButtonElement | null;
        addBtn?.click();
      }, sharedSection);
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

    const setCloudSharedMeta = async (
      docId: string,
      patch: { title?: string; parentId?: string; position?: number; updatedAtMs?: number }
    ) => {
      const token = tokenFromDocId(docId);
      await page.evaluate(async ({ docToken, next }) => {
        const worker = (window as any).goToolkitShareWorker;
        const existing = await worker.fetchSharePayload("memos-meta", docToken).catch(() => null);
        const current = existing?.payload && typeof existing.payload === "object" ? existing.payload : {};
        const position =
          typeof next.position === "number"
            ? next.position
            : (Number.isFinite(Number(current.position)) ? Number(current.position) : Date.now());
        const savePayload = {
          title: typeof next.title === "string" ? next.title : String(current.title || "Document partagé"),
          description: String(current.description || ""),
          icon: String(current.icon || "file-symlink"),
          superpowers: Array.isArray(current.superpowers) ? current.superpowers : [],
          parentId: Object.prototype.hasOwnProperty.call(next, "parentId")
            ? String(next.parentId || "")
            : String(current.parentId || ""),
          spaceId: String(current.spaceId || "golive"),
          status: String(current.status || "active"),
          position
        };
        let lastError: any = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            await worker.saveSharePayload("memos-meta", docToken, savePayload);
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            const message = String(err?.message || err || "");
            if (!/Trop de requêtes d'écriture/i.test(message) || attempt === 5) {
              throw err;
            }
            const waitMs = 300 + (attempt * 300);
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
        }
        if (lastError) throw lastError;
      }, { docToken: token, next: patch });
    };

    const getRemoteMeta = async (docId: string) => {
      const token = tokenFromDocId(docId);
      return await page.evaluate(async (docToken) => {
        const worker = (window as any).goToolkitShareWorker;
        const data = await worker.fetchSharePayload("memos-meta", docToken);
        if (!data?.payload) {
          return {
            exists: false,
            title: "",
            parentId: "",
            position: 0
          };
        }
        return {
          exists: true,
          title: String(data?.payload?.title || ""),
          parentId: String(data?.payload?.parentId || ""),
          position: Number(data?.payload?.position || 0)
        };
      }, token);
    };

    const deleteCloudDoc = async (docId: string) => {
      const token = tokenFromDocId(docId);
      await page.evaluate(async (docToken) => {
        const worker = (window as any).goToolkitShareWorker;
        let lastError: any = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            await worker.deleteSharePayload("memos", docToken).catch(() => null);
            await worker.deleteSharePayload("memos-meta", docToken).catch(() => null);
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            const message = String(err?.message || err || "");
            if (!/Trop de requêtes d'écriture/i.test(message) || attempt === 5) {
              throw err;
            }
            const waitMs = 300 + (attempt * 300);
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
        }
        if (lastError) throw lastError;
      }, token);
    };

    try {
      const parentDoc = await createSharedDoc();
      const childA = await createSharedDoc();
      const childB = await createSharedDoc();
      const rootExtra = await createSharedDoc();
      const childC = await createSharedDoc();
      const parentId = `share:${tokenFromDocId(parentDoc)}`;
      let t = Date.now() + 20_000;

      // Baseline root titles/order.
      t += 11;
      await setCloudSharedMeta(parentDoc, { title: `${prefix}-parent`, parentId: "", position: 1000, updatedAtMs: t });
      t += 11;
      await setCloudSharedMeta(childA, { title: `${prefix}-child-a`, parentId: "", position: 2000, updatedAtMs: t });
      t += 11;
      await setCloudSharedMeta(childB, { title: `${prefix}-child-b`, parentId: "", position: 3000, updatedAtMs: t });

      // Move children under parent and set sort (B before A).
      t += 11;
      await setCloudSharedMeta(childA, { parentId, position: 2200, updatedAtMs: t });
      t += 11;
      await setCloudSharedMeta(childB, { parentId, position: 2100, updatedAtMs: t });
      t += 11;
      await setCloudSharedMeta(rootExtra, { title: `${prefix}-root-extra`, parentId: "", position: 4000, updatedAtMs: t });
      t += 11;
      await setCloudSharedMeta(childC, { title: `${prefix}-child-c`, parentId, position: 2050, updatedAtMs: t });
      await clickSectionAction("Rafraîchir cet espace");

      await expect.poll(async () => getRemoteMeta(childA), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-a`,
        parentId
      });
      await expect.poll(async () => getRemoteMeta(childB), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-b`,
        parentId
      });
      const nestedA = await getRemoteMeta(childA);
      const nestedB = await getRemoteMeta(childB);
      const nestedC = await getRemoteMeta(childC);
      expect(nestedB.position).toBeLessThan(nestedA.position);
      expect(nestedC.position).toBeLessThan(nestedB.position);

      // Rename in metadata and verify.
      t += 11;
      await setCloudSharedMeta(childB, { title: `${prefix}-child-b-renamed`, updatedAtMs: t });
      await clickSectionAction("Rafraîchir cet espace");
      await expect.poll(async () => getRemoteMeta(childB), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-b-renamed`,
        parentId
      });

      // Move A back to root and put it before parent by position.
      t += 11;
      await setCloudSharedMeta(childA, { parentId: "", position: 900, updatedAtMs: t });
      await clickSectionAction("Rafraîchir cet espace");

      await expect.poll(async () => getRemoteMeta(childA), { timeout: 60_000 }).toMatchObject({
        title: `${prefix}-child-a`,
        parentId: ""
      });
      const rootA = await getRemoteMeta(childA);
      const rootParent = await getRemoteMeta(parentDoc);
      expect(rootA.position).toBeLessThan(rootParent.position);

      // Delete single page and verify persistence.
      await deleteCloudDoc(childA);
      await clickSectionAction("Rafraîchir cet espace");
      await expect.poll(async () => getRemoteMeta(childA), { timeout: 60_000 }).toMatchObject({
        exists: false
      });

      // Delete multiple pages and verify persistence.
      await deleteCloudDoc(childB);
      await deleteCloudDoc(childC);
      await clickSectionAction("Rafraîchir cet espace");
      await expect.poll(async () => getRemoteMeta(childB), { timeout: 60_000 }).toMatchObject({
        exists: false
      });
      await expect.poll(async () => getRemoteMeta(childC), { timeout: 60_000 }).toMatchObject({
        exists: false
      });

      // Reload and re-check persistence.
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.isReady), null, { timeout: 45_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.getRecordsByApp), null, { timeout: 45_000 });
      await clickSectionAction("Rafraîchir cet espace");

      await expect.poll(async () => getRemoteMeta(childA), { timeout: 60_000 }).toMatchObject({
        exists: false
      });
      await expect.poll(async () => getRemoteMeta(childB), { timeout: 60_000 }).toMatchObject({
        exists: false
      });
      await expect.poll(async () => getRemoteMeta(childC), { timeout: 60_000 }).toMatchObject({
        exists: false
      });
      await expect.poll(async () => getRemoteMeta(rootExtra), { timeout: 60_000 }).toMatchObject({
        exists: true,
        parentId: "",
        title: `${prefix}-root-extra`
      });
      await expect.poll(async () => getRemoteMeta(parentDoc), { timeout: 60_000 }).toMatchObject({
        exists: true
      });
    } finally {
      for (const docId of createdDocIds) {
        const token = tokenFromDocId(docId);
        await page.evaluate(async (docToken) => {
          const worker = (window as any).goToolkitShareWorker;
          const history = (window as any).goToolkitShareHistory;
          if (!worker?.isReady) return;
          await worker.deleteSharePayload("memos", docToken).catch(() => null);
          await worker.deleteSharePayload("memos-meta", docToken).catch(() => null);
          await history?.removeRecord?.("memo", docToken).catch?.(() => null);
        }, token);
      }
      await page.evaluate(async () => {
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      });
    }
  });
});
