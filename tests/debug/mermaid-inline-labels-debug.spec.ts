import { test, expect } from '@playwright/test';
import path from 'node:path';
import { dismissDocsTour, waitForMemoReady } from '../helpers/memo-ui';

const BASE_URL = 'http://127.0.0.1:5000';
const SAMPLE = path.resolve(process.cwd(), 'tests/fixtures/sample.md');

test('debug inline mermaid labels', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'commit', timeout: 20000 });
  await dismissDocsTour(page).catch(() => null);
  await waitForMemoReady(page, 60000);
  await page.evaluate(async () => {
    const w = window as any;
    if (w.GoToolkitAssistInstance?.openImportFileSelector) return;
    const chatRoot = document.getElementById('chat-root');
    if (w.GoToolkitAssist?.mount && chatRoot) {
      w.GoToolkitAssistInstance = w.GoToolkitAssist.mount(chatRoot);
      try { w.GoToolkitAssistInstance?.close?.(); } catch {}
    }
  });
  await page.evaluate(async () => {
    await (window as any).GoToolkitMemoCreateAutoDocument();
    (window as any).GoToolkitMemoInstance?.setValue?.('');
  });
  await page.locator('#fileMenuBtn').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#memoOpenImportBtn').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(SAMPLE);
  await expect.poll(async () => page.locator('.mermaid-svg-container svg').count(), { timeout: 60000 }).toBe(3);
  const texts = await page.evaluate(() => Array.from(document.querySelectorAll('.mermaid-diagram-wrapper .mermaid-svg-container svg text')).map(n => String(n.textContent || '').trim()).filter(Boolean));
  console.log(JSON.stringify(texts, null, 2));
});
