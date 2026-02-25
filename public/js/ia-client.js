(function (global) {
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
            return { text: normalized.trim(), usage: payload?.usage };
        }
        if (typeof payload === "string") {
            return { text: payload.trim(), usage: payload?.usage };
        }
        return { text: "", usage: payload?.usage };
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
        let capturedUsage = null;

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
                    // Capture usage from final payload
                    if (payload?.usage) {
                        capturedUsage = payload.usage;
                    }
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
                    return { text: aggregated.trim(), usage: capturedUsage };
                }
                return { text: aggregated.trim(), usage: capturedUsage };
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
                        return { text: aggregated.trim(), usage: capturedUsage };
                    }
                    if (status === "done-with-chunk") {
                        await cancelStream();
                        releaseReader();
                        return { text: aggregated.trim(), usage: capturedUsage };
                    }
                    if (status === "stop") {
                        await cancelStream();
                        releaseReader();
                        return { text: aggregated.trim(), usage: capturedUsage };
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
                        return { text: aggregated.trim(), usage: capturedUsage };
                    }
                    if (status === "done-with-chunk") {
                        await cancelStream();
                        releaseReader();
                        return { text: aggregated.trim(), usage: capturedUsage };
                    }
                    if (status === "stop") {
                        await cancelStream();
                        releaseReader();
                        return { text: aggregated.trim(), usage: capturedUsage };
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
        let capturedUsage = null;

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
                    if (payload?.usage) {
                        capturedUsage = payload.usage;
                    }
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
                        return { text: aggregated.trim(), usage: capturedUsage };
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
        return { text: aggregated.trim(), usage: capturedUsage };
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
            requestPayload.effort = "low";
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

    function normalizeOpenRouterContent(content) {
        if (Array.isArray(content)) {
            var hasImage = content.some(function (part) {
                return part && typeof part === "object" && (part.image_url || part.type === "image_url");
            });
            if (hasImage) {
                return content.map(function (part) {
                    if (typeof part === "string") {
                        return { type: "text", text: part };
                    }
                    if (part && typeof part === "object") {
                        if (part.type === "image_url" && part.image_url) {
                            return part;
                        }
                        if (part.image_url) {
                            return { type: "image_url", image_url: part.image_url };
                        }
                        if (part.type === "text" && typeof part.text === "string") {
                            return part;
                        }
                        if (typeof part.text === "string") {
                            return { type: "text", text: part.text };
                        }
                    }
                    return { type: "text", text: "" };
                });
            }
        }
        return stringifyContent(content);
    }

    function buildOpenRouterMessages(payload) {
        const source = payload || {};
        if (Array.isArray(source?.messages) && source.messages.length) {
            return source.messages.map(message => ({
                role: (message?.role || "user").toString(),
                content: normalizeOpenRouterContent(message?.content ?? message)
            }));
        }
        if (Array.isArray(source?.input) && source.input.length) {
            return source.input.map(item => ({
                role: (item?.role || "user").toString(),
                content: normalizeOpenRouterContent(item?.content ?? item)
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
        const cfgEffort = (global.GoToolkitIAConfig?.getOpenRouterReasoningEffort?.() || global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_REASONING_EFFORT || "low")
            .toString()
            .trim()
            .toLowerCase();
        const normalizedEffort = /^(minimal|low|medium|high)$/.test(cfgEffort) ? cfgEffort : "low";

        const isDirect = Boolean(backend?.hasOpenRouterKey);
        const requestedModel = String(source?.model || "").trim();
        if (!isDirect) {
            const configuredModel = String(backend?.model || "").trim();
            const proxyModel = requestedModel || configuredModel || "@preset/gotoolkit";
            const proxyPayload = {
                model: proxyModel,
                messages: buildOpenRouterMessages(source)
            };
            if (typeof source?.stream !== "undefined") {
                proxyPayload.stream = Boolean(source.stream);
            }
            if (typeof source?.temperature !== "undefined") {
                proxyPayload.temperature = source.temperature;
            }
            if (typeof proxyPayload.effort === "undefined") {
                proxyPayload.effort = normalizedEffort;
            }
            if (typeof proxyPayload.temperature === "undefined") {
                proxyPayload.temperature = 0.3;
            }
            return proxyPayload;
        }

        const defaultModel = "openai/gpt-oss-120b";
        const result = {
            model: requestedModel || defaultModel,
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
            result.temperature = 0.3;
        }
        if (typeof result.effort === "undefined") {
            result.effort = normalizedEffort;
        }

        const sortBy = (typeof backend?.sort === "string" && backend.sort.trim()) ? backend.sort.trim() : "throughput";
        const provider = {
            allow_fallbacks: true,
            sort: {
                by: sortBy,
                partition: null
            },
            data_collection: "deny",
            zdr: true
        };
        result.provider = provider;
        result.usage = { include: true };

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

    function recordAIRequest(payload) {
        try {
            global.localStorage.setItem("goToolkit.chat.lastAIRequest", JSON.stringify({
                timestamp: new Date().toISOString(),
                payload: payload
            }));
        } catch (err) {
            // noop
        }
    }

    function recordAIResponse(result) {
        try {
            global.localStorage.setItem("goToolkit.chat.lastAIResponse", JSON.stringify({
                timestamp: new Date().toISOString(),
                payload: result
            }));
        } catch (err) {
            // noop
        }
    }

    function getLastAIRequest() {
        try {
            const stored = global.localStorage.getItem("goToolkit.chat.lastAIRequest");
            return stored ? JSON.parse(stored) : null;
        } catch (err) {
            return null;
        }
    }

    function getLastAIResponse() {
        try {
            const stored = global.localStorage.getItem("goToolkit.chat.lastAIResponse");
            return stored ? JSON.parse(stored) : null;
        } catch (err) {
            return null;
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
            if (backend?.type === "openrouter" && global.GoToolkitAIBackend) {
                const fallback = await global.GoToolkitAIBackend.getBackend(endpointType, { forceOpenRouterProxy: true });
                if (fallback) {
                    const fallbackPayload = { ...initial };
                    return executeOpenRouter(fallback, fallbackPayload, stopCondition, signal, onChunk);
                }
            }
            if (backend?.type === "openrouter-proxy" && global.GoToolkitAIBackend) {
                const fallback = await global.GoToolkitAIBackend.getBackend(endpointType, { forceOpenRouterProxy: true });
                if (fallback) {
                    const fallbackPayload = { ...initial };
                    return executeOpenRouter(fallback, fallbackPayload, stopCondition, signal, onChunk);
                }
            }
            throw err;
        }
    }

    async function autoChatCompletion({ payload, stopCondition, signal, endpointType = "responses", onChunk } = {}) {
        const backendProvider = global.GoToolkitAIBackend;

        // Record the request
        recordAIRequest(payload);

        if (!backendProvider || typeof backendProvider.getBackend !== "function") {
            const fallbackBackend = {
                type: "openrouter-proxy",
                endpoint: global.GoToolkitIAConfig?.OPENROUTER_PROXY_ENDPOINT || "https://openrouter.gotoolkit.workers.dev/api/v1/chat/completions",
                apiKey: "",
                model: global.GoToolkitIAConfig?.DEFAULTS?.OPENROUTER_MODEL || "openai/gpt-oss-120b"
            };
            const result = await executeOpenRouter(fallbackBackend, payload || {}, stopCondition, signal, onChunk);
            recordAIResponse(result);
            return result;
        }
        const backend = await backendProvider.getBackend(endpointType);
        const result = await executeWithBackend(backend, payload, stopCondition, signal, endpointType, onChunk);
        recordAIResponse(result);
        return result;
    }

    global.GoToolkitIAClient = {
        supportsStreaming: () => hasStreamingSupport,
        chatCompletion
    };

    // Backwards compatibility alias
    global.GoToolkitOpenAI = global.GoToolkitIAClient;

    global.GoToolkitIA = {
        chatCompletion: autoChatCompletion,
        getLastAIRequest,
        getLastAIResponse
    };

    // Expose getters to global for direct access (e.g. from docs.html)
    global.getLastAIRequest = getLastAIRequest;
    global.getLastAIResponse = getLastAIResponse;
})(window);
