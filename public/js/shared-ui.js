(() => {
    const SHARE_MENU_TEMPLATE = `
        <div class="context-menu share-menu" id="shareMenu" role="dialog" aria-live="polite">
            <div class="menu-panel">
                <div class="menu-header">Lien de partage</div>
                <div class="share-link-line">
                    <input id="shareLinkField" class="share-link-field" type="text" readonly placeholder="Créer un lien">
                </div>
                <div class="share-actions">
                    <button id="shareUpdateBtn" type="button" class="btn-primary">⟳ Actualiser</button>
                    <button id="shareCreateBtn" type="button" class="btn">☍ Créer</button>
                </div>
                <p class="share-menu-status" id="shareMenuStatus"></p>
            </div>
        </div>`;

    function resolveElement(selectorOrElement) {
        if (!selectorOrElement) {
            return null;
        }
        if (typeof selectorOrElement === "string") {
            return document.querySelector(selectorOrElement);
        }
        return selectorOrElement instanceof Element ? selectorOrElement : null;
    }

    function renderShareMenu(slot) {
        const slotElement = resolveElement(slot);
        if (!slotElement || slotElement.dataset.shareMenuRendered === "true") {
            return document.getElementById("shareMenu");
        }
        slotElement.innerHTML = SHARE_MENU_TEMPLATE.trim();
        slotElement.dataset.shareMenuRendered = "true";
        return slotElement.querySelector("#shareMenu");
    }

    function renderToast(id, options = {}) {
        const existing = document.getElementById(id);
        if (existing) {
            return existing;
        }
        const slotSelector = options.slotSelector || `[data-toast-slot="${id}"]`;
        const slot = resolveElement(slotSelector);
        const toast = document.createElement("div");
        toast.id = id;
        toast.className = options.className || "toast";
        toast.setAttribute("role", options.role || "status");
        toast.setAttribute("aria-live", options.ariaLive || "polite");
        if (options.ariaAtomic !== false) {
            toast.setAttribute("aria-atomic", "true");
        }
        if (slot) {
            slot.replaceWith(toast);
        } else if (options.appendTo) {
            options.appendTo.appendChild(toast);
        } else {
            document.body.appendChild(toast);
        }
        return toast;
    }

    function hydrateShareMenus() {
        const slots = Array.from(document.querySelectorAll("[data-share-menu-slot]"));
        slots.forEach(slot => renderShareMenu(slot));
    }

    function hydrateToastSlots() {
        const slots = Array.from(document.querySelectorAll("[data-toast-slot]"));
        slots.forEach(slot => {
            const slotId = slot.dataset.toastSlot;
            if (!slotId) {
                return;
            }
            const options = {
                slotSelector: `[data-toast-slot="${slotId}"]`,
                className: slot.dataset.toastClass || slot.className || "toast",
                role: slot.dataset.toastRole,
                ariaLive: slot.dataset.toastAriaLive,
                ariaAtomic: slot.dataset.toastAriaAtomic === "false" ? false : slot.dataset.toastAriaAtomic === "true" ? true : undefined
            };
            renderToast(slotId, options);
        });
    }

    function hydrateSharedUI() {
        hydrateShareMenus();
        hydrateToastSlots();
    }

    let contextCollapseIdSeed = 0;

    function ensureContextCollapseTargetId(element) {
        if (element.id) {
            return element.id;
        }
        contextCollapseIdSeed += 1;
        const generatedId = `gt-context-collapse-${contextCollapseIdSeed}`;
        element.id = generatedId;
        return generatedId;
    }

    function hydrateContextCollapsibles() {
        const OPEN_ICON = "▾";
        const CLOSED_ICON = "▸";
        const panels = Array.from(document.querySelectorAll("[data-context-collapse-target]"));
        if (!panels.length) {
            return;
        }
        panels.forEach(panel => {
            if (panel.dataset.contextCollapseInitialized === "true") {
                return;
            }
            const label = panel.querySelector(".gt-context-label.gt-context-toggle");
            const icon = label ? label.querySelector(".gt-context-toggle-icon") : null;
            const targetSelector = panel.dataset.contextCollapseTarget;
            const target =
                (targetSelector && panel.querySelector(targetSelector)) || panel.querySelector("textarea");
            if (!label || !icon || !target) {
                return;
            }
            panel.dataset.contextCollapseInitialized = "true";
            label.setAttribute("role", "button");
            label.tabIndex = 0;
            const targetId = ensureContextCollapseTargetId(target);
            label.setAttribute("aria-controls", targetId);
            const updateState = collapsed => {
                target.hidden = collapsed;
                icon.textContent = collapsed ? CLOSED_ICON : OPEN_ICON;
                label.setAttribute("aria-expanded", String(!collapsed));
            };
            const toggle = () => updateState(!target.hidden);
            label.addEventListener("click", toggle);
            label.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
                    event.preventDefault();
                    toggle();
                }
            });
            updateState(Boolean(target.hidden));
        });
    }

    const ACTION_COUNTDOWN_FRAMES = ["◴", "◷", "◶", "◵"];

    function normalizeActionCountdownTargets(targets) {
        if (!targets) {
            return [];
        }
        const entries = Array.isArray(targets) ? targets : [targets];
        const normalized = [];
        entries.forEach(entry => {
            if (!entry) {
                return;
            }
            if (entry instanceof Element) {
                normalized.push({ element: entry, defaultLabel: entry.textContent || "" });
                return;
            }
            const element = entry.element || entry.button;
            if (!(element instanceof Element)) {
                return;
            }
            const label =
                typeof entry.defaultLabel === "string"
                    ? entry.defaultLabel
                    : element.textContent || "";
            normalized.push({ element, defaultLabel: label });
        });
        return normalized;
    }

    function resolveCountdownDuration(value, fallback) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
            return Math.max(1, Math.round(numeric));
        }
        return fallback;
    }

    function createActionCountdown(targets, options = {}) {
        const resolvedTargets = normalizeActionCountdownTargets(targets);
        if (!resolvedTargets.length) {
            return {
                start() { /* noop */ },
                stop() { /* noop */ },
                isActive() { return false; }
            };
        }
        const frames =
            Array.isArray(options.frames) && options.frames.length
                ? options.frames.slice()
                : ACTION_COUNTDOWN_FRAMES.slice();
        const labelFormatter =
            typeof options.labelFormatter === "function"
                ? options.labelFormatter
                : function (frame, seconds) {
                      const padded = seconds < 10 ? "0" + seconds : String(seconds);
                      return frame + " " + padded + "s";
                  };
        let globalDefaultLabel =
            typeof options.defaultLabel === "string" ? options.defaultLabel : null;
        resolvedTargets.forEach(target => {
            if (globalDefaultLabel !== null) {
                target.defaultLabel = globalDefaultLabel;
            } else if (typeof target.defaultLabel !== "string") {
                target.defaultLabel = target.element.textContent || "";
            }
        });
        let timerId = null;
        let duration = resolveCountdownDuration(options.duration, 30);
        let remaining = duration;

        function applyLabel(label) {
            resolvedTargets.forEach(target => {
                if (!target.element) return;
                target.element.textContent = label;
            });
        }

        function restoreLabels() {
            resolvedTargets.forEach(target => {
                if (!target.element) return;
                if (typeof target.defaultLabel === "string") {
                    target.element.textContent = target.defaultLabel;
                }
            });
        }

        function tick() {
            if (!resolvedTargets.length) {
                return;
            }
            if (remaining < 0) {
                remaining = duration;
            }
            const frame = frames[Math.abs(remaining) % frames.length];
            const label = labelFormatter(frame, Math.max(0, remaining));
            applyLabel(label);
            remaining -= 1;
        }

        function stop(restore) {
            if (timerId) {
                clearInterval(timerId);
                timerId = null;
            }
            if (restore === false) {
                return;
            }
            restoreLabels();
        }

        function start(value) {
            stop(false);
            duration = resolveCountdownDuration(value, duration);
            remaining = duration;
            tick();
            timerId = setInterval(tick, 1000);
        }

        return {
            start,
            stop,
            isActive: function () {
                return Boolean(timerId);
            }
        };
    }

    function initContextModalSplitter(options = {}) {
        const container = resolveElement(options.container);
        const topPanel = resolveElement(options.topPanel);
        const bottomPanel = resolveElement(options.bottomPanel);
        const splitter = resolveElement(options.splitter);
        if (!container || !topPanel || !bottomPanel || !splitter) {
            return null;
        }
        const storageKey = typeof options.storageKey === "string" && options.storageKey ? options.storageKey : null;
        const defaultHeight =
            Number.isFinite(Number(options.defaultHeight)) && Number(options.defaultHeight) > 0
                ? Math.round(Number(options.defaultHeight))
                : 260;
        const minTopHeight =
            Number.isFinite(Number(options.minTopHeight)) && Number(options.minTopHeight) > 0
                ? Math.round(Number(options.minTopHeight))
                : 120;
        const minBottomHeight =
            Number.isFinite(Number(options.minBottomHeight)) && Number(options.minBottomHeight) > 0
                ? Math.round(Number(options.minBottomHeight))
                : 120;
        const keyboardStep =
            Number.isFinite(Number(options.keyboardStep)) && Number(options.keyboardStep) > 0
                ? Math.round(Number(options.keyboardStep))
                : 24;

        function readStoredHeight() {
            if (!storageKey) {
                return null;
            }
            try {
                const raw = window.localStorage.getItem(storageKey);
                const parsed = Number.parseInt(raw, 10);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            } catch (err) {
                /* noop */
            }
            return null;
        }

        function persistHeight(value) {
            if (!storageKey) return;
            try {
                window.localStorage.setItem(storageKey, Math.round(value).toString());
            } catch (err) {
                /* noop */
            }
        }

        function getContainerHeight() {
            return Math.max(container.clientHeight, container.offsetHeight, container.scrollHeight, 0);
        }

        function clampHeight(value) {
            const containerHeight = getContainerHeight();
            const maxAllowed = containerHeight
                ? Math.max(minTopHeight, containerHeight - minBottomHeight)
                : Math.max(minTopHeight, value);
            return Math.max(minTopHeight, Math.min(value, maxAllowed));
        }

        let currentHeight = clampHeight(readStoredHeight() || defaultHeight);

        function applyHeight(height) {
            const nextHeight = clampHeight(height);
            currentHeight = nextHeight;
            topPanel.style.flexBasis = `${nextHeight}px`;
            topPanel.style.height = `${nextHeight}px`;
            topPanel.style.flexGrow = "0";
            topPanel.style.flexShrink = "0";
        }

        bottomPanel.style.flex = "1 1 0";
        bottomPanel.style.minHeight = "0";
        bottomPanel.style.overflow = "hidden";

        function updateHeightFromKeyboard(delta) {
            applyHeight(currentHeight + delta);
            persistHeight(currentHeight);
        }

        let isResizing = false;
        let startHeight = currentHeight;
        let startY = 0;

        function handlePointerDown(ev) {
            if (ev.button !== 0) return;
            isResizing = true;
            startHeight = currentHeight;
            startY = ev.clientY;
            document.body.classList.add("context-resizing");
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointercancel", handlePointerUp);
            splitter.setPointerCapture?.(ev.pointerId);
            ev.preventDefault();
        }

        function handlePointerMove(ev) {
            if (!isResizing) return;
            const delta = ev.clientY - startY;
            applyHeight(startHeight + delta);
        }

        function handlePointerUp(ev) {
            if (!isResizing) return;
            isResizing = false;
            document.body.classList.remove("context-resizing");
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            splitter.releasePointerCapture?.(ev.pointerId);
            persistHeight(currentHeight);
        }

        function handleKeyDown(ev) {
            if (ev.key === "ArrowUp") {
                updateHeightFromKeyboard(-keyboardStep);
                ev.preventDefault();
            } else if (ev.key === "ArrowDown") {
                updateHeightFromKeyboard(keyboardStep);
                ev.preventDefault();
            }
        }

        splitter.addEventListener("pointerdown", handlePointerDown);
        splitter.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", () => applyHeight(currentHeight));
        applyHeight(currentHeight);

        return {
            getHeight() {
                return currentHeight;
            },
            setHeight(value) {
                applyHeight(value);
                persistHeight(currentHeight);
            }
        };
    }

    hydrateSharedUI();
    hydrateContextCollapsibles();
    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", hydrateSharedUI);
        window.addEventListener("DOMContentLoaded", hydrateContextCollapsibles);
    }

    window.GoToolkitSharedUI = window.GoToolkitSharedUI || {};
    window.GoToolkitSharedUI.renderShareMenu =
        window.GoToolkitSharedUI.renderShareMenu || renderShareMenu;
    window.GoToolkitSharedUI.renderToast =
        window.GoToolkitSharedUI.renderToast || renderToast;
    window.GoToolkitSharedUI.createActionCountdown =
        window.GoToolkitSharedUI.createActionCountdown || createActionCountdown;
    window.GoToolkitContextSplitter = window.GoToolkitContextSplitter || {};
    window.GoToolkitContextSplitter.init =
        window.GoToolkitContextSplitter.init || initContextModalSplitter;
})();
