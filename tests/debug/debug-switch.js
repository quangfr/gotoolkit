const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const baseUrl = 'http://127.0.0.1:5000';
  await page.goto(baseUrl + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.GoToolkitMemoCreateDocument));
  await page.waitForFunction(() => Boolean(window.goToolkitShareHistory?.upsertRecord));
  await page.waitForSelector('.ProseMirror:visible');

  const seed = await page.evaluate(async () => {
    const ts = Date.now();
    const pa = await window.GoToolkitMemoCreateDocument({ name: 'DBG PA ' + ts, initialContent: '<p>PA</p>' });
    const pb = await window.GoToolkitMemoCreateDocument({ name: 'DBG PB ' + ts, initialContent: '<p>PB</p>' });
    const token = 'dbg-cloud-' + ts;
    const tabId = 'tab-' + ts;
    await window.goToolkitShareHistory.upsertRecord('memo', {
      token,
      title: 'DBG C ' + ts,
      description: '',
      superpowers: [],
      payload: { tabs: [{ id: tabId, title: 'DBG C', description: '', superpowers: [], content: '<p>C</p>' }], activeTabId: tabId },
      icon: 'file-symlink',
      parentId: '',
      spaceId: 'golive',
      position: ts,
      updatedAt: new Date().toISOString()
    });
    await window.GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
    return { pa, pb, cloudId: 'share:' + token, editA: 'EDIT_A_' + ts, editC: 'EDIT_C_' + ts };
  });

  const clickDoc = async (id) => {
    const el = page.locator(`.document-explorer__item[data-document-id="${id}"]`).first();
    await el.click();
    await page.waitForFunction((expected) => String(window.GoToolkitMemoGetActiveDocumentId?.() || '') === expected, id);
  };

  const typeText = async (text) => {
    const editor = page.locator('.ProseMirror:visible').first();
    await editor.click();
    await page.keyboard.type(' ' + text);
  };

  await clickDoc(seed.pa);
  await typeText(seed.editA);
  await clickDoc(seed.cloudId);
  await typeText(seed.editC);
  await clickDoc(seed.pb);
  await clickDoc(seed.pa);
  await clickDoc(seed.cloudId);

  const pre = await page.evaluate(async (seed) => {
    const pa = await window.goToolkitDocumentApi.getRecord(seed.pa);
    const recs = await window.goToolkitShareHistory.getRecordsByApp('memo');
    const cloudRec = recs.find(r => ('share:' + r.token) === seed.cloudId);
    const draft = window.goToolkitCloudDrafts?.get?.(seed.cloudId) || null;
    return {
      privateTabId: pa?.payload?.tabs?.[0]?.id || null,
      privatePayload: pa?.payload?.tabs?.[0]?.content || null,
      cloudTabId: cloudRec?.payload?.tabs?.[0]?.id || null,
      cloudHistoryPayload: cloudRec?.payload?.tabs?.[0]?.content || null,
      cloudDraftPayload: draft?.payload?.tabs?.[0]?.content || null,
      activeId: window.GoToolkitMemoGetActiveDocumentId?.() || null,
      activeTabId: window.getMemoActiveTabId?.() || null,
      activeHtml: window.GoToolkitMemoInstance?.getValue?.() || null,
      isEditable: Boolean(window.MemoEditor?.isEditable),
    };
  }, seed);

  console.log('PRE', JSON.stringify(pre, null, 2));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.GoToolkitMemoDocumentExplorer?.refresh));
  await page.evaluate(async () => {
    await window.GoToolkitMemoDocumentExplorer?.refresh?.({ forceReload: true });
  });

  await clickDoc(seed.pa);
  const afterPa = await page.evaluate(() => window.GoToolkitMemoInstance?.getValue?.() || null);
  await clickDoc(seed.cloudId);
  const afterC = await page.evaluate(() => window.GoToolkitMemoInstance?.getValue?.() || null);

  console.log('AFTER', JSON.stringify({ afterPa, afterC }, null, 2));

  await browser.close();
})();
