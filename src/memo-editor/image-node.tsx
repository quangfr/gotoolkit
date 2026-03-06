import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import {
  CirclePlay,
  Copy,
  Crop,
  Download,
  Fullscreen,
  ALargeSmall,
  Pencil,
  ArrowUpLeft,
  MousePointer2,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { sanitizeUrl } from './sanitize';

const SUPPORTED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]);

const SUPPORTED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif'];

const IMAGE_EDIT_COLORS = [
  '#FFFFFF',
  '#000000',
  '#FACC15',
  '#22C55E',
  '#3B82F6',
  '#EF4444',
];

const SIZE_PRESETS = {
  S: { line: 2, font: 12 },
  M: { line: 4, font: 16 },
  L: { line: 6, font: 20 },
} as const;

const resolveDefaultStrokeColor = () => {
  const themeAttr = String(document?.documentElement?.getAttribute('data-theme') || '').toLowerCase();
  const isDarkTheme = themeAttr === 'dark';
  if (isDarkTheme) return '#FFFFFF';
  return '#000000';
};

type SizePreset = keyof typeof SIZE_PRESETS;
type EditTool = 'none' | 'crop' | 'pencil' | 'line' | 'square' | 'text';
type Surface = 'inline' | 'fullscreen';
type DraftSelection = 'text' | 'shape' | null;
type Point = { x: number; y: number };
type DragState = {
  tool: Exclude<EditTool, 'none' | 'text'>;
  surface: Surface;
  start: Point;
  current: Point;
  points: Point[];
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};
type TextDraft = {
  surface: Surface;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  canvasWidth: number;
  canvasHeight: number;
  text: string;
};
type ShapeDraft = {
  tool: 'line' | 'square';
  surface: Surface;
  start: Point;
  end: Point;
  offsetX: number;
  offsetY: number;
  canvasWidth: number;
  canvasHeight: number;
};

const TEXT_BOX_HEADER_HEIGHT = 18;
const TEXT_BOX_PADDING = 6;

const isGifSource = (src: string) => {
  const raw = String(src || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith('data:image/gif')) return true;
  return /\.gif([?#].*)?$/.test(raw);
};

const sanitizeSize = (raw: unknown) => {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return `${Math.round(raw)}px`;
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return `${Math.round(Number(text))}px`;
  if (/^\d+(\.\d+)?px$/.test(text)) return text;
  return null;
};

const getPixels = (raw: unknown) => {
  const size = sanitizeSize(raw);
  if (!size) return null;
  const value = Number.parseFloat(size);
  return Number.isFinite(value) ? value : null;
};

const parseGifDurationMs = (bytes: Uint8Array) => {
  let totalMs = 0;
  for (let i = 0; i < bytes.length - 7; i += 1) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9 && bytes[i + 2] === 0x04) {
      const delayCs = bytes[i + 4] | (bytes[i + 5] << 8);
      totalMs += Math.max(delayCs * 10, 100);
      i += 7;
    }
  }
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null;
  return Math.min(Math.max(totalMs, 400), 60000);
};

const readDataUrlBytes = (dataUrl: string) => {
  const marker = ';base64,';
  const idx = dataUrl.indexOf(marker);
  if (idx < 0) return null;
  const b64 = dataUrl.slice(idx + marker.length);
  try {
    const raw = window.atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  } catch (err) {
    return null;
  }
};

const estimateGifDurationMs = async (src: string) => {
  const value = String(src || '').trim();
  if (!value) return null;
  try {
    if (value.startsWith('data:image/gif')) {
      const bytes = readDataUrlBytes(value);
      return bytes ? parseGifDurationMs(bytes) : null;
    }
    const response = await fetch(value);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return parseGifDurationMs(new Uint8Array(buffer));
  } catch (err) {
    return null;
  }
};

const copyImageHtml = async (attrs: Record<string, any>) => {
  const src = String(attrs?.src || '');
  if (!src) return;
  const img = document.createElement('img');
  img.src = src;
  if (attrs?.alt) img.alt = String(attrs.alt);
  if (attrs?.title) img.title = String(attrs.title);
  if (attrs?.width) img.setAttribute('width', String(attrs.width).replace(/px$/, ''));
  if (attrs?.height) img.setAttribute('height', String(attrs.height).replace(/px$/, ''));
  if (attrs?.fit) img.setAttribute('data-fit', String(attrs.fit));
  if (attrs?.mimeType) img.setAttribute('data-mime-type', String(attrs.mimeType));
  if (attrs?.fileName) img.setAttribute('data-file-name', String(attrs.fileName));

  const html = img.outerHTML;
  try {
    if (navigator?.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const payload = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([src], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([payload]);
      return;
    }
  } catch (err) {
    // fallback below
  }
  try {
    await navigator.clipboard.writeText(src);
  } catch (err) {
    // noop
  }
};

const normalizeRect = (a: Point, b: Point) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});

const clampPoint = (point: Point, width: number, height: number): Point => ({
  x: Math.min(Math.max(point.x, 0), width),
  y: Math.min(Math.max(point.y, 0), height),
});

const loadImageForCanvas = async (source: string) => {
  const img = new window.Image();
  if (!source.startsWith('data:')) img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Impossible de charger l\'image pour édition.'));
    img.src = source;
  });
  return img;
};

const applyCanvasOperation = async (
  source: string,
  operation: (args: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    image: HTMLImageElement;
  }) => HTMLCanvasElement | void,
) => {
  const image = await loadImageForCanvas(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width || 1;
  canvas.height = image.naturalHeight || image.height || 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const outCanvas = operation({ canvas, ctx, image }) || canvas;
  return outCanvas.toDataURL('image/png');
};

const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const ImageNodeView = ({ node, editor, updateAttributes, getPos }: any) => {
  const src = String(node?.attrs?.src || '');
  const localSrc = String(node?.attrs?.localSrc || '');
  const [resolvedSrc, setResolvedSrc] = React.useState(src);
  const canEdit = Boolean(editor?.isEditable);
  const isGif = isGifSource(resolvedSrc);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inlineSurfaceRef = React.useRef<HTMLDivElement>(null);
  const fullscreenSurfaceRef = React.useRef<HTMLDivElement>(null);
  const inlineImageRef = React.useRef<HTMLImageElement>(null);
  const fullscreenImageRef = React.useRef<HTMLImageElement>(null);
  const inlineOverlayRef = React.useRef<HTMLCanvasElement>(null);
  const fullscreenOverlayRef = React.useRef<HTMLCanvasElement>(null);
  const resizeStateRef = React.useRef<null | { startX: number; startY: number; width: number; height: number }>(null);
  const gifPlayTimeoutRef = React.useRef<number | null>(null);
  const pendingSyncRef = React.useRef<string | null>(null);
  const historyRef = React.useRef<string[]>([src]);
  const historyIndexRef = React.useRef(0);
  const textDragRef = React.useRef<null | { surface: Surface; offsetX: number; offsetY: number }>(null);
  const textResizeRef = React.useRef<null | { surface: Surface; startX: number; startY: number; width: number; height: number }>(null);
  const shapeEditRef = React.useRef<null | {
    surface: Surface;
    mode: 'move' | 'start' | 'end' | 'square-resize';
    anchor?: Point;
    start: Point;
    end: Point;
  }>(null);
  const textDragFrameRef = React.useRef<number | null>(null);
  const textResizeFrameRef = React.useRef<number | null>(null);
  const shapeEditFrameRef = React.useRef<number | null>(null);
  const textDragEventRef = React.useRef<PointerEvent | null>(null);
  const textResizeEventRef = React.useRef<PointerEvent | null>(null);
  const shapeEditEventRef = React.useRef<PointerEvent | null>(null);

  const [gifPoster, setGifPoster] = React.useState<string | null>(null);
  const [gifPlaying, setGifPlaying] = React.useState(!isGif);
  const [gifDurationMs, setGifDurationMs] = React.useState(4000);
  const [gifReplayTick, setGifReplayTick] = React.useState(0);
  const [fullscreenOpen, setFullscreenOpen] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState<EditTool>('none');
  const [sizePreset, setSizePreset] = React.useState<SizePreset>('M');
  const [strokeColor, setStrokeColor] = React.useState(resolveDefaultStrokeColor);
  const [history, setHistory] = React.useState<string[]>([src]);
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [textDraft, setTextDraft] = React.useState<TextDraft | null>(null);
  const [shapeDraft, setShapeDraft] = React.useState<ShapeDraft | null>(null);
  const [selectedDraft, setSelectedDraft] = React.useState<DraftSelection>(null);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const memoMediaStore = (window as any).goToolkitMemoMediaStore;
      const ref = String(localSrc || src);
      if (!memoMediaStore?.isLocalRef?.(ref) || !memoMediaStore?.resolveBlobUrl) {
        setResolvedSrc(src);
        return;
      }
      const blobUrl = await memoMediaStore.resolveBlobUrl(ref).catch(() => '');
      if (!cancelled) {
        setResolvedSrc(String(blobUrl || src));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [localSrc, src]);

  const widthPx = getPixels(node.attrs?.width);
  const heightPx = getPixels(node.attrs?.height);

  React.useEffect(() => {
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [history, historyIndex]);

  React.useEffect(() => {
    if (pendingSyncRef.current === src) {
      pendingSyncRef.current = null;
      return;
    }
    setHistory([src]);
    setHistoryIndex(0);
    historyRef.current = [src];
    historyIndexRef.current = 0;
  }, [src]);

  React.useEffect(() => {
    if (!fullscreenOpen) return;
    setStrokeColor(resolveDefaultStrokeColor());
  }, [fullscreenOpen]);

  React.useEffect(() => {
    if (gifPlayTimeoutRef.current !== null) {
      window.clearTimeout(gifPlayTimeoutRef.current);
      gifPlayTimeoutRef.current = null;
    }
    if (!isGif) {
      setGifPoster(null);
      setGifPlaying(true);
      return;
    }
    setGifPlaying(false);
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1;
        canvas.height = img.naturalHeight || 1;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        setGifPoster(canvas.toDataURL('image/png'));
      } catch (err) {
        setGifPoster(null);
      }
    };
    img.onerror = () => setGifPoster(null);
    img.src = resolvedSrc;
    estimateGifDurationMs(resolvedSrc).then((duration) => {
      if (cancelled) return;
      if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
        setGifDurationMs(duration);
      } else {
        setGifDurationMs(4000);
      }
    });
    return () => {
      cancelled = true;
      if (gifPlayTimeoutRef.current !== null) {
        window.clearTimeout(gifPlayTimeoutRef.current);
        gifPlayTimeoutRef.current = null;
      }
    };
  }, [isGif, resolvedSrc]);

  React.useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (!current) return;
      event.preventDefault();
      const nextWidth = Math.max(120, current.width + (event.clientX - current.startX));
      const nextHeight = Math.max(90, current.height + (event.clientY - current.startY));
      updateAttributes({
        width: `${Math.round(nextWidth)}px`,
        height: `${Math.round(nextHeight)}px`,
      });
    };
    const onPointerUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.classList.remove('table-resize-cursor');
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [updateAttributes]);

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const root = wrapperRef.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      setActiveTool('none');
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  React.useEffect(() => {
    const surfaceRef = drag?.surface === 'fullscreen' ? fullscreenSurfaceRef : inlineSurfaceRef;
    const canvasRef = drag?.surface === 'fullscreen' ? fullscreenOverlayRef : inlineOverlayRef;
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;

    canvas.width = Math.max(1, Math.round(surface.clientWidth));
    canvas.height = Math.max(1, Math.round(surface.clientHeight));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!drag || (drag.tool !== 'pencil' && drag.tool !== 'line')) return;

    const line = SIZE_PRESETS[sizePreset].line;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = line;
    if (drag.tool === 'pencil') {
      if (drag.points.length < 2) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(drag.offsetX + drag.points[0].x, drag.offsetY + drag.points[0].y);
      for (let i = 1; i < drag.points.length; i += 1) {
        ctx.lineTo(drag.offsetX + drag.points[i].x, drag.offsetY + drag.points[i].y);
      }
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(drag.offsetX + drag.start.x, drag.offsetY + drag.start.y);
    ctx.lineTo(drag.offsetX + drag.current.x, drag.offsetY + drag.current.y);
    ctx.stroke();
  }, [drag, sizePreset, strokeColor]);

  const currentSource = history[historyIndex] || src;

  const setNodeSource = React.useCallback((nextSource: string) => {
    pendingSyncRef.current = nextSource;
    updateAttributes({ src: nextSource, mimeType: 'image/png' });
  }, [updateAttributes]);

  const pushHistory = React.useCallback((nextSource: string) => {
    const base = historyRef.current.slice(0, historyIndexRef.current + 1);
    base.push(nextSource);
    historyRef.current = base;
    historyIndexRef.current = base.length - 1;
    setHistory(base);
    setHistoryIndex(base.length - 1);
    setNodeSource(nextSource);
  }, [setNodeSource]);

  const replayGif = () => {
    setGifPlaying(false);
    window.requestAnimationFrame(() => {
      setGifReplayTick(prev => prev + 1);
      setGifPlaying(true);
      if (gifPlayTimeoutRef.current !== null) {
        window.clearTimeout(gifPlayTimeoutRef.current);
      }
      gifPlayTimeoutRef.current = window.setTimeout(() => {
        setGifPlaying(false);
        gifPlayTimeoutRef.current = null;
      }, Math.max(gifDurationMs, 400));
    });
  };

  const handleDelete = () => {
    const memoMediaStore = (window as any).goToolkitMemoMediaStore;
    const currentLocalSrc = String(node?.attrs?.localSrc || '').trim();
    const currentSrc = String(node?.attrs?.src || '').trim();
    const currentSpaceId = String((window as any).GoToolkitSpaces?.getCurrentSpaceId?.() || 'golive').trim().toLowerCase() || 'golive';
    const assetMatch = currentSrc.match(/\/v1\/assets\/([A-Za-z0-9_-]+)/);
    if (currentLocalSrc && memoMediaStore?.parseRef && memoMediaStore?.delete) {
      const localId = String(memoMediaStore.parseRef(currentLocalSrc) || '').trim();
      if (localId) {
        void memoMediaStore.get?.(localId).then((record: any) => {
          const remoteAssetId = String(record?.sourceAssetId || '').trim();
          if (remoteAssetId && memoMediaStore?.queueRemoteDelete) {
            void memoMediaStore.queueRemoteDelete(String(record?.spaceId || currentSpaceId), remoteAssetId);
          }
        }).catch(() => null);
        void memoMediaStore.delete(localId).catch(() => null);
      }
    } else if (assetMatch?.[1] && memoMediaStore?.queueRemoteDelete) {
      void memoMediaStore.queueRemoteDelete(currentSpaceId, assetMatch[1]).catch(() => null);
    }
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };

  const replaySrc = React.useMemo(() => {
    if (!gifPlaying) return resolvedSrc;
    if (!resolvedSrc) return resolvedSrc;
    if (resolvedSrc.startsWith('data:')) {
      return `${resolvedSrc}#gtGifReplay=${gifReplayTick}`;
    }
    const sep = resolvedSrc.includes('?') ? '&' : '?';
    return `${resolvedSrc}${sep}gtGifReplay=${gifReplayTick}`;
  }, [gifPlaying, gifReplayTick, resolvedSrc]);

  const imgSrc = isGif ? (gifPlaying ? replaySrc : (gifPoster || resolvedSrc)) : resolvedSrc;

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: heightPx ? '100%' : 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    cursor: activeTool === 'none' ? (isGif ? 'pointer' : 'default') : (activeTool === 'text' ? 'text' : 'crosshair'),
  };

  const frameStyle: React.CSSProperties = {
    width: widthPx ? `${widthPx}px` : '100%',
    ...(heightPx ? { height: `${heightPx}px` } : {}),
  };

  const getImageViewport = React.useCallback((surface: Surface) => {
    const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
    const imageEl = surface === 'fullscreen' ? fullscreenImageRef.current : inlineImageRef.current;
    if (!surfaceEl || !imageEl) return null;
    const sRect = surfaceEl.getBoundingClientRect();
    const iRect = imageEl.getBoundingClientRect();
    const width = Math.max(1, iRect.width);
    const height = Math.max(1, iRect.height);
    return {
      offsetX: iRect.left - sRect.left,
      offsetY: iRect.top - sRect.top,
      width,
      height,
    };
  }, []);

  const applySimpleOperation = React.useCallback(async (
    op: (args: {
      canvas: HTMLCanvasElement;
      ctx: CanvasRenderingContext2D;
      image: HTMLImageElement;
    }) => HTMLCanvasElement | void,
  ) => {
    try {
      const next = await applyCanvasOperation(currentSource, op);
      pushHistory(next);
      return next;
    } catch (err) {
      console.warn(err);
      return null;
    }
  }, [currentSource, pushHistory]);

  const handleUndo = React.useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const nextIndex = historyIndexRef.current - 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    setNodeSource(historyRef.current[nextIndex]);
  }, [setNodeSource]);

  const handleRedo = React.useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const nextIndex = historyIndexRef.current + 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    setNodeSource(historyRef.current[nextIndex]);
  }, [setNodeSource]);

  const handleDeleteSelectedDraft = React.useCallback(() => {
    if (selectedDraft === 'text') {
      setTextDraft(null);
      setSelectedDraft(null);
      return;
    }
    if (selectedDraft === 'shape') {
      setShapeDraft(null);
      setSelectedDraft(null);
    }
  }, [selectedDraft]);

  React.useEffect(() => {
    if (!textDraft && selectedDraft === 'text') setSelectedDraft(null);
  }, [selectedDraft, textDraft]);

  React.useEffect(() => {
    if (!shapeDraft && selectedDraft === 'shape') setSelectedDraft(null);
  }, [selectedDraft, shapeDraft]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput = Boolean(
        target && (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.isContentEditable
        )
      );
      const key = String(event.key || '').toLowerCase();
      const withMod = event.metaKey || event.ctrlKey;
      const inFullscreen = fullscreenOpen;

      if (key === 'escape') {
        setFullscreenOpen(false);
        setActiveTool('none');
        setDrag(null);
        return;
      }

      if (!inFullscreen) return;

      if (withMod && key === 'z' && !event.shiftKey) {
        if (isTextInput) return;
        event.preventDefault();
        event.stopPropagation();
        (event as any).stopImmediatePropagation?.();
        handleUndo();
        return;
      }
      if ((withMod && key === 'y') || (withMod && event.shiftKey && key === 'z')) {
        if (isTextInput) return;
        event.preventDefault();
        event.stopPropagation();
        (event as any).stopImmediatePropagation?.();
        handleRedo();
        return;
      }
      if ((key === 'delete' || key === 'backspace') && !withMod) {
        if (isTextInput) return;
        if (selectedDraft) {
          event.preventDefault();
          event.stopPropagation();
          (event as any).stopImmediatePropagation?.();
          handleDeleteSelectedDraft();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreenOpen, handleDeleteSelectedDraft, handleRedo, handleUndo, selectedDraft]);

  const handleDownload = React.useCallback(async () => {
    try {
      const pngData = await applyCanvasOperation(currentSource, () => undefined);
      const baseName = String(node?.attrs?.fileName || 'memo-image').replace(/\.[a-z0-9]+$/i, '');
      downloadDataUrl(pngData, `${baseName || 'memo-image'}.png`);
    } catch (err) {
      console.warn(err);
    }
  }, [currentSource, node?.attrs?.fileName]);

  const runRotate = React.useCallback(async () => {
    await applySimpleOperation(({ canvas, image }) => {
      const rotated = document.createElement('canvas');
      rotated.width = canvas.height;
      rotated.height = canvas.width;
      const rctx = rotated.getContext('2d');
      if (!rctx) return;
      rctx.translate(rotated.width / 2, rotated.height / 2);
      rctx.rotate(Math.PI / 2);
      rctx.drawImage(image, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
      return rotated;
    });
  }, [applySimpleOperation]);

  const commitDragOperation = React.useCallback(async (state: DragState) => {
    const line = SIZE_PRESETS[sizePreset].line;
    const rect = normalizeRect(state.start, state.current);
    const minDraw = 2;
    const lineDistance = Math.hypot(state.current.x - state.start.x, state.current.y - state.start.y);
    if ((state.tool === 'square' || state.tool === 'crop') && (rect.width < minDraw || rect.height < minDraw)) {
      return;
    }
    if (state.tool === 'line' && lineDistance < minDraw) {
      return;
    }
    if (state.tool === 'pencil' && state.points.length < 2) return;

    await applySimpleOperation(({ canvas, ctx, image }) => {
      const scaleX = canvas.width / Math.max(state.width, 1);
      const scaleY = canvas.height / Math.max(state.height, 1);

      if (state.tool === 'square') {
        const x = rect.x * scaleX;
        const y = rect.y * scaleY;
        const width = rect.width * scaleX;
        const height = rect.height * scaleY;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = line;
        ctx.strokeRect(x, y, width, height);
        return;
      }

      if (state.tool === 'pencil') {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = line;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const first = state.points[0];
        ctx.moveTo(first.x * scaleX, first.y * scaleY);
        for (let i = 1; i < state.points.length; i += 1) {
          const p = state.points[i];
          ctx.lineTo(p.x * scaleX, p.y * scaleY);
        }
        ctx.stroke();
        return;
      }

      if (state.tool === 'line') {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = line;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const startX = state.start.x * scaleX;
        const startY = state.start.y * scaleY;
        const endX = state.current.x * scaleX;
        const endY = state.current.y * scaleY;
        const dx = endX - startX;
        const dy = endY - startY;
        const shaftLength = Math.hypot(dx, dy);
        if (shaftLength <= 0.001) return;
        const ux = dx / shaftLength;
        const uy = dy / shaftLength;
        const headAngle = Math.PI / 7;
        const headLen = Math.max(line * 2.2, 10 * Math.max(scaleX, scaleY));
        const cos = Math.cos(headAngle);
        const sin = Math.sin(headAngle);

        // Rotate the opposite shaft direction (+/- headAngle) for symmetric arrow wings.
        const vx = -ux;
        const vy = -uy;
        const leftX = (vx * cos) - (vy * sin);
        const leftY = (vx * sin) + (vy * cos);
        const rightX = (vx * cos) + (vy * sin);
        const rightY = (-vx * sin) + (vy * cos);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX + (leftX * headLen), endY + (leftY * headLen));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX + (rightX * headLen), endY + (rightY * headLen));
        ctx.stroke();
        return;
      }

      const cropX = Math.round(rect.x * scaleX);
      const cropY = Math.round(rect.y * scaleY);
      const cropWidth = Math.round(rect.width * scaleX);
      const cropHeight = Math.round(rect.height * scaleY);
      const cropped = document.createElement('canvas');
      cropped.width = Math.max(1, cropWidth);
      cropped.height = Math.max(1, cropHeight);
      const cctx = cropped.getContext('2d');
      if (!cctx) return;
      cctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      return cropped;
    });
  }, [applySimpleOperation, sizePreset, strokeColor]);

  const commitShapeDraft = React.useCallback(async (draft: ShapeDraft | null) => {
    if (!draft) return;
    const state: DragState = {
      tool: draft.tool,
      surface: draft.surface,
      start: draft.start,
      current: draft.end,
      points: [draft.start, draft.end],
      width: draft.canvasWidth,
      height: draft.canvasHeight,
      offsetX: draft.offsetX,
      offsetY: draft.offsetY,
    };
    await commitDragOperation(state);
  }, [commitDragOperation]);

  const handleTextPlacement = React.useCallback((surface: Surface, event: React.PointerEvent<HTMLDivElement>) => {
    const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
    if (!surfaceEl) return;
    const viewport = getImageViewport(surface);
    if (!viewport) return;
    const rect = surfaceEl.getBoundingClientRect();
    const local = clampPoint(
      { x: event.clientX - rect.left - viewport.offsetX, y: event.clientY - rect.top - viewport.offsetY },
      viewport.width,
      viewport.height
    );
    setTextDraft({
      surface,
      x: local.x,
      y: local.y,
      width: Math.min(280, Math.max(180, viewport.width * 0.4)),
      height: Math.min(140, Math.max(56, viewport.height * 0.16)),
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      canvasWidth: viewport.width,
      canvasHeight: viewport.height,
      text: '',
    });
  }, [getImageViewport]);

  const commitTextDraft = React.useCallback(async () => {
    if (!textDraft || !textDraft.text.trim()) {
      setTextDraft(null);
      return;
    }
    const draft = textDraft;
    const fontSize = SIZE_PRESETS[sizePreset].font;
    await applySimpleOperation(({ canvas, ctx }) => {
      const scaleX = canvas.width / Math.max(draft.canvasWidth, 1);
      const scaleY = canvas.height / Math.max(draft.canvasHeight, 1);
      const pxFontSize = fontSize * Math.max(scaleY, 1);
      const lineHeight = pxFontSize * 1.3;
      ctx.fillStyle = strokeColor;
      ctx.font = `${pxFontSize}px Inter, sans-serif`;
      ctx.textBaseline = 'top';
      // Keep final rendering aligned with textarea preview content area.
      const startX = (draft.x + TEXT_BOX_PADDING) * scaleX;
      const startY = (draft.y + TEXT_BOX_HEADER_HEIGHT + TEXT_BOX_PADDING) * scaleY;
      const lines = draft.text.split('\n');
      const maxWidth = Math.max(20, (draft.width - (TEXT_BOX_PADDING * 2)) * scaleX);
      const wrappedLines: string[] = [];
      lines.forEach((lineText) => {
        const words = lineText.split(' ');
        let current = '';
        words.forEach((word) => {
          const candidate = current ? `${current} ${word}` : word;
          if (ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
          } else {
            if (current) wrappedLines.push(current);
            current = word;
          }
        });
        wrappedLines.push(current || '');
      });
      const availableHeight = Math.max(12, draft.height - TEXT_BOX_HEADER_HEIGHT - (TEXT_BOX_PADDING * 2));
      const maxLines = Math.max(1, Math.floor((availableHeight * scaleY) / lineHeight));
      wrappedLines.slice(0, maxLines).forEach((lineText, index) => {
        ctx.fillText(lineText, startX, startY + (index * lineHeight));
      });
    });
    setTextDraft(null);
  }, [applySimpleOperation, sizePreset, strokeColor, textDraft]);

  const handleSurfacePointerDown = React.useCallback(async (surface: Surface, event: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;

    if (activeTool === 'none') {
      setSelectedDraft(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startsAnnotationFigure = activeTool === 'text' || activeTool === 'pencil' || activeTool === 'line' || activeTool === 'square';
    if (startsAnnotationFigure) {
      if (shapeDraft) {
        await commitShapeDraft(shapeDraft);
        setShapeDraft(null);
      }
      if (textDraft && textDraft.text.trim()) {
        await commitTextDraft();
      }
      setSelectedDraft(null);
    }

    if (activeTool === 'text') {
      handleTextPlacement(surface, event);
      setSelectedDraft('text');
      return;
    }

    const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
    if (!surfaceEl) return;
    const viewport = getImageViewport(surface);
    if (!viewport) return;
    const bounds = surfaceEl.getBoundingClientRect();
    const start = clampPoint({
      x: event.clientX - bounds.left - viewport.offsetX,
      y: event.clientY - bounds.top - viewport.offsetY,
    }, viewport.width, viewport.height);

    setDrag({
      tool: activeTool,
      surface,
      start,
      current: start,
      points: [start],
      width: viewport.width,
      height: viewport.height,
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
    });
  }, [activeTool, canEdit, commitShapeDraft, commitTextDraft, getImageViewport, handleTextPlacement, shapeDraft, textDraft]);

  React.useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      setDrag((prev) => {
        if (!prev) return prev;
        const surfaceEl = prev.surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
        if (!surfaceEl) return prev;
        const rect = surfaceEl.getBoundingClientRect();
        const next = clampPoint(
          { x: event.clientX - rect.left - prev.offsetX, y: event.clientY - rect.top - prev.offsetY },
          prev.width,
          prev.height
        );
        return {
          ...prev,
          current: next,
          points: prev.tool === 'pencil' ? [...prev.points, next] : prev.points,
        };
      });
    };

    const onUp = () => {
      const current = drag;
      setDrag(null);
      if (current) {
        if (current.tool === 'line' || current.tool === 'square') {
          setShapeDraft({
            tool: current.tool,
            surface: current.surface,
            start: current.start,
            end: current.current,
            offsetX: current.offsetX,
            offsetY: current.offsetY,
            canvasWidth: current.width,
            canvasHeight: current.height,
          });
          setSelectedDraft('shape');
          return;
        }
        void commitDragOperation(current);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, commitDragOperation]);

  React.useEffect(() => {
    return () => {
      if (textDragFrameRef.current !== null) window.cancelAnimationFrame(textDragFrameRef.current);
      if (textResizeFrameRef.current !== null) window.cancelAnimationFrame(textResizeFrameRef.current);
      if (shapeEditFrameRef.current !== null) window.cancelAnimationFrame(shapeEditFrameRef.current);
    };
  }, []);

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      textDragEventRef.current = event;
      if (textDragFrameRef.current !== null) return;
      textDragFrameRef.current = window.requestAnimationFrame(() => {
        textDragFrameRef.current = null;
        const dragState = textDragRef.current;
        const moveEvent = textDragEventRef.current;
        if (!dragState || !moveEvent) return;
        setTextDraft((prev) => {
          if (!prev || prev.surface !== dragState.surface) return prev;
          const surfaceEl = dragState.surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
          if (!surfaceEl) return prev;
          const rect = surfaceEl.getBoundingClientRect();
          const nextX = Math.min(
            Math.max(moveEvent.clientX - rect.left - prev.offsetX - dragState.offsetX, 0),
            Math.max(0, prev.canvasWidth - prev.width),
          );
          const nextY = Math.min(
            Math.max(moveEvent.clientY - rect.top - prev.offsetY - dragState.offsetY, 0),
            Math.max(0, prev.canvasHeight - prev.height),
          );
          if (nextX === prev.x && nextY === prev.y) return prev;
          return { ...prev, x: nextX, y: nextY };
        });
      });
    };
    const onUp = () => {
      textDragRef.current = null;
      textDragEventRef.current = null;
      if (textDragFrameRef.current !== null) {
        window.cancelAnimationFrame(textDragFrameRef.current);
        textDragFrameRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      textResizeEventRef.current = event;
      if (textResizeFrameRef.current !== null) return;
      textResizeFrameRef.current = window.requestAnimationFrame(() => {
        textResizeFrameRef.current = null;
        const resize = textResizeRef.current;
        const moveEvent = textResizeEventRef.current;
        if (!resize || !moveEvent) return;
        setTextDraft((prev) => {
          if (!prev || prev.surface !== resize.surface) return prev;
          const surfaceEl = resize.surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
          if (!surfaceEl) return prev;
          const nextWidth = Math.min(
            Math.max(60, resize.width + (moveEvent.clientX - resize.startX)),
            Math.max(60, prev.canvasWidth - prev.x),
          );
          const nextHeight = Math.min(
            Math.max(40, resize.height + (moveEvent.clientY - resize.startY)),
            Math.max(40, prev.canvasHeight - prev.y),
          );
          if (nextWidth === prev.width && nextHeight === prev.height) return prev;
          return { ...prev, width: nextWidth, height: nextHeight };
        });
      });
    };
    const onUp = () => {
      textResizeRef.current = null;
      textResizeEventRef.current = null;
      if (textResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(textResizeFrameRef.current);
        textResizeFrameRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      shapeEditEventRef.current = event;
      if (shapeEditFrameRef.current !== null) return;
      shapeEditFrameRef.current = window.requestAnimationFrame(() => {
        shapeEditFrameRef.current = null;
        const edit = shapeEditRef.current;
        const moveEvent = shapeEditEventRef.current;
        if (!edit || !moveEvent) return;
        setShapeDraft((prev) => {
          if (!prev || prev.surface !== edit.surface) return prev;
          const surfaceEl = edit.surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
          if (!surfaceEl) return prev;
          const rect = surfaceEl.getBoundingClientRect();
          const next = clampPoint(
            { x: moveEvent.clientX - rect.left - prev.offsetX, y: moveEvent.clientY - rect.top - prev.offsetY },
            prev.canvasWidth,
            prev.canvasHeight
          );
          if (edit.mode === 'start') {
            if (next.x === prev.start.x && next.y === prev.start.y) return prev;
            return { ...prev, start: next };
          }
          if (edit.mode === 'end' || edit.mode === 'square-resize') {
            if (next.x === prev.end.x && next.y === prev.end.y) return prev;
            return { ...prev, end: next };
          }
          const dx = next.x - (edit.anchor?.x || 0);
          const dy = next.y - (edit.anchor?.y || 0);
          const nextStart = clampPoint({ x: edit.start.x + dx, y: edit.start.y + dy }, prev.canvasWidth, prev.canvasHeight);
          const nextEnd = clampPoint({ x: edit.end.x + dx, y: edit.end.y + dy }, prev.canvasWidth, prev.canvasHeight);
          if (
            nextStart.x === prev.start.x
            && nextStart.y === prev.start.y
            && nextEnd.x === prev.end.x
            && nextEnd.y === prev.end.y
          ) return prev;
          return {
            ...prev,
            start: nextStart,
            end: nextEnd,
          };
        });
      });
    };
    const onUp = () => {
      shapeEditRef.current = null;
      shapeEditEventRef.current = null;
      if (shapeEditFrameRef.current !== null) {
        window.cancelAnimationFrame(shapeEditFrameRef.current);
        shapeEditFrameRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const toggleTool = (tool: EditTool) => {
    setDrag(null);
    setActiveTool(prev => (prev === tool ? 'none' : tool));
  };

  const handleCloseFullscreen = React.useCallback(async () => {
    if (drag) {
      await commitDragOperation(drag);
      setDrag(null);
    }
    if (shapeDraft) {
      await commitShapeDraft(shapeDraft);
      setShapeDraft(null);
    }
    if (textDraft) {
      await commitTextDraft();
    }
    setFullscreenOpen(false);
  }, [commitDragOperation, commitShapeDraft, commitTextDraft, drag, shapeDraft, textDraft]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const isTextTool = activeTool === 'text';

  const renderEditToolbar = (surface: Surface, permanent: boolean) => (
    <div className={`memo-image-edit-toolbar ${permanent ? 'is-permanent' : ''}`}>
      <div className="memo-image-edit-group">
        <button type="button" className="memo-image-edit-btn" title="Annuler" onClick={handleUndo} disabled={!canUndo}>
          <Undo2 size={14} />
        </button>
        <button type="button" className="memo-image-edit-btn" title="Rétablir" onClick={handleRedo} disabled={!canRedo}>
          <Redo2 size={14} />
        </button>
      </div>

      <div className="memo-image-edit-group">
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'crop' ? 'is-active' : ''}`} title="Rogner" onClick={() => toggleTool('crop')}>
          <Crop size={14} />
        </button>
        <button type="button" className="memo-image-edit-btn" title="Rotation droite 90°" onClick={() => void runRotate()}>
          <RotateCw size={14} />
        </button>
      </div>

      <div className="memo-image-edit-group">
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'none' ? 'is-active' : ''}`} title="Souris / sélection" onClick={() => toggleTool('none')}>
          <MousePointer2 size={14} />
        </button>
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'pencil' ? 'is-active' : ''}`} title="Crayon" onClick={() => toggleTool('pencil')}>
          <Pencil size={14} />
        </button>
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'line' ? 'is-active' : ''}`} title="Ligne" onClick={() => toggleTool('line')}>
          <ArrowUpLeft size={14} />
        </button>
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'square' ? 'is-active' : ''}`} title="Rectangle" onClick={() => toggleTool('square')}>
          <Square size={14} />
        </button>
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'text' ? 'is-active' : ''}`} title="Texte" onClick={() => toggleTool('text')}>
          <Type size={14} />
        </button>
      </div>

      <div className="memo-image-edit-group memo-image-color-group">
        {IMAGE_EDIT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`memo-image-color-cell ${strokeColor === color ? 'is-active' : ''}`}
            style={{ background: color, boxShadow: color === '#FFFFFF' ? 'inset 0 0 0 1px var(--border-main)' : 'none' }}
            onClick={() => setStrokeColor(color)}
            title={color}
          />
        ))}
      </div>

      <div className="memo-image-edit-group memo-image-size-group">
        {(['S', 'M', 'L'] as SizePreset[]).map((size) => (
          <button
            key={size}
            type="button"
            className={`memo-image-size-btn ${sizePreset === size ? 'is-active' : ''}`}
            onClick={() => setSizePreset(size)}
            title={`Taille ${size}`}
          >
            {!isTextTool ? (
              <svg className="memo-size-stroke-icon" viewBox="0 0 24 24" aria-hidden="true">
                <line
                  x1="5"
                  y1="19"
                  x2="19"
                  y2="5"
                  stroke="currentColor"
                  strokeWidth={size === 'S' ? 2 : size === 'M' ? 4 : 6}
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <ALargeSmall size={size === 'S' ? 12 : size === 'M' ? 14 : 16} />
            )}
          </button>
        ))}
      </div>

      <div className="memo-image-edit-group">
        <button
          type="button"
          className="memo-image-edit-btn"
          title="Supprimer l'élément sélectionné"
          onClick={handleDeleteSelectedDraft}
          disabled={!selectedDraft}
        >
          <Trash2 size={14} />
        </button>
      </div>

    </div>
  );

  const activeDragRect = drag && (drag.tool === 'crop' || drag.tool === 'square')
    ? normalizeRect(drag.start, drag.current)
    : null;
  const shapeRect = shapeDraft && shapeDraft.tool === 'square'
    ? normalizeRect(shapeDraft.start, shapeDraft.end)
    : null;

  const renderSurface = (surface: Surface, imageRef: React.RefObject<HTMLImageElement>, overlayRef: React.RefObject<HTMLCanvasElement>, surfaceRef: React.RefObject<HTMLDivElement>) => (
    <div
      ref={surfaceRef}
      className={`memo-image-surface ${activeTool !== 'none' ? 'is-editing' : ''} ${activeTool === 'crop' ? 'is-cropping' : ''}`}
      onPointerDown={(event) => handleSurfacePointerDown(surface, event)}
      onDoubleClick={() => {
        if (surface === 'inline') setFullscreenOpen(true);
      }}
    >
      <img
        ref={imageRef}
        key={surface === 'inline' && isGif ? `gif-${gifReplayTick}-${gifPlaying ? 'play' : 'poster'}` : `img-${surface}`}
        src={surface === 'inline' ? imgSrc : src}
        alt={String(node?.attrs?.alt || '')}
        title={String(node?.attrs?.title || '')}
        className={surface === 'inline' ? 'memo-image' : 'memo-image-fullscreen'}
        style={surface === 'fullscreen'
          ? {
              width: 'auto',
              height: 'auto',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              cursor: imageStyle.cursor,
            }
          : imageStyle}
        onClick={() => {
          if (surface === 'inline' && isGif && activeTool === 'none') replayGif();
        }}
        draggable={false}
      />

      <canvas className="memo-image-overlay-canvas" ref={overlayRef} />

      {textDraft && textDraft.surface === surface && (
        <div
          className="memo-image-text-frame"
          contentEditable={false}
          style={{
            left: `${textDraft.offsetX + textDraft.x}px`,
            top: `${textDraft.offsetY + textDraft.y}px`,
            width: `${textDraft.width}px`,
            height: `${textDraft.height}px`
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            setSelectedDraft('text');
          }}
        >
          <div
            className="memo-image-text-frame-drag"
            contentEditable={false}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
              if (!surfaceEl || !textDraft) return;
              const rect = surfaceEl.getBoundingClientRect();
              textDragRef.current = {
                surface,
                offsetX: event.clientX - rect.left - textDraft.offsetX - textDraft.x,
                offsetY: event.clientY - rect.top - textDraft.offsetY - textDraft.y,
              };
            }}
          >
            Texte
          </div>
          <textarea
            className="memo-image-text-frame-input"
            contentEditable={false}
            value={textDraft.text}
            onChange={(event) => setTextDraft(prev => prev ? { ...prev, text: event.target.value } : prev)}
            onKeyDown={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
            onInput={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            style={{ color: strokeColor, fontSize: `${SIZE_PRESETS[sizePreset].font}px` }}
            placeholder="Écrire..."
            autoFocus
          />
          <div
            className="memo-image-text-frame-resize"
            contentEditable={false}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              textResizeRef.current = {
                surface,
                startX: event.clientX,
                startY: event.clientY,
                width: textDraft.width,
                height: textDraft.height,
              };
            }}
          />
        </div>
      )}

      {shapeDraft && shapeDraft.surface === surface && shapeDraft.tool === 'line' && (
        <>
          <div
            className="memo-image-shape-line"
            style={{
              left: `${shapeDraft.offsetX + shapeDraft.start.x}px`,
              top: `${shapeDraft.offsetY + shapeDraft.start.y}px`,
              width: `${Math.hypot(shapeDraft.end.x - shapeDraft.start.x, shapeDraft.end.y - shapeDraft.start.y)}px`,
              transform: `rotate(${Math.atan2(shapeDraft.end.y - shapeDraft.start.y, shapeDraft.end.x - shapeDraft.start.x)}rad)`,
              borderColor: strokeColor,
              borderWidth: `${SIZE_PRESETS[sizePreset].line}px`,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedDraft('shape');
              const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
              if (!surfaceEl) return;
              const rect = surfaceEl.getBoundingClientRect();
              shapeEditRef.current = {
                surface,
                mode: 'move',
                anchor: { x: event.clientX - rect.left - shapeDraft.offsetX, y: event.clientY - rect.top - shapeDraft.offsetY },
                start: shapeDraft.start,
                end: shapeDraft.end,
              };
            }}
          />
          <div
            className="memo-image-shape-handle"
            style={{ left: `${shapeDraft.offsetX + shapeDraft.start.x}px`, top: `${shapeDraft.offsetY + shapeDraft.start.y}px`, borderColor: strokeColor }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedDraft('shape');
              shapeEditRef.current = { surface, mode: 'start', start: shapeDraft.start, end: shapeDraft.end };
            }}
          />
          <div
            className="memo-image-shape-handle"
            style={{ left: `${shapeDraft.offsetX + shapeDraft.end.x}px`, top: `${shapeDraft.offsetY + shapeDraft.end.y}px`, borderColor: strokeColor }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedDraft('shape');
              shapeEditRef.current = { surface, mode: 'end', start: shapeDraft.start, end: shapeDraft.end };
            }}
          />
        </>
      )}

      {shapeDraft && shapeDraft.surface === surface && shapeDraft.tool === 'square' && shapeRect && (
        <div
          className="memo-image-shape-square"
          style={{
            left: `${shapeDraft.offsetX + shapeRect.x}px`,
            top: `${shapeDraft.offsetY + shapeRect.y}px`,
            width: `${shapeRect.width}px`,
            height: `${shapeRect.height}px`,
            borderColor: strokeColor,
            borderWidth: `${SIZE_PRESETS[sizePreset].line}px`,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedDraft('shape');
            const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
            if (!surfaceEl) return;
            const rect = surfaceEl.getBoundingClientRect();
            shapeEditRef.current = {
              surface,
              mode: 'move',
              anchor: { x: event.clientX - rect.left - shapeDraft.offsetX, y: event.clientY - rect.top - shapeDraft.offsetY },
              start: shapeDraft.start,
              end: shapeDraft.end,
            };
          }}
        >
          <div
            className="memo-image-shape-square-handle"
            style={{ borderColor: strokeColor }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedDraft('shape');
              shapeEditRef.current = { surface, mode: 'square-resize', start: shapeDraft.start, end: shapeDraft.end };
            }}
          />
        </div>
      )}

      {activeDragRect && drag?.surface === surface && (
        <>
          {drag.tool === 'crop' && <div className="memo-image-crop-overlay" />}
          <div
            className={`memo-image-drag-rect ${drag.tool === 'crop' ? 'is-crop' : ''}`}
            style={{
              left: `${(drag?.offsetX || 0) + activeDragRect.x}px`,
              top: `${(drag?.offsetY || 0) + activeDragRect.y}px`,
              width: `${activeDragRect.width}px`,
              height: `${activeDragRect.height}px`,
              borderColor: strokeColor,
              borderStyle: drag?.tool === 'crop' ? 'dashed' : 'solid',
              borderWidth: `${drag?.tool === 'crop' ? 2 : SIZE_PRESETS[sizePreset].line}px`,
            }}
          />
        </>
      )}

      {isGif && !gifPlaying && surface === 'inline' && activeTool === 'none' && (
        <button
          type="button"
          className="memo-gif-play"
          title="Lire le GIF"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            replayGif();
          }}
        >
          <CirclePlay size={52} />
        </button>
      )}
    </div>
  );

  return (
    <NodeViewWrapper className="memo-image-wrapper">
      <div
        ref={wrapperRef}
        className="memo-image-frame"
        style={frameStyle}
      >
        <div className="memo-image-controls">
          <button
            type="button"
            className="block-delete-button memo-image-action"
            title="Plein écran"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setFullscreenOpen(true);
            }}
          >
            <Fullscreen size={14} />
          </button>
          <button
            type="button"
            className="block-delete-button memo-image-action"
            title="Télécharger PNG"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleDownload();
            }}
          >
            <Download size={14} />
          </button>
          <button
            type="button"
            className="block-delete-button memo-image-action"
            title="Copier"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              copyImageHtml(node.attrs || {});
            }}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="block-delete-button memo-image-action"
            title="Supprimer"
            style={{ display: canEdit ? 'inline-flex' : 'none' }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleDelete();
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {renderSurface('inline', inlineImageRef, inlineOverlayRef, inlineSurfaceRef)}

        {canEdit && (
          <div
            className="memo-image-resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = inlineImageRef.current?.getBoundingClientRect();
              resizeStateRef.current = {
                startX: event.clientX,
                startY: event.clientY,
                width: rect?.width || 320,
                height: rect?.height || 180,
              };
              document.body.classList.add('table-resize-cursor');
            }}
          />
        )}
      </div>

      {fullscreenOpen && (
        <div
          className="memo-image-fullscreen-overlay"
          onClick={() => { void handleCloseFullscreen(); }}
        >
          <div
            className="memo-image-fullscreen-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="memo-image-fullscreen-actions">
              <div className="memo-image-fullscreen-toolbar-center">
                {renderEditToolbar('fullscreen', true)}
              </div>
              <div className="memo-image-fullscreen-action-buttons">
                <button
                  type="button"
                  className="block-delete-button memo-image-action"
                  title="Télécharger PNG"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleDownload();
                  }}
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  className="block-delete-button memo-image-action"
                  title="Fermer"
                  onClick={() => { void handleCloseFullscreen(); }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="memo-image-frame memo-image-fullscreen-frame">
              {renderSurface('fullscreen', fullscreenImageRef, fullscreenOverlayRef, fullscreenSurfaceRef)}
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: element => {
          const localSrc = sanitizeUrl(element.getAttribute('data-gt-local-src'), ['gtlocal']);
          if (localSrc) {
            return sanitizeUrl(element.getAttribute('src'), ['http', 'https', 'data', 'blob']) || '';
          }
          return sanitizeUrl(element.getAttribute('src'), ['http', 'https', 'data', 'blob', 'gtlocal']) || null;
        },
        renderHTML: attributes => {
          const src = sanitizeUrl(attributes.src, ['http', 'https', 'data', 'blob']);
          return src ? { src } : {};
        },
      },
      localSrc: {
        default: null,
        parseHTML: element => sanitizeUrl(element.getAttribute('data-gt-local-src'), ['gtlocal']) || null,
        renderHTML: attributes => {
          const ref = sanitizeUrl(attributes.localSrc, ['gtlocal']);
          return ref ? { 'data-gt-local-src': ref } : {};
        },
      },
      width: {
        default: null,
        parseHTML: element => sanitizeSize(element.getAttribute('width') || element.style.width),
        renderHTML: attributes => attributes.width ? { width: String(attributes.width).replace(/px$/, '') } : {},
      },
      height: {
        default: null,
        parseHTML: element => sanitizeSize(element.getAttribute('height') || element.style.height),
        renderHTML: attributes => attributes.height ? { height: String(attributes.height).replace(/px$/, '') } : {},
      },
      fit: {
        default: 'contain',
        parseHTML: element => element.getAttribute('data-fit') || 'contain',
        renderHTML: attributes => attributes.fit ? { 'data-fit': attributes.fit } : {},
      },
      fileName: {
        default: null,
        parseHTML: element => element.getAttribute('data-file-name'),
        renderHTML: attributes => attributes.fileName ? { 'data-file-name': attributes.fileName } : {},
      },
      mimeType: {
        default: null,
        parseHTML: element => element.getAttribute('data-mime-type'),
        renderHTML: attributes => attributes.mimeType ? { 'data-mime-type': attributes.mimeType } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
}).configure({
  allowBase64: true,
});

export const isSupportedImageFile = (file: File) => {
  const mime = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (SUPPORTED_IMAGE_MIME.has(mime)) return true;
  return SUPPORTED_IMAGE_EXT.some(ext => name.endsWith(ext));
};
