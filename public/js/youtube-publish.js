(function () {
    "use strict";

    const DEFAULT_API_BASE = (window.GO_TOOLKIT_YOUTUBE_API_URL || "https://youtube.gotoolkit.workers.dev").replace(/\/$/, "");

    function getApiBaseUrl() {
        return (window.GO_TOOLKIT_YOUTUBE_API_URL || DEFAULT_API_BASE).replace(/\/$/, "");
    }

    function getDeviceId() {
        // Deprecated: YouTube auth no longer uses device identifiers.
        return "";
    }

    function normalizeLanguage(language) {
        const raw = String(language || "").trim().toLowerCase();
        if (!raw) return "fr";
        const compact = raw.replace("_", "-");
        const root = compact.split("-")[0];
        if (!root) return "fr";
        return root;
    }

    async function getAuthStatus() {
        const response = await fetch(`${getApiBaseUrl()}/auth/status`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur OAuth (${response.status})`);
        }
        return payload;
    }

    async function getChannels() {
        const response = await fetch(`${getApiBaseUrl()}/auth/channels`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Erreur YouTube (${response.status})`);
        }
        return payload;
    }

    async function selectChannel(channelId) {
        const response = await fetch(`${getApiBaseUrl()}/auth/channel/select`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId: String(channelId || "").trim() })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Selection chaîne impossible (${response.status})`);
        }
        return payload;
    }

    async function disconnect() {
        const response = await fetch(`${getApiBaseUrl()}/auth/disconnect`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Deconnexion impossible (${response.status})`);
        }
        return payload;
    }

    function openOAuthPopup() {
        const origin = window.location.origin;
        const api = getApiBaseUrl();
        const url = `${api}/oauth/start?origin=${encodeURIComponent(origin)}`;
        const popup = window.open(url, "gotoolkit-youtube-oauth", "width=560,height=700");
        if (!popup) {
            return Promise.reject(new Error("Popup OAuth bloquee"));
        }
        return new Promise((resolve, reject) => {
            let closedTimer = null;
            const onMessage = event => {
                if (event.origin !== api) return;
                if (event.data?.source !== "gotoolkit-youtube-oauth") return;
                cleanup();
                if (event.data?.ok) {
                    resolve(event.data);
                    return;
                }
                reject(new Error(event.data?.error || "Connexion YouTube refusee"));
            };
            function cleanup() {
                window.removeEventListener("message", onMessage);
                if (closedTimer) clearInterval(closedTimer);
                try { popup.close(); } catch (err) { /* noop */ }
            }
            window.addEventListener("message", onMessage);
            closedTimer = setInterval(() => {
                if (!popup || popup.closed) {
                    cleanup();
                    reject(new Error("Connexion YouTube annulee"));
                }
            }, 300);
        });
    }

    async function ensureConnected() {
        const status = await getAuthStatus();
        if (status?.connected) return true;
        await openOAuthPopup();
        return true;
    }

    async function publishVideo(options = {}) {
        const {
            videoBlob,
            vtt = "",
            title = "",
            description = "",
            language = "fr"
        } = options;
        if (!videoBlob) throw new Error("Video absente");
        await ensureConnected();
        const form = new FormData();
        const safeTitle = String(title || "Document").trim() || "Document";
        form.append("title", safeTitle);
        form.append("description", String(description || ""));
        form.append("privacyStatus", "unlisted");
        form.append("madeForKids", "true");
        form.append("categoryId", "28");
        form.append("language", normalizeLanguage(language));
        const status = await getAuthStatus();
        const selectedChannelId = String(status?.selectedChannelId || "").trim();
        const hasChannel = Boolean(status?.hasChannel || (Array.isArray(status?.channels) && status.channels.length));
        if (!hasChannel) {
            throw new Error("Aucune chaîne YouTube disponible. Ouvrez le sélecteur YouTube.");
        }
        if (selectedChannelId) {
            form.append("channelId", selectedChannelId);
        }
        const videoType = videoBlob.type || "video/webm";
        const extension = videoType.includes("mp4") ? "mp4" : videoType.includes("webm") ? "webm" : "bin";
        form.append("video", new File([videoBlob], `${safeTitle}.${extension}`, { type: videoType }));
        if (vtt && String(vtt).trim()) {
            form.append("captions", new File([vtt], `${safeTitle}.vtt`, { type: "text/vtt" }));
        }

        const response = await fetch(`${getApiBaseUrl()}/videos/upload`, {
            method: "POST",
            credentials: "include",
            body: form
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Publication impossible (${response.status})`);
        }
        return payload;
    }

    window.GoToolkitYouTubePublish = {
        getDeviceId,
        getAuthStatus,
        getChannels,
        selectChannel,
        ensureConnected,
        disconnect,
        publishVideo
    };
})();
