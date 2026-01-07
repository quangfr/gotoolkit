import { expect, test } from "@playwright/test";

test.describe("Memo Editor", () => {
  test("page loads without errors", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    const errors: string[] = [];
    const logs: string[] = [];

    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        logs.push(msg.text());
      }
    });

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    
    // Give React time to mount
    await page.waitForTimeout(2000);

    const hasAppDiv = await page.locator("#app").isVisible();
    
    console.log("Errors during load:", errors);
    console.log("Console errors:", logs);
    console.log("App visible:", hasAppDiv);

    expect(hasAppDiv).toBe(true);
    expect(errors.length).toBe(0);
  });

  test("Tiptap editor initializes", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    
    // Try to access the editor
    const editorStatus = await page.evaluate(async () => {
      // Wait up to 5 seconds for editor
      for (let i = 0; i < 50; i++) {
        const editor = (window as any).MemoEditor;
        if (editor) {
          return { 
            found: true,
            isObject: typeof editor === 'object',
            hasChain: typeof editor.chain === 'function'
          };
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return { found: false };
    });

    console.log("Editor status:", editorStatus);

    expect(editorStatus.found).toBe(true);
    if (editorStatus.found) {
      expect(editorStatus.isObject).toBe(true);
      expect(editorStatus.hasChain).toBe(true);
    }
  });

  test("BubbleMenu shows when text is highlighted", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    
    // Wait for editor
    await page.waitForFunction(() => {
      const editor = (window as any).MemoEditor;
      return editor !== undefined && typeof editor.chain === 'function';
    }, { timeout: 30_000 });

    // Insert test text
    const testText = "Hello from Tiptap v3";
    await page.evaluate(async (text) => {
      const editor = (window as any).MemoEditor;
      editor.chain().focus().insertContent(text).run();
    }, testText);

    // Select all text
    await page.evaluate(() => {
      const editor = (window as any).MemoEditor;
      editor.chain().focus().selectAll().run();
    });

    // Add highlight to selected text
    await page.evaluate(() => {
      const editor = (window as any).MemoEditor;
      editor.chain().focus().setMark('highlight').run();
    });

    // Wait for the bubble menu to update
    await page.waitForTimeout(500);

    // Debug: Check if selection has highlight
    const selectionDebug = await page.evaluate(() => {
      const editor = (window as any).MemoEditor;
      const { from, to } = editor.state.selection;
      const hasHighlight = editor.isActive('highlight');
      const marks: any = [];
      editor.state.doc.nodesBetween(from, to, (node) => {
        node.marks.forEach(mark => marks.push(mark.type.name));
      });
      return { from, to, hasHighlight, marks };
    });

    console.log("Selection debug:", selectionDebug);

    // Check if bubble menu has opacity > 0
    const bubbleMenuOpacity = await page.locator('.bubble-menu').evaluate(el => 
      window.getComputedStyle(el).opacity
    );

    console.log("Bubble menu opacity:", bubbleMenuOpacity);

    expect(parseFloat(bubbleMenuOpacity)).toBeGreaterThan(0);
  });

  test("Undo and Redo work correctly", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    
    // Wait for editor
    await page.waitForFunction(() => {
      const editor = (window as any).MemoEditor;
      return editor !== undefined && typeof editor.chain === 'function';
    }, { timeout: 30_000 });

    // Insert some text
    const result = await page.evaluate(async () => {
      const editor = (window as any).MemoEditor;
      
      // Initial content
      editor.chain().focus().insertContent("First").run();
      let canUndo = editor.can().undo();
      let canRedo = editor.can().redo();
      let initialContent = editor.getHTML();
      
      // Try undo
      if (canUndo) {
        editor.chain().focus().undo().run();
        const afterUndo = editor.getHTML();
        const canRedoAfterUndo = editor.can().redo();
        
        // Try redo
        editor.chain().focus().redo().run();
        const afterRedo = editor.getHTML();
        
        return {
          success: true,
          canUndoInitially: canUndo,
          canRedoInitially: canRedo,
          canRedoAfterUndo: canRedoAfterUndo,
          initialContent,
          afterUndo,
          afterRedo,
          undoChanged: initialContent !== afterUndo,
          redoRestored: initialContent === afterRedo,
        };
      }
      
      return {
        success: false,
        canUndoInitially: canUndo,
        canRedoInitially: canRedo,
        message: "Cannot undo - history may not be working",
      };
    });

    console.log("Undo/Redo test result:", result);

    expect(result.success).toBe(true);
    expect(result.canUndoInitially).toBe(true);
    expect(result.canRedoAfterUndo).toBe(true); // Redo should be available after undo
    expect(result.undoChanged).toBe(true);
    expect(result.redoRestored).toBe(true);
  });

  test("Redo button state updates correctly in UI", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    
    // Wait for editor and toolbar
    await page.waitForFunction(() => {
      const editor = (window as any).MemoEditor;
      return editor !== undefined && typeof editor.chain === 'function';
    }, { timeout: 30_000 });

    // Close any open modals (template modal may auto-open)
    const templateModalClose = await page.locator('#gtTemplateModalClose').isVisible().catch(() => false);
    if (templateModalClose) {
      await page.locator('#gtTemplateModalClose').click();
      await page.waitForTimeout(100);
    }

    // Find redo button
    const redoButtons = await page.locator('button[aria-label="Redo"]').all();
    expect(redoButtons.length).toBeGreaterThan(0);
    
    const redoButton = redoButtons[0];
    
    // Initially, redo should be disabled
    let isDisabled = await redoButton.isDisabled();
    console.log("Redo button initially disabled:", isDisabled);
    expect(isDisabled).toBe(true);

    // Type some text
    await page.evaluate(() => {
      const editor = (window as any).MemoEditor;
      editor.chain().focus().insertContent("Test content").run();
    });

    // Wait for UI update
    await page.waitForTimeout(300);

    // Click undo button
    const undoButtons = await page.locator('button[aria-label="Undo"]').all();
    await undoButtons[0].click();

    // Wait for state update
    await page.waitForTimeout(300);

    // Now redo should be enabled
    isDisabled = await redoButton.isDisabled();
    console.log("Redo button disabled after undo:", isDisabled);
    expect(isDisabled).toBe(false);

    // Click redo button and verify it works
    await redoButton.click();

    // Verify content is restored
    const content = await page.evaluate(() => {
      const editor = (window as any).MemoEditor;
      return editor.getHTML();
    });

    console.log("Content after redo:", content);
    expect(content).toContain("Test content");
  });
});
