"use strict";

(() => {
    const renderHelpIcons = () => {
        window.lucide?.createIcons?.({
            attrs: {
                width: "14",
                height: "14",
                "stroke-width": "2"
            }
        });
    };

    if (document.readyState !== "loading") {
        renderHelpIcons();
    } else {
        window.addEventListener("DOMContentLoaded", renderHelpIcons, { once: true });
    }

    window.addEventListener("load", renderHelpIcons, { once: true });
})();
