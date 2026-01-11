import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Assist audio import (AssemblyAI)", () => {
  test("imports two mp3 files and records transcription timing", async ({ page }) => {
    test.setTimeout(240_000);
    const baseUrl = "http://127.0.0.1:5000";
    const dataDir = path.resolve(process.cwd(), "test-data");
    const filePaths = [
      path.join(dataDir, "audio_one.mp3"),
      path.join(dataDir, "audio_two.mp3"),
    ];

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    await page.waitForFunction(
      () => Boolean((window as any).GoToolkitAssistInstance),
      null,
      { timeout: 30_000 }
    );

    await page.evaluate(() => {
      const assist = (window as any).GoToolkitAssistInstance;
      if (assist?.open && !assist.isOpen) {
        assist.open();
      }
      const api = (window as any).GoToolkitVoiceTranscript;
      if (api && !api.__metricsWrapped) {
        api.__metricsWrapped = true;
        (window as any).__mediaMetrics = {
          uploads: [],
          transcriptRequests: [],
          polls: [],
        };
        const metrics = (window as any).__mediaMetrics;
        const origUpload = api.uploadAudioToAssembly;
        api.uploadAudioToAssembly = async function (file: File, key: string) {
          const start = performance.now();
          const result = await origUpload.call(this, file, key);
          const end = performance.now();
          metrics.uploads.push({ name: file?.name || "", ms: end - start });
          return result;
        };
        const origRequest = api.requestAssemblyTranscript;
        api.requestAssemblyTranscript = async function (payload: any, key: string) {
          const start = performance.now();
          const result = await origRequest.call(this, payload, key);
          const end = performance.now();
          metrics.transcriptRequests.push({ id: result || "", ms: end - start });
          return result;
        };
        const origPoll = api.pollAssemblyTranscript;
        api.pollAssemblyTranscript = async function (id: string, key: string) {
          const start = performance.now();
          const result = await origPoll.call(this, id, key);
          const end = performance.now();
          metrics.polls.push({
            id,
            ms: end - start,
            durationSeconds:
              (result && (result.audio_duration || result.audio_duration_seconds || result.duration)) || 0,
          });
          return result;
        };
      }
    });

    await page.waitForSelector("#chatAttachFilesBtn", { timeout: 30_000 });
    await page.click("#chatAttachFilesBtn");

    const inputHandle = await page.waitForFunction(
      () => {
        const input = (window as any).GoToolkitAssistInstance?.documentsFileInput;
        return input instanceof HTMLInputElement ? input : null;
      },
      null,
      { timeout: 10_000 }
    );
    const inputElement = inputHandle.asElement();
    if (!inputElement) {
      throw new Error("documentsFileInput not available");
    }
    await inputElement.setInputFiles(filePaths);

    await page.evaluate(() => {
      (window as any).__mediaTotalDuration = 0;
    });

    await page.waitForFunction(
      () => {
        const assist = (window as any).GoToolkitAssistInstance;
        return assist?.mediaTranscribedCount >= 2;
      },
      null,
      { timeout: 180_000 }
    );

    await page.waitForFunction(
      () => {
        const assist = (window as any).GoToolkitAssistInstance;
        return Boolean(assist?.attachmentsIngestionEnd);
      },
      null,
      { timeout: 180_000 }
    );

    const metrics = await page.evaluate(() => {
      const mediaMetrics = (window as any).__mediaMetrics || {};
      const polls = Array.isArray(mediaMetrics.polls) ? mediaMetrics.polls : [];
      const totalDuration = polls.reduce((acc: number, entry: any) => {
        const value = Number(entry?.durationSeconds) || 0;
        return acc + value;
      }, 0);
      return {
        totalDuration,
        metrics: mediaMetrics,
      };
    });

    console.log("AssemblyAI total duration (s):", metrics.totalDuration);
    console.log("AssemblyAI metrics:", metrics.metrics);

    expect(metrics.metrics?.polls?.length || 0).toBeGreaterThan(0);
  });
});
