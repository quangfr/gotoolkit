(function () {
    const STYLE_ID = "voice-audio-player-styles";

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

    class VoiceAudioPlayerModal {
        constructor() {
            this.onTranscriptChange = null;
            this.onPlaybackRateChange = null;
            this.audioBlob = null;
            this.audioBlobUrl = "";
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
                            <button type="button" class="voice-audio-player-download btn btn-secondary" aria-label="Télécharger l'audio"><i data-lucide="download"></i></button>
                            <button type="button" class="voice-audio-player-delete btn btn-secondary"><i data-lucide="trash-2"></i></button>
                        </div>
                        <div class="voice-audio-player-subtitle"></div>
                    </div>
                    <div class="voice-audio-player-controls">
                        <select class="voice-audio-player-speed" aria-label="Vitesse de lecture"></select>
                        <button type="button" class="voice-audio-player-play-toggle" aria-label="Lecture">▶</button>
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
            if (this.speedSelect) {
                [0.75, 1, 1.25, 1.5, 2].forEach(rate => {
                    const option = document.createElement("option");
                    option.value = String(rate);
                    option.textContent = `${rate}×`;
                    if (rate === 1) option.selected = true;
                    this.speedSelect.appendChild(option);
                });
                this._applyPlaybackRate();
            }
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
                const url = URL.createObjectURL(this.audioBlob);
                const anchor = document.createElement("a");
                anchor.href = url;
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                anchor.download = `recording-${stamp}.webm`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                setTimeout(() => URL.revokeObjectURL(url), 0);
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
            this.playToggle.textContent = this.audioEl.paused ? "▶" : "❚❚";
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
            const rate = Number(this.speedSelect.value) || 1;
            this.audioEl.playbackRate = rate;
            if (triggerCallback && typeof this.onPlaybackRateChange === "function") {
                this.onPlaybackRateChange(rate);
            }
        }

        _applyAudioBlob(blob) {
            if (!this.audioEl || !blob) return;
            this.audioBlob = blob;
            if (this.audioBlobUrl) {
                URL.revokeObjectURL(this.audioBlobUrl);
                this.audioBlobUrl = "";
            }
            this.audioBlobUrl = URL.createObjectURL(blob);
            this.audioEl.src = this.audioBlobUrl;
            this.audioEl.load();
            this._updateProgress(true);
            this._updatePlayButton();
        }

        open(options = {}) {
            const { audioBlob, transcriptText = "", memoName = "", onTranscriptChange, onDelete } = options;
            if (!audioBlob) return;
            this.onTranscriptChange = typeof onTranscriptChange === "function" ? onTranscriptChange : null;
            this.onDelete = typeof onDelete === "function" ? onDelete : null;
            if (this.textarea) this.textarea.value = transcriptText || "";
            if (this.subtitle) {
                this.subtitle.textContent = memoName ? `Mémo: ${memoName}` : "";
            }
            this._applyAudioBlob(audioBlob);
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
