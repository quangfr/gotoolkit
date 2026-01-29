import { expect, test } from "@playwright/test";

test.describe("Inline list replacement with selection", () => {
  test("replaces only the selected list item", async ({ page }) => {
    test.setTimeout(60_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });

    await page.waitForFunction(
      () => Boolean((window as any).memoEditor && (window as any).GoToolkitAssistInstance),
      null,
      { timeout: 30_000 }
    );

    await page.evaluate(async () => {
      if (typeof (window as any).GoToolkitMemoCreateAutoDocument === "function") {
        await (window as any).GoToolkitMemoCreateAutoDocument();
      }
      const emptyState = document.getElementById("memoEmptyState");
      if (emptyState) emptyState.style.display = "none";
      const appMain = document.getElementById("app") as HTMLElement | null;
      if (appMain) {
        appMain.style.display = "block";
        appMain.style.minHeight = "600px";
      }
      const memoCard = document.querySelector(".memo-card") as HTMLElement | null;
      if (memoCard) {
        memoCard.style.display = "block";
        memoCard.style.minHeight = "500px";
      }
      const editorWrap = document.querySelector(".editor-wrap") as HTMLElement | null;
      if (editorWrap) {
        editorWrap.style.display = "block";
        editorWrap.style.minHeight = "400px";
      }
      const editorRoot = document.getElementById("editor") as HTMLElement | null;
      if (editorRoot) {
        editorRoot.style.display = "block";
        editorRoot.style.minHeight = "400px";
      }
      const proseMirror = document.querySelector(".ProseMirror") as HTMLElement | null;
      if (proseMirror) {
        proseMirror.style.display = "block";
        proseMirror.style.minHeight = "300px";
        proseMirror.style.visibility = "visible";
      }
    });

    await page.waitForFunction(() => Boolean((window as any).memoEditor?.state), null, { timeout: 30_000 });

    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.open?.();
    });
    const selectionFollowBtn = page.locator("#assistSidebar .chat-selection-follow-btn");
    await selectionFollowBtn.waitFor({ state: "visible" });
    if ((await selectionFollowBtn.getAttribute("aria-pressed")) !== "true") {
      await selectionFollowBtn.click();
    }

    const initialMarkdown = [
      "- Item 1",
      "- Item 2",
      "- Item 3"
    ].join("\n");

    await page.evaluate((md) => {
      (window as any).setEditorMarkdown(md);
    }, initialMarkdown);

    await page.waitForFunction(() => {
      const editor = (window as any).memoEditor;
      if (!editor) return false;
      const text = editor.state.doc.textContent || "";
      return text.includes("Item 1") && text.includes("Item 2") && text.includes("Item 3");
    }, null, { timeout: 30_000 });

    await page.evaluate(() => {
      const originalChatCompletion = (window as any).GoToolkitIA.chatCompletion;
      (window as any).GoToolkitIA.chatCompletion = async (options: any) => {
        if (options?.payload && JSON.stringify(options.payload).includes("SELECTION:")) {
          return {
            text: JSON.stringify({
              answer: "ok",
              s_output: {
                  text: "- AAAA"
              }
            }),
            usage: { total_tokens: 100 }
          };
        }
        return originalChatCompletion(options);
      };
    });

    await page.evaluate(() => {
      const editor = (window as any).memoEditor;
      const doc = editor.state.doc;

      let textPos: number | null = null;
      let textSize = 0;
      doc.descendants((node: any, pos: number) => {
        if (node.type?.name === "text" && node.text === "Item 2") {
          textPos = pos;
          textSize = node.nodeSize;
          return false;
        }
      });

      if (textPos === null) {
        throw new Error("Second list item text not found");
      }

      const range = { from: textPos, to: textPos + textSize } as any;
      if (editor.commands?.setTextSelection) {
        editor.commands.setTextSelection(range);
      } else if (editor.chain?.().setTextSelection) {
        editor.chain().setTextSelection(range).run();
      }
      editor.view?.dom?.focus?.();
    });

    await page.waitForFunction(() => {
      const editor = (window as any).memoEditor;
      if (!editor) return false;
      const sel = editor.state.selection;
      const text = editor.state.doc.textBetween(sel.from, sel.to, " ");
      return text.includes("Item 2");
    }, null, { timeout: 10_000 });

    await page.waitForFunction(() => typeof (window as any).insertEditorMarkdownAtRange === "function");

    const textarea = page.locator("#assistSidebar textarea.chat-input");
    await textarea.waitFor({ state: "visible" });
    await textarea.focus();
    await textarea.fill("Remplace le deuxième item par AAAA");
    await textarea.press("Enter");

    await page.waitForFunction(() => {
      const md = (window as any).getEditorMarkdown?.() || "";
      return md.includes("- AAAA") && !md.includes("- Item 2");
    }, null, { timeout: 30_000 });

    const finalMarkdown = await page.evaluate(() => (window as any).getEditorMarkdown());

    expect(finalMarkdown).toContain("- Item 1");
    expect(finalMarkdown).toContain("- AAAA");
    expect(finalMarkdown).toContain("- Item 3");
    expect(finalMarkdown).not.toContain("- Item 2");
  });
});
