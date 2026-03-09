import { expect, Page, test } from "@playwright/test";
import {
  EPICONCEPT_SPACE_CODE,
  EPICONCEPT_SPACE_ID,
  PW_TEST_SPACE_CODE,
  PW_TEST_SPACE_ID
} from "./helpers/share-test-space";
import { ensureCloudConnectedWithSpaceCode } from "./helpers/cloud-auth";
import {
  clickMemoDoc,
  dismissDocsTour,
  getMemoEditorHtml,
  refreshMemoExplorer,
  syncGolive,
  typeIntoVisibleEditor,
  waitForMemoReady
} from "./helpers/memo-ui";

type SeedDoc = {
  id: string;
  token: string;
  title: string;
  baseMarker: string;
  contentMarker: string;
};

function expectMarkersIsolated(
  label: string,
  html: string,
  includes: string[],
  excludes: string[]
) {
  for (const marker of includes) {
    expect.soft(html, `${label}: missing ${marker}`).toContain(marker);
  }
  for (const marker of excludes) {
    expect.soft(html, `${label}: mixed with ${marker}`).not.toContain(marker);
  }
}

function markersAreIsolated(
  html: string,
  includes: string[],
  excludes: string[]
) {
  const value = String(html || "");
  return includes.every(marker => value.includes(marker))
    && excludes.every(marker => !value.includes(marker));
}

function installBrowserDebugLogging(page: Page, prefix: string) {
  page.on("console", async message => {
    const values = await Promise.all(message.args().map(async arg => {
      try {
        return await arg.jsonValue();
      } catch {
        return arg.toString();
      }
    }));
    console.log(`[${prefix}] browser:${message.type()}`, message.text(), values);
  });
  page.on("pageerror", error => {
    console.log(`[${prefix}] pageerror`, { message: error.message, stack: error.stack });
  });
  page.on("requestfailed", request => {
    const url = request.url();
    if (!/\/v1\/shares\/|\/v1\/spaces\//i.test(url)) return;
    console.log(`[${prefix}] requestfailed`, {
      method: request.method(),
      url,
      failure: request.failure()?.errorText || ""
    });
  });
  page.on("response", async response => {
    const url = response.url();
    if (!/\/v1\/shares\/|\/v1\/spaces\//i.test(url)) return;
    console.log(`[${prefix}] response`, {
      status: response.status(),
      url,
      requestMethod: response.request().method()
    });
  });
}

async function readCloudDocState(page: Page, docId: string) {
  return page.evaluate(async currentDocId => {
    const token = String(currentDocId || "").replace(/^share:/, "").trim();
    const worker = (window as any).goToolkitShareWorker;
    const history = (window as any).goToolkitShareHistory;
    const drafts = (window as any).goToolkitCloudDrafts;
    const historyRows = await history?.getRecordsByApp?.("memo").catch?.(() => []) || [];
    const historyRow = Array.isArray(historyRows)
      ? historyRows.find((row: any) => String(row?.token || "") === token)
      : null;
    const allDrafts = await drafts?.readAll?.().catch?.(() => ({})) || {};
    const draft = allDrafts?.[currentDocId] || null;
    const remoteMeta = token ? await worker?.fetchSharePayload?.("pages-meta", token).catch?.(() => null) : null;
    const remotePage = token ? await worker?.fetchSharePayload?.("pages", token).catch?.(() => null) : null;
    return {
      activeDocId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      editorHtml: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
      historyHtml: String(historyRow?.payload?.tabs?.[0]?.content || ""),
      draftHtml: String(draft?.payload?.tabs?.[0]?.content || ""),
      draftOpType: String(draft?.opType || ""),
      remoteHtml: String(remotePage?.payload?.tabs?.[0]?.content || ""),
      remoteStatus: String(remoteMeta?.payload?.status || "")
    };
  }, docId);
}

async function readLocalCloudDocState(page: Page, docId: string) {
  return page.evaluate(async currentDocId => {
    const token = String(currentDocId || "").replace(/^share:/, "").trim();
    const history = (window as any).goToolkitShareHistory;
    const drafts = (window as any).goToolkitCloudDrafts;
    const historyRows = await history?.getRecordsByApp?.("memo").catch?.(() => []) || [];
    const historyRow = Array.isArray(historyRows)
      ? historyRows.find((row: any) => String(row?.token || "") === token)
      : null;
    const allDrafts = await drafts?.readAll?.().catch?.(() => ({})) || {};
    const draft = allDrafts?.[currentDocId] || null;
    return {
      activeDocId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      editorHtml: String((window as any).GoToolkitMemoInstance?.getValue?.() || ""),
      historyHtml: String(historyRow?.payload?.tabs?.[0]?.content || ""),
      draftHtml: String(draft?.payload?.tabs?.[0]?.content || ""),
      draftOpType: String(draft?.opType || "")
    };
  }, docId);
}

async function moveCaretToDocumentEnd(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).MemoEditor || (window as any).memoEditor;
    const doc = editor?.state?.doc;
    if (!editor?.chain || !doc || typeof doc.descendants !== "function") return;
    let endPos: number | null = null;
    doc.descendants((node: any, pos: number) => {
      if (node?.isText && node.nodeSize > 0) {
        endPos = pos + Math.max(0, node.nodeSize - 1);
        return true;
      }
      if (node?.isTextblock && node.content?.size > 0) {
        endPos = pos + Math.max(1, node.nodeSize - 1);
      }
      return true;
    });
    if (!endPos) return;
    try {
      editor.chain().focus().setTextSelection({ from: endPos, to: endPos }).run();
    } catch (err) {
      try {
        editor.chain().focus().setTextSelection({ from: 1, to: 1 }).setTextSelection({ from: endPos, to: endPos }).run();
      } catch {
        // ignore
      }
    }
  });
}

test.describe("Cloud rapid switching large-content stress", () => {
  test("keeps cloud content through rapid small edits, switching, refresh, sync, and reload", async ({ page }) => {
    test.setTimeout(360_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const prefix = `pw-cloud-rapid-${ts}`;
    const sourceSpaceId = EPICONCEPT_SPACE_CODE ? EPICONCEPT_SPACE_ID : PW_TEST_SPACE_ID;
    const sourceSpaceCode = EPICONCEPT_SPACE_CODE || PW_TEST_SPACE_CODE;
    const targetSpaceId = PW_TEST_SPACE_ID;
    const targetSpaceCode = PW_TEST_SPACE_CODE;
    const cleanupTokens: string[] = [];
    const shareRequests: Array<{ method: string; url: string }> = [];
    let lastShareRequestAt = 0;

    installBrowserDebugLogging(page, "cloud-rapid-switch-large");
    page.on("request", request => {
      const url = request.url();
      if (!/\/v1\/shares\//i.test(url)) return;
      lastShareRequestAt = Date.now();
      shareRequests.push({
        method: request.method(),
        url
      });
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
        (window as any).GO_TOOLKIT_DEBUG_CLOUD_SYNC = true;
      } catch {
        // ignore
      }
    });

    try {
      console.log("[cloud-rapid-switch-large] connect:start", { targetSpaceId, sourceSpaceId });
      await ensureCloudConnectedWithSpaceCode(page, baseUrl, {
        spaceId: targetSpaceId,
        spaceCode: targetSpaceCode
      });
      await dismissDocsTour(page);
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 60_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareWorker?.saveSharePayload), null, { timeout: 60_000 });
      await waitForMemoReady(page, 60_000);
      console.log("[cloud-rapid-switch-large] connect:done");

      const seeded = await page.evaluate(async ({
        prefix: currentPrefix,
        sourceSpaceId: currentSourceSpaceId,
        sourceSpaceCode: currentSourceSpaceCode,
        targetSpaceId: currentTargetSpaceId,
        targetSpaceCode: currentTargetSpaceCode,
        startedAt
      }) => {
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const spaces = (window as any).GoToolkitSpaces;
        const trimLargeContent = (content: string) => {
          const raw = String(content || "").trim();
          if (!raw) return "";
          return raw.length > 48_000 ? `${raw.slice(0, 48_000)}<p>[trimmed-for-rapid-cloud-repro]</p>` : raw;
        };
        const ensureHtml = (content: string, marker: string) => {
          const baseContent = String(content || "").trim();
          if (!baseContent) return `<p>${marker}</p>`;
          if (baseContent.includes(marker)) return baseContent;
          return `<p>${marker}</p>${baseContent}`;
        };
        const extractToken = (entry: any) => String(entry?.id || entry?.token || "").replace(/^share:/, "").trim();
        const getFirstTabContent = (payload: any) => String(payload?.tabs?.[0]?.content || "").trim();
        const sourceSamples: Array<{ title: string; content: string }> = [];

        spaces?.upsertSpace?.({
          id: currentTargetSpaceId,
          name: currentTargetSpaceId.toUpperCase(),
          icon: "cloud-upload",
          spaceJoinCode: currentTargetSpaceCode,
          isDefault: true
        });

        try {
          spaces?.upsertSpace?.({
            id: currentSourceSpaceId,
            name: currentSourceSpaceId.toUpperCase(),
            icon: "cloud-upload",
            spaceJoinCode: currentSourceSpaceCode,
            isDefault: false
          });
          await worker.verifySpaceCredentials(currentSourceSpaceId, currentSourceSpaceCode);
          const tree = await worker.listShareTree("pages-meta", {
            spaceId: currentSourceSpaceId,
            includeArchived: false
          });
          const docs = Array.isArray(tree?.documents) ? tree.documents : [];
          for (const entry of docs) {
            const token = extractToken(entry);
            if (!token) continue;
            const remote = await worker.fetchSharePayload("pages", token, { spaceId: currentSourceSpaceId }).catch(() => null);
            const content = getFirstTabContent(remote?.payload);
            if (!content || content.length < 5_000) continue;
            sourceSamples.push({
              title: String(entry?.payload?.title || remote?.payload?.tabs?.[0]?.title || `Source ${token}`).trim() || `Source ${token}`,
              content: trimLargeContent(content)
            });
            if (sourceSamples.length >= 3) break;
          }
        } catch (err) {
          console.log("[cloud-rapid-switch-large] source-sample-load-failed", {
            sourceSpaceId: currentSourceSpaceId,
            message: String((err as any)?.message || err || "")
          });
        }

        while (sourceSamples.length < 3) {
          sourceSamples.push({
            title: `Fallback Source ${sourceSamples.length + 1}`,
            content: `<p>Fallback large source ${sourceSamples.length + 1}</p>${"<p>Long fallback block.</p>".repeat(500)}`
          });
        }

        await worker.verifySpaceCredentials(currentTargetSpaceId, currentTargetSpaceCode);

        const makePayload = (token: string, title: string, content: string, position: number) => ({
          tabs: [{
            id: `tab-${token}`,
            title,
            description: "",
            superpowers: [],
            content
          }],
          activeTabId: `tab-${token}`,
          parentId: "",
          spaceId: currentTargetSpaceId,
          status: "active",
          position
        });

        const docs = sourceSamples.slice(0, 3).map((sample, index) => {
          const token = `${currentPrefix}-page-${index + 1}`;
          const title = `Rapid Cloud ${index + 1} ${sample.title}`;
          const baseMarker = `RAPID_CLOUD_BASE_${index + 1}_${startedAt}`;
          const contentMarker = `RAPID_CLOUD_EDIT_${index + 1}_${startedAt}`;
          return {
            id: `share:${token}`,
            token,
            title,
            baseMarker,
            contentMarker,
            payload: makePayload(token, title, ensureHtml(sample.content, baseMarker), startedAt + index)
          };
        });

        for (const doc of docs) {
          await worker.saveSharePayload("pages-meta", doc.token, {
            title: doc.title,
            description: "",
            superpowers: [],
            icon: "file-symlink",
            parentId: "",
            spaceId: currentTargetSpaceId,
            position: doc.payload.position,
            status: "active"
          });
          await worker.saveSharePayload("pages", doc.token, doc.payload);
          await history.upsertRecord("memo", {
            token: doc.token,
            title: doc.title,
            description: "",
            superpowers: [],
            payload: doc.payload,
            icon: "file-symlink",
            parentId: "",
            spaceId: currentTargetSpaceId,
            position: doc.payload.position,
            updatedAt: new Date().toISOString()
          });
        }

        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
        return docs.map(({ payload, ...doc }) => ({
          ...doc,
          contentLength: String(payload?.tabs?.[0]?.content || "").length
        }));
      }, {
        prefix,
        sourceSpaceId,
        sourceSpaceCode,
        targetSpaceId,
        targetSpaceCode,
        startedAt: ts
      }) as SeedDoc[];

      seeded.forEach(doc => cleanupTokens.push(doc.token));
      console.log("[cloud-rapid-switch-large] seed:done", seeded);
      await page.waitForTimeout(1500);
      await expect.poll(() => Date.now() - lastShareRequestAt, { timeout: 20_000 }).toBeGreaterThan(2000);
      shareRequests.length = 0;

      const operations = [
        { docIndex: 0, append: ` OP1_${ts}` },
        { docIndex: 1, append: ` OP2_${ts}` },
        { docIndex: 2, append: ` OP3_${ts}` },
        { docIndex: 0, append: ` OP4_${ts}` },
        { docIndex: 2, append: ` OP5_${ts}` },
        { docIndex: 1, append: ` OP6_${ts}` },
        { docIndex: 0, append: ` OP7_${ts}` },
        { docIndex: 1, append: ` OP8_${ts}` },
        { docIndex: 2, append: ` OP9_${ts}` },
        { docIndex: 0, append: ` OP10_${ts}` },
        { docIndex: 2, append: ` OP11_${ts}` },
        { docIndex: 1, append: ` OP12_${ts}` }
      ];

      const expectedMarkers = new Map<string, string[]>();
      seeded.forEach(doc => expectedMarkers.set(doc.id, [doc.baseMarker]));
      const excludedMarkers = (docId: string) => seeded
        .filter(doc => doc.id !== docId)
        .flatMap(doc => expectedMarkers.get(doc.id) || []);

      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        const targetDoc = seeded[operation.docIndex];
        const targetExpectedMarkers = expectedMarkers.get(targetDoc.id) || [];
        const targetExcludedMarkers = excludedMarkers(targetDoc.id);
        console.log("[cloud-rapid-switch-large] operation:start", { index: index + 1, docId: targetDoc.id, append: operation.append });
        await clickMemoDoc(page, targetDoc.id, { allowProgrammaticOpen: false });
        await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(targetDoc.baseMarker);
        await moveCaretToDocumentEnd(page);
        await page.waitForFunction(() => {
          const active = document.activeElement;
          return Boolean(active && active.classList?.contains("ProseMirror"));
        }, null, { timeout: 10_000 });
        await typeIntoVisibleEditor(page, operation.append, 30_000, { clickBeforeType: false });
        expectedMarkers.get(targetDoc.id)?.push(operation.append.trim());
        await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(operation.append.trim());

        const editorHtmlAfterEdit = await getMemoEditorHtml(page);
        expectMarkersIsolated(
          `${targetDoc.id}: editor immediately after edit ${index + 1}`,
          editorHtmlAfterEdit,
          targetExpectedMarkers,
          targetExcludedMarkers
        );
        const localStateAfterEdit = await readLocalCloudDocState(page, targetDoc.id);
        expectMarkersIsolated(
          `${targetDoc.id}: local editor state after edit ${index + 1}`,
          localStateAfterEdit.editorHtml,
          targetExpectedMarkers,
          targetExcludedMarkers
        );
        const nextDoc = seeded[(operation.docIndex + 1) % seeded.length];
        await clickMemoDoc(page, nextDoc.id, { allowProgrammaticOpen: false });
        await clickMemoDoc(page, targetDoc.id, { allowProgrammaticOpen: false });
        await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(operation.append.trim());
        const editorHtmlAfterRoundtrip = await getMemoEditorHtml(page);
        expectMarkersIsolated(
          `${targetDoc.id}: editor after roundtrip ${index + 1}`,
          editorHtmlAfterRoundtrip,
          targetExpectedMarkers,
          targetExcludedMarkers
        );
        await expect.poll(async () => {
          const state = await readLocalCloudDocState(page, targetDoc.id);
          return markersAreIsolated(
            state.historyHtml,
            targetExpectedMarkers,
            targetExcludedMarkers
          );
        }, {
          timeout: 10_000,
          message: `${targetDoc.id}: local history state after roundtrip ${index + 1} did not stabilize on the expected page content`
        }).toBe(true);
        const localStateAfterRoundtrip = await readLocalCloudDocState(page, targetDoc.id);
        expectMarkersIsolated(
          `${targetDoc.id}: local history state after roundtrip ${index + 1}`,
          localStateAfterRoundtrip.historyHtml,
          targetExpectedMarkers,
          targetExcludedMarkers
        );
        if (localStateAfterRoundtrip.draftHtml || localStateAfterRoundtrip.draftOpType) {
          expectMarkersIsolated(
            `${targetDoc.id}: local draft state after roundtrip ${index + 1}`,
            localStateAfterRoundtrip.draftHtml,
            targetExpectedMarkers,
            targetExcludedMarkers
          );
        }

      }

      expect(
        shareRequests.filter(entry => {
          if (String(entry?.method || "").toUpperCase() === "GET") return false;
          if (/\/v1\/shares\/pages:batchGet(?:[/?#:]|$)/i.test(String(entry?.url || ""))) return false;
          return /\/v1\/shares\/(pages|pages-meta|pages-history)(?:[/?#:]|$)/i.test(String(entry?.url || ""));
        }),
        "cloud draft edits and page switches should not hit share worker before manual sync"
      ).toHaveLength(0);

      for (const doc of seeded) {
        await clickMemoDoc(page, doc.id, { allowProgrammaticOpen: false });
        const html = await getMemoEditorHtml(page);
        expectMarkersIsolated(
          `${doc.id}: editor before reload`,
          html,
          expectedMarkers.get(doc.id) || [],
          excludedMarkers(doc.id)
        );
        const state = await readLocalCloudDocState(page, doc.id);
        expectMarkersIsolated(
          `${doc.id}: editor state before reload`,
          state.editorHtml,
          expectedMarkers.get(doc.id) || [],
          excludedMarkers(doc.id)
        );
        expectMarkersIsolated(
          `${doc.id}: history state before reload`,
          state.historyHtml,
          expectedMarkers.get(doc.id) || [],
          excludedMarkers(doc.id)
        );
        if (state.draftHtml || state.draftOpType) {
          expectMarkersIsolated(
            `${doc.id}: draft state before reload`,
            state.draftHtml,
            expectedMarkers.get(doc.id) || [],
            excludedMarkers(doc.id)
          );
        }
      }

      console.log("[cloud-rapid-switch-large] sync:start");
      await syncGolive(page, targetSpaceId, 90_000);

      console.log("[cloud-rapid-switch-large] reload:start");
      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await dismissDocsTour(page);
      await ensureCloudConnectedWithSpaceCode(page, baseUrl, {
        spaceId: targetSpaceId,
        spaceCode: targetSpaceCode
      });
      await waitForMemoReady(page, 60_000);
      await refreshMemoExplorer(page, 30_000);
      await syncGolive(page, targetSpaceId, 90_000);

      for (const doc of seeded) {
        await clickMemoDoc(page, doc.id, { allowProgrammaticOpen: false });
        const state = await readCloudDocState(page, doc.id);
        expectMarkersIsolated(
          `${doc.id}: editor after reload`,
          state.editorHtml,
          expectedMarkers.get(doc.id) || [],
          excludedMarkers(doc.id)
        );
        expectMarkersIsolated(
          `${doc.id}: history after reload`,
          state.historyHtml,
          expectedMarkers.get(doc.id) || [],
          excludedMarkers(doc.id)
        );
        expectMarkersIsolated(
          `${doc.id}: remote after reload`,
          state.remoteHtml,
          expectedMarkers.get(doc.id) || [],
          excludedMarkers(doc.id)
        );
      }
    } finally {
      console.log("[cloud-rapid-switch-large] cleanup:start", { cleanupTokens });
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => null);
        await page.evaluate(async tokens => {
          const worker = (window as any).goToolkitShareWorker;
          const history = (window as any).goToolkitShareHistory;
          const explorer = (window as any).GoToolkitMemoDocumentExplorer;
          const drafts = (window as any).goToolkitCloudDrafts;
          for (const token of tokens || []) {
            try { await worker?.deleteSharePayload?.("pages", token); } catch { /* ignore */ }
            try { await worker?.deleteSharePayload?.("pages-meta", token); } catch { /* ignore */ }
            try { await history?.removeRecord?.("memo", token); } catch { /* ignore */ }
            try { drafts?.remove?.(`share:${token}`); } catch { /* ignore */ }
            try { await explorer?.removeItemById?.(`share:${token}`); } catch { /* ignore */ }
          }
          try { await explorer?.refresh?.({ forceReload: true }); } catch { /* ignore */ }
        }, cleanupTokens);
      } catch {
        // ignore cleanup failures after navigation/context teardown
      }
      console.log("[cloud-rapid-switch-large] cleanup:done");
    }
  });
});
