import { expect, test } from "@playwright/test";
import { waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test.describe("Assist real first response latency", () => {
  test("measures end-to-end first visible response timing against the real backend", async ({ page }) => {
    test.setTimeout(180_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("assist-real-first-response-latency");
    const prompt = `Reponds en une seule phrase tres courte. Ne retourne ni JSON ni markdown. Termine par LATENCY_PROBE_${Date.now()}.`;

    attachPageDebugLogging(page, "assist-real-first-response-latency");

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    logStep("goto:ready");

    logStep("install-harness:start");
    await page.evaluate(() => {
      const w = window as any;
      const root = document.getElementById("chat-root");
      if (!w.GoToolkitAssistInstance && w.GoToolkitAssist?.mount && root) {
        w.GoToolkitAssistInstance = w.GoToolkitAssist.mount(root);
      }
      const assist = w.GoToolkitAssistInstance;
      if (!assist) {
        throw new Error("GoToolkitAssistInstance unavailable");
      }
      assist.open?.();

      w.__assistRealLatency = {
        clickAt: 0,
        retrieval: [] as Array<{ kind: string; startAt: number; endAt: number; durationMs: number }>,
        aiRequestStartAt: 0,
        firstChunkAt: 0,
        aiRequestEndAt: 0,
        firstVisibleAt: 0,
        finalVisibleAt: 0,
        finalText: "",
        finalTextLength: 0,
        errors: [] as string[]
      };

      const originalRetrieveWithFallback = assist.retrieveWithFallback?.bind(assist);
      if (originalRetrieveWithFallback && !assist.__realLatencyRetrieveWrapped) {
        assist.retrieveWithFallback = async function (
          question: string,
          conversationId: string,
          params: any,
          kind: string,
          traceId: string
        ) {
          const startAt = performance.now();
          try {
            return await originalRetrieveWithFallback(question, conversationId, params, kind, traceId);
          } finally {
            const endAt = performance.now();
            w.__assistRealLatency.retrieval.push({
              kind: String(kind || ""),
              startAt,
              endAt,
              durationMs: endAt - startAt
            });
          }
        };
        assist.__realLatencyRetrieveWrapped = true;
      }

      const originalChatCompletion = w.GoToolkitIA?.chatCompletion?.bind(w.GoToolkitIA);
      if (!originalChatCompletion) {
        throw new Error("GoToolkitIA.chatCompletion unavailable");
      }
      if (!w.__assistRealLatencyChatWrapped) {
        w.GoToolkitIA.chatCompletion = async function (options: any) {
          w.__assistRealLatency.aiRequestStartAt = performance.now();
          const originalOnChunk = options?.onChunk;
          const nextOptions = {
            ...options,
            onChunk: (chunk: string) => {
              if (!w.__assistRealLatency.firstChunkAt && typeof chunk === "string" && chunk.trim()) {
                w.__assistRealLatency.firstChunkAt = performance.now();
              }
              if (typeof originalOnChunk === "function") {
                originalOnChunk(chunk);
              }
            }
          };
          try {
            return await originalChatCompletion(nextOptions);
          } catch (error: any) {
            w.__assistRealLatency.errors.push(String(error?.message || error || "unknown-chat-error"));
            throw error;
          } finally {
            w.__assistRealLatency.aiRequestEndAt = performance.now();
          }
        };
        w.__assistRealLatencyChatWrapped = true;
      }

      const originalUpdateBotMessage = assist.updateBotMessage?.bind(assist);
      if (!originalUpdateBotMessage) {
        throw new Error("Assist updateBotMessage unavailable");
      }
      if (!assist.__realLatencyUpdateWrapped) {
        assist.updateBotMessage = function (message: any) {
          const result = originalUpdateBotMessage(message);
          const text = String(message?.content || "").trim();
          if (w.__assistRealLatency.clickAt && text) {
            if (!w.__assistRealLatency.firstVisibleAt) {
              w.__assistRealLatency.firstVisibleAt = performance.now();
            }
            if (!message?._isStreaming) {
              w.__assistRealLatency.finalVisibleAt = performance.now();
              w.__assistRealLatency.finalText = text;
              w.__assistRealLatency.finalTextLength = text.length;
            }
          }
          return result;
        };
        assist.__realLatencyUpdateWrapped = true;
      }
    });
    logStep("install-harness:done");

    logStep("send:start");
    await page.evaluate(({ prompt }) => {
      const w = window as any;
      const assist = w.GoToolkitAssistInstance;
      if (!assist?.textarea || !assist?.sendButton) {
        throw new Error("Assist composer unavailable");
      }
      assist.textarea.value = prompt;
      assist.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      assist.textarea.dispatchEvent(new Event("change", { bubbles: true }));
      w.__assistRealLatency.clickAt = performance.now();
      assist.sendButton.click();
    }, { prompt });

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const metrics = (window as any).__assistRealLatency;
          return Boolean(
            Number(metrics?.clickAt || 0) > 0
            && Number(metrics?.aiRequestStartAt || 0) > 0
            && Number(metrics?.aiRequestEndAt || 0) > 0
            && Number(metrics?.firstVisibleAt || 0) > 0
            && String(metrics?.finalText || "").trim().length > 0
          );
        });
      }, { timeout: 120_000 })
      .toBe(true);

    const metrics = await page.evaluate(() => (window as any).__assistRealLatency);
    logStep("send:done", metrics);

    expect(Array.isArray(metrics.errors)).toBeTruthy();
    expect(String(metrics.finalText || "").trim().length).toBeGreaterThan(0);
  });
});
