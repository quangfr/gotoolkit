(function (global) {
    "use strict";

    const DEFAULT_ANNOTATIONS = Object.freeze({
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: "default"
    });

    const ALERT_TO_CALLOUT = Object.freeze({
        note: { color: "blue_background", emoji: "ℹ️" },
        tip: { color: "green_background", emoji: "💡" },
        important: { color: "purple_background", emoji: "✅" },
        warning: { color: "yellow_background", emoji: "⚠️" },
        caution: { color: "red_background", emoji: "🚨" },
        default: { color: "gray_background", emoji: "💬" }
    });

    function asString(value) {
        return String(value || "");
    }

    function sanitizeText(text) {
        return asString(text).replace(/\u00a0/g, " ");
    }

    function normalizeNotionColor(rawColor, isBackground) {
        const value = asString(rawColor).trim().toLowerCase();
        if (!value) return "default";

        const nameMap = {
            gray: "gray",
            grey: "gray",
            brown: "brown",
            orange: "orange",
            yellow: "yellow",
            green: "green",
            blue: "blue",
            purple: "purple",
            pink: "pink",
            red: "red"
        };

        const normalized = value
            .replace(/\s+/g, "")
            .replace(/_background$/g, "")
            .replace(/background$/g, "")
            .replace(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i, "$1")
            .trim();

        if (nameMap[normalized]) {
            return isBackground ? `${nameMap[normalized]}_background` : nameMap[normalized];
        }

        if (normalized.startsWith("rgb")) {
            const parts = normalized.replace(/rgba?\(|\)/g, "").split(",").map(n => Number.parseFloat(n.trim()));
            const [r, g, b] = parts;
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                if (r > 200 && g > 180 && b < 140) return isBackground ? "yellow_background" : "yellow";
                if (r > 180 && g < 120 && b < 120) return isBackground ? "red_background" : "red";
                if (g > r && g > b) return isBackground ? "green_background" : "green";
                if (b > r && b > g) return isBackground ? "blue_background" : "blue";
            }
        }

        if (/f?ff(?:f0|e0|d0)/.test(normalized)) {
            return isBackground ? "yellow_background" : "yellow";
        }

        return "default";
    }

    function chunkText(value, size) {
        const text = asString(value);
        if (!text) return [];
        const parts = [];
        for (let i = 0; i < text.length; i += size) {
            parts.push(text.slice(i, i + size));
        }
        return parts;
    }

    function cloneAnnotations(base, overrides) {
        return {
            ...DEFAULT_ANNOTATIONS,
            ...(base || {}),
            ...(overrides || {})
        };
    }

    function parseInlineRichText(root, inheritedAnnotations, inheritedLink) {
        const output = [];

        function appendText(text, annotations, href) {
            const normalized = sanitizeText(text);
            if (!normalized) return;
            const chunks = chunkText(normalized, 1900);
            chunks.forEach(chunk => {
                output.push({
                    type: "text",
                    text: {
                        content: chunk,
                        link: href ? { url: href } : null
                    },
                    annotations: cloneAnnotations(annotations)
                });
            });
        }

        function walk(node, annotations, href) {
            if (!node) return;
            if (node.nodeType === Node.TEXT_NODE) {
                appendText(node.nodeValue || "", annotations, href);
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return;
            }

            const el = node;
            const tag = asString(el.tagName).toLowerCase();
            let nextAnnotations = cloneAnnotations(annotations);
            let nextHref = href;

            if (tag === "strong" || tag === "b") nextAnnotations.bold = true;
            if (tag === "em" || tag === "i") nextAnnotations.italic = true;
            if (tag === "u") nextAnnotations.underline = true;
            if (tag === "s" || tag === "del" || tag === "strike") nextAnnotations.strikethrough = true;
            if (tag === "code") nextAnnotations.code = true;
            if (tag === "mark") nextAnnotations.color = "yellow_background";

            const styleColor = el.style?.color || "";
            const styleBackground = el.style?.backgroundColor || el.style?.background || "";
            if (styleColor) {
                const color = normalizeNotionColor(styleColor, false);
                if (color !== "default") nextAnnotations.color = color;
            }
            if (styleBackground) {
                const bgColor = normalizeNotionColor(styleBackground, true);
                if (bgColor !== "default") nextAnnotations.color = bgColor;
            }

            if (tag === "a") {
                const candidate = asString(el.getAttribute("href")).trim();
                nextHref = candidate || href || null;
            }

            if (tag === "br") {
                appendText("\n", nextAnnotations, nextHref);
                return;
            }

            Array.from(el.childNodes || []).forEach(child => walk(child, nextAnnotations, nextHref));
        }

        walk(root, cloneAnnotations(inheritedAnnotations), inheritedLink || null);
        return output;
    }

    function buildParagraphBlock(element) {
        const richText = parseInlineRichText(element, DEFAULT_ANNOTATIONS, null);
        return {
            object: "block",
            type: "paragraph",
            paragraph: {
                rich_text: richText,
                color: "default"
            }
        };
    }

    function mapAlertType(value) {
        const raw = asString(value).trim().toLowerCase();
        if (ALERT_TO_CALLOUT[raw]) return ALERT_TO_CALLOUT[raw];
        return ALERT_TO_CALLOUT.default;
    }

    function buildCalloutBlock(element) {
        const type = asString(element.getAttribute("data-type")).trim().toLowerCase();
        const conf = mapAlertType(type);
        const richText = parseInlineRichText(element, DEFAULT_ANNOTATIONS, null);
        return {
            object: "block",
            type: "callout",
            callout: {
                rich_text: richText,
                color: conf.color,
                icon: { emoji: conf.emoji }
            }
        };
    }

    function extractCodeLanguage(element) {
        const codeEl = element.tagName?.toLowerCase() === "code"
            ? element
            : element.querySelector("code");
        if (!codeEl) return "plain text";
        const className = asString(codeEl.getAttribute("class")).trim();
        const match = className.match(/language-([a-z0-9_+-]+)/i);
        return match?.[1] || "plain text";
    }

    function buildCodeBlock(element, forcedLanguage) {
        const codeEl = element.tagName?.toLowerCase() === "code"
            ? element
            : element.querySelector("code");
        const text = sanitizeText(codeEl?.textContent || element.textContent || "");
        return {
            object: "block",
            type: "code",
            code: {
                rich_text: parseInlineRichText(document.createTextNode(text), cloneAnnotations(DEFAULT_ANNOTATIONS, { code: true }), null),
                language: asString(forcedLanguage || extractCodeLanguage(element) || "plain text")
            }
        };
    }

    function buildHeadingBlock(element, level) {
        const type = level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
        return {
            object: "block",
            type,
            [type]: {
                rich_text: parseInlineRichText(element, DEFAULT_ANNOTATIONS, null),
                color: "default",
                is_toggleable: false
            }
        };
    }

    function buildListBlocks(listElement, type) {
        const listType = type === "ol" ? "numbered_list_item" : "bulleted_list_item";
        const blocks = [];
        const listItems = Array.from(listElement.querySelectorAll(":scope > li"));

        listItems.forEach(li => {
            const richText = parseInlineRichText(li, DEFAULT_ANNOTATIONS, null);
            blocks.push({
                object: "block",
                type: listType,
                [listType]: {
                    rich_text: richText,
                    color: "default"
                }
            });
        });

        return blocks;
    }

    function buildTableBlock(tableElement) {
        const rows = Array.from(tableElement.querySelectorAll("tr"));
        if (!rows.length) return null;

        const matrix = rows.map(row => Array.from(row.querySelectorAll("th,td")));
        const width = Math.max(...matrix.map(cells => cells.length), 1);
        const hasColumnHeader = matrix[0].some(cell => cell.tagName.toLowerCase() === "th");

        const children = matrix.map(cells => {
            const padded = cells.slice(0, width);
            while (padded.length < width) padded.push(null);
            return {
                object: "block",
                type: "table_row",
                table_row: {
                    cells: padded.map(cell => {
                        if (!cell) return [];
                        return parseInlineRichText(cell, DEFAULT_ANNOTATIONS, null);
                    })
                }
            };
        });

        return {
            object: "block",
            type: "table",
            table: {
                table_width: width,
                has_column_header: hasColumnHeader,
                has_row_header: false,
                children
            }
        };
    }

    function isDataUrl(value) {
        return /^data:/i.test(asString(value));
    }

    function parseDataUrl(value) {
        const match = asString(value).match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
        if (!match) return null;
        const contentType = match[1] || "application/octet-stream";
        const isBase64 = Boolean(match[2]);
        const raw = match[3] || "";
        const dataBase64 = isBase64
            ? raw
            : btoa(unescape(encodeURIComponent(decodeURIComponent(raw))));
        return { contentType, dataBase64 };
    }

    async function blobToBase64(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function pickFileName(prefix, contentType, fallbackExt) {
        const extMap = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/gif": "gif",
            "image/svg+xml": "svg",
            "image/webp": "webp"
        };
        const ext = extMap[asString(contentType).toLowerCase()] || fallbackExt || "bin";
        return `${prefix}.${ext}`;
    }

    async function buildImageAsset(src, options) {
        const safeSrc = asString(src).trim();
        if (!safeSrc) return null;

        if (isDataUrl(safeSrc)) {
            const parsed = parseDataUrl(safeSrc);
            if (!parsed?.dataBase64) return null;
            return {
                contentType: parsed.contentType,
                dataBase64: parsed.dataBase64,
                sourceUrl: ""
            };
        }

        if (/^blob:/i.test(safeSrc)) {
            try {
                const response = await fetch(safeSrc);
                if (!response.ok) return null;
                const blob = await response.blob();
                return {
                    contentType: blob.type || "application/octet-stream",
                    dataBase64: await blobToBase64(blob),
                    sourceUrl: ""
                };
            } catch (err) {
                return null;
            }
        }

        if (/^https?:\/\//i.test(safeSrc)) {
            return {
                contentType: options?.contentType || "",
                dataBase64: "",
                sourceUrl: safeSrc
            };
        }

        return null;
    }

    async function renderMermaidSvg(code) {
        const mermaidApi = global.mermaid;
        if (!mermaidApi || typeof mermaidApi.render !== "function") {
            return null;
        }
        const id = `notion-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const normalizedCode = asString(code || "").trim();
        if (!normalizedCode) return null;
        try {
            mermaidApi.initialize({ startOnLoad: false, securityLevel: "loose", theme: "base" });
            const output = await mermaidApi.render(id, normalizedCode);
            return asString(output?.svg || "");
        } catch (err) {
            console.warn("Mermaid render for Notion export failed", err);
            return null;
        }
    }

    async function buildNotionBlocksFromHtml(html, options) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div id="__root">${asString(html)}</div>`, "text/html");
        const root = doc.getElementById("__root");
        const blocks = [];
        const assets = [];
        let assetIndex = 0;

        async function addImageBlockFromSrc(src, prefix) {
            const asset = await buildImageAsset(src, {});
            if (!asset) return null;
            assetIndex += 1;
            const assetId = `asset-${assetIndex}`;
            const contentType = asset.contentType || "image/png";
            assets.push({
                id: assetId,
                filename: pickFileName(prefix || "image", contentType, "png"),
                contentType,
                dataBase64: asset.dataBase64 || "",
                sourceUrl: asset.sourceUrl || ""
            });
            return {
                object: "block",
                type: "image",
                image: {
                    type: "file_upload",
                    file_upload: { id: `asset:${assetId}` }
                }
            };
        }

        async function consumeNode(node) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
            const element = node;
            const tag = asString(element.tagName).toLowerCase();

            if (tag === "p") {
                blocks.push(buildParagraphBlock(element));
                return;
            }
            if (tag === "h1") {
                blocks.push(buildHeadingBlock(element, 1));
                return;
            }
            if (tag === "h2") {
                blocks.push(buildHeadingBlock(element, 2));
                return;
            }
            if (tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
                blocks.push(buildHeadingBlock(element, 3));
                return;
            }
            if (tag === "blockquote") {
                blocks.push(buildCalloutBlock(element));
                return;
            }
            if (tag === "ul" || tag === "ol") {
                blocks.push(...buildListBlocks(element, tag));
                return;
            }
            if (tag === "pre") {
                blocks.push(buildCodeBlock(element));
                return;
            }
            if (tag === "table") {
                const tableBlock = buildTableBlock(element);
                if (tableBlock) blocks.push(tableBlock);
                return;
            }
            if (tag === "img") {
                const imageBlock = await addImageBlockFromSrc(element.getAttribute("src"), "image");
                if (imageBlock) blocks.push(imageBlock);
                return;
            }
            if (tag === "mermaid-diagram") {
                const code = asString(element.getAttribute("code") || element.textContent || "").trim();
                if (code) {
                    blocks.push({
                        object: "block",
                        type: "code",
                        code: {
                            rich_text: [{
                                type: "text",
                                text: { content: code.slice(0, 1900), link: null },
                                annotations: cloneAnnotations(DEFAULT_ANNOTATIONS, { code: true })
                            }],
                            language: "mermaid"
                        }
                    });
                }
                const mermaidSvg = await renderMermaidSvg(code);
                if (mermaidSvg) {
                    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(mermaidSvg)))}`;
                    const imageBlock = await addImageBlockFromSrc(svgDataUrl, "mermaid");
                    if (imageBlock) blocks.push(imageBlock);
                }
                return;
            }

            if (tag === "div" || tag === "section" || tag === "article" || tag === "main") {
                const children = Array.from(element.children || []);
                if (!children.length) {
                    const text = sanitizeText(element.textContent || "").trim();
                    if (text) {
                        blocks.push({
                            object: "block",
                            type: "paragraph",
                            paragraph: {
                                rich_text: [{
                                    type: "text",
                                    text: { content: text.slice(0, 1900), link: null },
                                    annotations: cloneAnnotations(DEFAULT_ANNOTATIONS)
                                }],
                                color: "default"
                            }
                        });
                    }
                    return;
                }
                for (const child of children) {
                    await consumeNode(child);
                }
                return;
            }

            const fallbackText = sanitizeText(element.textContent || "").trim();
            if (fallbackText) {
                blocks.push({
                    object: "block",
                    type: "paragraph",
                    paragraph: {
                        rich_text: [{
                            type: "text",
                            text: { content: fallbackText.slice(0, 1900), link: null },
                            annotations: cloneAnnotations(DEFAULT_ANNOTATIONS)
                        }],
                        color: "default"
                    }
                });
            }
        }

        const topChildren = Array.from(root?.children || []);
        for (const child of topChildren) {
            await consumeNode(child);
            if (blocks.length >= 100) break;
        }

        if (!blocks.length) {
            blocks.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                    rich_text: [{
                        type: "text",
                        text: { content: "Document vide", link: null },
                        annotations: cloneAnnotations(DEFAULT_ANNOTATIONS)
                    }],
                    color: "default"
                }
            });
        }

        return {
            blocks: blocks.slice(0, 100),
            assets
        };
    }

    async function buildPublishPayload(options) {
        const html = asString(options?.html || "");
        return buildNotionBlocksFromHtml(html, options || {});
    }

    global.GoToolkitNotionExport = {
        buildPublishPayload
    };
})(window);
