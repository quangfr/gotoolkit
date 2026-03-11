import { expect, test } from "@playwright/test";
import { clickMemoDoc, waitForMemoReady } from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 180_000;
const TARGET_HEADING_ID = "playwright-empty-heading-refresh-target";
const EDIT_TEXT = "Playwright heading edit";
const INITIAL_CONTENT = `<h3 id="${TARGET_HEADING_ID}" data-toc-id="${TARGET_HEADING_ID}"></h3>`;

test.describe("Memo empty heading refresh", () => {
  test("keeps text typed into a newly created empty heading after immediate refresh", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    const logStep = createStepLogger("memo-empty-heading-refresh");
    attachPageDebugLogging(page, "memo-empty-heading-refresh");

    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    await waitForMemoReady(page, 60_000);
    logStep("memo-ready");

    const seed = await page.evaluate(async ({ initialContent }) => {
      const w = window as any;
      if (typeof w.GoToolkitMemoCreateDocument !== "function") {
        throw new Error("GoToolkitMemoCreateDocument unavailable");
      }
      await w.GoToolkitMemoCreateDocument({
        name: "Playwright Empty Heading Refresh",
        initialContent,
      });
      const docId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
      if (!docId) {
        throw new Error("Failed to create active memo document");
      }
      return { docId };
    }, { initialContent: INITIAL_CONTENT });
    logStep("seeded-empty-heading-doc", seed);

    await expect.poll(async () => {
      return page.evaluate(() => {
        const raw = String((window as any).getMemoEditorSource?.("json") || "");
        const json = JSON.parse(raw || "{}");
        const headings = Array.isArray(json?.content) ? json.content : [];
        const target = headings.find((node: any) => (
          node?.type === "heading"
          && String(node?.attrs?.id || "") === "playwright-empty-heading-refresh-target"
        ));
        return Boolean(target?.attrs?.id) && !Array.isArray(target?.content);
      });
    }, { timeout: 30_000 }).toBeTruthy();
    const targetHeading = { id: TARGET_HEADING_ID, level: 3 };
    logStep("empty-heading-found", targetHeading);

    await page.evaluate(({ headingId }) => {
      const w = window as any;
      const editor = w.MemoEditor || w.memoEditor;
      if (!editor) throw new Error("MemoEditor unavailable");
      let targetPos: number | null = null;
      editor.state.doc.descendants((node: any, pos: number) => {
        if (node?.type?.name === "heading" && String(node?.attrs?.id || "") === String(headingId || "")) {
          targetPos = pos;
          return false;
        }
        return true;
      });
      if (!Number.isFinite(Number(targetPos))) {
        throw new Error(`Heading not found for id=${headingId}`);
      }
      editor.chain().focus().setTextSelection(Number(targetPos) + 1).run();
    }, { headingId: targetHeading.id });
    await page.keyboard.type(EDIT_TEXT);
    logStep("typed-into-empty-heading", targetHeading);
    const textBeforeRefresh = await page.evaluate(({ headingId }) => {
      const raw = String((window as any).getMemoEditorSource?.("json") || "");
      const json = JSON.parse(raw || "{}");
      const headings = Array.isArray(json?.content) ? json.content : [];
      const target = headings.find((node: any) => node?.type === "heading" && String(node?.attrs?.id || "") === String(headingId || ""));
      return Array.isArray(target?.content)
        ? target.content
            .filter((child: any) => child?.type === "text")
            .map((child: any) => String(child?.text || ""))
            .join("")
        : "";
    }, { headingId: targetHeading.id });
    logStep("heading-text-before-refresh", { textBeforeRefresh });

    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 60_000);
    await clickMemoDoc(page, seed.docId, { allowProgrammaticOpen: true, timeout: 60_000 });
    logStep("reloaded-immediately-and-reopened-doc");

    await expect.poll(async () => {
      return page.evaluate(({ headingId }) => {
        const raw = String((window as any).getMemoEditorSource?.("json") || "");
        const json = JSON.parse(raw || "{}");
        const headings = Array.isArray(json?.content) ? json.content : [];
        const target = headings.find((node: any) => node?.type === "heading" && String(node?.attrs?.id || "") === String(headingId || ""));
        const texts = Array.isArray(target?.content)
          ? target.content.filter((child: any) => child?.type === "text").map((child: any) => String(child?.text || "")).join("")
          : "";
        return texts;
      }, { headingId: targetHeading.id });
    }, { timeout: 20_000 }).toContain(EDIT_TEXT);
    logStep("heading-edit-retained-after-refresh");
  });
});
