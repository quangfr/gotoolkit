import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:5000/index.html";
const token = `persist-${Date.now()}`;
const marker = `CLOUD_PERSIST_MARKER_${Date.now()}`;

const browser = await chromium.launch({ headless: true });
const context1 = await browser.newContext();
const page1 = await context1.newPage();

const waitReady = async (page) => {
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.goToolkitShareWorker?.saveSharePayload), null, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(window.goToolkitShareHistory?.upsertRecord), null, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(window.GoToolkitMemoOpenDocumentByLink), null, { timeout: 45_000 });
};

try {
  await waitReady(page1);

  await page1.evaluate(async ({ token }) => {
    const payload = {
      tabs: [{ id: "tab-1", title: "Cloud Persist Test", description: "", content: "Initial cloud content", superpowers: [] }],
      activeTabId: "tab-1",
      title: "Cloud Persist Test",
      description: "",
      parentId: "",
      spaceId: "golive",
      status: "active",
      position: Date.now()
    };

    const worker = window.goToolkitShareWorker;
    const history = window.goToolkitShareHistory;
    const spacesApi = window.GoToolkitSpaces;
    spacesApi?.upsertSpace?.({ id: "golive", name: "Go Live", icon: "cloud-upload", isDefault: true });

    const saved = await worker.saveSharePayload("pages", token, payload, { spaceId: "golive", inlineAssets: false });
    await history.upsertRecord("memo", {
      token,
      title: "Cloud Persist Test",
      description: "",
      payload,
      spaceId: "golive",
      parentId: "",
      icon: "file-symlink",
      position: Date.now(),
      updatedAt: String(saved?.meta?.updatedAt || new Date().toISOString())
    });

    await window.GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
  }, { token });

  await page1.evaluate(({ token }) => {
    window.GoToolkitMemoOpenDocumentByLink?.(`share:${token}`);
  }, { token });

  await page1.waitForFunction((token) => window.GoToolkitMemoGetActiveDocumentId?.() === `share:${token}`, token, { timeout: 30_000 });

  await page1.evaluate(({ marker }) => {
    window.GoToolkitMemoAppendText?.(`\n${marker}`);
  }, { marker });

  const localDocId = await page1.evaluate(async () => {
    return await window.GoToolkitMemoCreateDocument?.({
      name: `Switch Temp ${Date.now()}`,
      initialContent: "temp local doc",
      description: ""
    });
  });

  if (!localDocId) {
    throw new Error("Failed to create local switch doc");
  }

  await page1.evaluate(async ({ localDocId, token }) => {
    await window.GoToolkitMemoSetActiveDocument?.(localDocId, { pushHistory: false });
    await window.GoToolkitMemoSetActiveDocument?.(`share:${token}`, { pushHistory: false });
  }, { localDocId, token });

  await page1.waitForFunction((token) => window.GoToolkitMemoGetActiveDocumentId?.() === `share:${token}`, token, { timeout: 30_000 });

  const localPersisted = await page1.evaluate(() => {
    const state = window.__memoState || { tabs: [], activeTabId: "" };
    const active = (state.tabs || []).find(t => t.id === state.activeTabId) || state.tabs?.[0] || null;
    return String(active?.content || "");
  });

  if (!localPersisted.includes(marker)) {
    throw new Error("Local switch persistence failed: marker missing after switching away/back");
  }

  const prevSync = await page1.evaluate(() => String(window.__goToolkitLastCloudSyncTiming?.startedAt || ""));
  await page1.evaluate(() => {
    const btn = document.querySelector('.document-explorer__item-action--sync-refresh[data-space-id="golive"]');
    if (!(btn instanceof HTMLElement)) {
      throw new Error("Sync button not found");
    }
    btn.click();
  });

  try {
    await page1.waitForFunction((prev) => {
      const timing = window.__goToolkitLastCloudSyncTiming;
      return Boolean(timing && typeof timing.totalMs === "number" && String(timing.startedAt || "") !== String(prev || ""));
    }, prevSync, { timeout: 45_000 });
  } catch {
    await page1.waitForTimeout(1500);
  }

  const syncDebug = await page1.evaluate(async ({ token }) => {
    const timing = window.__goToolkitLastCloudSyncTiming || null;
    const draft = window.goToolkitCloudDrafts?.get?.(`share:${token}`) || null;
    const fetched = await window.goToolkitShareWorker?.fetchSharePayload?.("pages", token);
    const fetchedContent = String(fetched?.payload?.tabs?.[0]?.content || "");
    return {
      timing,
      hasDraft: Boolean(draft),
      draftOp: String(draft?.opType || draft?.reason || ""),
      fetchedContentPreview: fetchedContent.slice(-200)
    };
  }, { token });

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await waitReady(page2);

  const remoteFetchedContent = await page2.evaluate(async ({ token }) => {
    const history = window.goToolkitShareHistory;
    const worker = window.goToolkitShareWorker;
    await history.upsertRecord("memo", {
      token,
      title: "Cloud Persist Test",
      description: "",
      payload: {
        tabs: [{ id: "tab-1", title: "Cloud Persist Test", description: "", content: "stale local", superpowers: [] }],
        activeTabId: "tab-1"
      },
      spaceId: "golive",
      parentId: "",
      icon: "file-symlink",
      updatedAt: "2025-01-01T00:00:00.000Z"
    });
    await window.GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    const prevSync = String(window.__goToolkitLastCloudSyncTiming?.startedAt || "");
    const btn = document.querySelector('.document-explorer__item-action--sync-refresh[data-space-id="golive"]');
    if (!(btn instanceof HTMLElement)) {
      throw new Error("Sync button not found in independent session");
    }
    btn.click();
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        const timing = window.__goToolkitLastCloudSyncTiming;
        if (timing && typeof timing.totalMs === "number" && String(timing.startedAt || "") !== prevSync) {
          resolve();
          return;
        }
        if (Date.now() - started > 45_000) {
          reject(new Error("Independent session sync timeout"));
          return;
        }
        setTimeout(poll, 150);
      };
      poll();
    });
    const fetched = await worker.fetchSharePayload("pages", token);
    return String(fetched?.payload?.tabs?.[0]?.content || "");
  }, { token });

  const remoteOk = remoteFetchedContent.includes(marker);

  console.log("\n=== Cloud edit/switch/sync/independent-session check ===");
  console.log(`token: ${token}`);
  console.log(`marker: ${marker}`);
  console.log(`local_persist_after_switch: ${localPersisted.includes(marker)}`);
  console.log(`sync_change_events: ${JSON.stringify(syncDebug?.timing?.changeEvents || [])}`);
  console.log(`sync_has_draft_after_sync: ${syncDebug?.hasDraft}`);
  console.log(`sync_draft_op_after_sync: ${syncDebug?.draftOp || ""}`);
  console.log(`remote_fetch_after_sync_contains_marker: ${String(syncDebug?.fetchedContentPreview || "").includes(marker)}`);
  console.log(`remote_visible_in_independent_session: ${remoteOk}`);

  await context2.close();

  if (!remoteOk) {
    throw new Error("Independent session does not see synced edit marker");
  }
} finally {
  await context1.close();
  await browser.close();
}
