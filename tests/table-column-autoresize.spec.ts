import { expect, test } from "@playwright/test";

test.describe("Memo table column auto-resize", () => {
  const baseUrl = "http://127.0.0.1:5000";

  const setupMemo = async (page: any) => {
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
      const style = document.createElement("style");
      style.textContent = `
        .tableWrapper, .tableWrapper table, .ProseMirror table {
          display: table !important;
          visibility: visible !important;
        }
      `;
      document.head.appendChild(style);
    });

    await page.waitForFunction(() => Boolean((window as any).memoEditor?.state), null, { timeout: 30_000 });
  };

  const triggerDividerDblClick = async (page: any, columnIndex: number) => {
    const result = await page.evaluate((colIndex) => {
      const table = document.querySelector(".ProseMirror table");
      const cell = table?.querySelector(
        `tr:nth-child(2) td:nth-child(${colIndex}), tr:nth-child(2) th:nth-child(${colIndex})`
      ) as HTMLElement | null;
      if (!cell) return false;
      cell.scrollIntoView({ block: "center", inline: "center" });
      const rect = cell.getBoundingClientRect();
      const event = new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: rect.right - 2,
        clientY: rect.top + rect.height / 2
      });
      cell.dispatchEvent(event);
      return true;
    }, columnIndex);

    if (!result) throw new Error(`Cell for column ${columnIndex} not found`);
  };

  const getColumnWidths = async (page: any) => {
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll(".ProseMirror table colgroup col")).map((col) => {
        const width = (col as HTMLTableColElement).style.width || "0";
        return Number.parseFloat(width);
      });
    });
  };

  const expectUnchanged = (before: number[], after: number[], exceptIndex: number) => {
    before.forEach((value, index) => {
      if (index === exceptIndex) return;
      expect(after[index]).toBeCloseTo(value, 0);
    });
  };

  test("double click auto-fits specific columns", async ({ page }) => {
    test.setTimeout(60_000);
    await setupMemo(page);

    const makeText = (length: number, ch: string) => ch.repeat(length);
    const rows = Array.from({ length: 4 }, (_v, idx) => {
      const col1 = makeText(500 + idx * 20, "A");
      const col2 = makeText(5 + (idx % 6), "B");
      const col3 = makeText(idx % 5, "C");
      const col4 = "";
      return `| ${col1} | ${col2} | ${col3} | ${col4} |`;
    });

    const markdown = [
      "| Col1 | Col2 | Col3 | Col4 |",
      "| --- | --- | --- | --- |",
      ...rows,
    ].join("\n");

    await page.evaluate((md) => {
      (window as any).setEditorMarkdown(md);
    }, markdown);

    await page.waitForFunction(() => {
      const table = document.querySelector(".ProseMirror table");
      return Boolean(table && table.querySelector("colgroup col"));
    }, null, { timeout: 30_000 });

    const beforeCol1Resize = await getColumnWidths(page);

    await triggerDividerDblClick(page, 1);

    await page.waitForFunction(() => {
      const col = document.querySelector(".ProseMirror table colgroup col:nth-child(1)") as HTMLTableColElement | null;
      const width = col ? Number.parseFloat(col.style.width || "0") : 0;
      return width >= 449 && width <= 450;
    }, null, { timeout: 10_000 });

    const col1Width = await page.evaluate(() => {
      const col = document.querySelector(".ProseMirror table colgroup col:nth-child(1)") as HTMLTableColElement | null;
      return col ? Number.parseFloat(col.style.width || "0") : 0;
    });

    expect(col1Width).toBeGreaterThanOrEqual(449);
    expect(col1Width).toBeLessThanOrEqual(450);
    const afterCol1Resize = await getColumnWidths(page);
    expectUnchanged(beforeCol1Resize, afterCol1Resize, 0);

    await triggerDividerDblClick(page, 2);

    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll(".ProseMirror table tr"));
      const fits = rows.every((row) => {
        const cell = row.querySelector("th:nth-child(2), td:nth-child(2)") as HTMLElement | null;
        if (!cell) return true;
        return cell.scrollWidth <= cell.clientWidth + 1;
      });
      return fits;
    }, null, { timeout: 10_000 });

    const afterCol2Resize = await getColumnWidths(page);
    expectUnchanged(afterCol1Resize, afterCol2Resize, 1);

    await triggerDividerDblClick(page, 3);

    await page.waitForFunction(() => {
      const col = document.querySelector(".ProseMirror table colgroup col:nth-child(3)") as HTMLTableColElement | null;
      const width = col ? Number.parseFloat(col.style.width || "0") : 0;
      return width === 60;
    }, null, { timeout: 10_000 });

    const col3Width = await page.evaluate(() => {
      const col = document.querySelector(".ProseMirror table colgroup col:nth-child(3)") as HTMLTableColElement | null;
      return col ? Number.parseFloat(col.style.width || "0") : 0;
    });

    expect(col3Width).toBe(60);
    const afterCol3Resize = await getColumnWidths(page);
    expectUnchanged(afterCol2Resize, afterCol3Resize, 2);
  });

  test("autoresize one column does not affect other columns widths", async ({ page }) => {
    test.setTimeout(60_000);
    await setupMemo(page);

    const markdown = [
      "| Col1 | Col2 | Col3 |",
      "| --- | --- | --- |",
      "| Short | This is a much longer value that should cause resize | Small |",
    ].join("\n");

    await page.evaluate((md) => {
      (window as any).setEditorMarkdown(md);
    }, markdown);

    await page.waitForFunction(() => {
      return Boolean(document.querySelector(".ProseMirror table colgroup col"));
    });

    await triggerDividerDblClick(page, 1);
    await page.waitForTimeout(500);
    await triggerDividerDblClick(page, 3);
    await page.waitForTimeout(500);

    const baselineWidths = await getColumnWidths(page);
    expect(baselineWidths[0]).toBeGreaterThan(0);
    expect(baselineWidths[2]).toBeGreaterThan(0);

    await triggerDividerDblClick(page, 2);

    await page.waitForFunction((oldWidth) => {
      const col2 = document.querySelector(".ProseMirror table colgroup col:nth-child(2)") as HTMLTableColElement | null;
      const currentWidth = col2 ? col2.style.width : "";
      return currentWidth && currentWidth !== oldWidth;
    }, baselineWidths[1]);

    const finalWidths = await getColumnWidths(page);

    expect(finalWidths[0]).toBeCloseTo(baselineWidths[0], 0);
    expect(finalWidths[2]).toBeCloseTo(baselineWidths[2], 0);
    expect(finalWidths[1]).not.toBe(baselineWidths[1]);
  });
});
