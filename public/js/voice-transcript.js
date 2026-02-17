(function () {
    "use strict";

    const STORAGE_KEY = "go-toolkit-assemblyai-key";
    const ASSEMBLY_PROXY_TOKEN_URL = (window.GO_TOOLKIT_ASSEMBLYAI_TOKEN_URL || "https://assemblyai.gotoolkit.workers.dev/token").replace(/\/$/, "");
    const ASSEMBLY_PROXY_BASE_URL = ASSEMBLY_PROXY_TOKEN_URL.replace(/\/token\/?$/i, "").replace(/\/$/, "") || ASSEMBLY_PROXY_TOKEN_URL;

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

    function formatAssemblyTimestamp(ms = 0) {
        const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `[${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
        }
        return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
    }

    function buildTranscriptFromUtterances(result) {
        const utterances = Array.isArray(result?.utterances) ? result.utterances : [];
        if (!utterances.length) {
            return (result?.text || "").trim();
        }
        return utterances
            .map(utterance => {
                const speaker = (utterance?.speaker || "Participant").trim();
                const text = (utterance?.text || "").trim();
                if (!text) return null;
                const timestamp = formatAssemblyTimestamp(utterance?.start);
                return `${timestamp} ${speaker}\n${text}`;
            })
            .filter(Boolean)
            .join("\n\n");
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

    window.GoToolkitVoiceTranscript = {
        getAssemblyApiKey,
        getAssemblyProxyUrl,
        uploadAudioToAssembly,
        requestAssemblyTranscript,
        pollAssemblyTranscript,
        fetchAssemblyTranscriptVtt,
        buildAssemblyTranscriptPayload,
        buildTranscriptFromUtterances
    };
})();
