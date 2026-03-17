import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  clickMemoDoc,
  createLocalMemoPageFromUi,
  getMemoEditorHtml,
  refreshMemoExplorer,
  typeIntoVisibleEditor,
  waitForMemoReady
} from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

const SAMPLE_1_PATH = path.resolve(process.cwd(), "tests/fixtures/sample.md");
const SAMPLE_2_PATH = path.resolve(process.cwd(), "tests/fixtures/sample2.md");
const SAMPLE_1_TOKEN = "Démarche d'analyse PO";
const SAMPLE_2_TOKEN = "Guide Mémo";

function requireFixturePath(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required fixture: ${filePath}`);
  }
  return filePath;
}

async function ensureAssist(page: any) {
  await page.evaluate(async () => {
    const w = window as any;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (w.GoToolkitAssistInstance?.openMemoImportFileSelector) return;
      if (w.GoToolkitAssist?.mount && !w.GoToolkitAssistInstance) {
        const chatRoot = document.getElementById("chat-root");
        if (chatRoot) {
          const instance = w.GoToolkitAssist.mount(chatRoot);
          w.GoToolkitAssistInstance = instance;
          try {
            instance?.close?.();
          } catch {
            // ignore
          }
          if (w.GoToolkitAssistInstance?.openMemoImportFileSelector) return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("GoToolkitAssistInstance.openMemoImportFileSelector unavailable");
  });
}

async function openImportDialogAndSetFile(page: any, filePath: string) {
  await page.locator("#fileMenuBtn").click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#memoOpenImportBtn").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
}

async function collectPrivateDocSnapshot(page: any, docId: string) {
  return page.evaluate(async currentDocId => {
    const w = window as any;
    const activeId = String(w.GoToolkitMemoGetActiveDocumentId?.() || "").trim();
    const html = String(w.MemoEditor?.getHTML?.() || w.memoEditor?.getHTML?.() || w.GoToolkitMemoInstance?.getValue?.() || "");
    const docApi = w.goToolkitDocumentApi;
    const record = currentDocId && docApi?.getRecord ? await docApi.getRecord(currentDocId).catch(() => null) : null;
    const recordHtml = String(record?.payload?.tabs?.[0]?.content || record?.payload || "");
    const openDocsRaw = localStorage.getItem("goToolkit.memo.openDocuments");
    return {
      activeId,
      html,
      recordHtml,
      openDocsRaw,
    };
  }, docId);
}

async function waitForPrivateRecordContent(page: any, docId: string, token: string, timeout = 20_000) {
  await expect.poll(async () => {
    return page.evaluate(async ({ currentDocId, currentToken }) => {
      const docApi = (window as any).goToolkitDocumentApi;
      const record = currentDocId && docApi?.getRecord ? await docApi.getRecord(currentDocId).catch(() => null) : null;
      const html = String(record?.payload?.tabs?.[0]?.content || record?.payload || "");
      return html.includes(String(currentToken || ""));
    }, { currentDocId: docId, currentToken: token });
  }, { timeout }).toBe(true);
}

async function createImportedPrivateDoc(page: any, filePath: string, token: string) {
  await createLocalMemoPageFromUi(page, 45_000);
  const docId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "").trim());
  if (!docId) throw new Error("Missing active private doc id after creation");
  await openImportDialogAndSetFile(page, filePath);
  await expect.poll(() => getMemoEditorHtml(page), { timeout: 45_000 }).toContain(token);
  await waitForPrivateRecordContent(page, docId, token, 45_000);
  return { docId };
}

test.describe("Private page switching persistency", () => {
  test("keeps private edits across panel switches and reload", async ({ page }) => {
    test.setTimeout(180_000);
    const baseUrl = "http://127.0.0.1:5000";
    const logStep = createStepLogger("private-switch-persist");
    const sample1Path = requireFixturePath(SAMPLE_1_PATH);
    const sample2Path = requireFixturePath(SAMPLE_2_PATH);

    attachPageDebugLogging(page, "private-switch-persist");

    logStep("goto:start");
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await waitForMemoReady(page, 30_000);
    await ensureAssist(page);
    logStep("memo-ready");

    logStep("seed-private-docs:start");
    const ts = Date.now();
    const privateEdit = `PRIVATE_A_EDIT_${ts}`;
    const privateProgrammatic = `PRIVATE_A_PROGRAMMATIC_${ts}`;
    const privateA = await createImportedPrivateDoc(page, sample1Path, SAMPLE_1_TOKEN);
    const privateB = await createImportedPrivateDoc(page, sample2Path, SAMPLE_2_TOKEN);
    const seed = {
      privateAId: privateA.docId,
      privateBId: privateB.docId,
      privateBase: SAMPLE_1_TOKEN,
      privateEdit,
      privateProgrammatic,
      privateBBase: SAMPLE_2_TOKEN,
    };
    logStep("seed-private-docs:done", seed);

    logStep("edit-private-a:start");
    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateBase);
    await typeIntoVisibleEditor(page, ` ${seed.privateEdit}`);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateEdit);
    logStep("edit-private-a:done");

    logStep("immediate-reload-after-edit:start");
    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);
    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateBase);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateEdit);
    const immediateReloadSnapshot = await collectPrivateDocSnapshot(page, seed.privateAId);
    expect(String(immediateReloadSnapshot.activeId || "")).toBe(seed.privateAId);
    expect(String(immediateReloadSnapshot.html || "")).toContain(seed.privateBase);
    expect(String(immediateReloadSnapshot.html || "")).toContain(seed.privateEdit);
    expect(String(immediateReloadSnapshot.recordHtml || "")).toContain(seed.privateBase);
    expect(String(immediateReloadSnapshot.recordHtml || "")).toContain(seed.privateEdit);
    logStep("immediate-reload-after-edit:done", {
      activeId: immediateReloadSnapshot.activeId,
      htmlLength: String(immediateReloadSnapshot.html || "").length,
      recordHtmlLength: String(immediateReloadSnapshot.recordHtml || "").length,
    });

    logStep("programmatic-insert-private-a:start");
    await page.evaluate(async ({ privateProgrammatic }) => {
      const insertValue = `\n\n## Diagramme\n\n${privateProgrammatic}\n`;
      if (typeof (window as any).insertEditorMarkdownAtEnd === "function") {
        (window as any).insertEditorMarkdownAtEnd(insertValue);
      } else if (typeof (window as any).GoToolkitMemoAppendText === "function") {
        (window as any).GoToolkitMemoAppendText(insertValue);
      } else {
        throw new Error("No programmatic memo insert API available");
      }
      await (window as any).GoToolkitMemoAfterProgrammaticInsert?.();
    }, { privateProgrammatic: seed.privateProgrammatic });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateProgrammatic);
    await waitForPrivateRecordContent(page, seed.privateAId, seed.privateProgrammatic, 30_000);
    logStep("programmatic-insert-private-a:done");

    logStep("switch-to-private-b:start");
    await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
    await page.waitForFunction(
      expectedId => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "") === String(expectedId || ""),
      seed.privateBId,
      { timeout: 15_000 }
    );
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateBBase);
    logStep("switch-to-private-b:done");

    logStep("edit-private-b:start");
    const privateBSnapshot = await collectPrivateDocSnapshot(page, seed.privateBId);
    expect(String(privateBSnapshot.recordHtml || "")).toContain(seed.privateBBase);
    logStep("edit-private-b:done");

    logStep("switch-back-to-private-a:start");
    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateBase);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateEdit);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 15_000 }).toContain(seed.privateProgrammatic);
    const switchBackSnapshot = await collectPrivateDocSnapshot(page, seed.privateAId);
    expect(String(switchBackSnapshot.recordHtml || "")).toContain(seed.privateBase);
    expect(String(switchBackSnapshot.recordHtml || "")).toContain(seed.privateEdit);
    expect(String(switchBackSnapshot.recordHtml || "")).toContain(seed.privateProgrammatic);
    logStep("switch-back-to-private-a:done");

    logStep("pre-reload-wait:start");
    await page.waitForTimeout(1000);
    logStep("pre-reload-wait:done");

    logStep("reload:start");
    await page.reload({ waitUntil: "commit", timeout: 20_000 });
    await refreshMemoExplorer(page, 30_000);
    logStep("reload:done");

    await clickMemoDoc(page, seed.privateAId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateBase);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateEdit);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateProgrammatic);
    await waitForPrivateRecordContent(page, seed.privateAId, seed.privateBase);
    await waitForPrivateRecordContent(page, seed.privateAId, seed.privateEdit);
    await waitForPrivateRecordContent(page, seed.privateAId, seed.privateProgrammatic);

    const reloadDiagnostics = await collectPrivateDocSnapshot(page, seed.privateAId);
    expect(String(reloadDiagnostics.activeId || "")).toBe(seed.privateAId);
    expect(String(reloadDiagnostics.html || "")).toContain(seed.privateBase);
    expect(String(reloadDiagnostics.html || "")).toContain(seed.privateEdit);
    expect(String(reloadDiagnostics.html || "")).toContain(seed.privateProgrammatic);
    expect(String(reloadDiagnostics.recordHtml || "")).toContain(seed.privateBase);
    expect(String(reloadDiagnostics.recordHtml || "")).toContain(seed.privateEdit);
    expect(String(reloadDiagnostics.recordHtml || "")).toContain(seed.privateProgrammatic);
    expect(String(reloadDiagnostics.openDocsRaw || "")).toContain(seed.privateAId);

    logStep("reload-diagnostics", {
      activeId: reloadDiagnostics.activeId,
      htmlLength: String(reloadDiagnostics.html || "").length,
      recordHtmlLength: String(reloadDiagnostics.recordHtml || "").length,
      storedOpenDocsRaw: reloadDiagnostics.openDocsRaw,
    });

    logStep("reload-open-private-b:start");
    await clickMemoDoc(page, seed.privateBId, { allowProgrammaticOpen: false });
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).toContain(seed.privateBBase);
    await expect.poll(() => getMemoEditorHtml(page), { timeout: 20_000 }).not.toContain(seed.privateBase);
    const reloadPrivateBDiagnostics = await collectPrivateDocSnapshot(page, seed.privateBId);
    expect(String(reloadPrivateBDiagnostics.activeId || "")).toBe(seed.privateBId);
    expect(String(reloadPrivateBDiagnostics.html || "")).toContain(seed.privateBBase);
    expect(String(reloadPrivateBDiagnostics.html || "")).not.toContain(seed.privateBase);
    expect(String(reloadPrivateBDiagnostics.recordHtml || "")).toContain(seed.privateBBase);
    expect(String(reloadPrivateBDiagnostics.recordHtml || "")).not.toContain(seed.privateBase);
    logStep("reload-open-private-b:done", {
      activeId: reloadPrivateBDiagnostics.activeId,
      htmlLength: String(reloadPrivateBDiagnostics.html || "").length,
      recordHtmlLength: String(reloadPrivateBDiagnostics.recordHtml || "").length,
    });
  });
});
