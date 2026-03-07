import { expect, test } from "@playwright/test";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, typeIntoVisibleEditor, waitForMemoReady } from "./helpers/memo-ui";

test.describe("Private page switching persistency", () => {
  test("keeps private edits across panel switches and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateDocument), null, { timeout: 30_000 });
    await waitForMemoReady(page, 30_000);

    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const privateAId = await (window as any).GoToolkitMemoCreateDocument({
        name: `PW Private A ${ts}`,
        initialContent: `<p>PRIVATE_A_BASE_${ts}</p>`,
      });
      const privateBId = await (window as any).GoToolkitMemoCreateDocument({
        name: `PW Private B ${ts}`,
        initialContent: `<p>PRIVATE_B_BASE_${ts}</p>`,
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return {
        privateAId,
        privateBId,
        privateEdit: `PRIVATE_A_EDIT_${ts}`,
      };
    });

    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.privateEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateEdit);

    await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
    await page.waitForFunction(
      (expectedId) => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
      seed.privateBId,
      { timeout: 15_000 }
    );

    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateEdit);

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);

    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateEdit);
  });
});
