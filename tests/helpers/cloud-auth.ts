import { expect, Page } from "@playwright/test";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "./share-test-space";

async function gotoIndex(page: Page, baseUrl: string) {
  const targetUrl = `${baseUrl}/index.html`;
  await page.addInitScript(() => {
    (window as any).GO_TOOLKIT_FORCE_INTERACTIVE_TURNSTILE = false;
    (window as any).GO_TOOLKIT_TURNSTILE_DEBUG = false;
    (window as any).GO_TOOLKIT_DISABLE_TURNSTILE_FOR_LOCAL_TESTS = true;
  });
  try {
    await page.goto(targetUrl, { waitUntil: "commit", timeout: 20_000 });
    return;
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(targetUrl, { waitUntil: "commit", timeout: 20_000 });
  }
}

async function waitForMemoAppReady(page: Page, timeout = 120_000) {
  await page.waitForFunction(() => {
    const w = window as any;
    return Boolean(
      w.goToolkitShareWorker?.isReady
      && w.GoToolkitSpaces?.upsertSpace
    );
  }, null, { timeout });
}

export async function ensureCloudConnected(page: Page, baseUrl = "http://127.0.0.1:5000") {
  await gotoIndex(page, baseUrl);
  await waitForMemoAppReady(page);
  await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.getAuthStatus), null, { timeout: 120_000 });

  const connected = await page.evaluate(async () => {
    const publisher = (window as any).GoToolkitMicrosoftPublish;
    const status = await publisher?.getAuthStatus?.();
    return Boolean(status?.connected);
  });

  if (connected) {
    return;
  }

  const connectButton = page.locator("#memoConnectionBtn");
  await expect(connectButton).toBeVisible({ timeout: 30_000 });
  await connectButton.click();

  await page.waitForFunction(async () => {
    const publisher = (window as any).GoToolkitMicrosoftPublish;
    const status = await publisher?.getAuthStatus?.();
    return Boolean(status?.connected);
  }, null, { timeout: 180_000 });
}

export async function ensureCloudConnectedWithSpaceCode(
  page: Page,
  baseUrl = "http://127.0.0.1:5000",
  options: { spaceId?: string; spaceCode?: string } = {}
) {
  const spaceId = String(options.spaceId || PW_TEST_SPACE_ID).trim().toLowerCase() || PW_TEST_SPACE_ID;
  const spaceCode = String(options.spaceCode || PW_TEST_SPACE_CODE).trim().toLowerCase() || PW_TEST_SPACE_CODE;

  await gotoIndex(page, baseUrl);
  await waitForMemoAppReady(page);

  const result = await page.evaluate(async ({ spaceId: sid, spaceCode: code }) => {
    const worker = (window as any).goToolkitShareWorker;
    const spaces = (window as any).GoToolkitSpaces;
    if (!worker || !spaces) {
      throw new Error("worker/spaces indisponibles");
    }
    spaces.upsertSpace({
      id: sid,
      name: sid.toUpperCase(),
      icon: "cloud-upload",
      spaceJoinCode: code,
      isDefault: false
    });
    const verified = await worker.verifySpaceCredentials(sid, code);
    await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    const authStatus = await (window as any).GoToolkitMicrosoftPublish?.getAuthStatus?.().catch?.(() => null);
    return {
      verifiedOk: Boolean(verified?.ok),
      verifiedSpaceId: String(verified?.spaceId || ""),
      microsoftConnected: Boolean(authStatus?.connected)
    };
  }, { spaceId, spaceCode });

  return {
    ...result,
    spaceId,
    spaceCode
  };
}
