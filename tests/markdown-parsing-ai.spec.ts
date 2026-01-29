import { expect, test } from "@playwright/test";

test.describe("AI Markdown Parsing", () => {
  test("should parse emoji alerts and unicode tasks from AI response", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    
    await page.goto(`${baseUrl}/docs.html`);

    // Create a document
    await page.evaluate(async () => {
      let attempts = 0;
      while (!(window as any).GoToolkitMemoCreateAutoDocument && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if ((window as any).GoToolkitMemoCreateAutoDocument) {
        await (window as any).GoToolkitMemoCreateAutoDocument();
      }
    });

    // Wait for editor
    await page.waitForFunction(() => {
      const editor = (window as any).MemoEditor;
      return Boolean(editor);
    });

    // Mock AI response
    const testMarkdown = `
>ℹ️ Note line 1
>line 2

>💡 Tip line 1

>✅ Important line 1

>⚠️ Alert line 1

>🚨 Danger line 1

☒ Checked task
☐ Unchecked task

| Col 1 | Col 2 |
|---|---|
| ☐ Table | ☒ Table |
`;

    const aiOutput = JSON.stringify({
      answer: "Voici le contenu.",
      output: testMarkdown
    });

    await page.evaluate((jsonResponse) => {
      (window as any).GoToolkitIA = {
        chatCompletion: async (params: any) => {
          if (params.onChunk) {
            // Simulate streaming
            params.onChunk(jsonResponse);
          }
          return { text: jsonResponse };
        }
      };
    }, aiOutput);

    // Initial clear
    await page.evaluate(() => {
      (window as any).MemoEditor.commands.setContent('');
    });

    // Open assist sidebar
    const assistBtn = page.locator('#assistLauncherBtn');
    await assistBtn.click();

    // Set mode to edit via UI if possible, or via API
    await page.evaluate(() => {
      const sidebar = (window as any).GoToolkitAssistInstance;
      if (sidebar) {
        sidebar.setPromptPreset('edit');
      }
    });

    // Type and send
    const chatInput = page.locator('.chat-input');
    await chatInput.waitFor({ state: 'visible' });
    await chatInput.fill('Generate test summary');
    await page.keyboard.press('Enter');

    // Wait for content to be applied to editor
    // We check for specific blockquote data-type attributes
    await page.waitForFunction(() => {
      const html = (window as any).MemoEditor.getHTML();
      return html.includes('data-type="NOTE"') && 
             html.includes('data-type="TIP"') && 
             html.includes('data-type="IMPORTANT"') && 
             html.includes('data-type="WARNING"') && 
             html.includes('data-type="CAUTION"');
    }, { timeout: 15000 });

    const editorHtml = await page.evaluate(() => (window as any).MemoEditor.getHTML());

    // Assertions
    // Note alert
    expect(editorHtml).toContain('data-type="NOTE"');
    expect(editorHtml).toContain('Note line 1');
    expect(editorHtml).toContain('line 2');

    // Tip alert
    expect(editorHtml).toContain('data-type="TIP"');
    expect(editorHtml).toContain('Tip line 1');

    // Important alert
    expect(editorHtml).toContain('data-type="IMPORTANT"');
    expect(editorHtml).toContain('Important line 1');

    // Warning alert
    expect(editorHtml).toContain('data-type="WARNING"');
    expect(editorHtml).toContain('Alert line 1');

    // Caution alert
    expect(editorHtml).toContain('data-type="CAUTION"');
    expect(editorHtml).toContain('Danger line 1');

    // Tasks (should be converted to task items)
    expect(editorHtml).toContain('data-checked="true"');
    expect(editorHtml).toContain('Checked task');
    expect(editorHtml).toContain('data-checked="false"');
    expect(editorHtml).toContain('Unchecked task');

    // Table content (should NOT be converted to task items)
    // Tiptap table cells should contain the raw characters
    expect(editorHtml).toContain('☐ Table');
    expect(editorHtml).toContain('☒ Table');
    // Ensure they ARE NOT task items inside the table
    const tableTasks = await page.locator('table .task-item').count();
    expect(tableTasks).toBe(0);
  });
});
