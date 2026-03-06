import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const BASE_URL = 'http://127.0.0.1:5000/index.html?desktop=1&resetMemoState=1';
const TEST_NAME = String(process.env.TEST_NAME || 'search-ui-multipage').trim() || 'search-ui-multipage';
const videoDir = path.join(ROOT, 'tmp', 'videos');
const stepsDir = path.join(ROOT, 'tmp', 'steps');
fs.mkdirSync(videoDir, { recursive: true });
fs.mkdirSync(stepsDir, { recursive: true });

async function isServerUp() {
  try {
    const res = await fetch('http://127.0.0.1:5000/', { method: 'HEAD' });
    return res.ok || (res.status >= 300 && res.status < 500);
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerUp()) return;
  const logPath = path.join(ROOT, 'tmp', 'start-test.log');
  const out = fs.openSync(logPath, 'a');
  const child = spawn('npm', ['run', 'start:test'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out]
  });
  child.unref();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await isServerUp()) return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('start:test server did not start on :5000');
}

await ensureServer();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1512, height: 920 },
  recordVideo: {
    dir: videoDir,
    size: { width: 1512, height: 920 }
  }
});

await context.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent = `
    #pw-cursor-overlay{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:transform 20ms linear}
    #pw-cursor-overlay svg{width:100%;height:100%;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}
    .pw-click-ring{position:fixed;width:16px;height:16px;border-radius:999px;border:3px solid rgba(255,221,0,.95);background:rgba(255,221,0,.25);pointer-events:none;z-index:2147483646;transform:translate(-50%,-50%) scale(.6);animation:pw-ring 900ms cubic-bezier(.22,1,.36,1) forwards}
    @keyframes pw-ring{0%{opacity:1;transform:translate(-50%,-50%) scale(.6)}70%{opacity:.85}100%{opacity:0;transform:translate(-50%,-50%) scale(3.8)}}`;
  document.documentElement.appendChild(style);
  const el = document.createElement('div');
  el.id = 'pw-cursor-overlay';
  el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 3.5L4.8 19.6L9.9 14.8L13.8 21.4L16.3 20L12.5 13.6L19.2 12.2L4 3.5Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  document.documentElement.appendChild(el);
  window.__pwSetCursor = (x, y) => {
    const c = document.getElementById('pw-cursor-overlay');
    if (c) c.style.transform = `translate(${x}px,${y}px)`;
  };
  window.__pwRing = (x, y) => {
    const ring = document.createElement('div');
    ring.className = 'pw-click-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.documentElement.appendChild(ring);
    setTimeout(() => ring.remove(), 1000);
  };
});

const page = await context.newPage();

function slug(n) {
  return String(n).padStart(2, '0');
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${slug(d.getMonth() + 1)}-${slug(d.getDate())}-${slug(d.getHours())}${slug(d.getMinutes())}${slug(d.getSeconds())}`;
}
const RUN_TS = stamp();

function sanitizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'step';
}

async function captureStep(stepNumber, stepName) {
  const n = String(stepNumber).padStart(2, '0');
  const safeStep = sanitizeName(stepName);
  const safeTest = sanitizeName(TEST_NAME);
  const file = path.join(stepsDir, `step-${n}-${safeStep}-${safeTest}-${RUN_TS}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function moveCursor(x, y, ms = 650) {
  const steps = Math.max(20, Math.round(ms / 16));
  await page.mouse.move(x, y, { steps });
  await page.evaluate(([cx, cy]) => window.__pwSetCursor?.(cx, cy), [x, y]);
}

async function clickWithCursor(locator) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 15000 });
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await moveCursor(x, y, 650);
        await page.evaluate(([cx, cy]) => window.__pwRing?.(cx, cy), [x, y]);
        await page.mouse.click(x, y);
      } else {
        await locator.click({ timeout: 5000 });
      }
      await page.waitForTimeout(180);
      return;
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(200);
    }
  }
  throw lastErr || new Error('clickWithCursor failed');
}

async function typeWithEffect(text, totalMs = 500) {
  const delay = Math.max(10, Math.floor(totalMs / Math.max(1, String(text).length)));
  await page.keyboard.type(String(text), { delay });
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1300);
  await moveCursor(120, 120, 500);
  await captureStep(1, 'app-loaded');

  const closeTour = page.locator('#docsTourOverlayClose, .docs-tour-overlay__close, #docs-tour-overlay button').first();
  if (await closeTour.isVisible({ timeout: 1200 }).catch(() => false)) {
    await clickWithCursor(closeTour);
    await page.waitForTimeout(300);
    await captureStep(2, 'tour-closed');
  }

  const explorerVisible = await page.locator('#documentExplorer').isVisible({ timeout: 1500 }).catch(() => false);
  if (!explorerVisible) {
    const toggle = page.locator('#documentExplorerToggle');
    if (await toggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await clickWithCursor(toggle);
      await page.waitForTimeout(300);
    }
  }

  const addRoot = page.locator("#documentExplorer .document-explorer__section-header[data-section='private'] .document-explorer__item-action[title='Créer une page racine'], #documentExplorer .document-explorer__section-header[data-section='private'] .document-explorer__item-action[title='Ajouter une page']").first();

  for (let i = 1; i <= 4; i += 1) {
    await clickWithCursor(addRoot);
    await page.waitForTimeout(350);
    const firstItem = page.locator('#documentExplorer .document-explorer__item[data-document-id]').first();
    await clickWithCursor(firstItem);
    await page.waitForTimeout(250);
    const editor = page.locator('.ProseMirror:visible').first();
    await clickWithCursor(editor);
    const text = i === 3
      ? `Page ${i} contains safran keyword and turbine details.`
      : `Page ${i} generic content without target term.`;
    await typeWithEffect(text, 500);
    await page.waitForTimeout(280);
  }
  await captureStep(3, 'pages-created-and-edited');

  const searchInput = page.locator('#documentExplorer .document-explorer__search-input').first();
  await clickWithCursor(searchInput);
  await typeWithEffect('safran', 500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  await captureStep(4, 'search-results');

  const results = page.locator('#memoSearchResults .memo-search-result');
  const count = await results.count();
  console.log(`[playwright-search-ui] resultCount=${count}`);

  if (count > 0) {
    await clickWithCursor(results.first());
    await page.waitForTimeout(700);
    await captureStep(5, 'first-result-opened');
  }

  await page.waitForTimeout(1000);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const latest = fs.readdirSync(videoDir)
  .filter(name => name.endsWith('.webm'))
  .map(name => path.join(videoDir, name))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!latest) {
  console.error('No video generated');
  process.exit(2);
}

const dest = path.join(videoDir, `${sanitizeName(TEST_NAME)}-${RUN_TS}.webm`);
fs.copyFileSync(latest, dest);
console.log(dest);
