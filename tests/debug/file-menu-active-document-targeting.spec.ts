import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { clickMemoDoc, getMemoDocItem, waitForMemoReady } from "../helpers/memo-ui";

const BASE_URL = "http://127.0.0.1:5000/index.html";

test.describe("File menu targets active document", () => {
  test("exports and deletes the currently clicked page", async ({ page }, testInfo) => {
    test.setTimeout(120_000);

    await page.goto(BASE_URL, { waitUntil: "commit", timeout: 20_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    await waitForMemoReady(page, 30_000);

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const pageAId = docApi?.generateId?.() || `file-menu-a-${ts}`;
      const pageBId = docApi?.generateId?.() || `file-menu-b-${ts}`;
      const pageATitle = `PW FileMenu A ${ts}`;
      const pageBTitle = `PW FileMenu B ${ts}`;
      const pageAHeading = `Alpha Export Heading ${ts}`;
      const pageBHeading = `Beta Export Heading ${ts}`;
      const pageABody = `Alpha export body ${ts}`;
      const pageBBody = `Beta export body ${ts}`;

      await docApi?.upsertRecord?.({
        id: pageAId,
        app: "memo",
        title: pageATitle,
        payload: {
          tabs: [{
            id: `tab-${pageAId}`,
            title: pageATitle,
            description: "",
            superpowers: [],
            content: `<h1>${pageAHeading}</h1><p>${pageABody}</p>`
          }],
          activeTabId: `tab-${pageAId}`
        },
        updatedAt: new Date().toISOString()
      });

      await docApi?.upsertRecord?.({
        id: pageBId,
        app: "memo",
        title: pageBTitle,
        payload: {
          tabs: [{
            id: `tab-${pageBId}`,
            title: pageBTitle,
            description: "",
            superpowers: [],
            content: `<h1>${pageBHeading}</h1><p>${pageBBody}</p>`
          }],
          activeTabId: `tab-${pageBId}`
        },
        updatedAt: new Date().toISOString()
      });

      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });

      return {
        pageAId,
        pageBId,
        pageATitle,
        pageBTitle,
        pageAHeading,
        pageBHeading,
        pageABody,
        pageBBody
      };
    });

    await clickMemoDoc(page, seed.pageAId);
    await clickMemoDoc(page, seed.pageBId);

    const activeBeforeExport = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
    expect(activeBeforeExport).toBe(seed.pageBId);

    await page.locator("#fileMenuBtn").click();
    await page.locator('#fileMenu .menu-panel-item.has-submenu').filter({ hasText: "Télécharger" }).hover();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#fileMenuExportMarkdown").click();
    const download = await downloadPromise;
    const downloadPath = testInfo.outputPath(`file-menu-${Date.now()}.md`);
    await download.saveAs(downloadPath);
    const exportedMarkdown = await fs.readFile(downloadPath, "utf8");
    const suggestedName = download.suggestedFilename();

    expect(suggestedName).toContain(seed.pageBTitle);
    expect(exportedMarkdown).toContain(seed.pageBHeading);
    expect(exportedMarkdown).toContain(seed.pageBBody);
    expect(exportedMarkdown).not.toContain(seed.pageAHeading);
    expect(exportedMarkdown).not.toContain(seed.pageABody);

    await clickMemoDoc(page, seed.pageAId);
    const activeBeforeDelete = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
    expect(activeBeforeDelete).toBe(seed.pageAId);

    await page.locator("#fileMenuBtn").click();
    await page.locator("#deleteDocumentBtn").click();

    await expect.poll(async () => {
      return page.evaluate(async ({ pageAId, pageBId }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const pageARecord = await docApi?.getRecord?.(pageAId).catch(() => null);
        const pageBRecord = await docApi?.getRecord?.(pageBId).catch(() => null);
        const explorer = (window as any).GoToolkitMemoDocumentExplorer;
        const items = explorer?.getItemsSnapshot?.() || [];
        return {
          activeDocumentId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
          pageAExists: Boolean(pageARecord),
          pageBExists: Boolean(pageBRecord),
          pageAInExplorer: items.some((item: any) => String(item?.id || "") === String(pageAId || "")),
          pageBInExplorer: items.some((item: any) => String(item?.id || "") === String(pageBId || ""))
        };
      }, { pageAId: seed.pageAId, pageBId: seed.pageBId });
    }, { timeout: 20_000 }).toMatchObject({
      pageBExists: true,
      pageAInExplorer: false,
      pageBInExplorer: true
    });

    await expect(getMemoDocItem(page, seed.pageAId)).toHaveCount(0);
    await expect(getMemoDocItem(page, seed.pageBId)).toBeVisible();
  });
});
