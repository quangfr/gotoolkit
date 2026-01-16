(function () {
    "use strict";

    const STORAGE_KEY = "go-toolkit-assemblyai-key";
    const ASSEMBLY_PROXY_TOKEN_URL = (window.GO_TOOLKIT_ASSEMBLYAI_TOKEN_URL || "https://assemblyai.gotoolkit.workers.dev/token").replace(/\/$/, "");
    const ASSEMBLY_PROXY_BASE_URL = ASSEMBLY_PROXY_TOKEN_URL.replace(/\/token\/?$/i, "").replace(/\/$/, "") || ASSEMBLY_PROXY_TOKEN_URL;
    const RECORDINGS_STORE = window.goToolkitDocStore?.createStore
        ? window.goToolkitDocStore.createStore("voice-recordings")
        : null;

    const state = {
        currentMemoId: null,
        currentMemoName: "",
        recordingMemoId: null,
        recordingMemoName: "",
        currentRecordingId: null,
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
        overlayStreams: {
            audio: null,
            webcam: null,
            screen: null
        },
        permissionsGranted: {
            audio: false,
            webcam: false,
            screen: false
        },
        toast: null,
        voiceButton: null,
        audioModal: null,
        videoModal: null,
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
            }
            .voice-overlay__tile-label {
                position: relative;
                z-index: 2;
                padding: 8px 10px;
                backdrop-filter: blur(4px);
                background: rgba(0, 0, 0, 0.35);
                border-radius: 10px;
                font-size: 18px;
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
                left: 16px;
                bottom: 70px;
                background: var(--bg-surface);
                color: var(--white);
                padding: 8px 12px;
                border-radius: 10px;
                font-size: 12px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
                z-index: 9999;
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
        state.toast.style.background = isError ? "var(--intent-error-border)" : "var(--bg-surface)";
        state.toast.classList.add("visible");
        clearTimeout(state.toast._timer);
        state.toast._timer = setTimeout(() => state.toast.classList.remove("visible"), 2400);
    }

    // Spinner frames for transcription toaster (same as chat send-btn)
    const transcriptionSpinnerFrames = ["◴", "◷", "◶", "◵"];
    let transcriptionToastTimer = null;

    function showTranscriptionToast(durationSeconds, remainingSeconds) {
        if (!state.toast) {
            state.toast = document.createElement("div");
            state.toast.className = "go-toolkit-voice-toast";
            document.body.appendChild(state.toast);
        }

        // Clear any existing timer
        if (transcriptionToastTimer) {
            clearInterval(transcriptionToastTimer);
            transcriptionToastTimer = null;
        }

        let frameIndex = 0;
        const updateToast = () => {
            const frame = transcriptionSpinnerFrames[frameIndex % 4];
            frameIndex++;

            const mins = Math.floor(remainingSeconds / 60);
            const secs = remainingSeconds % 60;
            const timeStr = (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;

            state.toast.innerHTML = frame + " Transcription en cours (" + timeStr + ")";
            state.toast.style.background = "var(--bg-surface)";
            state.toast.classList.add("visible");
        };

        updateToast();

        transcriptionToastTimer = setInterval(() => {
            remainingSeconds--;
            if (remainingSeconds <= 0) {
                // Reset countdown when it reaches 0
                remainingSeconds = Math.max(15, Math.round(durationSeconds / 12));
            }
            updateToast();
        }, 1000);

        // Auto-hide after a reasonable time (5 minutes max)
        setTimeout(() => {
            if (transcriptionToastTimer) {
                clearInterval(transcriptionToastTimer);
                transcriptionToastTimer = null;
                if (state.toast) {
                    state.toast.classList.remove("visible");
                }
            }
        }, 300000);
    }

    function hideTranscriptionToast() {
        if (transcriptionToastTimer) {
            clearInterval(transcriptionToastTimer);
            transcriptionToastTimer = null;
        }
        if (state.toast) {
            state.toast.classList.remove("visible");
        }
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
        const payload = {
            audio_url: uploadUrl,
            auto_chapters: true,
            filter_profanity: true,
            speaker_labels: true,
            language_detection: true,
            language_detection_options: {
                expected_languages: ["en", "fr"],
                fallback_language: "fr"
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
        if (state.isTranscribing) {
            const countdown = Math.max(1, state.transcriptionCountdown || 1);
            return `◴ ${countdown}s`;
        }
        if (state.isRecording) {
            const duration = Math.floor((Date.now() - state.recordingStartTime) / 1000);
            const timeLabel = formatDuration(duration);
            if (state.currentMemoId && state.recordingMemoId && state.currentMemoId !== state.recordingMemoId) {
                const memoLabel = state.recordingMemoName ? ` (${state.recordingMemoName})` : "";
                return `■ ${timeLabel}${memoLabel}`;
            }
            return `■ ${timeLabel}`;
        }
        if (state.currentRecordingId) {
            if (state.currentMemoId && state.recordingMemoId && state.currentMemoId !== state.recordingMemoId) {
                const memoLabel = state.recordingMemoName ? ` (${state.recordingMemoName})` : "";
                return `▶${memoLabel}`;
            }
            return "▶";
        }
        return '<i data-lucide="mic"></i>';
    }

    function updateButton() {
        if (!state.voiceButton) return;
        state.voiceButton.innerHTML = buildButtonLabel();
        state.voiceButton.classList.toggle("is-recording", state.isRecording);
        if (window.lucide) lucide.createIcons();
    }

    function updateTimer() {
        updateButton();
    }

    function resetSessionState() {
        state.currentRecordingId = null;
        state.recordingMemoId = null;
        state.recordingMemoName = "";
        state.isRecording = false;
        state.isTranscribing = false;
        state.recordingStartTime = 0;
        if (state.transcriptionCountdownTimer) {
            clearInterval(state.transcriptionCountdownTimer);
            state.transcriptionCountdownTimer = null;
        }
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = null;
        }
        stopOverlayStreams();
        updateButton();
    }

    function closeOverlay() {
        if (state.overlay) {
            state.overlay.classList.remove("visible");
        }
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
            tile.addEventListener("click", () => {
                const kind = tile.dataset.kind;
                if (kind === "webcam" && voiceConfigState.disableCamera) {
                    showToast("Caméra désactivée dans la configuration.", true);
                    return;
                }
                if (kind === "mic") state.overlayMic = !state.overlayMic;
                if (kind === "webcam") state.overlayWebcam = !state.overlayWebcam;
                if (kind === "screen") state.overlayScreen = !state.overlayScreen;
                syncOverlayTiles();
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
                || (kind === "webcam" && state.overlayWebcam)
                || (kind === "screen" && state.overlayScreen);
            tile.classList.toggle("voice-overlay__tile--active", active);
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
    }

    function openOverlay() {
        ensureOverlay();
        attachOverlayStreams();
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
            showToast("Mémo introuvable.", true);
            return;
        }
        state.recordingMemoId = memoId;
        state.recordingMemoName = memoName || "";
        state.audioChunks = [];
        state.videoChunks = [];
        state.audioBlob = null;
        state.videoBlob = null;
        state.recordingStartTime = Date.now();
        try {
            let audioStream = state.overlayStreams.audio;
            let webcamStream = state.overlayStreams.webcam;
            let screenStream = state.overlayStreams.screen;
            if (!audioStream) {
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                state.overlayStreams.audio = audioStream;
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
            if (!audioStream) {
                showToast("Microphone indisponible.", true);
                return;
            }
            state.audioRecorder = new MediaRecorder(audioStream);
            state.audioRecorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) {
                    state.audioChunks.push(event.data);
                }
            };
            state.audioRecorder.start();
            if (videoStream) {
                const combinedTracks = [
                    ...(videoStream.getVideoTracks() || []),
                    ...(audioStream.getAudioTracks() || [])
                ];
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

    function stopOverlayStreams() {
        ["audio", "webcam", "screen"].forEach(key => {
            const stream = state.overlayStreams[key];
            if (!stream) return;
            stream.getTracks().forEach(track => {
                try { track.stop(); } catch (err) { /* noop */ }
            });
            state.overlayStreams[key] = null;
        });
        clearVideoTile("webcam");
        clearVideoTile("screen");
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
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = null;
        }
        await stopRecorder(state.audioRecorder);
        await stopRecorder(state.videoRecorder);
        stopTracks(state.audioRecorder);
        stopTracks(state.videoRecorder);
        stopOverlayStreams();
        state.audioBlob = state.audioChunks.length
            ? new Blob(state.audioChunks, { type: state.audioChunks[0]?.type || "audio/webm" })
            : null;
        state.videoBlob = state.videoChunks.length
            ? new Blob(state.videoChunks, { type: state.videoChunks[0]?.type || "video/webm" })
            : null;
        state.audioRecorder = null;
        state.videoRecorder = null;
        updateButton();
        if (!state.audioBlob) {
            showToast("Aucun audio capturé.", true);
            resetSessionState();
            return;
        }
        const durationSeconds = Math.floor((Date.now() - state.recordingStartTime) / 1000);
        state.isTranscribing = true;
        startTranscriptionCountdown(durationSeconds);
        try {
            await transcribeAndStore(durationSeconds);
        } catch (err) {
            showToast("Transcription impossible", true);
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
            await pollAssemblyTranscript(transcriptId, assemblyKey);

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
                showToast("Transcription copiée");
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
                participants: [],
                subjects: [],
                createdAt: now,
                updatedAt: now
            };
            if (RECORDINGS_STORE) {
                await RECORDINGS_STORE.set(recordId, recording);
            }
            state.currentRecordingId = recordId;
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
            state.isTranscribing = false;
            if (state.transcriptionCountdownTimer) {
                clearInterval(state.transcriptionCountdownTimer);
                state.transcriptionCountdownTimer = null;
            }
            resetSessionState();
            throw err;
        }
    }

    async function openRecordingPlayer() {
        if (!state.currentRecordingId || !RECORDINGS_STORE) return;
        const recording = await RECORDINGS_STORE.get(state.currentRecordingId);
        if (!recording) {
            showToast("Enregistrement introuvable.", true);
            return;
        }
        const memoName = state.recordingMemoName || "";
        const handleDelete = async () => {
            if (!confirm("Supprimer cet enregistrement ?")) return;
            try {
                await RECORDINGS_STORE.remove(recording.id);
            } catch (err) {
                console.warn("Recording delete failed", err);
            }
            if (state.recordingMemoId) {
                setRecordingForMemo(state.recordingMemoId, null);
            }
            state.currentRecordingId = null;
            state.recordingMemoId = null;
            state.recordingMemoName = "";
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
            state.videoModal.onTranscriptChange = async sentences => {
                const updated = {
                    ...recording,
                    videoTranscriptSentences: sentences,
                    updatedAt: Date.now()
                };
                await RECORDINGS_STORE.set(recording.id, updated);
                recording.videoTranscriptSentences = sentences;
            };
            state.videoModal.open({
                videoBlob: recording.videoBlob,
                sentences: recording.videoTranscriptSentences || [],
                memoName,
                onTranscriptChange: state.videoModal.onTranscriptChange,
                onCopyAudio: () => copyToClipboard(recording.audioTranscript || ""),
                onCopyVideo: text => copyToClipboard(text || ""),
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
        if (state.isRecording) {
            stopRecording();
            return;
        }
        if (state.currentRecordingId) {
            openRecordingPlayer();
            return;
        }
        requestPermissionsThenOverlay();
    }

    function ensureVoiceButton() {
        const launcher = document.querySelector(".feedback-app-launcher-row");
        if (!launcher) return;
        if (state.voiceButton) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "feedback-app-button go-toolkit-voice-button";
        btn.title = "Enregistrer une conversation";
        btn.textContent = "◉";
        btn.addEventListener("click", handleButtonClick);
        launcher.appendChild(btn);
        state.voiceButton = btn;
        updateButton();
    }

    async function requestPermissionsThenOverlay() {
        if (state.overlayStreams.audio) {
            openOverlay();
            return;
        }
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.overlayStreams.audio = audioStream || null;
            state.overlayStreams.webcam = state.overlayStreams.webcam || null;
            state.overlayStreams.screen = state.overlayStreams.screen || null;
            state.permissionsGranted.audio = Boolean(audioStream);
            state.overlayMic = Boolean(state.overlayStreams.audio);
            state.overlayWebcam = Boolean(state.overlayStreams.webcam);
            state.overlayScreen = Boolean(state.overlayStreams.screen);
            if (!state.overlayStreams.audio) {
                showToast("Microphone indisponible.", true);
                return;
            }
            if (voiceConfigState.disableCamera && enforceWebcamLock()) {
                syncOverlayTiles();
            }
            openOverlay();
        } catch (err) {
            console.error("Permissions failed", err);
            showToast("Autorisation refusée.", true);
        }
    }

    function init() {
        if (state.sessionInitialized) return;
        state.sessionInitialized = true;
        ensureStyles();
        ensureVoiceButton();
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
        if (!state.isRecording && memoId) {
            getRecordingForMemo(memoId).then(recording => {
                if (recording) {
                    state.currentRecordingId = recording.id;
                    state.recordingMemoId = memoId;
                    state.recordingMemoName = memoName || "";
                }
                updateButton();
            });
            return;
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
