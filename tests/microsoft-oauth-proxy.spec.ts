import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { attachPageDebugLogging } from "./helpers/test-debug";

const MS_AUTH_STATE_PATH = path.resolve(".tmp/playwright-ms-auth-state.json");

function logStep(label: string, details?: unknown) {
  if (typeof details === "undefined") {
    console.log(`[ms-oauth] ${label}`);
    return;
  }
  console.log(`[ms-oauth] ${label}`, details);
}

async function runMicrosoftPopupLogin(page: any, context: any, loginEmail: string, loginPassword: string, options: { debugArtifacts?: boolean } = {}) {
  const artifactsDir = path.resolve("tests/results/ms-oauth-debug");
  const writeDebug = (name: string, details: Record<string, unknown> = {}) => {
    if (!options.debugArtifacts) return;
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.appendFileSync(path.join(artifactsDir, "timeline.log"), `${new Date().toISOString()} ${name} ${JSON.stringify(details)}\n`);
  };

  const popupPromise = context.waitForEvent("page", { timeout: 60_000 });
  logStep("popup-flow:start");
  const preClickState = await page.evaluate(async () => {
    const publisher = (window as any).GoToolkitMicrosoftPublish;
    const status = await publisher?.getAuthStatus?.().catch(() => null);
    const menu = document.getElementById("connectionProviderMenu");
    return {
      connectionBtnExists: Boolean(document.getElementById("memoConnectionBtn")),
      menuExists: Boolean(menu),
      menuOpen: Boolean(menu?.classList.contains("open")),
      statusConnected: Boolean(status?.connected),
      statusAccountEmail: String(status?.accountEmail || "").trim().toLowerCase()
    };
  });
  logStep("popup-flow:pre-click-state", preClickState);
  await page.locator("#memoConnectionBtn").click();
  logStep("popup-flow:clicked-connection-btn");
  await page.waitForSelector("#connectionProviderMenu.open", { timeout: 10_000 }).catch(() => null);
  const menuStateAfterClick = await page.evaluate(() => {
    const menu = document.getElementById("connectionProviderMenu");
    const items = Array.from(menu?.querySelectorAll('[role="menuitem"]') || []).map(node => ({
      text: String((node as HTMLElement).innerText || node.textContent || "").trim(),
      ariaLabel: String((node as HTMLElement).getAttribute("aria-label") || "").trim()
    }));
    return {
      menuOpen: Boolean(menu?.classList.contains("open")),
      items
    };
  });
  logStep("popup-flow:menu-state-after-click", menuStateAfterClick);
  const microsoftItem = page.locator('#connectionProviderMenu.open [role="menuitem"]').filter({ hasText: /microsoft/i }).first();
  const microsoftVisible = await microsoftItem.isVisible({ timeout: 5_000 }).catch(() => false);
  logStep("popup-flow:microsoft-menuitem-visible", { visible: microsoftVisible });
  if (microsoftVisible) {
    await microsoftItem.click();
    writeDebug("clicked_microsoft_provider");
    logStep("popup-flow:clicked-microsoft-provider");
  }
  const popup = await popupPromise;
  logStep("popup-flow:popup-opened", { url: popup.url() });
  writeDebug("popup_opened", { url: popup.url() });

  await popup.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => null);
  if (options.debugArtifacts) {
    await popup.screenshot({ path: path.join(artifactsDir, "01-popup-open.png"), fullPage: true }).catch(() => null);
  }
  writeDebug("popup_domcontentloaded", { url: popup.url() });

  const useAnotherAccount = popup.getByRole("button", { name: /use another account/i }).first();
  if (await useAnotherAccount.isVisible({ timeout: 2_500 }).catch(() => false)) {
    await useAnotherAccount.click();
    writeDebug("clicked_use_another_account", { url: popup.url() });
  }

  const emailInput = popup.locator('input[type="email"], input[name="loginfmt"]').first();
  if (await emailInput.isVisible({ timeout: 25_000 }).catch(() => false)) {
    await emailInput.fill(loginEmail);
    await popup.locator('input[type="submit"], button[type="submit"], #idSIButton9').first().click();
    writeDebug("submitted_email", { url: popup.url() });
  }

  const passwordInput = popup.locator('input[type="password"], input[name="passwd"]').first();
  const passwordNeeded = await Promise.race([
    passwordInput.waitFor({ state: "visible", timeout: 30_000 }).then(() => "password").catch(() => null),
    popup.waitForURL(/ms\.gotoolkit\.workers\.dev\/oauth\/callback/i, { timeout: 30_000 }).then(() => "callback").catch(() => null),
    popup.waitForEvent("close", { timeout: 30_000 }).then(() => "closed").catch(() => null),
    page.waitForFunction(async () => {
      const status = await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
      return Boolean(status?.connected);
    }, null, { timeout: 30_000 }).then(() => "connected").catch(() => null)
  ]);
  logStep("popup-flow:post-email-state", { state: passwordNeeded, popupUrl: popup.url() });
  if (passwordNeeded === "password") {
    await passwordInput.fill(loginPassword);
    if (options.debugArtifacts) {
      await popup.screenshot({ path: path.join(artifactsDir, "02-password-screen.png"), fullPage: true }).catch(() => null);
    }
    await popup.locator('input[type="submit"], button[type="submit"], #idSIButton9').first().click();
    writeDebug("submitted_password", { url: popup.url() });
  } else {
    writeDebug("password_not_required", { state: String(passwordNeeded || "unknown"), url: popup.url() });
  }

  const staySignedInNo = popup.locator("#idBtn_Back").first();
  if (await staySignedInNo.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await staySignedInNo.click();
    writeDebug("clicked_stay_signed_in_no", { url: popup.url() });
  }

  await popup.waitForEvent("close", { timeout: 90_000 }).catch(() => null);
  writeDebug("popup_closed");
}

test.describe("Microsoft OAuth proxy flow", () => {
  test("completes OAuth popup handshake through ms-proxy contract", async ({ page }) => {
    test.setTimeout(120_000);

    const apiBase = "https://ms.gotoolkit.workers.dev";
    let statusCalls = 0;
    let identityCalls = 0;
    attachPageDebugLogging(page, "ms-oauth:handshake");

    await page.route(`${apiBase}/auth/status`, async route => {
      statusCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connected: false,
          accountEmail: "",
          accountName: ""
        })
      });
    });

    await page.route(`${apiBase}/auth/identity`, async route => {
      identityCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          provider: "microsoft",
          accountEmail: "oauth.test@gotoolkit.fr",
          accountName: "OAuth Test",
          identityToken: "fake-identity-token",
          expiresAt: Date.now() + 5 * 60_000
        })
      });
    });

    await page.goto("http://127.0.0.1:5000/index.html", { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.ensureConnected), null, { timeout: 120_000 });

    const result = await page.evaluate(async ({ api }) => {
      const globalAny = window as any;
      const publisher = globalAny.GoToolkitMicrosoftPublish;
      if (!publisher?.ensureConnected) {
        throw new Error("Microsoft publisher indisponible");
      }

      const originalOpen = window.open.bind(window);
      const originalLocationOrigin = window.location.origin;
      let openedUrl = "";
      let openedName = "";

      window.open = ((url?: string | URL, target?: string, features?: string) => {
        openedUrl = String(url || "");
        openedName = String(target || "");
        const popup = {
          closed: false,
          close() {
            this.closed = true;
          }
        } as any;
        setTimeout(() => {
          window.dispatchEvent(new MessageEvent("message", {
            origin: api,
            data: {
              source: "gotoolkit-microsoft-oauth",
              ok: true,
              error: ""
            }
          }));
          popup.closed = true;
        }, 60);
        return popup;
      }) as typeof window.open;

      try {
        const identity = await publisher.ensureConnected();
        return {
          openedUrl,
          openedName,
          locationOrigin: originalLocationOrigin,
          accountEmail: String(identity?.accountEmail || "").trim().toLowerCase(),
          accountName: String(identity?.accountName || "").trim(),
          identityToken: String(identity?.identityToken || "").trim()
        };
      } finally {
        window.open = originalOpen;
      }
    }, { api: apiBase });

    expect(result.openedName).toBe("gotoolkit-microsoft-oauth");
    expect(result.openedUrl.startsWith(`${apiBase}/oauth/start?origin=`)).toBeTruthy();
    expect(decodeURIComponent(result.openedUrl.split("origin=")[1] || "")).toBe(result.locationOrigin);
    expect(result.accountEmail).toBe("oauth.test@gotoolkit.fr");
    expect(result.accountName).toBe("OAuth Test");
    expect(result.identityToken).toBe("fake-identity-token");
    expect(statusCalls).toBeGreaterThanOrEqual(1);
    expect(identityCalls).toBeGreaterThanOrEqual(1);
  });

  test("authenticates with Microsoft credentials and loads managed cloud spaces", async ({ page, context }) => {
    test.setTimeout(240_000);

    const loginEmail = String(process.env.PW_MICROSOFT_LOGIN_EMAIL || "").trim();
    const loginPassword = String(process.env.PW_MICROSOFT_LOGIN_PASSWORD || "").trim();
    test.skip(!loginEmail || !loginPassword, "PW_MICROSOFT_LOGIN_EMAIL/PW_MICROSOFT_LOGIN_PASSWORD are required");
    attachPageDebugLogging(page, "ms-oauth:managed-spaces");

    await page.goto("http://127.0.0.1:5000/index.html", { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.getAuthStatus), null, { timeout: 120_000 });

    page.on("pageerror", err => {
      console.log(`[ms-oauth:pageerror] ${err.message}`);
    });
    page.on("console", msg => {
      const text = msg.text();
      if (text.includes("[SSO Debug]") || text.includes("Popup") || text.includes("OAuth")) {
        console.log(`[ms-oauth:console:${msg.type()}] ${text}`);
      }
    });
    page.on("request", request => {
      const url = request.url();
      if (!url.includes("ms.gotoolkit.workers.dev")) return;
      console.log(`[ms-oauth:request] ${request.method()} ${url}`);
    });
    page.on("response", response => {
      const url = response.url();
      if (!url.includes("ms.gotoolkit.workers.dev")) return;
      console.log(`[ms-oauth:response] ${response.status()} ${url}`);
    });

    await page.addInitScript(() => {
      const originalOpen = window.open.bind(window);
      window.open = function (...args) {
        try {
          console.log("[PW MS DEBUG] window.open called", String(args?.[0] || ""), String(args?.[1] || ""));
        } catch {
          // ignore
        }
        return originalOpen(...args);
      };
    });

    const preStatus = await page.evaluate(async () => {
      return await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
    });
    logStep("managed-spaces:pre-status", preStatus);

    if (!preStatus?.connected) {
      await runMicrosoftPopupLogin(page, context, loginEmail, loginPassword);
    }

    await page.waitForFunction(async () => {
      const status = await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
      return Boolean(status?.connected);
    }, null, { timeout: 120_000 });

    await page.waitForTimeout(2_000);
    const diagnostics = await page.evaluate(async () => {
      const status = await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch((err: any) => ({ error: String(err?.message || err) }));
      const identity = await (window as any).GoToolkitMicrosoftPublish?.getIdentity?.().catch((err: any) => ({ error: String(err?.message || err) }));
      const spaces = (window as any).GoToolkitSpaces?.readSpaces?.() || [];
      const managed = spaces.filter((space: any) => Boolean(space?.accessManaged) && String(space?.accessMode || "").trim().toLowerCase() === "oauth");
      return {
        status,
        identity,
        managedIds: managed.map((space: any) => String(space?.id || "").trim().toLowerCase()),
        allSpaces: spaces.map((space: any) => ({
          id: String(space?.id || "").trim().toLowerCase(),
          accessManaged: Boolean(space?.accessManaged),
          accessMode: String(space?.accessMode || "").trim().toLowerCase()
        }))
      };
    });
    // eslint-disable-next-line no-console
    console.log("MS OAuth diagnostics:", JSON.stringify(diagnostics));
    expect(diagnostics.managedIds, JSON.stringify(diagnostics)).toContain("golive");
    expect(diagnostics.managedIds, JSON.stringify(diagnostics)).toContain("safran");

    const cloudTree = await page.evaluate(async () => {
      const worker = (window as any).goToolkitShareWorker;
      if (!worker?.listShareTree) {
        throw new Error("share worker indisponible");
      }
      const ids = ["golive", "safran"];
      const out: Record<string, number> = {};
      for (const id of ids) {
        const tree = await worker.listShareTree("pages-meta", {
          spaceId: id,
          includeArchived: true
        });
        out[id] = Array.isArray(tree?.documents) ? tree.documents.length : -1;
      }
      return out;
    });
    expect(cloudTree.golive).toBeGreaterThanOrEqual(0);
    expect(cloudTree.safran).toBeGreaterThanOrEqual(0);
  });

  test("captures Microsoft auth state for reuse", async ({ page, context }) => {
    test.setTimeout(300_000);
    test.skip(process.env.PW_BOOTSTRAP_MS_AUTH !== "1", "Set PW_BOOTSTRAP_MS_AUTH=1 to run auth-state capture");

    const loginEmail = String(process.env.PW_MICROSOFT_LOGIN_EMAIL || "").trim();
    const loginPassword = String(process.env.PW_MICROSOFT_LOGIN_PASSWORD || "").trim();
    test.skip(!loginEmail || !loginPassword, "PW_MICROSOFT_LOGIN_EMAIL/PW_MICROSOFT_LOGIN_PASSWORD are required");
    logStep("auth-state-capture:start", { hasEmail: Boolean(loginEmail), statePath: MS_AUTH_STATE_PATH });

    page.on("pageerror", err => {
      console.log(`[ms-oauth:capture:pageerror] ${err.message}`);
    });
    page.on("console", msg => {
      const text = msg.text();
      if (text.includes("[SSO Debug]") || text.includes("Popup") || text.includes("OAuth")) {
        console.log(`[ms-oauth:capture:console:${msg.type()}] ${text}`);
      }
    });

    await page.goto("http://127.0.0.1:5000/index.html", { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.getAuthStatus), null, { timeout: 120_000 });

    const preStatus = await page.evaluate(async () => {
      return await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
    });
    logStep("auth-state-capture:pre-status", preStatus);

    if (!preStatus?.connected) {
      await runMicrosoftPopupLogin(page, context, loginEmail, loginPassword, { debugArtifacts: true });
    }

    await page.waitForFunction(async () => {
      const status = await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
      return Boolean(status?.connected);
    }, null, { timeout: 120_000 });

    fs.mkdirSync(path.dirname(MS_AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: MS_AUTH_STATE_PATH });
    logStep("auth-state-capture:done", { exists: fs.existsSync(MS_AUTH_STATE_PATH) });
    expect(fs.existsSync(MS_AUTH_STATE_PATH)).toBeTruthy();
  });

});
