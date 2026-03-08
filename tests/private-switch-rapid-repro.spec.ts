import { expect, test } from "@playwright/test";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, typeIntoVisibleEditor, waitForMemoReady } from "./helpers/memo-ui";

test.describe("Private page rapid switching repro", () => {
  test("keeps private content during rapid page switches while typing", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const privateAId = docApi?.generateId?.() || `rapid-private-a-${ts}`;
      const privateBId = docApi?.generateId?.() || `rapid-private-b-${ts}`;
      await docApi?.upsertRecord?.({
        id: privateAId,
        app: "memo",
        title: `PW Rapid A ${ts}`,
        payload: {
          tabs: [{ id: `tab-${privateAId}`, title: `PW Rapid A ${ts}`, description: "", superpowers: [], content: `<p>RAPID_A_BASE_${ts}</p>` }],
          activeTabId: `tab-${privateAId}`
        },
        updatedAt: new Date().toISOString()
      });
      await docApi?.upsertRecord?.({
        id: privateBId,
        app: "memo",
        title: `PW Rapid B ${ts}`,
        payload: {
          tabs: [{ id: `tab-${privateBId}`, title: `PW Rapid B ${ts}`, description: "", superpowers: [], content: `<p>RAPID_B_BASE_${ts}</p>` }],
          activeTabId: `tab-${privateBId}`
        },
        updatedAt: new Date().toISOString()
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return {
        privateAId,
        privateBId,
        appendA: ` RAPID_A_EDIT_${ts}`,
        appendB: ` RAPID_B_EDIT_${ts}`
      };
    });

    await refreshMemoExplorer(page, 30_000);

    for (let i = 0; i < 4; i += 1) {
      await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
      await typeIntoVisibleEditor(page, `${seed.appendA}_${i}`);
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(`${seed.appendA}_${i}`);

      await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
      await typeIntoVisibleEditor(page, `${seed.appendB}_${i}`);
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(`${seed.appendB}_${i}`);
    }

    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(`${seed.appendA}_3`);

    await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(`${seed.appendB}_3`);

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await refreshMemoExplorer(page, 30_000);

    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(`${seed.appendA}_3`);

    await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(`${seed.appendB}_3`);
  });
});
