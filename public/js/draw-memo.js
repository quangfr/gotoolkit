/**
 * draw-memo.js
 * Independent component to bridge Excalidraw (draw.bundle.js) with the Memo editor.
 */

window.GoToolkitDrawMemo = (function () {
    let excalidrawInstance = null;
    let isLoaded = false;
    let previewChain = Promise.resolve();

    const PRESETS = {
        small: {
            fontSize: 12,
            strokeWidth: 1.2,
            roughness: 0,
            flowchart: { padding: 0, nodeSpacing: 20, rankSpacing: 20 }
        },
        medium: {
            fontSize: 12,
            strokeWidth: 1.2,
            roughness: 0,
            flowchart: { padding: 3, nodeSpacing: 35, rankSpacing: 35 }
        },
        large: {
            fontSize: 12,
            strokeWidth: 1.2,
            roughness: 0,
            flowchart: { padding: 0, nodeSpacing: 20, rankSpacing: 20 }
        }
    };

    function getOptionsForSize(size) {
        return PRESETS[size?.toLowerCase()] || PRESETS.medium;
    }

    function enqueuePreview(fn) {
        const next = previewChain.then(fn, fn);
        // Keep the chain alive even if a preview fails
        previewChain = next.catch(() => undefined);
        return next;
    }

    function createOffscreenHost() {
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.left = '-10000px';
        host.style.top = '0';
        host.style.width = '1200px';
        host.style.height = '800px';
        host.style.opacity = '0';
        host.style.pointerEvents = 'none';
        return host;
    }

    function waitFrames(count = 2) {
        return new Promise(resolve => {
            const step = (remaining) => {
                if (remaining <= 0) return resolve();
                requestAnimationFrame(() => step(remaining - 1));
            };
            step(count);
        });
    }

    function toFiniteNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }

    function sanitizeZoom(zoom, fallback = 0.6) {
        const parsed = toFiniteNumber(zoom, NaN);
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return Math.min(1.5, Math.max(0.1, parsed));
    }

    function resolveCacheVersion() {
        if (window.GO_TOOLKIT_VERSION) return window.GO_TOOLKIT_VERSION;

        const extractVersion = (src) => {
            if (!src) return null;
            try {
                const url = new URL(src, window.location.href);
                return url.searchParams.get("v");
            } catch (err) {
                return null;
            }
        };

        const script = document.querySelector('script[src*="draw-memo.js"]') || document.currentScript;
        const scriptVersion = extractVersion(script?.src);
        if (scriptVersion) return scriptVersion;

        const pageVersion = extractVersion(window.location.href);
        return pageVersion || null;
    }

    async function loadExcalidraw() {
        try {
            await window.GoToolkitLazyCdn?.loadExcalidraw?.();
        } catch (err) {
            // Fallback to existing local draw bundle loader below.
        }
        if (window.GoToolkitExcalidraw) return true;

        // Check if script already exists
        const existing = document.querySelector('script[src*="draw.bundle.js"]');
        if (existing) {
            return new Promise((resolve) => {
                if (window.GoToolkitExcalidraw) resolve(true);
                else {
                    existing.addEventListener('load', () => resolve(true));
                }
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const version = resolveCacheVersion();
            script.src = version ? `js/draw.bundle.js?v=${version}` : 'js/draw.bundle.js';
            script.onload = () => {
                isLoaded = true;
                resolve(true);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    return {
        async init(container, initialData = null, size = 'medium') {
            await loadExcalidraw();

            if (!excalidrawInstance) {
                excalidrawInstance = window.GoToolkitExcalidraw;
            }

            if (!excalidrawInstance) {
                throw new Error("GoToolkitExcalidraw not found on window");
            }

            // Set size attribute for CSS targeting (Internal Excalidraw UI)
            if (typeof container === 'string') {
                const el = document.getElementById(container);
                if (el) el.setAttribute('data-size', size);
            } else if (container instanceof HTMLElement) {
                container.setAttribute('data-size', size);
            }

            await excalidrawInstance.initialize(container);

            // Ensure we're in interactive edit mode and selection tool is active.
            try {
                const api = excalidrawInstance.getApi?.();
                api?.setActiveTool?.({ type: "selection" });
                api?.refresh?.();
                if (!initialData || (typeof initialData === 'string' && initialData.trim().length === 0)) {
                    api?.resetScene?.();
                    api?.refresh?.();
                }
            } catch (e) {
                // no-op
            }

            if (initialData) {
                if (typeof initialData === 'object' || (typeof initialData === 'string' && initialData.trim().startsWith('{'))) {
                    // It's JSON
                    const scene = typeof initialData === 'string' ? JSON.parse(initialData) : initialData;
                    excalidrawInstance.applyScene(scene);
                } else if (typeof initialData === 'string' && initialData.trim().length > 0) {
                    // It's Mermaid
                    try {
                        const scene = await excalidrawInstance.convertMermaid(initialData, getOptionsForSize(size));
                        if (scene) {
                            excalidrawInstance.applyScene(scene);
                        }
                    } catch (e) {
                        console.error("Failed to convert mermaid", e);
                    }
                }
            }

            // Final refresh after scene apply (handles/render)
            try {
                const api = excalidrawInstance.getApi?.();
                api?.setActiveTool?.({ type: "selection" });
                api?.refresh?.();
            } catch (e) {
                // no-op
            }
            return excalidrawInstance;
        },

        async updateFromMermaid(code, size = 'medium') {
            if (!excalidrawInstance) return;
            try {
                // Update size attribute for CSS targeting (Internal Excalidraw UI)
                if (excalidrawInstance.updateSize) {
                    excalidrawInstance.updateSize(size);
                }

                const api = excalidrawInstance.getApi?.();
                if (!code || !code.trim()) {
                    api?.resetScene?.();
                    api?.setActiveTool?.({ type: "selection" });
                    api?.refresh?.();
                    return;
                }
                const wasEmpty = !!api && Array.isArray(api.getSceneElements?.()) && api.getSceneElements().length === 0;
                const scene = await excalidrawInstance.convertMermaid(code, getOptionsForSize(size));
                if (scene) {
                    // Center on first generation so the user sees the result immediately.
                    excalidrawInstance.applyScene(scene, wasEmpty);
                }

                api?.setActiveTool?.({ type: "selection" });
                api?.refresh?.();
            } catch (e) {
                console.error("Failed to update from mermaid", e);
                throw e;
            }
        },

        getApi() {
            if (!excalidrawInstance) return null;
            return excalidrawInstance.getApi?.() || null;
        },

        getSceneJSON() {
            if (!excalidrawInstance) return null;
            const api = excalidrawInstance.getApi();
            if (!api) return null;
            return JSON.stringify({
                elements: api.getSceneElements(),
                appState: api.getAppState(),
                files: api.getFiles()
            });
        },

        async getSVG(zoom) {
            if (!excalidrawInstance) return null;
            const api = excalidrawInstance.getApi();
            if (!api) return null;

            let finalZoom = zoom;

            // Adaptive zoom calculation
            if (zoom === 'auto' && excalidrawInstance.getSceneBounds) {
                const elements = api.getSceneElements();
                if (elements && elements.length > 0) {
                    const bounds = excalidrawInstance.getSceneBounds(elements);
                    const padding = 40; // Total padding (20 top, 20 bottom)
                    const targetHeight = 600; // Match max-height in CSS (650) minus some margin
                    const contentHeight = toFiniteNumber(bounds?.height, 0);

                    if (contentHeight > 0) {
                        // Calculate zoom to fit height
                        finalZoom = Math.min(1.5, Math.max(0.4, (targetHeight - padding) / contentHeight));
                    } else {
                        finalZoom = 0.6;
                    }
                } else {
                    finalZoom = 0.6;
                }
            }

            const safeZoom = sanitizeZoom(finalZoom, 0.6);

            if (typeof safeZoom === 'number' && excalidrawInstance.exportToSvgWithZoom) {
                const svg = await excalidrawInstance.exportToSvgWithZoom(
                    api.getSceneElements(),
                    api.getAppState(),
                    api.getFiles(),
                    safeZoom
                );
                return svg.outerHTML;
            }

            const svg = await excalidrawInstance.exportToSvg(
                api.getSceneElements(),
                api.getAppState(),
                api.getFiles()
            );
            return svg.outerHTML;
        },

        async renderPreview(initialData, zoom, size = 'medium') {
            // Serialize preview rendering to avoid clobbering due to singleton host swaps.
            return enqueuePreview(async () => {
                const host = createOffscreenHost();
                document.body.appendChild(host);
                try {
                    await this.init(host, initialData, size);
                    await waitFrames(2);
                    const json = this.getSceneJSON();
                    const svg = await this.getSVG(typeof zoom === 'number' ? zoom : 0.6);
                    return { json, svg };
                } finally {
                    host.remove();
                }
            });
        },

        destroy() {
            // Excalidraw doesn't have a formal destroy in our bridge yet, 
            // but we can clear the instance reference.
            excalidrawInstance = null;
        }
    };
})();
