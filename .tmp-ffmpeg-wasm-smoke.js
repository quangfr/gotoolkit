const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5000', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const FFMPEG_ESM_URLS = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm',
      'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'
    ];
    const FFMPEG_UTIL_ESM_URLS = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm',
      'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js'
    ];
    const FFMPEG_CORE_BASE_URLS = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm',
      'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'
    ];

    let ffmpegMod = null;
    let utilMod = null;
    let importError = null;

    for (let i = 0; i < FFMPEG_ESM_URLS.length; i += 1) {
      try {
        ffmpegMod = await import(FFMPEG_ESM_URLS[i]);
        utilMod = await import(FFMPEG_UTIL_ESM_URLS[Math.min(i, FFMPEG_UTIL_ESM_URLS.length - 1)]);
        if (ffmpegMod?.FFmpeg && utilMod?.toBlobURL) break;
      } catch (err) {
        importError = String(err?.message || err);
        ffmpegMod = null;
        utilMod = null;
      }
    }

    if (!ffmpegMod?.FFmpeg || !utilMod?.toBlobURL) {
      return { ok: false, stage: 'import', error: importError || 'Failed to import ffmpeg modules' };
    }

    const ffmpeg = new ffmpegMod.FFmpeg();
    let loadError = null;
    for (const base of FFMPEG_CORE_BASE_URLS) {
      try {
        const coreURL = await utilMod.toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await utilMod.toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
        const workerURL = await utilMod.toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript');
        await ffmpeg.load({ coreURL, wasmURL, workerURL });
        loadError = null;
        break;
      } catch (err) {
        loadError = String(err?.message || err);
      }
    }

    if (loadError) {
      return { ok: false, stage: 'load', error: loadError };
    }

    try {
      const rc = await ffmpeg.exec(['-version']);
      return { ok: Number(rc) === 0, stage: 'exec', rc: Number(rc) };
    } catch (err) {
      return { ok: false, stage: 'exec', error: String(err?.message || err) };
    }
  });

  console.log(JSON.stringify(result));
  await browser.close();
})();
