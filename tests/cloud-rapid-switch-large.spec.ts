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

async function disableRemoteHistoryForRepro(page: Page) {
  await page.evaluate(() => {
    const worker = (window as any).goToolkitShareWorker;
    if (!worker || worker.__remoteHistoryDisabledForRepro) return;
    const originalFetch = typeof worker.fetchSharePayload === "function" ? worker.fetchSharePayload.bind(worker) : null;
    const originalSave = typeof worker.saveSharePayload === "function" ? worker.saveSharePayload.bind(worker) : null;
    if (originalFetch) {
      worker.fetchSharePayload = async (collection: string, ...args: any[]) => {
        if (String(collection || "").trim() === "pages-history") {
          return null;
        }
        return originalFetch(collection, ...args);
      };
    }
    if (originalSave) {
      worker.saveSharePayload = async (collection: string, ...args: any[]) => {
        if (String(collection || "").trim() === "pages-history") {
          return { skipped: true, collection: "pages-history" };
        }
        return originalSave(collection, ...args);
      };
    }
    worker.__remoteHistoryDisabledForRepro = true;
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

    installBrowserDebugLogging(page, "cloud-rapid-switch-large");
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
      await disableRemoteHistoryForRepro(page);
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

      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        const targetDoc = seeded[operation.docIndex];
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

        const nextDoc = seeded[(operation.docIndex + 1) % seeded.length];
        await clickMemoDoc(page, nextDoc.id, { allowProgrammaticOpen: false });
        await clickMemoDoc(page, targetDoc.id, { allowProgrammaticOpen: false });
        await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(operation.append.trim());

        if (index === 4 || index === 9) {
          console.log("[cloud-rapid-switch-large] refresh-sync", { index: index + 1 });
          await refreshMemoExplorer(page, 30_000);
          await syncGolive(page, targetSpaceId, 90_000);
        }
      }

      for (const doc of seeded) {
        await clickMemoDoc(page, doc.id, { allowProgrammaticOpen: false });
        const html = await getMemoEditorHtml(page);
        for (const marker of expectedMarkers.get(doc.id) || []) {
          expect.soft(html).toContain(marker);
        }
        const state = await readCloudDocState(page, doc.id);
        for (const marker of expectedMarkers.get(doc.id) || []) {
          expect.soft(state.editorHtml, `${doc.id}: editor missing ${marker}`).toContain(marker);
          expect.soft(state.historyHtml, `${doc.id}: history missing ${marker}`).toContain(marker);
          if (state.draftHtml || state.draftOpType) {
            expect.soft(state.draftHtml, `${doc.id}: draft missing ${marker}`).toContain(marker);
          }
        }
      }

      console.log("[cloud-rapid-switch-large] reload:start");
      await page.reload({ waitUntil: "commit", timeout: 20_000 });
      await dismissDocsTour(page);
      await ensureCloudConnectedWithSpaceCode(page, baseUrl, {
        spaceId: targetSpaceId,
        spaceCode: targetSpaceCode
      });
      await disableRemoteHistoryForRepro(page);
      await waitForMemoReady(page, 60_000);
      await refreshMemoExplorer(page, 30_000);
      await syncGolive(page, targetSpaceId, 90_000);

      for (const doc of seeded) {
        await clickMemoDoc(page, doc.id, { allowProgrammaticOpen: false });
        const state = await readCloudDocState(page, doc.id);
        for (const marker of expectedMarkers.get(doc.id) || []) {
          expect(state.editorHtml, `${doc.id}: editor missing after reload ${marker}`).toContain(marker);
          expect(state.historyHtml, `${doc.id}: history missing after reload ${marker}`).toContain(marker);
          expect(state.remoteHtml, `${doc.id}: remote missing after reload ${marker}`).toContain(marker);
        }
      }
    } finally {
      console.log("[cloud-rapid-switch-large] cleanup:start", { cleanupTokens });
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
      console.log("[cloud-rapid-switch-large] cleanup:done");
    }
  });
});
