import { expect, test } from "@playwright/test";
import { waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test.describe("Assist reload warmth", () => {
  test("measures cold send, warm send, reload, then post-reload send", async ({ page }) => {
    test.setTimeout(300_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("assist-reload-warmth");

    attachPageDebugLogging(page, "assist-reload-warmth");

    async function installHarness() {
      await expect
        .poll(async () => {
          return await page.evaluate(() => {
            const w = window as any;
            if (w.GoToolkitAssistInstance) return true;
            const root = document.getElementById("chat-root");
            if (root && w.GoToolkitAssist?.mount) {
              w.GoToolkitAssistInstance = w.GoToolkitAssist.mount(root);
            }
            return Boolean(w.GoToolkitAssistInstance);
          });
        }, { timeout: 20_000 })
        .toBe(true);

      await page.evaluate(() => {
        const w = window as any;
        const assist = w.GoToolkitAssistInstance;
        if (!assist) throw new Error("GoToolkitAssistInstance unavailable");
        assist.open?.();

        w.__assistReloadWarmth = {
          currentRun: null as any,
          runs: [] as any[]
        };

        const originalRetrieveWithFallback = assist.retrieveWithFallback?.bind(assist);
        if (originalRetrieveWithFallback && !assist.__reloadWarmthRetrieveWrapped) {
          assist.retrieveWithFallback = async function (
            question: string,
            conversationId: string,
            params: any,
            kind: string,
            traceId: string
          ) {
            const run = w.__assistReloadWarmth.currentRun;
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
          assist.__reloadWarmthRetrieveWrapped = true;
        }

        const originalChatCompletion = w.GoToolkitIA?.chatCompletion?.bind(w.GoToolkitIA);
        if (!originalChatCompletion) throw new Error("GoToolkitIA.chatCompletion unavailable");
        if (!w.__assistReloadWarmthChatWrapped) {
          w.GoToolkitIA.chatCompletion = async function (options: any) {
            const run = w.__assistReloadWarmth.currentRun;
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
          w.__assistReloadWarmthChatWrapped = true;
        }

        const originalUpdateBotMessage = assist.updateBotMessage?.bind(assist);
        if (!originalUpdateBotMessage) throw new Error("Assist updateBotMessage unavailable");
        if (!assist.__reloadWarmthUpdateWrapped) {
          assist.updateBotMessage = function (message: any) {
            const result = originalUpdateBotMessage(message);
            const run = w.__assistReloadWarmth.currentRun;
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
          assist.__reloadWarmthUpdateWrapped = true;
        }
      });
    }

    async function runPrompt(label: string, prompt: string) {
      await page.evaluate(({ label, prompt }) => {
        const w = window as any;
        const assist = w.GoToolkitAssistInstance;
        if (!assist?.textarea || !assist?.sendButton) throw new Error("Assist composer unavailable");

        w.__assistReloadWarmth.currentRun = {
          label,
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

        assist.textarea.value = prompt;
        assist.textarea.dispatchEvent(new Event("input", { bubbles: true }));
        assist.textarea.dispatchEvent(new Event("change", { bubbles: true }));
        w.__assistReloadWarmth.currentRun.clickAt = performance.now();
        assist.sendButton.click();
      }, { label, prompt });

      await expect
        .poll(async () => {
          return await page.evaluate(() => {
            const run = (window as any).__assistReloadWarmth.currentRun;
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
        const run = w.__assistReloadWarmth.currentRun;
        w.__assistReloadWarmth.runs.push(run);
        w.__assistReloadWarmth.currentRun = null;
        return run;
      });
    }

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await installHarness();
    logStep("goto:ready");

    const seed = Date.now();
    const coldPrompt = `Reponds en une phrase courte. Termine par RELOAD_WARM_PROBE_COLD_${seed}.`;
    const warmPrompt = `Reponds en une phrase courte. Termine par RELOAD_WARM_PROBE_WARM_${seed}.`;
    const reloadPrompt = `Reponds en une phrase courte. Termine par RELOAD_WARM_PROBE_RELOAD_${seed}.`;

    logStep("cold-send:start");
    const coldRun = await runPrompt("cold-send", coldPrompt);
    logStep("cold-send:done", coldRun);

    logStep("warm-send:start");
    const warmRun = await runPrompt("warm-send", warmPrompt);
    logStep("warm-send:done", warmRun);

    logStep("reload:start");
    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await installHarness();
    logStep("reload:done");

    logStep("post-reload-send:start");
    const postReloadRun = await runPrompt("post-reload-send", reloadPrompt);
    logStep("post-reload-send:done", postReloadRun);

    expect(String(coldRun.finalText || "").trim().length).toBeGreaterThan(0);
    expect(String(warmRun.finalText || "").trim().length).toBeGreaterThan(0);
    expect(String(postReloadRun.finalText || "").trim().length).toBeGreaterThan(0);
  });
});
