import { test, expect } from '@playwright/test';
import path from 'node:path';
import { dismissDocsTour, waitForMemoReady } from '../helpers/memo-ui';
const BASE_URL='http://127.0.0.1:5000';
const SAMPLE=path.resolve(process.cwd(),'tests/fixtures/sample.md');
async function setup(page:any){
  await page.goto(`${BASE_URL}/index.html`, { waitUntil:'commit', timeout:20000 });
  await dismissDocsTour(page).catch(()=>null);
  await waitForMemoReady(page, 60000);
  await page.evaluate(async()=>{ const w:any=window; if (!w.GoToolkitAssistInstance?.openImportFileSelector) { const root=document.getElementById('chat-root'); if (w.GoToolkitAssist?.mount && root) { w.GoToolkitAssistInstance=w.GoToolkitAssist.mount(root); try { w.GoToolkitAssistInstance?.close?.(); } catch {} } } await w.GoToolkitMemoCreateAutoDocument(); w.GoToolkitMemoInstance?.setValue?.('');});
  await page.locator('#fileMenuBtn').click(); const cp=page.waitForEvent('filechooser'); await page.locator('#memoOpenImportBtn').click(); const c=await cp; await c.setFiles(SAMPLE);
  await expect.poll(async()=>page.locator('.mermaid-svg-container svg').count(), { timeout:60000 }).toBe(3);
}
async function texts(page:any){ return await page.evaluate(() => { const svg=document.querySelectorAll('.mermaid-svg-container svg')[0] as SVGSVGElement|undefined; return svg ? Array.from(svg.querySelectorAll('text')).map(n=>String(n.textContent||'').trim()).filter(Boolean) : []; }); }
test('debug first svg over time', async ({ page }) => {
  await setup(page);
  console.log('T0', JSON.stringify(await texts(page)));
  await page.waitForTimeout(3000);
  console.log('T3', JSON.stringify(await texts(page)));
  await page.waitForTimeout(5000);
  console.log('T8', JSON.stringify(await texts(page)));
});
