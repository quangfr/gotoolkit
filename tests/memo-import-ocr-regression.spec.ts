import { expect, test } from "@playwright/test";
import { clickMemoDoc, dismissShareAccessGateIfPresent, getMemoEditorHtml, waitForMemoReady } from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 180_000;
const SAMPLE_SCAN_TEXT = "Playwright OCR JPG sample text.";
const SAMPLE_PDF_TEXT = "Playwright PDF sample text.";
const SAMPLE_SCAN_HEADING = "Imported JPG";
const SAMPLE_PDF_HEADING = "Imported PDF";
const IMPORTED_MARKDOWN = [
  `## ${SAMPLE_SCAN_HEADING}`,
  "",
  SAMPLE_SCAN_TEXT,
  "",
  "---",
  "",
  `## ${SAMPLE_PDF_HEADING}`,
  "",
  SAMPLE_PDF_TEXT,
].join("\n");

test.describe("Memo OCR import regression", () => {
  test("private doc imports jpg + pdf through AI markdown conversion into the active document", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    const logStep = createStepLogger("memo-import-ocr-regression:private-direct-paste");
    attachPageDebugLogging(page, "memo-import-ocr-regression:private-direct-paste");

    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await page.evaluate(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });
    await dismissShareAccessGateIfPresent(page, 8_000);
    await waitForMemoReady(page, 60_000);
    await page.evaluate(async () => {
      const w = window as any;
      if (w.GoToolkitAssistInstance?.sendImportedDocuments) return;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (w.GoToolkitAssistInstance?.sendImportedDocuments) return;
        if (w.GoToolkitAssist?.mount && !w.GoToolkitAssistInstance) {
          const chatRoot = document.getElementById("chat-root");
          if (chatRoot) {
            const chatInstance = w.GoToolkitAssist.mount(chatRoot);
            w.GoToolkitAssistInstance = chatInstance;
            if (chatInstance && typeof chatInstance.close === "function") {
              try {
                chatInstance.close();
              } catch {
                // ignore
              }
            }
            if (w.GoToolkitAssistInstance?.sendImportedDocuments) return;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error("GoToolkitAssistInstance.sendImportedDocuments unavailable after assist mount retry");
    });
    await page.waitForFunction(() => {
      const w = window as any;
      return Boolean(
        w.GoToolkitMemoCreateAutoDocument
        && w.GoToolkitMemoGetActiveDocumentId
        && w.GoToolkitAssistInstance
        && typeof w.GoToolkitAssistInstance.sendImportedDocuments === "function"
      );
    }, null, { timeout: 120_000 });
    logStep("memo-apis-ready");

    const docId = await page.evaluate(async () => {
      if (typeof (window as any).GoToolkitMemoCreateAutoDocument !== "function") {
        throw new Error("GoToolkitMemoCreateAutoDocument unavailable");
      }
      await (window as any).GoToolkitMemoCreateAutoDocument();
      const activeId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim();
      if (!activeId) {
        throw new Error("Failed to create active private memo document");
      }
      return activeId;
    });
    logStep("private-doc-created", { docId });

    await clickMemoDoc(page, docId, { allowProgrammaticOpen: true, timeout: 60_000 });

    await page.evaluate(({ sampleScanText, samplePdfText }) => {
      const assist = (window as any).GoToolkitAssistInstance;
      const docManager = assist?.docManager;
      if (!assist || !docManager || typeof docManager.extractText !== "function") {
        throw new Error("Assist import stack unavailable");
      }
      if ((window as any).__pwImportExtractTextInstalled) return;
      const originalExtractText = docManager.extractText.bind(docManager);
      docManager.extractText = async (file: File) => {
        const name = String(file?.name || "").trim().toLowerCase();
        if (name === "sample_scan.jpg") {
          return { text: sampleScanText };
        }
        if (name === "sample.pdf") {
          return { text: samplePdfText };
        }
        return originalExtractText(file);
      };
      (window as any).__pwImportExtractTextInstalled = true;
    }, { sampleScanText: SAMPLE_SCAN_TEXT, samplePdfText: SAMPLE_PDF_TEXT });
    logStep("extract-text-harness-installed");

    await page.evaluate(({ importedMarkdown, sampleScanText, samplePdfText }) => {
      const ai = (window as any).GoToolkitIA;
      if (!ai || typeof ai.chatCompletion !== "function") {
        throw new Error("GoToolkitIA.chatCompletion unavailable");
      }
      if ((window as any).__pwImportAiHarnessInstalled) return;
      const originalChatCompletion = ai.chatCompletion.bind(ai);
      (window as any).__pwImportAiRequests = [];
      ai.chatCompletion = async (request: any) => {
        (window as any).__pwImportAiRequests.push(request);
        const userMessage = Array.isArray(request?.payload?.messages)
          ? request.payload.messages.find((message: any) => message?.role === "user")
          : null;
        const userContent = String(userMessage?.content || "");
        if (userContent.includes(sampleScanText) && userContent.includes(samplePdfText)) {
          return {
            text: JSON.stringify({
              answer: "Import effectue avec succes.",
              output: importedMarkdown,
            }),
          };
        }
        return originalChatCompletion(request);
      };
      (window as any).__pwImportAiHarnessInstalled = true;
    }, {
      importedMarkdown: IMPORTED_MARKDOWN,
      sampleScanText: SAMPLE_SCAN_TEXT,
      samplePdfText: SAMPLE_PDF_TEXT,
    });
    logStep("ai-import-harness-installed");

    await page.evaluate(async () => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (!assist || typeof assist.sendImportedDocuments !== "function") {
        throw new Error("sendImportedDocuments unavailable");
      }
      const sampleScan = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "sample_scan.jpg", {
        type: "image/jpeg",
      });
      const samplePdf = new File([new TextEncoder().encode("%PDF-1.4\n% Playwright sample\n")], "sample.pdf", {
        type: "application/pdf",
      });
      await assist.sendImportedDocuments([sampleScan, samplePdf], {
        skipEmbeddings: true,
        directPasteMode: true,
        markdownViaAi: true,
      });
    });
    logStep("fixtures-imported");

    await expect.poll(async () => {
      const html = await getMemoEditorHtml(page);
      return [
        html.includes("<h2"),
        html.includes(SAMPLE_SCAN_HEADING),
        html.includes(SAMPLE_SCAN_TEXT),
        html.includes(SAMPLE_PDF_HEADING),
        html.includes(SAMPLE_PDF_TEXT),
      ];
    }, { timeout: 60_000 }).toEqual([true, true, true, true, true]);
    logStep("imported-text-visible");

    const preMarkdownSnapshot = await page.evaluate(() => ({
      markdown: String((window as any).getMemoEditorSource?.("markdown") || ""),
      html: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
    }));
    logStep("pre-markdown-assert-snapshot", preMarkdownSnapshot);

    await expect.poll(async () => {
      const markdown = await page.evaluate(() => String((window as any).getMemoEditorSource?.("markdown") || ""));
      return [
        markdown.includes(`## ${SAMPLE_SCAN_HEADING}`),
        markdown.includes(SAMPLE_SCAN_TEXT),
        markdown.includes(`## ${SAMPLE_PDF_HEADING}`),
        markdown.includes(SAMPLE_PDF_TEXT),
        !markdown.includes("<p>"),
        !markdown.includes("<h"),
      ];
    }, { timeout: 30_000 }).toEqual([true, true, true, true, true, true]);
    logStep("markdown-source-verified");

    const finalSnapshot = await page.evaluate(() => ({
      markdown: String((window as any).getMemoEditorSource?.("markdown") || ""),
      html: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
    }));
    logStep("final-editor-snapshot", finalSnapshot);

    await expect.poll(async () => {
      return page.evaluate(() => {
        const requests = Array.isArray((window as any).__pwImportAiRequests) ? (window as any).__pwImportAiRequests : [];
        const importRequest = requests.find((request: any) => {
          const messages = Array.isArray(request?.payload?.messages) ? request.payload.messages : [];
          const userMessage = messages.find((message: any) => message?.role === "user");
          return String(userMessage?.content || "").includes("DOCUMENT\n");
        });
        return [
          Boolean(importRequest),
          String(importRequest?.endpointType || "") === "responses",
          String(importRequest?.payload?.model || "").length > 0,
        ];
      });
    }, { timeout: 30_000 }).toEqual([true, true, true]);
    logStep("ai-request-verified");
  });
});
