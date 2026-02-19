(function () {
    "use strict";

    const STORAGE_KEY = "go-toolkit-assemblyai-key";
    const ASSEMBLY_PROXY_TOKEN_URL = (window.GO_TOOLKIT_ASSEMBLYAI_TOKEN_URL || "https://assemblyai.gotoolkit.workers.dev/token").replace(/\/$/, "");
    const ASSEMBLY_PROXY_BASE_URL = ASSEMBLY_PROXY_TOKEN_URL.replace(/\/token\/?$/i, "").replace(/\/$/, "") || ASSEMBLY_PROXY_TOKEN_URL;
    const RECORDINGS_STORE = window.goToolkitDocStore?.createStore
        ? window.goToolkitDocStore.createStore("voice-recordings")
        : null;
    const CLICK_HIGHLIGHT_DURATION_MS = 420;
    const CLICK_HIGHLIGHT_RADIUS_PX = 26;
    const CLICK_HIGHLIGHT_Y_OFFSET_PX = 6;

    const state = {
        currentMemoId: null,
        currentMemoName: "",
        recordingMemoId: null,
        recordingDocumentId: null,
        recordingMemoName: "",
        currentMemoRecordingId: null,
        currentMemoRecordingHasVideo: false,
        currentRecordingId: null,
        currentRecordingHasVideo: false,
        isRecording: false,
        recordingStartTime: 0,
        timerId: null,
        audioRecorder: null,
        videoRecorder: null,
        audioChunks: [],
        videoChunks: [],
        audioBlob: null,
        videoBlob: null,
        isTranscribing: false,
        transcriptionCountdown: 0,
        transcriptionCountdownTimer: null,
        overlay: null,
        overlayReady: null,
        overlayTiles: null,
        overlayMic: true,
        overlayWebcam: false,
        overlayScreen: false,
        overlaySystemAudio: false,
        overlayStreams: {
            audio: null,
            webcam: null,
            screen: null,
            systemAudio: null
        },
        audioContext: null,
        audioMixStream: null,
        meterContext: null,
        meterRafId: null,
        micAnalyser: null,
        systemAnalyser: null,
        micAnalyserStream: null,
        systemAnalyserStream: null,
        liveSocket: null,
        liveAudioContext: null,
        liveAudioSource: null,
        liveProcessor: null,
        liveMuteGain: null,
        liveInsertedByTurn: {},
        liveInsertedOnce: false,
        liveLastInsertedChar: "",
        hadLiveTranscriptInSession: false,
        micWavePhase: 0,
        systemWavePhase: 0,
        meterLastTs: 0,
        videoCompositorCanvas: null,
        videoCompositorRafId: null,
        videoCompositorStream: null,
        videoCompositorSourceVideo: null,
        clickHighlights: [],
        clickPointerHandler: null,
        permissionsGranted: {
            audio: false,
            webcam: false,
            screen: false,
            systemAudio: false
        },
        toast: null,
        voiceButton: null,
        audioModal: null,
        videoModal: null,
        conversionRunning: false,
        sessionInitialized: false
    };

    const voiceConfigState = {
        disableCamera: false
    };

    function isCameraAllowed() {
        return !voiceConfigState.disableCamera;
    }

    function ensureStyles() {
        if (document.getElementById("go-toolkit-voice-styles")) return;
        const style = document.createElement("style");
        style.id = "go-toolkit-voice-styles";
        style.textContent = `
            .feedback-app-launcher-row {
                gap: 4px;
            }
            .go-toolkit-voice-button.is-recording {
                border-color: var(--intent-error-border);
                animation: go-toolkit-voice-pulse 2.4s ease-in-out infinite;
            }
            @keyframes go-toolkit-voice-pulse {
                0% { box-shadow: 0 0 0 0 rgba(180, 35, 24, 0.25); }
                70% { box-shadow: 0 0 0 10px rgba(180, 35, 24, 0); }
                100% { box-shadow: 0 0 0 0 rgba(180, 35, 24, 0); }
            }
            .voice-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.78);
                color: var(--white);
                z-index: 11000;
                display: none;
                flex-direction: column;
                justify-content: space-between;
                padding: 32px;
                box-sizing: border-box;
                font-family: "Inter", system-ui, sans-serif;
            }
            .voice-overlay.visible {
                display: flex;
            }
            .voice-overlay__ready {
                font-size: 78px;
                font-weight: 800;
                text-align: center;
                cursor: pointer;
                user-select: none;
                line-height: 1;
                margin: 100px auto 0;
                transition: transform 0.2s ease, color 0.2s ease;
            }
            .voice-overlay__ready:hover {
                transform: scale(1.04);
                color: var(--intent-warning-border);
            }
            .voice-overlay__tiles {
                display: flex;
                gap: 18px;
                justify-content: center;
                align-items: flex-end;
                width: 100%;
                height: 66vh;
                pointer-events: none;
                position: relative;
                z-index: 2;
                align-self: flex-end;
            }
            .voice-overlay__tile {
                width: 300px;
                height: 300px;
                border-radius: 16px;
                border: 2px solid rgba(255, 255, 255, 0.4);
                background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.5));
                position: relative;
                overflow: hidden;
                box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5), 0 0 0 6px rgba(255, 255, 255, 0.05);
                pointer-events: auto;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--white);
                font-size: 20px;
                font-weight: 700;
                text-align: center;
            }
            .voice-overlay__tile video,
            .voice-overlay__tile canvas {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                z-index: 0;
            }
            .voice-overlay__tile-label {
                position: relative;
                z-index: 3;
                padding: 8px 10px;
                backdrop-filter: blur(4px);
                background: rgba(0, 0, 0, 0.35);
                border-radius: 10px;
                font-size: 18px;
            }
            .voice-overlay__tile-meter {
                position: absolute;
                left: 18px;
                right: 18px;
                top: 50%;
                transform: translateY(-50%);
                height: 200px;
                border-radius: 0;
                background: transparent;
                overflow: hidden;
                z-index: 1;
            }
            .voice-overlay__tile-meter-canvas {
                width: 100%;
                height: 100%;
                display: block;
            }
            .voice-overlay__tile-label:empty {
                display: none;
            }
            .voice-overlay__tile--active {
                border-color: var(--intent-warning-border);
                box-shadow: 0 18px 50px rgba(0, 0, 0, 0.65), 0 0 0 6px rgba(250, 204, 21, 0.18);
            }
            .voice-overlay__caption {
                text-align: center;
                font-size: 14px;
                opacity: 0.85;
                margin-bottom: -8px;
            }
            .voice-overlay__close {
                position: absolute;
                top: 32px;
                right: 32px;
                background: none;
                border: none;
                color: var(--white);
                font-size: 28px;
                cursor: pointer;
                padding: 8px;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s ease, transform 0.2s ease;
                z-index: 10;
            }
            .voice-overlay__close:hover {
                color: var(--intent-warning-border);
                transform: scale(1.1);
            }
            .go-toolkit-voice-toast {
                position: fixed;
                right: 16px;
                bottom: 16px;
                background: var(--bg-surface);
                color: var(--text-main);
                padding: 8px 12px;
                border-radius: 10px;
                font-size: 12px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
                z-index: 20000;
                border: 1px solid var(--border-strong);
            }
            .go-toolkit-voice-toast.visible {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    function showToast(message, isError) {
        if (!state.toast) {
            state.toast = document.createElement("div");
            state.toast.className = "go-toolkit-voice-toast";
            document.body.appendChild(state.toast);
        }
        state.toast.textContent = message;
        state.toast.style.background = "var(--bg-surface)";
        state.toast.classList.add("visible");
        clearTimeout(state.toast._timer);
        state.toast._timer = setTimeout(() => state.toast.classList.remove("visible"), 2400);
    }

    function showTranscriptionToast(durationSeconds, remainingSeconds) {
        const durationMs = Math.max(1000, Math.round((remainingSeconds || 0) * 1000));
        window.GoToolkitAIRequestToaster?.startIcon?.(
            "aiRequestCounterToasterTranscription",
            "cassette-tape",
            "",
            durationMs
        );
    }

    function hideTranscriptionToast() {
        window.GoToolkitAIRequestToaster?.stop?.("aiRequestCounterToasterTranscription");
    }

    function formatDuration(seconds) {
        const total = Math.max(0, Math.floor(seconds || 0));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        if (hours > 0) {
            return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        }
        return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    function parseVttTimestamp(value = "") {
        const normalized = String(value || "").trim().replace(/,/g, ".").replace(/\s+/g, "");
        if (!normalized) return NaN;
        const parts = normalized.split(":");
        let hours = 0;
        let minutes = 0;
        let seconds = 0;
        let millis = 0;
        if (parts.length === 3) {
            hours = Number(parts[0]);
            minutes = Number(parts[1]);
            const [secondsPart, fraction = ""] = parts[2].split(".");
            seconds = Number(secondsPart);
            millis = Number((fraction + "000").slice(0, 3));
        } else if (parts.length === 2) {
            minutes = Number(parts[0]);
            const [secondsPart, fraction = ""] = parts[1].split(".");
            seconds = Number(secondsPart);
            millis = Number((fraction + "000").slice(0, 3));
        } else {
            return NaN;
        }
        if ([hours, minutes, seconds, millis].some(num => Number.isNaN(num))) {
            return NaN;
        }
        return hours * 3600 + minutes * 60 + seconds + millis / 1000;
    }

    function parseVttTranscript(text) {
        const raw = String(text || "").trim();
        if (!raw) return [];
        const lines = raw.split(/\r?\n/);
        const blocks = [];
        let current = [];
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "---") {
                if (current.length) {
                    blocks.push(current);
                    current = [];
                }
                return;
            }
            if (trimmed.toUpperCase().startsWith("WEBVTT") || trimmed.toUpperCase().startsWith("NOTE")) {
                return;
            }
            current.push(trimmed);
        });
        if (current.length) {
            blocks.push(current);
        }
        return blocks.map((block, index) => {
            const timingIndex = block.findIndex(line => line.includes("-->"));
            if (timingIndex === -1) return null;
            const timing = block[timingIndex];
            const [startPart, endPart] = timing.split("-->").map(part => part.trim());
            const start = parseVttTimestamp(startPart);
            const end = parseVttTimestamp(endPart);
            if (!Number.isFinite(start)) return null;
            const safeEnd = Number.isFinite(end) && end > start ? end : start + 2;
            const contentLines = block.slice(timingIndex + 1);
            const textContent = contentLines.join("\n").trim();
            const id = timingIndex > 0 ? block[0] : `sentence-${index}`;
            return {
                id,
                text: textContent,
                start,
                end: safeEnd
            };
        }).filter(Boolean);
    }

    function getTranscriptText(sentences) {
        if (!Array.isArray(sentences)) return "";
        return sentences.map(sentence => (sentence.text || "").trim()).filter(Boolean).join(" ").trim();
    }

    function getAssemblyApiKey() {
        try {
            const stored = (localStorage.getItem(STORAGE_KEY) || "").trim();
            if (stored) return stored;
        } catch (err) { /* noop */ }
        return (window.GoToolkitAssemblyAiKey || "").trim();
    }

    function getAssemblyProxyUrl(path = "") {
        if (!ASSEMBLY_PROXY_BASE_URL) return "";
        const normalized = (path || "").replace(/^\/+/, "");
        if (!normalized) return ASSEMBLY_PROXY_BASE_URL;
        return `${ASSEMBLY_PROXY_BASE_URL}/${normalized}`;
    }

    function downsampleTo16k(input, inputSampleRate) {
        if (!input || !input.length) return new Int16Array(0);
        const targetSampleRate = 16000;
        if (!inputSampleRate || inputSampleRate <= 0) {
            const out = new Int16Array(input.length);
            for (let i = 0; i < input.length; i += 1) {
                const s = Math.max(-1, Math.min(1, input[i]));
                out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            return out;
        }
        if (inputSampleRate === targetSampleRate) {
            const out = new Int16Array(input.length);
            for (let i = 0; i < input.length; i += 1) {
                const s = Math.max(-1, Math.min(1, input[i]));
                out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            return out;
        }
        const ratio = inputSampleRate / targetSampleRate;
        const length = Math.max(1, Math.floor(input.length / ratio));
        const output = new Int16Array(length);
        let offsetResult = 0;
        let offsetBuffer = 0;
        while (offsetResult < output.length) {
            const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
            let accum = 0;
            let count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer; i += 1) {
                accum += input[i];
                count += 1;
            }
            const sample = count > 0 ? accum / count : 0;
            const clipped = Math.max(-1, Math.min(1, sample));
            output[offsetResult] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
            offsetResult += 1;
            offsetBuffer = nextOffsetBuffer;
        }
        return output;
    }

    function getLiveInsertPrefix(nextChunk) {
        if (!state.liveInsertedOnce) {
            state.liveInsertedOnce = true;
            return "";
        }
        const prev = String(state.liveLastInsertedChar || "");
        const nextFirst = String(nextChunk || "").charAt(0);
        if (prev && /[-'’/(]$/.test(prev)) {
            return "";
        }
        if (nextFirst && /^[,.;:!?)}\]-]/.test(nextFirst)) {
            return "";
        }
        return " ";
    }

    function normalizeStreamingInsertText(text) {
        return String(text || "")
            .replace(/[\u00A0\u202F]/g, " ")
            .replace(/\s+/g, " ")
            .replace(/\s+([-\u2010-\u2015])\s+/g, "$1")
            .replace(/\s+([-\u2010-\u2015])$/g, "$1")
            .replace(/^([-\u2010-\u2015])\s+/g, "$1")
            .replace(/([^\s-])\s*-\s*([^\s-])/g, "$1-$2")
            .trim();
    }

    function insertLiveTextAtCaret(text, memoId) {
        const chunk = normalizeStreamingInsertText(text);
        if (!chunk) return;
        state.hadLiveTranscriptInSession = true;
        const payload = `${getLiveInsertPrefix(chunk)}${chunk}`;
        state.liveLastInsertedChar = payload.slice(-1) || state.liveLastInsertedChar;
        if (memoId && typeof window.GoToolkitMemoAppendToRecordingTab === "function") {
            window.GoToolkitMemoAppendToRecordingTab(payload, memoId, state.recordingDocumentId || null);
            return;
        }
        if (memoId && typeof window.GoToolkitMemoInsertTextAtTrackedCaret === "function") {
            window.GoToolkitMemoInsertTextAtTrackedCaret(payload, memoId);
            return;
        }
        const activeMemoId = window.GoToolkitMemoVoice?.getActiveMemo?.()?.id || null;
        const isTargetMemoActive = Boolean(memoId && activeMemoId && memoId === activeMemoId);
        // When the source memo is still active, keep natural inline insertion.
        if (isTargetMemoActive && typeof window.GoToolkitMemoInsertTextAtCaret === "function") {
            window.GoToolkitMemoInsertTextAtCaret(payload, memoId);
            return;
        }
        // If user switched tab/document, keep appending to the source memo.
        if (memoId && typeof window.GoToolkitMemoAppendText === "function") {
            window.GoToolkitMemoAppendText(payload, memoId);
            return;
        }
        if (typeof window.GoToolkitMemoInsertTextAtCaret === "function") {
            window.GoToolkitMemoInsertTextAtCaret(payload, memoId || null);
            return;
        }
        if (typeof window.GoToolkitMemoAppendText === "function") {
            window.GoToolkitMemoAppendText(payload, memoId || null);
        }
    }

    function resetLiveTranscriptionState() {
        state.liveInsertedByTurn = {};
        state.liveInsertedOnce = false;
        state.liveLastInsertedChar = "";
    }

    function stopLiveTranscription() {
        const ws = state.liveSocket;
        state.liveSocket = null;
        if (ws) {
            try {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "Terminate" }));
                }
            } catch (err) { /* noop */ }
            try { ws.close(); } catch (err) { /* noop */ }
        }
        if (state.liveProcessor) {
            try { state.liveProcessor.disconnect(); } catch (err) { /* noop */ }
            state.liveProcessor.onaudioprocess = null;
            state.liveProcessor = null;
        }
        if (state.liveAudioSource) {
            try { state.liveAudioSource.disconnect(); } catch (err) { /* noop */ }
            state.liveAudioSource = null;
        }
        if (state.liveMuteGain) {
            try { state.liveMuteGain.disconnect(); } catch (err) { /* noop */ }
            state.liveMuteGain = null;
        }
        if (state.liveAudioContext) {
            try { state.liveAudioContext.close(); } catch (err) { /* noop */ }
            state.liveAudioContext = null;
        }
        resetLiveTranscriptionState();
    }

    async function fetchAssemblyStreamingToken(key) {
        const rawUrl = ASSEMBLY_PROXY_TOKEN_URL || getAssemblyProxyUrl("token");
        if (!rawUrl) throw new Error("Token streaming indisponible");
        const tokenUrl = new URL(rawUrl, window.location.origin);
        if (!tokenUrl.searchParams.has("expires_in_seconds")) {
            tokenUrl.searchParams.set("expires_in_seconds", "60");
        }
        const response = await fetch(tokenUrl.toString(), {
            method: "GET",
            headers: key ? { "X-AssemblyAI-Key": key } : {}
        });
        const raw = await response.text();
        if (!response.ok) {
            throw new Error(`Token streaming échoué (${response.status})`);
        }
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch (err) {
            data = null;
        }
        const token = data?.token || data?.temp_token || data?.access_token || "";
        if (!token) {
            throw new Error("Token streaming manquant");
        }
        return token;
    }

    function handleAssemblyLiveMessage(message, memoId) {
        if (!message || typeof message !== "object") return;
        const type = String(message.type || "");
        if (type !== "Turn" && type !== "FinalTranscript") return;
        const turnOrder = Number.isFinite(Number(message.turn_order)) ? Number(message.turn_order) : 0;
        const transcript = String(message.transcript || message.text || "").trim();
        if (!transcript) return;
        const previous = String(state.liveInsertedByTurn[turnOrder] || "");
        if (transcript === previous) return;
        let delta = transcript;
        if (previous && transcript.startsWith(previous)) {
            delta = transcript.slice(previous.length);
        } else if (previous) {
            delta = ` ${transcript}`;
        }
        const next = String(delta || "").trim();
        if (!next) return;
        state.liveInsertedByTurn[turnOrder] = transcript;
        insertLiveTextAtCaret(next, memoId);
    }

    async function startLiveTranscription(audioStream, memoId) {
        if (!audioStream) return;
        stopLiveTranscription();
        try {
            const assemblyKey = getAssemblyApiKey();
            const token = await fetchAssemblyStreamingToken(assemblyKey);
            const wsUrl = new URL("wss://streaming.assemblyai.com/v3/ws");
            wsUrl.searchParams.set("sample_rate", "16000");
            wsUrl.searchParams.set("token", token);
            wsUrl.searchParams.set("encoding", "pcm_s16le");
            wsUrl.searchParams.set("speech_model", "universal-streaming-multilingual");
            wsUrl.searchParams.set("language_detection", "true");
            wsUrl.searchParams.set("formatted_finals", "false");
            wsUrl.searchParams.set("format_turns", "false");
            wsUrl.searchParams.set("end_of_turn_confidence_threshold", "0.6");
            const ws = new WebSocket(wsUrl.toString());
            ws.binaryType = "arraybuffer";
            state.liveSocket = ws;
            let sentFrames = 0;
            let sentBytes = 0;

            ws.onmessage = event => {
                try {
                    const data = JSON.parse(event.data);
                    handleAssemblyLiveMessage(data, memoId);
                } catch (err) {
                    console.warn("Live transcription parse failed", err);
                }
            };
            ws.onerror = err => {
                console.warn("Live transcription websocket error", err);
            };
            ws.onclose = event => {
                if (state.liveSocket === ws) {
                    state.liveSocket = null;
                }
            };

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Timeout websocket transcription")), 12000);
                ws.onopen = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                ws.onerror = err => {
                    clearTimeout(timeout);
                    reject(err || new Error("WebSocket transcription indisponible"));
                };
            });

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            state.liveAudioContext = audioContext;
            const source = audioContext.createMediaStreamSource(audioStream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            const muteGain = audioContext.createGain();
            muteGain.gain.value = 0;
            source.connect(processor);
            processor.connect(muteGain);
            muteGain.connect(audioContext.destination);
            state.liveAudioSource = source;
            state.liveProcessor = processor;
            state.liveMuteGain = muteGain;
            resetLiveTranscriptionState();

            processor.onaudioprocess = event => {
                const socket = state.liveSocket;
                if (!socket || socket.readyState !== WebSocket.OPEN) return;
                const inputData = event.inputBuffer.getChannelData(0);
                const pcm16 = downsampleTo16k(inputData, audioContext.sampleRate);
                if (!pcm16.length) return;
                const chunk = pcm16.buffer.slice(0);
                socket.send(chunk);
                sentFrames += 1;
                sentBytes += chunk.byteLength || 0;
            };
        } catch (err) {
            console.warn("Live transcription start failed", err);
            stopLiveTranscription();
        }
    }

    async function uploadAudioToAssembly(blob, key) {
        if (!blob) throw new Error("Audio absent");
        const url = getAssemblyProxyUrl("upload");
        if (!url) throw new Error("Proxy AssemblyAI indisponible");
        const response = await fetch(url, {
            method: "POST",
            headers: {
                ...(key ? { "X-AssemblyAI-Key": key } : {}),
                "Content-Type": blob.type || "audio/webm"
            },
            body: blob
        });
        let data = null;
        try {
            data = await response.json();
        } catch (err) {
            console.warn("AssemblyAI upload response parse failed", err);
        }
        if (!response.ok) {
            throw new Error(`Envoi audio echoue (${response.status})`);
        }
        if (!data?.upload_url) {
            throw new Error("URL audio manquante");
        }
        return data.upload_url;
    }

    async function requestAssemblyTranscript(payload, key) {
        const url = getAssemblyProxyUrl("transcript");
        if (!url) throw new Error("Proxy AssemblyAI indisponible");
        const response = await fetch(url, {
            method: "POST",
            headers: {
                ...(key ? { "X-AssemblyAI-Key": key } : {}),
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const responseText = await response.text();
        if (!response.ok) {
            const detail = responseText ? `: ${responseText.replace(/\s+/g, " ").trim()}` : "";
            const err = new Error(`Requete transcription echouee (${response.status})${detail}`);
            err.status = response.status;
            err.responseText = responseText;
            throw err;
        }
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : null;
        } catch (err) {
            console.warn("AssemblyAI transcript response parse failed", err);
            data = null;
        }
        if (!data?.id) {
            throw new Error("ID de transcription manquante");
        }
        return data.id;
    }

    async function pollAssemblyTranscript(transcriptId, key) {
        const url = getAssemblyProxyUrl(`transcript/${transcriptId}`);
        if (!url) throw new Error("Proxy AssemblyAI indisponible");
        for (let attempt = 0; attempt < 40; attempt++) {
            const response = await fetch(url, {
                headers: key ? { "X-AssemblyAI-Key": key } : {}
            });
            const responseText = await response.text();
            if (!response.ok) {
                throw new Error(`Echec du suivi (${response.status})`);
            }
            let data = null;
            try {
                data = responseText ? JSON.parse(responseText) : null;
            } catch (err) {
                console.warn("AssemblyAI transcript GET response parse failed", err);
                throw new Error("Reponse AssemblyAI invalide");
            }
            if (!data) {
                throw new Error("Reponse AssemblyAI invalide");
            }
            if (data.status === "completed") {
                return data;
            }
            if (data.status === "error") {
                throw new Error(data.error || "Erreur AssemblyAI");
            }
            await new Promise(resolve => setTimeout(resolve, 1200));
        }
        throw new Error("Timeout AssemblyAI");
    }

    async function fetchAssemblyTranscriptVtt(transcriptId, key) {
        if (!transcriptId) return "";
        const url = getAssemblyProxyUrl(`transcript/${transcriptId}/vtt`);
        if (!url) return "";
        try {
            const response = await fetch(url, {
                headers: key ? { "X-AssemblyAI-Key": key } : {}
            });
            const vtt = await response.text();
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return vtt;
        } catch (err) {
            console.warn("Assembly VTT fetch failed", err);
            return "";
        }
    }

    function buildAssemblyTranscriptPayload(uploadUrl, speakersExpected) {
        const browserLang = (window.navigator?.language || "").toLowerCase();
        const fallbackLanguage = browserLang.startsWith("vi") ? "vi" : "fr";
        const payload = {
            audio_url: uploadUrl,
            auto_chapters: true,
            filter_profanity: true,
            speaker_labels: true,
            language_detection: true,
            language_detection_options: {
                expected_languages: ["en", "fr", "vi"],
                fallback_language: fallbackLanguage
            },
            punctuate: true,
            format_text: true
        };
        if (speakersExpected > 0) {
            payload.speakers_expected = speakersExpected;
        }
        return payload;
    }

    function buildButtonLabel() {
        const hasRecordingForCurrentMemo = Boolean(state.currentMemoRecordingId);
        const shouldShowBadge = hasRecordingForCurrentMemo || state.conversionRunning;
        const badgeClass = state.conversionRunning ? "chat-header-badge chat-header-badge--pending" : "chat-header-badge";
        const badge = shouldShowBadge ? `<span class="${badgeClass}"></span>` : "";
        if (state.isTranscribing) {
            return `<i data-lucide="loader-2" class="lucide-spin" style="width:14px;height:14px;"></i>${badge}`;
        }
        if (state.isRecording) {
            const isRecordingCurrentMemo = Boolean(
                state.currentMemoId && state.recordingMemoId && state.currentMemoId === state.recordingMemoId
            );
            if (!isRecordingCurrentMemo) {
                if (state.currentMemoRecordingId) {
                    const recordingIcon = state.currentMemoRecordingHasVideo ? "video" : "cassette-tape";
                    return `<i data-lucide="${recordingIcon}"></i>${badge}`;
                }
                const ongoingMemoName = state.recordingMemoName || "Autre onglet";
                return `■ Arrêter (${ongoingMemoName})`;
            }
            const duration = Math.floor((Date.now() - state.recordingStartTime) / 1000);
            const timeLabel = formatDuration(duration);
            return `■ ${timeLabel}${badge}`;
        }
        if (state.currentMemoRecordingId) {
            const recordingIcon = state.currentMemoRecordingHasVideo ? "video" : "cassette-tape";
            return `<i data-lucide="${recordingIcon}"></i>${badge}`;
        }
        return `<i data-lucide="video"></i>${badge}`;
    }

    function updateButton() {
        if (!state.voiceButton) return;
        state.voiceButton.innerHTML = buildButtonLabel();
        const isRecordingCurrentMemo = Boolean(
            state.isRecording && state.currentMemoId && state.recordingMemoId && state.currentMemoId === state.recordingMemoId
        );
        state.voiceButton.classList.toggle("is-recording", isRecordingCurrentMemo);
        if (window.lucide) lucide.createIcons();
    }

    function updateTimer() {
        updateButton();
    }

    function addClickHighlight(clientX, clientY) {
        if (!state.videoCompositorCanvas) return;
        const viewW = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 1);
        const viewH = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 1);
        const xNorm = Math.max(0, Math.min(1, Number(clientX || 0) / viewW));
        const yNorm = Math.max(0, Math.min(1, Number(clientY || 0) / viewH));
        state.clickHighlights.push({ xNorm, yNorm, startTs: performance.now() });
        if (state.clickHighlights.length > 24) {
            state.clickHighlights = state.clickHighlights.slice(-24);
        }
    }

    function drawClickHighlights(ctx, width, height, nowTs) {
        if (!ctx || !state.clickHighlights.length) return;
        const active = [];
        for (let i = 0; i < state.clickHighlights.length; i += 1) {
            const effect = state.clickHighlights[i];
            const elapsed = Math.max(0, nowTs - effect.startTs);
            if (elapsed > CLICK_HIGHLIGHT_DURATION_MS) continue;
            const progress = elapsed / CLICK_HIGHLIGHT_DURATION_MS;
            const alpha = 1 - progress;
            const x = effect.xNorm * width;
            const y = effect.yNorm * height + CLICK_HIGHLIGHT_Y_OFFSET_PX;
            const outerR = CLICK_HIGHLIGHT_RADIUS_PX * (1 + progress * 0.7);
            const innerR = Math.max(6, CLICK_HIGHLIGHT_RADIUS_PX * (0.28 - progress * 0.12));

            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.lineWidth = Math.max(2, Math.round(width / 550));
            ctx.strokeStyle = `rgba(255, 190, 0, ${Math.max(0, alpha * 0.95)})`;
            ctx.fillStyle = `rgba(255, 190, 0, ${Math.max(0, alpha * 0.22)})`;
            ctx.beginPath();
            ctx.arc(x, y, outerR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 245, 180, ${Math.max(0, alpha * 0.85)})`;
            ctx.beginPath();
            ctx.arc(x, y, innerR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            active.push(effect);
        }
        state.clickHighlights = active;
    }

    async function startVideoCompositor(sourceStream) {
        if (!sourceStream?.getVideoTracks?.().length) return null;
        const sourceVideo = document.createElement("video");
        sourceVideo.muted = true;
        sourceVideo.playsInline = true;
        sourceVideo.srcObject = sourceStream;
        await new Promise((resolve, reject) => {
            const onLoaded = () => {
                cleanup();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error("Prévisualisation vidéo indisponible"));
            };
            const cleanup = () => {
                sourceVideo.removeEventListener("loadedmetadata", onLoaded);
                sourceVideo.removeEventListener("error", onError);
            };
            sourceVideo.addEventListener("loadedmetadata", onLoaded);
            sourceVideo.addEventListener("error", onError);
        });
        await sourceVideo.play().catch(() => { /* noop */ });

        const width = Math.max(2, sourceVideo.videoWidth || 1280);
        const height = Math.max(2, sourceVideo.videoHeight || 720);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
        if (!ctx) {
            throw new Error("Canvas vidéo indisponible");
        }

        state.clickHighlights = [];
        const render = () => {
            const nowTs = performance.now();
            ctx.clearRect(0, 0, width, height);
            try {
                ctx.drawImage(sourceVideo, 0, 0, width, height);
            } catch (err) { /* noop */ }
            drawClickHighlights(ctx, width, height, nowTs);
            state.videoCompositorRafId = requestAnimationFrame(render);
        };
        state.videoCompositorRafId = requestAnimationFrame(render);

        const onPointerDown = event => {
            if (!state.isRecording) return;
            if (event.button !== 0) return;
            addClickHighlight(event.clientX, event.clientY);
        };
        window.addEventListener("pointerdown", onPointerDown, true);

        const fps = 20;
        const composedStream = canvas.captureStream(fps);
        state.videoCompositorCanvas = canvas;
        state.videoCompositorStream = composedStream;
        state.videoCompositorSourceVideo = sourceVideo;
        state.clickPointerHandler = onPointerDown;
        return composedStream;
    }

    function stopVideoCompositor() {
        if (state.videoCompositorRafId) {
            cancelAnimationFrame(state.videoCompositorRafId);
            state.videoCompositorRafId = null;
        }
        if (state.clickPointerHandler) {
            window.removeEventListener("pointerdown", state.clickPointerHandler, true);
            state.clickPointerHandler = null;
        }
        if (state.videoCompositorSourceVideo) {
            try { state.videoCompositorSourceVideo.pause(); } catch (err) { /* noop */ }
            state.videoCompositorSourceVideo.srcObject = null;
            state.videoCompositorSourceVideo = null;
        }
        if (state.videoCompositorStream) {
            state.videoCompositorStream.getTracks().forEach(track => {
                try { track.stop(); } catch (err) { /* noop */ }
            });
            state.videoCompositorStream = null;
        }
        state.videoCompositorCanvas = null;
        state.clickHighlights = [];
    }

    function resetSessionState() {
        state.currentRecordingId = null;
        state.currentRecordingHasVideo = false;
        state.currentMemoRecordingId = null;
        state.currentMemoRecordingHasVideo = false;
        state.recordingMemoId = null;
        state.recordingDocumentId = null;
        state.recordingMemoName = "";
        state.isRecording = false;
        state.isTranscribing = false;
        state.recordingStartTime = 0;
        state.hadLiveTranscriptInSession = false;
        if (state.transcriptionCountdownTimer) {
            clearInterval(state.transcriptionCountdownTimer);
            state.transcriptionCountdownTimer = null;
        }
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = null;
        }
        stopLiveTranscription();
        stopVideoCompositor();
        stopAudioMix();
        stopOverlayStreams();
        updateButton();
    }

    function closeOverlay() {
        if (state.overlay) {
            state.overlay.classList.remove("visible");
        }
        stopMetering();
    }

    function ensureOverlay() {
        if (state.overlay) return;
        state.overlay = document.createElement("div");
        state.overlay.className = "voice-overlay voice-overlay--prep";
        state.overlay.innerHTML = `
            <button class="voice-overlay__close" type="button" aria-label="Fermer">×</button>
            <div class="voice-overlay__caption">Demander l'autorisation à vos interlocuteurs pour enregistrer la conversation.</div>
            <div class="voice-overlay__ready">Prêt</div>
            <div class="voice-overlay__tiles">
                <div class="voice-overlay__tile" data-kind="mic">
                    <div class="voice-overlay__tile-label">Microphone</div>
                    <div class="voice-overlay__tile-meter" aria-hidden="true">
                        <canvas class="voice-overlay__tile-meter-canvas"></canvas>
                    </div>
                </div>
                <div class="voice-overlay__tile" data-kind="system-audio">
                    <div class="voice-overlay__tile-label">Son du PC</div>
                    <div class="voice-overlay__tile-meter" aria-hidden="true">
                        <canvas class="voice-overlay__tile-meter-canvas"></canvas>
                    </div>
                </div>
                <div class="voice-overlay__tile" data-kind="webcam">
                    <video playsinline muted></video>
                    <div class="voice-overlay__tile-label">Webcam</div>
                </div>
                <div class="voice-overlay__tile" data-kind="screen">
                    <video playsinline muted></video>
                    <div class="voice-overlay__tile-label">Écran</div>
                </div>
            </div>
        `;
        document.body.appendChild(state.overlay);
        state.overlayTiles = Array.from(state.overlay.querySelectorAll(".voice-overlay__tile"));
        state.overlayReady = state.overlay.querySelector(".voice-overlay__ready");
        const closeBtn = state.overlay.querySelector(".voice-overlay__close");
        closeBtn?.addEventListener("click", closeOverlay);
        state.overlayTiles.forEach(tile => {
            tile.addEventListener("click", async () => {
                const kind = tile.dataset.kind;
                if (kind === "webcam" && voiceConfigState.disableCamera) {
                    showToast("Caméra désactivée dans la configuration.", true);
                    return;
                }
                if (kind === "mic") await toggleMicPermission();
                if (kind === "system-audio") await toggleSystemAudioPermission();
                if (kind === "webcam") await toggleWebcamPermission();
                if (kind === "screen") await toggleScreenPermission();
                syncOverlayTiles();
                attachOverlayStreams();
            });
        });
        state.overlayReady?.addEventListener("click", async () => {
            state.overlay.classList.remove("visible");
            await startRecording(state.currentMemoId, state.currentMemoName);
        });
        syncOverlayTiles();
    }

    function syncOverlayTiles() {
        if (!state.overlayTiles) return;
        state.overlayTiles.forEach(tile => {
            const kind = tile.dataset.kind;
            const webcamDisabled = kind === "webcam" && voiceConfigState.disableCamera;
            if (webcamDisabled) {
                tile.style.display = "none";
                tile.classList.remove("voice-overlay__tile--active");
                return;
            }
            tile.style.display = "";
            const active = (kind === "mic" && state.overlayMic)
                || (kind === "system-audio" && state.overlaySystemAudio)
                || (kind === "webcam" && state.overlayWebcam)
                || (kind === "screen" && state.overlayScreen);
            tile.classList.toggle("voice-overlay__tile--active", active);
            const label = tile.querySelector(".voice-overlay__tile-label");
            if (label) {
                const enabled = isTileEnabled(kind);
                const labelText = getTileLabel(kind);
                label.textContent = `${labelText} ${enabled ? "activé" : "désactivé"}`;
            }
        });
    }

    function attachOverlayStreams() {
        if (!state.overlay) return;
        const webcamTile = state.overlay.querySelector('.voice-overlay__tile[data-kind="webcam"] video');
        if (webcamTile && state.overlayStreams.webcam) {
            webcamTile.srcObject = state.overlayStreams.webcam;
            webcamTile.play().catch(() => { });
        }
        const screenTile = state.overlay.querySelector('.voice-overlay__tile[data-kind="screen"] video');
        if (screenTile && state.overlayStreams.screen) {
            screenTile.srcObject = state.overlayStreams.screen;
            screenTile.play().catch(() => { });
        }
        ensureMetering();
    }

    function openOverlay() {
        ensureOverlay();
        attachOverlayStreams();
        syncOverlayTiles();
        state.overlay?.classList.add("visible");
        // Add ESC key listener
        const handleEsc = (e) => {
            if (e.key === "Escape") {
                closeOverlay();
                document.removeEventListener("keydown", handleEsc);
            }
        };
        document.addEventListener("keydown", handleEsc);
    }

    async function getRecordingForMemo(memoId) {
        if (!memoId || !RECORDINGS_STORE) return null;
        const recordingId = window.GoToolkitMemoVoice?.getVoiceRecordingId
            ? window.GoToolkitMemoVoice.getVoiceRecordingId(memoId)
            : null;
        if (!recordingId) return null;
        try {
            return await RECORDINGS_STORE.get(recordingId);
        } catch (err) {
            console.warn("Recording fetch failed", err);
            return null;
        }
    }

    function setRecordingForMemo(memoId, recordingId) {
        if (window.GoToolkitMemoVoice?.setVoiceRecordingId) {
            window.GoToolkitMemoVoice.setVoiceRecordingId(memoId, recordingId);
        }
    }

    function buildAudioStream({ micStream, systemStream }) {
        stopAudioMix();
        const micTracks = micStream?.getAudioTracks?.() || [];
        const systemTracks = systemStream?.getAudioTracks?.() || [];
        if (micTracks.length && systemTracks.length) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const destination = audioContext.createMediaStreamDestination();
            audioContext.createMediaStreamSource(micStream).connect(destination);
            audioContext.createMediaStreamSource(systemStream).connect(destination);
            state.audioContext = audioContext;
            state.audioMixStream = destination.stream;
            return destination.stream;
        }
        if (systemTracks.length) {
            return new MediaStream(systemTracks);
        }
        if (micTracks.length) {
            return micStream;
        }
        return null;
    }

    async function startRecording(memoId, memoName) {
        if (state.isRecording || state.currentRecordingId || state.isTranscribing) {
            if (state.isTranscribing) {
                showToast("Transcription en cours.", true);
                return;
            }
            showToast("Enregistrement déjà actif.", true);
            return;
        }
        if (!memoId) {
            showToast("Docs introuvable.", true);
            return;
        }
        state.recordingMemoId = memoId;
        state.recordingDocumentId = window.GoToolkitMemoGetActiveDocumentId?.() || null;
        state.recordingMemoName = memoName || "";
        state.audioChunks = [];
        state.videoChunks = [];
        state.audioBlob = null;
        state.videoBlob = null;
        state.hadLiveTranscriptInSession = false;
        state.recordingStartTime = Date.now();
        try {
            let micStream = state.overlayMic ? state.overlayStreams.audio : null;
            let webcamStream = state.overlayStreams.webcam;
            let screenStream = state.overlayStreams.screen;
            if (state.overlayMic && !micStream) {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                state.overlayStreams.audio = micStream;
            }
            let videoStream = null;
            if (state.overlayScreen) {
                if (screenStream) {
                    videoStream = screenStream;
                } else {
                    try {
                        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                        state.overlayStreams.screen = screenStream;
                        videoStream = screenStream;
                    } catch {
                        showToast("Capture d'écran indisponible.", true);
                    }
                }
            } else if (isCameraAllowed() && state.overlayWebcam) {
                if (webcamStream) {
                    videoStream = webcamStream;
                } else {
                    try {
                        webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        state.overlayStreams.webcam = webcamStream;
                        videoStream = webcamStream;
                    } catch {
                        showToast("Webcam indisponible.", true);
                    }
                }
            }
            let systemAudioStream = null;
            if (state.overlaySystemAudio) {
                if (state.overlayScreen && screenStream?.getAudioTracks?.().length) {
                    systemAudioStream = screenStream;
                } else if (state.overlayStreams.systemAudio) {
                    systemAudioStream = state.overlayStreams.systemAudio;
                } else {
                    try {
                        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                        displayStream.getVideoTracks().forEach(track => {
                            try { track.stop(); } catch (err) { /* noop */ }
                        });
                        state.overlayStreams.systemAudio = displayStream;
                        systemAudioStream = displayStream;
                    } catch {
                        showToast("Audio système indisponible.", true);
                    }
                }
            }

            const audioStream = buildAudioStream({ micStream, systemStream: systemAudioStream });
            if (!audioStream) {
                showToast("Aucune source audio sélectionnée.", true);
                return;
            }
            state.audioRecorder = new MediaRecorder(audioStream);
            state.audioRecorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) {
                    state.audioChunks.push(event.data);
                }
            };
            state.audioRecorder.start();
            startLiveTranscription(audioStream, memoId);
            if (videoStream) {
                let videoTrackSource = videoStream;
                if (state.overlayScreen && videoStream === screenStream) {
                    try {
                        const composedStream = await startVideoCompositor(videoStream);
                        if (composedStream?.getVideoTracks?.().length) {
                            videoTrackSource = composedStream;
                        }
                    } catch (err) {
                        console.warn("Screen compositor disabled", err);
                    }
                }
                const combinedTracks = [
                    ...(videoTrackSource.getVideoTracks() || []),
                    ...(audioStream.getAudioTracks() || [])
                ];
                for (const track of combinedTracks) {
                    if (track?.kind !== "video") continue;
                    try {
                        track.applyConstraints?.({ frameRate: 20 });
                    } catch (err) { /* noop */ }
                }
                const combinedStream = new MediaStream(combinedTracks);
                state.videoRecorder = new MediaRecorder(combinedStream);
                state.videoRecorder.ondataavailable = event => {
                    if (event.data && event.data.size > 0) {
                        state.videoChunks.push(event.data);
                    }
                };
                state.videoRecorder.start();
            }
            state.isRecording = true;
            state.timerId = setInterval(updateTimer, 1000);
            updateButton();
        } catch (err) {
            console.error("Recording start failed", err);
            showToast("Autorisation micro ou vidéo refusée.", true);
            resetSessionState();
        }
    }

    function stopRecorder(recorder) {
        if (!recorder) return Promise.resolve();
        return new Promise(resolve => {
            recorder.addEventListener("stop", resolve, { once: true });
            try {
                recorder.stop();
            } catch (err) {
                resolve();
            }
        });
    }

    function stopTracks(recorder) {
        const stream = recorder?.stream;
        if (!stream) return;
        stream.getTracks().forEach(track => {
            try { track.stop(); } catch (err) { /* noop */ }
        });
    }

    function clearVideoTile(kind) {
        if (!state.overlay) return;
        const tile = state.overlay.querySelector(`.voice-overlay__tile[data-kind="${kind}"] video`);
        if (tile) {
            tile.srcObject = null;
        }
    }

    function getMeterCanvas(kind) {
        if (!state.overlay) return null;
        return state.overlay.querySelector(`.voice-overlay__tile[data-kind="${kind}"] .voice-overlay__tile-meter-canvas`);
    }

    function shouldShowMeter(kind) {
        if (kind === "mic") {
            return Boolean(state.overlayMic && state.overlayStreams.audio);
        }
        if (kind === "system-audio") {
            if (!state.overlaySystemAudio) return false;
            return Boolean(state.overlayStreams.systemAudio || isStreamWithAudio(state.overlayStreams.screen));
        }
        return false;
    }

    function drawWave(kind, analyser) {
        const canvas = getMeterCanvas(kind);
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
            canvas.width = Math.floor(rect.width);
            canvas.height = Math.floor(rect.height);
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const midY = h / 2;

        if (!shouldShowMeter(kind)) {
            ctx.clearRect(0, 0, w, h);
            return;
        }

        const bufferLength = analyser?.fftSize || 512;
        const data = new Uint8Array(bufferLength);
        if (analyser) {
            analyser.getByteTimeDomainData(data);
        } else {
            data.fill(128);
        }
        const smoothData = smoothWaveData(data);

        ctx.lineWidth = 3.5;
        ctx.strokeStyle = "#ffd466";
        ctx.shadowColor = "rgba(255, 212, 102, 0.85)";
        ctx.shadowBlur = 16;
        let phase = 0;
        if (kind === "mic") phase = state.micWavePhase;
        if (kind === "system-audio") phase = state.systemWavePhase;
        ctx.beginPath();
        const step = 2;
        for (let i = 0; i < bufferLength; i += step) {
            const index = (i + Math.floor(phase)) % bufferLength;
            const x = (i / (bufferLength - 1)) * w;
            const v = (smoothData[index] - 128) / 128;
            const y = midY + v * (h * 1.9);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    function readAnalyserLevel(analyser) {
        if (!analyser) return 0;
        const bufferLength = analyser.fftSize;
        const data = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < bufferLength; i += 1) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
        }
        return Math.sqrt(sum / bufferLength);
    }

    function smoothWaveData(data) {
        const n = data.length;
        if (n < 5) return data;
        const out = new Uint8Array(n);
        const k0 = 0.061;
        const k1 = 0.244;
        const k2 = 0.39;
        const k3 = 0.244;
        const k4 = 0.061;
        for (let i = 0; i < n; i += 1) {
            const i0 = (i - 2 + n) % n;
            const i1 = (i - 1 + n) % n;
            const i2 = i;
            const i3 = (i + 1) % n;
            const i4 = (i + 2) % n;
            const v = data[i0] * k0
                + data[i1] * k1
                + data[i2] * k2
                + data[i3] * k3
                + data[i4] * k4;
            out[i] = Math.max(0, Math.min(255, Math.round(v)));
        }
        return out;
    }

    function stopMetering() {
        if (state.meterRafId) {
            cancelAnimationFrame(state.meterRafId);
            state.meterRafId = null;
        }
        state.micAnalyser = null;
        state.systemAnalyser = null;
        state.micAnalyserStream = null;
        state.systemAnalyserStream = null;
        state.micWavePhase = 0;
        state.systemWavePhase = 0;
        if (state.meterContext) {
            try { state.meterContext.close(); } catch (err) { /* noop */ }
            state.meterContext = null;
        }
        state.meterLastTs = 0;
        drawWave("mic", null);
        drawWave("system-audio", null);
    }

    function ensureMetering() {
        if (!state.overlay) return;
        const context = state.meterContext || new (window.AudioContext || window.webkitAudioContext)();
        state.meterContext = context;

        const micStream = state.overlayStreams.audio || null;
        if (micStream !== state.micAnalyserStream) {
            state.micAnalyser = null;
            state.micAnalyserStream = micStream;
            if (micStream) {
                const source = context.createMediaStreamSource(micStream);
                const analyser = context.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);
                state.micAnalyser = analyser;
            }
        }

        let systemStream = state.overlayStreams.systemAudio || null;
        if (!systemStream && state.overlaySystemAudio && isStreamWithAudio(state.overlayStreams.screen)) {
            systemStream = state.overlayStreams.screen;
        }
        if (systemStream !== state.systemAnalyserStream) {
            state.systemAnalyser = null;
            state.systemAnalyserStream = systemStream;
            if (systemStream) {
                const source = context.createMediaStreamSource(systemStream);
                const analyser = context.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);
                state.systemAnalyser = analyser;
            }
        }

        if (!state.meterRafId) {
            const tick = (ts) => {
                if (!state.meterLastTs) state.meterLastTs = ts;
                const dt = Math.max(0, ts - state.meterLastTs);
                state.meterLastTs = ts;
                const maxPhase = state.micAnalyser?.fftSize || 512;
                const phaseSpeed = maxPhase * (dt / 2000);
                state.micWavePhase = (state.micWavePhase + phaseSpeed) % maxPhase;
                state.systemWavePhase = (state.systemWavePhase + phaseSpeed) % maxPhase;
                drawWave("mic", state.micAnalyser);
                drawWave("system-audio", state.systemAnalyser);
                state.meterRafId = requestAnimationFrame(tick);
            };
            state.meterRafId = requestAnimationFrame(tick);
        }
    }

    function getTileLabel(kind) {
        if (kind === "mic") return "Microphone";
        if (kind === "system-audio") return "Son du PC";
        if (kind === "webcam") return "Webcam";
        if (kind === "screen") return "Écran";
        return "";
    }

    function isStreamWithAudio(stream) {
        return Boolean(stream && stream.getAudioTracks && stream.getAudioTracks().length);
    }

    function isTileEnabled(kind) {
        if (kind === "mic") return Boolean(state.overlayStreams.audio);
        if (kind === "webcam") return Boolean(state.overlayStreams.webcam);
        if (kind === "screen") return Boolean(state.overlayStreams.screen);
        if (kind === "system-audio") {
            if (!state.overlaySystemAudio) return false;
            return Boolean(state.overlayStreams.systemAudio || isStreamWithAudio(state.overlayStreams.screen));
        }
        return false;
    }

    function stopStream(key) {
        const stream = state.overlayStreams[key];
        if (!stream) return;
        stream.getTracks().forEach(track => {
            try { track.stop(); } catch (err) { /* noop */ }
        });
        state.overlayStreams[key] = null;
        if (key === "webcam") clearVideoTile("webcam");
        if (key === "screen") clearVideoTile("screen");
    }

    async function toggleMicPermission() {
        if (state.overlayStreams.audio) {
            stopStream("audio");
            state.permissionsGranted.audio = false;
            state.overlayMic = false;
            return;
        }
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.overlayStreams.audio = audioStream || null;
            state.permissionsGranted.audio = Boolean(audioStream);
            state.overlayMic = Boolean(state.overlayStreams.audio);
        } catch (err) {
            console.error("Microphone permission failed", err);
            showToast("Microphone indisponible.", true);
            state.overlayStreams.audio = null;
            state.permissionsGranted.audio = false;
            state.overlayMic = false;
        }
    }

    async function toggleWebcamPermission() {
        if (state.overlayStreams.webcam) {
            stopStream("webcam");
            state.permissionsGranted.webcam = false;
            state.overlayWebcam = false;
            return;
        }
        try {
            const webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
            state.overlayStreams.webcam = webcamStream || null;
            state.permissionsGranted.webcam = Boolean(webcamStream);
            state.overlayWebcam = Boolean(state.overlayStreams.webcam);
        } catch (err) {
            console.error("Webcam permission failed", err);
            showToast("Webcam indisponible.", true);
            state.overlayStreams.webcam = null;
            state.permissionsGranted.webcam = false;
            state.overlayWebcam = false;
        }
    }

    async function toggleScreenPermission() {
        if (state.overlayStreams.screen) {
            if (state.overlaySystemAudio && state.overlayStreams.systemAudio === state.overlayStreams.screen) {
                state.overlayStreams.screen.getVideoTracks().forEach(track => {
                    try { track.stop(); } catch (err) { /* noop */ }
                });
                state.overlayStreams.screen = null;
                state.permissionsGranted.screen = false;
                state.overlayScreen = false;
                return;
            }
            stopStream("screen");
            state.permissionsGranted.screen = false;
            state.overlayScreen = false;
            return;
        }
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            state.overlayStreams.screen = screenStream || null;
            state.permissionsGranted.screen = Boolean(screenStream);
            state.overlayScreen = Boolean(state.overlayStreams.screen);
        } catch (err) {
            console.error("Screen permission failed", err);
            showToast("Capture d'écran indisponible.", true);
            state.overlayStreams.screen = null;
            state.permissionsGranted.screen = false;
            state.overlayScreen = false;
        }
    }

    async function toggleSystemAudioPermission() {
        if (state.overlaySystemAudio) {
            if (state.overlayStreams.systemAudio && state.overlayStreams.systemAudio === state.overlayStreams.screen) {
                state.overlayStreams.screen.getAudioTracks().forEach(track => {
                    try { track.stop(); } catch (err) { /* noop */ }
                });
                state.overlayStreams.systemAudio = null;
                state.permissionsGranted.systemAudio = false;
                state.overlaySystemAudio = false;
                return;
            }
            stopStream("systemAudio");
            state.permissionsGranted.systemAudio = false;
            state.overlaySystemAudio = false;
            return;
        }
        if (isStreamWithAudio(state.overlayStreams.screen)) {
            state.overlaySystemAudio = true;
            state.permissionsGranted.systemAudio = true;
            return;
        }
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            displayStream.getVideoTracks().forEach(track => {
                try { track.stop(); } catch (err) { /* noop */ }
            });
            state.overlayStreams.systemAudio = displayStream || null;
            state.permissionsGranted.systemAudio = Boolean(displayStream);
            state.overlaySystemAudio = Boolean(state.overlayStreams.systemAudio);
        } catch (err) {
            console.error("System audio permission failed", err);
            showToast("Audio système indisponible.", true);
            state.overlayStreams.systemAudio = null;
            state.permissionsGranted.systemAudio = false;
            state.overlaySystemAudio = false;
        }
    }

    function stopOverlayStreams() {
        stopMetering();
        ["audio", "webcam", "screen", "systemAudio"].forEach(key => {
            const stream = state.overlayStreams[key];
            if (!stream) return;
            stream.getTracks().forEach(track => {
                try { track.stop(); } catch (err) { /* noop */ }
            });
            state.overlayStreams[key] = null;
        });
        state.overlayMic = false;
        state.overlayWebcam = false;
        state.overlayScreen = false;
        state.overlaySystemAudio = false;
        state.permissionsGranted.audio = false;
        state.permissionsGranted.webcam = false;
        state.permissionsGranted.screen = false;
        state.permissionsGranted.systemAudio = false;
        clearVideoTile("webcam");
        clearVideoTile("screen");
    }

    function stopAudioMix() {
        if (state.audioMixStream) {
            state.audioMixStream.getTracks().forEach(track => {
                try { track.stop(); } catch (err) { /* noop */ }
            });
            state.audioMixStream = null;
        }
        if (state.audioContext) {
            try { state.audioContext.close(); } catch (err) { /* noop */ }
            state.audioContext = null;
        }
    }

    function stopWebcamPreviewStream() {
        const stream = state.overlayStreams.webcam;
        if (!stream) return;
        stream.getTracks().forEach(track => {
            try { track.stop(); } catch (err) { /* noop */ }
        });
        state.overlayStreams.webcam = null;
        clearVideoTile("webcam");
    }

    function enforceWebcamLock() {
        if (!voiceConfigState.disableCamera) return false;
        let changed = false;
        if (state.overlayWebcam) {
            state.overlayWebcam = false;
            changed = true;
        }
        if (state.overlayStreams.webcam) {
            stopWebcamPreviewStream();
            changed = true;
        }
        return changed;
    }

    function applyVoiceConfig(config) {
        const voiceSettings = config && typeof config === "object" ? config.voice : null;
        const disableCamera = Boolean(voiceSettings && voiceSettings.disableCamera);
        voiceConfigState.disableCamera = disableCamera;
        if (disableCamera) {
            enforceWebcamLock();
        }
        syncOverlayTiles();
    }

    async function stopRecording() {
        if (!state.isRecording) {
            if (state.currentRecordingId) {
                openRecordingPlayer();
            } else {
                openOverlay();
            }
            return;
        }
        state.isRecording = false;
        // Flip to loader before stopping streams/blobs to avoid perceived freeze on stop.
        state.isTranscribing = true;
        updateButton();
        await new Promise(resolve => setTimeout(resolve, 0));
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = null;
        }
        stopLiveTranscription();
        await stopRecorder(state.audioRecorder);
        await stopRecorder(state.videoRecorder);
        stopTracks(state.audioRecorder);
        stopTracks(state.videoRecorder);
        stopVideoCompositor();
        stopOverlayStreams();
        state.audioBlob = state.audioChunks.length
            ? new Blob(state.audioChunks, { type: state.audioChunks[0]?.type || "audio/webm" })
            : null;
        state.videoBlob = state.videoChunks.length
            ? new Blob(state.videoChunks, { type: state.videoChunks[0]?.type || "video/webm" })
            : null;
        if (state.videoBlob && window.VoiceVideoPlayerModal) {
            if (!state.videoModal) {
                state.videoModal = new window.VoiceVideoPlayerModal();
            }
            state.videoModal.prewarmGif?.(state.videoBlob).catch(err => {
                console.warn("GIF prewarm failed", err);
            });
        }
        state.audioRecorder = null;
        state.videoRecorder = null;
        updateButton();
        if (!state.audioBlob) {
            showToast("Aucun audio capturé.", true);
            resetSessionState();
            return;
        }
        const durationSeconds = Math.floor((Date.now() - state.recordingStartTime) / 1000);
        startTranscriptionCountdown(durationSeconds);
        try {
            await transcribeAndStore(durationSeconds);
        } catch (err) {
            showToast("Transcription impossible");
        }
    }

    function startTranscriptionCountdown(durationSeconds) {
        if (state.transcriptionCountdownTimer) {
            clearInterval(state.transcriptionCountdownTimer);
            state.transcriptionCountdownTimer = null;
        }
        const minutes = Math.max(0, Math.floor((durationSeconds || 0) / 60));
        const base = Math.max(10, Math.min(60, Math.round(minutes)));
        state.transcriptionCountdown = base;
        updateButton();
        state.transcriptionCountdownTimer = setInterval(() => {
            state.transcriptionCountdown -= 1;
            if (state.transcriptionCountdown <= 0) {
                state.transcriptionCountdown = base;
            }
            updateButton();
        }, 1000);
    }

    async function transcribeAndStore(durationSeconds) {
        const memoId = state.recordingMemoId;
        const memoName = state.recordingMemoName;
        try {
            const assemblyKey = getAssemblyApiKey();
            const uploadUrl = await uploadAudioToAssembly(state.audioBlob, assemblyKey);
            const payload = buildAssemblyTranscriptPayload(uploadUrl, 0);

            // Show transcription toast immediately when sending request
            const countdownSeconds = Math.max(15, Math.round(durationSeconds / 12));
            showTranscriptionToast(durationSeconds, countdownSeconds);

            const transcriptId = await requestAssemblyTranscript(payload, assemblyKey);
            const transcriptResult = await pollAssemblyTranscript(transcriptId, assemblyKey);

            // Hide transcription toast when done
            hideTranscriptionToast();
            const audioVtt = await fetchAssemblyTranscriptVtt(transcriptId, assemblyKey);
            const audioSentences = audioVtt ? parseVttTranscript(audioVtt) : [];
            const audioText = getTranscriptText(audioSentences);
            let videoVtt = "";
            let videoSentences = [];
            if (state.videoBlob) {
                videoVtt = await fetchAssemblyTranscriptVtt(transcriptId, assemblyKey);
                videoSentences = videoVtt ? parseVttTranscript(videoVtt) : [];
            }
            try {
                await navigator.clipboard.writeText(audioText || "");
                showToast("Transcription réussie");
            } catch (err) {
                showToast("Erreur lors de la copie", true);
            }
            const now = Date.now();
            const duration = Math.max(0, durationSeconds || 0);
            const recordId = crypto?.randomUUID ? crypto.randomUUID() : `voice-${Date.now()}`;
            const recording = {
                id: recordId,
                type: "voice-recording",
                audioBlob: state.audioBlob,
                videoBlob: state.videoBlob || null,
                audioTranscript: audioText,
                audioTranscriptSentences: audioSentences,
                videoTranscript: getTranscriptText(videoSentences),
                videoTranscriptSentences: videoSentences,
                duration,
                recordingDate: now,
                assemblyTranscriptId: transcriptId,
                assemblyLanguageCode: (transcriptResult?.language_code || transcriptResult?.language || "fr"),
                participants: [],
                subjects: [],
                createdAt: now,
                updatedAt: now
            };
            if (RECORDINGS_STORE) {
                await RECORDINGS_STORE.set(recordId, recording);
            }
            state.currentRecordingId = recordId;
            state.currentRecordingHasVideo = Boolean(state.videoBlob);
            if (state.currentMemoId && state.currentMemoId === memoId) {
                state.currentMemoRecordingId = recordId;
                state.currentMemoRecordingHasVideo = Boolean(state.videoBlob);
            }
            setRecordingForMemo(memoId, recordId);
            state.recordingMemoId = memoId;
            state.recordingMemoName = memoName || "";
            state.isTranscribing = false;
            if (state.transcriptionCountdownTimer) {
                clearInterval(state.transcriptionCountdownTimer);
                state.transcriptionCountdownTimer = null;
            }
            updateButton();
        } catch (err) {
            console.error("Transcription failed", err);
            hideTranscriptionToast();
            state.isTranscribing = false;
            if (state.transcriptionCountdownTimer) {
                clearInterval(state.transcriptionCountdownTimer);
                state.transcriptionCountdownTimer = null;
            }
            const now = Date.now();
            const duration = Math.max(0, durationSeconds || 0);
            const recordId = crypto?.randomUUID ? crypto.randomUUID() : `voice-${Date.now()}`;
            const fallbackRecording = {
                id: recordId,
                type: "voice-recording",
                audioBlob: state.audioBlob,
                videoBlob: state.videoBlob || null,
                audioTranscript: "",
                audioTranscriptSentences: [],
                videoTranscript: "",
                videoTranscriptSentences: [],
                duration,
                recordingDate: now,
                assemblyTranscriptId: null,
                assemblyLanguageCode: "fr",
                participants: [],
                subjects: [],
                createdAt: now,
                updatedAt: now
            };
            if (RECORDINGS_STORE) {
                try {
                    await RECORDINGS_STORE.set(recordId, fallbackRecording);
                } catch (storeErr) {
                    console.warn("Fallback recording save failed", storeErr);
                }
            }
            state.currentRecordingId = recordId;
            state.currentRecordingHasVideo = Boolean(state.videoBlob);
            if (state.currentMemoId && state.currentMemoId === memoId) {
                state.currentMemoRecordingId = recordId;
                state.currentMemoRecordingHasVideo = Boolean(state.videoBlob);
            }
            setRecordingForMemo(memoId, recordId);
            state.recordingMemoId = memoId;
            state.recordingMemoName = memoName || "";
            updateButton();
            throw err;
        }
    }

    async function openRecordingPlayer() {
        const recordingId = state.currentMemoRecordingId || state.currentRecordingId;
        if (!recordingId || !RECORDINGS_STORE) return;
        const recording = await RECORDINGS_STORE.get(recordingId);
        if (!recording) {
            showToast("Enregistrement introuvable.", true);
            return;
        }
        state.currentMemoRecordingHasVideo = Boolean(recording.videoBlob);
        state.currentRecordingId = recording.id;
        state.currentRecordingHasVideo = Boolean(recording.videoBlob);
        const memoName = state.currentMemoName || state.recordingMemoName || "";
        const handleDelete = async () => {
            if (!confirm("Supprimer cet enregistrement ?")) return;
            try {
                await RECORDINGS_STORE.remove(recording.id);
            } catch (err) {
                console.warn("Recording delete failed", err);
            }
            if (state.currentMemoId) {
                setRecordingForMemo(state.currentMemoId, null);
            }
            state.currentMemoRecordingId = null;
            state.currentMemoRecordingHasVideo = false;
            if (!state.isRecording || state.currentMemoId === state.recordingMemoId) {
                state.currentRecordingId = null;
                state.currentRecordingHasVideo = false;
            }
            updateButton();
        };
        const copyToClipboard = async text => {
            try {
                await navigator.clipboard.writeText(text || "");
                showToast("Transcript copié");
            } catch (err) {
                showToast("Erreur lors de la copie", true);
            }
        };
        if (recording.videoBlob && window.VoiceVideoPlayerModal) {
            if (!state.videoModal) {
                state.videoModal = new window.VoiceVideoPlayerModal();
            }
            const modalVideoBlob = (recording.id === state.currentRecordingId && state.videoBlob)
                ? state.videoBlob
                : recording.videoBlob;
            state.videoModal.onTranscriptChange = async sentences => {
                const updated = {
                    ...recording,
                    videoTranscriptSentences: sentences,
                    updatedAt: Date.now()
                };
                await RECORDINGS_STORE.set(recording.id, updated);
                recording.videoTranscriptSentences = sentences;
            };
            state.videoModal.onVideoExportCacheUpdate = async exportCache => {
                const updated = {
                    ...recording,
                    videoExportCache: exportCache || null,
                    updatedAt: Date.now()
                };
                await RECORDINGS_STORE.set(recording.id, updated);
                recording.videoExportCache = exportCache || null;
            };
            state.videoModal.open({
                videoBlob: modalVideoBlob,
                sentences: recording.videoTranscriptSentences || [],
                memoName,
                youtubeUrl: recording.youtubeVideoUrl || "",
                onTranscriptChange: state.videoModal.onTranscriptChange,
                persistedVideoExports: recording.videoExportCache || null,
                onVideoExportCacheUpdate: state.videoModal.onVideoExportCacheUpdate,
                onCopyAudio: () => copyToClipboard(recording.audioTranscript || ""),
                onCopyVideo: text => copyToClipboard(text || ""),
                onPublish: async ({ videoBlob, vtt }) => {
                    try {
                        const publisher = window.GoToolkitYouTubePublish;
                        if (!publisher?.publishVideo) {
                            throw new Error("Module YouTube indisponible");
                        }
                        const result = await publisher.publishVideo({
                            videoBlob,
                            vtt: vtt || "",
                            title: memoName || state.currentMemoName || "Document",
                            language: recording.assemblyLanguageCode || "fr"
                        });
                        const url = result?.videoUrl || "";
                        const updated = {
                            ...recording,
                            youtubeVideoUrl: url || "",
                            updatedAt: Date.now()
                        };
                        await RECORDINGS_STORE?.set?.(recording.id, updated);
                        recording.youtubeVideoUrl = url || "";
                        if (url) {
                            state.videoModal?.setYoutubeUrl?.(url);
                        }
                        if (url) {
                            window.open(url, "_blank", "noopener,noreferrer");
                            showToast("La vidéo a été publiée sur Youtube (non listée)");
                        } else {
                            showToast("La vidéo a été publiée sur Youtube (non listée)");
                        }
                    } catch (err) {
                        const message = err?.message ? String(err.message) : "Publication YouTube impossible";
                        showToast(message, true);
                    }
                },
                onDelete: async () => {
                    await handleDelete();
                    state.videoModal?.close();
                }
            });
            state.videoModal.startPlayback();
            return;
        }
        if (window.VoiceAudioPlayerModal) {
            if (!state.audioModal) {
                state.audioModal = new window.VoiceAudioPlayerModal();
            }
            state.audioModal.onTranscriptChange = async text => {
                const updated = {
                    ...recording,
                    audioTranscript: text,
                    updatedAt: Date.now()
                };
                await RECORDINGS_STORE.set(recording.id, updated);
                recording.audioTranscript = text;
            };
            state.audioModal.open({
                audioBlob: recording.audioBlob,
                transcriptText: recording.audioTranscript || "",
                memoName,
                onTranscriptChange: state.audioModal.onTranscriptChange,
                onDelete: async () => {
                    await handleDelete();
                    state.audioModal?.close();
                }
            });
        }
    }

    function handleButtonClick() {
        const isRecordingCurrentMemo = Boolean(
            state.isRecording && state.currentMemoId && state.recordingMemoId && state.currentMemoId === state.recordingMemoId
        );
        if (isRecordingCurrentMemo) {
            stopRecording();
            return;
        }
        if (state.currentMemoRecordingId) {
            openRecordingPlayer();
            return;
        }
        if (state.isRecording) {
            stopRecording();
            return;
        }
        requestPermissionsThenOverlay();
    }

    function ensureVoiceButton() {
        const launcher = document.querySelector(".feedback-app-launcher-row");
        const globalActions = document.querySelector(".global-actions");
        if (!launcher && !globalActions) return;
        if (state.voiceButton) return;
        let existingButton = document.querySelector(".go-toolkit-voice-button");
        if (existingButton) {
            state.voiceButton = existingButton;
            updateButton();
            return;
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "feedback-app-button btn btn-secondary app-header-btn chat-header-btn go-toolkit-voice-button";
        btn.title = "Enregistrer une conversation";
        btn.dataset.app = "voice";
        btn.innerHTML = '<i data-lucide="disc-3"></i><span>Enregistrer une conversation</span>';
        btn.addEventListener("click", handleButtonClick);
        const handoffBtn = document.getElementById("handoffFocusBtn");
        const themeMenuTrigger = document.getElementById("themeMenuTrigger");
        const globalActionsExtras = document.getElementById("globalActionsExtras");
        if (globalActionsExtras) {
            globalActionsExtras.appendChild(btn);
        } else if (globalActions && handoffBtn && handoffBtn.parentNode === globalActions) {
            globalActions.insertBefore(btn, handoffBtn.nextSibling);
        } else if (globalActions && themeMenuTrigger && themeMenuTrigger.parentNode === globalActions) {
            globalActions.insertBefore(btn, themeMenuTrigger);
        } else if (launcher) {
            launcher.appendChild(btn);
        } else if (globalActions) {
            globalActions.appendChild(btn);
        }
        state.voiceButton = btn;
        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }
        updateButton();
    }

    async function requestPermissionsThenOverlay() {
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.overlayStreams.audio = audioStream || null;
            state.permissionsGranted.audio = Boolean(audioStream);
            state.overlayMic = Boolean(state.overlayStreams.audio);
        } catch (err) {
            console.error("Microphone permission failed", err);
            state.overlayStreams.audio = null;
            state.permissionsGranted.audio = false;
            state.overlayMic = false;
            showToast("Microphone indisponible.", true);
        }

        if (!state.overlayStreams.screen && !state.overlayStreams.systemAudio) {
            try {
                const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                state.overlayStreams.screen = displayStream || null;
                state.permissionsGranted.screen = Boolean(displayStream);
                state.overlayScreen = Boolean(state.overlayStreams.screen);
                if (isStreamWithAudio(displayStream)) {
                    state.overlayStreams.systemAudio = displayStream;
                    state.permissionsGranted.systemAudio = true;
                    state.overlaySystemAudio = true;
                } else {
                    state.overlayStreams.systemAudio = null;
                    state.permissionsGranted.systemAudio = false;
                    state.overlaySystemAudio = false;
                }
            } catch (err) {
                console.error("Display media permission failed", err);
                state.overlayStreams.screen = null;
                state.overlayStreams.systemAudio = null;
                state.permissionsGranted.screen = false;
                state.permissionsGranted.systemAudio = false;
                state.overlayScreen = false;
                state.overlaySystemAudio = false;
                showToast("Capture d'écran indisponible.", true);
            }
        }

        state.overlayStreams.webcam = state.overlayStreams.webcam || null;
        state.overlayWebcam = Boolean(state.overlayStreams.webcam);
        if (voiceConfigState.disableCamera && enforceWebcamLock()) {
            syncOverlayTiles();
        }
        openOverlay();
    }

    function init() {
        if (state.sessionInitialized) return;
        state.sessionInitialized = true;
        ensureStyles();
        ensureVoiceButton();
        window.addEventListener("go-toolkit:voice-conversion-status", event => {
            const running = Boolean(event?.detail?.running);
            if (state.conversionRunning === running) return;
            state.conversionRunning = running;
            updateButton();
        });
        const observer = new MutationObserver(() => ensureVoiceButton());
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener("beforeunload", event => {
            if (!state.isRecording) return;
            event.preventDefault();
            event.returnValue = "";
        });
        const activeMemo = window.GoToolkitMemoVoice?.getActiveMemo?.();
        if (activeMemo) {
            setCurrentMemo(activeMemo.title || "", activeMemo.id);
        }
    }

    function setCurrentMemo(memoName, memoId) {
        state.currentMemoId = memoId || null;
        state.currentMemoName = memoName || "";
        state.currentMemoRecordingId = null;
        state.currentMemoRecordingHasVideo = false;
        if (memoId) {
            getRecordingForMemo(memoId).then(recording => {
                if (!state.currentMemoId || state.currentMemoId !== memoId) return;
                if (recording) {
                    state.currentMemoRecordingId = recording.id;
                    state.currentMemoRecordingHasVideo = Boolean(recording.videoBlob);
                    if (!state.isRecording || memoId === state.recordingMemoId) {
                        state.currentRecordingId = recording.id;
                        state.currentRecordingHasVideo = Boolean(recording.videoBlob);
                    }
                } else {
                    state.currentMemoRecordingId = null;
                    state.currentMemoRecordingHasVideo = false;
                    if (!state.isRecording || memoId === state.recordingMemoId) {
                        state.currentRecordingId = null;
                        state.currentRecordingHasVideo = false;
                    }
                }
                updateButton();
            });
            return;
        }
        if (!state.isRecording) {
            state.currentRecordingId = null;
            state.currentRecordingHasVideo = false;
        }
        updateButton();
    }

    function getCurrentRecording() {
        if (!state.currentRecordingId || !RECORDINGS_STORE) return Promise.resolve(null);
        return RECORDINGS_STORE.get(state.currentRecordingId);
    }

    function getCurrentState() {
        const duration = state.isRecording ? Math.floor((Date.now() - state.recordingStartTime) / 1000) : 0;
        return {
            recordingMemoId: state.recordingMemoId,
            recordingMemoName: state.recordingMemoName,
            isRecording: state.isRecording,
            recordingDuration: duration
        };
    }

    function destroy() {
        resetSessionState();
        state.overlay?.remove();
        state.overlay = null;
        state.voiceButton?.remove();
        state.voiceButton = null;
    }

    (function initializeVoiceConfig() {
        const siteConfig = window.GoToolkitSiteConfig;
        if (siteConfig && typeof siteConfig.getData === "function") {
            applyVoiceConfig(siteConfig.getData());
        }
        const promise = window.GoToolkitSiteConfigPromise;
        if (promise && typeof promise.then === "function") {
            promise.then(config => applyVoiceConfig(config || {})).catch(() => {
                applyVoiceConfig(siteConfig?.getData?.());
            });
        }
    })();

    window.GoToolkitVoice = {
        open: openOverlay,
        startRecording,
        stopRecording,
        pauseRecording: stopRecording,
        getCurrentState,
        setCurrentMemo,
        getCurrentRecording,
        setRecordingForMemo,
        getRecordingForMemo,
        destroy
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
