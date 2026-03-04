import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const MS_AUTH_STATE_PATH = path.resolve("playwright/.auth/ms.json");

async function runMicrosoftPopupLogin(page: any, context: any, loginEmail: string, loginPassword: string, options: { debugArtifacts?: boolean } = {}) {
  const artifactsDir = path.resolve("test-results/ms-oauth-debug");
  const writeDebug = (name: string, details: Record<string, unknown> = {}) => {
    if (!options.debugArtifacts) return;
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.appendFileSync(path.join(artifactsDir, "timeline.log"), `${new Date().toISOString()} ${name} ${JSON.stringify(details)}\n`);
  };

  const popupPromise = context.waitForEvent("page", { timeout: 60_000 });
  await page.locator("#memoConnectionBtn").click();
  const popup = await popupPromise;
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
  await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
  await passwordInput.fill(loginPassword);
  if (options.debugArtifacts) {
    await popup.screenshot({ path: path.join(artifactsDir, "02-password-screen.png"), fullPage: true }).catch(() => null);
  }
  await popup.locator('input[type="submit"], button[type="submit"], #idSIButton9').first().click();
  writeDebug("submitted_password", { url: popup.url() });

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

    await page.goto("http://127.0.0.1:5000/index.html", { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.getAuthStatus), null, { timeout: 120_000 });

    page.on("console", msg => {
      const text = msg.text();
      if (text.includes("[SSO Debug]")) {
        // eslint-disable-next-line no-console
        console.log(`[BROWSER:${msg.type()}] ${text}`);
      }
    });

    const preStatus = await page.evaluate(async () => {
      return await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
    });

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

    await page.goto("http://127.0.0.1:5000/index.html", { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.getAuthStatus), null, { timeout: 120_000 });

    const preStatus = await page.evaluate(async () => {
      return await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
    });

    if (!preStatus?.connected) {
      await runMicrosoftPopupLogin(page, context, loginEmail, loginPassword, { debugArtifacts: true });
    }

    await page.waitForFunction(async () => {
      const status = await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch(() => null);
      return Boolean(status?.connected);
    }, null, { timeout: 120_000 });

    fs.mkdirSync(path.dirname(MS_AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: MS_AUTH_STATE_PATH });
    expect(fs.existsSync(MS_AUTH_STATE_PATH)).toBeTruthy();
  });

  test("debugs Microsoft OAuth popup step-by-step (headed)", async ({ page, context }) => {
    test.setTimeout(300_000);
    test.skip(process.env.PW_MS_OAUTH_DEBUG !== "1", "Set PW_MS_OAUTH_DEBUG=1 to run headed popup debug");

    const loginEmail = String(process.env.PW_MICROSOFT_LOGIN_EMAIL || "").trim();
    const loginPassword = String(process.env.PW_MICROSOFT_LOGIN_PASSWORD || "").trim();
    test.skip(!loginEmail || !loginPassword, "PW_MICROSOFT_LOGIN_EMAIL/PW_MICROSOFT_LOGIN_PASSWORD are required");

    await page.goto("http://127.0.0.1:5000/index.html", { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.getAuthStatus), null, { timeout: 120_000 });
    await runMicrosoftPopupLogin(page, context, loginEmail, loginPassword, { debugArtifacts: true });
  });
});
