import { expect, test } from "@playwright/test";
import { waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test.describe("Assist real second-send latency", () => {
  test("measures first and second real sends in the same session", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("assist-real-second-send-latency");

    attachPageDebugLogging(page, "assist-real-second-send-latency");

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);

    logStep("install-harness:start");
    await page.evaluate(() => {
      const w = window as any;
      const root = document.getElementById("chat-root");
      if (!w.GoToolkitAssistInstance && w.GoToolkitAssist?.mount && root) {
        w.GoToolkitAssistInstance = w.GoToolkitAssist.mount(root);
      }
      const assist = w.GoToolkitAssistInstance;
      if (!assist) throw new Error("GoToolkitAssistInstance unavailable");
      assist.open?.();

      w.__assistRealSeries = {
        currentRun: null as null | {
          prompt: string;
          clickAt: number;
          retrieval: Array<{ kind: string; startAt: number; endAt: number; durationMs: number }>;
          aiRequestStartAt: number;
          firstChunkAt: number;
          aiRequestEndAt: number;
          firstVisibleAt: number;
          finalVisibleAt: number;
          finalText: string;
          errors: string[];
        },
        runs: [] as any[]
      };

      const originalRetrieveWithFallback = assist.retrieveWithFallback?.bind(assist);
      if (originalRetrieveWithFallback && !assist.__seriesRetrieveWrapped) {
        assist.retrieveWithFallback = async function (
          question: string,
          conversationId: string,
          params: any,
          kind: string,
          traceId: string
        ) {
          const run = w.__assistRealSeries.currentRun;
          const startAt = performance.now();
          try {
            return await originalRetrieveWithFallback(question, conversationId, params, kind, traceId);
          } finally {
            const endAt = performance.now();
            if (run) {
              run.retrieval.push({
                kind: String(kind || ""),
                startAt,
                endAt,
                durationMs: endAt - startAt
              });
            }
          }
        };
        assist.__seriesRetrieveWrapped = true;
      }

      const originalChatCompletion = w.GoToolkitIA?.chatCompletion?.bind(w.GoToolkitIA);
      if (!originalChatCompletion) throw new Error("GoToolkitIA.chatCompletion unavailable");
      if (!w.__assistRealSeriesChatWrapped) {
        w.GoToolkitIA.chatCompletion = async function (options: any) {
          const run = w.__assistRealSeries.currentRun;
          if (run) run.aiRequestStartAt = performance.now();
          const originalOnChunk = options?.onChunk;
          const nextOptions = {
            ...options,
            onChunk: (chunk: string) => {
              if (run && !run.firstChunkAt && typeof chunk === "string" && chunk.trim()) {
                run.firstChunkAt = performance.now();
              }
              if (typeof originalOnChunk === "function") originalOnChunk(chunk);
            }
          };
          try {
            return await originalChatCompletion(nextOptions);
          } catch (error: any) {
            if (run) run.errors.push(String(error?.message || error || "unknown-chat-error"));
            throw error;
          } finally {
            if (run) run.aiRequestEndAt = performance.now();
          }
        };
        w.__assistRealSeriesChatWrapped = true;
      }

      const originalUpdateBotMessage = assist.updateBotMessage?.bind(assist);
      if (!originalUpdateBotMessage) throw new Error("Assist updateBotMessage unavailable");
      if (!assist.__seriesUpdateWrapped) {
        assist.updateBotMessage = function (message: any) {
          const result = originalUpdateBotMessage(message);
          const run = w.__assistRealSeries.currentRun;
          const text = String(message?.content || "").trim();
          if (run && run.clickAt && text) {
            if (!run.firstVisibleAt) {
              run.firstVisibleAt = performance.now();
            }
            if (!message?._isStreaming) {
              run.finalVisibleAt = performance.now();
              run.finalText = text;
            }
          }
          return result;
        };
        assist.__seriesUpdateWrapped = true;
      }
    });
    logStep("install-harness:done");

    async function runPrompt(prompt: string) {
      await page.evaluate(({ prompt }) => {
        const w = window as any;
        w.__assistRealSeries.currentRun = {
          prompt,
          clickAt: 0,
          retrieval: [],
          aiRequestStartAt: 0,
          firstChunkAt: 0,
          aiRequestEndAt: 0,
          firstVisibleAt: 0,
          finalVisibleAt: 0,
          finalText: "",
          errors: []
        };
        const assist = w.GoToolkitAssistInstance;
        if (!assist?.textarea || !assist?.sendButton) throw new Error("Assist composer unavailable");
        assist.textarea.value = prompt;
        assist.textarea.dispatchEvent(new Event("input", { bubbles: true }));
        assist.textarea.dispatchEvent(new Event("change", { bubbles: true }));
        w.__assistRealSeries.currentRun.clickAt = performance.now();
        assist.sendButton.click();
      }, { prompt });

      await expect
        .poll(async () => {
          return await page.evaluate(() => {
            const run = (window as any).__assistRealSeries.currentRun;
            return Boolean(
              run
              && Number(run.clickAt || 0) > 0
              && Number(run.aiRequestEndAt || 0) > 0
              && Number(run.firstVisibleAt || 0) > 0
              && String(run.finalText || "").trim().length > 0
            );
          });
        }, { timeout: 120_000 })
        .toBe(true);

      return await page.evaluate(() => {
        const w = window as any;
        const run = w.__assistRealSeries.currentRun;
        w.__assistRealSeries.runs.push(run);
        w.__assistRealSeries.currentRun = null;
        return run;
      });
    }

    const firstPrompt = `Reponds en une phrase courte. Termine par SECOND_RUN_PROBE_A_${Date.now()}.`;
    const secondPrompt = `Reponds en une phrase courte. Termine par SECOND_RUN_PROBE_B_${Date.now()}.`;

    logStep("first-send:start");
    const firstRun = await runPrompt(firstPrompt);
    logStep("first-send:done", firstRun);

    logStep("second-send:start");
    const secondRun = await runPrompt(secondPrompt);
    logStep("second-send:done", secondRun);

    expect(String(firstRun.finalText || "").trim().length).toBeGreaterThan(0);
    expect(String(secondRun.finalText || "").trim().length).toBeGreaterThan(0);
  });
});
