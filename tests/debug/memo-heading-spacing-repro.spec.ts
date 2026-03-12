import { expect, test } from "@playwright/test";
import path from "node:path";

const BASE_URL = "http://127.0.0.1:5000/index.html";
const SAMPLE_MARKDOWN_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const TEST_TIMEOUT = 180_000;

async function waitForMemoBootstrap(page: any, timeout = 60_000) {
  await page.waitForFunction(() => Boolean(
    (window as any).GoToolkitMemoCreateAutoDocument
    && (window as any).GoToolkitMemoInstance
  ), { timeout });
}

async function ensureAssist(page: any) {
  await page.evaluate(async () => {
    const w = window as any;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (w.GoToolkitAssistInstance?.openImportFileSelector) return;
      if (w.GoToolkitAssist?.mount && !w.GoToolkitAssistInstance) {
        const chatRoot = document.getElementById("chat-root");
        if (chatRoot) {
          const instance = w.GoToolkitAssist.mount(chatRoot);
          w.GoToolkitAssistInstance = instance;
          try {
            instance?.close?.();
          } catch {
            // ignore
          }
          if (w.GoToolkitAssistInstance?.openImportFileSelector) return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("GoToolkitAssistInstance.openImportFileSelector unavailable");
  });
}

async function collectHeadingBlockSpacing(page: any) {
  return page.evaluate(() => {
    const root = document.querySelector(".editor-wrap .ProseMirror");
    if (!root) return [];
    const blockLabel = (node: Element | null) => {
      if (!node) return "";
      const el = node as HTMLElement;
      if (el.matches("ul,ol")) return el.tagName.toLowerCase();
      if (el.matches("table,.tableWrapper")) return "table";
      if (el.matches("mermaid-diagram,.mermaid-diagram-wrapper,.node-mermaidDiagram")) return "mermaid";
      return el.tagName.toLowerCase();
    };
    return Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading: Element) => {
      const next = heading.nextElementSibling;
      const nextText = String(next?.textContent || "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
      const afterNext = next?.nextElementSibling || null;
      return {
        heading: String(heading.textContent || "").trim(),
        headingTag: heading.tagName.toLowerCase(),
        nextTag: next?.tagName?.toLowerCase() || "",
        nextText,
        nextHtml: String((next as HTMLElement | null)?.innerHTML || ""),
        afterNextTag: afterNext?.tagName?.toLowerCase() || "",
        nextRole: blockLabel(next),
        afterNextRole: blockLabel(afterNext),
        hasSpacerParagraph: Boolean(
          next
          && next.tagName.toLowerCase() === "p"
          && !nextText
          && ["table", "mermaid", "ul", "ol"].includes(blockLabel(afterNext))
        ),
      };
    }).filter((entry: any) => entry.heading);
  });
}

test.describe("Memo heading spacing repro", () => {
  test("does not reinsert heading spacer paragraph after backspace", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);

    page.on("console", msg => {
      console.log("[browser:console]", msg.type(), msg.text());
    });
    page.on("pageerror", err => {
      console.log("[browser:pageerror]", err.message);
    });

    await page.goto(BASE_URL, { waitUntil: "load", timeout: 30_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });

    await waitForMemoBootstrap(page);
    await ensureAssist(page);

    await page.evaluate(async () => {
      const w = window as any;
      await w.GoToolkitMemoCreateAutoDocument();
      w.GoToolkitMemoInstance?.setValue?.("");
    });

    await page.locator("#fileMenuBtn").click();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("#memoOpenImportBtn").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(SAMPLE_MARKDOWN_PATH);

    await expect.poll(async () => {
      const spacing = await collectHeadingBlockSpacing(page);
      return spacing.length;
    }, { timeout: 90_000 }).toBeGreaterThan(5);

    const before = await collectHeadingBlockSpacing(page);
    console.log("=== spacing-before ===");
    console.log(JSON.stringify(before.filter((entry: any) => (
      entry.hasSpacerParagraph
      || /Tableaux|Diagramme/.test(entry.heading)
    )), null, 2));

    const target = page.locator(".editor-wrap .ProseMirror h1, .editor-wrap .ProseMirror h2, .editor-wrap .ProseMirror h3").filter({ hasText: /Tableaux|Diagramme/ }).first();
    await target.click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(1500);

    const after = await collectHeadingBlockSpacing(page);
    console.log("=== spacing-after ===");
    console.log(JSON.stringify(after.filter((entry: any) => (
      entry.hasSpacerParagraph
      || /Tableaux|Diagramme/.test(entry.heading)
    )), null, 2));

    expect(after.some((entry: any) => entry.hasSpacerParagraph)).toBe(false);
  });
});
