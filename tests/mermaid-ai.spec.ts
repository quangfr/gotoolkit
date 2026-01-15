import { expect, test } from "@playwright/test";

test.describe("Mermaid Diagram AI Composer", () => {
  test("should generate mermaid diagram via AI composer", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    
    await page.goto(`${baseUrl}/memo.html`);

    // Create a document to ensure the editor is visible
    await page.evaluate(async () => {
      // Wait for the function to be available
      let attempts = 0;
      while (!(window as any).GoToolkitMemoCreateAutoDocument && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if ((window as any).GoToolkitMemoCreateAutoDocument) {
        await (window as any).GoToolkitMemoCreateAutoDocument();
      }
    });

    // Wait for the editor to be ready and visible
    await page.waitForFunction(() => {
      const editor = (window as any).MemoEditor;
      const card = document.querySelector('.memo-card') as HTMLElement;
      return Boolean(editor) && card && card.style.display !== 'none';
    });

    // Inject mock AI after page load to ensure GoToolkitIA is ready to be swapped
    await page.evaluate(() => {
      (window as any).GoToolkitIA = {
        chatCompletion: async () => {
          return JSON.stringify({
            answer: "Voici ton diagramme.",
            mermaid: "graph TD;\n  A[Process 1] --> B[Process 2];"
          });
        }
      };
      
      // Ensure config is present for the model call
      if (!(window as any).GoToolkitIAConfig) {
          (window as any).GoToolkitIAConfig = {
              getOpenAiModel: () => "gpt-4"
          };
      } else {
          (window as any).GoToolkitIAConfig.getOpenAiModel = () => "gpt-4";
      }

      // Ensure presets are present
      if (!(window as any).GoToolkitChatPrompt) {
          (window as any).GoToolkitChatPrompt = {
              PRESETS: {
                  draw: {
                      prompt: "Convert this to {{draw_type}}: {{field_input}}"
                  }
              }
          };
      }
    });

    // Clear editor content first to be clean
    await page.evaluate(() => {
      (window as any).MemoEditor.commands.setContent('');
    });

    // Insert a mermaid diagram via the window API
    await page.evaluate(async () => {
      const editor = (window as any).MemoEditor;
      editor.chain().focus().insertContent({
        type: 'mermaidDiagram',
        attrs: { code: 'graph TD; A-->B;' },
      }).run();
      
      // Give it more time to render and stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    // Wait for diagram to appear in DOM
    const diagram = page.locator('.mermaid-diagram-wrapper').first();
    await expect(diagram).toBeAttached();

    const container = diagram.locator('.mermaid-diagram-container');
    await container.waitFor({ state: 'visible', timeout: 10000 });
    
    // Check bounding box to see if it has size
    const box = await container.boundingBox();

    // If it has size, try to dblclick at its center
    if (box) {
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      // Fallback to event dispatch
      await container.evaluate(el => {
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
    }

    // Wait for modal components instead of just the modal class
    // sometimesvisibility check on large fixed overlays is tricky
    const modalTextArea = page.locator('.mermaid-modal-textarea');
    await modalTextArea.waitFor({ state: 'visible', timeout: 10000 });

    // Enter prompt in composer
    const composerInput = page.locator('#draw-composer-input');
    await composerInput.fill("Create a simple process flow");

    // Click send
    const sendBtn = page.locator('#draw-composer .chat-send-btn');
    await sendBtn.click();

    // Verify textarea update
    // We expect the text to change from 'graph TD; A-->B;' to something containing 'Process 1'
    await expect(modalTextArea).toHaveValue(/Process 1/, { timeout: 15000 });
    
    console.log('Textarea updated correctly');

    // Verify Excalidraw host has elements
    const excalidrawHost = page.locator('.mermaid-modal-excalidraw-host');
    await expect(excalidrawHost).toBeVisible();
    
    // Check if Excalidraw loaded (it should have a canvas or some excalidraw-specific class)
    // In our implementation, we call updateFromMermaid which should render it
    const canvas = excalidrawHost.locator('canvas');
    await expect(canvas.first()).toBeVisible({ timeout: 10000 });
    
    console.log('Excalidraw diagram rendered correctly');
  });
});
