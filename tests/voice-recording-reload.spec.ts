import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Memo voice recording reload", () => {
  test("loads a webm recording and shows play button on reload", async ({ page }) => {
    test.setTimeout(90_000);
    const baseUrl = "http://127.0.0.1:5000";
    const dataDir = path.resolve(process.cwd(), "test-data");
    const webmPath = path.join(dataDir, "sample.webm");
    const webmBase64 = fs.readFileSync(webmPath).toString("base64");

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));

    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });

    const memoId = await page.waitForFunction(() => {
      const memo = (window as any).GoToolkitMemoVoice?.getActiveMemo?.();
      return memo?.id || null;
    });

    const memoIdValue = await memoId.jsonValue();

    await page.evaluate(
      async ({ memoId, base64 }) => {
        const activeMemo = (window as any).GoToolkitMemoVoice?.getActiveMemo?.();
        const memoName = activeMemo?.title || "";
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const videoBlob = new Blob([bytes], { type: "video/webm" });
        const recordId = (crypto as any)?.randomUUID?.() || `voice-${Date.now()}`;
        const now = Date.now();
        const recording = {
          id: recordId,
          type: "voice-recording",
          audioBlob: null,
          videoBlob,
          audioTranscript: "",
          audioTranscriptSentences: [],
          videoTranscript: "",
          videoTranscriptSentences: [],
          duration: 1,
          recordingDate: now,
          assemblyTranscriptId: null,
          participants: [],
          subjects: [],
          createdAt: now,
          updatedAt: now
        };

        const store = (window as any).goToolkitDocStore?.createStore?.("voice-recordings");
        if (!store) {
          throw new Error("voice-recordings store unavailable");
        }
        await store.set(recordId, recording);
        const memoVoice = (window as any).GoToolkitMemoVoice;
        if (!memoVoice?.setVoiceRecordingId) {
          throw new Error("GoToolkitMemoVoice not available");
        }
        memoVoice.setVoiceRecordingId(memoId, recordId);
      },
      { memoId: memoIdValue, base64: webmBase64 }
    );

    await page.reload({ waitUntil: "load" });

    await page.waitForFunction(() => Boolean((window as any).GoToolkitVoice), null, { timeout: 60_000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector(".go-toolkit-voice-button") as HTMLElement | null;
      const html = btn?.innerHTML || "";
      const text = btn?.textContent || "";
      return Boolean(btn && (html.includes("▶") || text.includes("▶")));
    }, null, { timeout: 60_000 });

    await page.click(".go-toolkit-voice-button");
    await page.waitForSelector(".voice-video-player-modal--open", { timeout: 15_000 });

    await expect(page.locator(".voice-video-player-modal--open")).toBeVisible();
  });
});
