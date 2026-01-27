  import { expect, test } from "@playwright/test";

  test.describe("Inline table replacement", () => {
    test("replaces only the selected table via inline chat", async ({ page }) => {
      test.setTimeout(60_000);
      const baseUrl = "http://127.0.0.1:5000";

      await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });

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

      const initialMarkdown = [
        "Line 1 before",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "Line between",
        "",
        "| C | D |",
        "| --- | --- |",
        "| 3 | 4 |",
        "",
        "Line 3 after"
      ].join("\n");

      await page.evaluate((md) => {
        (window as any).setEditorMarkdown(md);
      }, initialMarkdown);

      await page.waitForFunction(() => {
        const editor = (window as any).memoEditor;
        if (!editor) return false;
        const doc = editor.state.doc;
        let tableCount = 0;
        doc.descendants((node: any) => {
          if (node.type?.name === "table") tableCount += 1;
        });
        return tableCount >= 2;
      }, null, { timeout: 30_000 });

      await page.evaluate(() => {
        const editor = (window as any).memoEditor;
        if (editor?.view?.dom) {
          editor.view.dom.focus();
        }
      });

      await page.evaluate(() => {
        const originalChatCompletion = (window as any).GoToolkitIA.chatCompletion;
        (window as any).GoToolkitIA.chatCompletion = async (options: any) => {
          if (options?.payload && JSON.stringify(options.payload).includes("SELECTION:")) {
            return {
              text: JSON.stringify({
                answer: "ok",
                s_output: {
                  text: "| C2 | D2 |\n| --- | --- |\n| 33 | 44 |"
                }
              }),
              usage: { total_tokens: 100 }
            };
          }
          return originalChatCompletion(options);
        };
      });

      const selectionInfo: any = await page.evaluate(() => {
        const editor = (window as any).memoEditor;
        const doc = editor.state.doc;

        let tableIndex = 0;
        let secondTableRange: any = null;
        doc.descendants((node: any, pos: number) => {
          if (node.type?.name === "table") {
            tableIndex += 1;
            if (tableIndex === 2) {
              secondTableRange = { from: pos, to: pos + node.nodeSize };
            }
          }
        });

        if (!secondTableRange) {
          throw new Error("Second table range not found");
        }

        const range = secondTableRange as any;

        let cellPos: number | null = null;
        let cellNodeSize = 0;
        doc.descendants((node: any, pos: number) => {
          if (cellPos !== null) return false;
          if (pos < range.from || pos > range.to) return;
          if (node.type?.name === "tableCell" || node.type?.name === "tableHeader") {
            cellPos = pos;
            cellNodeSize = node.nodeSize;
            return false;
          }
        });

        if (cellPos === null) {
          throw new Error("Second table cell not found");
        }

        const start = editor.view.coordsAtPos(cellPos + 1);
        const end = editor.view.coordsAtPos(cellPos + cellNodeSize - 1);
        const selectionText = doc.textBetween(range.from, range.to, " ");
        return {
          start: { x: start.left + 2, y: start.top + 2 },
          end: { x: Math.max(start.left + 6, end.right - 2), y: Math.max(start.top + 6, end.bottom - 2) },
          range,
          selectionText
        };
      });

      await page.mouse.move(selectionInfo.start.x, selectionInfo.start.y);
      await page.mouse.down();
      await page.mouse.move(selectionInfo.end.x, selectionInfo.end.y);
      await page.mouse.up();

      await page.evaluate(async (info) => {
        const payload = {
          system: "Edit the selected table",
          messages: [
            {
              role: "user",
              content: `DOCUMENT:\n${(window as any).getEditorMarkdown()}\n\nSELECTION:\n${JSON.stringify({
                text: info.selectionText,
                start: 1,
                end: 1
              })}\n\nASK:\nModify the second table`
            }
          ],
          stream: false
        };

        await (window as any).sendInlineEditToAssist({
          payload,
          askText: "Modify the second table",
          selectionExcerpt: info.selectionText,
          selectionPos: { from: info.range.from, to: info.range.to },
          editor: (window as any).memoEditor
        });
      }, selectionInfo);

      await page.waitForFunction(() => {
        const md = (window as any).getEditorMarkdown?.() || "";
        return md.includes("| C2 | D2 |") && !md.includes("| C | D |");
      }, null, { timeout: 30_000 });

      const finalMarkdown = await page.evaluate(() => (window as any).getEditorMarkdown());

      expect(finalMarkdown).toContain("Line 1 before");
      expect(finalMarkdown).toContain("| A | B |");
      expect(finalMarkdown).toContain("Line between");
      expect(finalMarkdown).toContain("Line 3 after");
      expect(finalMarkdown).not.toContain("| C | D |");

      const tableBlocks = finalMarkdown
        .split(/\n{2,}/)
        .filter((block: string) => block.includes("|"));
      const modifiedTable = tableBlocks.find((block: string) => block.includes("| C2 | D2 |"));
      expect(modifiedTable).toBeDefined();

      const expectedTable = [
        "| C2 | D2 |",
        "| --- | --- |",
        "| 33 | 44 |"
      ].join("\n");

      expect(modifiedTable).toBe(expectedTable);

      const expectedDocument = [
        "Line 1 before",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "Line between",
        "",
        "| C2 | D2 |",
        "| --- | --- |",
        "| 33 | 44 |",
        "",
        "Line 3 after"
      ].join("\n");

      expect(finalMarkdown.trim()).toBe(expectedDocument);
    });
  });
