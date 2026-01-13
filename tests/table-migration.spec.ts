import { expect, test } from "@playwright/test";

test.describe("Table Migration Non-Regression", () => {
  test("creates a table via AI and verifies it in the memo document", async ({ page }) => {
    test.setTimeout(60_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    
    // Wait for Assist to be ready
    await page.waitForFunction(
      () => Boolean((window as any).GoToolkitAssistInstance),
      null,
      { timeout: 30_000 }
    );

    // Mock AI response to return a table
    await page.evaluate(() => {
      const originalChatCompletion = (window as any).GoToolkitIA.chatCompletion;
      (window as any).GoToolkitIA.chatCompletion = async (options: any) => {
        // If it's the table creation request, return a mocked response
        if (options.payload && JSON.stringify(options.payload).includes("tableau")) {
          return {
            text: JSON.stringify({
              answer: "Voici votre tableau.",
              output: "| Colonne 1 | Colonne 2 |\n| --- | --- |\n| Ligne 1 | Ligne 1 |\n| Ligne 2 | Ligne 2 |"
            }),
            usage: { total_tokens: 100 }
          };
        }
        return originalChatCompletion(options);
      };
    });

    // Open assist if closed and set to edit mode
    await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (assist?.open && !assist.isOpen) {
        assist.open();
      }
      // Ensure we are in a mode that can edit the document
      if (assist?.setPromptPreset) {
        assist.setPromptPreset("edit");
      }
    });

    const chatInputSelector = "textarea.chat-input";
    await page.waitForSelector(chatInputSelector, { timeout: 30_000 });

    // Type the request
    const message = "créer un tableau à 2 colonnes et à 2 lignes";
    const startTime = Date.now();
    await page.fill(chatInputSelector, message);
    await page.keyboard.press("Enter");

    // Wait for AI response to finish and document to be updated
    // We'll wait for the document to contain a table node.
    await page.waitForFunction(
      () => {
        const editor = (window as any).memoEditor;
        if (!editor || typeof editor.getJSON !== 'function') return false;
        const json = editor.getJSON();
        
        // Recursive search for a 'table' type node
        const hasTable = (node: any): boolean => {
          if (!node) return false;
          if (node.type === 'table') return true;
          if (node.content && Array.isArray(node.content)) {
            return node.content.some(hasTable);
          }
          return false;
        };
        
        return hasTable(json);
      },
      null,
      { timeout: 60_000, polling: 1000 }
    );

    const duration = Date.now() - startTime;
    console.log(`Table creation and insertion took ${duration}ms`);

    // Final verification
    const docJson = await page.evaluate(() => {
      return (window as any).memoEditor.getJSON();
    });

    const findTable = (node: any): any => {
      if (node.type === 'table') return node;
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          const found = findTable(child);
          if (found) return found;
        }
      }
      return null;
    };

    const tableNode = findTable(docJson);
    expect(tableNode).toBeDefined();
    expect(tableNode.type).toBe('table');
    
    console.log("Table found in document JSON:", JSON.stringify(tableNode, null, 2));
  });
});
