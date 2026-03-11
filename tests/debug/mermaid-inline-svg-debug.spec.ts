import { test, expect } from '@playwright/test';
import path from 'node:path';
import { dismissDocsTour, waitForMemoReady } from '../helpers/memo-ui';
const BASE_URL='http://127.0.0.1:5000';
const SAMPLE=path.resolve(process.cwd(),'tests/fixtures/sample.md');
test('debug first inline svg markup', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil:'commit', timeout:20000 });
  await dismissDocsTour(page).catch(()=>null);
  await waitForMemoReady(page, 60000);
  await page.evaluate(async()=>{
    const w:any=window;
    if (!w.GoToolkitAssistInstance?.openImportFileSelector) {
      const root=document.getElementById('chat-root');
      if (w.GoToolkitAssist?.mount && root) {
        w.GoToolkitAssistInstance=w.GoToolkitAssist.mount(root);
        try { w.GoToolkitAssistInstance?.close?.(); } catch {}
      }
    }
    await w.GoToolkitMemoCreateAutoDocument();
    w.GoToolkitMemoInstance?.setValue?.('');
  });
  await page.locator('#fileMenuBtn').click();
  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#memoOpenImportBtn').click();
  const chooser=await chooserPromise;
  await chooser.setFiles(SAMPLE);
  await expect.poll(async()=>page.locator('.mermaid-svg-container svg').count(), { timeout:60000 }).toBe(3);
  const data = await page.evaluate(() => {
    const svg = document.querySelectorAll('.mermaid-svg-container svg')[0] as SVGSVGElement | undefined;
    return {
      foreignObjectCount: svg ? svg.querySelectorAll('foreignObject').length : -1,
      textCount: svg ? svg.querySelectorAll('text').length : -1,
      tspanCount: svg ? svg.querySelectorAll('tspan').length : -1,
      classList: svg ? svg.getAttribute('class') : '',
      outer: String(svg?.outerHTML || '').slice(0, 8000),
    };
  });
  console.log(JSON.stringify(data, null, 2));
});
