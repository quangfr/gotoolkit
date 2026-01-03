(function (global) {
    function ensureToastContainer() {
        if (typeof document === "undefined") return null;
        let el = document.getElementById("goToolkitToast");
        if (!el) {
            el = document.createElement("div");
            el.id = "goToolkitToast";
            el.style.position = "fixed";
            el.style.right = "16px";
            el.style.bottom = "16px";
            el.style.zIndex = "9999";
            el.style.maxWidth = "320px";
            el.style.background = "#1f2937";
            el.style.color = "#fff";
            el.style.padding = "10px 12px";
            el.style.borderRadius = "8px";
            el.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
            el.style.fontSize = "13px";
            el.style.lineHeight = "1.3";
            el.style.display = "none";
            document.body.appendChild(el);
        }
        return el;
    }

    function showToast(message, isError) {
        const el = ensureToastContainer();
        if (!el) return;
        el.textContent = message;
        el.style.background = isError ? "#7f1d1d" : "#1f2937";
        el.style.display = "block";
        clearTimeout(el._hidetimer);
        el._hidetimer = setTimeout(() => {
            el.style.display = "none";
        }, 3500);
    }

    function mapWebllmError(err) {
        const msg = (err && err.message) || String(err) || "";
        if (/WebGPU is not enabled/i.test(msg) || /navigator\.gpu/i.test(msg)) {
            return "WebGPU indisponible dans ce navigateur.";
        }
        if (/ModelNotFound/i.test(msg) || /SpecifiedModelNotFound/i.test(msg)) {
            return "Modèle WebLLM introuvable. Réinstalle le modèle et réessaie.";
        }
        if (/require is unavailable/i.test(msg) || /fileURLToPath/i.test(msg) || /dirname is not a function/i.test(msg)) {
            return "Initialisation WebLLM échouée (environnement). Rafraîchis la page et réinstalle.";
        }
        return msg || "Erreur WebLLM inconnue.";
    }
    const hasStreamingSupport =
        typeof ReadableStream !== "undefined" && typeof TextDecoder !== "undefined";

    function stringifyContent(content) {
        if (typeof content === "string") {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .map(part => {
                    if (typeof part === "string") {
                        return part;
                    }
                    if (typeof part?.text === "string") {
                        return part.text;
                    }
                    if (typeof part?.content === "string") {
                        return part.content;
                    }
                    if (typeof part?.delta === "string") {
                        return part.delta;
                    }
                    return "";
                })
                .join("");
        }
        if (typeof content?.text === "string") {
            return content.text;
        }
        if (typeof content?.delta === "string") {
            return content.delta;
        }
        return "";
    }

    function extractFromOutput(output) {
        if (!output) {
            return "";
        }
        if (typeof output === "string") {
            return output;
        }
        if (Array.isArray(output)) {
            return output.map(extractFromOutput).join("");
        }
        if (output.content) {
            return stringifyContent(output.content);
        }
        if (output.message?.content) {
            return stringifyContent(output.message.content);
        }
        return stringifyContent(output);
    }

    function normalizeChunk(payload) {
        if (!payload) {
            return "";
        }

        if (payload?.error?.message) {
            throw new Error(payload.error.message);
        }

        if (typeof payload.delta === "string") {
            return payload.delta;
        }

        if (typeof payload.output_text === "string") {
            return payload.output_text;
        }

        if (Array.isArray(payload.output_text)) {
            return payload.output_text.map(extractFromOutput).join("");
        }

        if (payload.output_text && typeof payload.output_text === "object") {
            return extractFromOutput(payload.output_text);
        }

        if (Array.isArray(payload.output)) {
            return extractFromOutput(payload.output);
        }

        if (typeof payload.content === "string") {
            return payload.content;
        }

        if (typeof payload.response === "string") {
            return payload.response;
        }

        const choice = payload?.choices && payload.choices[0];
        if (choice) {
            const delta = choice.delta || {};
            const content = delta.content ?? choice.text ?? choice.message?.content;
            return stringifyContent(content);
        }

        return "";
    }

    async function parseJsonResponse(response) {
        const payload = await response.json();
        const normalized = normalizeChunk(payload);
        if (normalized && typeof normalized === "string") {
            return normalized.trim();
        }
        if (typeof payload === "string") {
            return payload.trim();
        }
        return "";
    }

    function buildHeaders(apiKey, headers) {
        const nextHeaders = {
            "Content-Type": "application/json",
            ...headers
        };
        if (apiKey) {
            nextHeaders.Authorization = `Bearer ${apiKey}`;
        }
        return nextHeaders;
    }

    async function consumeStream(response, stopCondition, onChunk) {
        const reader = response.body?.getReader?.();
        if (!reader) {
            return parseJsonResponse(response);
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let aggregated = "";
        let eventData = [];

        const releaseReader = () => {
            try {
                reader.releaseLock();
            } catch (error) {
                // ignore
            }
        };

        const cancelStream = async () => {
            try {
                await reader.cancel();
            } catch (error) {
                // ignore
            }
        };

        function handleDataLine(dataLine) {
            if (!dataLine) {
                return;
            }
            if (dataLine === "[DONE]") {
                return "done";
            }
            try {
                const payload = JSON.parse(dataLine);
                const chunk = normalizeChunk(payload);
                if (chunk) {
                    aggregated += chunk;
                    if (typeof onChunk === "function") {
                        try {
                            onChunk(chunk);
                        } catch (err) {
                            console.warn("onChunk handler failed", err);
                        }
                    }
                    if (typeof stopCondition === "function" && stopCondition(aggregated)) {
                        return "stop";
                    }
                }
                if (payload?.type === "response.error") {
                    throw new Error(payload?.error?.message || "OpenAI response error");
                }
                if (
                    payload?.type === "response.completed" ||
                    payload?.type === "response.output_text.done"
                ) {
                    if (!aggregated && chunk) {
                        return "done-with-chunk";
                    }
                    return "done";
                }
            } catch (error) {
                console.warn("OpenAI stream chunk parse failed", error);
            }
            return "";
        }

        function flushEventData() {
            if (!eventData.length) {
                return "";
            }
            const dataLine = eventData.join("").trim();
            eventData = [];
            return handleDataLine(dataLine);
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                const tailStatus = flushEventData();
                releaseReader();
                if (tailStatus === "done-with-chunk") {
                    return aggregated.trim();
                }
                return aggregated.trim();
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (!line) {
                    const status = flushEventData();
                    if (status === "done") {
                        await cancelStream();
                        releaseReader();
                        return aggregated.trim();
                    }
                    if (status === "done-with-chunk") {
                        await cancelStream();
                        releaseReader();
                        return aggregated.trim();
                    }
                    if (status === "stop") {
                        await cancelStream();
                        releaseReader();
                        return aggregated.trim();
                    }
                    continue;
                }
                if (!line.startsWith("data:")) {
                    continue;
                }
                const dataLine = line.replace(/^data:\s*/, "").trim();
                eventData.push(dataLine);
                if (
                    dataLine === "[DONE]" ||
                    dataLine.endsWith("}") ||
                    dataLine.endsWith("]")
                ) {
                    const status = flushEventData();
                    if (status === "done") {
                        await cancelStream();
                        releaseReader();
                        return aggregated.trim();
                    }
                    if (status === "done-with-chunk") {
                        await cancelStream();
                        releaseReader();
                        return aggregated.trim();
                    }
                    if (status === "stop") {
                        await cancelStream();
                        releaseReader();
                        return aggregated.trim();
                    }
                }
            }
        }
    }

    async function consumeNdjsonStream(response, stopCondition, onChunk) {
        const reader = response.body?.getReader?.();
        if (!reader) {
            return parseJsonResponse(response);
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let aggregated = "";

        const releaseReader = () => {
            try {
                reader.releaseLock();
            } catch (error) {
                // ignore
            }
        };

        const cancelStream = async () => {
            try {
                await reader.cancel();
            } catch (error) {
                // ignore
            }
        };

        async function handlePayload(payload) {
            try {
                const chunk = normalizeChunk(payload);
                if (chunk) {
                    aggregated += chunk;
                    if (typeof onChunk === "function") {
                        try {
                            onChunk(chunk);
                        } catch (err) {
                            console.warn("onChunk handler failed", err);
                        }
                    }
                    if (typeof stopCondition === "function" && stopCondition(aggregated)) {
                        await cancelStream();
                        releaseReader();
                        return true;
                    }
                }
                if (payload?.done || payload?.done_reason) {
                    await cancelStream();
                    releaseReader();
                    return true;
                }
            } catch (err) {
                console.warn("NDJSON stream chunk parse failed", err);
            }
            return false;
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n");
            buffer = parts.pop() || "";
            for (const part of parts) {
            var trimmed = part.trim();
            if (!trimmed) {
                continue;
            }
            var sanitized = trimmed.replace(/^data:\\s*/i, "").trim();
            if (!sanitized || sanitized === "[DONE]") {
                continue;
            }
            try {
                const payload = JSON.parse(sanitized);
                    const shouldStop = await handlePayload(payload);
                    if (shouldStop) {
                        return aggregated.trim();
                    }
                } catch (error) {
                    console.warn("NDJSON chunk JSON parse failed", error);
                }
            }
        }

        var leftover = buffer.trim();
        if (leftover) {
            var sanitized = leftover.replace(/^data:\\s*/i, "").trim();
            if (sanitized && sanitized !== "[DONE]") {
                try {
                    const payload = JSON.parse(sanitized);
                    await handlePayload(payload);
                } catch (error) {
                    console.warn("NDJSON leftover parse failed", error);
                }
            }
        }

        releaseReader();
        return aggregated.trim();
    }

    function toResponsesPayload(payload) {
        const next = { ...payload };

        if (Array.isArray(next.messages) && !next.input) {
            next.input = next.messages.map(message => ({
                role: message.role || "user",
                content: Array.isArray(message.content)
                    ? message.content.map(part => {
                        if (typeof part === "string") {
                            return { type: "input_text", text: part };
                        }
                        if (part && typeof part === "object") {
                            if (part.type && part.type.startsWith("input_")) {
                                return part;
                            }
                            if (typeof part.text === "string") {
                                return { type: "input_text", text: part.text };
                            }
                        }
                        return { type: "input_text", text: String(part ?? "") };
                    })
                    : [{ type: "input_text", text: String(message.content ?? "") }]
            }));
        }

        if (!next.reasoning && typeof next.reasoning_effort === "string") {
            next.reasoning = { effort: next.reasoning_effort };
        }

        delete next.messages;
        delete next.reasoning_effort;

        return next;
    }

    async function chatCompletion({ endpoint, apiKey, payload, headers = {}, stopCondition, signal, onChunk }) {
        if (!endpoint) {
            throw new Error("Endpoint manquant");
        }
        if (!payload || typeof payload !== "object") {
            throw new Error("Payload OpenAI invalide");
        }
        const { onChunk: _omitOnChunk, ...restPayload } = payload || {};
        const requestPayload = toResponsesPayload(restPayload);
        if (typeof requestPayload.effort === "undefined") {
            requestPayload.effort = "minimal";
        }
        const wantsStream = hasStreamingSupport && requestPayload.stream === true;
        if (!wantsStream) {
            delete requestPayload.stream;
        }
        const requestHeaders = buildHeaders(apiKey, headers);
        if (wantsStream) {
            requestHeaders.Accept = "text/event-stream";
        }
        const response = await fetch(endpoint, {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(requestPayload),
            signal
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(errBody || "API non disponible");
        }

        const contentType = response.headers.get("content-type") || "";
        const isStream = wantsStream && !!response.body && contentType.includes("text/event-stream");

        if (isStream) {
            return consumeStream(response, stopCondition, onChunk);
        }

        return parseJsonResponse(response);
    }

    function buildOllamaPayload(payload, model) {
        // Ollama expects a simple payload: { model, prompt, stream }
        const next = {};
        next.model = model || payload?.model || "";
        // Build a single prompt string from messages / input / prompt
        if (Array.isArray(payload?.messages) && payload.messages.length) {
            // concatenate message contents
            next.prompt = payload.messages
                .map(m => (typeof m.content === "string" ? m.content : stringifyContent(m.content || m)))
                .filter(Boolean)
                .join("\n\n");
        } else if (typeof payload?.prompt === "string") {
            next.prompt = payload.prompt;
        } else if (payload?.input) {
            if (Array.isArray(payload.input)) {
                next.prompt = payload.input.map(item => stringifyContent(item?.content || item)).join("\n\n");
            } else {
                next.prompt = stringifyContent(payload.input);
            }
        } else {
            next.prompt = "";
        }
        // For compatibility: keep streaming for `gpt-oss` models, but request
        // non-streaming JSON responses for other Ollama models (matches the
        // /api/generate OpenAPI shape which returns a `response` field).
        try {
            var modelName = (next.model || "").toString().toLowerCase();
            if (modelName.startsWith("gpt-oss")) {
                next.stream = true;
            } else {
                next.stream = false;
            }
        } catch (e) {
            next.stream = false;
        }
        return next;
    }

    function isLocalOllama(url) {
        if (!url || typeof url !== "string") return false;
        return /^https?:\/\/(localhost|127(?:\.\d+){3})(:\d+)?/i.test(url.trim());
    }

    function buildOllamaHeaders(apiKey, endpoint) {
        const headers = {
            "Content-Type": "application/json"
        };
        if (apiKey && !isLocalOllama(endpoint)) {
            headers.Authorization = `Bearer ${apiKey}`;
            headers["Ollama-Api-Key"] = apiKey;
            headers["X-Ollama-Api-Key"] = apiKey;
        }
        return headers;
    }

    async function callOllama(backend, payload, signal, endpointType = "responses", onChunk) {
        const modelName = (backend?.model || "").toString().toLowerCase();
        // If this is a gpt-oss model, use Ollama's OpenAI-compatible endpoints (/v1/...)
        if (modelName.startsWith("gpt-oss")) {
            try {
                // Prefer the configured Ollama URL from `GoToolkitIAConfig` (matches `ollamaUrlInput`),
                // fallback to the origin derived from backend.endpoint.
                var baseUrl = "";
                try {
                    if (global.GoToolkitIAConfig && typeof global.GoToolkitIAConfig.getOllamaUrl === "function") {
                        baseUrl = String(global.GoToolkitIAConfig.getOllamaUrl() || "").replace(/\/+$/, "");
                    }
                } catch (e) {
                    baseUrl = "";
                }
                if (!baseUrl) {
                    try {
                        baseUrl = new URL(backend.endpoint).origin;
                    } catch (e) {
                        baseUrl = backend.endpoint || "";
                    }
                }
                const targetPath = endpointType === "chat" ? "/v1/chat/completions" : "/v1/responses";
                const requestUrl = (baseUrl || "") + targetPath;
                const headers = buildOllamaHeaders(backend.apiKey);
                // Ensure JSON content-type for OpenAI-compatible endpoints
                headers["Content-Type"] = "application/json";

                // Build an OpenAI-compatible body
                let openaiBody = { model: backend.model };
                if (endpointType === "chat") {
                    if (Array.isArray(payload?.messages) && payload.messages.length) {
                        openaiBody.messages = payload.messages;
                    } else if (typeof payload?.prompt === "string") {
                        openaiBody.messages = [{ role: "user", content: payload.prompt }];
                    } else if (payload?.input) {
                        // convert input -> messages
                        const input = payload.input;
                        if (typeof input === "string") {
                            openaiBody.messages = [{ role: "user", content: input }];
                        } else if (Array.isArray(input)) {
                            openaiBody.messages = input.map(it => ({ role: "user", content: it }));
                        }
                    }
                    if (typeof payload?.stream !== "undefined") openaiBody.stream = Boolean(payload.stream);
                    else openaiBody.stream = false;
                    // pass through common generation params
                    ["temperature", "top_p", "max_tokens", "stop", "seed", "frequency_penalty", "presence_penalty"].forEach(k => {
                        if (typeof payload?.[k] !== "undefined") openaiBody[k] = payload[k];
                    });
                } else {
                    // responses endpoint expects `input`
                    if (typeof payload?.input !== "undefined") {
                        openaiBody.input = payload.input;
                    } else if (typeof payload?.prompt === "string") {
                        openaiBody.input = payload.prompt;
                    } else if (Array.isArray(payload?.messages) && payload.messages.length) {
                        openaiBody.input = payload.messages.map(m => (typeof m.content === "string" ? m.content : stringifyContent(m.content || m))).join("\n\n");
                    }
                    if (typeof payload?.stream !== "undefined") openaiBody.stream = Boolean(payload.stream);
                    else openaiBody.stream = false;
                    ["temperature", "top_p", "max_output_tokens", "max_tokens", "stop", "seed"].forEach(k => {
                        if (typeof payload?.[k] !== "undefined") openaiBody[k] = payload[k];
                    });
                }

                if (globalThis?.console) console.info("[Ollama][OpenAI-compat] request", { url: requestUrl, body: openaiBody });

                const response = await fetch(requestUrl, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(openaiBody),
                    signal
                });

                if (!response.ok) {
                    const body = await response.text().catch(() => "");
                    console.error("[Ollama][OpenAI-compat] non-ok response", { url: requestUrl, status: response.status, body });
                    throw new Error(body || "Ollama OpenAI-compatible endpoint returned error");
                }

                const contentType = response.headers.get("content-type") || "";
                const wantsStream = openaiBody.stream === true;
                const isNdjsonStream = contentType.includes("application/x-ndjson") || contentType.includes("text/event-stream");
                if (wantsStream && !!response.body && isNdjsonStream) {
                    const aggregated = contentType.includes("application/x-ndjson") ? await consumeNdjsonStream(response, undefined, onChunk) : await consumeStream(response, undefined, onChunk);
                    if (globalThis?.console) console.info("[Ollama][OpenAI-compat] stream response", aggregated);
                    return aggregated?.trim ? aggregated.trim() : aggregated;
                }

                // Non-streaming: try JSON parse and normalize
                try {
                    const parsed = await parseJsonResponse(response);
                    return parsed;
                } catch (err) {
                    // fallback to raw text
                    const raw = await response.text().catch(() => "");
                    if (globalThis?.console) console.info("[Ollama][OpenAI-compat] raw response", raw);
                    return typeof raw === "string" ? raw.trim() : raw;
                }
            } catch (err) {
                console.error("[Ollama][OpenAI-compat] request failed", err);
                throw err;
            }
        }

        const requestBody = buildOllamaPayload(payload, backend.model);
        if (globalThis?.console) {
            console.info("[Ollama] payload", requestBody);
        }
        try {
            const response = await fetch(backend.endpoint, {
                method: "POST",
                headers: buildOllamaHeaders(backend.apiKey, backend.endpoint),
                body: JSON.stringify(requestBody),
                signal
            });
            if (!response.ok) {
                const body = await response.text().catch(() => "");
                console.error("[Ollama] non-ok response", {
                    endpoint: backend.endpoint,
                    status: response.status,
                    body: body
                });
                throw new Error(body || "Ollama indisponible");
            }
            const contentType = response.headers.get("content-type") || "";
            const wantsStream = requestBody.stream === true;
            const isNdjsonStream = contentType.includes("application/x-ndjson");
            const isStream =
                wantsStream &&
                !!response.body &&
                (contentType.includes("text/event-stream") || isNdjsonStream);
            if (isStream) {
                const aggregated = isNdjsonStream
                    ? await consumeNdjsonStream(response, undefined, onChunk)
                    : await consumeStream(response, undefined, onChunk);
                if (globalThis?.console) {
                    console.info("[Ollama] response", aggregated);
                }
                return aggregated?.trim ? aggregated.trim() : aggregated;
            }
            const rawText = await response.text();
            let data;
            try {
                data = JSON.parse(rawText);
            } catch (err) {
                // Ollama can return NDJSON without a streaming content-type; try to salvage it
                const lines = rawText
                    .split("\n")
                    .map(line => line.trim())
                    .filter(Boolean);
                if (lines.length) {
                    try {
                        const aggregated = lines
                            .map(line => {
                                try {
                                    return normalizeChunk(JSON.parse(line));
                                } catch (parseErr) {
                                    console.warn("Ollama NDJSON line parse failed", parseErr);
                                    return "";
                                }
                            })
                            .filter(Boolean)
                            .join("");
                        if (aggregated) {
                            if (globalThis?.console) {
                                console.info("[Ollama] response (ndjson)", aggregated);
                            }
                            return aggregated.trim();
                        }
                    } catch (ndjsonErr) {
                        console.error("[Ollama] invalid NDJSON response", { endpoint: backend.endpoint, ndjsonErr });
                    }
                }
                console.error("[Ollama] invalid JSON response", { endpoint: backend.endpoint, err });
                throw err;
            }
            if (globalThis?.console) {
                var responseField = data && typeof data.response !== "undefined" ? data.response : (data?.message?.content || data?.message || data?.output || data);
                console.info("[Ollama] response", responseField);
            }
            const primary = typeof data?.response !== "undefined" ? data.response : (data?.message?.content || data?.message || data?.output || data);
            const normalized = extractFromOutput(primary);
            return typeof normalized === "string" ? normalized.trim() : "";
        } catch (err) {
            try {
                console.error("[Ollama] request failed", { endpoint: backend.endpoint, model: backend.model, error: err });
            } catch (logErr) {
                console.error("[Ollama] request failed (logging error)", err);
            }
            throw err;
        }
    }

    function buildOpenRouterMessages(payload) {
        const source = payload || {};
        if (Array.isArray(source?.messages) && source.messages.length) {
            return source.messages.map(message => ({
                role: (message?.role || "user").toString(),
                content: stringifyContent(message?.content ?? message)
            }));
        }
        if (Array.isArray(source?.input) && source.input.length) {
            return source.input.map(item => ({
                role: (item?.role || "user").toString(),
                content: stringifyContent(item?.content ?? item)
            }));
        }
        if (typeof source?.prompt === "string") {
            return [{ role: "user", content: source.prompt }];
        }
        if (typeof source?.input === "string") {
            return [{ role: "user", content: source.input }];
        }
        return [{ role: "user", content: "" }];
    }

    function buildOpenRouterPayload(payload, backend) {
        const source = payload || {};
        let modelCandidates = [];
        if (Array.isArray(source?.models) && source.models.length) {
            modelCandidates = source.models
                .map(entry => (entry ? String(entry).trim() : ""))
                .filter(Boolean);
        }
        const configuredModel = String(backend?.model || source?.model || "").trim();
        if (configuredModel) {
            if (!modelCandidates.includes(configuredModel)) {
                modelCandidates.unshift(configuredModel);
            }
        }
        if (!modelCandidates.length) {
            let fallbackModel = "xiaomi/mimo-v2-flash:free";
            try {
                if (global.GoToolkitIAConfig && typeof global.GoToolkitIAConfig.getOpenRouterModel === "function") {
                    fallbackModel = global.GoToolkitIAConfig.getOpenRouterModel() || fallbackModel;
                }
            } catch (err) { /* ignore */ }
            modelCandidates = [fallbackModel];
        }
        modelCandidates = Array.from(new Set(modelCandidates)).filter(Boolean);
        if (modelCandidates.length > 3) {
            modelCandidates = modelCandidates.slice(0, 3);
        }

        const isDirect = Boolean(backend?.hasOpenRouterKey);
        if (!isDirect) {
            const proxyModel = configuredModel || modelCandidates[0] || "openai/gpt-oss-120b:free";
            const proxyPayload = {
                model: proxyModel,
                messages: buildOpenRouterMessages(source)
            };
            if (typeof source?.stream !== "undefined") {
                proxyPayload.stream = Boolean(source.stream);
            }
            if (typeof proxyPayload.effort === "undefined") {
                proxyPayload.effort = "minimal";
            }
            return proxyPayload;
        }

        const defaultModel = "openrouter/auto";
        if (!modelCandidates.includes(defaultModel)) {
            modelCandidates.unshift(defaultModel);
        }
        modelCandidates = Array.from(new Set(modelCandidates)).filter(Boolean);
        if (modelCandidates.length > 3) {
            modelCandidates = modelCandidates.slice(0, 3);
        }
        const result = {
            model: defaultModel,
            models: modelCandidates,
            messages: buildOpenRouterMessages(source)
        };
        [
            "temperature",
            "top_p",
            "max_tokens",
            "max_output_tokens",
            "presence_penalty",
            "frequency_penalty",
            "n",
            "logprobs"
        ].forEach(key => {
            if (typeof source?.[key] !== "undefined") {
                result[key] = source[key];
            }
        });
        if (typeof source?.stream !== "undefined") {
            result.stream = Boolean(source.stream);
        }
        if (typeof source?.stop !== "undefined") {
            result.stop = source.stop;
        }
        if (typeof source?.user === "string" && source.user.trim()) {
            result.user = source.user.trim();
        }
        if (typeof source?.logit_bias !== "undefined") {
            result.logit_bias = source.logit_bias;
        }
        if (typeof result.temperature === "undefined") {
            result.temperature = 1;
        }
        if (typeof result.effort === "undefined") {
            result.effort = "minimal";
        }

        const parsePositive = value => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric < 0) {
                return 0;
            }
            return numeric;
        };
        const maxPrompt = isDirect ? parsePositive(backend?.maxPrice?.prompt) : 0;
        const maxCompletion = isDirect ? parsePositive(backend?.maxPrice?.completion) : 0;
        const sortBy = (typeof backend?.sort === "string" && backend.sort.trim()) ? backend.sort.trim() : "price";
        const normalizedDataCollection = (isDirect ? backend?.dataCollection : "allow") || (isDirect ? "deny" : "allow");
        const provider = {
            allow_fallbacks: true,
            sort: {
                by: sortBy,
                partition: null
            },
            data_collection: normalizedDataCollection,
            zdr: isDirect && normalizedDataCollection.includes("zdr"),
            max_price: {
                prompt: maxPrompt,
                completion: maxCompletion
            }
        };
        result.provider = provider;

        return result;
    }

    async function executeOpenRouter(backend, payload, stopCondition, signal, onChunk) {
        const requestPayload = buildOpenRouterPayload(payload, backend);
        const wantsStream = Boolean(requestPayload.stream);
        const requestHeaders = buildHeaders(backend.apiKey);
        if (wantsStream) {
            requestHeaders.Accept = "text/event-stream";
        }
        const response = await fetch(backend.endpoint, {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(requestPayload),
            signal
        });
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(body || "OpenRouter indisponible");
        }
        const contentType = response.headers.get("content-type") || "";
        const isStream = wantsStream && !!response.body && contentType.includes("text/event-stream");
        if (isStream) {
            return consumeStream(response, stopCondition, signal, onChunk);
        }
        return parseJsonResponse(response);
    }

    function makeAbortError() {
        try {
            return new DOMException("Aborted", "AbortError");
        } catch (err) {
            const e = new Error("Aborted");
            e.name = "AbortError";
            return e;
        }
    }

    async function collectWebllmStream(stream, stopCondition, signal, onChunk) {
        if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
            const normalized = normalizeChunk(stream);
            return typeof normalized === "string" ? normalized.trim() : "";
        }
        let aggregated = "";
        if (signal?.aborted) {
            throw makeAbortError();
        }
        try {
            for await (const chunk of stream) {
                if (signal?.aborted) {
                    throw makeAbortError();
                }
                const normalized = normalizeChunk(chunk);
                if (normalized) {
                    aggregated += normalized;
                    if (typeof onChunk === "function") {
                        try {
                            onChunk(normalized);
                        } catch (err) {
                            console.warn("onChunk handler failed", err);
                        }
                    }
                }
                if (typeof stopCondition === "function" && stopCondition(aggregated)) {
                    break;
                }
            }
        } catch (err) {
            console.warn("WebLLM streaming error", err);
            throw err;
        }
        return aggregated.trim();
    }

    async function executeWebllm(backend, payload, stopCondition, signal, onChunk) {
        if (!window.GoToolkitWebLLM || typeof window.GoToolkitWebLLM.ensureEngine !== "function") {
            throw new Error("WebLLM indisponible");
        }
        if (signal?.aborted) {
            throw makeAbortError();
        }
        try {
            const engine = await window.GoToolkitWebLLM.ensureEngine(backend.model);
            const onAbort = () => {
                try {
                    if (engine && typeof engine.interruptGenerate === "function") {
                        engine.interruptGenerate();
                    }
                } catch (e) { /* ignore */ }
            };
            if (signal) {
                if (signal.aborted) {
                    onAbort();
                    throw makeAbortError();
                }
                signal.addEventListener("abort", onAbort, { once: true });
            }
            const nextPayload = { ...(payload || {}) };
            // Always use the loaded WebLLM model to avoid SpecifiedModelNotFound errors.
            nextPayload.model = backend.model;
            const wantsStream = Boolean(payload && payload.stream);
            const response = await engine.chat.completions.create(nextPayload);
            if (wantsStream) {
                const result = await collectWebllmStream(response, stopCondition, signal, onChunk);
                if (signal && !signal.aborted && typeof signal.removeEventListener === "function") {
                    signal.removeEventListener("abort", onAbort);
                }
                return result;
            }
            const normalized = normalizeChunk(response);
            if (signal && !signal.aborted && typeof signal.removeEventListener === "function") {
                signal.removeEventListener("abort", onAbort);
            }
            return typeof normalized === "string" ? normalized.trim() : "";
        } catch (err) {
            const friendly = mapWebllmError(err);
            showToast(friendly, true);
            throw err;
        }
    }

    async function executeWithBackend(backend, payload, stopCondition, signal, endpointType, onChunk) {
        const initial = { ...(payload || {}) };
        if (!initial.model && backend?.model) {
            initial.model = backend.model;
        }
        if (backend?.type === "openrouter" || backend?.type === "openrouter-proxy") {
            return executeOpenRouter(backend, initial, stopCondition, signal, onChunk);
        }
        if (backend?.type === "webllm") {
            return executeWebllm(backend, initial, stopCondition, signal, onChunk);
        }
        if (backend?.type === "ollama") {
            return callOllama(backend, initial, signal, endpointType, onChunk);
        }
        try {
            return await chatCompletion({
                endpoint: backend.endpoint,
                apiKey: backend.apiKey,
                payload: initial,
                stopCondition,
                signal,
                onChunk
            });
        } catch (err) {
            if (err?.name === "AbortError") {
                throw err;
            }
            if (backend?.type === "openai" && global.GoToolkitAIBackend) {
                const fallback = await global.GoToolkitAIBackend.getBackend(endpointType, { forceProxy: true });
                const fallbackPayload = { ...initial };
                if (!fallbackPayload.model && fallback.model) {
                    fallbackPayload.model = fallback.model;
                }
                return chatCompletion({
                    endpoint: fallback.endpoint,
                    apiKey: fallback.apiKey,
                    payload: fallbackPayload,
                    stopCondition,
                    signal,
                    onChunk
                });
            }
            if (backend?.type === "openrouter" && global.GoToolkitAIBackend) {
                const fallback = await global.GoToolkitAIBackend.getBackend(endpointType, { forceOpenRouterProxy: true });
                if (fallback) {
                    const fallbackPayload = { ...initial };
                    return executeOpenRouter(fallback, fallbackPayload, stopCondition, signal, onChunk);
                }
            }
            if (backend?.type === "openrouter-proxy" && global.GoToolkitAIBackend) {
                const fallback = await global.GoToolkitAIBackend.getBackend(endpointType, { forceProxy: true });
                if (fallback) {
                    const fallbackPayload = { ...initial };
                    return chatCompletion({
                        endpoint: fallback.endpoint,
                        apiKey: fallback.apiKey,
                        payload: fallbackPayload,
                        stopCondition,
                        signal,
                        onChunk
                    });
                }
            }
            throw err;
        }
    }

    async function autoChatCompletion({ payload, stopCondition, signal, endpointType = "responses", onChunk } = {}) {
        const backendProvider = global.GoToolkitAIBackend;
        if (!backendProvider || typeof backendProvider.getBackend !== "function") {
            const fallbackEndpoint =
                global.GoToolkitIAConfig?.PROXY_ENDPOINTS?.responses || "https://openai.gotoolkit.workers.dev/v1/responses";
            return chatCompletion({
                endpoint: fallbackEndpoint,
                apiKey: "",
                payload: payload || {},
                stopCondition,
                signal,
                onChunk
            });
        }
        const backend = await backendProvider.getBackend(endpointType);
        // if user explicitly selected Ollama but it's unavailable, raise an error so callers can show a proper toaster
        if (backend && backend.type === "ollama-unavailable") {
            const err = new Error("OllamaUnavailable");
            err.backendInfo = backend;
            throw err;
        }
        return executeWithBackend(backend, payload, stopCondition, signal, endpointType, onChunk);
    }

    global.GoToolkitIAClient = {
        supportsStreaming: () => hasStreamingSupport,
        chatCompletion
    };

    // Backwards compatibility alias
    global.GoToolkitOpenAI = global.GoToolkitIAClient;

    global.GoToolkitIA = {
        chatCompletion: autoChatCompletion
    };
})(window);
