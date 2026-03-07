import { expect, Page } from "@playwright/test";

export async function waitForMemoReady(page: Page, timeout = 45_000) {
  await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout });
  await page.waitForSelector(".ProseMirror:visible", { timeout });
}

export async function refreshMemoExplorer(page: Page, timeout = 45_000) {
  await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoDocumentExplorer?.refresh), null, { timeout });
  await page.evaluate(async () => {
    await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
  });
}

export async function clickMemoDoc(page: Page, docId: string, options: { allowProgrammaticOpen?: boolean; timeout?: number } = {}) {
  const { allowProgrammaticOpen = true, timeout = 30_000 } = options;
  const item = page.locator(`.document-explorer__item[data-document-id="${docId}"]`).first();
  const visible = await item.isVisible().catch(() => false);
  if (visible) {
    await item.click();
  } else if (allowProgrammaticOpen) {
    await page.evaluate(async id => {
      await (window as any).GoToolkitMemoOpenDocumentByLink?.(id);
    }, docId);
  } else {
    await expect(item).toBeVisible({ timeout });
    await item.click();
  }
  await page.waitForFunction(
    expectedId => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
    docId,
    { timeout }
  );
}

export async function typeIntoVisibleEditor(page: Page, text: string, timeout = 30_000) {
  const editor = page.locator(".ProseMirror:visible").first();
  await expect(editor).toBeVisible({ timeout });
  await editor.click();
  await page.keyboard.type(text);
}

export async function getMemoEditorHtml(page: Page) {
  return page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));
}

export async function dismissDocsTour(page: Page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
    } catch {
      // ignore
    }
    try {
      const cleanup = (window as any).__goToolkitDocsTourCleanup;
      if (typeof cleanup === "function") cleanup();
    } catch {
      // ignore
    }
    document.querySelectorAll(".docs-tour-overlay, .docs-tour-highlight, .docs-tour-card").forEach(el => {
      try { (el as HTMLElement).remove(); } catch { /* ignore */ }
    });
    document.querySelectorAll("[data-tour-forced-visible='1']").forEach(el => {
      const node = el as HTMLElement;
      node.style.pointerEvents = "none";
    });
  });
}

export async function syncGolive(page: Page, spaceId: string, timeout = 60_000) {
  const syncBtn = page.locator(`.document-explorer__item-action--sync-refresh[data-space-id="${spaceId}"]`).first();
  await expect(syncBtn).toBeVisible({ timeout: 30_000 });
  const prev = await page.evaluate(() => String((window as any).__goToolkitLastCloudSyncTiming?.startedAt || ""));
  await syncBtn.click();
  try {
    await page.waitForFunction(
      previous => {
        const timing = (window as any).__goToolkitLastCloudSyncTiming;
        return Boolean(timing && typeof timing.totalMs === "number" && String(timing.startedAt || "") !== String(previous || ""));
      },
      prev,
      { timeout }
    );
  } catch {
    await page.waitForTimeout(1500);
  }
}
