import React, { useCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    Excalidraw,
    convertToExcalidrawElements
} from "@excalidraw/excalidraw";
import type {
    BinaryFiles,
    ExcalidrawImperativeAPI
} from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

const MERMAID_OPTIONS = { fontSize: 20 };
const MERMAID_ELEMENT_STYLE_DEFAULTS = {
    strokeWidth: 2,
    strokeStyle: "solid" as const,
    roughness: 0,
    roundness: null as const
};
const EXCALIDRAW_DEFAULT_SCROLL_X = 150;
const EDGE_HOST_CLASS = "go-excalidraw-edge";
const EDGE_STYLE_ID = "go-excalidraw-edge-style";
const EDGE_STYLE_CONTENT = `.${EDGE_HOST_CLASS} .excalidraw .App-bottom-bar {
    margin: 0 !important;
    --bar-padding: 0 !important;
    padding-top: var(--sat, 0);
    padding-right: var(--sar, 0);
    padding-bottom: var(--sab, 0);
    padding-left: var(--sal, 0);
}

.${EDGE_HOST_CLASS} .excalidraw .App-bottom-bar > .Island {
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    max-width: 100% !important;
}

.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__top-left,
.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__bottom-left {
    left: 0 !important;
    right: auto !important;
}

.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__top-right,
.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__bottom-right {
    right: 0 !important;
    left: auto !important;
}

.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper:is(.layer-ui__wrapper__top-left, .layer-ui__wrapper__top-right, .layer-ui__wrapper__bottom-left, .layer-ui__wrapper__bottom-right) {
    padding: 4px !important;
}`;

type SceneData = {
    elements: readonly ExcalidrawElement[];
    files?: BinaryFiles | null;
};

const createInitialData = () => ({
    elements: [] as ExcalidrawElement[],
    appState: {
        viewBackgroundColor: "#fdfdfd",
        gridModeEnabled: false,
        isLoading: false,
        currentItemRoundness: "sharp" as const
    }
});

const applyMermaidDefaults = (elements: readonly ExcalidrawElement[]): ExcalidrawElement[] =>
    elements.map(element => {
        const mustForceSolidStroke = element.type === "arrow";
        return {
            ...element,
            strokeWidth: element.strokeWidth ?? MERMAID_ELEMENT_STYLE_DEFAULTS.strokeWidth,
            strokeStyle: mustForceSolidStroke
                ? "solid"
                : element.strokeStyle ?? MERMAID_ELEMENT_STYLE_DEFAULTS.strokeStyle,
            roughness: MERMAID_ELEMENT_STYLE_DEFAULTS.roughness,
            roundness: MERMAID_ELEMENT_STYLE_DEFAULTS.roundness
        };
    });

class ExcalidrawBridge {
    private api: ExcalidrawImperativeAPI | null = null;
    private root: Root | null = null;
    private host: HTMLElement | null = null;
    private readyPromise: Promise<ExcalidrawImperativeAPI> | null = null;

    initialize(container: HTMLElement | string): Promise<void> {
        const host = typeof container === "string" ? document.getElementById(container) : container;
        if (!host) {
            return Promise.reject(new Error("Excalidraw host introuvable"));
        }
        if (this.host && host !== this.host) {
            this.root?.unmount();
            this.root = null;
            this.api = null;
            this.readyPromise = null;
        }
        this.host = host;
        this.ensureEdgeStyles(host);
        if (!this.readyPromise) {
            this.readyPromise = new Promise((resolve, reject) => {
                try {
                    this.root = createRoot(host);
                } catch (error) {
                    reject(error);
                    return;
                }
                let resolved = false;
                const handleReady = (instance: ExcalidrawImperativeAPI) => {
                    this.api = instance;
                    if (!resolved) {
                        resolved = true;
                        resolve(instance);
                    }
                };
                const Surface: React.FC<{ onReady: (api: ExcalidrawImperativeAPI) => void }> = ({ onReady }) => {
                    const syncApi = useCallback(
                        (api: ExcalidrawImperativeAPI | null) => {
                            if (api) {
                                onReady(api);
                            }
                        },
                        [onReady]
                    );
                    const ExcalidrawAny = Excalidraw as unknown as React.ComponentType<any>;
                    return (
                        <ExcalidrawAny
                            excalidrawAPI={syncApi}
                            theme="light"
                            viewModeEnabled={false}
                            gridModeEnabled={false}
                            zenModeEnabled={false}
                            initialData={createInitialData()}
                        />
                    );
                };
                this.root.render(<Surface onReady={handleReady} />);
            });
        }
        return this.readyPromise.then(() => undefined);
    }

    async convertMermaid(code: string): Promise<SceneData | null> {
        const trimmed = code?.trim();
        if (!trimmed) {
            return null;
        }
        const parsed = await parseMermaidToExcalidraw(trimmed, MERMAID_OPTIONS as any);
        const skeleton = Array.isArray(parsed?.elements) ? parsed?.elements : [];
        if (!skeleton.length) {
            return null;
        }
        const converted = convertToExcalidrawElements(skeleton as any);
        const normalizedElements = Array.isArray(converted)
            ? converted
            : Array.isArray((converted as any)?.elements)
            ? (converted as any).elements
            : [];
        if (!normalizedElements.length) {
            return null;
        }
        const normalizedFiles = (!Array.isArray(converted) && (converted as any)?.files) || parsed?.files || null;
        const sharpElements = applyMermaidDefaults(normalizedElements as readonly ExcalidrawElement[]);
        return {
            elements: sharpElements as readonly ExcalidrawElement[],
            files: normalizedFiles || undefined
        };
    }

    applyScene(scene: SceneData): void {
        const api = this.ensureApi();
        const payload: any = {
            elements: scene.elements.slice(),
            appState: {
                ...(api.getAppState() as any),
                scrollX:
                    typeof scene?.appState?.scrollX === "number"
                        ? scene.appState.scrollX
                        : EXCALIDRAW_DEFAULT_SCROLL_X,
                viewBackgroundColor: "#fdfdfd",
                gridModeEnabled: false,
                isLoading: false,
                currentItemRoundness: "sharp"
            }
        };
        if (scene.files) {
            payload.files = scene.files;
        }
        api.updateScene(payload);
        if (scene.files) {
            const fileList = Object.values(scene.files);
            if (fileList.length) {
                api.addFiles?.(fileList as any);
            }
        }
    }

    getApi(): ExcalidrawImperativeAPI | null {
        return this.api;
    }

    private ensureApi(): ExcalidrawImperativeAPI {
        if (!this.api) {
            throw new Error("Excalidraw API non initialisé");
        }
        return this.api;
    }

    private ensureEdgeStyles(host: HTMLElement): void {
        host.classList.add(EDGE_HOST_CLASS);
        if (document.getElementById(EDGE_STYLE_ID)) {
            return;
        }
        const styleEl = document.createElement("style");
        styleEl.id = EDGE_STYLE_ID;
        styleEl.textContent = EDGE_STYLE_CONTENT;
        document.head.appendChild(styleEl);
    }
}

const bridge = new ExcalidrawBridge();

export type GoToolkitExcalidrawAPI = {
    initialize: (container: HTMLElement | string) => Promise<void>;
    convertMermaid: (code: string) => Promise<SceneData | null>;
    applyScene: (scene: SceneData) => void;
    getApi: () => ExcalidrawImperativeAPI | null;
};

declare global {
    interface Window {
        GoToolkitExcalidraw?: GoToolkitExcalidrawAPI;
    }
}

window.GoToolkitExcalidraw = {
    initialize: container => bridge.initialize(container),
    convertMermaid: code => bridge.convertMermaid(code),
    applyScene: scene => bridge.applyScene(scene),
    getApi: () => bridge.getApi()
};
