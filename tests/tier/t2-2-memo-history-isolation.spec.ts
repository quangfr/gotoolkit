import { expect, test } from "@playwright/test";
import {
  clickMemoDoc,
  getMemoEditorHtml,
  waitForMemoReady
} from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test.describe("Memo history isolation", () => {
  test("restores and duplicates the selected page history without leaking another page content", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("memo-history-isolation");

    attachPageDebugLogging(page, "memo-history-isolation");

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    logStep("memo-ready");

    logStep("seed-docs:start");
    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const docAId = docApi?.generateId?.() || `history-a-${ts}`;
      const docBId = docApi?.generateId?.() || `history-b-${ts}`;
      const docAEdit1 = `DOC_A_EDIT_1_${ts}`;
      const docAEdit2 = `DOC_A_EDIT_2_${ts}`;
      const docBEdit = `DOC_B_EDIT_${ts}`;
      await docApi?.upsertRecord?.({
        id: docAId,
        app: "memo",
        title: `PW History A ${ts}`,
        payload: {
          tabs: [{ id: `tab-${docAId}`, title: `PW History A ${ts}`, description: "", superpowers: [], content: `<p>DOC_A_BASE_${ts} ${docAEdit2}</p>` }],
          activeTabId: `tab-${docAId}`
        },
        updatedAt: new Date().toISOString()
      });
      await docApi?.upsertRecord?.({
        id: docBId,
        app: "memo",
        title: `PW History B ${ts}`,
        payload: {
          tabs: [{ id: `tab-${docBId}`, title: `PW History B ${ts}`, description: "", superpowers: [], content: `<p>DOC_B_BASE_${ts}</p>` }],
          activeTabId: `tab-${docBId}`
        },
        updatedAt: new Date().toISOString()
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return {
        docAId,
        docBId,
        docAEdit1,
        docAEdit2,
        docBEdit
      };
    });
    logStep("seed-docs:done", seed);

    await clickMemoDoc(page, seed.docAId, { allowProgrammaticOpen: false });
    logStep("open-doc-a:done");
    const seeded = await page.evaluate(async ({ docAId, docBId, docAEdit1, docAEdit2, docBEdit }) => {
      const historyStore = (window as any).goToolkitDocumentHistoryStore;
      const now = Date.now();
      await historyStore?.saveTimeline?.(docAId, {
        versions: [
          {
            versionId: `version-a-current-${now}`,
            createdAt: new Date(now).toISOString(),
            reason: "autosave",
            scope: "local",
            documentId: docAId,
            title: "Doc A",
            description: "",
            payload: {
              tabs: [{ id: `tab-${docAId}`, title: "Doc A", description: "", superpowers: [], content: `<p>DOC_A_BASE_${now} ${docAEdit2}</p>` }],
              activeTabId: `tab-${docAId}`
            }
          },
          {
            versionId: `version-a-restore-${now}`,
            createdAt: new Date(now - 60_000).toISOString(),
            reason: "page-switch",
            scope: "local",
            documentId: docAId,
            title: "Doc A",
            description: "",
            payload: {
              tabs: [{ id: `tab-${docAId}`, title: "Doc A", description: "", superpowers: [], content: `<p>DOC_A_BASE_${now} ${docAEdit1}</p>` }],
              activeTabId: `tab-${docAId}`
            }
          }
        ],
        updatedAt: new Date(now).toISOString()
      });
      await historyStore?.saveTimeline?.(docBId, {
        versions: [
          {
            versionId: `version-b-current-${now}`,
            createdAt: new Date(now).toISOString(),
            reason: "autosave",
            scope: "local",
            documentId: docBId,
            title: "Doc B",
            description: "",
            payload: {
              tabs: [{ id: `tab-${docBId}`, title: "Doc B", description: "", superpowers: [], content: `<p>DOC_B_BASE_${now} ${docBEdit}</p>` }],
              activeTabId: `tab-${docBId}`
            }
          }
        ],
        updatedAt: new Date(now).toISOString()
      });
      const checkA = await historyStore?.getTimeline?.(docAId);
      const checkB = await historyStore?.getTimeline?.(docBId);
      return {
        hasStore: Boolean(historyStore),
        aCount: Array.isArray(checkA?.versions) ? checkA.versions.length : 0,
        bCount: Array.isArray(checkB?.versions) ? checkB.versions.length : 0,
        hasApi: Boolean((window as any).GoToolkitMemoHistoryApi?.listVersions)
      };
    }, seed);
    logStep("seed-history-store:result", seeded);
    expect(seeded.hasStore).toBeTruthy();
    expect(seeded.hasApi).toBeTruthy();
    expect(seeded.aCount).toBeGreaterThanOrEqual(2);
    expect(seeded.bCount).toBeGreaterThanOrEqual(1);

    const versionCount = await page.evaluate(async docId => {
      const versions = await (window as any).GoToolkitMemoHistoryApi?.listVersions?.(docId);
      return Array.isArray(versions) ? versions.length : 0;
    }, seed.docAId);
    expect(versionCount).toBeGreaterThanOrEqual(2);
    await page.evaluate(async ({ docId, edit1, edit2 }) => {
      const versions = await (window as any).GoToolkitMemoHistoryApi?.listVersions?.(docId);
      const target = (Array.isArray(versions) ? versions : []).find((version: any) => {
        const html = String(version?.payload?.tabs?.[0]?.content || "");
        return html.includes(String(edit1 || "")) && !html.includes(String(edit2 || ""));
      });
      if (!target) throw new Error("Missing restore target version");
      await (window as any).GoToolkitMemoHistoryApi?.restoreVersion?.(target, { docId });
    }, { docId: seed.docAId, edit1: seed.docAEdit1, edit2: seed.docAEdit2 });
    logStep("restore-version:done");
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.docAEdit1);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.docAEdit2);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.docBEdit);

    const duplicateIdPromise = page.waitForFunction(() => {
      const activeId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
      return activeId && activeId !== String((window as any).__memoActiveDocumentIdBeforeDuplicate || "");
    }, null, { timeout: 20_000 }).catch(() => null);
    await page.evaluate(() => {
      (window as any).__memoActiveDocumentIdBeforeDuplicate = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
    });
    await page.evaluate(async ({ docId, edit1, edit2 }) => {
      const versions = await (window as any).GoToolkitMemoHistoryApi?.listVersions?.(docId);
      const target = (Array.isArray(versions) ? versions : []).find((version: any) => {
        const html = String(version?.payload?.tabs?.[0]?.content || "");
        return html.includes(String(edit1 || "")) && !html.includes(String(edit2 || ""));
      });
      if (!target) throw new Error("Missing duplicate target version");
      await (window as any).GoToolkitMemoHistoryApi?.duplicateVersionAsNew?.(target, { docId });
    }, { docId: seed.docAId, edit1: seed.docAEdit1, edit2: seed.docAEdit2 });
    await duplicateIdPromise;
    logStep("duplicate-version:done");
    const duplicateId = await page.evaluate(() => {
      return String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
    });
    expect(String(duplicateId || "")).not.toBe("");
    const duplicatedRecord = await page.evaluate(async id => {
      return await (window as any).goToolkitDocumentApi?.getRecord?.(id);
    }, duplicateId);
    expect(String(duplicatedRecord?.id || "")).toBe(String(duplicateId));
    await clickMemoDoc(page, String(duplicateId), { allowProgrammaticOpen: true });
    const duplicatedHtml = await getMemoEditorHtml(page);
    expect(duplicatedHtml).toContain(seed.docAEdit1);
    expect(duplicatedHtml).not.toContain(seed.docAEdit2);
    expect(duplicatedHtml).not.toContain(seed.docBEdit);
  });
});
