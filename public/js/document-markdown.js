
(function (global) {
    var ALLOWED_HEADING = "h2";

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function escapeAttribute(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/\"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function sanitizeUrl(url) {
        var trimmed = String(url || "").trim();
        if (!trimmed) return "#";
        if (!/^https?:\/\//i.test(trimmed)) return "#";
        return trimmed.replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E");
    }

    function formatInline(text) {
        var formatted = text;
        formatted = formatted.replace(/`([^`]+)`/g, function (_, code) {
            return "<code>" + code + "</code>";
        });
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, url) {
            var safeUrl = sanitizeUrl(url);
            return '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
        });
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        formatted = formatted.replace(/__([^_]+)__/g, "<strong>$1</strong>");
        formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
        return formatted;
    }

    function clampHeadingTag(level) {
        var n = Number(level);
        if (!Number.isFinite(n)) return "h2";
        if (n <= 1) return "h1";
        if (n === 2) return "h2";
        if (n === 3) return "h3";
        if (n === 4) return "h4";
        return "h4";
    }

    function isTableSeparatorLine(line) {
        var trimmed = (line || "").trim();
        if (!trimmed) return false;
        // e.g. | --- | :---: | ---: |
        return /^\|?\s*:?[-]{3,}:?(\s*\|\s*:?[-]{3,}:?)*\s*\|?\s*$/.test(trimmed);
    }

    function splitTableRow(line) {
        var trimmed = String(line || "").trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
        if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
        var cells = [];
        var current = "";
        var inCode = false;
        for (var i = 0; i < trimmed.length; i++) {
            var ch = trimmed[i];
            if (ch === "`") {
                inCode = !inCode;
                current += ch;
                continue;
            }
            if (ch === "|" && !inCode) {
                cells.push(current.trim());
                current = "";
                continue;
            }
            current += ch;
        }
        cells.push(current.trim());
        return cells;
    }

    function renderTable(headerLine, separatorLine, bodyLines) {
        var headerCells = splitTableRow(headerLine);
        if (!headerCells.length || !isTableSeparatorLine(separatorLine)) return null;

        var html = [];
        html.push("<table><thead><tr>" + headerCells.map(function (cell) {
            return "<th>" + formatInline(cell) + "</th>";
        }).join("") + "</tr></thead><tbody>");

        (bodyLines || []).forEach(function (line) {
            var cells = splitTableRow(line);
            if (!cells.length) return;
            html.push("<tr>" + cells.map(function (cell) {
                return "<td>" + formatInline(cell) + "</td>";
            }).join("") + "</tr>");
        });

        html.push("</tbody></table>");
        return html.join("");
    }

    function renderNonCodeBlock(blockText) {
        var lines = blockText.split(/\r?\n/);
        var html = [];
        var listItems = [];

        function flushList() {
            if (!listItems.length) return;
            html.push("<ul>" + listItems.map(function (item) {
                return "<li>" + formatInline(item) + "</li>";
            }).join("") + "</ul>");
            listItems = [];
        }

        lines.forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed) {
                flushList();
                return;
            }
            var headingMatch = trimmed.match(/^#{1,6}\s+(.*)$/);
            if (headingMatch) {
                flushList();
                html.push("<" + ALLOWED_HEADING + ">" + formatInline(headingMatch[1].trim()) + "</" + ALLOWED_HEADING + ">");
                return;
            }
            var listMatch = trimmed.match(/^[-*+]\s+(.*)$/);
            if (listMatch) {
                listItems.push(listMatch[1]);
                return;
            }
            flushList();
            html.push("<p>" + formatInline(trimmed) + "</p>");
        });

        flushList();
        return html.join("");
    }

    function renderDocumentMarkdown(markdown) {
        if (!markdown) return "";

        // Escape user-provided markdown to avoid raw HTML injection.
        var safe = escapeHtml(markdown);

        // Extract fenced code blocks (```lang\n...```), keep placeholders so we can parse the rest line-by-line.
        var codeBlocks = [];
        safe = safe.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, function (_, lang, code) {
            var idx = codeBlocks.length;
            codeBlocks.push({
                lang: (lang || "").trim(),
                code: String(code || "")
            });
            return "\n\n@@CODE_BLOCK_" + idx + "@@\n\n";
        });

        var lines = safe.split(/\r?\n/);
        var out = [];

        var currentPara = [];
        var currentUl = [];
        var currentOl = [];
        var currentQuote = [];

        function flushParagraph() {
            if (!currentPara.length) return;
            out.push("<p>" + formatInline(currentPara.join("<br>")) + "</p>");
            currentPara = [];
        }

        function flushUl() {
            if (!currentUl.length) return;
            out.push("<ul>" + currentUl.map(function (t) {
                return "<li>" + formatInline(t) + "</li>";
            }).join("") + "</ul>");
            currentUl = [];
        }

        function flushOl() {
            if (!currentOl.length) return;
            out.push("<ol>" + currentOl.map(function (t) {
                return "<li>" + formatInline(t) + "</li>";
            }).join("") + "</ol>");
            currentOl = [];
        }

        function flushQuote() {
            if (!currentQuote.length) return;
            var fullContent = currentQuote.join("\n");
            var alertMatch = fullContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|ALERTE|ATTENTION)\](?:\s+(.*))?(?:\n|$)/i);

            if (alertMatch) {
                var typeMap = {
                    'NOTE': 'NOTE',
                    'TIP': 'TIP',
                    'IMPORTANT': 'IMPORTANT',
                    'WARNING': 'WARNING',
                    'ALERTE': 'WARNING',
                    'CAUTION': 'CAUTION',
                    'ATTENTION': 'CAUTION'
                };
                var type = typeMap[alertMatch[1].toUpperCase()] || 'NOTE';
                var title = alertMatch[2] ? alertMatch[2].trim() : "";
                var contentLines = fullContent.slice(alertMatch[0].length).split("\n");

                var titleAttr = title ? ' data-title="' + escapeAttribute(title) + '"' : '';
                out.push('<blockquote data-type="' + type + '"' + titleAttr + '>' + formatInline(contentLines.join("<br>")) + '</blockquote>');
            } else {
                out.push("<blockquote>" + formatInline(currentQuote.join("<br>")) + "</blockquote>");
            }
            currentQuote = [];
        }

        function flushAll() {
            flushQuote();
            flushUl();
            flushOl();
            flushParagraph();
        }

        for (var i = 0; i < lines.length; i++) {
            var rawLine = lines[i];
            var trimmed = (rawLine || "").trim();

            if (!trimmed) {
                flushAll();
                continue;
            }

            var codePlaceholder = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
            if (codePlaceholder) {
                flushAll();
                var codeIndex = Number(codePlaceholder[1]);
                var entry = codeBlocks[codeIndex];
                if (entry) {
                    var classAttr = entry.lang ? ' class="language-' + escapeAttribute(entry.lang) + '"' : "";
                    out.push("<pre><code" + classAttr + ">" + entry.code + "</code></pre>");
                }
                continue;
            }

            // Table: header line + separator line
            if (rawLine.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
                flushAll();
                var body = [];
                var j = i + 2;
                while (j < lines.length) {
                    var bodyLine = lines[j];
                    if (!bodyLine || !bodyLine.trim() || !bodyLine.includes("|")) break;
                    body.push(bodyLine);
                    j++;
                }
                var tableHtml = renderTable(rawLine, lines[i + 1], body);
                if (tableHtml) {
                    out.push(tableHtml);
                    i = j - 1;
                    continue;
                }
            }

            // Horizontal rule
            if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
                flushAll();
                out.push("<hr>");
                continue;
            }

            // Heading
            var headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                flushAll();
                var tag = clampHeadingTag(headingMatch[1].length);
                var content = headingMatch[2].trim();

                // Support for {#id} syntax
                var idMatch = content.match(/(.*)\s+\{#([a-zA-Z0-9_-]+)\}$/);
                var idAttr = "";
                if (idMatch) {
                    content = idMatch[1].trim();
                    idAttr = ' id="' + escapeAttribute(idMatch[2]) + '"';
                }

                out.push("<" + tag + idAttr + ">" + formatInline(content) + "</" + tag + ">");
                continue;
            }

            // Blockquote
            var quoteMatch = trimmed.match(/^>(?:\s+)?(.*)$/);
            if (quoteMatch) {
                flushParagraph();
                flushUl();
                flushOl();
                currentQuote.push(quoteMatch[1]);
                continue;
            }

            // Unordered list
            var ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
            if (ulMatch) {
                flushParagraph();
                flushQuote();
                flushOl();
                currentUl.push(ulMatch[1]);
                continue;
            }

            // Ordered list
            var olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
            if (olMatch) {
                flushParagraph();
                flushQuote();
                flushUl();
                currentOl.push(olMatch[1]);
                continue;
            }

            // Default: paragraph line (preserve manual line breaks)
            flushQuote();
            flushUl();
            flushOl();
            currentPara.push(trimmed);
        }

        flushAll();
        return out.join("");
    }

    function renderMarkdown(markdown) {
        if (!markdown) return "";
        var safe = escapeHtml(markdown);
        var segments = safe.split(/```/);
        var html = [];

        segments.forEach(function (segment, index) {
            if (index % 2 === 1) {
                html.push("<pre><code>" + segment + "</code></pre>");
            } else {
                if (!segment.trim()) return;
                html.push(renderNonCodeBlock(segment));
            }
        });

        return html.join("");
    }

    global.GoToolkitMarkdown = {
        render: renderMarkdown,
        renderDocument: renderDocumentMarkdown
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = global.GoToolkitMarkdown;
    }
})(typeof window !== "undefined" ? window : this);
