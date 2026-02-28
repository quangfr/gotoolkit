import { expect, Page } from "@playwright/test";

export async function ensureCloudConnected(page: Page, baseUrl = "http://127.0.0.1:5000") {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean((window as any).GoToolkitMicrosoftPublish?.getAuthStatus), null, { timeout: 45_000 });

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
