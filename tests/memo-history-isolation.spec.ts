import { expect, test } from "@playwright/test";
import {
  clickMemoDoc,
  clickMemoHistoryItem,
  duplicateSelectedMemoHistory,
  getMemoEditorHtml,
  openMemoHistory,
  restoreSelectedMemoHistory,
  typeIntoVisibleEditor,
  waitForMemoReady
} from "./helpers/memo-ui";

test.describe("Memo history isolation", () => {
  test("restores and duplicates the selected page history without leaking another page content", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const docAId = docApi?.generateId?.() || `history-a-${ts}`;
      const docBId = docApi?.generateId?.() || `history-b-${ts}`;
      await docApi?.upsertRecord?.({
        id: docAId,
        app: "memo",
        title: `PW History A ${ts}`,
        payload: {
          tabs: [{ id: `tab-${docAId}`, title: `PW History A ${ts}`, description: "", superpowers: [], content: `<p>DOC_A_BASE_${ts}</p>` }],
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
        docAEdit1: `DOC_A_EDIT_1_${ts}`,
        docAEdit2: `DOC_A_EDIT_2_${ts}`,
        docBEdit: `DOC_B_EDIT_${ts}`
      };
    });

    await clickMemoDoc(page, seed.docAId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.docAEdit2}`);
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
              tabs: [{ id: `tab-${docAId}`, title: "Doc A", description: "", superpowers: [], content: `<p>DOC_A_BASE_${now} ${docAEdit1} ${docAEdit2}</p>` }],
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
    expect(seeded.hasStore).toBeTruthy();
    expect(seeded.hasApi).toBeTruthy();
    expect(seeded.aCount).toBeGreaterThanOrEqual(2);
    expect(seeded.bCount).toBeGreaterThanOrEqual(1);

    const versionCount = await page.evaluate(async docId => {
      const versions = await (window as any).GoToolkitMemoHistoryApi?.listVersions?.(docId);
      return Array.isArray(versions) ? versions.length : 0;
    }, seed.docAId);
    expect(versionCount).toBeGreaterThanOrEqual(2);
    await openMemoHistory(page);
    await clickMemoHistoryItem(page, 1);
    await restoreSelectedMemoHistory(page);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.docAEdit1);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.docAEdit2);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.docBEdit);

    await openMemoHistory(page);
    await clickMemoHistoryItem(page, 0);
    const duplicateIdPromise = page.waitForFunction(() => {
      const activeId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
      return activeId && activeId !== String((window as any).__memoActiveDocumentIdBeforeDuplicate || "");
    }, null, { timeout: 20_000 }).catch(() => null);
    await page.evaluate(() => {
      (window as any).__memoActiveDocumentIdBeforeDuplicate = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
    });
    await duplicateSelectedMemoHistory(page);
    await duplicateIdPromise;
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
