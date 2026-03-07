import { expect, test } from "@playwright/test";
test("headed repro for Turnstile-protected OpenRouter worker", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).GO_TOOLKIT_FORCE_INTERACTIVE_TURNSTILE = true;
    (window as any).GO_TOOLKIT_TURNSTILE_DEBUG = true;
  });

  page.on("console", async msg => {
    const text = msg.text();
    if (
      /turnstile|cloudflare|challenge-platform|openrouter\.gotoolkit\.workers\.dev|VM\d+/i.test(text)
      || msg.type() === "error"
    ) {
      console.log(`[browser:${msg.type()}] ${text}`);
    }
  });

  page.on("pageerror", error => {
    console.log(`[pageerror] ${error?.message || error}`);
  });

  page.on("request", request => {
    const url = request.url();
    if (/openrouter\.gotoolkit\.workers\.dev|challenges\.cloudflare\.com/i.test(url)) {
      const body = request.postData();
      console.log(`[request] ${request.method()} ${url}${body ? ` :: ${body.slice(0, 800)}` : ""}`);
    }
  });

  page.on("response", async response => {
    const url = response.url();
    if (!/openrouter\.gotoolkit\.workers\.dev|challenges\.cloudflare\.com/i.test(url)) return;
    let body = "";
    try {
      if (/openrouter\.gotoolkit\.workers\.dev/i.test(url)) {
        body = await response.text();
      }
    } catch {
      body = "";
    }
    console.log(`[response] ${response.status()} ${url}${body ? ` :: ${body.slice(0, 400)}` : ""}`);
  });

  await page.goto("http://127.0.0.1:5000/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as any).GoToolkitTurnstile?.getTokenForUrl), null, { timeout: 30_000 });
  const forceState = await page.evaluate(() => ({
    flag: Boolean((window as any).GO_TOOLKIT_FORCE_INTERACTIVE_TURNSTILE),
    href: String(window.location.href || ""),
    hasApi: Boolean((window as any).GoToolkitTurnstile?.getTokenForUrl)
  }));
  console.log(`[turnstile-force-state] ${JSON.stringify(forceState)}`);
  void page.evaluate(() => {
    (window as any).__turnstileForcedPromise = (window as any).GoToolkitTurnstile.getTokenForUrl(
      "https://openrouter.gotoolkit.workers.dev/api/v1/chat/completions",
      "openrouter"
    ).then(
      (token: string) => ({ ok: true, tokenLength: String(token || "").length }),
      (error: any) => ({ ok: false, error: String(error?.message || error || "") })
    );
  });

  await expect(page.locator("#go-toolkit-turnstile-overlay")).toBeVisible({ timeout: 15_000 });
  console.log("[turnstile] interactive overlay visible");
  console.log("[turnstile] complete the challenge manually in the headed browser window");
  console.log("[turnstile] waiting up to 5 minutes for manual verification");

  const result = await page.evaluate(async () => {
    const readSnapshot = () => ({
      summary: (window as any).GoToolkitTurnstile?.getLastAttemptSummary?.() || null,
      diagnostics: (window as any).GoToolkitTurnstile?.getDiagnostics?.() || []
    });

    const startedAt = Date.now();
    let pendingResult = null;
    while ((Date.now() - startedAt) < 300_000) {
      pendingResult = await Promise.race([
        (window as any).__turnstileForcedPromise,
        new Promise(resolve => setTimeout(() => resolve(null), 1000))
      ]);
      if (pendingResult) break;
    }
    return {
      startedAt,
      pendingResult: pendingResult || { ok: false, timeout: true },
      snapshot: readSnapshot()
    };
  });

  console.log(`[result] ${JSON.stringify(result, null, 2)}`);
  await page.screenshot({ path: "output/playwright/turnstile-openrouter-headed.png", fullPage: true });

  expect(result).toBeTruthy();
});
