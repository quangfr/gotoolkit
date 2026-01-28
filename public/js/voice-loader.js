(function () {
    "use strict";

    const VOICE_STACK = [
        "js/voice-transcript.js",
        "js/voice-audio-player.js",
        "js/voice-video-player.js",
        "js/voice.js"
    ];

    const currentScript = document.currentScript;
    const version = currentScript
        ? new URL(currentScript.src, document.baseURI).searchParams.get("v")
        : "";
    let loadPromise = null;
    let autoLoadTimer = null;
    let autoLoadAttempts = 0;
    const MAX_AUTOLOAD_ATTEMPTS = 120;
    const AUTOLOAD_INTERVAL = 500;

    function buildScriptUrl(path) {
        if (!version) return path;
        const url = new URL(path, document.baseURI);
        url.searchParams.set("v", version);
        return url.toString();
    }

    function loadScript(path) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = buildScriptUrl(path);
            script.async = false;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Voice loader failed for ${path}`));
            document.head.appendChild(script);
        });
    }

    function loadVoiceStack() {
        if (window.GoToolkitVoice) return Promise.resolve();
        if (!loadPromise) {
            loadPromise = VOICE_STACK.reduce(
                (promise, path) => promise.then(() => loadScript(path)),
                Promise.resolve()
            );
        }
        return loadPromise;
    }

    function ensureVoiceButton() {
        const launcher = document.querySelector(".feedback-app-launcher-row");
        if (!launcher) return null;
        let button = launcher.querySelector(".go-toolkit-voice-button");
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "feedback-app-button btn btn-secondary app-header-btn go-toolkit-voice-button";
            button.title = "Enregistrer une conversation";
            button.textContent = "◉";
            button.dataset.voiceLoader = "true";
            launcher.appendChild(button);
        }
        if (!button.dataset.voiceLoaderBound) {
            button.dataset.voiceLoaderBound = "true";
            button.addEventListener("click", handleVoiceClick);
        }
        return button;
    }

    function getActiveMemo() {
        return window.GoToolkitMemoVoice?.getActiveMemo?.() || null;
    }

    function getRecordingIdForMemo(memoId) {
        if (!memoId) return null;
        const getter = window.GoToolkitMemoVoice?.getVoiceRecordingId;
        return typeof getter === "function" ? getter(memoId) : null;
    }

    function shouldAutoLoadVoice() {
        if (window.GoToolkitVoice) return false;
        const activeMemo = getActiveMemo();
        if (!activeMemo?.id) return false;
        return Boolean(getRecordingIdForMemo(activeMemo.id));
    }

    function stopAutoLoadTimer() {
        if (!autoLoadTimer) return;
        clearInterval(autoLoadTimer);
        autoLoadTimer = null;
    }

    async function tryAutoLoadVoice() {
        if (!shouldAutoLoadVoice()) return false;
        try {
            await loadVoiceStack();
            const activeMemo = getActiveMemo();
            if (activeMemo?.id && window.GoToolkitVoice?.setCurrentMemo) {
                window.GoToolkitVoice.setCurrentMemo(activeMemo.title || "", activeMemo.id);
            }
            return true;
        } catch (err) {
            console.error("Voice auto-load error", err);
            return false;
        }
    }

    function scheduleAutoLoadCheck() {
        if (autoLoadTimer || window.GoToolkitVoice) return;
        autoLoadAttempts = 0;
        autoLoadTimer = setInterval(async () => {
            autoLoadAttempts += 1;
            const loaded = await tryAutoLoadVoice();
            if (loaded || autoLoadAttempts >= MAX_AUTOLOAD_ATTEMPTS) {
                stopAutoLoadTimer();
            }
        }, AUTOLOAD_INTERVAL);
    }

    async function handleVoiceClick(event) {
        const button = event.currentTarget;
        if (window.GoToolkitVoice) {
            button?.removeEventListener("click", handleVoiceClick);
            if (button) delete button.dataset.voiceLoaderBound;
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (button) button.disabled = true;
        try {
            await loadVoiceStack();
        } catch (err) {
            console.error("Voice loader error", err);
        } finally {
            if (button) button.disabled = false;
        }
        if (!window.GoToolkitVoice || !button) return;
        button.removeEventListener("click", handleVoiceClick);
        delete button.dataset.voiceLoaderBound;
        requestAnimationFrame(() => button.click());
    }

    function init() {
        ensureVoiceButton();
        tryAutoLoadVoice().then(loaded => {
            if (!loaded) scheduleAutoLoadCheck();
        });
        const observer = new MutationObserver(() => ensureVoiceButton());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
