import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Assist OCR handwritten image", () => {
  test("extracts OCR text and logs OpenRouter + offline timings", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const dataDir = path.resolve(process.cwd(), "test-data");
    const filePath = path.join(dataDir, "sample_handwritten.webp");

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "load" });
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
      const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        try {
          return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
            })
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

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
      const result = await withTimeout(docManager.extractText(file), 45_000, "offline-ocr");
      const end = performance.now();
      const tesseractText = (result?.text || "").trim();

      const hasOpenRouter = typeof config?.isOpenRouterAvailable === "function"
        ? config.isOpenRouterAvailable()
        : Boolean(config?.getOpenRouterApiKey?.() || config?.OPENROUTER_PROXY_ENDPOINT);

      let qwenText = "";
      let qwenMetrics = null;
      let qwenError = "";
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
        try {
          const qwenResponse = await withTimeout(
            client.chatCompletion({ payload }),
            30_000,
            "openrouter-ocr"
          );
          const qwenEnd = performance.now();
          const extractText = (response: any) => {
            if (!response) return "";
            if (typeof response === "string") return response;
            const content = response?.choices?.[0]?.message?.content;
            if (typeof content === "string") return content;
            if (Array.isArray(content)) {
              const parts = content
                .map((entry: any) => entry?.text)
                .filter((value: any) => typeof value === "string" && value.trim());
              if (parts.length) {
                return parts.join("\n");
              }
            }
            if (typeof response?.text === "string") return response.text;
            if (typeof response?.content === "string") return response.content;
            return "";
          };
          qwenText = extractText(qwenResponse).trim();
          qwenMetrics = {
            durationMs: qwenEnd - qwenStart,
            inputTokens,
            outputTokens: estimateTokens(qwenText),
          };
        } catch (err: any) {
          qwenError = (err && err.message) ? String(err.message) : "openrouter-ocr-failed";
        }
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
        qwenError,
        hasOpenRouter,
        diffStats,
      };

      return (window as any).__ocrMetrics;
    });

    console.log("OCR metrics:", metrics);
    expect(metrics?.tesseractText?.length || 0).toBeGreaterThan(0);
    if (metrics?.hasOpenRouter && !metrics?.qwenError) {
      expect(metrics?.qwenText?.length || 0).toBeGreaterThan(0);
    }
  });
});
