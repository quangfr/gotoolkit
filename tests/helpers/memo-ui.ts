import { expect, Page } from "@playwright/test";

export async function waitForMemoReady(page: Page, timeout = 45_000) {
  await dismissShareAccessGateIfPresent(page, Math.min(timeout, 8_000));
  await page.waitForFunction(() => {
    const w = window as any;
    return Boolean(
      w.goToolkitDocumentApi?.getRecord
      && (w.GoToolkitMemoGetActiveDocumentId || w.GoToolkitMemoOpenDocumentByLink)
    );
  }, null, { timeout });

  const deadline = Date.now() + timeout;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      await dismissShareAccessGateIfPresent(page, 500);
      const editorVisible = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll(".ProseMirror")) as HTMLElement[];
        return nodes.some(node => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none"
            && style.visibility !== "hidden"
            && rect.width > 0
            && rect.height > 0;
        });
      });
      if (editorVisible) return;
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(500);
  }

  if (lastError) throw lastError;
  throw new Error(`Memo editor did not become visible within ${timeout}ms`);
}

export async function refreshMemoExplorer(page: Page, timeout = 45_000) {
  await page.evaluate(async () => {
    await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
  });
  await page.waitForTimeout(Math.min(1000, Math.max(200, Math.floor(timeout / 45))));
}

export function getMemoDocItem(page: Page, docId: string) {
  return page.locator(`.document-explorer__item[data-document-id="${docId}"]`).first();
}

export function getMemoSectionHeader(page: Page, section: string) {
  return page.locator(`.document-explorer__section-header[data-section="${section}"]`).first();
}

export async function expandMemoSection(page: Page, section: string, timeout = 30_000) {
  await page.evaluate(async sectionName => {
    await (window as any).GoToolkitMemoDocumentExplorer?.expandSection?.(String(sectionName || ""));
  }, section);
  await expect(getMemoSectionHeader(page, section)).toBeVisible({ timeout });
}

export async function dragMemoDocToSection(
  page: Page,
  docId: string,
  section: string,
  options: { expandSection?: boolean; timeout?: number } = {}
) {
  const { expandSection: shouldExpand = true, timeout = 30_000 } = options;
  if (shouldExpand) {
    await expandMemoSection(page, section, timeout);
  }
  const item = getMemoDocItem(page, docId);
  const header = getMemoSectionHeader(page, section);
  await expect(item).toBeVisible({ timeout });
  await expect(header).toBeVisible({ timeout });
  await item.dragTo(header);
}

export async function dragMemoDocToDoc(
  page: Page,
  fromDocId: string,
  toDocId: string,
  timeout = 30_000
) {
  const source = getMemoDocItem(page, fromDocId);
  const target = getMemoDocItem(page, toDocId);
  await expect(source).toBeVisible({ timeout });
  await expect(target).toBeVisible({ timeout });
  await source.dragTo(target);
}

export async function clickMemoDoc(
  page: Page,
  docId: string,
  options: { allowProgrammaticOpen?: boolean; timeout?: number; waitForContentMatch?: boolean } = {}
) {
  const {
    allowProgrammaticOpen = true,
    timeout = 120_000,
    waitForContentMatch = true
  } = options;
  const item = getMemoDocItem(page, docId);
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
  if (!waitForContentMatch) return;
  await page.waitForFunction(async expectedId => {
    const normalizedDocId = String(expectedId || "").trim();
    const activeId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    if (!normalizedDocId || activeId !== normalizedDocId) return false;
    const currentHtml = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
    const token = normalizedDocId.replace(/^share:/, "").trim();
    const history = (window as any).goToolkitShareHistory;
    const documentApi = (window as any).goToolkitDocumentApi;
    const isCloudDoc = normalizedDocId.startsWith("share:");
    const historyRecords = history?.getRecordsByApp ? await history.getRecordsByApp("memo").catch(() => []) : [];
    const allRows = Array.isArray(historyRecords) ? historyRecords : [];
    const cloudRow = isCloudDoc
      ? allRows.find((row: any) => String(row?.token || "").trim() === token)
      : null;
    const expectedCloudHtml = String(cloudRow?.payload?.tabs?.[0]?.content || "");
    if (expectedCloudHtml) return currentHtml === expectedCloudHtml;
    const record = !isCloudDoc && documentApi?.getRecord ? await documentApi.getRecord(normalizedDocId).catch(() => null) : null;
    const expectedLocalHtml = String(record?.payload?.tabs?.[0]?.content || record?.payload || "");
    if (expectedLocalHtml) return currentHtml === expectedLocalHtml;
    return currentHtml.length > 0 || document.querySelector(".ProseMirror")?.textContent !== null;
  }, docId, { timeout }).catch(() => null);
}

export async function renameMemoDoc(
  page: Page,
  docId: string,
  nextTitle: string,
  options: { timeout?: number } = {}
) {
  const { timeout = 30_000 } = options;
  const item = getMemoDocItem(page, docId);
  await expect(item).toBeVisible({ timeout });
  await item.dblclick();
  const renameInput = page.locator(".document-explorer__item-inline-input").first();
  await expect(renameInput).toBeVisible({ timeout: Math.min(timeout, 15_000) });
  await renameInput.fill(nextTitle);
  await renameInput.press("Enter");
  await expect(item).toContainText(nextTitle, { timeout });
}

export async function deleteActiveMemoDoc(page: Page, options: { timeout?: number } = {}) {
  const { timeout = 30_000 } = options;
  await page.click("#fileMenuBtn");
  await page.click("#deleteDocumentBtn");
  await page.waitForTimeout(Math.min(1000, Math.max(150, Math.floor(timeout / 60))));
}

export function captureShareRequests(page: Page, options: { includeSpaces?: boolean } = {}) {
  const { includeSpaces = false } = options;
  const requests: Array<{ method: string; url: string }> = [];
  page.on("request", request => {
    const url = request.url();
    const pattern = includeSpaces ? /\/v1\/shares\/|\/v1\/spaces\//i : /\/v1\/shares\//i;
    if (!pattern.test(url)) return;
    requests.push({
      method: request.method(),
      url
    });
  });
  return requests;
}

export async function typeIntoVisibleEditor(
  page: Page,
  text: string,
  timeout = 30_000,
  options: { clickBeforeType?: boolean } = {}
) {
  const { clickBeforeType = true } = options;
  const editor = page.locator(".ProseMirror:visible").first();
  await expect(editor).toBeVisible({ timeout });
  if (clickBeforeType) {
    await editor.click();
  }
  await page.keyboard.type(text);
}

export async function getMemoEditorHtml(page: Page) {
  return page.evaluate(() => String((window as any).GoToolkitMemoInstance?.getValue?.() || ""));
}

export async function openMemoHistory(page: Page, timeout = 30_000) {
  await page.waitForFunction(() => typeof (window as any).openMemoHistoryModal === "function", null, { timeout });
  await page.evaluate(async () => {
    await (window as any).openMemoHistoryModal?.();
  });
  await expect(page.locator("#memo-history-overlay.open")).toBeVisible({ timeout });
}

export function getMemoHistoryItems(page: Page) {
  return page.locator(".memo-history-item");
}

export async function clickMemoHistoryItem(page: Page, index: number, timeout = 15_000) {
  const item = getMemoHistoryItems(page).nth(index);
  await expect(item).toBeVisible({ timeout });
  await item.click();
  await expect(item).toHaveClass(/is-active/, { timeout });
}

export async function clickMemoHistoryItemByPreview(
  page: Page,
  options: { contains: string; excludes?: string[]; timeout?: number }
) {
  const { contains, excludes = [], timeout = 15_000 } = options;
  const items = getMemoHistoryItems(page);
  const count = await items.count();
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    await expect(item).toBeVisible({ timeout });
    await item.click();
    await expect(item).toHaveClass(/is-active/, { timeout });
    const previewHtml = await page.locator("#memo-history-preview-text").innerHTML();
    if (!String(previewHtml || "").includes(contains)) continue;
    if (excludes.some(value => String(value || "") && String(previewHtml || "").includes(value))) continue;
    return index;
  }
  throw new Error(`No memo history item matched preview contains=${JSON.stringify(contains)} excludes=${JSON.stringify(excludes)}`);
}

export async function restoreSelectedMemoHistory(page: Page, timeout = 30_000) {
  const button = page.locator("#memo-history-restore");
  await expect(button).toBeVisible({ timeout });
  await button.click();
  await page.waitForSelector("#memo-history-overlay.open", { state: "hidden", timeout }).catch(() => null);
}

export async function duplicateSelectedMemoHistory(page: Page, timeout = 30_000) {
  const button = page.locator("#memo-history-duplicate");
  await expect(button).toBeVisible({ timeout });
  await button.click();
  await page.waitForSelector("#memo-history-overlay.open", { state: "hidden", timeout }).catch(() => null);
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

export async function dismissShareAccessGateIfPresent(page: Page, timeout = 5_000) {
  const connectionModal = page.locator("#connectionModal[aria-hidden='false']").first();
  const privateModeButton = page.locator("#connectionModalDoneBtn").first();
  const closeConnectionButton = page.locator("#connectionModalClose").first();
  const shareAccessHeading = page.getByText("Accéder aux espaces de partage", { exact: true }).first();
  const spaceAccessOverlay = page.locator("#spaceAccessOverlay[aria-hidden='false']").first();
  const spaceAccessClose = page.locator("#spaceAccessOverlayClose").first();

  const connectionVisible = await Promise.race([
    connectionModal.isVisible().catch(() => false),
    shareAccessHeading.isVisible().catch(() => false),
    page.waitForTimeout(timeout).then(() => false),
  ]);
  if (connectionVisible) {
    if (await privateModeButton.isVisible().catch(() => false)) {
      await privateModeButton.click();
    } else if (await closeConnectionButton.isVisible().catch(() => false)) {
      await closeConnectionButton.click();
    }
  }

  if (await spaceAccessOverlay.isVisible().catch(() => false)) {
    if (await spaceAccessClose.isVisible().catch(() => false)) {
      await spaceAccessClose.click();
    }
  }
}

export async function syncGolive(page: Page, spaceId: string, timeout = 60_000) {
  const syncBtn = page.locator(`.document-explorer__item-action--sync-refresh[data-space-id="${spaceId}"]`).first();
  await expect(syncBtn).toBeVisible({ timeout: 30_000 });
  const hasPendingSharedSync = async () => page.evaluate(async targetSpaceId => {
    if (typeof (window as any).getPendingSharedSyncDetailsInSpace === "function") {
      const details = (window as any).getPendingSharedSyncDetailsInSpace(targetSpaceId);
      return Boolean(details?.hasPending);
    }
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
