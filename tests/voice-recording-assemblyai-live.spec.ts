import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { clickMemoDoc, getMemoDocItem, getMemoEditorHtml, waitForMemoReady } from "./helpers/memo-ui";
import { attachPageDebugLogging, createStepLogger } from "./helpers/test-debug";

const BASE_URL = "http://127.0.0.1:5000";
const TEST_TIMEOUT = 240_000;
const SAMPLE_WAV_PATH = path.resolve("tests/fixtures/sample.wav");
const SAMPLE_WAV_BASE64 = fs.readFileSync(SAMPLE_WAV_PATH).toString("base64");

async function installLiveAudioHarness(page: import("@playwright/test").Page) {
  await page.addInitScript(({ sampleWavBase64 }) => {
    const g = window as typeof window & {
      __pwAssemblyLive?: {
        startSamplePlayback?: () => Promise<boolean>;
      };
    };

    const sampleBytes = Uint8Array.from(atob(sampleWavBase64), char => char.charCodeAt(0));

    function cloneArrayBuffer(buffer: ArrayBuffer) {
      return buffer.slice(0);
    }

    async function decodeSample(context: AudioContext) {
      return context.decodeAudioData(cloneArrayBuffer(sampleBytes.buffer));
    }

    async function createLoopingAudioTrack() {
      const context = new AudioContext();
      const decoded = await decodeSample(context);
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.loop = true;
      const gain = context.createGain();
      gain.gain.value = 0.9;
      const destination = context.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(destination);
      source.start(0);
      const [track] = destination.stream.getAudioTracks();
      if (!track) {
        await context.close().catch(() => {});
        throw new Error("Sample audio track unavailable");
      }
      const stop = track.stop.bind(track);
      track.stop = () => {
        try { source.stop(0); } catch {}
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
        context.close().catch(() => {});
        stop();
      };
      return track;
    }

    function createCanvasVideoStream(label: string) {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(`Canvas context unavailable for ${label}`);
      let frame = 0;
      const draw = () => {
        frame += 1;
        ctx.fillStyle = "#06111a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(56, 56, canvas.width - 112, 110);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 40px sans-serif";
        ctx.fillText(label, 84, 124);
        ctx.font = "26px sans-serif";
        ctx.fillText(`frame ${frame}`, 84, 198);
        requestAnimationFrame(draw);
      };
      draw();
      return canvas.captureStream(12);
    }

    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        ...navigator.mediaDevices,
        async getUserMedia(constraints?: MediaStreamConstraints) {
          if (constraints?.video && !constraints.audio) {
            return new MediaStream(createCanvasVideoStream("AssemblyAI Webcam").getVideoTracks());
          }
          if (constraints?.audio) {
            return new MediaStream([await createLoopingAudioTrack()]);
          }
          return originalGetUserMedia
            ? originalGetUserMedia(constraints)
            : Promise.reject(new Error("getUserMedia unavailable"));
        },
        async getDisplayMedia() {
          const videoStream = createCanvasVideoStream("AssemblyAI Screen Share");
          const audioTrack = await createLoopingAudioTrack();
          return new MediaStream([
            ...videoStream.getVideoTracks(),
            audioTrack,
          ]);
        },
      },
    });

    async function startSamplePlayback() {
      const context = new AudioContext();
      const decoded = await decodeSample(context);
      const source = context.createBufferSource();
      source.buffer = decoded;
      const gain = context.createGain();
      gain.gain.value = 0.9;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(0);
      source.addEventListener("ended", () => {
        context.close().catch(() => {});
      }, { once: true });
      return true;
    }

    g.__pwAssemblyLive = { startSamplePlayback };
  }, { sampleWavBase64: SAMPLE_WAV_BASE64 });
}

async function createPrivatePage(page: import("@playwright/test").Page, logStep: ReturnType<typeof createStepLogger>) {
  const previousActiveDocumentId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
  const addPageButton = page.locator(
    "#documentExplorer .document-explorer__section-header[data-section='private'] .document-explorer__item-action[title='Créer une page racine'], #documentExplorer .document-explorer__section-header[data-section='private'] .document-explorer__item-action[title='Ajouter une page']",
  ).first();
  await expect(addPageButton).toBeVisible({ timeout: 20_000 });
  await addPageButton.click();
  await page.waitForFunction(previousId => {
    const nextId = String((window as any).GoToolkitMemoGetActiveDocumentId?.() || "");
    return Boolean(nextId && nextId !== String(previousId || ""));
  }, previousActiveDocumentId, { timeout: 20_000 });
  const docId = await page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
  expect(docId).not.toBe("");
  logStep("private-page-created", { docId });
  return docId;
}

test.describe("Voice recording AssemblyAI live", () => {
  test.skip(process.env.PW_ENABLE_LIVE_ASSEMBLYAI !== "1", "Set PW_ENABLE_LIVE_ASSEMBLYAI=1 to run the real AssemblyAI integration test.");

  test("records with real AssemblyAI transcription across a page switch using sample.wav", async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    const logStep = createStepLogger("voice-recording-assemblyai-live");

    await installLiveAudioHarness(page);
    attachPageDebugLogging(page, "voice-recording-assemblyai-live", {
      urlPattern: /assemblyai|voice|recording|\/v1\/shares\/|\/v1\/spaces\//i,
    });

    logStep("goto:start");
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await page.evaluate(() => {
      localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1");
    });
    await waitForMemoReady(page, 60_000);
    logStep("memo-ready");

    const originDocId = await createPrivatePage(page, logStep);
    await clickMemoDoc(page, originDocId, { allowProgrammaticOpen: false });
    await expect(getMemoDocItem(page, originDocId)).toBeVisible({ timeout: 15_000 });
    logStep("origin-page-open", { docId: originDocId });

    const secondDocId = await createPrivatePage(page, logStep);
    await clickMemoDoc(page, secondDocId, { allowProgrammaticOpen: false });
    await expect(getMemoDocItem(page, secondDocId)).toBeVisible({ timeout: 15_000 });
    logStep("second-page-open", { docId: secondDocId });

    await clickMemoDoc(page, originDocId, { allowProgrammaticOpen: false });
    await expect(getMemoDocItem(page, originDocId)).toBeVisible({ timeout: 15_000 });
    logStep("origin-page-restored", { docId: originDocId, secondDocId });

    const voiceButton = page.locator("button.go-toolkit-voice-button").first();
    await expect(voiceButton).toBeVisible({ timeout: 20_000 });
    await voiceButton.click();

    const overlay = page.locator(".voice-overlay.visible");
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await overlay.locator('.voice-overlay__transcription-option[data-transcription-mode="live"]').click();
    await expect(overlay.locator('.voice-overlay__tile[data-kind="mic"]')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(overlay.locator('.voice-overlay__tile[data-kind="screen"]')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(overlay.locator('.voice-overlay__tile[data-kind="system-audio"]')).toHaveClass(/active/, { timeout: 10_000 });
    logStep("voice-overlay-configured");

    await overlay.locator(".voice-overlay__ready").click();
    const samplePlaybackStarted = await page.evaluate(async () => {
      return Boolean(await (window as any).__pwAssemblyLive?.startSamplePlayback?.());
    });
    logStep("sample-playback-started", { samplePlaybackStarted });
    await expect(voiceButton).toHaveClass(/is-recording/, { timeout: 15_000 });
    logStep("recording-started");

    const initialEditorHtml = await getMemoEditorHtml(page);
    await page.waitForTimeout(4_000);
    const livePreviewText = await page.evaluate(() => {
      const line1 = document.querySelector('.voice-overlay__transcription-line[data-line="1"]')?.textContent || "";
      const line2 = document.querySelector('.voice-overlay__transcription-line[data-line="2"]')?.textContent || "";
      return `${line1} ${line2}`.trim();
    });
    const liveHtml = await getMemoEditorHtml(page);
    logStep("live-transcript-detected", {
      previewLength: livePreviewText.length,
      initialLength: initialEditorHtml.length,
      liveLength: liveHtml.length,
    });

    logStep("switching-to-second-page", { fromDocId: originDocId, toDocId: secondDocId });
    await clickMemoDoc(page, secondDocId, { allowProgrammaticOpen: false, timeout: 30_000 });
    await expect.poll(async () => {
      return page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
    }, { timeout: 30_000 }).toBe(secondDocId);
    const secondPageHtmlBeforeStop = await getMemoEditorHtml(page);
    logStep("second-page-active-during-recording", {
      docId: secondDocId,
      editorLength: secondPageHtmlBeforeStop.length,
    });

    await page.waitForTimeout(4_000);
    await voiceButton.click();
    await expect.poll(async () => {
      return page.evaluate(() => String((window as any).GoToolkitMemoGetActiveDocumentId?.() || ""));
    }, { timeout: 30_000 }).toBe(originDocId);
    logStep("recording-stopped-from-second-page", {
      stoppedFromDocId: secondDocId,
      returnedToDocId: originDocId,
    });

    await expect.poll(async () => {
      return getMemoEditorHtml(page);
    }, { timeout: 120_000 }).not.toBe(initialEditorHtml);
    const originHtmlAfterStop = await getMemoEditorHtml(page);
    expect(String(originHtmlAfterStop || "").length).toBeGreaterThan(initialEditorHtml.length);
    expect(String(originHtmlAfterStop || "")).not.toBe(secondPageHtmlBeforeStop);
    logStep("origin-transcript-restored-after-stop", {
      originLength: originHtmlAfterStop.length,
      secondPageLength: secondPageHtmlBeforeStop.length,
    });

    await expect.poll(async () => {
      return voiceButton.locator(".chat-header-badge").isVisible().catch(() => false);
    }, { timeout: 120_000 }).toBe(true);
    logStep("recording-badge-visible-on-origin-page");

    await voiceButton.click();
    const videoModal = page.locator(".voice-video-player-modal.voice-video-player-modal--open");
    await expect(videoModal).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => {
      return videoModal.locator(".voice-video-player-transcript-item").count();
    }, { timeout: 120_000 }).toBeGreaterThan(0);
    const transcriptEntries = await videoModal.locator(".voice-video-player-transcript-item__content").allTextContents();
    expect(transcriptEntries.join(" ").trim().length).toBeGreaterThan(0);
    logStep("video-modal-open", {
      transcriptItems: transcriptEntries.length,
      transcriptPreview: transcriptEntries.join(" ").slice(0, 120),
    });

    const playbackCheck = await page.evaluate(async () => {
      const video = document.querySelector(".voice-video-player-modal--open video") as HTMLVideoElement | null;
      if (!video) return { exists: false, currentTime: 0, paused: true, readyState: 0 };
      if (video.paused) {
        await video.play().catch(() => {});
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      return {
        exists: true,
        currentTime: Number(video.currentTime || 0),
        paused: Boolean(video.paused),
        readyState: Number(video.readyState || 0),
      };
    });
    expect(playbackCheck.exists).toBe(true);
    expect(playbackCheck.readyState).toBeGreaterThan(1);
    expect(playbackCheck.currentTime).toBeGreaterThan(0.2);
    logStep("video-playback-verified", playbackCheck);
  });
});
