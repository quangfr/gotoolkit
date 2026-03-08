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

type Snapshot = {
  activeDocId: string;
  activeHtml: string;
  activeText: string;
  activeLength: number;
  historyTitle: string;
  historyParentId: string;
  historyStatus: string;
  historySpaceId: string;
  historyContent: string;
  historyContentLength: number;
  draftOpType: string;
  draftReason: string;
  draftTitle: string;
  draftParentId: string;
  draftSpaceId: string;
  draftContent: string;
  draftContentLength: number;
  localTitle: string;
  localContent: string;
  localContentLength: number;
  remoteStatus: string;
  remoteParentId: string;
  remoteSpaceId: string;
  remoteTitle: string;
  remoteContent: string;
  remoteContentLength: number;
  explorerSection: string;
};

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

async function snapshotDocState(page: Page, docId: string): Promise<Snapshot> {
  return page.evaluate(async currentDocId => {
    const history = (window as any).goToolkitShareHistory;
    const drafts = (window as any).goToolkitCloudDrafts;
    const worker = (window as any).goToolkitShareWorker;
    const docApi = (window as any).goToolkitDocumentApi;
    const explorer = (window as any).GoToolkitMemoDocumentExplorer;
    const activeHtml = String((window as any).GoToolkitMemoInstance?.getValue?.() || "");
    const activeText = String(document.querySelector(".ProseMirror")?.textContent || "");
    const token = String(currentDocId || "").startsWith("share:")
      ? String(currentDocId).slice("share:".length)
      : "";
    const historyRows = await history?.getRecordsByApp?.("memo");
    const historyRow = Array.isArray(historyRows)
      ? historyRows.find((row: any) => String(row?.token || "") === token)
      : null;
    const draftRows = await drafts?.readAll?.();
    const draft = draftRows?.[currentDocId] || null;
    const localRecord = !token ? await docApi?.getRecord?.(currentDocId).catch?.(() => null) : null;
    const remoteMeta = token ? await worker?.fetchSharePayload?.("pages-meta", token).catch?.(() => null) : null;
    const remotePage = token ? await worker?.fetchSharePayload?.("pages", token).catch?.(() => null) : null;
    const item = typeof explorer?.getItemById === "function" ? explorer.getItemById(currentDocId) : null;
    return {
      activeDocId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      activeHtml,
      activeText,
      activeLength: activeHtml.length,
      historyTitle: String(historyRow?.title || ""),
      historyParentId: String(historyRow?.parentId || ""),
      historyStatus: String(historyRow?.status || historyRow?.payload?.status || ""),
      historySpaceId: String(historyRow?.spaceId || historyRow?.payload?.spaceId || ""),
      historyContent: String(historyRow?.payload?.tabs?.[0]?.content || ""),
      historyContentLength: String(historyRow?.payload?.tabs?.[0]?.content || "").length,
      draftOpType: String(draft?.opType || ""),
      draftReason: String(draft?.reason || ""),
      draftTitle: String(draft?.title || ""),
      draftParentId: String(draft?.parentId || ""),
      draftSpaceId: String(draft?.spaceId || ""),
      draftContent: String(draft?.payload?.tabs?.[0]?.content || ""),
      draftContentLength: String(draft?.payload?.tabs?.[0]?.content || "").length,
      localTitle: String(localRecord?.name || localRecord?.title || ""),
      localContent: String(localRecord?.payload?.tabs?.[0]?.content || ""),
      localContentLength: String(localRecord?.payload?.tabs?.[0]?.content || "").length,
      remoteStatus: String(remoteMeta?.payload?.status || ""),
      remoteParentId: String(remoteMeta?.payload?.parentId || ""),
      remoteSpaceId: String(remoteMeta?.payload?.spaceId || remotePage?.payload?.spaceId || ""),
      remoteTitle: String(remoteMeta?.payload?.title || ""),
      remoteContent: String(remotePage?.payload?.tabs?.[0]?.content || ""),
      remoteContentLength: String(remotePage?.payload?.tabs?.[0]?.content || "").length,
      explorerSection: String(item?.section || "")
    };
  }, docId);
}

async function logSnapshot(page: Page, label: string, docId: string) {
  const state = await snapshotDocState(page, docId);
  console.log(`[cloud-content-loss] ${label}`, state);
  return state;
}

async function expectDocContentToContain(page: Page, label: string, docId: string, token: string) {
  const state = await logSnapshot(page, label, docId);
  expect.soft(state.activeHtml, `${label}: active editor lost content`).toContain(token);
  if (String(docId || "").startsWith("share:")) {
    expect.soft(state.historyContent, `${label}: share history lost content`).toContain(token);
    if (state.draftContentLength > 0 || state.draftOpType) {
      expect.soft(state.draftContent, `${label}: cloud draft lost content`).toContain(token);
    }
    if (state.remoteContentLength > 0 || state.remoteStatus) {
      expect.soft(state.remoteContent, `${label}: remote share payload lost content`).toContain(token);
    }
  } else {
    expect.soft(state.localContent, `${label}: private record lost content`).toContain(token);
  }
}

async function flushPendingCloudState(page: Page, spaceId: string, reason: string) {
  console.log("[cloud-content-loss] flush-pending:start", { spaceId, reason });
  await page.evaluate(async ({ targetSpaceId, flushReason }) => {
    const helpers = (window as any).goToolkitSpaceSyncHelpers;
    const draftManager = (window as any).goToolkitCloudDrafts;
    try {
      await helpers?.flushSharedTreeMoveMetaBatch?.();
    } catch (err) {
      console.log("[cloud-content-loss] browser-flush-tree-error", { flushReason, message: String((err as any)?.message || err || "") });
    }
    try {
      await draftManager?.readAll?.();
    } catch (err) {
      console.log("[cloud-content-loss] browser-read-drafts-error", { flushReason, message: String((err as any)?.message || err || "") });
    }
    const lastSync = (window as any).__goToolkitLastCloudSyncTiming || null;
    const pending = typeof (window as any).getPendingSharedSyncDetailsInSpace === "function"
      ? (window as any).getPendingSharedSyncDetailsInSpace(targetSpaceId)
      : null;
    console.log("[cloud-content-loss] browser-flush-state", {
      flushReason,
      targetSpaceId,
      lastSync,
      pending
    });
  }, { targetSpaceId: spaceId, flushReason: reason });
  console.log("[cloud-content-loss] flush-pending:done", { spaceId, reason });
}

async function logSwitchState(page: Page, label: string, docId: string) {
  const state = await page.evaluate(async currentDocId => {
    const memoState = (window as any).__memoState || null;
    const activeTabId = String(memoState?.activeTabId || "");
    const tabs = Array.isArray(memoState?.tabs)
      ? memoState.tabs.map((tab: any) => ({
          id: String(tab?.id || ""),
          title: String(tab?.title || ""),
          contentLength: String(tab?.content || "").length,
          hasContent: String(tab?.content || "").length > 0
        }))
      : [];
    return {
      docId: String(currentDocId || ""),
      activeDocId: String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""),
      editorHtmlLength: String((window as any).GoToolkitMemoInstance?.getValue?.() || "").length,
      editorTextLength: String(document.querySelector(".ProseMirror")?.textContent || "").length,
      activeTabId,
      tabs
    };
  }, docId);
  console.log(`[cloud-content-loss] ${label}`, state);
  return state;
}

async function persistAssistConversationMarker(page: Page, marker: string) {
  return page.evaluate(currentMarker => {
    const assist = (window as any).GoToolkitAssistInstance;
    if (!assist) throw new Error("assist unavailable");
    assist.syncScopeFromActiveDocument?.({ force: true });
    const scopeId = String(assist.currentConversationScopeId || "");
    assist.conversation = assist.conversation || { id: `conv-${Date.now()}`, messages: [] };
    assist.conversation.messages = [{
      id: `msg-${Date.now()}`,
      role: "user",
      content: currentMarker,
      createdAt: Date.now()
    }];
    assist.persist?.();
    const stored = JSON.parse(localStorage.getItem("goToolkit.chat.conversations.memo") || "{}");
    return {
      scopeId,
      storedMessage: String(stored?.[scopeId]?.messages?.[0]?.content || "")
    };
  }, marker);
}

async function expectAssistConversationMarker(page: Page, marker: string, expectedScopeId?: string) {
  await expect.poll(async () => {
    return page.evaluate(expected => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (!assist) return { scopeId: "", liveMessage: "", storedMessage: "" };
      assist.syncScopeFromActiveDocument?.({ force: true });
      const scopeId = String(assist.currentConversationScopeId || "");
      const liveMessage = String(assist.conversation?.messages?.[0]?.content || "");
      const stored = JSON.parse(localStorage.getItem("goToolkit.chat.conversations.memo") || "{}");
      const storedMessage = String(stored?.[scopeId]?.messages?.[0]?.content || "");
      return { scopeId, liveMessage, storedMessage };
    }, expectedScopeId || "");
  }, { timeout: 20_000 }).toMatchObject({
    scopeId: expectedScopeId || expect.any(String),
    liveMessage: marker,
    storedMessage: marker
  });
}

test.describe("Cloud content loss diagnostic", () => {
  test("keeps the right cloud content and assist scope across switch and sync", async ({ page }) => {
    test.setTimeout(300_000);
    const baseUrl = "http://127.0.0.1:5000";
    const ts = Date.now();
    const prefix = `pw-content-loss-${ts}`;
    const cloudArchiveToken = `${prefix}-cloud-archive`;
    const cloudEditToken = `${prefix}-cloud-edit`;
    const privateMoveToken = `${prefix}-private-move`;
    const cloudArchiveMarker = `PW_CLOUD_ARCHIVE_${ts}`;
    const cloudEditMarker = `PW_CLOUD_EDIT_${ts}`;
    const cloudEditAppend = `PW_CLOUD_EDIT_APPEND_${ts}`;
    const privateEditMarker = `PW_PRIVATE_EDIT_${ts}`;
    const privateEditAppend = `PW_PRIVATE_EDIT_APPEND_${ts}`;
    const privateMoveMarker = `PW_PRIVATE_MOVE_${ts}`;
    const privateArchiveMarker = `PW_PRIVATE_ARCHIVE_${ts}`;
    const sourceSpaceId = EPICONCEPT_SPACE_CODE ? EPICONCEPT_SPACE_ID : PW_TEST_SPACE_ID;
    const sourceSpaceCode = EPICONCEPT_SPACE_CODE || PW_TEST_SPACE_CODE;
    const targetSpaceId = PW_TEST_SPACE_ID;
    const targetSpaceCode = PW_TEST_SPACE_CODE;
    const cleanupTokens = [cloudArchiveToken, cloudEditToken, privateMoveToken];
    let seeded: { privateEditId: string; privateMoveId: string; privateArchiveId: string } | null = null;

    installBrowserDebugLogging(page, "cloud-content-loss");
    await page.addInitScript(() => {
      try {
        localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
      } catch {
        // ignore
      }
    });

    try {
      console.log("[cloud-content-loss] connect-space:start", { spaceId: targetSpaceId, sourceSpaceId });
      await ensureCloudConnectedWithSpaceCode(page, baseUrl, {
        spaceId: targetSpaceId,
        spaceCode: targetSpaceCode
      });
      await dismissDocsTour(page);
      await page.waitForFunction(() => Boolean((window as any).goToolkitShareHistory?.upsertRecord), null, { timeout: 120_000 });
      await page.waitForFunction(() => Boolean((window as any).goToolkitDocumentApi?.getRecord), null, { timeout: 120_000 });
      console.log("[cloud-content-loss] connect-space:done");

      seeded = await page.evaluate(async seed => {
        const {
          spaceId,
          spaceCode,
          sourceSpaceId,
          sourceSpaceCode,
          cloudArchiveToken,
          cloudArchiveMarker,
          cloudEditToken,
          cloudEditMarker,
          privateEditMarker,
          privateMoveMarker,
          privateArchiveMarker
        } = seed as any;
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const docApi = (window as any).goToolkitDocumentApi;
        const spaces = (window as any).GoToolkitSpaces;
        spaces?.upsertSpace?.({
          id: spaceId,
          name: "Go Live",
          icon: "cloud-upload",
          spaceJoinCode: spaceCode,
          isDefault: true
        });

        const extractToken = (entry: any) => String(entry?.id || entry?.token || "").replace(/^share:/, "").trim();
        const getFirstTabContent = (payload: any) => String(payload?.tabs?.[0]?.content || "").trim();
        const trimContentForRepro = (content: string) => {
          const raw = String(content || "").trim();
          if (!raw) return "";
          return raw.length > 24_000 ? `${raw.slice(0, 24_000)}<p>[trimmed-for-repro]</p>` : raw;
        };
        const ensureHtml = (content: string, marker: string) => {
          const baseContent = String(content || "").trim();
          if (!baseContent) return `<p>${marker}</p>`;
          if (baseContent.includes(marker)) return baseContent;
          return `${baseContent}<p>${marker}</p>`;
        };
        const sourceSamples: Array<{ title: string; content: string }> = [];
        try {
          spaces?.upsertSpace?.({
            id: sourceSpaceId,
            name: String(sourceSpaceId || "").toUpperCase(),
            icon: "cloud-upload",
            spaceJoinCode: sourceSpaceCode,
            isDefault: false
          });
          await worker.verifySpaceCredentials(sourceSpaceId, sourceSpaceCode);
          const tree = await worker.listShareTree("pages-meta", {
            spaceId: sourceSpaceId,
            includeArchived: false
          });
          const treeDocs = Array.isArray(tree?.documents) ? tree.documents : [];
          for (const entry of treeDocs) {
            const token = extractToken(entry);
            if (!token) continue;
            const page = await worker.fetchSharePayload("pages", token, { spaceId: sourceSpaceId }).catch(() => null);
            const content = getFirstTabContent(page?.payload);
            if (!content || content.length < 40) continue;
            sourceSamples.push({
              title: String(entry?.payload?.title || page?.payload?.tabs?.[0]?.title || `Source ${token}`).trim() || `Source ${token}`,
              content: trimContentForRepro(content)
            });
            if (sourceSamples.length >= 3) break;
          }
        } catch (err) {
          console.log("[cloud-content-loss] source-sample-load-failed", {
            sourceSpaceId,
            message: String((err as any)?.message || err || "")
          });
        }
        while (sourceSamples.length < 3) {
          sourceSamples.push({
            title: `Fallback Source ${sourceSamples.length + 1}`,
            content: `<p>Fallback seeded content ${sourceSamples.length + 1}</p>`
          });
        }
        await worker.verifySpaceCredentials(spaceId, spaceCode);

        const makePayload = (token: string, title: string, content: string, extra: Record<string, unknown> = {}) => ({
          tabs: [{
            id: `tab-${token}`,
            title,
            description: "",
            superpowers: [],
            content
          }],
          activeTabId: `tab-${token}`,
          parentId: "",
          spaceId,
          status: "active",
          position: Date.now(),
          ...extra
        });

        const writeCloud = async (token: string, title: string, content: string) => {
          const payload = makePayload(token, title, content);
          await worker.saveSharePayload("pages-meta", token, {
            title,
            description: "",
            superpowers: [],
            icon: "file-symlink",
            parentId: "",
            spaceId,
            position: Date.now(),
            status: "active"
          });
          await worker.saveSharePayload("pages", token, payload);
          await history.upsertRecord("memo", {
            token,
            title,
            description: "",
            superpowers: [],
            payload,
            icon: "file-symlink",
            parentId: "",
            spaceId,
            position: Date.now(),
            updatedAt: new Date().toISOString()
          });
        };

        await writeCloud(
          cloudArchiveToken,
          `Diag Cloud Archive ${sourceSamples[0].title}`,
          ensureHtml(sourceSamples[0].content, cloudArchiveMarker)
        );
        await writeCloud(
          cloudEditToken,
          `Diag Cloud Edit ${sourceSamples[1].title}`,
          ensureHtml(sourceSamples[1].content, cloudEditMarker)
        );
        const createPrivateRecord = async (title: string, content: string) => {
          const id = docApi?.generateId?.() || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const payload = {
            tabs: [{
              id: `tab-${id}`,
              title,
              description: "",
              superpowers: [],
              content
            }],
            activeTabId: `tab-${id}`
          };
          await docApi?.upsertRecord?.({
            id,
            app: "memo",
            title,
            description: "",
            payload,
            updatedAt: new Date().toISOString()
          });
          return id;
        };
        const privateEditId = await createPrivateRecord(
          `Diag Private Edit ${sourceSamples[1].title}`,
          ensureHtml(sourceSamples[1].content, privateEditMarker)
        );
        const privateMoveId = await createPrivateRecord(
          `Diag Private Move ${sourceSamples[2].title}`,
          ensureHtml(sourceSamples[2].content, privateMoveMarker)
        );
        const privateArchiveId = await createPrivateRecord(
          `Diag Private Archive ${sourceSamples[0].title}`,
          ensureHtml(sourceSamples[0].content, privateArchiveMarker)
        );
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
        return { privateEditId, privateMoveId, privateArchiveId, sourceSamples };
      }, {
        spaceId: targetSpaceId,
        spaceCode: targetSpaceCode,
        sourceSpaceId,
        sourceSpaceCode,
        cloudArchiveToken,
        cloudArchiveMarker,
        cloudEditToken,
        cloudEditMarker,
        privateEditMarker,
        privateMoveMarker,
        privateArchiveMarker
      });
      console.log("[cloud-content-loss] seed:done", seeded);

      console.log("[cloud-content-loss] scenario:cloud-edit:start");
      await clickMemoDoc(page, `share:${cloudEditToken}`);
      await expectDocContentToContain(page, "cloud-edit:before", `share:${cloudEditToken}`, cloudEditMarker);
      await typeIntoVisibleEditor(page, ` ${cloudEditAppend}`);
      await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(cloudEditAppend);
      await expectDocContentToContain(page, "cloud-edit:after", `share:${cloudEditToken}`, cloudEditMarker);

      console.log("[cloud-content-loss] scenario:switch-before-sync:start");
      await logSwitchState(page, "switch-before-sync:cloud-edit:active", `share:${cloudEditToken}`);
      await clickMemoDoc(page, `share:${cloudArchiveToken}`);
      await logSwitchState(page, "switch-before-sync:cloud-archive:active", `share:${cloudArchiveToken}`);
      await clickMemoDoc(page, `share:${cloudEditToken}`);
      await logSwitchState(page, "switch-before-sync:cloud-edit:return", `share:${cloudEditToken}`);
      await expectDocContentToContain(page, "switch-before-sync:cloud-edit:return", `share:${cloudEditToken}`, cloudEditMarker);

      console.log("[cloud-content-loss] scenario:private-to-cloud:start");
      await clickMemoDoc(page, seeded.privateMoveId);
      await expectDocContentToContain(page, "private-to-cloud:before", seeded.privateMoveId, privateMoveMarker);
      await page.evaluate(async ({ privateId, promotedToken, spaceId }) => {
        const docApi = (window as any).goToolkitDocumentApi;
        const history = (window as any).goToolkitShareHistory;
        const local = await docApi.getRecord(privateId);
        const payload = local?.payload && typeof local.payload === "object"
          ? { ...local.payload, spaceId, parentId: "", status: "active", position: Date.now() }
          : null;
        if (!payload) throw new Error("private payload missing");
        (window as any).goToolkitCloudDrafts.set(`share:${promotedToken}`, {
          id: `share:${promotedToken}`,
          token: promotedToken,
          opType: "create",
          reason: "create",
          title: String(local?.name || local?.title || "Promoted private").trim() || "Promoted private",
          description: "",
          superpowers: [],
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          payload,
          updatedAt: new Date().toISOString()
        });
        await history.upsertRecord("memo", {
          token: promotedToken,
          title: String(local?.name || local?.title || "Promoted private").trim() || "Promoted private",
          description: "",
          superpowers: [],
          payload,
          icon: "file-symlink",
          parentId: "",
          spaceId,
          position: Date.now(),
          updatedAt: new Date().toISOString()
        });
        await (window as any).GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
      }, { privateId: seeded.privateMoveId, promotedToken: privateMoveToken, spaceId: targetSpaceId });
      await clickMemoDoc(page, `share:${privateMoveToken}`);
      await expectDocContentToContain(page, "private-to-cloud:after-promote-local", `share:${privateMoveToken}`, privateMoveMarker);
      await flushPendingCloudState(page, targetSpaceId, "private-to-cloud-after-promote");
      await syncGolive(page, targetSpaceId);
      await clickMemoDoc(page, `share:${privateMoveToken}`);
      await expectDocContentToContain(page, "private-to-cloud:after-sync", `share:${privateMoveToken}`, privateMoveMarker);

      console.log("[cloud-content-loss] scenario:assist-persist:start");
      await clickMemoDoc(page, `share:${cloudEditToken}`);
      const assistMarker = `PW_ASSIST_SCOPE_${ts}`;
      const assistSeed = await persistAssistConversationMarker(page, assistMarker);
      expect(assistSeed.scopeId).toContain(`tab-${cloudEditToken}`);
      expect(assistSeed.storedMessage).toBe(assistMarker);

      console.log("[cloud-content-loss] scenario:switch-after-sync:start");
      await clickMemoDoc(page, `share:${cloudEditToken}`);
      await logSwitchState(page, "switch-after-sync:cloud-edit:active", `share:${cloudEditToken}`);
      await clickMemoDoc(page, `share:${privateMoveToken}`);
      await logSwitchState(page, "switch-after-sync:private-move:active", `share:${privateMoveToken}`);
      await clickMemoDoc(page, `share:${cloudEditToken}`);
      await logSwitchState(page, "switch-after-sync:cloud-edit:return", `share:${cloudEditToken}`);
      await expectDocContentToContain(page, "switch-after-sync:cloud-edit:return", `share:${cloudEditToken}`, cloudEditMarker);
      await expectAssistConversationMarker(page, assistMarker, assistSeed.scopeId);
      await clickMemoDoc(page, `share:${privateMoveToken}`);
      await logSwitchState(page, "switch-after-sync:private-move:return", `share:${privateMoveToken}`);
      await expectDocContentToContain(page, "switch-after-sync:private-move:return", `share:${privateMoveToken}`, privateMoveMarker);

      console.log("[cloud-content-loss] reload-and-verify:start");
      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await dismissDocsTour(page);
      await clickMemoDoc(page, `share:${cloudEditToken}`);
      await expectDocContentToContain(page, "reload:cloud-edit", `share:${cloudEditToken}`, cloudEditMarker);
      await expectAssistConversationMarker(page, assistMarker, assistSeed.scopeId);
      await clickMemoDoc(page, `share:${privateMoveToken}`);
      await expectDocContentToContain(page, "reload:private-move-cloud", `share:${privateMoveToken}`, privateMoveMarker);
    } finally {
      console.log("[cloud-content-loss] cleanup:start");
      await page.evaluate(async ({ tokens, privateIds }) => {
        const worker = (window as any).goToolkitShareWorker;
        const history = (window as any).goToolkitShareHistory;
        const explorer = (window as any).GoToolkitMemoDocumentExplorer;
        const drafts = (window as any).goToolkitCloudDrafts;
        const docApi = (window as any).goToolkitDocumentApi;
        for (const token of tokens || []) {
          try { await worker?.deleteSharePayload?.("pages", token); } catch (err) { /* noop */ }
          try { await worker?.deleteSharePayload?.("pages-meta", token); } catch (err) { /* noop */ }
          try { await history?.removeRecord?.("memo", token); } catch (err) { /* noop */ }
          try { drafts?.remove?.(`share:${token}`); } catch (err) { /* noop */ }
          try { await explorer?.removeItemById?.(`share:${token}`); } catch (err) { /* noop */ }
        }
        for (const id of privateIds || []) {
          try { await docApi?.deleteRecord?.(id); } catch (err) { /* noop */ }
          try { await explorer?.removeItemById?.(id); } catch (err) { /* noop */ }
        }
        try { await explorer?.refresh?.({ forceReload: true }); } catch (err) { /* noop */ }
      }, {
        tokens: cleanupTokens,
        privateIds: [seeded?.privateEditId, seeded?.privateMoveId, seeded?.privateArchiveId].filter(Boolean)
      });
      console.log("[cloud-content-loss] cleanup:done");
    }
  });
});
