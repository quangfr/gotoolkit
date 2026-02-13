(function () {
    const STYLE_ID = "voice-video-player-styles";

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
            .voice-video-player-play-toggle,
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
                flex: 1;
                appearance: none;
                height: 6px;
                border-radius: 6px;
                background: var(--border-main);
                outline: none;
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
                            <button type="button" class="voice-video-player-publish btn btn-secondary" title="Publier sur YouTube"><i data-lucide="cloud-upload"></i> Publier</button>
                            <button type="button" class="voice-video-player-link btn btn-secondary" title="Ouvrir le lien YouTube"><i data-lucide="link"></i> Lien Youtube</button>
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
                                <button type="button" class="voice-video-player-download" title="Télécharger" aria-label="Télécharger"><i data-lucide="download"></i></button>
                                <button type="button" class="voice-video-player-play-toggle" title="Lecture" aria-label="Lecture">▶</button>
                                <input type="range" min="0" max="1" step="0.001" value="0" class="voice-video-player-progress">
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
            this._defaultPublishLabel = this.publishButton?.innerHTML || "Publier";
            this.youtubeUrl = "";
            this.videoEl = this.overlay.querySelector("video");
            this.downloadButton = this.overlay.querySelector(".voice-video-player-download");
            this.playToggle = this.overlay.querySelector(".voice-video-player-play-toggle");
            this.speedSelect = this.overlay.querySelector(".voice-video-player-speed");
            this.progress = this.overlay.querySelector(".voice-video-player-progress");
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
                }
            });
            this.closeButton?.addEventListener("click", () => this.close());
            this.copyButtons?.[0]?.addEventListener("click", () => {
                if (!this.onCopyAudio) return;
                this.onCopyAudio();
            });
            this.copyButtons?.[1]?.addEventListener("click", () => {
                if (!this.onCopyVideo) return;
                const text = this.sentences.map(sentence => (sentence.text || "").trim()).filter(Boolean).join(" ").trim();
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
                if (!this.videoBlobUrl) return;
                const a = document.createElement("a");
                a.href = this.videoBlobUrl;
                a.download = "video.mp4";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
            this.playToggle?.addEventListener("click", () => {
                this._togglePlayback();
            });
            this.progress?.addEventListener("input", () => {
                if (!this.videoEl || !this.videoEl.duration) return;
                const ratio = Number(this.progress.value) || 0;
                this.videoEl.currentTime = ratio * this.videoEl.duration;
            });
            this.speedSelect?.addEventListener("change", () => {
                this._applyPlaybackRate(true);
            });
            this.videoEl?.addEventListener("timeupdate", () => {
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

        _handleSave() {
            if (!this.onTranscriptSaved) return;
            const snapshot = this.sentences.map(sentence => ({ ...sentence }));
            this.onTranscriptSaved(snapshot);
        }

        async _handlePublish() {
            if (typeof this.onPublish !== "function" || !this.videoBlobOriginal) return;
            if (!this.publishButton) return;
            this.publishButton.disabled = true;
            this.publishButton.innerHTML = `<i data-lucide="loader-2" class="lucide-spin"></i> Publication...`;
            if (window.lucide) lucide.createIcons();
            try {
                const snapshot = this.sentences.map(sentence => ({ ...sentence }));
                const vtt = this._buildVttFromSentences();
                await this.onPublish({
                    videoBlob: this.videoBlobOriginal,
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
            const ratio = duration ? Math.min(1, Math.max(0, current / duration)) : 0;
            if (force || this.progress.value !== String(ratio)) {
                this.progress.value = String(ratio);
            }
            this.timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
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
            if (!this.sentences.length) return;
            const currentTime = this.videoEl.currentTime || 0;
            let foundIndex = this.sentences.findIndex(sentence => {
                const start = Number.isFinite(sentence.start) ? sentence.start : 0;
                const end = Number.isFinite(sentence.end) ? sentence.end : Infinity;
                return currentTime >= start && currentTime < end;
            });
            if (foundIndex === -1) {
                let futureIndex = -1;
                let closestStart = Infinity;
                this.sentences.forEach((sentence, index) => {
                    const start = Number.isFinite(sentence.start) ? sentence.start : 0;
                    if (start >= currentTime && start < closestStart) {
                        closestStart = start;
                        futureIndex = index;
                    }
                });
                foundIndex = futureIndex !== -1 ? futureIndex : this.sentences.length - 1;
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
            this.sentences.forEach((sentence, index) => {
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
                startInput.addEventListener("blur", () => this._handleTimeEdit(index, startInput.value, endInput.value, "start"));
                endInput.addEventListener("blur", () => this._handleTimeEdit(index, startInput.value, endInput.value, "end"));
                timesRow.append(startInput, arrow, endInput);
                const contentEl = document.createElement("div");
                contentEl.className = "voice-video-player-transcript-item__content";
                contentEl.contentEditable = "true";
                contentEl.spellcheck = false;
                contentEl.textContent = sentence.text || "";
                contentEl.addEventListener("input", () => this._handleTextEdit(index, contentEl.textContent || ""));
                contentEl.addEventListener("click", () => {
                    if (this.videoEl?.duration) {
                        this.videoEl.currentTime = Number(sentence.start || 0);
                    }
                });
                container.append(timesRow, contentEl);
                this.transcriptList.appendChild(container);
                this.sentenceEntries.push({ container, contentEl, startInput, endInput });
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

        _handleTimeEdit(index, startValue, endValue, editedField) {
            const sentence = this.sentences[index];
            if (!sentence) return;
            const parsedStart = parseVttTime(startValue);
            const parsedEnd = parseVttTime(endValue);
            const start = Number.isFinite(parsedStart) ? parsedStart : sentence.start;
            let end = Number.isFinite(parsedEnd) ? parsedEnd : sentence.end;
            if (!Number.isFinite(end) || end <= start) {
                end = start + 0.1;
            }
            sentence.start = start;
            sentence.end = end;
            this.sentenceEntries[index]?.startInput && (this.sentenceEntries[index].startInput.value = formatVttTime(start));
            this.sentenceEntries[index]?.endInput && (this.sentenceEntries[index].endInput.value = formatVttTime(end));
            if (editedField === "start") {
                this.sentences.forEach((other, otherIdx) => {
                    if (otherIdx === index) return;
                    const otherStart = Number.isFinite(other.start) ? other.start : 0;
                    const otherEnd = Number.isFinite(other.end) ? other.end : otherStart;
                    if (otherStart < start && otherEnd > start) {
                        other.end = start;
                        const entry = this.sentenceEntries[otherIdx];
                        if (entry?.endInput) {
                            entry.endInput.value = formatVttTime(start);
                        }
                    }
                });
            }
            this._notifyTranscriptChange();
        }

        _notifyTranscriptChange() {
            const snapshot = this.sentences.map(sentence => ({ ...sentence }));
            this._updateTextTrack();
            if (!this.onTranscriptChange) return;
            this.onTranscriptChange(snapshot);
        }

        _togglePlayback() {
            if (!this.videoEl) return;
            if (this.videoEl.paused) {
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

        _buildVttFromSentences() {
            if (!Array.isArray(this.sentences) || !this.sentences.length) return "";
            const entries = this.sentences.map(sentence => {
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
            if (this.transcriptSubtitle) {
                this.transcriptSubtitle.textContent = memoName ? `Docs: ${memoName}` : "";
            }
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
            this._revokeTextTrackUrl();
        }
    }

    window.VoiceVideoPlayerModal = VoiceVideoPlayerModal;
})();
