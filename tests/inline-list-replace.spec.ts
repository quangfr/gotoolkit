import { expect, test } from "@playwright/test";

test.describe("Inline list replacement", () => {
  test("replaces selected list item with flat list output", async ({ page }) => {
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
      "- one",
      "- two",
      "- three",
      "- four"
    ].join("\n");

    await page.evaluate((md) => {
      (window as any).setEditorMarkdown(md);
    }, initialMarkdown);

    await page.waitForFunction(() => {
      const editor = (window as any).memoEditor;
      if (!editor) return false;
      let listItemCount = 0;
      editor.state.doc.descendants((node: any) => {
        if (node.type?.name === "listItem") listItemCount += 1;
      });
      return listItemCount >= 4;
    }, null, { timeout: 30_000 });

    const selectionInfo: any = await page.evaluate(() => {
      const editor = (window as any).memoEditor;
      const doc = editor.state.doc;

      const listItems: Array<{ from: number; to: number }> = [];
      doc.descendants((node: any, pos: number) => {
        if (node.type?.name === "listItem") {
          listItems.push({ from: pos, to: pos + node.nodeSize });
        }
      });

      if (listItems.length < 3) {
        throw new Error("Expected at least 3 list items");
      }

      const target = listItems[2];
      editor.commands.setTextSelection({ from: target.from + 2, to: target.from + 2 });

      return {
        selectionText: doc.textBetween(target.from, target.to, " "),
        range: target
      };
    });

    await page.evaluate((info) => {
      const output = "- one\n- two\n- three\n- four\n- five\n- six\n- seven";
      if (typeof (window as any).insertEditorMarkdownAtRange === "function") {
        (window as any).insertEditorMarkdownAtRange(output, {
          from: info.range.from,
          to: info.range.to
        });
      } else if ((window as any).memoEditor) {
        const editor = (window as any).memoEditor;
        editor.chain().focus().insertContentAt(info.range.from, output).run();
      }
    }, selectionInfo);

    await page.waitForTimeout(500);

    const listStats = await page.evaluate(() => {
      const editor = (window as any).memoEditor;
      const doc = editor.state.doc;
      let bulletLists = 0;
      let listItems = 0;
      let nestedLists = 0;
      doc.descendants((node: any) => {
        if (node.type?.name === "bulletList") bulletLists += 1;
        if (node.type?.name === "listItem") listItems += 1;
        if (node.type?.name === "listItem") {
          node.descendants((child: any) => {
            if (child.type?.name === "bulletList") nestedLists += 1;
          });
        }
      });
      return { bulletLists, listItems, nestedLists };
    });

    expect(listStats.listItems).toBe(7);
    expect(listStats.nestedLists).toBe(0);
    expect(listStats.bulletLists).toBe(1);
  });
});
