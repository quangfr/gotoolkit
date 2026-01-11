import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Assist OCR handwritten image", () => {
  test("extracts OCR text and logs OpenRouter + offline timings", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const dataDir = path.resolve(process.cwd(), "test-data");
    const filePath = path.join(dataDir, "ocr_handwritten.webp");

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    await page.waitForFunction(
      () => Boolean((window as any).GoToolkitAssistInstance?.docManager),
      null,
      { timeout: 30_000 }
    );

    await page.evaluate(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.id = "ocrTestInput";
      input.style.display = "none";
      document.body.appendChild(input);
    });

    await page.setInputFiles("#ocrTestInput", filePath);

    const metrics = await page.evaluate(async () => {
      const estimateTokens = (text: string) => {
        const raw = (text || "").toString();
        if (!raw) return 0;
        return Math.max(1, Math.ceil(raw.length / 4));
      };

      const client = (window as any).GoToolkitIA;
      const config = (window as any).GoToolkitIAConfig;
      const docManager = (window as any).GoToolkitDocumentManager;
      const input = document.getElementById("ocrTestInput") as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file || !docManager) {
        throw new Error("OCR input or document manager missing");
      }

      (window as any).__ocrMetrics = {};
      const start = performance.now();
      const result = await docManager.extractText(file);
      const end = performance.now();
      const tesseractText = (result?.text || "").trim();

      const hasOpenRouter = typeof config?.isOpenRouterAvailable === "function"
        ? config.isOpenRouterAvailable()
        : Boolean(config?.getOpenRouterApiKey?.() || config?.OPENROUTER_PROXY_ENDPOINT);

      let qwenText = "";
      let qwenMetrics = null;
      if (hasOpenRouter && client?.chatCompletion) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error || new Error("Read failed"));
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(file);
        });
        const prompt =
          (window as any).GoToolkitChatPrompt?.PRESETS?.extract?.prompt ||
          (window as any).GoToolkitChatPrompt?.PRESETS?.extract?.defaultPrompt ||
          "Extrayez tout le texte de cette image. Soyez précis. Retournez uniquement le texte brut.";
        const payload = {
          model: "qwen/qwen-2.5-vl-7b-instruct",
          stream: false,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl } }
              ]
            }
          ]
        };
        const inputTokens = estimateTokens(prompt);
        const qwenStart = performance.now();
        const qwenResponse = await client.chatCompletion({ payload });
        const qwenEnd = performance.now();
        qwenText = (qwenResponse || "").trim();
        qwenMetrics = {
          durationMs: qwenEnd - qwenStart,
          inputTokens,
          outputTokens: estimateTokens(qwenText),
        };
      }

      const diffStats = qwenText
        ? {
            tesseractLength: tesseractText.length,
            qwenLength: qwenText.length,
            lengthDelta: qwenText.length - tesseractText.length,
            tesseractPreview: tesseractText.slice(0, 200),
            qwenPreview: qwenText.slice(0, 200),
          }
        : null;

      (window as any).__ocrMetrics = {
        total: {
          totalDurationMs: end - start,
          offlineDurationMs: end - start,
          cloudDurationMs: 0,
        },
        tesseractText,
        qwenText,
        qwenMetrics,
        hasOpenRouter,
        diffStats,
      };

      return (window as any).__ocrMetrics;
    });

    console.log("OCR metrics:", metrics);
    expect(metrics?.tesseractText?.length || 0).toBeGreaterThan(0);
    if (metrics?.hasOpenRouter) {
      expect(metrics?.qwenText?.length || 0).toBeGreaterThan(0);
    }
  });
});
