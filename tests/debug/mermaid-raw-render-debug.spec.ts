import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dismissDocsTour, waitForMemoReady } from '../helpers/memo-ui';
const BASE_URL='http://127.0.0.1:5000';
const SAMPLE=readFileSync(path.resolve(process.cwd(),'tests/fixtures/sample.md'),'utf8');
const FIRST=(Array.from(SAMPLE.matchAll(/```[ \t]*mermaid[^\n\r]*\r?\n([\s\S]*?)\r?\n?```/gi), m => String(m[1]||'').trim()).filter(Boolean))[0];
test('debug raw mermaid render', async ({ page }) => {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil:'commit', timeout:20000 });
  await dismissDocsTour(page).catch(()=>null);
  await waitForMemoReady(page, 60000);
  const result = await page.evaluate(async (code) => {
    const w:any = window;
    await w.GoToolkitLazyCdn?.loadMermaid?.();
    const mermaid = w.mermaid;
    mermaid.initialize({ startOnLoad:false, theme:'default', securityLevel:'strict', flowchart:{ htmlLabels:false } });
    const { svg } = await mermaid.render(`pw-${Date.now()}`, code);
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(svg || ''), 'image/svg+xml');
    const root = doc.documentElement;
    return {
      foreignObjectCount: root.querySelectorAll('foreignObject').length,
      textCount: root.querySelectorAll('text').length,
      tspanCount: root.querySelectorAll('tspan').length,
      texts: Array.from(root.querySelectorAll('text')).map(n => String(n.textContent || '').trim()).filter(Boolean),
      sample: String(root.outerHTML || '').slice(0, 4000),
    };
  }, FIRST);
  console.log(JSON.stringify(result, null, 2));
  expect(result.textCount).toBeGreaterThan(0);
});
