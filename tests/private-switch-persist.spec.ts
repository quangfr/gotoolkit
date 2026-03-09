import { expect, test } from "@playwright/test";
import { clickMemoDoc, getMemoEditorHtml, refreshMemoExplorer, typeIntoVisibleEditor, waitForMemoReady } from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

test.describe("Private page switching persistency", () => {
  test("keeps private edits across panel switches and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("private-switch-persist");

    attachPageDebugLogging(page, "private-switch-persist");

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    logStep("memo-ready");

    logStep("seed-private-docs:start");
    const seed = await page.evaluate(async () => {
      const ts = Date.now();
      const docApi = (window as any).goToolkitDocumentApi;
      const privateAId = docApi?.generateId?.() || `private-a-${ts}`;
      const privateBId = docApi?.generateId?.() || `private-b-${ts}`;
      await docApi?.upsertRecord?.({
        id: privateAId,
        app: "memo",
        title: `PW Private A ${ts}`,
        payload: {
          tabs: [{ id: `tab-${privateAId}`, title: `PW Private A ${ts}`, description: "", superpowers: [], content: `<p>PRIVATE_A_BASE_${ts}</p>` }],
          activeTabId: `tab-${privateAId}`
        },
        updatedAt: new Date().toISOString()
      });
      await docApi?.upsertRecord?.({
        id: privateBId,
        app: "memo",
        title: `PW Private B ${ts}`,
        payload: {
          tabs: [{ id: `tab-${privateBId}`, title: `PW Private B ${ts}`, description: "", superpowers: [], content: `<p>PRIVATE_B_BASE_${ts}</p>` }],
          activeTabId: `tab-${privateBId}`
        },
        updatedAt: new Date().toISOString()
      });
      await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      return {
        privateAId,
        privateBId,
        privateEdit: `PRIVATE_A_EDIT_${ts}`,
      };
    });
    logStep("seed-private-docs:done", seed);

    logStep("edit-private-a:start");
    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await typeIntoVisibleEditor(page, ` ${seed.privateEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateEdit);
    logStep("edit-private-a:done");

    logStep("switch-to-private-b:start");
    await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
    await page.waitForFunction(
      (expectedId) => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
      seed.privateBId,
      { timeout: 15_000 }
    );
    logStep("switch-to-private-b:done");

    logStep("switch-back-to-private-a:start");
    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateEdit);
    logStep("switch-back-to-private-a:done");

    logStep("reload:start");
    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);
    logStep("reload:done");

    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateEdit);
  });
});
