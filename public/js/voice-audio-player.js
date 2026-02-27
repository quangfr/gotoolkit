(function () {
    const STYLE_ID = "voice-audio-player-styles";
    const VOICE_RECORDING_SPEED_STORAGE_KEY = "go-toolkit-voice-recording-speed";
    const AUDIO_CACHE_DB = "goToolkit.mobile.audio.cache";
    const AUDIO_CACHE_STORE = "audio";
    const AUDIO_CACHE_MP3_KEY = "voice-latest-mp3";

    function normalizeVoiceRecordingSpeed(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 1.2;
        const rounded = Math.round(numeric * 10) / 10;
        return Math.min(4, Math.max(0.4, rounded));
    }

    function getConfiguredVoiceRecordingSpeed() {
        const globalSpeed = window.GoToolkitVoiceRecordingSpeed;
        if (globalSpeed != null) return normalizeVoiceRecordingSpeed(globalSpeed);
        try {
            const fromLocal = localStorage.getItem(VOICE_RECORDING_SPEED_STORAGE_KEY);
            if (fromLocal) return normalizeVoiceRecordingSpeed(fromLocal);
        } catch (err) { /* noop */ }
        const fromConfig = window.GoToolkitSiteConfig?.get?.("voice.recordingSpeed", null);
        if (fromConfig != null) return normalizeVoiceRecordingSpeed(fromConfig);
        return 1.2;
    }

    let lameLoaderPromise = null;
    function ensureLameJsLoaded() {
        if (window.lamejs?.Mp3Encoder) return Promise.resolve(window.lamejs);
        if (lameLoaderPromise) return lameLoaderPromise;
        lameLoaderPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-go-lamejs="1"]');
            if (existing) {
                existing.addEventListener("load", () => resolve(window.lamejs || null), { once: true });
                existing.addEventListener("error", () => reject(new Error("Chargement lamejs échoué")), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
            script.async = true;
            script.dataset.goLamejs = "1";
            script.onload = () => {
                if (window.lamejs?.Mp3Encoder) {
                    resolve(window.lamejs);
                } else {
                    reject(new Error("lamejs indisponible"));
                }
            };
            script.onerror = () => reject(new Error("Chargement lamejs échoué"));
            document.head.appendChild(script);
        });
        return lameLoaderPromise;
    }

    function float32ToInt16(floatArray) {
        const out = new Int16Array(floatArray.length);
        for (let index = 0; index < floatArray.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, floatArray[index] || 0));
            out[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        return out;
    }

    function encodePcmToMp3(leftPcm, rightPcm, sampleRate) {
        const channels = rightPcm ? 2 : 1;
        const encoder = new window.lamejs.Mp3Encoder(channels, sampleRate, 128);
        const chunkSize = 1152;
        const chunks = [];
        for (let offset = 0; offset < leftPcm.length; offset += chunkSize) {
            const leftChunk = leftPcm.subarray(offset, offset + chunkSize);
            const mp3buf = rightPcm
                ? encoder.encodeBuffer(leftChunk, rightPcm.subarray(offset, offset + chunkSize))
                : encoder.encodeBuffer(leftChunk);
            if (mp3buf?.length) chunks.push(new Uint8Array(mp3buf));
        }
        const end = encoder.flush();
        if (end?.length) chunks.push(new Uint8Array(end));
        return new Blob(chunks, { type: "audio/mpeg" });
    }

    async function convertAudioBlobToMp3(inputBlob) {
        if (!(inputBlob instanceof Blob)) throw new Error("Audio invalide");
        await ensureLameJsLoaded();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        try {
            const arrayBuffer = await inputBlob.arrayBuffer();
            const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            const sampleRate = Math.round(decoded.sampleRate || 44100);
            const supportedRates = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
            if (!supportedRates.has(sampleRate)) {
                throw new Error("Fréquence audio non supportée pour MP3");
            }
            const left = float32ToInt16(decoded.getChannelData(0));
            const right = decoded.numberOfChannels > 1 ? float32ToInt16(decoded.getChannelData(1)) : null;
            return encodePcmToMp3(left, right, sampleRate);
        } finally {
            audioContext.close().catch(() => { });
        }
    }

    function openAudioCacheDb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === "undefined") {
                reject(new Error("IndexedDB indisponible"));
                return;
            }
            const request = indexedDB.open(AUDIO_CACHE_DB, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
                    db.createObjectStore(AUDIO_CACHE_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible"));
        });
    }

    async function saveAudioBlobToIndexedDb(audioBlob, filename, cacheKey = AUDIO_CACHE_MP3_KEY) {
        if (!(audioBlob instanceof Blob)) return false;
        try {
            const db = await openAudioCacheDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(AUDIO_CACHE_STORE, "readwrite");
                const store = tx.objectStore(AUDIO_CACHE_STORE);
                store.put(
                    {
                        blob: audioBlob,
                        filename: String(filename || "recording.mp3"),
                        mimeType: audioBlob.type || "audio/mpeg",
                        updatedAt: new Date().toISOString()
                    },
                    String(cacheKey || AUDIO_CACHE_MP3_KEY)
                );
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error("Écriture IndexedDB impossible"));
            });
            db.close();
            return true;
        } catch (err) {
            return false;
        }
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .voice-audio-player-modal {
                position: fixed;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                font-family: "Inter", system-ui, sans-serif;
            }
            .voice-audio-player-modal--open {
                display: flex;
            }
            body.voice-audio-player-modal-open {
                overflow: hidden;
            }
            .voice-audio-player-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(15, 23, 42, 0.65);
                backdrop-filter: blur(12px);
            }
            .voice-audio-player-dialog {
                position: relative;
                width: min(92vw, 600px);
                height: min(92vh, 900px);
                background: var(--bg-surface);
                border-radius: 20px;
                padding: 20px;
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
                z-index: 1;
                display: flex;
                flex-direction: column;
                gap: 14px;
                overflow: hidden;
            }
            .voice-audio-player-close {
                position: absolute;
                top: 14px;
                right: 16px;
                border: none;
                background: none;
                font-size: 22px;
                cursor: pointer;
                color: var(--text-main);
            }
            .voice-audio-player-header {
                display: flex;
                flex-direction: column;
                gap: 4px;
                padding-right: 34px;
            }
            .voice-audio-player-header-row {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .voice-audio-player-title {
                font-weight: 600;
                font-size: 15px;
                color: var(--text-main);
            }
            .voice-audio-player-subtitle {
                font-size: 12px;
                color: var(--text-muted);
            }
            .voice-audio-player-delete {
                margin-left: auto;
                border: none;
                background: transparent;
                font-size: 13px;
                color: var(--intent-error-border);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .voice-audio-player-download {
                border: none;
                background: transparent;
                font-size: 13px;
                color: var(--text-main);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .voice-audio-player-delete svg {
                width: 16px;
                height: 16px;
            }
            .voice-audio-player-download svg {
                width: 16px;
                height: 16px;
            }
            .voice-audio-player-download-format {
                border: 1px solid var(--border-strong);
                border-radius: 999px;
                background: var(--bg-surface);
                color: var(--text-main);
                font-size: 12px;
                padding: 0 10px;
                height: 30px;
                cursor: pointer;
            }
            .voice-audio-player-controls {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .voice-audio-player-play-toggle {
                border: 1px solid var(--border-strong);
                border-radius: 8px;
                width: 36px;
                height: 36px;
                background: transparent;
                cursor: pointer;
                font-size: 16px;
                color: var(--text-main);
            }
            .voice-audio-player-speed {
                border: 1px solid var(--border-strong);
                border-radius: 999px;
                background: var(--bg-surface);
                color: var(--text-main);
                font-size: 13px;
                padding: 0 8px;
                height: 32px;
                cursor: pointer;
            }
            .voice-audio-player-progress {
                flex: 1;
                appearance: none;
                height: 6px;
                border-radius: 6px;
                background: var(--border-main);
                outline: none;
            }
            .voice-audio-player-progress::-webkit-slider-thumb {
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--color-primary);
                border: 2px solid var(--white);
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
            }
            .voice-audio-player-progress::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--color-primary);
                border: 2px solid var(--white);
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
            }
            .voice-audio-player-time {
                font-size: 12px;
                color: var(--text-muted);
                min-width: 110px;
                text-align: right;
            }
            .voice-audio-player-textarea {
                flex: 1;
                width: 100%;
                min-height: 220px;
                border-radius: 14px;
                border: 1px solid var(--border-strong);
                padding: 12px;
                font-size: 13px;
                line-height: 1.5;
                resize: vertical;
            }
            @media (max-width: 720px) {
                .voice-audio-player-controls {
                    flex-wrap: wrap;
                }
                .voice-audio-player-time {
                    min-width: 90px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function formatTime(value = 0) {
        if (!Number.isFinite(value) || value < 0) return "00:00";
        const total = Math.floor(value);
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function formatBytes(value) {
        const bytes = Number(value || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return "0.0 MB";
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    class VoiceAudioPlayerModal {
        constructor() {
            this.onTranscriptChange = null;
            this.onPlaybackRateChange = null;
            this.audioBlob = null;
            this.audioBlobUrl = "";
            this.audioMp3Blob = null;
            this.audioMp3Pending = false;
            ensureStyles();
            this._buildDom();
            this._bindEvents();
        }

        _buildDom() {
            this.overlay = document.createElement("div");
            this.overlay.className = "voice-audio-player-modal";
            this.overlay.setAttribute("aria-hidden", "true");
            this.overlay.innerHTML = `
                <div class="voice-audio-player-backdrop"></div>
                <div class="voice-audio-player-dialog" role="dialog" aria-modal="true" aria-label="Lecteur audio">
                    <button type="button" class="voice-audio-player-close" aria-label="Fermer">×</button>
                    <div class="voice-audio-player-header">
                        <div class="voice-audio-player-header-row">
                            <div class="voice-audio-player-title">Transcription audio</div>
                            <select class="voice-audio-player-download-format" aria-label="Format de téléchargement"></select>
                            <button type="button" class="voice-audio-player-download btn btn-secondary" title="Télécharger" aria-label="Télécharger l'audio"><i data-lucide="download"></i></button>
                            <button type="button" class="voice-audio-player-delete btn btn-secondary" title="Supprimer"><i data-lucide="trash-2"></i></button>
                        </div>
                        <div class="voice-audio-player-subtitle"></div>
                    </div>
                    <div class="voice-audio-player-controls">
                        <select class="voice-audio-player-speed" aria-label="Vitesse de lecture"></select>
                        <button type="button" class="voice-audio-player-play-toggle" title="Lecture" aria-label="Lecture">▶</button>
                        <input type="range" min="0" max="1" step="0.001" value="0" class="voice-audio-player-progress">
                        <span class="voice-audio-player-time">00:00 / 00:00</span>
                    </div>
                    <textarea class="voice-audio-player-textarea" spellcheck="false"></textarea>
                    <audio preload="metadata"></audio>
                </div>
            `;
            (document.body || document.documentElement).appendChild(this.overlay);
            this.dialog = this.overlay.querySelector(".voice-audio-player-dialog");
            this.closeButton = this.overlay.querySelector(".voice-audio-player-close");
            this.audioEl = this.overlay.querySelector("audio");
            this.playToggle = this.overlay.querySelector(".voice-audio-player-play-toggle");
            this.speedSelect = this.overlay.querySelector(".voice-audio-player-speed");
            this.progress = this.overlay.querySelector(".voice-audio-player-progress");
            this.timeLabel = this.overlay.querySelector(".voice-audio-player-time");
            this.textarea = this.overlay.querySelector(".voice-audio-player-textarea");
            this.subtitle = this.overlay.querySelector(".voice-audio-player-subtitle");
            this.deleteButton = this.overlay.querySelector(".voice-audio-player-delete");
            this.downloadButton = this.overlay.querySelector(".voice-audio-player-download");
            this.downloadFormatSelect = this.overlay.querySelector(".voice-audio-player-download-format");
            if (this.speedSelect) {
                this.speedSelect.innerHTML = "";
                for (let speed = 0.4; speed <= 4.001; speed += 0.2) {
                    const rate = Math.round(speed * 10) / 10;
                    const option = document.createElement("option");
                    option.value = rate.toFixed(1);
                    option.textContent = `${rate.toFixed(1)}x`;
                    this.speedSelect.appendChild(option);
                }
                this.speedSelect.value = normalizeVoiceRecordingSpeed(getConfiguredVoiceRecordingSpeed()).toFixed(1);
                this._applyPlaybackRate();
            }
            this._refreshDownloadFormatOptions();
        }

        _bindEvents() {
            this.closeButton?.addEventListener("click", () => this.close());
            this.playToggle?.addEventListener("click", () => this._togglePlayback());
            this.progress?.addEventListener("input", () => {
                if (!this.audioEl || !this.audioEl.duration) return;
                const ratio = Number(this.progress.value) || 0;
                this.audioEl.currentTime = ratio * this.audioEl.duration;
            });
            this.speedSelect?.addEventListener("change", () => this._applyPlaybackRate(true));
            window.addEventListener("go-toolkit:voice-recording-speed-changed", event => {
                this.setPlaybackRate(event?.detail?.speed, { emitChange: false });
            });
            this.audioEl?.addEventListener("timeupdate", () => this._updateProgress());
            this.audioEl?.addEventListener("loadedmetadata", () => this._updateProgress(true));
            this.audioEl?.addEventListener("play", () => this._updatePlayButton());
            this.audioEl?.addEventListener("pause", () => this._updatePlayButton());
            this.audioEl?.addEventListener("ended", () => this._updatePlayButton());
            this.textarea?.addEventListener("input", () => {
                if (!this.onTranscriptChange) return;
                this.onTranscriptChange(this.textarea.value || "");
            });
            this.textarea?.addEventListener("focus", async () => {
                try {
                    await navigator.clipboard.writeText(this.textarea.value || "");
                    showToast("Transcript copié");
                } catch (err) {
                    showToast("Erreur lors de la copie", true);
                }
            });
            this.deleteButton?.addEventListener("click", () => {
                if (!this.onDelete) return;
                this.onDelete();
            });
            this.downloadButton?.addEventListener("click", () => {
                if (!this.audioBlob) return;
                const selectedFormat = String(this.downloadFormatSelect?.value || "webm").toLowerCase();
                const sourceBlob = selectedFormat === "mp3" ? (this.audioMp3Blob || this.audioBlob) : this.audioBlob;
                const extension = selectedFormat === "mp3" ? "mp3" : "webm";
                const url = URL.createObjectURL(sourceBlob);
                const anchor = document.createElement("a");
                anchor.href = url;
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                anchor.download = `recording-${stamp}.${extension}`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                setTimeout(() => URL.revokeObjectURL(url), 0);
            });
            this.downloadFormatSelect?.addEventListener("change", () => {
                const selectedFormat = String(this.downloadFormatSelect?.value || "webm").toLowerCase();
                if (selectedFormat === "mp3") {
                    this._ensureMp3Blob();
                }
            });
            document.addEventListener("keydown", event => {
                if (!this.overlay?.classList?.contains("voice-audio-player-modal--open")) return;
                if (event.key === "Escape") {
                    this.close();
                }
            });
        }

        _togglePlayback() {
            if (!this.audioEl) return;
            if (this.audioEl.paused) {
                this.audioEl.play().catch(() => { });
            } else {
                this.audioEl.pause();
            }
        }

        _updatePlayButton() {
            if (!this.playToggle || !this.audioEl) return;
            const isPaused = this.audioEl.paused;
            this.playToggle.textContent = isPaused ? "▶" : "⏸";
            this.playToggle.title = isPaused ? "Lecture" : "Pause";
            this.playToggle.setAttribute("aria-label", isPaused ? "Lecture" : "Pause");
        }

        _updateProgress(reset = false) {
            if (!this.audioEl || !this.progress || !this.timeLabel) return;
            const duration = Number(this.audioEl.duration || 0);
            const current = reset ? 0 : Number(this.audioEl.currentTime || 0);
            this.progress.value = duration ? String(current / duration) : "0";
            this.timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        }

        _applyPlaybackRate(triggerCallback = false) {
            if (!this.audioEl || !this.speedSelect) return;
            const rate = normalizeVoiceRecordingSpeed(this.speedSelect.value);
            this.speedSelect.value = rate.toFixed(1);
            this.audioEl.playbackRate = rate;
            if (triggerCallback && typeof this.onPlaybackRateChange === "function") {
                this.onPlaybackRateChange(rate);
            }
        }

        setPlaybackRate(value, { emitChange = false } = {}) {
            if (!this.speedSelect) return;
            const rate = normalizeVoiceRecordingSpeed(value);
            this.speedSelect.value = rate.toFixed(1);
            this._applyPlaybackRate(emitChange);
        }

        _applyAudioBlob(blob) {
            if (!this.audioEl || !blob) return;
            this.audioBlob = blob;
            this.audioMp3Blob = null;
            this.audioMp3Pending = false;
            if (this.audioBlobUrl) {
                URL.revokeObjectURL(this.audioBlobUrl);
                this.audioBlobUrl = "";
            }
            this.audioBlobUrl = URL.createObjectURL(blob);
            this.audioEl.src = this.audioBlobUrl;
            this.audioEl.load();
            this._updateProgress(true);
            this._updatePlayButton();
            this._refreshDownloadFormatOptions();
            this._ensureMp3Blob();
        }

        async _ensureMp3Blob() {
            if (!this.audioBlob || this.audioMp3Blob || this.audioMp3Pending) {
                this._refreshDownloadFormatOptions();
                return;
            }
            this.audioMp3Pending = true;
            this._refreshDownloadFormatOptions();
            try {
                this.audioMp3Blob = await convertAudioBlobToMp3(this.audioBlob);
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                await saveAudioBlobToIndexedDb(this.audioMp3Blob, `recording-${stamp}.mp3`, AUDIO_CACHE_MP3_KEY);
                this._refreshDownloadFormatOptions();
            } catch (err) {
                this.audioMp3Blob = null;
                this._refreshDownloadFormatOptions();
                showToast("Conversion MP3 indisponible", true);
            } finally {
                this.audioMp3Pending = false;
                this._refreshDownloadFormatOptions();
            }
        }

        _refreshDownloadFormatOptions() {
            if (!this.downloadFormatSelect) return;
            const webmSize = this.audioBlob ? formatBytes(this.audioBlob.size) : "0.0 MB";
            const mp3Size = this.audioMp3Blob ? formatBytes(this.audioMp3Blob.size) : webmSize;
            const current = String(this.downloadFormatSelect.value || "webm").toLowerCase();
            this.downloadFormatSelect.innerHTML = "";
            const webmOption = document.createElement("option");
            webmOption.value = "webm";
            webmOption.textContent = `WebM (${webmSize})`;
            this.downloadFormatSelect.appendChild(webmOption);
            const mp3Option = document.createElement("option");
            mp3Option.value = "mp3";
            if (this.audioMp3Pending) {
                mp3Option.textContent = "MP3 (conversion...)";
            } else {
                mp3Option.textContent = `MP3 (${mp3Size})`;
            }
            this.downloadFormatSelect.appendChild(mp3Option);
            this.downloadFormatSelect.value = current === "mp3" ? "mp3" : "webm";
        }

        open(options = {}) {
            const { audioBlob, transcriptText = "", memoName = "", onTranscriptChange, onDelete } = options;
            if (!audioBlob) return;
            this.onTranscriptChange = typeof onTranscriptChange === "function" ? onTranscriptChange : null;
            this.onDelete = typeof onDelete === "function" ? onDelete : null;
            if (this.textarea) this.textarea.value = transcriptText || "";
            if (this.subtitle) {
                this.subtitle.textContent = memoName ? `Docs: ${memoName}` : "";
            }
            this._applyAudioBlob(audioBlob);
            this.setPlaybackRate(getConfiguredVoiceRecordingSpeed(), { emitChange: false });
            this.overlay.classList.add("voice-audio-player-modal--open");
            this.overlay.setAttribute("aria-hidden", "false");
            document.body?.classList.add("voice-audio-player-modal-open");
            if (window.lucide) lucide.createIcons();
        }

        close() {
            if (!this.overlay?.classList?.contains("voice-audio-player-modal--open")) return;
            this.overlay.classList.remove("voice-audio-player-modal--open");
            this.overlay.setAttribute("aria-hidden", "true");
            document.body?.classList.remove("voice-audio-player-modal-open");
            if (this.audioEl) {
                this.audioEl.pause();
                this.audioEl.removeAttribute("src");
                this.audioEl.load();
            }
            if (this.audioBlobUrl) {
                URL.revokeObjectURL(this.audioBlobUrl);
                this.audioBlobUrl = "";
            }
            this.audioBlob = null;
        }
    }

    function showToast(message, isError) {
        let toast = document.querySelector(".go-toolkit-voice-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.className = "go-toolkit-voice-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.background = isError ? "rgba(176, 0, 32, 0.95)" : "rgba(15, 23, 42, 0.95)";
        toast.classList.add("visible");
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove("visible"), 2400);
    }

    window.VoiceAudioPlayerModal = VoiceAudioPlayerModal;
})();
