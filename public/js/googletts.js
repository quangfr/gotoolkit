;(function (global) {
  const DEFAULT_API_URL = "https://googletts.gotoolkit.workers.dev";
  const DEFAULT_TIMEOUT_MS = 45000;

  function resolveApiBaseUrl() {
    const explicit = (global.GO_TOOLKIT_GOOGLE_TTS_API_URL || "").trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    const fromConfig = global.GoToolkitSiteConfig?.get?.("hub.googleTtsApiUrl", "");
    if (typeof fromConfig === "string" && fromConfig.trim()) {
      return fromConfig.trim().replace(/\/+$/, "");
    }
    return DEFAULT_API_URL;
  }

  function detectLanguage(text) {
    const content = String(text || "").trim();
    if (!content) return "fr-FR";

    const hasFrenchChars = /[àâäçéèêëîïôöùûüÿœæ]/i.test(content);
    const frHints = /\b(le|la|les|des|une|un|et|est|pour|avec|dans|que|qui|sur|pas|vous|nous)\b/i.test(content);
    const enHints = /\b(the|and|is|are|with|for|from|this|that|you|we|not|have|has|will)\b/i.test(content);

    if (hasFrenchChars || frHints) return "fr-FR";
    if (enHints) return "en-US";
    return "fr-FR";
  }

  function b64ToBlob(base64, contentType) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType || "audio/mpeg" });
  }

  async function synthesize(text, options) {
    const inputText = String(text || "").trim();
    if (!inputText) return { ok: false, reason: "EMPTY_TEXT" };

    const opts = options || {};
    const abortController = opts.abortController || new AbortController();
    const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    const languageCode = (opts.languageCode || detectLanguage(inputText) || "fr-FR").trim();
    const body = {
      text: inputText,
      languageCode
    };

    try {
      const response = await fetch(resolveApiBaseUrl() + "/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: abortController.signal
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          reason: payload?.error?.code || "HTTP_ERROR",
          status: response.status,
          payload
        };
      }

      const audioContent = payload?.audioContent || "";
      if (!audioContent) {
        return { ok: false, reason: "NO_AUDIO_CONTENT", payload };
      }

      const audioBlob = b64ToBlob(
        audioContent,
        payload?.audioConfig?.audioEncoding === "MP3" ? "audio/mpeg" : "audio/wav"
      );
      return { ok: true, payload, audioBlob };
    } catch (error) {
      return { ok: false, reason: "NETWORK_OR_ABORT", error };
    } finally {
      clearTimeout(timeout);
    }
  }

  function createController() {
    let activeAudio = null;
    let activeUrl = "";
    let activeAbort = null;
    let speaking = false;

    function stop() {
      if (activeAbort) {
        activeAbort.abort();
        activeAbort = null;
      }
      if (activeAudio) {
        try {
          activeAudio.pause();
          activeAudio.currentTime = 0;
        } catch (err) {
          // ignore
        }
      }
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
      activeAudio = null;
      activeUrl = "";
      speaking = false;
    }

    async function speak(text, options) {
      const inputText = String(text || "").trim();
      if (!inputText) return { ok: false, reason: "EMPTY_TEXT" };

      const opts = options || {};
      stop();
      activeAbort = new AbortController();
      const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
      const timeout = setTimeout(() => activeAbort?.abort(), timeoutMs);

      try {
        const result = await synthesize(inputText, {
          ...opts,
          abortController: activeAbort,
          timeoutMs
        });
        if (!result?.ok || !result?.audioBlob) return result;
        const payload = result.payload || {};
        const audioBlob = result.audioBlob;
        activeUrl = URL.createObjectURL(audioBlob);
        activeAudio = new Audio(activeUrl);
        activeAudio.preload = "auto";

        speaking = true;
        if (typeof opts.onStart === "function") opts.onStart(payload);

        activeAudio.onended = () => {
          speaking = false;
          if (activeUrl) URL.revokeObjectURL(activeUrl);
          activeUrl = "";
          activeAudio = null;
          if (typeof opts.onEnd === "function") opts.onEnd();
        };

        activeAudio.onerror = () => {
          speaking = false;
          if (activeUrl) URL.revokeObjectURL(activeUrl);
          activeUrl = "";
          activeAudio = null;
          if (typeof opts.onError === "function") opts.onError(new Error("AUDIO_PLAYBACK_FAILED"));
        };

        await activeAudio.play();
        return { ok: true, payload };
      } catch (error) {
        return { ok: false, reason: "NETWORK_OR_ABORT", error };
      } finally {
        clearTimeout(timeout);
        activeAbort = null;
      }
    }

    return {
      detectLanguage,
      synthesize,
      speak,
      stop,
      isSpeaking: () => speaking
    };
  }

  global.GoToolkitGoogleTTS = {
    detectLanguage,
    synthesize,
    createController
  };
})(window);
