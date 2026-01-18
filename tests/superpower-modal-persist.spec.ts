import { expect, test } from "@playwright/test";

test.describe("Document edit modal superpowers", () => {
  test("persists superpower selection across reopen", async ({ page }) => {
    test.setTimeout(90_000);
    const baseUrl = "http://127.0.0.1:5000";
    const docTitle = `E2E Superpower ${Date.now()}`;

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    await page.waitForSelector("#documentExplorerToggle");
    
    const isCollapsed = await page.evaluate(() => {
        return document.querySelector("#documentExplorer")?.classList.contains("document-explorer--collapsed");
    });

    if (isCollapsed) {
        await page.click("#documentExplorerToggle");
        await page.waitForFunction(() => {
            const explorer = document.querySelector("#documentExplorer");
            return explorer && !explorer.classList.contains("document-explorer--collapsed");
        });
    }

    await page.waitForSelector(".document-explorer__actions .chat-knowledge-modal__add", {
      state: "visible"
    });
    await page.click('.document-explorer__actions .chat-knowledge-modal__add:has-text("Nouveau")');
    await page.waitForSelector(".modal-overlay.open");
    await page.waitForSelector("#document-explorer-name-input");
    await page.fill("#document-explorer-name-input", docTitle);

    await page.waitForSelector(
      "#document-explorer-superpowers-container .superpower-checkbox-label"
    );
    const firstLabel = page
      .locator("#document-explorer-superpowers-container .superpower-checkbox-label")
      .first();
    const firstInput = firstLabel.locator("input");
    const superpowerId = await firstInput.getAttribute("value");
    expect(superpowerId).toBeTruthy();

    await firstLabel.click();
    await expect(firstInput).toBeChecked();

    await page.click('[data-confirm]');
    await page.waitForSelector(".modal-overlay.open", { state: "hidden" });

    const item = page.locator(".document-explorer__item", { hasText: docTitle }).first();
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.hover();
    await item.locator(".document-explorer__rename").click();
    await page.waitForSelector(".modal-overlay.open");
    await page.waitForSelector("#document-explorer-name-input");

    const selector = `#document-explorer-superpowers-container input[value="${superpowerId}"]`;
    const checkbox = page.locator(selector);
    await expect(checkbox).toBeChecked();
    
    // Vérifier que le span parent ou frère a bien la classe active
    const pill = page.locator(`#document-explorer-superpowers-container label:has(input[value="${superpowerId}"]) .superpower-pill`);
    await expect(pill).toHaveClass(/active/);
  });
});
