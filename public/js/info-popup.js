(function () {
    "use strict";

    const DEFAULT_CONFIG = {
        triggerSelector: "#infoButton",
        popupId: "infoPopup",
        moduleLabel: "GoToolkit",
        description: "Usage réservé à Savane Consulting.",
        version: "2026.01.16.7",
        logoSrc: "img/logo.gif",
        logoAlt: "Logo GoToolkit",
        versionQueryParam: "v",
        updateButtonLabel: "Mettre à jour",
        legalButtonLabel: "Mentions légales",
        legalButtonAttr: { name: "data-open-nexus-modal", value: "" },
        onBeforeOpen: null,
        onOpen: null,
        onClose: null
    };

    const state = {
        mounted: false,
        config: DEFAULT_CONFIG,
        popup: null,
        trigger: null,
        documentClickListener: null,
        api: null
    };

    function getBrowserDateVersion() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${now.getFullYear()}.${month}.${day}`;
    }

    function resetInfoLogo() {
        const logo = state.popup?.querySelector("img");
        if (!logo) return;
        const src = logo.getAttribute("src");
        if (!src) return;
        logo.src = "";
        void logo.offsetWidth;
        logo.src = src;
    }

    function reloadAppWithVersion(version) {
        try {
            const url = new URL(window.location.href);
            const targetVersion = version || state.config.version;
            if (targetVersion) {
                url.searchParams.set(state.config.versionQueryParam, targetVersion);
            }
            window.location.href = url.toString();
        } catch (err) {
            window.location.reload();
        }
    }

    function closePopup() {
        if (!state.popup) return;
        if (state.popup.classList.contains("open")) {
            state.popup.classList.remove("open");
            state.config.onClose?.();
        }
    }

    function openPopup() {
        if (!state.popup || !state.trigger) return;
        if (state.popup.classList.contains("open")) {
            return;
        }
        state.config.onBeforeOpen?.();
        resetInfoLogo();
        state.popup.classList.add("open");
        state.config.onOpen?.();
    }

    function togglePopup() {
        if (!state.popup) return;
        if (state.popup.classList.contains("open")) {
            closePopup();
            return;
        }
        openPopup();
    }

    function handleDocumentClick(event) {
        if (!state.popup) return;
        if (state.trigger?.contains(event.target)) return;
        if (state.popup.contains(event.target)) return;
        closePopup();
    }

    function buildPopup(config) {
        const popup = document.createElement("div");
        popup.id = config.popupId;
        popup.className = "info-popup";
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-live", "polite");

        const logoLight = document.createElement("img");
        logoLight.src = config.logoSrc;
        logoLight.alt = config.logoAlt;
        logoLight.className = "logo-light";

        const logoDark = document.createElement("img");
        logoDark.src = config.logoSrc.replace("logo.gif", "logo-inverted.gif");
        logoDark.alt = config.logoAlt;
        logoDark.className = "logo-dark";

        const label = document.createElement("strong");
        label.textContent = config.moduleLabel;

        const versionLabel = document.createElement("span");
        versionLabel.textContent = `Version ${config.version}`;

        const description = document.createElement("span");
        description.textContent = config.description;

        const actions = document.createElement("div");
        actions.className = "info-actions";

        const updateBtn = document.createElement("button");
        updateBtn.type = "button";
        updateBtn.className = "update-btn";
        updateBtn.textContent = config.updateButtonLabel;
        updateBtn.addEventListener("click", event => {
            event.stopPropagation();
            closePopup();
            reloadAppWithVersion(getBrowserDateVersion());
        });

        const legalBtn = document.createElement("button");
        legalBtn.type = "button";
        legalBtn.className = "secondary";
        legalBtn.textContent = config.legalButtonLabel;
        if (config.legalButtonAttr?.name) {
            legalBtn.setAttribute(config.legalButtonAttr.name, config.legalButtonAttr.value || "");
        }

        actions.appendChild(updateBtn);
        actions.appendChild(legalBtn);

        popup.appendChild(logoLight);
        popup.appendChild(logoDark);
        popup.appendChild(label);
        popup.appendChild(versionLabel);
        popup.appendChild(description);
        popup.appendChild(actions);

        document.body.appendChild(popup);
        return popup;
    }

    function mount(config) {
        if (state.mounted) {
            return state.api;
        }
        const finalConfig = Object.assign({}, DEFAULT_CONFIG, config);
        const trigger = document.querySelector(finalConfig.triggerSelector);
        if (!trigger) {
            console.warn(`[GoToolkitInfoPopup] trigger not found (${finalConfig.triggerSelector})`);
            return null;
        }
        const popup = buildPopup(finalConfig);
        const docListener = event => handleDocumentClick(event);
        trigger.addEventListener("click", event => {
            event.stopPropagation();
            togglePopup();
        });
        document.addEventListener("click", docListener);

        state.mounted = true;
        state.config = finalConfig;
        state.trigger = trigger;
        state.popup = popup;
        state.documentClickListener = docListener;
        state.api = {
            open: openPopup,
            close: closePopup,
            toggle: togglePopup,
            isOpen: () => state.popup && state.popup.classList.contains("open"),
            reloadAppWithVersion
        };
        return state.api;
    }

    const globalApi = window.GoToolkitInfoPopup || {};
    globalApi.mount = mount;
    globalApi.open = () => state.api?.open();
    globalApi.close = () => state.api?.close();
    globalApi.toggle = () => state.api?.toggle();
    globalApi.isOpen = () => state.api?.isOpen?.();
    globalApi.reloadAppWithVersion = version => state.api?.reloadAppWithVersion?.(version);

    window.GoToolkitInfoPopup = globalApi;

    function initializeFromConfig() {
        const config = window.GoToolkitInfoPopupConfig;
        if (config) {
            globalApi.mount(config);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeFromConfig);
    } else {
        initializeFromConfig();
    }
})();
