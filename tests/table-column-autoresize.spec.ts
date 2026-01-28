import { expect, test } from "@playwright/test";

test.describe("Memo table column auto-resize", () => {
  test("double click auto-fits a column up to 450px", async ({ page }) => {
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

    const longToken = "Loooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo";
    const markdown = [
      "| A | B | C |",
      "| --- | --- | --- |",
      `| 1 | ${longToken}${longToken} | 3 |`
    ].join("\n");

    await page.evaluate((md) => {
      (window as any).setEditorMarkdown(md);
    }, markdown);

    await page.waitForFunction(() => {
      const table = document.querySelector(".ProseMirror table");
      return Boolean(table && table.querySelector("colgroup col"));
    }, null, { timeout: 30_000 });

    const initialWidth = await page.evaluate(() => {
      const col = document.querySelector(".ProseMirror table colgroup col:nth-child(2)") as HTMLTableColElement | null;
      return col ? Number.parseFloat(col.style.width || "0") : 0;
    });

    expect(initialWidth).toBeGreaterThan(0);

    const handlePoint = await page.evaluate(() => {
      const table = document.querySelector(".ProseMirror table");
      const cell = table?.querySelector("tr:first-child th:nth-child(2), tr:first-child td:nth-child(2)") as HTMLElement | null;
      const handle = cell?.querySelector(".column-resize-handle") as HTMLElement | null;
      if (!handle) return null;
      const rect = handle.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

    expect(handlePoint).not.toBeNull();

    await page.mouse.dblclick(handlePoint!.x, handlePoint!.y);

    await page.waitForFunction(() => {
      const col = document.querySelector(".ProseMirror table colgroup col:nth-child(2)") as HTMLTableColElement | null;
      const width = col ? Number.parseFloat(col.style.width || "0") : 0;
      return width >= 400 && width <= 450;
    }, null, { timeout: 10_000 });

    const finalWidth = await page.evaluate(() => {
      const col = document.querySelector(".ProseMirror table colgroup col:nth-child(2)") as HTMLTableColElement | null;
      return col ? Number.parseFloat(col.style.width || "0") : 0;
    });

    expect(finalWidth).toBeGreaterThanOrEqual(400);
    expect(finalWidth).toBeLessThanOrEqual(450);
    expect(finalWidth).toBeGreaterThan(initialWidth);
  });
});
