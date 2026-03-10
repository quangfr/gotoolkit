import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:5000/index.html";
const tokenA = `persist-a-${Date.now()}`;
const tokenB = `persist-b-${Date.now()}`;
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

const seedCloudDoc = async (page, token, title, content) => {
    await page.evaluate(async ({ token, title, content }) => {
        const payload = {
            tabs: [{ id: "tab-1", title, description: "", content, superpowers: [] }],
            activeTabId: "tab-1",
            title,
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
            title,
            description: "",
            payload,
            spaceId: "golive",
            parentId: "",
            icon: "file-symlink",
            position: Date.now(),
            updatedAt: String(saved?.meta?.updatedAt || new Date().toISOString())
        });
        await window.GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    }, { token, title, content });
};

try {
    await waitReady(page1);
    await seedCloudDoc(page1, tokenA, "Cloud Persist A", "Initial A");
    await seedCloudDoc(page1, tokenB, "Cloud Persist B", "Initial B");

    await page1.evaluate(({ tokenA }) => {
        window.GoToolkitMemoOpenDocumentByLink?.(`share:${tokenA}`);
    }, { tokenA });
    await page1.waitForFunction((token) => window.GoToolkitMemoGetActiveDocumentId?.() === `share:${token}`, tokenA, { timeout: 30_000 });

    await page1.evaluate(({ marker }) => {
        window.GoToolkitMemoAppendText?.(`\n${marker}`);
    }, { marker });

    await page1.evaluate(({ tokenB }) => {
        window.GoToolkitMemoOpenDocumentByLink?.(`share:${tokenB}`);
    }, { tokenB });
    await page1.waitForFunction((token) => window.GoToolkitMemoGetActiveDocumentId?.() === `share:${token}`, tokenB, { timeout: 30_000 });

    await page1.evaluate(({ tokenA }) => {
        window.GoToolkitMemoOpenDocumentByLink?.(`share:${tokenA}`);
    }, { tokenA });
    await page1.waitForFunction((token) => window.GoToolkitMemoGetActiveDocumentId?.() === `share:${token}`, tokenA, { timeout: 30_000 });

    const localPersisted = await page1.evaluate(() => {
        const state = window.__memoState || { tabs: [], activeTabId: "" };
        const active = (state.tabs || []).find(t => t.id === state.activeTabId) || state.tabs?.[0] || null;
        return String(active?.content || "");
    });

    const prevSync = await page1.evaluate(() => String(window.__goToolkitLastCloudSyncTiming?.startedAt || ""));
    const syncBtn = page1.locator('.document-explorer__item-action--sync-refresh[data-space-id="golive"]').first();
    await syncBtn.click({ timeout: 30000 });

    try {
        await page1.waitForFunction((prev) => {
            const timing = window.__goToolkitLastCloudSyncTiming;
            return Boolean(timing && typeof timing.totalMs === "number" && String(timing.startedAt || "") !== String(prev || ""));
        }, prevSync, { timeout: 45_000 });
    } catch {
        await page1.waitForTimeout(1200);
    }

    const syncDebug = await page1.evaluate(async ({ tokenA, marker }) => {
        const timing = window.__goToolkitLastCloudSyncTiming || null;
        const draft = window.goToolkitCloudDrafts?.get?.(`share:${tokenA}`) || null;
        const fetched = await window.goToolkitShareWorker?.fetchSharePayload?.("pages", tokenA);
        const fetchedContent = String(fetched?.payload?.tabs?.[0]?.content || "");
        return {
            timing,
            hasDraft: Boolean(draft),
            draftOp: String(draft?.opType || draft?.reason || ""),
            remoteHasMarker: fetchedContent.includes(marker)
        };
    }, { tokenA, marker });

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await waitReady(page2);

    const remoteFetchedContent = await page2.evaluate(async ({ tokenA }) => {
        const worker = window.goToolkitShareWorker;
        const fetched = await worker.fetchSharePayload("pages", tokenA);
        return String(fetched?.payload?.tabs?.[0]?.content || "");
    }, { tokenA });

    const remoteOk = remoteFetchedContent.includes(marker);

    console.log("\n=== Cloud edit/switch/sync/independent-session check ===");
    console.log(`tokenA: ${tokenA}`);
    console.log(`tokenB: ${tokenB}`);
    console.log(`marker: ${marker}`);
    console.log(`local_persist_after_cloud_switch: ${localPersisted.includes(marker)}`);
    console.log(`sync_change_events: ${JSON.stringify(syncDebug?.timing?.changeEvents || [])}`);
    console.log(`sync_has_draft_after_sync: ${syncDebug?.hasDraft}`);
    console.log(`sync_draft_op_after_sync: ${syncDebug?.draftOp || ""}`);
    console.log(`remote_fetch_after_sync_contains_marker: ${syncDebug?.remoteHasMarker}`);
    console.log(`remote_visible_in_independent_session: ${remoteOk}`);

    await context2.close();

    if (!localPersisted.includes(marker)) {
        throw new Error("Local persistence after cloud page switch failed");
    }
    if (!remoteOk) {
        throw new Error("Independent session does not see synced edit marker");
    }
} finally {
    await context1.close();
    await browser.close();
}
