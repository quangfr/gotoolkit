"use strict";

(() => {
    const buildQuestionToc = () => {
        const toc = document.getElementById("helpQuestionToc");
        if (!(toc instanceof HTMLOListElement)) return;
        toc.textContent = "";
        const questions = Array.from(document.querySelectorAll(".help-list > div > strong"));
        questions.forEach((strongEl, index) => {
            const text = (strongEl.textContent || "").trim();
            if (!text) return;
            const container = strongEl.parentElement;
            if (!container) return;
            if (!container.id) {
                container.id = `q-${index + 1}`;
            }
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = `#${container.id}`;
            a.textContent = text;
            li.appendChild(a);
            toc.appendChild(li);
        });
    };

    const initBackToTopButton = () => {
        const button = document.getElementById("helpBackToTop");
        if (!(button instanceof HTMLButtonElement)) return;
        const updateVisibility = () => {
            button.classList.toggle("show", window.scrollY > 260);
        };
        button.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        window.addEventListener("scroll", updateVisibility, { passive: true });
        updateVisibility();
    };

    const updateLatestVersionLinks = () => {
        const links = document.querySelectorAll('[data-latest-version-link="true"]');
        if (!links.length) return;
        const now = new Date();
        const yyyy = String(now.getFullYear());
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const versionTag = `${yyyy}.${mm}.${dd}`;
        links.forEach((link) => {
            if (link instanceof HTMLAnchorElement) {
                link.href = `./?v=${versionTag}`;
            }
        });
    };

    const renderHelpIcons = () => {
        buildQuestionToc();
        initBackToTopButton();
        updateLatestVersionLinks();
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
