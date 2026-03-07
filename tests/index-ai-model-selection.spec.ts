import { expect, test } from "@playwright/test";

test.describe("Index AI model selection", () => {
  test("persists selected model and sends it in Assist payload", async ({ page }) => {
    test.setTimeout(120_000);

    const browserLogs: string[] = [];
    const openRouterPayloads: Array<{ model: string | null; url: string }> = [];

    page.on("console", msg => {
      const text = msg.text();
      browserLogs.push(`[console:${msg.type()}] ${text}`);
      // eslint-disable-next-line no-console
      console.log(`[BROWSER:${msg.type()}] ${text}`);
    });
    page.on("pageerror", err => {
      browserLogs.push(`[pageerror] ${err.message}`);
      // eslint-disable-next-line no-console
      console.log(`[PAGEERROR] ${err.message}`);
    });
    page.on("request", request => {
      const url = request.url();
      if (!url.includes("openrouter.gotoolkit.workers.dev/api/v1/chat/completions")) return;
      let model: string | null = null;
      try {
        const body = request.postDataJSON();
        model = typeof body?.model === "string" ? body.model : null;
      } catch {
        model = null;
      }
      openRouterPayloads.push({ model, url });
      // eslint-disable-next-line no-console
      console.log(`[REQUEST] ${url} model=${model ?? "null"}`);
    });
    page.on("response", response => {
      const url = response.url();
      if (!url.includes("openrouter.gotoolkit.workers.dev/api/v1/chat/completions")) return;
      // eslint-disable-next-line no-console
      console.log(`[RESPONSE] ${response.status()} ${url}`);
    });

    await page.addInitScript(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
      (window as any).GoToolkitTurnstile = {
        async getHeadersForUrl() {
          return {};
        },
        clearDiagnostics() {},
        getFailureSummary() {
          return "";
        },
        getLastAttemptSummary() {
          return null;
        },
        getDiagnostics() {
          return [];
        }
      };
    });

    await page.route("**/api/v1/chat/completions", async route => {
      const url = route.request().url();
      if (!url.includes("openrouter.gotoolkit.workers.dev") && !url.includes("openrouter.ai")) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: "ok"
              }
            }
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2
          }
        })
      });
    });

    // eslint-disable-next-line no-console
    console.log("[STEP] goto");
    await page.goto("http://127.0.0.1:5000/index", { waitUntil: "commit" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitIAConfig && (window as any).GoToolkitAssistInstance), null, {
      timeout: 60_000
    });

    // eslint-disable-next-line no-console
    console.log("[STEP] dismiss-tour");
    await page.evaluate(() => {
      try {
        const cleanup = (window as any).__goToolkitDocsTourCleanup;
        if (typeof cleanup === "function") cleanup();
      } catch {
        // ignore
      }
      document.querySelectorAll(".docs-tour-overlay, .docs-tour-highlight, .docs-tour-card").forEach(el => {
        try {
          (el as HTMLElement).remove();
        } catch {
          // ignore
        }
      });
    });

    // eslint-disable-next-line no-console
    console.log("[STEP] open-settings");
    await page.evaluate(() => {
      const trigger = document.getElementById("memoSettingsBtn");
      if (trigger) {
        trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
      const modal = document.getElementById("settingsModal");
      const dialog = modal?.querySelector(".settings-modal");
      if (modal && !modal.classList.contains("open") && (window as any).GoToolkitSettingsModal?.bind) {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        if (dialog) dialog.classList.add("modal");
      }
    });
    await page.waitForFunction(() => document.getElementById("settingsModal")?.classList.contains("open"), null, {
      timeout: 30_000
    });
    await page.click('#settingsModal .settings-tabs .tab-btn[data-tab="promptTab"]');
    await page.waitForSelector("#openrouterModelInput");

    const modelChoices = await page.locator("#openrouterModelInput option").evaluateAll(nodes =>
      nodes.map(node => (node as HTMLOptionElement).value).filter(Boolean)
    );
    const initialModel = await page.locator("#openrouterModelInput").inputValue();
    const targetModel = modelChoices.find(value => value !== initialModel) || null;
    expect(targetModel, `No alternate model found. options=${modelChoices.join(",")}`).toBeTruthy();

    // eslint-disable-next-line no-console
    console.log(`[STEP] select-model ${targetModel}`);
    await page.selectOption("#openrouterModelInput", targetModel!);
    await page.click("#saveSettingsBtn");
    await page.waitForTimeout(500);

    const afterSave = await page.evaluate(() => ({
      stored: localStorage.getItem("go-toolkit-openrouter-model"),
      configured: (window as any).GoToolkitIAConfig?.getOpenRouterModel?.() || null,
      backendModelPromise: Boolean((window as any).GoToolkitAIBackend?.getBackend)
    }));
    // eslint-disable-next-line no-console
    console.log(`[STEP] after-save ${JSON.stringify(afterSave)}`);

    expect(afterSave.stored).toBe(targetModel);
    expect(afterSave.configured).toBe(targetModel);

    const backendInfo = await page.evaluate(async () => {
      const info = await (window as any).GoToolkitAIBackend?.getBackend?.("responses");
      return {
        type: info?.type || null,
        endpoint: info?.endpoint || null,
        model: info?.model || null
      };
    });
    // eslint-disable-next-line no-console
    console.log(`[STEP] backend ${JSON.stringify(backendInfo)}`);
    expect(backendInfo.model).toBe(targetModel);

    // eslint-disable-next-line no-console
    console.log("[STEP] open-assist");
    await page.evaluate(() => {
      (window as any).GoToolkitAssistInstance?.open?.();
    });

    const chatInput = page.locator("textarea.chat-input:visible").first();
    await expect(chatInput).toBeVisible({ timeout: 30_000 });

    // eslint-disable-next-line no-console
    console.log("[STEP] send-chat");
    await chatInput.fill("Réponds juste ok");
    await page.click("button.chat-send-btn:visible");

    await page.waitForFunction(() => {
      const value = (window as any).__gtLastPayloadModel;
      return typeof value === "string" && value.trim().length > 0;
    }, null, { timeout: 30_000 }).catch(() => {});

    const sendState = await page.evaluate(() => ({
      lastPayloadModel: (window as any).__gtLastPayloadModel || null,
      configured: (window as any).GoToolkitIAConfig?.getOpenRouterModel?.() || null
    }));
    // eslint-disable-next-line no-console
    console.log(`[STEP] after-send ${JSON.stringify(sendState)}`);

    const requestModels = openRouterPayloads.map(entry => entry.model).filter(Boolean);
    expect(sendState.configured).toBe(targetModel);
    expect(requestModels.length, `No OpenRouter payload captured.\nLogs:\n${browserLogs.join("\n")}`).toBeGreaterThan(0);
    expect(requestModels.at(-1)).toBe(targetModel);
  });
});
