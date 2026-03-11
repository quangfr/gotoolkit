import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dismissDocsTour, waitForMemoReady } from '../helpers/memo-ui';
const BASE_URL='http://127.0.0.1:5000';
const SAMPLE=path.resolve(process.cwd(),'tests/fixtures/sample.md');
const MD=readFileSync(SAMPLE,'utf8');
const FIRST=(Array.from(MD.matchAll(/```[ \t]*mermaid[^\n\r]*\r?\n([\s\S]*?)\r?\n?```/gi), m=>String(m[1]||'').trim()).filter(Boolean))[0];
test('debug raw mermaid after import', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil:'commit', timeout:20000 });
  await dismissDocsTour(page).catch(()=>null);
  await waitForMemoReady(page, 60000);
  await page.evaluate(async()=>{ const w:any=window; if (!w.GoToolkitAssistInstance?.openImportFileSelector) { const root=document.getElementById('chat-root'); if (w.GoToolkitAssist?.mount && root) { w.GoToolkitAssistInstance=w.GoToolkitAssist.mount(root); try { w.GoToolkitAssistInstance?.close?.(); } catch {} } } await w.GoToolkitMemoCreateAutoDocument(); w.GoToolkitMemoInstance?.setValue?.('');});
  await page.locator('#fileMenuBtn').click(); const cp=page.waitForEvent('filechooser'); await page.locator('#memoOpenImportBtn').click(); const c=await cp; await c.setFiles(SAMPLE);
  await expect.poll(async()=>page.locator('.mermaid-svg-container svg').count(), { timeout:60000 }).toBe(3);
  const result = await page.evaluate(async (code) => {
    const w:any=window;
    await w.GoToolkitLazyCdn?.loadMermaid?.();
    const mermaid=w.mermaid;
    mermaid.initialize({ startOnLoad:false, theme:'default', securityLevel:'strict', flowchart:{ htmlLabels:false } });
    const { svg } = await mermaid.render(`pw-${Date.now()}`, code);
    const parser=new DOMParser();
    const doc=parser.parseFromString(String(svg||''),'image/svg+xml');
    const root=doc.documentElement;
    return {
      foreignObjectCount: root.querySelectorAll('foreignObject').length,
      texts: Array.from(root.querySelectorAll('text')).map(n=>String(n.textContent||'').trim()).filter(Boolean),
      textCount: root.querySelectorAll('text').length,
      tspanCount: root.querySelectorAll('tspan').length,
    };
  }, FIRST);
  console.log(JSON.stringify(result, null, 2));
});
