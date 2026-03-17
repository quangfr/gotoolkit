import { test, expect } from '@playwright/test';
import path from 'node:path';
import { dismissDocsTour, importMemoFileViaMenu, waitForMemoReady } from '../helpers/memo-ui';
const BASE_URL='http://127.0.0.1:5000';
const SAMPLE=path.resolve(process.cwd(),'tests/fixtures/sample.md');
test('debug first svg texts', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil:'commit', timeout:20000 });
  await dismissDocsTour(page).catch(()=>null);
  await waitForMemoReady(page, 60000);
  await page.evaluate(async()=>{ const w:any=window; if (!w.GoToolkitAssistInstance?.openImportFileSelector) { const root=document.getElementById('chat-root'); if (w.GoToolkitAssist?.mount && root) { w.GoToolkitAssistInstance=w.GoToolkitAssist.mount(root); try { w.GoToolkitAssistInstance?.close?.(); } catch {} } } await w.GoToolkitMemoCreateAutoDocument(); w.GoToolkitMemoInstance?.setValue?.('');});
  await importMemoFileViaMenu(page, SAMPLE);
  await expect.poll(async()=>page.locator('.mermaid-svg-container svg').count(), { timeout:60000 }).toBe(3);
  const texts = await page.evaluate(() => {
    const svg = document.querySelectorAll('.mermaid-svg-container svg')[0] as SVGSVGElement | undefined;
    return svg ? Array.from(svg.querySelectorAll('text')).map(n => String(n.textContent || '').trim()).filter(Boolean) : [];
  });
  console.log(JSON.stringify(texts, null, 2));
});
