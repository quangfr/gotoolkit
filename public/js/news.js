(function () {
    const RELEASES_PATH = "content/index_releases.md";
    const ROADMAP_PATH = "content/index_roadmap.md";

    const state = {
        modal: null,
        closeBtn: null,
        sections: {},
        loaded: {
            releaseNotesContent: false,
            roadmapContent: false
        },
        lastTrigger: null
    };

    function createModalMarkup() {
        if (document.getElementById("releaseNotesModal")) {
            return document.getElementById("releaseNotesModal");
        }
        const modal = document.createElement("div");
        modal.className = "release-notes-modal";
        modal.id = "releaseNotesModal";
        modal.setAttribute("aria-hidden", "true");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "releaseNotesTitle");
        modal.innerHTML = `
            <div class="release-notes-modal__dialog">
                <div class="release-notes-header">
                    <div>
                        <h2 id="releaseNotesTitle">Actualités</h2>
                    </div>
                    <button type="button" class="release-notes-close" id="releaseNotesClose" aria-label="Fermer les actualités">×</button>
                </div>
                <div class="release-notes-tabs">
                    <button class="release-tab release-tab--active" data-target="releaseNotesContent">Notes de version</button>
                    <button class="release-tab" data-target="roadmapContent">Feuille de route</button>
                </div>
                <div class="release-notes-content release-notes-content--active" id="releaseNotesContent">
                    <div class="release-notes-list"></div>
                </div>
                <div class="release-notes-content" id="roadmapContent">
                    <div class="release-roadmap-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function ensureState() {
        if (state.modal) {
            return;
        }
        const modal = createModalMarkup();
        state.modal = modal;
        state.closeBtn = modal.querySelector("#releaseNotesClose");
        state.sections = {
            releaseNotesContent: {
                wrapper: modal.querySelector("#releaseNotesContent"),
                list: modal.querySelector("#releaseNotesContent .release-notes-list")
            },
            roadmapContent: {
                wrapper: modal.querySelector("#roadmapContent"),
                list: modal.querySelector("#roadmapContent .release-roadmap-list")
            }
        };

        modal.querySelectorAll(".release-tab").forEach(tab => {
            tab.addEventListener("click", () => activateTab(tab.dataset.target || "releaseNotesContent"));
        });

        state.closeBtn?.addEventListener("click", closeNews);
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                closeNews();
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" && event.key !== "Esc") return;
            if (modal.classList.contains("open")) {
                closeNews();
                event.stopPropagation();
            }
        });
    }

    function activateTab(targetId) {
        ensureState();
        const tabs = state.modal.querySelectorAll(".release-tab");
        const contents = state.modal.querySelectorAll(".release-notes-content");
        tabs.forEach(btn => btn.classList.toggle("release-tab--active", btn.dataset.target === targetId));
        contents.forEach(content => content.classList.toggle("release-notes-content--active", content.id === targetId));
    }

    function cleanTag(token) {
        if (!token) return "";
        return token.replace(/^`|`$/g, "").replace(/^"|"$/g, "").trim();
    }

    function parseMarkdownSections(markdown) {
        const lines = (markdown || "").split(/\r?\n/);
        const sections = [];
        let current = null;

        function flushCurrent() {
            if (current) {
                sections.push(current);
                current = null;
            }
        }

        function ensureCurrentSection() {
            if (!current) {
                current = { title: "", tags: [], blocks: [] };
            }
            return current;
        }

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            const headerMatch = trimmed.match(/^##\s*(.*)$/);
            if (headerMatch) {
                flushCurrent();
                const headerLine = headerMatch[1];
                const inlineTags = [];
                const inlineRegex = /`([^`]+)`/g;
                let inlineMatch;
                while ((inlineMatch = inlineRegex.exec(headerLine))) {
                    const tag = cleanTag(inlineMatch[1]);
                    if (tag) inlineTags.push(tag);
                }
                const titleWithoutTags = headerLine.replace(/`[^`]+`/g, " ").replace(/\s+/g, " ").trim();
                current = {
                    title: titleWithoutTags || "",
                    tags: inlineTags,
                    blocks: []
                };
                return;
            }

            const tagMatch = trimmed.match(/^###\s*(.*)$/);
            if (tagMatch) {
                const section = ensureCurrentSection();
                tagMatch[1]
                    .split(",")
                    .map(token => cleanTag(token))
                    .filter(Boolean)
                    .forEach(tag => section.tags.push(tag));
                return;
            }

            const section = ensureCurrentSection();
            const listMatch = trimmed.match(/^-\s*(.*)$/);
            if (listMatch) {
                section.blocks.push({ type: "list", text: listMatch[1].trim() });
            } else {
                section.blocks.push({ type: "paragraph", text: trimmed });
            }
        });

        flushCurrent();
        return sections;
    }

    function createInlineFragment(text) {
        const fragment = document.createDocumentFragment();
        const regex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]+")?\)|`([^`]+)`/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text))) {
            if (match.index > lastIndex) {
                fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const href = match[2] && match[2].trim();
            const label = match[1];
            if (href && label) {
                const anchor = document.createElement("a");
                anchor.href = href;
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.textContent = label;
                fragment.append(anchor);
            } else if (match[3]) {
                const tag = match[3].trim();
                if (tag) {
                    const tagEl = document.createElement("span");
                    tagEl.className = "release-roadmap-tag";
                    tagEl.textContent = tag;
                    fragment.append(tagEl);
                }
            }
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            fragment.append(document.createTextNode(text.slice(lastIndex)));
        }
        return fragment;
    }

    function renderReleaseNotes(entries) {
        const section = state.sections.releaseNotesContent;
        if (!section?.list) return;
        const list = section.list;
        list.innerHTML = "";

        if (!entries.length) {
            const placeholder = document.createElement("div");
            placeholder.className = "release-note";
            const message = document.createElement("p");
            message.className = "release-note-text";
            message.textContent = "Aucune note de version disponible.";
            placeholder.appendChild(message);
            list.appendChild(placeholder);
            return;
        }

        entries.forEach(entryData => {
            const entry = document.createElement("div");
            entry.className = "release-note";
            const date = document.createElement("span");
            date.className = "release-note-date";
            date.textContent = entryData.title || "Sans date";
            entry.appendChild(date);

            if (!entryData.blocks.length) {
                const message = document.createElement("p");
                message.className = "release-note-text";
                message.textContent = "Aucune description enregistrée.";
                entry.appendChild(message);
            } else {
                let listItems = [];
                function flushList() {
                    if (!listItems.length) return;
                    const ul = document.createElement("ul");
                    ul.className = "release-note-list";
                    listItems.forEach(text => {
                        const li = document.createElement("li");
                        li.append(createInlineFragment(text));
                        ul.appendChild(li);
                    });
                    entry.appendChild(ul);
                    listItems = [];
                }

                entryData.blocks.forEach(block => {
                    if (block.type === "list") {
                        listItems.push(block.text);
                        return;
                    }
                    flushList();
                    const paragraph = document.createElement("p");
                    paragraph.className = "release-note-text";
                    paragraph.append(createInlineFragment(block.text));
                    entry.appendChild(paragraph);
                });
                flushList();
            }
            list.appendChild(entry);
        });
    }

    function renderRoadmap(entries) {
        const section = state.sections.roadmapContent;
        if (!section?.list) return;
        const list = section.list;
        list.innerHTML = "";

        if (!entries.length) {
            const message = document.createElement("p");
            message.className = "release-roadmap-text";
            message.textContent = "Feuille de route vide.";
            list.appendChild(message);
            return;
        }

        entries.forEach(entryData => {
            const item = document.createElement("div");
            item.className = "release-roadmap-item";
            const title = document.createElement("span");
            title.className = "release-roadmap-title";
            title.appendChild(document.createTextNode(entryData.title || "Sans titre"));

            entryData.tags.forEach(tag => {
                title.appendChild(document.createTextNode(" "));
                const tagEl = document.createElement("span");
                tagEl.className = "release-roadmap-tag";
                tagEl.textContent = tag;
                title.appendChild(tagEl);
            });
            item.appendChild(title);

            const listBlocks = entryData.blocks.filter(block => block.type === "list");
            if (listBlocks.length) {
                const ul = document.createElement("ul");
                ul.className = "release-roadmap-text";
                listBlocks.forEach(block => {
                    const li = document.createElement("li");
                    li.append(createInlineFragment(block.text));
                    ul.appendChild(li);
                });
                item.appendChild(ul);
            }

            const paragraphBlocks = entryData.blocks.filter(block => block.type === "paragraph");
            paragraphBlocks.forEach(block => {
                const paragraph = document.createElement("p");
                paragraph.className = "release-roadmap-text";
                paragraph.append(createInlineFragment(block.text));
                item.appendChild(paragraph);
            });

            if (!listBlocks.length && !paragraphBlocks.length) {
                const message = document.createElement("p");
                message.className = "release-roadmap-text";
                message.textContent = "Aucun détail renseigné.";
                item.appendChild(message);
            }

            list.appendChild(item);
        });
    }

    async function loadMarkdown(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Impossible de charger ${path}`);
        }
        return response.text();
    }

    async function refresh(key, path) {
        ensureState();
        const section = state.sections[key];
        if (!section?.list) return;

        try {
            const markdown = await loadMarkdown(path);
            const entries = parseMarkdownSections(markdown);
            if (key === "releaseNotesContent") {
                renderReleaseNotes(entries);
            } else {
                renderRoadmap(entries);
            }
            state.loaded[key] = true;
        } catch (err) {
            console.error(err);
            const targetClass = key === "releaseNotesContent" ? "release-note-text" : "release-roadmap-text";
            section.list.innerHTML = `<p class="${targetClass}">Impossible de charger le contenu.</p>`;
        }
    }

    function loadAllIfNeeded(forceReload) {
        const shouldReloadRelease = forceReload || !state.loaded.releaseNotesContent;
        const shouldReloadRoadmap = forceReload || !state.loaded.roadmapContent;
        if (shouldReloadRelease) {
            refresh("releaseNotesContent", RELEASES_PATH);
        }
        if (shouldReloadRoadmap) {
            refresh("roadmapContent", ROADMAP_PATH);
        }
    }

    function openNews(targetId) {
        ensureState();
        loadAllIfNeeded(false);
        activateTab(targetId || "releaseNotesContent");
        state.modal.classList.add("open");
        state.modal.setAttribute("aria-hidden", "false");
    }

    function closeNews() {
        ensureState();
        state.modal.classList.remove("open");
        state.modal.setAttribute("aria-hidden", "true");
        try {
            state.lastTrigger?.focus?.();
        } catch (err) {
            // ignore focus errors
        }
    }

    function openNewsFromTrigger(trigger, targetId) {
        state.lastTrigger = trigger || null;
        trigger?.closest?.(".info-popup")?.classList?.remove("open");
        openNews(targetId || "releaseNotesContent");
    }

    function bindTrigger(trigger) {
        if (!trigger || trigger.dataset.newsBound === "1") return;
        trigger.dataset.newsBound = "1";
        const target = trigger.getAttribute("data-news-target") || "releaseNotesContent";

        trigger.addEventListener("click", event => {
            event.preventDefault();
            openNewsFromTrigger(trigger, target);
        });

        trigger.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openNewsFromTrigger(trigger, target);
        });
    }

    function bindTriggers() {
        const selectors = ["#releaseNotesTrigger", "#memoNewsTrigger", "[data-open-news]"];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(bindTrigger);
        });
    }

    function handleNewsHash(hash) {
        const h = String(hash || "").toLowerCase();
        if (h === "#news") {
            openNews("releaseNotesContent");
            return true;
        }
        if (h === "#roadmap") {
            openNews("roadmapContent");
            return true;
        }
        return false;
    }

    function processNewsHash(hash) {
        const handled = handleNewsHash(hash);
        if (!handled) return;
        try {
            history.replaceState(null, "", location.pathname + location.search);
        } catch (err) {
            // ignore
        }
    }

    function init() {
        ensureState();
        bindTriggers();
        loadAllIfNeeded(false);
        processNewsHash(location.hash);
    }

    window.GoToolkitOpenNews = () => openNews("releaseNotesContent");
    window.GoToolkitOpenNewsTab = targetId => openNews(targetId || "releaseNotesContent");
    window.GoToolkitCloseNews = closeNews;
    window.GoToolkitRefreshNews = () => loadAllIfNeeded(true);
    window.GoToolkitHandleNewsHash = handleNewsHash;

    window.GoToolkitOpenReleaseNotes = window.GoToolkitOpenNews;
    window.GoToolkitOpenReleaseNotesTab = window.GoToolkitOpenNewsTab;

    document.addEventListener("DOMContentLoaded", init);
    window.addEventListener("hashchange", () => processNewsHash(location.hash));
})();
