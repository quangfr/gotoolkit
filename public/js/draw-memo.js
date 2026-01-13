/**
 * draw-memo.js
 * Independent component to bridge Excalidraw (draw.bundle.js) with the Memo editor.
 */

window.GoToolkitDrawMemo = (function () {
    let excalidrawInstance = null;
    let isLoaded = false;

    async function loadExcalidraw() {
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
            // Use the version from the page if available, otherwise fallback
            const version = window.GO_TOOLKIT_VERSION || '2026.01.10';
            script.src = `js/draw.bundle.js?v=${version}`;
            script.onload = () => {
                isLoaded = true;
                resolve(true);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    return {
        async init(container, initialData = null) {
            await loadExcalidraw();

            if (!excalidrawInstance) {
                excalidrawInstance = new window.GoToolkitExcalidraw();
            }

            excalidrawInstance.mount(container);

            if (initialData) {
                if (typeof initialData === 'object' || (typeof initialData === 'string' && initialData.trim().startsWith('{'))) {
                    // It's JSON
                    const scene = typeof initialData === 'string' ? JSON.parse(initialData) : initialData;
                    excalidrawInstance.updateScene(scene);
                } else if (typeof initialData === 'string' && initialData.trim().length > 0) {
                    // It's Mermaid
                    try {
                        const elements = await excalidrawInstance.convertMermaid(initialData);
                        excalidrawInstance.updateScene({ elements });
                    } catch (e) {
                        console.error("Failed to convert mermaid", e);
                    }
                }
            }
            return excalidrawInstance;
        },

        async updateFromMermaid(code) {
            if (!excalidrawInstance) return;
            try {
                const elements = await excalidrawInstance.convertMermaid(code);
                excalidrawInstance.updateScene({ elements });
            } catch (e) {
                console.error("Failed to update from mermaid", e);
            }
        },

        getSceneJSON() {
            if (!excalidrawInstance) return null;
            // The bridge should expose the current scene
            return excalidrawInstance.getSceneData ? JSON.stringify(excalidrawInstance.getSceneData()) : null;
        },

        async getSVG() {
            if (!excalidrawInstance || !excalidrawInstance.exportToSvg) return null;
            const svg = await excalidrawInstance.exportToSvg();
            return svg.outerHTML;
        },

        destroy() {
            // Excalidraw doesn't have a formal destroy in our bridge yet, 
            // but we can clear the instance reference.
            excalidrawInstance = null;
        }
    };
})();
