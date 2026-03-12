import React, { useCallback, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
    BinaryFiles,
    ExcalidrawImperativeAPI
} from "@excalidraw/excalidraw/types/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

const DEFAULT_EXCALIDRAW_TEXT_SIZE = 20;
const MERMAID_OPTIONS = { fontSize: 20 };
const MERMAID_TEXT_SIZE_OFFSET = 4;
// Excalidraw appends `/dist/excalidraw-assets/` internally for exported fonts.
if (typeof window !== "undefined" && !(window as any).EXCALIDRAW_ASSET_PATH) {
    (window as any).EXCALIDRAW_ASSET_PATH = "https://unpkg.com/@excalidraw/excalidraw@0.17.6";
}
const getExcalidrawLib = () => {
    const lib = (window as any).ExcalidrawLib;
    if (!lib) {
        throw new Error("Excalidraw CDN is not loaded.");
    }
    return lib;
};
const getExcalidrawExports = () => {
    const lib = getExcalidrawLib();
    return {
        Excalidraw: lib.Excalidraw,
        convertToExcalidrawElements: lib.convertToExcalidrawElements,
        exportToSvg: lib.exportToSvg,
        getCommonBounds: lib.getCommonBounds
    };
};
const MERMAID_ELEMENT_STYLE_DEFAULTS = {
    strokeWidth: 1.2,
    strokeStyle: "solid" as const,
    roughness: 0,
    roundness: null
};
const isMermaidSvgFallbackEnabled = (): boolean => {
    try {
        if (localStorage.getItem("goToolkit.mermaidSvgFallback") === "1") return true;
        if ((window as any).GoToolkitMermaidSvgFallback === true) return true;
        if (localStorage.getItem("goToolkit.mermaidSvgFallback") === "0") return false;
        if ((window as any).GoToolkitMermaidSvgFallback === false) return false;
        return false;
    } catch {
        return false;
    }
};
const parseSvgPathPoints = (d: string): Array<{ x: number; y: number }> => {
    const commands = d.match(/[MLCQ][^MLCQ]*/gi) || [];
    const points: Array<{ x: number; y: number }> = [];
    commands.forEach(command => {
        const type = command[0].toUpperCase();
        const raw = command.slice(1).trim();
        if (!raw) {
            return;
        }
        const numbers = raw
            .split(/[\s,]+/)
            .map(value => Number.parseFloat(value))
            .filter(value => !Number.isNaN(value));
        if (numbers.length < 2) {
            return;
        }
        switch (type) {
            case "M":
            case "L":
                points.push({ x: numbers[0], y: numbers[1] });
                break;
            case "C":
            case "Q": {
                const x = numbers[numbers.length - 2];
                const y = numbers[numbers.length - 1];
                if (!Number.isNaN(x) && !Number.isNaN(y)) {
                    points.push({ x, y });
                }
                break;
            }
            default:
                break;
        }
    });
    return points;
};
const toFiniteNumber = (value: unknown, fallback = 0): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};
const sanitizeNumbersDeep = (value: any): any => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    if (Array.isArray(value)) {
        return value.map(item => sanitizeNumbersDeep(item));
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
        out[key] = sanitizeNumbersDeep(val);
    }
    return out;
};
const hasFinitePoint = (point: unknown): point is [number, number] => {
    if (!Array.isArray(point) || point.length < 2) return false;
    return Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
};
const normalizeLinearPoints = (points: Array<[number, number]>): Array<[number, number]> => {
    const normalized: Array<[number, number]> = [];
    for (const point of points) {
        const x = Number(point[0]);
        const y = Number(point[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            continue;
        }
        const last = normalized[normalized.length - 1];
        if (last && last[0] === x && last[1] === y) {
            continue;
        }
        normalized.push([x, y]);
    }
    return normalized;
};
const getLinearPathLength = (points: Array<[number, number]>): number => {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        const [prevX, prevY] = points[index - 1];
        const [nextX, nextY] = points[index];
        total += Math.hypot(nextX - prevX, nextY - prevY);
    }
    return total;
};
const sanitizeSceneElements = (elements: any[]): ExcalidrawElement[] => {
    const list = Array.isArray(elements) ? elements : [];
    const sanitized: ExcalidrawElement[] = [];
    for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const safeRaw = sanitizeNumbersDeep(raw);
        const x = toFiniteNumber((safeRaw as any).x, NaN);
        const y = toFiniteNumber((safeRaw as any).y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        const normalized: any = {
            ...safeRaw,
            x,
            y
        };
        if ("width" in normalized) {
            normalized.width = Math.max(0, toFiniteNumber(normalized.width, 0));
        }
        if ("height" in normalized) {
            normalized.height = Math.max(0, toFiniteNumber(normalized.height, 0));
        }
        if (Array.isArray(normalized.points)) {
            const rawPoints = normalized.points
                .filter(hasFinitePoint)
                .map((point: [number, number]) => [Number(point[0]), Number(point[1])]);
            const isLinear = normalized.type === "line" || normalized.type === "arrow";
            const points = isLinear ? normalizeLinearPoints(rawPoints) : rawPoints;
            if (isLinear) {
                if (points.length < 2) continue;
                if (!(getLinearPathLength(points) > 0)) continue;
            } else if (points.length < 1) {
                continue;
            }
            normalized.points = points;
        }
        if ("angle" in normalized) {
            normalized.angle = toFiniteNumber(normalized.angle, 0);
        }
        if ("strokeWidth" in normalized) {
            normalized.strokeWidth = Math.max(0, toFiniteNumber(normalized.strokeWidth, 1));
        }
        if ("opacity" in normalized) {
            normalized.opacity = Math.max(0, Math.min(100, toFiniteNumber(normalized.opacity, 100)));
        }
        sanitized.push(normalized as ExcalidrawElement);
    }
    return sanitized;
};

export type MermaidConvertOptions = {
    fontSize?: number;
    strokeWidth?: number;
    roughness?: number;
    flowchart?: {
        padding?: number;
        nodeSpacing?: number;
        rankSpacing?: number;
        htmlLabels?: boolean;
    };
    sequence?: {
        diagramMarginX?: number;
        diagramMarginY?: number;
        actorMargin?: number;
        width?: number;
        height?: number;
        boxMargin?: number;
        boxTextMargin?: number;
        noteMargin?: number;
        messageMargin?: number;
    };
    class?: {
        padding?: number;
    };
};
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
    margin: 0;
    padding: 0;
    border-radius: 0;
    max-width: 100%;
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
    padding: 4px;
}

/* Move help button to bottom left and make it white */
.${EDGE_HOST_CLASS} .excalidraw .layer-ui__wrapper__bottom-right:has(.help-Icon) {
    right: auto !important;
    left: 0 !important;
}

.${EDGE_HOST_CLASS} .excalidraw .help-Icon,
.${EDGE_HOST_CLASS} .excalidraw .help-icon {
    background-color: #ffffff !important;
    color: #1b1b1f !important;
    padding: 4px !important;
}

/* Make Excalidraw UI more compact */
.${EDGE_HOST_CLASS} .excalidraw {
    --default-button-size: 1.5rem !important;
    --default-icon-size: 1.5rem !important;
    --lg-button-size :1.3rem !important;
    touch-action: none !important;
}

/* Dynamic font-size for App-menu__left based on size preset */
.${EDGE_HOST_CLASS}[data-size="small"] .excalidraw .Island.App-menu__left,
.${EDGE_HOST_CLASS}[data-size="small"] .excalidraw .Island.App-menu__left * { font-size: 10px !important; }
.${EDGE_HOST_CLASS}[data-size="medium"] .excalidraw .Island.App-menu__left, 
.${EDGE_HOST_CLASS}[data-size="medium"] .excalidraw .Island.App-menu__left * { font-size: 12px !important; }
.${EDGE_HOST_CLASS}[data-size="large"] .excalidraw .Island.App-menu__left,
.${EDGE_HOST_CLASS}[data-size="large"] .excalidraw .Island.App-menu__left * { font-size: 14px !important; }

.${EDGE_HOST_CLASS} .excalidraw .excalidraw__canvas {
    touch-action: none !important;
}

.${EDGE_HOST_CLASS} .excalidraw .Island {
    --island-padding: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-menu__left {
     top: 55px!important;
    max-width: 140px !important;
    padding: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-menu_bottom {
    align-items:bottom !important;
    bottom: 5px;
}

.${EDGE_HOST_CLASS} .excalidraw .Stack {
    gap: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .ToolIcon__icon,
.${EDGE_HOST_CLASS} .excalidraw .ToolIcon__icon svg {
    width: 20px !important;
    height: 20px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .ToolIcon {
    width: 28px !important;
    height: 28px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-toolbar {
    padding: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .App-toolbar-content {
    gap: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .buttonList {
    gap: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-button {
    width: 28px !important;
    height: 28px !important;
    padding: 4px !important;
}

/* Hide Library, Lock and Embeddable buttons */
.${EDGE_HOST_CLASS} .excalidraw .mobile-misc-tools-container,
.${EDGE_HOST_CLASS} .excalidraw .sidebar-trigger,
.${EDGE_HOST_CLASS} .excalidraw [data-testid="toolbar-embeddable"] {
    display: none !important;
}

.${EDGE_HOST_CLASS} .excalidraw .ToolIcon .ToolIcon__keybinding {
    bottom: 4px !important;
    right: 0px !important;
}

/* Change background color of buttons to surface color */
.${EDGE_HOST_CLASS} .excalidraw .Island,
.${EDGE_HOST_CLASS} .excalidraw .ToolIcon,
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-button,
.${EDGE_HOST_CLASS} .excalidraw .App-toolbar,
.${EDGE_HOST_CLASS} .excalidraw .hint,
.${EDGE_HOST_CLASS} .excalidraw .help-Icon {
    background-color: #ffffff !important;
}

/* Smaller zoom and undo/redo buttons */
.${EDGE_HOST_CLASS} .excalidraw .zoom-actions,
.${EDGE_HOST_CLASS} .excalidraw .undo-redo-buttons {
    transform: scale(0.85);
    transform-origin: left bottom;
}

/* Compact Properties Panel (Right/Left side) */
.${EDGE_HOST_CLASS} .excalidraw .panel-column {
    gap: 4px !important;
    padding: 4px !important;
    width: auto !important;
    min-width: 160px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .fieldset {
    margin-bottom: 4px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .fieldset .legend {
    font-size: 10px !important;
    margin-bottom: 2px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .buttonList label {
    padding: 2px !important;
    font-size: 10px !important;
    min-height: 24px !important;
}

/* Hide color presets (swatches) and keep only custom picker */
.${EDGE_HOST_CLASS} .excalidraw .color-picker__swatches,
.${EDGE_HOST_CLASS} .excalidraw .color-picker__top-picks,
.${EDGE_HOST_CLASS} .excalidraw .color-picker__top-picks + .color-picker__separator {
    display: none !important;
}

.${EDGE_HOST_CLASS} .excalidraw .color-picker-container {
    padding: 4px !important;
    grid-template-columns: 0px 20px 1.625rem!important;
}

/* Compact Top-Left File Menu */
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu {
    padding: 0px !important;
    min-width: 160px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item {
    padding: 4px 8px !important;
    font-size: 12px !important;
    min-height: 24px !important;
}

.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-separator {
    margin: 2px 0 !important;
}

/* Hide Social Links and Excalidraw branding in Menu */
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="GitHub"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="GitHub"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="Discord"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item[aria-label*="Twitter"],
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu-item-base__socials,
.${EDGE_HOST_CLASS} .excalidraw .dropdown-menu footer {
    display: none !important;
}

/* Higher z-index and compact Help Dialog */
.excalidraw-modal-container {
    z-index: 100000 !important;
}

.excalidraw-modal-container .HelpDialog {
    max-width: 900px !important;
}

.excalidraw-modal-container .HelpDialog__content {
    margin : 4px !important;
    padding: 4px !important;
    font-size: 11px !important;
}

.excalidraw-modal-container .HelpDialog button {
    padding: 4px 8px !important;
    font-size: 10px !important;
}

.excalidraw-modal-container .HelpDialog__shortcut-list {
    gap: 4px !important;
}

.excalidraw-modal-container .HelpDialog__shortcut {
    margin-bottom: 2px !important;
}
`;

type SceneData = {
    elements: readonly ExcalidrawElement[];
    files?: BinaryFiles | null;
};

const createInitialData = () => ({
    elements: [] as ExcalidrawElement[],
    appState: {
        viewModeEnabled: false,
        viewBackgroundColor: "#fdfdfd",
        gridModeEnabled: false,
        isLoading: false,
        currentItemFontSize: DEFAULT_EXCALIDRAW_TEXT_SIZE,
        currentItemRoundness: "sharp" as const,
        currentItemRoughness: 0,
        zoom: { value: 0.9 as any }
    }
});

const applyMermaidDefaults = (
    elements: readonly ExcalidrawElement[],
    options?: MermaidConvertOptions
): ExcalidrawElement[] =>
    elements.map(element => {
        const mustForceSolidStroke = element.type === "arrow";
        const targetFontSize = (options?.fontSize ?? MERMAID_OPTIONS.fontSize) + MERMAID_TEXT_SIZE_OFFSET;
        return {
            ...element,
            locked: false,
            ...(element.type === "text" ? { fontSize: targetFontSize } : {}),
            strokeWidth: options?.strokeWidth ?? element.strokeWidth ?? MERMAID_ELEMENT_STYLE_DEFAULTS.strokeWidth,
            strokeStyle: mustForceSolidStroke
                ? "solid"
                : element.strokeStyle ?? MERMAID_ELEMENT_STYLE_DEFAULTS.strokeStyle,
            roughness: options?.roughness ?? MERMAID_ELEMENT_STYLE_DEFAULTS.roughness,
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
                    // Force edit mode and default styles on ready
                    instance.updateScene({
                        appState: { 
                            viewModeEnabled: false,
                            currentItemFontSize: DEFAULT_EXCALIDRAW_TEXT_SIZE,
                            currentItemRoughness: 0,
                            currentItemRoundness: "sharp"
                        }
                    });
                    try {
                        instance.setActiveTool?.({ type: "selection" } as any);
                        instance.refresh?.();
                    } catch {
                        // no-op
                    }
                    if (!resolved) {
                        resolved = true;
                        resolve(instance);
                    }
                };
                const Surface: React.FC<{ onReady: (api: ExcalidrawImperativeAPI) => void }> = ({ onReady }) => {
                    useEffect(() => {
                        const hostEl = this.host;
                        if (!hostEl) {
                            return;
                        }
                        let boundEditor: HTMLTextAreaElement | null = null;
                        const interceptTextEditorRelease = (event: Event) => {
                            const target = event.currentTarget as HTMLTextAreaElement | null;
                            if (!target) {
                                return;
                            }
                            if (document.activeElement !== target) {
                                return;
                            }
                            event.stopPropagation();
                            (event as any).stopImmediatePropagation?.();
                        };
                        const bindEditor = (editor: HTMLTextAreaElement | null) => {
                            if (boundEditor === editor) {
                                return;
                            }
                            if (boundEditor) {
                                boundEditor.removeEventListener("pointerup", interceptTextEditorRelease, true);
                                boundEditor.removeEventListener("mouseup", interceptTextEditorRelease, true);
                                boundEditor.removeEventListener("dblclick", interceptTextEditorRelease, true);
                            }
                            boundEditor = editor;
                            if (!boundEditor) {
                                return;
                            }
                            boundEditor.addEventListener("pointerup", interceptTextEditorRelease, true);
                            boundEditor.addEventListener("mouseup", interceptTextEditorRelease, true);
                            boundEditor.addEventListener("dblclick", interceptTextEditorRelease, true);
                        };
                        const syncActiveEditor = () => {
                            const editor = hostEl.querySelector(
                                ".excalidraw-textEditorContainer textarea, .text-editor-container textarea"
                            ) as HTMLTextAreaElement | null;
                            bindEditor(editor);
                        };
                        const handleFocusIn = () => {
                            syncActiveEditor();
                        };
                        const handlePointerDown = (event: PointerEvent) => {
                            const target = event.target as HTMLElement | null;
                            if (!target) {
                                return;
                            }
                            const textEditor = target.closest("textarea");
                            if (!textEditor || !hostEl.contains(textEditor)) {
                                return;
                            }
                            bindEditor(textEditor as HTMLTextAreaElement);
                        };
                        hostEl.addEventListener("focusin", handleFocusIn, true);
                        hostEl.addEventListener("pointerdown", handlePointerDown, true);
                        syncActiveEditor();
                        return () => {
                            hostEl.removeEventListener("focusin", handleFocusIn, true);
                            hostEl.removeEventListener("pointerdown", handlePointerDown, true);
                            bindEditor(null);
                        };
                    }, []);
                    const syncApi = useCallback(
                        (api: ExcalidrawImperativeAPI | null) => {
                            if (api) {
                                onReady(api);
                            }
                        },
                        [onReady]
                    );
                    const { Excalidraw } = getExcalidrawExports();
                    const ExcalidrawAny = Excalidraw as unknown as React.ComponentType<any>;
                    return (
                        <ExcalidrawAny
                            excalidrawAPI={syncApi}
                            theme="light"
                            viewModeEnabled={false}
                            gridModeEnabled={false}
                            zenModeEnabled={false}
                            initialData={createInitialData()}
                            generateIdForFile={() => {
                                return Math.random().toString(36).substring(2, 15);
                            }}
                        />
                    );
                };
                this.root.render(<Surface onReady={handleReady} />);
            });
        }
        return this.readyPromise.then(() => undefined);
    }

    updateSize(size: string) {
        if (this.host) {
            this.host.setAttribute("data-size", size);
        }
    }

    async convertMermaid(code: string, options?: MermaidConvertOptions): Promise<SceneData | null> {
        const trimmed = code?.trim();
        if (!trimmed) {
            return null;
        }

        if (!(window as any).mermaid) {
            try {
                await (window as any).GoToolkitLazyCdn?.loadMermaid?.();
            } catch (error) {
                console.error("Failed to lazy-load mermaid runtime", error);
            }
        }

        if (!(window as any).mermaid) {
            throw new Error("Mermaid runtime unavailable");
        }

        const fontSize = options?.fontSize ?? MERMAID_OPTIONS.fontSize;
        const isFlowchart = /^\s*(flowchart|graph)\b/i.test(trimmed);
        
        // Build the bridge-compatible config
        const mermaidConfig: any = {
            themeVariables: {
                fontSize: `${fontSize}px`
            },
            flowchart: {
                curve: "linear",
                padding: options?.flowchart?.padding ?? 24,
                nodeSpacing: options?.flowchart?.nodeSpacing ?? 80,
                rankSpacing: options?.flowchart?.rankSpacing ?? 80,
                htmlLabels: options?.flowchart?.htmlLabels ?? true
            },
            sequence: options?.sequence ?? {},
            class: options?.class ?? {}
        };

        try {
            const mermaidApi = (window as any).mermaid;
            const siteConfig = {
                ...mermaidConfig,
                flowchart: {
                    ...mermaidConfig.flowchart,
                    curve: "basis",
                    nodeSpacing: 50,
                    rankSpacing: 50,
                    padding: 15
                }
            };
            if (typeof mermaidApi?.mermaidAPI?.reset === "function") {
                mermaidApi.mermaidAPI.reset();
            }
            if (typeof mermaidApi?.mermaidAPI?.updateSiteConfig === "function") {
                mermaidApi.mermaidAPI.updateSiteConfig(siteConfig);
            }
            if (typeof mermaidApi?.mermaidAPI?.setConfig === "function") {
                mermaidApi.mermaidAPI.setConfig(siteConfig);
            } else if (typeof mermaidApi?.initialize === "function") {
                mermaidApi.initialize({
                    startOnLoad: false,
                    ...siteConfig
                });
            }
        } catch {
            // no-op
        }

        await Promise.resolve();
        await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));

        let parsed = await parseMermaidToExcalidraw(trimmed, mermaidConfig);
        const baseSkeleton = Array.isArray(parsed?.elements) ? parsed?.elements : [];
        if (!baseSkeleton.length) {
            return null;
        }
        const skeleton = [...baseSkeleton];
        const hasLineElements = skeleton.some(
            (el: any) => el?.type === "line" || el?.type === "arrow"
        );
        if (!hasLineElements && isMermaidSvgFallbackEnabled()) {
            try {
                const mermaidApi = (window as any).mermaid;
                if (mermaidApi?.render) {
                    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    const { svg } = await mermaidApi.render(id, trimmed);
                    const container = document.createElement("div");
                    container.innerHTML = svg;
                    const markerCount = container.querySelectorAll("marker").length;
                    const markerEndCount = container.querySelectorAll("[marker-end]").length;
                    const markerStartCount = container.querySelectorAll("[marker-start]").length;
                    const edgePaths = Array.from(
                        container.querySelectorAll(
                            "path.flowchart-link, g.edgePath path, path.edgePath, path.edge-path, path.link, path[marker-end], path[marker-start]"
                        )
                    );
                    const fallbackArrows = edgePaths
                        .map(pathEl => {
                            const dAttr = pathEl.getAttribute("d");
                            if (!dAttr) {
                                return null;
                            }
                            const points = parseSvgPathPoints(dAttr);
                            if (points.length < 2) {
                                return null;
                            }
                            const start = points[0];
                            const relPoints: [number, number][] = points.map(point => [
                                point.x - start.x,
                                point.y - start.y
                            ]);
                            if (relPoints.length >= 2) {
                                const minTail = 36;
                                const inset = 18;
                                const tailIndex = relPoints.length - 2;
                                const headIndex = relPoints.length - 1;
                                const [tailX, tailY] = relPoints[tailIndex];
                                const [headX, headY] = relPoints[headIndex];
                                const dx = headX - tailX;
                                const dy = headY - tailY;
                                const dist = Math.hypot(dx, dy);
                                if (dist > 0) {
                                    const target = Math.min(dist, Math.max(dist - inset, minTail));
                                    if (target !== dist) {
                                        const scale = target / dist;
                                        relPoints[headIndex] = [tailX + dx * scale, tailY + dy * scale];
                                    }
                                } else {
                                    relPoints[headIndex] = [tailX + minTail, tailY];
                                }
                            }
                            const classList = Array.from(pathEl.classList);
                            const strokeStyle = classList.some(token =>
                                token.includes("edge-pattern-dotted") ||
                                token.includes("edge-pattern-dashed")
                            )
                                ? "dashed"
                                : "solid";
                            const strokeWidth = classList.some(token =>
                                token.includes("edge-thickness-thick")
                            )
                                ? 4
                                : 2;
                            return {
                                type: "arrow",
                                x: start.x,
                                y: start.y,
                                points: relPoints,
                                strokeWidth,
                                strokeStyle,
                                roundness: { type: 2 },
                                endArrowhead: "arrow"
                            };
                        })
                        .filter(Boolean);
                    if (fallbackArrows.length) {
                        skeleton.push(...(fallbackArrows as any));
                    }
                }
            } catch (error) {
                console.warn("[GoToolkit][Mermaid->Excalidraw] svg edge fallback failed", error);
            }
        }
        const { convertToExcalidrawElements } = getExcalidrawExports();
        const converted = convertToExcalidrawElements(skeleton as any);
        const normalizedElements = Array.isArray(converted) ? converted : [];
        if (!normalizedElements.length) {
            return null;
        }
        const arrowNormalizedElements = isFlowchart
            ? normalizedElements.map(element => {
                  const linear = element.type === "line" || element.type === "arrow";
                  if (!linear) return element;
                  const hasArrowHead =
                      (element as any).endArrowhead != null || (element as any).startArrowhead != null;
                  if (element.type === "line") {
                      return {
                          ...element,
                          type: "arrow",
                          endArrowhead: hasArrowHead ? (element as any).endArrowhead : "arrow"
                      } as ExcalidrawElement;
                  }
                  if (element.type === "arrow" && !hasArrowHead) {
                      return {
                          ...element,
                          endArrowhead: "arrow"
                      } as ExcalidrawElement;
                  }
                  return element;
              })
            : normalizedElements;
        const normalizedFiles = parsed?.files || null;
        const sharpElements = applyMermaidDefaults(arrowNormalizedElements as readonly ExcalidrawElement[], options);
        const safeElements = sanitizeSceneElements(sharpElements as any[]);
        if (!safeElements.length) {
            return null;
        }
        return {
            elements: safeElements as readonly ExcalidrawElement[],
            files: normalizedFiles || undefined
        };
    }

    applyScene(scene: SceneData, shouldCenter: boolean = true): void {
        const api = this.ensureApi();
        const appState = api.getAppState();
        const safeElements = sanitizeSceneElements(scene?.elements as any[]);
        if (!safeElements.length) {
            api.updateScene({
                elements: [],
                appState: {
                    ...appState,
                    viewModeEnabled: false,
                    activeTool: { type: "selection" },
                    isLoading: false
                }
            } as any);
            return;
        }
        
        const payload: any = {
            elements: safeElements.map(el => ({ ...el, locked: false })),
            appState: {
                ...appState,
                viewModeEnabled: false,
                activeTool: { type: "selection" },
                viewBackgroundColor: "#fdfdfd",
                gridModeEnabled: false,
                isLoading: false,
                currentItemFontSize: DEFAULT_EXCALIDRAW_TEXT_SIZE,
                currentItemRoundness: "sharp",
                currentItemRoughness: 0,
                zoom: appState?.zoom?.value ? appState.zoom : { value: 0.9 }
            }
        };

        if (scene.files) {
            payload.files = scene.files;
        }

        api.updateScene(payload);

        try {
            api.setActiveTool?.({ type: "selection" } as any);
            api.refresh?.();
        } catch {
            // no-op
        }

        // Center the content automatically for Mermaid diagrams
        if (shouldCenter && safeElements.length > 0) {
            // Use setTimeout to ensure the scene has been updated before scrolling
            setTimeout(() => {
                api.scrollToContent(safeElements, { 
                    fitToViewport: true
                });
            }, 50);
        }

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
    convertMermaid: (code: string, options?: MermaidConvertOptions) => Promise<SceneData | null>;
    applyScene: (scene: SceneData, shouldCenter?: boolean) => void;
    getApi: () => ExcalidrawImperativeAPI | null;
    getSceneBounds: (elements: any) => { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    exportToSvg: (elements: any, appState: any, files: any) => Promise<SVGSVGElement>;
    exportToSvgWithZoom: (elements: any, appState: any, files: any, zoom: number) => Promise<SVGSVGElement>;
};

declare global {
    interface Window {
        GoToolkitExcalidraw?: GoToolkitExcalidrawAPI;
    }
}

window.GoToolkitExcalidraw = {
    initialize: container => bridge.initialize(container),
    convertMermaid: (code, options) => bridge.convertMermaid(code, options),
    applyScene: (scene, shouldCenter) => bridge.applyScene(scene, shouldCenter),
    getApi: () => bridge.getApi(),
    getSceneBounds: (elements) => {
        const { getCommonBounds } = getExcalidrawExports();
        const [minX, minY, maxX, maxY] = getCommonBounds(elements);
        const toFinite = (value: unknown, fallback = 0) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : fallback;
        };
        const safeMinX = toFinite(minX);
        const safeMinY = toFinite(minY);
        const safeMaxX = toFinite(maxX, safeMinX);
        const safeMaxY = toFinite(maxY, safeMinY);
        return {
            minX: safeMinX,
            minY: safeMinY,
            maxX: safeMaxX,
            maxY: safeMaxY,
            width: Math.max(0, safeMaxX - safeMinX),
            height: Math.max(0, safeMaxY - safeMinY)
        };
    },
    exportToSvg: (elements, appState, files) => {
        const { exportToSvg } = getExcalidrawExports();
        const safeElements = sanitizeSceneElements(elements);
        return exportToSvg({ elements: safeElements, appState, files });
    },
    exportToSvgWithZoom: (elements, appState, files, zoom) => 
        (() => {
            const { exportToSvg } = getExcalidrawExports();
            const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0
                ? Number(zoom)
                : (Number(appState?.zoom?.value) > 0 ? Number(appState.zoom.value) : 1);
            const safeElements = sanitizeSceneElements(elements);
            return exportToSvg({
                elements: safeElements,
                appState: { ...appState, zoom: { value: safeZoom } },
                files
            }).catch(() =>
                exportToSvg({
                    elements: safeElements,
                    appState: { ...appState, zoom: { value: 1 } },
                    files
                })
            );
        })()
};
