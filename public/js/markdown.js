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
        formatted = formatted.replace(/_([^_]+)_/g, "<em>$1</em>");
        return formatted;
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
        render: renderMarkdown
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = global.GoToolkitMarkdown;
    }
})(typeof window !== "undefined" ? window : this);
