import { expect, Page } from "@playwright/test";

export async function waitForMemoReady(page: Page, timeout = 45_000) {
  await page.waitForFunction(() => {
    const w = window as any;
    return Boolean(
      w.goToolkitDocumentApi?.getRecord
      && (w.GoToolkitMemoGetActiveDocumentId || w.GoToolkitMemoOpenDocumentByLink)
    );
  }, null, { timeout });
  await page.waitForSelector(".ProseMirror:visible", { timeout });
}

export async function refreshMemoExplorer(page: Page, timeout = 45_000) {
  await page.evaluate(async () => {
    await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
  });
  await page.waitForTimeout(Math.min(1000, Math.max(200, Math.floor(timeout / 45))));
}

export async function clickMemoDoc(page: Page, docId: string, options: { allowProgrammaticOpen?: boolean; timeout?: number } = {}) {
  const { allowProgrammaticOpen = true, timeout = 120_000 } = options;
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
  try {
    await page.waitForFunction(
      expectedId => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
      docId,
      { timeout }
    );
  } catch {
    await page.waitForSelector(".ProseMirror:visible", { timeout });
  }
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
  const hasPendingSharedSync = async () => page.evaluate(async targetSpaceId => {
    const drafts = (window as any).goToolkitCloudDrafts;
    const openDocs = Array.isArray((window as any).openDocuments) ? (window as any).openDocuments : [];
    const sid = String(targetSpaceId || "").trim().toLowerCase();
    const hasDraft = (() => {
      if (!drafts?.readAll) return false;
      return Promise.resolve(drafts.readAll()).then((store: any) => {
        const entries = store && typeof store === "object" ? Object.entries(store) : [];
        return entries.some(([docId, draft]: any) => {
          const id = String(docId || "").trim();
          const draftSpaceId = String(draft?.spaceId || draft?.payload?.spaceId || "").trim().toLowerCase();
          return id.startsWith("share:") && draftSpaceId === sid;
        });
      });
    })();
    const hasDirtyOpenDoc = openDocs.some((doc: any) => {
      const docSpaceId = String(doc?.spaceId || doc?.payload?.spaceId || "").trim().toLowerCase();
      return Boolean(doc?.cloudDirty) && docSpaceId === sid;
    });
    return Promise.resolve(hasDraft).then((draftPending: boolean) => {
      return draftPending || hasDirtyOpenDoc;
    });
  }, spaceId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    if (!(await hasPendingSharedSync())) {
      return;
    }
  }
}
