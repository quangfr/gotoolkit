(function () {
    const STYLE_ID = "voice-video-player-styles";
    const GIF_JS_CDN_URL = "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.js";
    const GIF_JS_WORKER_URL = "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js";

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .voice-video-player-modal {
                position: fixed;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                font-family: "Inter", system-ui, sans-serif;
            }
            .voice-video-player-modal--open {
                display: flex;
            }
            body.voice-video-player-modal-open {
                overflow: hidden;
            }
            .voice-video-player-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(15, 23, 42, 0.65);
                backdrop-filter: blur(12px);
            }
            .voice-video-player-dialog {
                position: relative;
                width: 95vw;
                max-height: 90vh;
                background: var(--bg-surface);
                border-radius: 24px;
                padding: 22px;
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
                z-index: 1;
                display: flex;
                flex-direction: column;
                gap: 18px;
                overflow: hidden;
            }
            .voice-video-player-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding-right: 40px;
            }
            .voice-video-player-title {
                font-weight: 600;
                font-size: 15px;
                color: var(--text-main);
            }
            .voice-video-player-header-actions {
                margin-left: auto;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            .voice-video-player-delete {
                border: none;
                background: transparent;
                font-size: 13px;
                color: var(--intent-error-border);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .voice-video-player-publish {
                border: none;
                background: transparent;
                font-size: 13px;
                color: var(--text-main);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .voice-video-player-link {
                border: none;
                background: transparent;
                font-size: 13px;
                color: var(--text-main);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .voice-video-player-publish[disabled] {
                cursor: not-allowed;
                opacity: 0.6;
            }
            .voice-video-player-delete svg {
                width: 16px;
                height: 16px;
            }
            .voice-video-player-close {
                position: absolute;
                top: 16px;
                right: 16px;
                border: none;
                background: none;
                font-size: 22px;
                cursor: pointer;
                color: var(--text-main);
            }
            .voice-video-player-body {
                display: flex;
                width: 100%;
                gap: 18px;
                flex: 1;
                min-height: 50vh;
            }
            .voice-video-player-video-panel {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .voice-video-player-video-frame {
                flex: 1;
                border-radius: 16px;
                overflow: hidden;
                background: var(--black);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
            }
            .voice-video-player-video-frame video {
                width: 100%;
                height: 100%;
                object-fit: contain;
                display: block;
                background: var(--black);
            }
            .voice-video-player-controls {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .voice-video-player-download-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
            }
            .voice-video-player-play-toggle,
            .voice-video-player-cut,
            .voice-video-player-download {
                border: 1px solid var(--border-strong);
                border-radius: 8px;
                width: 36px;
                height: 36px;
                background: transparent;
                cursor: pointer;
                font-size: 16px;
                color: var(--text-main);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .voice-video-player-download svg {
                width: 18px;
                height: 18px;
            }
            .voice-video-player-download-dropdown {
                position: absolute;
                bottom: calc(100% + 6px);
                top: auto;
                left: 0;
                z-index: 3;
                min-width: 150px;
                padding: 6px;
                border-radius: 10px;
                border: 1px solid var(--border-strong);
                background: var(--bg-surface);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .voice-video-player-download-dropdown[hidden] {
                display: none;
            }
            .voice-video-player-download-option {
                border: none;
                background: transparent;
                color: var(--text-main);
                font-size: 12px;
                text-align: left;
                padding: 8px 10px;
                border-radius: 8px;
                cursor: pointer;
            }
            .voice-video-player-download-option:hover {
                background: var(--bg-surface-soft);
            }
            .voice-video-player-cut.is-active {
                background: var(--color-primary);
                color: var(--white);
                border-color: var(--color-primary);
            }
            .voice-video-player-speed {
                border: 1px solid var(--border-strong);
                border-radius: 999px;
                background: var(--bg-surface-soft);
                color: var(--text-main);
                font-size: 13px;
                padding: 0 8px;
                height: 32px;
                cursor: pointer;
            }
            .voice-video-player-progress {
                width: 100%;
                appearance: none;
                height: 6px;
                border-radius: 6px;
                background: var(--border-main);
                outline: none;
            }
            .voice-video-player-progress-wrap {
                position: relative;
                flex: 1;
                display: flex;
                align-items: center;
            }
            .voice-video-player-progress::-webkit-slider-thumb {
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--color-primary);
                border: 2px solid var(--bg-surface);
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
            }
            .voice-video-player-progress::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--color-primary);
                border: 2px solid var(--bg-surface);
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
            }
            .voice-video-player-cut-pointer {
                position: absolute;
                top: 50%;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 2px solid var(--color-primary);
                background: var(--bg-surface);
                transform: translate(-50%, -50%);
                pointer-events: auto;
                cursor: ew-resize;
                z-index: 2;
                display: none;
            }
            .voice-video-player-time {
                font-size: 12px;
                color: var(--text-muted);
                min-width: 120px;
                text-align: right;
            }
            .voice-video-player-transcript-panel {
                width: 350px;
                max-height: 100%;
                padding: 8px;
                border: none;
                display: flex;
                flex-direction: column;
                gap: 4px;
                overflow: hidden;
            }
            .voice-video-player-transcript-header {
                font-weight: 600;
                color: var(--text-main);
                font-size: 14px;
                letter-spacing: 0.02em;
            }
            .voice-video-player-transcript-subtitle {
                font-size: 12px;
                color: var(--text-muted);
                margin-top: -4px;
            }
            .voice-video-player-transcript-list {
                flex: 1;
                overflow-y: auto;
                padding-right: 4px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .voice-video-player-transcript-item {
                border-radius: 12px;
                padding: 10px;
                border: 1px solid var(--border-strong);
                background: var(--bg-surface-soft);
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .voice-video-player-transcript-item--active {
                background: transparent;
                border: 2px solid var(--color-primary);
            }
            .voice-video-player-transcript-item__times {
                display: flex;
                gap: 6px;
                align-items: center;
                font-size: 12px;
                color: var(--text-muted);
            }
            .voice-video-player-transcript-time {
                flex: 1;
                border: none;
                padding: 4px 8px;
                font-size: 12px;
                background: transparent;
                color: var(--text-muted);
                width:50px;
                border: none;
            }
            .voice-video-player-transcript-time:focus {
                border: 1px solid var(--border-main);
                border-radius: 4px;
            }
            .voice-video-player-transcript-item__content {
                min-height: 40px;
                font-size: 13px;
                line-height: 1.4;
                border-radius: 8px;
                padding: 6px 8px;
                border: 1px solid var(--border-main);
            }

.voice-video-player-transcript-item__content:focus,.voice-video-player-transcript-item__content:focus-visible {
            border: 1px solid var(--border-main);
}

            .voice-video-player-transcript-save {
                border: none;
                outline: none;
                border-radius: 12px;
                padding: 6px 14px;
                background: var(--color-primary);
                color: var(--text-main);
                cursor: pointer;
                transition: background 0.2s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                width: auto;
                min-height: 0;
                min-width: 0;
                font-size: 13px;
                align-self: flex-end;
            }
            .voice-video-player-transcript-save:hover {
                background: #1e6848;
            }
            @media (max-width: 1024px) {
                .voice-video-player-body {
                    flex-direction: column;
                }
                .voice-video-player-transcript-panel {
                    width: 100%;
                    max-height: 35vh;
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

    function formatVttTime(value = 0) {
        const totalMillis = Math.max(0, Math.floor((Number(value) || 0) * 1000));
        const hours = Math.floor(totalMillis / 3600000);
        const minutes = Math.floor((totalMillis % 3600000) / 60000);
        const seconds = Math.floor((totalMillis % 60000) / 1000);
        const millis = totalMillis % 1000;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
    }

    function parseVttTime(value = "") {
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

    class VoiceVideoPlayerModal {
        constructor() {
            this.sentences = [];
            this.sentenceEntries = [];
            this.onTranscriptChange = null;
            this.onTranscriptSaved = null;
            this.onPlaybackRateChange = null;
            this._activeSentenceIndex = -1;
            this._handleKeydown = this._handleKeydown.bind(this);
            this.videoBlobUrl = "";
            this._textTrackUrl = "";
            ensureStyles();
            this._buildDom();
            this._bindEvents();
        }

        _buildDom() {
            this.overlay = document.createElement("div");
            this.overlay.className = "voice-video-player-modal";
            this.overlay.setAttribute("aria-hidden", "true");
            this.overlay.innerHTML = `
                <div class="voice-video-player-backdrop"></div>
                <div class="voice-video-player-dialog" role="dialog" aria-modal="true" aria-label="Lecteur vidéo">
                    <button type="button" class="voice-video-player-close" aria-label="Fermer">×</button>
                    <div class="voice-video-player-header">
                        <div class="voice-video-player-title">Lecteur vidéo</div>
                        <div class="voice-video-player-header-actions">
                            <button type="button" class="voice-video-player-copy-audio btn btn-secondary" title="Transcript audio"><i data-lucide="captions"></i> Audio</button>
                            <button type="button" class="voice-video-player-copy-video btn btn-secondary" title="Transcript vidéo"><i data-lucide="captions"></i> Vidéo</button>
                            <button type="button" class="voice-video-player-publish btn btn-secondary" title="Publier sur YouTube"><i data-lucide="youtube"></i> Youtube</button>
                            <button type="button" class="voice-video-player-link btn btn-secondary" title="Ouvrir le lien YouTube"><i data-lucide="youtube"></i> Youtube</button>
                            <button type="button" class="voice-video-player-delete btn btn-secondary" title="Supprimer"><i data-lucide="trash-2"></i></button>
                        </div>
                    </div>
                    <div class="voice-video-player-body">
                        <div class="voice-video-player-video-panel">
                            <div class="voice-video-player-video-frame">
                                <video playsinline></video>
                            </div>
                            <div class="voice-video-player-controls">
                                <select class="voice-video-player-speed" aria-label="Vitesse de lecture"></select>
                                <div class="voice-video-player-download-wrap">
                                <button type="button" class="voice-video-player-download" title="Télécharger" aria-label="Télécharger"><i data-lucide="download"></i></button>
                                    <div class="voice-video-player-download-dropdown" hidden>
                                        <button type="button" class="voice-video-player-download-option" data-download-format="video">Vidéo</button>
                                        <button type="button" class="voice-video-player-download-option" data-download-format="gif">Gif</button>
                                    </div>
                                </div>
                                <button type="button" class="voice-video-player-cut" title="Couper" aria-label="Couper"><i data-lucide="scissors"></i></button>
                                <button type="button" class="voice-video-player-play-toggle" title="Lecture" aria-label="Lecture">▶</button>
                                <div class="voice-video-player-progress-wrap">
                                    <input type="range" min="0" max="1" step="0.001" value="0" class="voice-video-player-progress">
                                    <span class="voice-video-player-cut-pointer voice-video-player-cut-pointer--start" aria-hidden="true"></span>
                                    <span class="voice-video-player-cut-pointer voice-video-player-cut-pointer--end" aria-hidden="true"></span>
                                </div>
                                <span class="voice-video-player-time">00:00 / 00:00</span>
                            </div>
                        </div>
                    <div class="voice-video-player-transcript-panel">
                        <div class="voice-video-player-transcript-header">Transcription vidéo</div>
                        <div class="voice-video-player-transcript-subtitle"></div>
                        <div class="voice-video-player-transcript-list"></div>
                        <button type="button" class="voice-video-player-transcript-save btn-primary">Sauvegarder</button>
                    </div>
                    </div>
                </div>
            `;
            (document.body || document.documentElement).appendChild(this.overlay);
            this.dialog = this.overlay.querySelector(".voice-video-player-dialog");
            this.closeButton = this.overlay.querySelector(".voice-video-player-close");
            this.copyButtons = [
                this.overlay.querySelector(".voice-video-player-copy-audio"),
                this.overlay.querySelector(".voice-video-player-copy-video")
            ];
            this.publishButton = this.overlay.querySelector(".voice-video-player-publish");
            this.youtubeLinkButton = this.overlay.querySelector(".voice-video-player-link");
            this.deleteButton = this.overlay.querySelector(".voice-video-player-delete");
            this._defaultPublishLabel = this.publishButton?.innerHTML || "Youtube";
            this.youtubeUrl = "";
            this.videoEl = this.overlay.querySelector("video");
            this.downloadButton = this.overlay.querySelector(".voice-video-player-download");
            this.downloadMenuWrap = this.overlay.querySelector(".voice-video-player-download-wrap");
            this.downloadDropdown = this.overlay.querySelector(".voice-video-player-download-dropdown");
            this.downloadVideoOption = this.overlay.querySelector('[data-download-format="video"]');
            this.downloadGifOption = this.overlay.querySelector('[data-download-format="gif"]');
            this.cutButton = this.overlay.querySelector(".voice-video-player-cut");
            this.playToggle = this.overlay.querySelector(".voice-video-player-play-toggle");
            this.speedSelect = this.overlay.querySelector(".voice-video-player-speed");
            this.progress = this.overlay.querySelector(".voice-video-player-progress");
            this.cutStartPointer = this.overlay.querySelector(".voice-video-player-cut-pointer--start");
            this.cutEndPointer = this.overlay.querySelector(".voice-video-player-cut-pointer--end");
            this.timeLabel = this.overlay.querySelector(".voice-video-player-time");
            this.transcriptList = this.overlay.querySelector(".voice-video-player-transcript-list");
            this.transcriptSubtitle = this.overlay.querySelector(".voice-video-player-transcript-subtitle");
            this.saveButton = this.overlay.querySelector(".voice-video-player-transcript-save");
            if (this.videoEl) {
                this.textTrackEl = document.createElement("track");
                this.textTrackEl.kind = "subtitles";
                this.textTrackEl.srclang = "fr";
                this.textTrackEl.label = "Sous-titres";
                this.textTrackEl.default = true;
                this.videoEl.appendChild(this.textTrackEl);
            }
            if (this.speedSelect) {
                this._populateSpeedOptions();
                this._applyPlaybackRate();
            }
        }

        _bindEvents() {
            this.overlay.addEventListener("click", event => {
                if (event.target === this.overlay || event.target.classList.contains("voice-video-player-backdrop")) {
                    this.close();
                    return;
                }
                const clickedInsideDownload = this.downloadMenuWrap?.contains(event.target);
                if (!clickedInsideDownload) this._closeDownloadDropdown();
            });
            this.closeButton?.addEventListener("click", () => this.close());
            this.copyButtons?.[0]?.addEventListener("click", () => {
                if (!this.onCopyAudio) return;
                this.onCopyAudio();
            });
            this.copyButtons?.[1]?.addEventListener("click", () => {
                if (!this.onCopyVideo) return;
                const text = this._getVisibleSentences({ relativeToCut: false })
                    .map(sentence => (sentence.text || "").trim())
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                this.onCopyVideo(text);
            });
            this.deleteButton?.addEventListener("click", () => {
                if (!this.onDelete) return;
                this.onDelete();
            });
            this.publishButton?.addEventListener("click", () => this._handlePublish());
            this.youtubeLinkButton?.addEventListener("click", () => {
                if (!this.youtubeUrl) return;
                window.open(this.youtubeUrl, "_blank", "noopener,noreferrer");
            });
            this.downloadButton?.addEventListener("click", () => {
                this._toggleDownloadDropdown();
            });
            this.downloadVideoOption?.addEventListener("click", async () => {
                this._closeDownloadDropdown();
                await this._handleDownloadVideo();
            });
            this.downloadGifOption?.addEventListener("click", async () => {
                this._closeDownloadDropdown();
                await this._handleDownloadGif();
            });
            this.cutButton?.addEventListener("click", () => {
                this._toggleCutMode();
            });
            this.playToggle?.addEventListener("click", () => {
                this._togglePlayback();
            });
            this.progress?.addEventListener("input", () => {
                if (!this.videoEl || !this.videoEl.duration) return;
                const ratio = Number(this.progress.value) || 0;
                const duration = this.videoEl.duration || 0;
                const bounds = this._getPlaybackBounds();
                const span = Math.max(0.001, bounds.end - bounds.start);
                const previewTime = this.cutMode
                    ? Math.max(0, Math.min(duration, ratio * duration))
                    : bounds.start + ratio * span;
                this.videoEl.currentTime = Math.max(0, Math.min(duration, previewTime));
            });
            this.progress?.addEventListener("change", () => {
                if (!this.cutMode || !this.videoEl?.duration) return;
                const duration = this.videoEl.duration || 0;
                const ratio = Number(this.progress.value) || 0;
                const time = Math.max(0, Math.min(duration, ratio * duration));
                if (this.cutSelectionStep === "start") {
                    this.cutStart = time;
                    if (this.cutEnd < this.cutStart) this.cutEnd = this.cutStart;
                    this.cutSelectionStep = "end";
                } else {
                    this.cutEnd = time;
                    if (this.cutEnd < this.cutStart) {
                        const swappedStart = this.cutEnd;
                        this.cutEnd = this.cutStart;
                        this.cutStart = swappedStart;
                    }
                    this.cutSelectionStep = "start";
                }
                this._trimCacheKey = "";
                this._trimmedBlob = null;
                this._syncCutUiState();
            });
            this.cutStartPointer?.addEventListener("mousedown", event => {
                this._startCutPointerDrag("start", event);
            });
            this.cutEndPointer?.addEventListener("mousedown", event => {
                this._startCutPointerDrag("end", event);
            });
            this.speedSelect?.addEventListener("change", () => {
                this._applyPlaybackRate(true);
            });
            this.videoEl?.addEventListener("timeupdate", () => {
                if (!this.cutMode && this._hasCutRange()) {
                    const bounds = this._getPlaybackBounds();
                    if ((this.videoEl.currentTime || 0) >= bounds.end) {
                        this.videoEl.currentTime = bounds.end;
                        this.videoEl.pause();
                    }
                }
                this._updateProgress();
                this._refreshActiveNode();
            });
            this.videoEl?.addEventListener("loadedmetadata", () => {
                this._updateProgress(true);
                this._refreshActiveNode();
            });
            this.videoEl?.addEventListener("play", () => this._updatePlayButton());
            this.videoEl?.addEventListener("pause", () => this._updatePlayButton());
            this.videoEl?.addEventListener("ended", () => {
                this._updatePlayButton();
                this._updateProgress(true);
                this._refreshActiveNode();
            });
            this.saveButton?.addEventListener("click", () => this._handleSave());
        }

        _handleKeydown(event) {
            if (event.key === "Escape") {
                this._closeDownloadDropdown();
                this.close();
                return;
            }
            const isSpace = event.code === "Space" || event.key === " ";
            if (isSpace) {
                const target = event.target;
                const tag = target?.tagName;
                const isEditable = target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
                if (isEditable) return;
                event.preventDefault();
                this._togglePlayback();
            }
        }

        _formatMbLabel(bytes) {
            const value = Number(bytes);
            if (!Number.isFinite(value) || value <= 0) return "0.00 MB";
            const mb = value / (1024 * 1024);
            return `${mb.toFixed(2)} MB`;
        }

        _estimateGifBytes() {
            const duration = this._hasCutRange() ? Math.max(0.1, this.cutEnd - this.cutStart) : Math.max(0.1, this.videoEl?.duration || 0);
            const sourceWidth = this.videoEl?.videoWidth || 640;
            const sourceHeight = this.videoEl?.videoHeight || 360;
            const targetWidth = Math.min(640, sourceWidth);
            const targetHeight = Math.max(2, Math.round((sourceHeight / Math.max(1, sourceWidth)) * targetWidth));
            const fps = 8;
            // Heuristic average bytes/frame for GIF with moderate quality
            const bytesPerFrame = Math.max(2500, Math.round((targetWidth * targetHeight) / 18));
            const frames = Math.max(1, Math.min(320, Math.ceil(duration * fps)));
            return frames * bytesPerFrame;
        }

        async _updateDownloadOptionLabels() {
            const videoBlob = await this._getOutputBlob().catch(() => this.videoBlobOriginal);
            const videoSize = videoBlob?.size || this.videoBlobOriginal?.size || 0;
            const gifSize = (this._gifBlobCache?.size && this._gifBlobCacheKey === this._getGifCacheKey())
                ? this._gifBlobCache.size
                : this._estimateGifBytes();
            if (this.downloadVideoOption) {
                this.downloadVideoOption.textContent = `Vidéo (${this._formatMbLabel(videoSize)})`;
            }
            if (this.downloadGifOption) {
                this.downloadGifOption.textContent = `Gif (${this._formatMbLabel(gifSize)})`;
            }
        }

        async _toggleDownloadDropdown() {
            if (!this.downloadDropdown) return;
            const shouldOpen = this.downloadDropdown.hidden;
            if (!shouldOpen) {
                this._closeDownloadDropdown();
                return;
            }
            await this._updateDownloadOptionLabels();
            this.downloadDropdown.hidden = false;
        }

        _closeDownloadDropdown() {
            if (this.downloadDropdown) {
                this.downloadDropdown.hidden = true;
            }
        }

        async _ensureGifJsLoaded() {
            if (window.GIF) return window.GIF;
            if (this._gifScriptPromise) return this._gifScriptPromise;
            this._gifScriptPromise = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = GIF_JS_CDN_URL;
                script.async = true;
                script.onload = () => {
                    if (window.GIF) {
                        resolve(window.GIF);
                    } else {
                        reject(new Error("GIF.js introuvable"));
                    }
                };
                script.onerror = () => reject(new Error("Chargement GIF.js échoué"));
                document.head.appendChild(script);
            });
            return this._gifScriptPromise;
        }

        _getGifCacheKey() {
            if (!this.videoBlobOriginal) return "";
            const bounds = this._hasCutRange()
                ? `${this.cutStart.toFixed(3)}:${this.cutEnd.toFixed(3)}`
                : `0:${(this.videoEl?.duration || 0).toFixed(3)}`;
            return `${bounds}:${this.videoBlobOriginal.size}:${this.videoBlobOriginal.type || "video/webm"}`;
        }

        async _buildGifBlob() {
            if (!this.videoBlobOriginal) return null;
            await this._ensureGifJsLoaded();
            const sourceUrl = URL.createObjectURL(this.videoBlobOriginal);
            const video = document.createElement("video");
            video.src = sourceUrl;
            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";
            await new Promise((resolve, reject) => {
                const onLoaded = () => {
                    cleanup();
                    resolve();
                };
                const onError = () => {
                    cleanup();
                    reject(new Error("Impossible de charger la vidéo source"));
                };
                const cleanup = () => {
                    video.removeEventListener("loadedmetadata", onLoaded);
                    video.removeEventListener("error", onError);
                };
                video.addEventListener("loadedmetadata", onLoaded);
                video.addEventListener("error", onError);
            });
            const duration = video.duration || 0;
            const start = this._hasCutRange() ? Math.max(0, Math.min(duration, this.cutStart || 0)) : 0;
            const end = this._hasCutRange()
                ? Math.max(start + 0.05, Math.min(duration, this.cutEnd || duration))
                : duration;
            const sourceWidth = video.videoWidth || 640;
            const sourceHeight = video.videoHeight || 360;
            const width = Math.min(640, sourceWidth);
            const height = Math.max(2, Math.round((sourceHeight / Math.max(1, sourceWidth)) * width));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) {
                URL.revokeObjectURL(sourceUrl);
                throw new Error("Canvas indisponible");
            }
            const fps = 8;
            const delay = Math.round(1000 / fps);
            const frameCount = Math.max(1, Math.min(320, Math.ceil(Math.max(0.1, end - start) * fps)));
            const GIFCtor = window.GIF;
            const gif = new GIFCtor({
                workers: 2,
                quality: 10,
                workerScript: GIF_JS_WORKER_URL,
                width,
                height
            });
            const seekTo = time => new Promise(resolve => {
                const bounded = Math.max(0, Math.min(duration, time));
                const onSeeked = () => {
                    video.removeEventListener("seeked", onSeeked);
                    resolve();
                };
                video.addEventListener("seeked", onSeeked);
                video.currentTime = bounded;
            });
            for (let i = 0; i < frameCount; i += 1) {
                const t = Math.min(end, start + (i / fps));
                // eslint-disable-next-line no-await-in-loop
                await seekTo(t);
                ctx.drawImage(video, 0, 0, width, height);
                gif.addFrame(canvas, { copy: true, delay });
            }
            const blob = await new Promise((resolve, reject) => {
                gif.on("finished", resolve);
                gif.on("abort", () => reject(new Error("GIF annulé")));
                try {
                    gif.render();
                } catch (err) {
                    reject(err);
                }
            });
            try { URL.revokeObjectURL(sourceUrl); } catch (err) { /* noop */ }
            return blob;
        }

        async _handleDownloadGif() {
            if (!this.videoBlobOriginal) return;
            try {
                const cacheKey = this._getGifCacheKey();
                let gifBlob = null;
                if (this._gifBlobCache && this._gifBlobCacheKey === cacheKey) {
                    gifBlob = this._gifBlobCache;
                } else {
                    gifBlob = await this._buildGifBlob();
                    this._gifBlobCache = gifBlob;
                    this._gifBlobCacheKey = cacheKey;
                }
                if (!gifBlob) return;
                const url = URL.createObjectURL(gifBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = this._hasCutRange() ? "video-cut.gif" : "video.gif";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => {
                    try { URL.revokeObjectURL(url); } catch (err) { /* noop */ }
                }, 500);
            } catch (err) {
                console.warn("GIF download failed", err);
            }
        }

        _handleSave() {
            if (!this.onTranscriptSaved) return;
            const snapshot = this.sentences.map(sentence => ({ ...sentence }));
            this.onTranscriptSaved(snapshot);
        }

        _toggleCutMode() {
            if (this.videoEl && !this.videoEl.paused) {
                this.videoEl.pause();
            }
            this.cutMode = !this.cutMode;
            if (this.cutMode) {
                this.cutSelectionStep = "start";
                if (this.videoEl?.duration) {
                    this.videoEl.currentTime = Math.max(0, Math.min(this.videoEl.duration, this.cutStart || 0));
                }
            } else if (this.videoEl && this._hasCutRange()) {
                const bounds = this._getPlaybackBounds();
                if (this.videoEl.currentTime < bounds.start || this.videoEl.currentTime > bounds.end) {
                    this.videoEl.currentTime = bounds.start;
                }
            }
            this._syncCutUiState();
            this._updateProgress(true);
            if (window.lucide) lucide.createIcons();
        }

        _getProgressRatioFromClientX(clientX) {
            if (!this.progress) return 0;
            const rect = this.progress.getBoundingClientRect();
            if (!rect?.width) return 0;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        }

        _startCutPointerDrag(kind, event) {
            if (!this.videoEl?.duration || !this.progress) return;
            event.preventDefault();
            event.stopPropagation();
            if (!this.cutMode) this.cutMode = true;
            if (!this.videoEl.paused) this.videoEl.pause();
            const duration = this.videoEl.duration || 0;
            const minGap = 0.05;

            const applyAt = clientX => {
                const ratio = this._getProgressRatioFromClientX(clientX);
                const time = Math.max(0, Math.min(duration, ratio * duration));
                if (kind === "start") {
                    this.cutStart = Math.min(time, Math.max(0, (this.cutEnd || duration) - minGap));
                    if (this.cutEnd < this.cutStart + minGap) {
                        this.cutEnd = Math.min(duration, this.cutStart + minGap);
                    }
                    if (this.videoEl) this.videoEl.currentTime = this.cutStart;
                } else {
                    this.cutEnd = Math.max(time, (this.cutStart || 0) + minGap);
                    if (this.cutEnd > duration) this.cutEnd = duration;
                    if (this.videoEl) this.videoEl.currentTime = this.cutEnd;
                }
                this._syncCutUiState();
                this._updateProgress(true);
            };

            const onMove = moveEvent => {
                applyAt(moveEvent.clientX);
            };
            const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };

            applyAt(event.clientX);
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        }

        _getPlaybackBounds() {
            const duration = Math.max(0, this.videoEl?.duration || 0);
            if (this.cutMode || !this._hasCutRange()) {
                return { start: 0, end: duration };
            }
            const start = Math.max(0, Math.min(duration, this.cutStart || 0));
            const end = Math.max(start, Math.min(duration, this.cutEnd || duration));
            return { start, end };
        }

        _hasCutRange() {
            if (!Number.isFinite(this.cutStart) || !Number.isFinite(this.cutEnd)) return false;
            return Math.max(0, this.cutEnd - this.cutStart) > 0.05;
        }

        _syncCutUiState() {
            if (this.cutButton) {
                this.cutButton.classList.toggle("is-active", Boolean(this.cutMode));
            }
            if (!this.transcriptSubtitle) return;
            if (this._hasCutRange()) {
                this.transcriptSubtitle.textContent = `${formatTime(this.cutStart)} → ${formatTime(this.cutEnd)}`;
            } else {
                this.transcriptSubtitle.textContent = this.memoName ? `Docs: ${this.memoName}` : "";
            }
            this._trimCacheKey = "";
            this._trimmedBlob = null;
            this._gifBlobCacheKey = "";
            this._gifBlobCache = null;
            if (this.transcriptList) this._renderSentences();
            this._updateProgressRangeVisual();
        }

        _updateProgressRangeVisual() {
            if (!this.progress) return;
            if (!this.cutMode || !this.videoEl?.duration || !this._hasCutRange()) {
                this.progress.style.background = "var(--border-main)";
                if (this.cutStartPointer) this.cutStartPointer.style.display = "none";
                if (this.cutEndPointer) this.cutEndPointer.style.display = "none";
                return;
            }
            const duration = Math.max(0.001, this.videoEl.duration || 0);
            const startRatio = Math.max(0, Math.min(1, (this.cutStart || 0) / duration));
            const endRatio = Math.max(startRatio, Math.min(1, (this.cutEnd || 0) / duration));
            const startPct = (startRatio * 100).toFixed(3);
            const endPct = (endRatio * 100).toFixed(3);
            this.progress.style.background = `linear-gradient(to right, var(--border-main) 0%, var(--border-main) ${startPct}%, var(--color-primary) ${startPct}%, var(--color-primary) ${endPct}%, var(--border-main) ${endPct}%, var(--border-main) 100%)`;
            if (this.cutStartPointer) {
                this.cutStartPointer.style.display = "";
                this.cutStartPointer.style.left = `${startPct}%`;
            }
            if (this.cutEndPointer) {
                this.cutEndPointer.style.display = "";
                this.cutEndPointer.style.left = `${endPct}%`;
            }
        }

        async _handleDownloadVideo() {
            if (!this.videoBlobOriginal) return;
            const blob = await this._getOutputBlob().catch(() => this.videoBlobOriginal);
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const ext = (blob.type || "").includes("webm") ? "webm" : ((blob.type || "").includes("mp4") ? "mp4" : "webm");
            a.download = this._hasCutRange() ? `video-cut.${ext}` : `video.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (err) { /* noop */ }
            }, 500);
        }

        async _getOutputBlob() {
            if (!this.videoBlobOriginal || !this._hasCutRange()) return this.videoBlobOriginal;
            const key = `${this.cutStart.toFixed(3)}:${this.cutEnd.toFixed(3)}:${this.videoBlobOriginal.size}:${this.videoBlobOriginal.type || "video/webm"}`;
            if (this._trimmedBlob && this._trimCacheKey === key) {
                return this._trimmedBlob;
            }
            const trimmed = await this._buildTrimmedBlob();
            this._trimmedBlob = trimmed || this.videoBlobOriginal;
            this._trimCacheKey = key;
            return this._trimmedBlob;
        }

        async _buildTrimmedBlob() {
            if (!this.videoBlobOriginal || !this._hasCutRange()) return this.videoBlobOriginal;
            const sourceUrl = URL.createObjectURL(this.videoBlobOriginal);
            const sourceVideo = document.createElement("video");
            sourceVideo.src = sourceUrl;
            sourceVideo.muted = true;
            sourceVideo.playsInline = true;
            sourceVideo.preload = "auto";
            await new Promise((resolve, reject) => {
                const onLoaded = () => {
                    cleanup();
                    resolve();
                };
                const onError = () => {
                    cleanup();
                    reject(new Error("Video trim source load failed"));
                };
                const cleanup = () => {
                    sourceVideo.removeEventListener("loadedmetadata", onLoaded);
                    sourceVideo.removeEventListener("error", onError);
                };
                sourceVideo.addEventListener("loadedmetadata", onLoaded);
                sourceVideo.addEventListener("error", onError);
            });
            const duration = sourceVideo.duration || 0;
            const start = Math.max(0, Math.min(duration, this.cutStart || 0));
            const end = Math.max(start + 0.05, Math.min(duration, this.cutEnd || duration));
            const stream = sourceVideo.captureStream ? sourceVideo.captureStream() : (sourceVideo.mozCaptureStream ? sourceVideo.mozCaptureStream() : null);
            if (!stream) {
                URL.revokeObjectURL(sourceUrl);
                return this.videoBlobOriginal;
            }
            const preferred = [
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm"
            ];
            let recorder = null;
            for (const mimeType of preferred) {
                try {
                    if (MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported(mimeType)) continue;
                    recorder = new MediaRecorder(stream, { mimeType });
                    break;
                } catch (err) { /* try next */ }
            }
            if (!recorder) {
                try {
                    recorder = new MediaRecorder(stream);
                } catch (err) {
                    URL.revokeObjectURL(sourceUrl);
                    return this.videoBlobOriginal;
                }
            }
            const chunks = [];
            recorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) chunks.push(event.data);
            };
            await new Promise((resolve, reject) => {
                let stopped = false;
                const finalize = () => {
                    if (stopped) return;
                    stopped = true;
                    try { sourceVideo.pause(); } catch (err) { /* noop */ }
                    try { stream.getTracks().forEach(track => track.stop()); } catch (err) { /* noop */ }
                    try { URL.revokeObjectURL(sourceUrl); } catch (err) { /* noop */ }
                    resolve();
                };
                recorder.onstop = finalize;
                recorder.onerror = () => finalize();
                const onTimeUpdate = () => {
                    if ((sourceVideo.currentTime || 0) >= end) {
                        sourceVideo.removeEventListener("timeupdate", onTimeUpdate);
                        try { recorder.stop(); } catch (err) { finalize(); }
                    }
                };
                sourceVideo.addEventListener("timeupdate", onTimeUpdate);
                sourceVideo.currentTime = start;
                sourceVideo.onseeked = () => {
                    sourceVideo.onseeked = null;
                    try {
                        recorder.start(100);
                        sourceVideo.play().catch(() => {
                            try { recorder.stop(); } catch (err) { finalize(); }
                        });
                    } catch (err) {
                        sourceVideo.removeEventListener("timeupdate", onTimeUpdate);
                        reject(err);
                    }
                };
            });
            if (!chunks.length) return this.videoBlobOriginal;
            return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        }

        async _handlePublish() {
            if (typeof this.onPublish !== "function" || !this.videoBlobOriginal) return;
            if (!this.publishButton) return;
            this.publishButton.disabled = true;
            this.publishButton.innerHTML = `<i data-lucide="loader-2" class="lucide-spin"></i> Publication...`;
            if (window.lucide) lucide.createIcons();
            try {
                const snapshot = this._getVisibleSentences({ relativeToCut: true }).map(sentence => ({
                    id: sentence.id,
                    text: sentence.text,
                    start: sentence.start,
                    end: sentence.end
                }));
                const vtt = this._buildVttFromSentences({ relativeToCut: true });
                const outputVideoBlob = await this._getOutputBlob().catch(() => this.videoBlobOriginal);
                await this.onPublish({
                    videoBlob: outputVideoBlob || this.videoBlobOriginal,
                    sentences: snapshot,
                    vtt
                });
            } finally {
                this.publishButton.disabled = false;
                this.publishButton.innerHTML = this._defaultPublishLabel;
                if (window.lucide) lucide.createIcons();
            }
        }

        setYoutubeUrl(url = "") {
            this.youtubeUrl = String(url || "").trim();
            this._syncYouTubeButtons();
            if (window.lucide) lucide.createIcons();
        }

        _syncYouTubeButtons() {
            const hasLink = Boolean(this.youtubeUrl);
            if (this.publishButton) {
                this.publishButton.style.display = hasLink ? "none" : (this.onPublish ? "" : "none");
            }
            if (this.youtubeLinkButton) {
                this.youtubeLinkButton.style.display = hasLink ? "" : "none";
            }
        }

        _updateProgress(force = false) {
            if (!this.videoEl || !this.progress || !this.timeLabel) return;
            const current = this.videoEl.currentTime || 0;
            const duration = this.videoEl.duration || 0;
            const bounds = this._getPlaybackBounds();
            const span = Math.max(0.001, bounds.end - bounds.start);
            const ratio = this.cutMode
                ? (duration ? Math.min(1, Math.max(0, current / duration)) : 0)
                : Math.min(1, Math.max(0, (current - bounds.start) / span));
            if (force || this.progress.value !== String(ratio)) {
                this.progress.value = String(ratio);
            }
            if (this.cutMode) {
                this.timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
            } else {
                const displayCurrent = Math.max(0, current - bounds.start);
                this.timeLabel.textContent = `${formatTime(displayCurrent)} / ${formatTime(span)}`;
            }
            this._updateProgressRangeVisual();
        }

        _updatePlayButton() {
            if (!this.videoEl || !this.playToggle) return;
            const isPaused = this.videoEl.paused;
            this.playToggle.textContent = isPaused ? "▶" : "⏸";
            this.playToggle.title = isPaused ? "Lecture" : "Pause";
            this.playToggle.setAttribute("aria-label", isPaused ? "Lecture" : "Pause");
        }

        _populateSpeedOptions() {
            if (!this.speedSelect) return;
            this.speedSelect.innerHTML = "";
            for (let speed = 0.5; speed <= 2.001; speed += 0.1) {
                const normalized = Math.round(speed * 10) / 10;
                const option = document.createElement("option");
                option.value = normalized.toFixed(1);
                option.textContent = `${normalized.toFixed(1)}x`;
                this.speedSelect.appendChild(option);
            }
            this.speedSelect.value = "1.2";
        }

        _getSelectedSpeed() {
            if (!this.speedSelect) return 1.2;
            const numeric = parseFloat(this.speedSelect.value);
            if (!Number.isFinite(numeric)) return 1.2;
            return Math.min(2, Math.max(0.5, Math.round(numeric * 10) / 10));
        }

        setPlaybackRate(value, { emitChange = false } = {}) {
            if (!this.speedSelect) return;
            const numeric = Number(value);
            const normalized = Math.min(2, Math.max(0.5, Math.round((Number.isFinite(numeric) ? numeric : 1.2) * 10) / 10));
            this.speedSelect.value = normalized.toFixed(1);
            this._applyPlaybackRate(emitChange);
        }

        _applyPlaybackRate(emitChange = false) {
            if (!this.videoEl) return;
            const rate = this._getSelectedSpeed();
            this.videoEl.playbackRate = rate;
            if (emitChange && typeof this.onPlaybackRateChange === "function") {
                this.onPlaybackRateChange(rate);
            }
        }

        _refreshActiveNode() {
            if (!this.videoEl || !this.transcriptList) return;
            const visible = this._getVisibleSentences({ relativeToCut: this._hasCutRange() });
            if (!visible.length) return;
            const offset = this._hasCutRange() ? (this.cutStart || 0) : 0;
            const currentTime = Math.max(0, (this.videoEl.currentTime || 0) - offset);
            let foundIndex = visible.findIndex(sentence => {
                const start = Number.isFinite(sentence.start) ? sentence.start : 0;
                const end = Number.isFinite(sentence.end) ? sentence.end : Infinity;
                return currentTime >= start && currentTime < end;
            });
            if (foundIndex === -1) {
                let futureIndex = -1;
                let closestStart = Infinity;
                visible.forEach((sentence, index) => {
                    const start = Number.isFinite(sentence.start) ? sentence.start : 0;
                    if (start >= currentTime && start < closestStart) {
                        closestStart = start;
                        futureIndex = index;
                    }
                });
                foundIndex = futureIndex !== -1 ? futureIndex : visible.length - 1;
            }
            if (foundIndex === -1) return;
            if (this._activeSentenceIndex === foundIndex) return;
            this._activeSentenceIndex = foundIndex;
            this.sentenceEntries.forEach((entry, index) => {
                entry.container.classList.toggle("voice-video-player-transcript-item--active", index === foundIndex);
            });
            this.sentenceEntries[foundIndex]?.container?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }

        _renderSentences() {
            if (!this.transcriptList) return;
            this.transcriptList.innerHTML = "";
            this.sentenceEntries = [];
            const hasCut = this._hasCutRange();
            const cutOffset = hasCut ? (this.cutStart || 0) : 0;
            const visible = this._getVisibleSentences({ relativeToCut: hasCut });
            visible.forEach((sentence, index) => {
                const container = document.createElement("div");
                container.className = "voice-video-player-transcript-item";
                const timesRow = document.createElement("div");
                timesRow.className = "voice-video-player-transcript-item__times";
                const startInput = document.createElement("input");
                startInput.type = "text";
                startInput.className = "voice-video-player-transcript-time";
                startInput.value = formatVttTime(sentence.start);
                const arrow = document.createElement("span");
                arrow.textContent = "→";
                const endInput = document.createElement("input");
                endInput.type = "text";
                endInput.className = "voice-video-player-transcript-time";
                endInput.value = formatVttTime(sentence.end);
                startInput.addEventListener("blur", () => this._handleTimeEdit(sentence.sourceIndex, startInput.value, endInput.value, "start", hasCut));
                endInput.addEventListener("blur", () => this._handleTimeEdit(sentence.sourceIndex, startInput.value, endInput.value, "end", hasCut));
                timesRow.append(startInput, arrow, endInput);
                const contentEl = document.createElement("div");
                contentEl.className = "voice-video-player-transcript-item__content";
                contentEl.contentEditable = "true";
                contentEl.spellcheck = false;
                contentEl.textContent = sentence.text || "";
                contentEl.addEventListener("input", () => this._handleTextEdit(sentence.sourceIndex, contentEl.textContent || ""));
                contentEl.addEventListener("click", () => {
                    if (this.videoEl?.duration) {
                        this.videoEl.currentTime = Number((sentence.start || 0) + cutOffset);
                    }
                });
                container.append(timesRow, contentEl);
                this.transcriptList.appendChild(container);
                this.sentenceEntries.push({ container, contentEl, startInput, endInput, sourceIndex: sentence.sourceIndex });
            });
            this._refreshActiveNode();
            this._updateTextTrack();
        }

        updateSentences(sentences = []) {
            if (!this.transcriptList) return;
            this._normalizeSentences(sentences);
            this._renderSentences();
        }

        _handleTextEdit(index, value) {
            const sentence = this.sentences[index];
            if (!sentence) return;
            sentence.text = value;
            this._notifyTranscriptChange();
        }

        _handleTimeEdit(index, startValue, endValue, editedField, isRelativeToCut = false) {
            const sentence = this.sentences[index];
            if (!sentence) return;
            const parsedStart = parseVttTime(startValue);
            const parsedEnd = parseVttTime(endValue);
            const offset = isRelativeToCut ? (this.cutStart || 0) : 0;
            let start = Number.isFinite(parsedStart) ? (parsedStart + offset) : sentence.start;
            let end = Number.isFinite(parsedEnd) ? (parsedEnd + offset) : sentence.end;
            if (!Number.isFinite(end) || end <= start) {
                end = start + 0.1;
            }
            if (this._hasCutRange()) {
                const min = this.cutStart || 0;
                const max = this.cutEnd || min;
                start = Math.max(min, Math.min(max, start));
                end = Math.max(start + 0.05, Math.min(max, end));
            }
            sentence.start = start;
            sentence.end = end;
            if (editedField === "start") {
                this.sentences.forEach((other, otherIdx) => {
                    if (otherIdx === index) return;
                    const otherStart = Number.isFinite(other.start) ? other.start : 0;
                    const otherEnd = Number.isFinite(other.end) ? other.end : otherStart;
                    if (otherStart < start && otherEnd > start) {
                        other.end = start;
                        const entry = this.sentenceEntries.find(item => item.sourceIndex === otherIdx);
                        if (entry?.endInput) {
                            const displayEnd = this._hasCutRange() ? (start - (this.cutStart || 0)) : start;
                            entry.endInput.value = formatVttTime(displayEnd);
                        }
                    }
                });
            }
            this._notifyTranscriptChange({ rerender: true });
        }

        _notifyTranscriptChange(options = {}) {
            const snapshot = this.sentences.map(sentence => ({ ...sentence }));
            this._updateTextTrack();
            if (options.rerender) this._renderSentences();
            if (!this.onTranscriptChange) return;
            this.onTranscriptChange(snapshot);
        }

        _togglePlayback() {
            if (!this.videoEl) return;
            if (this.videoEl.paused) {
                if (!this.cutMode && this._hasCutRange()) {
                    const bounds = this._getPlaybackBounds();
                    const now = this.videoEl.currentTime || 0;
                    if (now < bounds.start || now > bounds.end) {
                        this.videoEl.currentTime = bounds.start;
                    }
                }
                this.videoEl.play().catch(() => { });
            } else {
                this.videoEl.pause();
            }
        }

        startPlayback() {
            if (!this.videoEl) return;
            this.videoEl.play().catch(() => { });
        }

        _normalizeSentences(rawSentences = []) {
            const working = Array.isArray(rawSentences) ? rawSentences.slice() : [];
            const normalized = working.map((sentence, index) => {
                const start = Number.isFinite(sentence.start) ? sentence.start : (Number.isFinite(sentence.start_time) ? sentence.start_time : 0);
                const end = Number.isFinite(sentence.end) ? sentence.end : (Number.isFinite(sentence.end_time) ? sentence.end_time : NaN);
                let safeEnd = Number.isFinite(end) ? end : NaN;
                if (!Number.isFinite(safeEnd) || safeEnd <= start) {
                    safeEnd = index < working.length - 1 ? (working[index + 1]?.start || start + 0.4) : start + 3;
                }
                return {
                    id: sentence.id || `sentence-${index}`,
                    text: sentence.text || "",
                    start,
                    end: safeEnd
                };
            });
            if (!normalized.length) {
                normalized.push({ id: "sentence-0", text: "", start: 0, end: 3 });
            }
            this.sentences = normalized;
            this._updateTextTrack();
        }

        _getVisibleSentences(options = {}) {
            const relativeToCut = Boolean(options.relativeToCut);
            const source = Array.isArray(this.sentences) ? this.sentences : [];
            if (!source.length) return [];
            if (!this._hasCutRange()) {
                return source.map((sentence, sourceIndex) => ({
                    sourceIndex,
                    id: sentence.id || `sentence-${sourceIndex}`,
                    text: sentence.text || "",
                    start: Number.isFinite(sentence.start) ? sentence.start : 0,
                    end: Number.isFinite(sentence.end) ? sentence.end : (Number.isFinite(sentence.start) ? sentence.start + 0.1 : 0.1)
                }));
            }
            const cutStart = this.cutStart || 0;
            const cutEnd = this.cutEnd || cutStart;
            const visible = [];
            source.forEach((sentence, sourceIndex) => {
                const rawStart = Number.isFinite(sentence.start) ? sentence.start : 0;
                const rawEnd = Number.isFinite(sentence.end) ? sentence.end : rawStart + 0.1;
                const overlapStart = Math.max(cutStart, rawStart);
                const overlapEnd = Math.min(cutEnd, Math.max(rawEnd, overlapStart + 0.05));
                if (overlapEnd <= overlapStart) return;
                visible.push({
                    sourceIndex,
                    id: sentence.id || `sentence-${sourceIndex}`,
                    text: sentence.text || "",
                    start: relativeToCut ? (overlapStart - cutStart) : overlapStart,
                    end: relativeToCut ? (overlapEnd - cutStart) : overlapEnd
                });
            });
            return visible;
        }

        _buildVttFromSentences(options = {}) {
            const entriesSource = this._getVisibleSentences({ relativeToCut: Boolean(options.relativeToCut) });
            if (!entriesSource.length) return "";
            const entries = entriesSource.map(sentence => {
                const start = formatVttTime(sentence.start);
                const end = formatVttTime(sentence.end);
                const content = (sentence.text || "").replace(/\r?\n/g, "\n").trim();
                return `${start} --> ${end}\n${content}`;
            });
            return `WEBVTT\n\n${entries.join("\n\n")}`;
        }

        _revokeTextTrackUrl() {
            if (this._textTrackUrl) {
                try { URL.revokeObjectURL(this._textTrackUrl); } catch (e) { /* noop */ }
                this._textTrackUrl = "";
            }
        }

        _updateTextTrack() {
            if (!this.textTrackEl) return;
            const vtt = this._buildVttFromSentences();
            this._revokeTextTrackUrl();
            if (!vtt) {
                this.textTrackEl.removeAttribute("src");
                try { if (this.textTrackEl.track) this.textTrackEl.track.mode = "hidden"; } catch (e) { /* noop */ }
                return;
            }
            const blob = new Blob([vtt], { type: "text/vtt" });
            this._textTrackUrl = URL.createObjectURL(blob);
            this.textTrackEl.src = this._textTrackUrl;
            this.textTrackEl.default = true;
            try { if (this.textTrackEl.track) this.textTrackEl.track.mode = "showing"; } catch (e) { /* noop */ }
        }

        _applyVideoBlob(blob) {
            if (!this.videoEl) return;
            this.videoBlobOriginal = blob;
            this.cutMode = false;
            this.cutSelectionStep = "start";
            this.cutStart = 0;
            this.cutEnd = 0;
            this._trimCacheKey = "";
            this._trimmedBlob = null;
            this._gifBlobCacheKey = "";
            this._gifBlobCache = null;
            if (this.videoBlobUrl) {
                URL.revokeObjectURL(this.videoBlobUrl);
                this.videoBlobUrl = "";
            }
            this.videoBlobUrl = URL.createObjectURL(blob);
            this.videoEl.src = this.videoBlobUrl;
            this._applyPlaybackRate();
            this.videoEl.load();
            this.progress && (this.progress.value = "0");
            this.timeLabel && (this.timeLabel.textContent = "00:00 / 00:00");
            this._updatePlayButton();
        }

        open(options = {}) {
            const { videoBlob, sentences = [], onTranscriptChange, onTranscriptSaved, memoName = "", onDelete, onCopyAudio, onCopyVideo, onPublish = null, youtubeUrl = "" } = options;
            if (!videoBlob) return;
            this.onTranscriptChange = typeof onTranscriptChange === "function" ? onTranscriptChange : null;
            this.onTranscriptSaved = typeof onTranscriptSaved === "function" ? onTranscriptSaved : null;
            this.onDelete = typeof onDelete === "function" ? onDelete : null;
            this.onCopyAudio = typeof onCopyAudio === "function" ? onCopyAudio : null;
            this.onCopyVideo = typeof onCopyVideo === "function" ? onCopyVideo : null;
            this.onPublish = typeof onPublish === "function" ? onPublish : null;
            this.setYoutubeUrl(youtubeUrl);
            this._normalizeSentences(sentences);
            this._renderSentences();
            this._applyVideoBlob(videoBlob);
            this.memoName = memoName || "";
            this._syncCutUiState();
            this._closeDownloadDropdown();
            this.overlay.classList.add("voice-video-player-modal--open");
            this.overlay.setAttribute("aria-hidden", "false");
            document.body?.classList.add("voice-video-player-modal-open");
            document.addEventListener("keydown", this._handleKeydown);
            this._activeSentenceIndex = -1;
            if (window.lucide) lucide.createIcons();
        }

        close() {
            if (!this.overlay?.classList?.contains("voice-video-player-modal--open")) return;
            this.overlay.classList.remove("voice-video-player-modal--open");
            this.overlay.setAttribute("aria-hidden", "true");
            this._closeDownloadDropdown();
            document.body?.classList.remove("voice-video-player-modal-open");
            document.removeEventListener("keydown", this._handleKeydown);
            if (this.videoEl) {
                this.videoEl.pause();
                this.videoEl.removeAttribute("src");
                this.videoEl.load();
            }
            if (this.videoBlobUrl) {
                URL.revokeObjectURL(this.videoBlobUrl);
                this.videoBlobUrl = "";
            }
            this.videoBlobOriginal = null;
            this.cutMode = false;
            this._revokeTextTrackUrl();
        }
    }

    window.VoiceVideoPlayerModal = VoiceVideoPlayerModal;
})();
