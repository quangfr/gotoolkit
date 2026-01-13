import { expect, test } from "@playwright/test";

test.describe("Memo Excalidraw Integration", () => {
  test("should open Excalidraw modal on double click", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "networkidle" });

    // Wait for the editor to be ready
    await page.waitForFunction(() => Boolean((window as any).MemoEditor));

    // Insert a mermaid diagram
    await page.evaluate(async () => {
      const editor = (window as any).MemoEditor;
      editor.chain().focus().insertContent({
        type: 'mermaidDiagram',
        attrs: { code: "graph TD; A-->B;" },
      }).run();
    });

    // Double click the diagram
    const diagram = page.locator('.mermaid-diagram-container');
    await diagram.dblclick();

    // Check if modal is open
    const modal = page.locator('.mermaid-modal-overlay');
    await expect(modal).toBeVisible();

    // Check if Excalidraw host is present
    const excalidrawHost = page.locator('.mermaid-modal-excalidraw-host');
    await expect(excalidrawHost).toBeAttached();

    // Check if loading spinner appears (might be fast, so we just check if it was there or is there)
    // const spinner = page.locator('.mermaid-loading-spinner');
    
    // Check if code editor is present with 350px width
    const editor = page.locator('.mermaid-modal-editor');
    await expect(editor).toBeVisible();
    const box = await editor.boundingBox();
    expect(box?.width).toBeCloseTo(350, 0);

    // Close modal
    await page.locator('.mermaid-modal-close').click();
    await expect(modal).not.toBeVisible();
  });

  test("should sync mermaid code to Excalidraw", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean((window as any).MemoEditor));

    // Insert and open
    await page.evaluate(() => {
      (window as any).MemoEditor.chain().focus().insertContent({
        type: 'mermaidDiagram',
        attrs: { code: "graph TD; X-->Y;" },
      }).run();
    });
    await page.locator('.mermaid-diagram-container').dblclick();

    // Wait for Excalidraw to load (it injects a script)
    await page.waitForSelector('.mermaid-modal-excalidraw-host canvas', { timeout: 15000 });

    // Change code in textarea
    const textarea = page.locator('.mermaid-modal-textarea');
    await textarea.fill("graph TD; Start-->End;");

    // We can't easily check Excalidraw internal state, but we can check if it didn't crash
    await expect(page.locator('.mermaid-modal-excalidraw-host')).toBeVisible();
    
    // Save and close
    await page.locator('.mermaid-modal-btn-primary').click();
    
    // Verify the node attribute was updated (excalidrawJSON should be populated)
    const excalidrawJSON = await page.evaluate(() => {
      const html = (window as any).MemoEditor.getHTML();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return doc.querySelector('mermaid-diagram')?.getAttribute('excalidrawjson');
    });
    
    expect(excalidrawJSON).toBeTruthy();
    expect(JSON.parse(excalidrawJSON!)).toHaveProperty('elements');
  });
});
