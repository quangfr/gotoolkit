(function () {
    const STYLE_ID = "voice-video-player-styles";
    const GIFENC_ESM_URLS = [
        "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm",
        "https://unpkg.com/gifenc@1.0.3/dist/gifenc.esm.js"
    ];
    const FFMPEG_ESM_URLS = [
        "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm",
        "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"
    ];
    const FFMPEG_UTIL_ESM_URLS = [
        "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm",
        "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js"
    ];
    const FFMPEG_CORE_BASE_URLS = [
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
        "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm"
    ];
    const VOICE_RECORDING_SPEED_STORAGE_KEY = "go-toolkit-voice-recording-speed";

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
                width: 98vw;
                max-height: 98vh;
                background: var(--bg-surface);
                border-radius: 12px;
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
            .voice-video-player-download {
                position: relative;
            }
            .voice-video-player-download > .chat-header-badge {
                top: -2px;
                right: -2px;
                padding: 0;
                min-width: 14px;
            }
            .voice-video-player-download svg {
                width: 18px;
                height: 18px;
            }
            .voice-video-player-download[disabled] {
                cursor: wait;
                opacity: 0.7;
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
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .voice-video-player-download-option__label {
                flex: 1;
            }
            .voice-video-player-download-option .chat-header-badge {
                position: static;
                min-width: 14px;
                width: 14px;
                height: 14px;
                padding: 0;
                border-width: 1.5px;
                border-style: solid;
                border-color: var(--bg-surface);
                flex: 0 0 auto;
            }
            .voice-video-player-download-option .chat-header-badge.chat-header-badge--idle {
                background: var(--border-main);
                border-color: var(--border-strong);
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
            .voice-video-player-toast {
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 12000;
                background: var(--bg-surface);
                color: var(--text-main);
                border: 1px solid var(--border-strong);
                border-radius: 10px;
                padding: 8px 12px;
                font-size: 12px;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
                opacity: 0;
                transform: translateY(8px);
                pointer-events: none;
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
            .voice-video-player-toast--visible {
                opacity: 1;
                transform: translateY(0);
            }
            .voice-video-player-toast--error {
                border-color: var(--intent-error-border);
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

    function buildTimestampForFilename(date = new Date()) {
        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${year}${month}${day}-${hours}${minutes}${seconds}`;
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
            this._gifEncoderLibPromise = null;
            this._ffmpegLoaderPromise = null;
            this._ffmpeg = null;
            this._gifDownloading = false;
            this._gifPrebuildTimer = null;
            this._gifPrebuildPromise = null;
            this._gifPrebuildPromiseKey = "";
            this._mp4BlobCache = null;
            this._mp4BlobCacheKey = "";
            this._mp4PrebuildPromise = null;
            this._mp4PrebuildPromiseKey = "";
            this._mp4LastBuildSeconds = 0;
            this._persistedExportCaches = { gifByKey: {}, mp4ByKey: {} };
            this.onVideoExportCacheUpdate = null;
            this._toastTimer = null;
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
                                <button type="button" class="voice-video-player-download" title="Télécharger" aria-label="Télécharger"><i data-lucide="download"></i><span class="chat-header-badge" aria-hidden="true"></span></button>
                                    <div class="voice-video-player-download-dropdown" hidden>
                                        <button type="button" class="voice-video-player-download-option" data-download-format="video-webm">Vidéo WebM</button>
                                        <button type="button" class="voice-video-player-download-option" data-download-format="video-mp4">Vidéo MP4</button>
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
            this._downloadButtonBaseHtml = this.downloadButton?.innerHTML || '<i data-lucide="download"></i>';
            this.downloadMenuWrap = this.overlay.querySelector(".voice-video-player-download-wrap");
            this.downloadDropdown = this.overlay.querySelector(".voice-video-player-download-dropdown");
            this.downloadVideoWebmOption = this.overlay.querySelector('[data-download-format="video-webm"]');
            this.downloadVideoMp4Option = this.overlay.querySelector('[data-download-format="video-mp4"]');
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
            this.toastEl = document.createElement("div");
            this.toastEl.className = "voice-video-player-toast";
            this.toastEl.setAttribute("role", "status");
            this.toastEl.setAttribute("aria-live", "polite");
            (document.body || document.documentElement).appendChild(this.toastEl);
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

        _showToast(message, isError = false) {
            if (!this.toastEl) return;
            this.toastEl.textContent = String(message || "");
            this.toastEl.classList.remove("voice-video-player-toast--error");
            this.toastEl.classList.add("voice-video-player-toast--visible");
            if (this._toastTimer) clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => {
                if (!this.toastEl) return;
                this.toastEl.classList.remove("voice-video-player-toast--visible");
            }, 1800);
        }

        _setGifDownloadLoading(isLoading) {
            this._gifDownloading = Boolean(isLoading);
            if (!this.downloadButton) return;
            if (this._gifDownloading) {
                this.downloadButton.disabled = true;
                this.downloadButton.setAttribute("aria-busy", "true");
                this.downloadButton.innerHTML = '<i data-lucide="loader-2" class="lucide-spin"></i>';
                this.downloadVideoWebmOption && (this.downloadVideoWebmOption.disabled = true);
                this.downloadVideoMp4Option && (this.downloadVideoMp4Option.disabled = true);
                this.downloadGifOption && (this.downloadGifOption.disabled = true);
            } else {
                this.downloadButton.disabled = false;
                this.downloadButton.removeAttribute("aria-busy");
                this.downloadButton.innerHTML = this._downloadButtonBaseHtml;
                this.downloadVideoWebmOption && (this.downloadVideoWebmOption.disabled = false);
                this.downloadVideoMp4Option && (this.downloadVideoMp4Option.disabled = false);
                this.downloadGifOption && (this.downloadGifOption.disabled = false);
            }
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
            if (window.lucide) lucide.createIcons();
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
                if (this._gifDownloading) return;
                this._toggleDownloadDropdown();
            });
            this.downloadVideoWebmOption?.addEventListener("click", async () => {
                if (this._gifDownloading) return;
                this._closeDownloadDropdown();
                await this._handleDownloadVideoWebm();
            });
            this.downloadVideoMp4Option?.addEventListener("click", async () => {
                if (this._gifDownloading) return;
                this._closeDownloadDropdown();
                await this._handleDownloadVideoMp4();
            });
            this.downloadGifOption?.addEventListener("click", async () => {
                if (this._gifDownloading) return;
                this._closeDownloadDropdown();
                await this._handleDownloadGif();
            });
            window.addEventListener("go-toolkit:voice-recording-speed-changed", event => {
                const nextSpeed = normalizeVoiceRecordingSpeed(event?.detail?.speed);
                this.setPlaybackRate(nextSpeed, { emitChange: false });
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
                if (this._hasCutRange()) {
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
            if (!Number.isFinite(value) || value <= 0) return "0.0MB";
            const mb = value / (1024 * 1024);
            return `${mb.toFixed(1)}MB`;
        }

        _formatSecondsLabel(seconds) {
            const value = Number(seconds);
            if (!Number.isFinite(value) || value <= 0) return "1s";
            if (value < 10) return `${Math.max(1, Math.round(value))}s`;
            return `${Math.round(value)}s`;
        }

        _sanitizeFileBaseName(rawName) {
            return String(rawName || "")
                .trim()
                .replace(/[\\/:*?"<>|]+/g, "-")
                .replace(/\s+/g, "_")
                .replace(/_+/g, "_")
                .replace(/^[_\-.]+|[_\-.]+$/g, "")
                .slice(0, 80);
        }

        _buildExportFilename(ext, isCut = false) {
            const baseName = this._sanitizeFileBaseName(this.memoName) || "document";
            const stamp = buildTimestampForFilename(new Date());
            const cutSuffix = isCut ? "-cut" : "";
            return `${baseName}-${stamp}${cutSuffix}.${ext}`;
        }

        _triggerBlobDownload(blob, filename) {
            if (!(blob instanceof Blob) || blob.size <= 0) return false;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.style.display = "none";
            document.body.appendChild(a);
            let triggered = false;
            try {
                a.click();
                triggered = true;
            } catch (err) {
                triggered = false;
            }
            if (!triggered) {
                try {
                    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
                    a.dispatchEvent(evt);
                    triggered = true;
                } catch (err) {
                    triggered = false;
                }
            }
            document.body.removeChild(a);
            // Keep URL alive longer to avoid early revoke races on some browsers.
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (err) { /* noop */ }
            }, 30000);
            if (!triggered) {
                try {
                    window.open(url, "_blank", "noopener,noreferrer");
                    triggered = true;
                } catch (err) {
                    triggered = false;
                }
            }
            return triggered;
        }

        async _prepareSaveTarget(ext, isCut = false) {
            if (typeof window === "undefined" || typeof window.showSaveFilePicker !== "function") return null;
            const extension = String(ext || "").toLowerCase();
            const mimeByExt = {
                webm: "video/webm",
                mp4: "video/mp4",
                gif: "image/gif"
            };
            const mime = mimeByExt[extension] || "application/octet-stream";
            const suggestedName = this._buildExportFilename(extension || "bin", isCut);
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName,
                    types: [{
                        description: `${extension.toUpperCase()} file`,
                        accept: { [mime]: [`.${extension}`] }
                    }]
                });
                return { handle, suggestedName };
            } catch (err) {
                if (err?.name === "AbortError") return { aborted: true, suggestedName };
                return { handle: null, suggestedName };
            }
        }

        async _writeBlobToSaveTarget(saveTarget, blob) {
            if (!saveTarget?.handle || !(blob instanceof Blob) || blob.size <= 0) return false;
            try {
                const writer = await saveTarget.handle.createWritable();
                await writer.write(blob);
                await writer.close();
                return true;
            } catch (err) {
                return false;
            }
        }

        _getGifExportConfig(sourceWidth, sourceHeight, duration, speed = this._getExportSpeed()) {
            const safeWidth = Math.max(1, Number(sourceWidth) || 640);
            const safeHeight = Math.max(1, Number(sourceHeight) || 360);
            const safeDuration = Math.max(0.1, Number(duration) || 0.1);
            const safeSpeed = Math.min(4, Math.max(0.4, Number(speed) || 1.2));
            const exportDuration = Math.max(0.05, safeDuration / safeSpeed);

            // GIF SD profile: max 576px height, keep aspect ratio.
            const scale = Math.min(1, 576 / safeHeight);
            const width = Math.max(2, Math.round(safeWidth * scale));
            const height = Math.max(2, Math.round(safeHeight * scale));

            const fps = 10;
            const frameCount = Math.max(1, Math.ceil(exportDuration * fps));
            const delay = Math.round(1000 / fps);

            return { width, height, fps, delay, frameCount };
        }

        _getExportSpeed() {
            return this._getSelectedSpeed();
        }

        _estimateGifBytes() {
            const duration = this._hasCutRange() ? Math.max(0.1, this.cutEnd - this.cutStart) : Math.max(0.1, this.videoEl?.duration || 0);
            const speed = this._getExportSpeed();
            const sourceWidth = this.videoEl?.videoWidth || 640;
            const sourceHeight = this.videoEl?.videoHeight || 360;
            const { width: targetWidth, height: targetHeight, frameCount: frames } = this._getGifExportConfig(sourceWidth, sourceHeight, duration, speed);
            // Heuristic average bytes/frame for GIF with moderate quality
            const bytesPerFrame = Math.max(2500, Math.round((targetWidth * targetHeight) / 18));
            return frames * bytesPerFrame;
        }

        _estimateGifBuildSeconds() {
            const duration = this._hasCutRange() ? Math.max(0.1, this.cutEnd - this.cutStart) : Math.max(0.1, this.videoEl?.duration || 0);
            const speed = this._getExportSpeed();
            const sourceWidth = this.videoEl?.videoWidth || 640;
            const sourceHeight = this.videoEl?.videoHeight || 360;
            const { width, height, frameCount } = this._getGifExportConfig(sourceWidth, sourceHeight, duration, speed);
            const mpix = (width * height) / 1000000;
            const workers = Math.max(1, Math.min(4, (navigator?.hardwareConcurrency || 4) - 1));
            // Deliberately conservative: user requested estimate to be much higher.
            const baseSeconds = 1.2 + ((frameCount * Math.max(0.25, mpix)) / (workers * 7));
            return Math.max(1, Math.round(baseSeconds * 10));
        }

        _estimateMp4Bytes() {
            const source = this._hasCutRange() ? this._trimmedBlob : this.videoBlobOriginal;
            const sourceSize = source?.size || this.videoBlobOriginal?.size || 0;
            if (!sourceSize) return 0;
            // Conservative estimate: MP4 output is often slightly smaller than the source recording.
            return Math.max(1024, Math.round(sourceSize * 0.82));
        }

        _estimateMp4BuildSeconds() {
            if (this._mp4LastBuildSeconds > 0) return this._mp4LastBuildSeconds;
            const speed = this._getExportSpeed();
            const duration = this._hasCutRange()
                ? Math.max(0.1, this.cutEnd - this.cutStart)
                : Math.max(0.1, this.videoEl?.duration || 0);
            const effectiveDuration = Math.max(0.05, duration / speed);
            const sourceWidth = this.videoEl?.videoWidth || 640;
            const sourceHeight = this.videoEl?.videoHeight || 360;
            const mpix = (sourceWidth * sourceHeight) / 1000000;
            const workers = Math.max(1, Math.min(4, (navigator?.hardwareConcurrency || 4) - 1));
            const baseSeconds = 2 + ((effectiveDuration * Math.max(0.6, mpix)) / Math.max(1, workers * 0.9));
            return Math.max(1, Math.round(baseSeconds));
        }

        _getMp4CacheKey() {
            if (!this.videoBlobOriginal) return "";
            const speed = this._getExportSpeed().toFixed(1);
            const bounds = this._hasCutRange()
                ? `${this.cutStart.toFixed(3)}:${this.cutEnd.toFixed(3)}`
                : `0:${(this.videoEl?.duration || 0).toFixed(3)}`;
            return `${bounds}:speed=${speed}:${this.videoBlobOriginal.size}:${this.videoBlobOriginal.type || "video/webm"}`;
        }

        _normalizeExportCaches(raw) {
            const source = raw && typeof raw === "object" ? raw : {};
            const normalized = {
                gifByKey: {},
                mp4ByKey: {}
            };
            const gifEntries = source.gifByKey && typeof source.gifByKey === "object" ? source.gifByKey : {};
            const mp4Entries = source.mp4ByKey && typeof source.mp4ByKey === "object" ? source.mp4ByKey : {};
            Object.keys(gifEntries).forEach(key => {
                if (!key) return;
                const value = gifEntries[key];
                if (value instanceof Blob) normalized.gifByKey[key] = value;
            });
            Object.keys(mp4Entries).forEach(key => {
                if (!key) return;
                const value = mp4Entries[key];
                if (value instanceof Blob) normalized.mp4ByKey[key] = value;
            });
            return normalized;
        }

        _getPersistedBlob(kind, cacheKey) {
            if (!cacheKey) return null;
            const bucket = kind === "mp4" ? "mp4ByKey" : "gifByKey";
            const map = this._persistedExportCaches?.[bucket];
            const value = map?.[cacheKey];
            return value instanceof Blob ? value : null;
        }

        _persistExportBlob(kind, cacheKey, blob) {
            if (!cacheKey || !(blob instanceof Blob)) return;
            const bucket = kind === "mp4" ? "mp4ByKey" : "gifByKey";
            if (!this._persistedExportCaches || typeof this._persistedExportCaches !== "object") {
                this._persistedExportCaches = { gifByKey: {}, mp4ByKey: {} };
            }
            if (!this._persistedExportCaches[bucket] || typeof this._persistedExportCaches[bucket] !== "object") {
                this._persistedExportCaches[bucket] = {};
            }
            this._persistedExportCaches[bucket][cacheKey] = blob;
            if (typeof this.onVideoExportCacheUpdate === "function") {
                const snapshot = {
                    gifByKey: { ...this._persistedExportCaches.gifByKey },
                    mp4ByKey: { ...this._persistedExportCaches.mp4ByKey }
                };
                Promise.resolve(this.onVideoExportCacheUpdate(snapshot)).catch(() => null);
            }
        }

        _restorePersistedExportCachesForCurrentKey() {
            const gifKey = this._getGifCacheKey();
            const gifBlob = this._getPersistedBlob("gif", gifKey);
            if (gifBlob) {
                this._gifBlobCache = gifBlob;
                this._gifBlobCacheKey = gifKey;
            }
            const mp4Key = this._getMp4CacheKey();
            const mp4Blob = this._getPersistedBlob("mp4", mp4Key);
            if (mp4Blob) {
                this._mp4BlobCache = mp4Blob;
                this._mp4BlobCacheKey = mp4Key;
            }
        }

        _getGifStatus() {
            const cacheKey = this._getGifCacheKey();
            if (this._gifBlobCache?.size && this._gifBlobCacheKey === cacheKey) return "ready";
            if (this._gifDownloading) return "running";
            if (this._gifPrebuildPromise && this._gifPrebuildPromiseKey === cacheKey) return "running";
            return "idle";
        }

        _getMp4Status() {
            const cacheKey = this._getMp4CacheKey();
            if (this._mp4BlobCache?.size && this._mp4BlobCacheKey === cacheKey) return "ready";
            if (this._mp4PrebuildPromise && this._mp4PrebuildPromiseKey === cacheKey) return "running";
            return "idle";
        }

        _renderOptionWithStatus(option, status, label) {
            if (!option) return;
            const safeStatus = status === "ready" || status === "running" ? status : "idle";
            const badgeClass = safeStatus === "running"
                ? "chat-header-badge chat-header-badge--pending"
                : (safeStatus === "idle" ? "chat-header-badge chat-header-badge--idle" : "chat-header-badge");
            option.innerHTML = `<span class="${badgeClass}" aria-hidden="true"></span><span class="voice-video-player-download-option__label">${label}</span>`;
        }

        _updateConversionBadges() {
            const gifStatus = this._getGifStatus();
            const mp4Status = this._getMp4Status();
            const isRunning = gifStatus === "running" || mp4Status === "running";
            const downloadBadge = this.downloadButton?.querySelector(".chat-header-badge");
            if (downloadBadge) {
                downloadBadge.classList.toggle("chat-header-badge--pending", isRunning);
            }
            try {
                window.dispatchEvent(new CustomEvent("go-toolkit:voice-conversion-status", {
                    detail: {
                        running: isRunning,
                        gif: gifStatus,
                        mp4: mp4Status
                    }
                }));
            } catch (err) { /* noop */ }
        }

        _refreshDropdownStatusesIfOpen() {
            if (!this.downloadDropdown || this.downloadDropdown.hidden) return;
            this._updateDownloadOptionLabels().catch(() => null);
        }

        async _updateDownloadOptionLabels() {
            const videoBlob = await this._getOutputBlob().catch(() => this.videoBlobOriginal);
            const videoSize = videoBlob?.size || this.videoBlobOriginal?.size || 0;
            const gifStatus = this._getGifStatus();
            const mp4Status = this._getMp4Status();
            const gifSize = gifStatus === "ready" ? this._gifBlobCache.size : 0;
            const mp4Ready = mp4Status === "ready";
            const mp4Size = mp4Ready ? this._mp4BlobCache.size : this._estimateMp4Bytes();
            if (this.downloadVideoWebmOption) {
                this._renderOptionWithStatus(this.downloadVideoWebmOption, "ready", `WebM FHD (${this._formatMbLabel(videoSize)})`);
            }
            if (this.downloadVideoMp4Option) {
                if (mp4Ready) {
                    this._renderOptionWithStatus(this.downloadVideoMp4Option, mp4Status, `MP4 HD (${this._formatMbLabel(mp4Size)})`);
                } else {
                    if (mp4Status === "running") {
                        const eta = this._formatSecondsLabel(this._estimateMp4BuildSeconds());
                        this._renderOptionWithStatus(this.downloadVideoMp4Option, mp4Status, `MP4 HD (~${eta}, ${this._formatMbLabel(mp4Size)})`);
                    } else {
                        this._renderOptionWithStatus(this.downloadVideoMp4Option, mp4Status, `MP4 HD (${this._formatMbLabel(mp4Size)})`);
                    }
                }
            }
            if (this.downloadGifOption) {
                const runningGifLabel = `GIF SD (~${this._formatSecondsLabel(this._estimateGifBuildSeconds())}, ${this._formatMbLabel(this._estimateGifBytes())})`;
                this._renderOptionWithStatus(
                    this.downloadGifOption,
                    gifStatus,
                    gifSize > 0
                        ? `GIF SD (${this._formatMbLabel(gifSize)})`
                        : (gifStatus === "running" ? runningGifLabel : `GIF SD (${this._formatMbLabel(this._estimateGifBytes())})`)
                );
            }
            this._updateConversionBadges();
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

        _clearGifPrebuildSchedule() {
            if (this._gifPrebuildTimer) {
                clearTimeout(this._gifPrebuildTimer);
                this._gifPrebuildTimer = null;
            }
        }

        _scheduleGifPrebuild() {
            this._clearGifPrebuildSchedule();
            if (!this.videoBlobOriginal || this._gifDownloading) return;
            this._gifPrebuildTimer = setTimeout(() => {
                this._gifPrebuildTimer = null;
                this._startExportPrebuildInBackground();
            }, 1200);
        }

        async _startExportPrebuildInBackground() {
            await this._startGifPrebuildInBackground().catch(() => null);
            await this._startMp4PrebuildInBackground().catch(() => null);
        }

        async _startGifPrebuildInBackground() {
            if (!this.videoBlobOriginal || this._gifDownloading) return;
            this._restorePersistedExportCachesForCurrentKey();
            const cacheKey = this._getGifCacheKey();
            if (!cacheKey) return;
            if (this._gifBlobCache && this._gifBlobCacheKey === cacheKey) return;
            if (this._gifPrebuildPromise && this._gifPrebuildPromiseKey === cacheKey) return this._gifPrebuildPromise;
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();

            const run = (async () => {
                try {
                    const blob = await this._buildGifBlob();
                    if (blob && this.videoBlobOriginal && this._getGifCacheKey() === cacheKey) {
                        this._gifBlobCache = blob;
                        this._gifBlobCacheKey = cacheKey;
                        this._persistExportBlob("gif", cacheKey, blob);
                    }
                } catch (err) {
                    // Background warmup intentionally silent.
                } finally {
                    if (this._gifPrebuildPromiseKey === cacheKey) {
                        this._gifPrebuildPromise = null;
                        this._gifPrebuildPromiseKey = "";
                    }
                    this._updateConversionBadges();
                    this._refreshDropdownStatusesIfOpen();
                }
            })();
            this._gifPrebuildPromise = run;
            this._gifPrebuildPromiseKey = cacheKey;
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
            return run;
        }

        async _startMp4PrebuildInBackground() {
            if (!this.videoBlobOriginal || this._gifDownloading) return;
            this._restorePersistedExportCachesForCurrentKey();
            const cacheKey = this._getMp4CacheKey();
            if (!cacheKey) return;
            if (this._mp4BlobCache && this._mp4BlobCacheKey === cacheKey) return this._mp4BlobCache;
            if (this._mp4PrebuildPromise && this._mp4PrebuildPromiseKey === cacheKey) return this._mp4PrebuildPromise;
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();

            const run = (async () => {
                const startedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
                try {
                    const blob = await this._getOutputBlobAsMp4();
                    if (blob && this.videoBlobOriginal && this._getMp4CacheKey() === cacheKey) {
                        this._mp4BlobCache = blob;
                        this._mp4BlobCacheKey = cacheKey;
                        this._persistExportBlob("mp4", cacheKey, blob);
                        const endedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
                        this._mp4LastBuildSeconds = Math.max(1, Math.round((endedAt - startedAt) / 1000));
                    }
                } catch (err) {
                    // Background warmup intentionally silent.
                } finally {
                    if (this._mp4PrebuildPromiseKey === cacheKey) {
                        this._mp4PrebuildPromise = null;
                        this._mp4PrebuildPromiseKey = "";
                    }
                    this._updateConversionBadges();
                    this._refreshDropdownStatusesIfOpen();
                }
            })();
            this._mp4PrebuildPromise = run;
            this._mp4PrebuildPromiseKey = cacheKey;
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
            return run;
        }

        async _ensureGifEncoderLib() {
            if (this._gifEncoderLibPromise) return this._gifEncoderLibPromise;
            this._gifEncoderLibPromise = (async () => {
                let lastError = null;
                for (let i = 0; i < GIFENC_ESM_URLS.length; i += 1) {
                    const url = GIFENC_ESM_URLS[i];
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        const mod = await import(/* @vite-ignore */ url);
                        const GIFEncoder = mod?.GIFEncoder;
                        const quantize = mod?.quantize;
                        const applyPalette = mod?.applyPalette;
                        if (GIFEncoder && quantize && applyPalette) {
                            return { GIFEncoder, quantize, applyPalette };
                        }
                    } catch (err) {
                        lastError = err;
                    }
                }
                throw new Error(lastError?.message || "gifenc introuvable");
            })();
            return this._gifEncoderLibPromise;
        }

        async _ensureFfmpegLib() {
            if (this._ffmpegLoaderPromise) return this._ffmpegLoaderPromise;
            this._ffmpegLoaderPromise = (async () => {
                let ffmpegMod = null;
                let utilMod = null;
                let lastError = null;

                for (let i = 0; i < FFMPEG_ESM_URLS.length; i += 1) {
                    const ffmpegUrl = FFMPEG_ESM_URLS[i];
                    const utilUrl = FFMPEG_UTIL_ESM_URLS[Math.min(i, FFMPEG_UTIL_ESM_URLS.length - 1)];
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        ffmpegMod = await import(/* @vite-ignore */ ffmpegUrl);
                        // eslint-disable-next-line no-await-in-loop
                        utilMod = await import(/* @vite-ignore */ utilUrl);
                        if (ffmpegMod?.FFmpeg && utilMod?.toBlobURL) break;
                    } catch (err) {
                        lastError = err;
                        ffmpegMod = null;
                        utilMod = null;
                    }
                }

                if (!ffmpegMod?.FFmpeg || !utilMod?.toBlobURL) {
                    throw new Error(lastError?.message || "ffmpeg.wasm introuvable");
                }

                const FFmpeg = ffmpegMod.FFmpeg;
                const toBlobURL = utilMod.toBlobURL;
                if (!this._ffmpeg) this._ffmpeg = new FFmpeg();
                if (typeof this._ffmpeg.loaded === "boolean" && this._ffmpeg.loaded) return this._ffmpeg;

                let loadError = null;
                for (let i = 0; i < FFMPEG_CORE_BASE_URLS.length; i += 1) {
                    const baseUrl = FFMPEG_CORE_BASE_URLS[i];
                    try {
                        // toBlobURL keeps worker/core on same-origin blob URLs to avoid Worker CORS issues.
                        // eslint-disable-next-line no-await-in-loop
                        const coreURL = await toBlobURL(`${baseUrl}/ffmpeg-core.js`, "text/javascript");
                        // eslint-disable-next-line no-await-in-loop
                        const wasmURL = await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, "application/wasm");
                        // eslint-disable-next-line no-await-in-loop
                        const workerURL = await toBlobURL(`${baseUrl}/ffmpeg-core.worker.js`, "text/javascript");
                        // eslint-disable-next-line no-await-in-loop
                        await this._ffmpeg.load({ coreURL, wasmURL, workerURL });
                        return this._ffmpeg;
                    } catch (err) {
                        loadError = err;
                    }
                }

                throw new Error(loadError?.message || "Chargement ffmpeg impossible");
            })().catch(err => {
                this._ffmpegLoaderPromise = null;
                throw err;
            });

            return this._ffmpegLoaderPromise;
        }

        async _buildMp4BlobWithFfmpegFallback() {
            if (!this.videoBlobOriginal) return null;
            const ffmpeg = await this._ensureFfmpegLib();

            let inputBlob = null;
            try {
                inputBlob = await this._recordSegmentBlob(
                    [
                        "video/webm;codecs=vp9,opus",
                        "video/webm;codecs=vp8,opus",
                        "video/webm"
                    ],
                    "video/webm"
                );
            } catch (err) {
                inputBlob = null;
            }

            if (!(inputBlob instanceof Blob) || inputBlob.size <= 0) {
                inputBlob = this.videoBlobOriginal;
            }
            if (!(inputBlob instanceof Blob) || inputBlob.size <= 0) return null;

            const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
            const inputName = `input-${stamp}.webm`;
            const outputName = `output-${stamp}.mp4`;
            try {
                await ffmpeg.writeFile(inputName, new Uint8Array(await inputBlob.arrayBuffer()));
                const rc = await ffmpeg.exec([
                    "-i", inputName,
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    "-c:a", "aac",
                    "-b:a", "128k",
                    outputName
                ]);
                if (Number(rc) !== 0) return null;
                const outputData = await ffmpeg.readFile(outputName);
                const bytes = outputData instanceof Uint8Array
                    ? outputData
                    : new Uint8Array(outputData?.buffer || outputData || []);
                if (!bytes.length) return null;
                return new Blob([bytes], { type: "video/mp4" });
            } catch (err) {
                return null;
            } finally {
                try { await ffmpeg.deleteFile(inputName); } catch (err) { /* noop */ }
                try { await ffmpeg.deleteFile(outputName); } catch (err) { /* noop */ }
            }
        }

        _getGifCacheKey() {
            if (!this.videoBlobOriginal) return "";
            const speed = this._getExportSpeed().toFixed(1);
            const bounds = this._hasCutRange()
                ? `${this.cutStart.toFixed(3)}:${this.cutEnd.toFixed(3)}`
                : `0:${(this.videoEl?.duration || 0).toFixed(3)}`;
            return `${bounds}:speed=${speed}:${this.videoBlobOriginal.size}:${this.videoBlobOriginal.type || "video/webm"}`;
        }

        async _buildGifBlobWithGifenc() {
            if (!this.videoBlobOriginal) return null;
            console.info("[GoToolkit GIF] build start");
            const gifLib = await this._ensureGifEncoderLib();
            const { GIFEncoder, quantize, applyPalette } = gifLib;
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
            const exportSpeed = this._getExportSpeed();
            const sourceWidth = video.videoWidth || 640;
            const sourceHeight = video.videoHeight || 360;
            const exportConfig = this._getGifExportConfig(sourceWidth, sourceHeight, end - start, exportSpeed);
            const { width, height, fps, delay, frameCount } = exportConfig;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
            if (!ctx) {
                URL.revokeObjectURL(sourceUrl);
                throw new Error("Canvas indisponible");
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            const seekTo = time => new Promise(resolve => {
                const bounded = Math.max(0, Math.min(duration, time));
                if (Math.abs((video.currentTime || 0) - bounded) < 0.001) {
                    resolve();
                    return;
                }
                const onSeeked = () => {
                    clearTimeout(timer);
                    video.removeEventListener("seeked", onSeeked);
                    resolve();
                };
                const timer = setTimeout(() => {
                    video.removeEventListener("seeked", onSeeked);
                    resolve();
                }, 800);
                video.addEventListener("seeked", onSeeked);
                video.currentTime = bounded;
            });

            const gif = GIFEncoder();
            for (let i = 0; i < frameCount; i += 1) {
                const t = Math.min(end, start + ((i / fps) * exportSpeed));
                // eslint-disable-next-line no-await-in-loop
                await seekTo(t);
                ctx.drawImage(video, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const rgba = imageData.data;
                const palette = quantize(rgba, 128, { format: "rgb565" });
                const index = applyPalette(rgba, palette, "rgb565");
                gif.writeFrame(index, width, height, {
                    palette,
                    delay
                });
            }
            gif.finish();
            const blob = new Blob([gif.bytesView()], { type: "image/gif" });
            console.info("[GoToolkit GIF] build success", { size: blob?.size || 0, type: blob?.type || "" });
            try { URL.revokeObjectURL(sourceUrl); } catch (err) { /* noop */ }
            return blob;
        }

        async _buildGifBlob() {
            return this._buildGifBlobWithGifenc();
        }

        async _handleDownloadGif() {
            if (!this.videoBlobOriginal) return;
            if (this._gifDownloading) return;
            console.info("[GoToolkit GIF] download requested");
            this._setGifDownloadLoading(true);
            try {
                const saveTarget = await this._prepareSaveTarget("gif", this._hasCutRange());
                if (saveTarget?.aborted) return;
                this._restorePersistedExportCachesForCurrentKey();
                const cacheKey = this._getGifCacheKey();
                let gifBlob = null;
                if (this._gifBlobCache && this._gifBlobCacheKey === cacheKey) {
                    gifBlob = this._gifBlobCache;
                } else if (this._gifPrebuildPromise && this._gifPrebuildPromiseKey === cacheKey) {
                    await this._gifPrebuildPromise.catch(() => null);
                    if (this._gifBlobCache && this._gifBlobCacheKey === cacheKey) {
                        gifBlob = this._gifBlobCache;
                    }
                } else {
                    gifBlob = await this._buildGifBlob();
                    this._gifBlobCache = gifBlob;
                    this._gifBlobCacheKey = cacheKey;
                    this._persistExportBlob("gif", cacheKey, gifBlob);
                }
                if (!(gifBlob instanceof Blob) || gifBlob.size <= 0) {
                    throw new Error("GIF invalide");
                }
                const savedViaHandle = await this._writeBlobToSaveTarget(saveTarget, gifBlob);
                const triggered = savedViaHandle || this._triggerBlobDownload(
                    gifBlob,
                    saveTarget?.suggestedName || this._buildExportFilename("gif", this._hasCutRange())
                );
                if (!triggered) {
                    throw new Error("Téléchargement GIF bloqué");
                }
                console.info("[GoToolkit GIF] download triggered");
                this._showToast("GIF téléchargé");
            } catch (err) {
                console.error("[GoToolkit GIF] download failed", err);
                if (this.downloadGifOption) {
                    this.downloadGifOption.textContent = "Gif (échec)";
                }
                this._showToast("Export GIF impossible", true);
            } finally {
                this._setGifDownloadLoading(false);
                this._startMp4PrebuildInBackground().catch(() => null);
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
            if (!this._hasCutRange()) {
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
            this._mp4BlobCacheKey = "";
            this._mp4BlobCache = null;
            this._mp4PrebuildPromise = null;
            this._mp4PrebuildPromiseKey = "";
            this._mp4LastBuildSeconds = 0;
            this._restorePersistedExportCachesForCurrentKey();
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
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

        async _handleDownloadVideoWebm() {
            if (!this.videoBlobOriginal) return;
            const blobExt = ((this.videoBlobOriginal.type || "").includes("mp4")) ? "mp4" : "webm";
            const saveTarget = await this._prepareSaveTarget(blobExt, this._hasCutRange());
            if (saveTarget?.aborted) return;
            const blob = await this._getOutputBlob().catch(() => this.videoBlobOriginal);
            if (!blob) return;
            const ext = (blob.type || "").includes("webm") ? "webm" : ((blob.type || "").includes("mp4") ? "mp4" : "webm");
            const savedViaHandle = await this._writeBlobToSaveTarget(saveTarget, blob);
            const triggered = savedViaHandle || this._triggerBlobDownload(
                blob,
                saveTarget?.suggestedName || this._buildExportFilename(ext, this._hasCutRange())
            );
            if (!triggered) {
                this._showToast("Téléchargement bloqué par le navigateur", true);
                return;
            }
            this._showToast("Vidéo WebM téléchargée");
        }

        async _handleDownloadVideoMp4() {
            if (!this.videoBlobOriginal) return;
            try {
                const saveTarget = await this._prepareSaveTarget("mp4", this._hasCutRange());
                if (saveTarget?.aborted) return;
                this._restorePersistedExportCachesForCurrentKey();
                const cacheKey = this._getMp4CacheKey();
                const startedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
                let blob = null;
                if (this._mp4BlobCache && this._mp4BlobCacheKey === cacheKey) {
                    blob = this._mp4BlobCache;
                } else if (this._mp4PrebuildPromise && this._mp4PrebuildPromiseKey === cacheKey) {
                    await this._mp4PrebuildPromise.catch(() => null);
                    if (this._mp4BlobCache && this._mp4BlobCacheKey === cacheKey) {
                        blob = this._mp4BlobCache;
                    }
                }
                if (!blob) {
                    blob = await this._getOutputBlobAsMp4();
                    if (blob) {
                        this._mp4BlobCache = blob;
                        this._mp4BlobCacheKey = cacheKey;
                        this._persistExportBlob("mp4", cacheKey, blob);
                    }
                }
                if (!blob) {
                    this._showToast("Conversion MP4 impossible sur ce navigateur", true);
                    return;
                }
                const endedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
                this._mp4LastBuildSeconds = Math.max(1, Math.round((endedAt - startedAt) / 1000));
                const savedViaHandle = await this._writeBlobToSaveTarget(saveTarget, blob);
                const triggered = savedViaHandle || this._triggerBlobDownload(
                    blob,
                    saveTarget?.suggestedName || this._buildExportFilename("mp4", this._hasCutRange())
                );
                if (!triggered) {
                    this._showToast("Téléchargement bloqué par le navigateur", true);
                    return;
                }
                this._showToast("Vidéo MP4 téléchargée");
            } catch (err) {
                this._showToast("Conversion MP4 impossible sur ce navigateur", true);
            }
        }

        async _getOutputBlob() {
            if (!this.videoBlobOriginal || !this._hasCutRange()) return this.videoBlobOriginal;
            const speed = this._getExportSpeed().toFixed(1);
            const key = `${this.cutStart.toFixed(3)}:${this.cutEnd.toFixed(3)}:speed=${speed}:${this.videoBlobOriginal.size}:${this.videoBlobOriginal.type || "video/webm"}`;
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
            return this._recordSegmentBlob(
                [
                    "video/webm;codecs=vp9,opus",
                    "video/webm;codecs=vp8,opus",
                    "video/webm"
                ],
                "video/webm"
            );
        }

        async _getOutputBlobAsMp4() {
            if (!this.videoBlobOriginal) return null;
            const mp4MimeCandidates = [
                "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
                "video/mp4;codecs=avc1,mp4a.40.2",
                "video/mp4"
            ];
            if (!this._hasCutRange()) {
                // If source is already MP4, download as-is.
                if ((this.videoBlobOriginal.type || "").includes("mp4")) return this.videoBlobOriginal;
                const converted = await this._recordSegmentBlob(mp4MimeCandidates, "video/mp4");
                if (converted && (converted.type || "").includes("mp4")) return converted;
                return this._buildMp4BlobWithFfmpegFallback();
            }
            const trimmed = await this._recordSegmentBlob(mp4MimeCandidates, "video/mp4");
            if (trimmed && (trimmed.type || "").includes("mp4")) return trimmed;
            return this._buildMp4BlobWithFfmpegFallback();
        }

        async _recordSegmentBlob(preferredMimeTypes = [], fallbackType = "video/webm") {
            if (!this.videoBlobOriginal) return this.videoBlobOriginal;
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
            const exportSpeed = this._getExportSpeed();
            sourceVideo.playbackRate = exportSpeed;
            const sourceStream = sourceVideo.captureStream ? sourceVideo.captureStream() : (sourceVideo.mozCaptureStream ? sourceVideo.mozCaptureStream() : null);
            if (!sourceStream) {
                URL.revokeObjectURL(sourceUrl);
                return null;
            }
            const srcW = Math.max(2, sourceVideo.videoWidth || 1280);
            const srcH = Math.max(2, sourceVideo.videoHeight || 720);
            const scale = Math.min(1, 720 / srcH);
            const targetW = Math.max(2, Math.round(srcW * scale));
            const targetH = Math.max(2, Math.round(srcH * scale));
            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
            if (!ctx) {
                try { sourceStream.getTracks().forEach(track => track.stop()); } catch (err) { /* noop */ }
                URL.revokeObjectURL(sourceUrl);
                return null;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            let rafId = 0;
            const drawFrame = () => {
                try { ctx.drawImage(sourceVideo, 0, 0, targetW, targetH); } catch (err) { /* noop */ }
                rafId = requestAnimationFrame(drawFrame);
            };
            rafId = requestAnimationFrame(drawFrame);
            const canvasStream = canvas.captureStream(12);
            const stream = new MediaStream([
                ...(canvasStream.getVideoTracks() || []),
                ...(sourceStream.getAudioTracks() || [])
            ]);
            let recorder = null;
            for (const mimeType of preferredMimeTypes) {
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
                    return null;
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
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = 0;
                    }
                    try { sourceVideo.pause(); } catch (err) { /* noop */ }
                    try { canvasStream.getTracks().forEach(track => track.stop()); } catch (err) { /* noop */ }
                    try { sourceStream.getTracks().forEach(track => track.stop()); } catch (err) { /* noop */ }
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
            if (!chunks.length) return null;
            return new Blob(chunks, { type: recorder.mimeType || fallbackType || "video/webm" });
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
            for (let speed = 0.4; speed <= 4.001; speed += 0.2) {
                const normalized = Math.round(speed * 10) / 10;
                const option = document.createElement("option");
                option.value = normalized.toFixed(1);
                option.textContent = `${normalized.toFixed(1)}x`;
                this.speedSelect.appendChild(option);
            }
            this.speedSelect.value = normalizeVoiceRecordingSpeed(getConfiguredVoiceRecordingSpeed()).toFixed(1);
        }

        _getSelectedSpeed() {
            if (!this.speedSelect) return 1.2;
            const numeric = parseFloat(this.speedSelect.value);
            if (!Number.isFinite(numeric)) return 1.2;
            return Math.min(4, Math.max(0.4, Math.round(numeric * 10) / 10));
        }

        setPlaybackRate(value, { emitChange = false } = {}) {
            if (!this.speedSelect) return;
            const numeric = Number(value);
            const normalized = Math.min(4, Math.max(0.4, Math.round((Number.isFinite(numeric) ? numeric : 1.2) * 10) / 10));
            this.speedSelect.value = normalized.toFixed(1);
            this._applyPlaybackRate(emitChange);
        }

        _applyPlaybackRate(emitChange = false) {
            if (!this.videoEl) return;
            const rate = this._getSelectedSpeed();
            this.videoEl.playbackRate = rate;
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
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
            const sameBlob = this.videoBlobOriginal === blob;
            this.videoBlobOriginal = blob;
            this.cutMode = false;
            this.cutSelectionStep = "start";
            this.cutStart = 0;
            this.cutEnd = 0;
            this._trimCacheKey = "";
            this._trimmedBlob = null;
            this._clearGifPrebuildSchedule();
            this._gifPrebuildPromise = null;
            this._gifPrebuildPromiseKey = "";
            this._mp4PrebuildPromise = null;
            this._mp4PrebuildPromiseKey = "";
            this._mp4LastBuildSeconds = 0;
            if (!sameBlob) {
                this._gifBlobCacheKey = "";
                this._gifBlobCache = null;
                this._mp4BlobCacheKey = "";
                this._mp4BlobCache = null;
            }
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
            if (!sameBlob) {
                if (this.videoBlobUrl) {
                    URL.revokeObjectURL(this.videoBlobUrl);
                    this.videoBlobUrl = "";
                }
                this.videoBlobUrl = URL.createObjectURL(blob);
            }
            this.videoEl.src = this.videoBlobUrl;
            this._applyPlaybackRate();
            this.videoEl.load();
            this.progress && (this.progress.value = "0");
            this.timeLabel && (this.timeLabel.textContent = "00:00 / 00:00");
            this._updatePlayButton();
        }

        async prewarmGif(videoBlob) {
            if (!videoBlob) return;
            this._applyVideoBlob(videoBlob);
            await this._startExportPrebuildInBackground();
        }

        open(options = {}) {
            const {
                videoBlob,
                sentences = [],
                onTranscriptChange,
                onTranscriptSaved,
                memoName = "",
                onDelete,
                onCopyAudio,
                onCopyVideo,
                onPublish = null,
                youtubeUrl = "",
                persistedVideoExports = null,
                onVideoExportCacheUpdate = null
            } = options;
            if (!videoBlob) return;
            this.onTranscriptChange = typeof onTranscriptChange === "function" ? onTranscriptChange : null;
            this.onTranscriptSaved = typeof onTranscriptSaved === "function" ? onTranscriptSaved : null;
            this.onDelete = typeof onDelete === "function" ? onDelete : null;
            this.onCopyAudio = typeof onCopyAudio === "function" ? onCopyAudio : null;
            this.onCopyVideo = typeof onCopyVideo === "function" ? onCopyVideo : null;
            this.onPublish = typeof onPublish === "function" ? onPublish : null;
            this.onVideoExportCacheUpdate = typeof onVideoExportCacheUpdate === "function" ? onVideoExportCacheUpdate : null;
            this._persistedExportCaches = this._normalizeExportCaches(persistedVideoExports);
            this.setYoutubeUrl(youtubeUrl);
            this._normalizeSentences(sentences);
            this._renderSentences();
            this._applyVideoBlob(videoBlob);
            this.memoName = memoName || "";
            this.setPlaybackRate(getConfiguredVoiceRecordingSpeed(), { emitChange: false });
            this._syncCutUiState();
            this._restorePersistedExportCachesForCurrentKey();
            this._closeDownloadDropdown();
            this._setGifDownloadLoading(false);
            this.overlay.classList.add("voice-video-player-modal--open");
            this.overlay.setAttribute("aria-hidden", "false");
            document.body?.classList.add("voice-video-player-modal-open");
            document.addEventListener("keydown", this._handleKeydown);
            this._activeSentenceIndex = -1;
            if (window.lucide) lucide.createIcons();
            this._scheduleGifPrebuild();
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
        }

        close() {
            if (!this.overlay?.classList?.contains("voice-video-player-modal--open")) return;
            this.overlay.classList.remove("voice-video-player-modal--open");
            this.overlay.setAttribute("aria-hidden", "true");
            this._closeDownloadDropdown();
            this._setGifDownloadLoading(false);
            this._clearGifPrebuildSchedule();
            this._gifPrebuildPromise = null;
            this._gifPrebuildPromiseKey = "";
            this._mp4PrebuildPromise = null;
            this._mp4PrebuildPromiseKey = "";
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
            this._gifEncoderLibPromise = null;
            this._mp4BlobCache = null;
            this._mp4BlobCacheKey = "";
            this._mp4LastBuildSeconds = 0;
            this.onVideoExportCacheUpdate = null;
            this._persistedExportCaches = { gifByKey: {}, mp4ByKey: {} };
            this._updateConversionBadges();
            this._refreshDropdownStatusesIfOpen();
            if (this._toastTimer) {
                clearTimeout(this._toastTimer);
                this._toastTimer = null;
            }
            if (this.toastEl) {
                this.toastEl.classList.remove("voice-video-player-toast--visible");
            }
        }
    }

    window.VoiceVideoPlayerModal = VoiceVideoPlayerModal;
})();
