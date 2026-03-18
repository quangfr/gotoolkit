import { expect, test } from "@playwright/test";
import { waitForMemoReady } from "../helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "../helpers/test-debug";

test.describe("Assist first response latency", () => {
  test("starts retrieval in parallel and keeps first visible AI response under the combined sequential delay", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("assist-first-response-latency");
    const marker = `AI_LATENCY_MARKER_${Date.now()}`;

    attachPageDebugLogging(page, "assist-first-response-latency");

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    logStep("goto:ready");

    logStep("install-harness:start");
    await page.evaluate(({ marker }) => {
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

      w.__assistLatencyMetrics = {
        clickAt: 0,
        firstVisibleAt: 0,
        firstVisibleText: "",
        retrievalStarts: [] as Array<{ kind: string; at: number }>,
        retrievalEnds: [] as Array<{ kind: string; at: number }>,
        aiRequestStartAt: 0,
        aiRequestEndAt: 0
      };

      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      const originalRetrieveWithFallback = assist.retrieveWithFallback?.bind(assist);
      assist.retrieveWithFallback = async function (
        question: string,
        conversationId: string,
        params: any,
        kind: string,
        traceId: string
      ) {
        w.__assistLatencyMetrics.retrievalStarts.push({
          kind: String(kind || ""),
          at: performance.now()
        });
        await wait(700);
        w.__assistLatencyMetrics.retrievalEnds.push({
          kind: String(kind || ""),
          at: performance.now()
        });
        if (originalRetrieveWithFallback && kind === "__never__") {
          return originalRetrieveWithFallback(question, conversationId, params, kind, traceId);
        }
        return [];
      };

      assist.getKnowledgeFallbackHits = async function () {
        return [];
      };

      w.GoToolkitIA = w.GoToolkitIA || {};
      w.GoToolkitIA.chatCompletion = async function () {
        w.__assistLatencyMetrics.aiRequestStartAt = performance.now();
        await wait(50);
        w.__assistLatencyMetrics.aiRequestEndAt = performance.now();
        return {
          text: JSON.stringify({
            answer: {
              content: marker
            },
            references: [],
            suggestions: []
          }),
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2
          }
        };
      };

      const sidebar = document.getElementById("assistSidebar");
      const messagesRoot = sidebar?.querySelector(".chat-messages");
      if (!messagesRoot) {
        throw new Error("Assist messages container unavailable");
      }
      const observer = new MutationObserver(() => {
        const text = String(messagesRoot.textContent || "");
        if (!w.__assistLatencyMetrics.clickAt) return;
        if (!text.includes(marker)) return;
        if (!w.__assistLatencyMetrics.firstVisibleAt) {
          w.__assistLatencyMetrics.firstVisibleAt = performance.now();
          w.__assistLatencyMetrics.firstVisibleText = text;
          observer.disconnect();
        }
      });
      observer.observe(messagesRoot, { childList: true, subtree: true, characterData: true });
    }, { marker });
    logStep("install-harness:done");

    logStep("send:start");
    await page.evaluate(() => {
      const w = window as any;
      const assist = w.GoToolkitAssistInstance;
      if (!assist?.textarea || !assist?.sendButton) {
        throw new Error("Assist composer unavailable");
      }
      assist.textarea.value = "Mesure la latence du premier rendu IA.";
      assist.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      assist.textarea.dispatchEvent(new Event("change", { bubbles: true }));
      w.__assistLatencyMetrics.clickAt = performance.now();
      assist.sendButton.click();
    });

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const metrics = (window as any).__assistLatencyMetrics;
          return Array.isArray(metrics?.retrievalStarts)
            && metrics.retrievalStarts.length === 2
            && Array.isArray(metrics?.retrievalEnds)
            && metrics.retrievalEnds.length === 2
            && Number(metrics?.aiRequestStartAt || 0) > 0
            && Number(metrics?.aiRequestEndAt || 0) > 0
            && Number(metrics?.firstVisibleAt || 0) > 0;
        });
      }, { timeout: 20_000 })
      .toBe(true);

    const finalMetrics = await page.evaluate(() => (window as any).__assistLatencyMetrics);
    logStep("send:done", finalMetrics);

    expect(finalMetrics.retrievalStarts).toHaveLength(2);
    expect(finalMetrics.retrievalEnds).toHaveLength(2);

    const contextStart = finalMetrics.retrievalStarts.find((entry: any) => entry.kind === "context")?.at ?? 0;
    const knowledgeStart = finalMetrics.retrievalStarts.find((entry: any) => entry.kind === "knowledge")?.at ?? 0;
    expect(Math.abs(contextStart - knowledgeStart)).toBeLessThan(200);

    const firstVisibleDelay = finalMetrics.firstVisibleAt - finalMetrics.clickAt;
    const aiStartDelay = finalMetrics.aiRequestStartAt - finalMetrics.clickAt;
    expect(aiStartDelay).toBeLessThan(1000);
    expect(firstVisibleDelay).toBeLessThan(1100);
    expect(String(finalMetrics.firstVisibleText || "")).toContain(marker);
  });
});
