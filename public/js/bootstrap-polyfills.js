// Global Polyfill for missing browser APIs (prevents crashes in Excalidraw/Mermaid)
(function () {
    var g = typeof globalThis !== "undefined" ? globalThis : window;
    function ensure(name) {
        try {
            if (typeof g[name] === "undefined" || !g[name]) {
                var F = function () { };
                F.prototype = {};
                g[name] = F;
            }
            if (g[name] && !g[name].prototype) g[name].prototype = {};
        } catch (e) {
            // noop
        }
    }
    ["ShadowRoot", "HTMLSlotElement", "HTMLTemplateElement", "Element", "Path2D", "SVGPathSeg"].forEach(ensure);
    if (typeof Array.prototype.at !== "function") {
        Array.prototype.at = function (n) {
            n = Math.trunc(n) || 0;
            if (n < 0) n += this.length;
            if (n < 0 || n >= this.length) return undefined;
            return this[n];
        };
    }
})();
