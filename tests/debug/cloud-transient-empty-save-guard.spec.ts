import { expect, test } from "@playwright/test";
import { ensureCloudConnectedWithSpaceCode } from "../helpers/cloud-auth";
import { refreshMemoExplorer, waitForMemoReady } from "../helpers/memo-ui";
import { PW_TEST_SPACE_CODE, PW_TEST_SPACE_ID } from "../helpers/share-test-space";
import { readCloudMemoRemoteState, seedCloudMemoDocs, waitForCloudMemoApis } from "../helpers/cloud-state";

test.describe("Cloud transient empty save guard", () => {
  test("keeps the last meaningful cloud payload when lifecycle flush sees a blank editor", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://localhost:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await ensureCloudConnectedWithSpaceCode(page, baseUrl);
    await waitForCloudMemoApis(page, 30_000);

    const ts = Date.now();
    const token = `pw-cloud-empty-guard-${ts}`;
    const docId = `share:${token}`;
    const marker = `CLOUD_EMPTY_GUARD_${ts}`;

    await seedCloudMemoDocs(page, {
      spaceId: PW_TEST_SPACE_ID,
      spaceCode: PW_TEST_SPACE_CODE,
      docs: [{
        token,
        title: `Cloud Empty Guard ${ts}`,
        content: `<p>${marker}</p>`,
        position: ts
      }]
    });

    await refreshMemoExplorer(page, 30_000);
    await page.evaluate(async targetId => {
      await (window as any).GoToolkitMemoOpenDocumentByLink?.(targetId);
    }, docId);
    await page.waitForFunction(expectedId => {
      return String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim() === String(expectedId || "").trim();
    }, docId, { timeout: 30_000 });
    await page.waitForFunction(expectedMarker => {
      const state = (window as any).__memoState;
      const activeTabId = String(state?.activeTabId || "").trim();
      const tab = Array.isArray(state?.tabs)
        ? state.tabs.find((entry: any) => String(entry?.id || "").trim() === activeTabId)
        : null;
      const html = String(tab?.content || "");
      return html.includes(String(expectedMarker || "").trim());
    }, marker, { timeout: 15_000 });

    const beforeLifecycle = await page.evaluate(async currentDocId => {
      const w = window as any;
      const draft = await w.goToolkitCloudDrafts?.readAll?.().catch?.(() => ({})) || {};
      const historyRows = await w.goToolkitShareHistory?.getRecordsByApp?.("memo").catch?.(() => []) || [];
      const token = String(currentDocId || "").replace(/^share:/, "").trim();
      const historyRow = Array.isArray(historyRows)
        ? historyRows.find((row: any) => String(row?.token || "").trim() === token)
        : null;
      return {
        draftHtml: String(draft?.[currentDocId]?.payload?.tabs?.[0]?.content || ""),
        historyHtml: String(historyRow?.payload?.tabs?.[0]?.content || "")
      };
    }, docId);

    const result = await page.evaluate(async ({ currentDocId, expectedMarker }) => {
      const w = window as any;
      const editor = w.GoToolkitMemoInstance;
      const originalGetValue = typeof editor?.getValue === "function" ? editor.getValue.bind(editor) : null;
      const originalHasFocus = typeof document.hasFocus === "function" ? document.hasFocus.bind(document) : null;
      if (!editor || !originalGetValue) {
        throw new Error("memo editor bridge unavailable");
      }
      editor.getValue = () => "";
      if (originalHasFocus) {
        (document as any).hasFocus = () => false;
      }
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("pagehide"));
      await new Promise(resolve => setTimeout(resolve, 250));
      const draft = await w.goToolkitCloudDrafts?.readAll?.().catch?.(() => ({})) || {};
      const draftHtml = String(draft?.[currentDocId]?.payload?.tabs?.[0]?.content || "");
      const historyRows = await w.goToolkitShareHistory?.getRecordsByApp?.("memo").catch?.(() => []) || [];
      const token = String(currentDocId || "").replace(/^share:/, "").trim();
      const historyRow = Array.isArray(historyRows)
        ? historyRows.find((row: any) => String(row?.token || "").trim() === token)
        : null;
      const historyHtml = String(historyRow?.payload?.tabs?.[0]?.content || "");
      editor.getValue = originalGetValue;
      if (originalHasFocus) {
        (document as any).hasFocus = originalHasFocus;
      }
      window.dispatchEvent(new Event("focus"));
      return {
        draftExists: Boolean(draft?.[currentDocId]),
        draftHtml,
        historyHtml,
        draftContainsMarker: draftHtml.includes(expectedMarker),
        historyContainsMarker: historyHtml.includes(expectedMarker)
      };
    }, { currentDocId: docId, expectedMarker: marker });

    console.log("cloud-transient-empty-guard-before", JSON.stringify(beforeLifecycle, null, 2));
    console.log("cloud-transient-empty-guard-after", JSON.stringify(result, null, 2));

    expect(result.historyContainsMarker).toBeTruthy();
    if (result.draftExists) {
      expect(result.draftContainsMarker).toBeTruthy();
    }

    const remote = await readCloudMemoRemoteState(page, { token, spaceId: PW_TEST_SPACE_ID });
    expect(remote.contentHtml).toContain(marker);
  });
});
