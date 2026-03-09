import { expect, test } from "@playwright/test";
import {
  clickMemoDoc,
  dismissDocsTour,
  getMemoEditorHtml,
  waitForMemoReady
} from "./helpers/memo-ui";

test.describe("Memo idle resume guards", () => {
  test("ignores transient empty snapshots after focus loss", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await dismissDocsTour(page);

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const id = docApi?.generateId?.() || `idle-guard-${ts}`;
      const marker = `IDLE_GUARD_${ts}`;
      await docApi?.upsertRecord?.({
        id,
        app: "memo",
        title: `Idle Guard ${ts}`,
        payload: {
          tabs: [{ id: `tab-${id}`, title: `Idle Guard ${ts}`, description: "", superpowers: [], content: `<p>${marker}</p>` }],
          activeTabId: `tab-${id}`
        },
        updatedAt: new Date().toISOString()
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return { id, marker };
    });

    await clickMemoDoc(page, seed.id, { allowProgrammaticOpen: true });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.marker);

    const snapshotState = await page.evaluate(() => {
      const editor = (window as any).GoToolkitMemoInstance;
      const originalGetValue = typeof editor?.getValue === "function" ? editor.getValue.bind(editor) : null;
      const originalHasFocus = typeof document.hasFocus === "function" ? document.hasFocus.bind(document) : null;
      if (editor && originalGetValue) {
        editor.getValue = () => "";
      }
      if (originalHasFocus) {
        (document as any).hasFocus = () => false;
      }
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("beforeunload"));
      const raw = localStorage.getItem("goToolkit.memo.openDocuments");
      if (editor && originalGetValue) {
        editor.getValue = originalGetValue;
      }
      if (originalHasFocus) {
        (document as any).hasFocus = originalHasFocus;
      }
      window.dispatchEvent(new Event("focus"));
      return raw ? JSON.parse(raw) : null;
    });

    expect(String(snapshotState?.activeDocumentPayload?.tabs?.[0]?.content || "")).toContain(seed.marker);
  });

  test("prefers durable record over blank cached open-document payload on reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await dismissDocsTour(page);

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const id = docApi?.generateId?.() || `idle-restore-${ts}`;
      const marker = `RESTORE_GUARD_${ts}`;
      await docApi?.upsertRecord?.({
        id,
        app: "memo",
        title: `Restore Guard ${ts}`,
        payload: {
          tabs: [{ id: `tab-${id}`, title: `Restore Guard ${ts}`, description: "", superpowers: [], content: `<p>${marker}</p>` }],
          activeTabId: `tab-${id}`
        },
        updatedAt: new Date().toISOString()
      });
      localStorage.setItem("goToolkit.memo.openDocuments", JSON.stringify({
        openDocumentIds: [id],
        activeDocumentId: id,
        activeDocumentPayload: {
          tabs: [{ id: `tab-${id}`, title: `Restore Guard ${ts}`, description: "", superpowers: [], content: "<p></p>" }],
          activeTabId: `tab-${id}`
        }
      }));
      return { id, marker };
    });

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await dismissDocsTour(page);
    await clickMemoDoc(page, seed.id, { allowProgrammaticOpen: true });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.marker);
  });
});
