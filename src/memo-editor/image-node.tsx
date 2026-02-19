import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import {
  Blend,
  Circle,
  CirclePlay,
  Copy,
  Crop,
  Download,
  Fullscreen,
  Pencil,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';

const SUPPORTED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]);

const SUPPORTED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif'];

const IMAGE_EDIT_COLORS = [
  '#000000', '#FFFFFF', '#EF4444', '#F97316', '#FACC15',
  '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#64748B',
];

const SIZE_PRESETS = {
  S: { line: 2, font: 12 },
  M: { line: 4, font: 16 },
  L: { line: 6, font: 20 },
} as const;

type SizePreset = keyof typeof SIZE_PRESETS;
type EditTool = 'none' | 'crop' | 'pencil' | 'square' | 'text';
type Surface = 'inline' | 'fullscreen';
type Point = { x: number; y: number };
type DragState = {
  tool: Exclude<EditTool, 'none' | 'text'>;
  surface: Surface;
  start: Point;
  current: Point;
  points: Point[];
  width: number;
  height: number;
};

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
  const canEdit = Boolean(editor?.isEditable);
  const isGif = isGifSource(src);
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

  const [gifPoster, setGifPoster] = React.useState<string | null>(null);
  const [gifPlaying, setGifPlaying] = React.useState(!isGif);
  const [gifDurationMs, setGifDurationMs] = React.useState(4000);
  const [gifReplayTick, setGifReplayTick] = React.useState(0);
  const [fullscreenOpen, setFullscreenOpen] = React.useState(false);
  const [inlineToolbarOpen, setInlineToolbarOpen] = React.useState(false);
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState<EditTool>('none');
  const [sizePreset, setSizePreset] = React.useState<SizePreset>('M');
  const [strokeColor, setStrokeColor] = React.useState('#000000');
  const [history, setHistory] = React.useState<string[]>([src]);
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const [drag, setDrag] = React.useState<DragState | null>(null);

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
    img.src = src;
    estimateGifDurationMs(src).then((duration) => {
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
  }, [isGif, src]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreenOpen(false);
        setActiveTool('none');
        setDrag(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      setInlineToolbarOpen(false);
      setShowColorPicker(false);
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
    if (!drag || drag.tool !== 'pencil' || drag.points.length < 2) return;

    const line = SIZE_PRESETS[sizePreset].line;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = line;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(drag.points[0].x, drag.points[0].y);
    for (let i = 1; i < drag.points.length; i += 1) {
      ctx.lineTo(drag.points[i].x, drag.points[i].y);
    }
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
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };

  const replaySrc = React.useMemo(() => {
    if (!gifPlaying) return src;
    if (!src || src.startsWith('data:')) return src;
    const sep = src.includes('?') ? '&' : '?';
    return `${src}${sep}gtGifReplay=${gifReplayTick}`;
  }, [gifPlaying, gifReplayTick, src]);

  const imgSrc = isGif ? (gifPlaying ? replaySrc : (gifPoster || src)) : src;

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: heightPx ? '100%' : 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    cursor: activeTool === 'none' ? (isGif ? 'pointer' : 'default') : 'crosshair',
  };

  const frameStyle: React.CSSProperties = {
    width: widthPx ? `${widthPx}px` : '100%',
    ...(heightPx ? { height: `${heightPx}px` } : {}),
  };

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

  const handleDownload = React.useCallback(async () => {
    try {
      const pngData = await applyCanvasOperation(currentSource, () => undefined);
      const baseName = String(node?.attrs?.fileName || 'memo-image').replace(/\.[a-z0-9]+$/i, '');
      downloadDataUrl(pngData, `${baseName || 'memo-image'}.png`);
    } catch (err) {
      console.warn(err);
    }
  }, [currentSource, node?.attrs?.fileName]);

  const runTransparent = React.useCallback(async () => {
    await applySimpleOperation(({ canvas, ctx }) => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 238 && g > 238 && b > 238) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    });
  }, [applySimpleOperation]);

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
    if ((state.tool === 'square' || state.tool === 'crop') && (rect.width < minDraw || rect.height < minDraw)) {
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

  const handleTextPlacement = React.useCallback(async (surface: Surface, event: React.PointerEvent<HTMLDivElement>) => {
    const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
    if (!surfaceEl) return;
    const rect = surfaceEl.getBoundingClientRect();
    const local = clampPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, rect.width, rect.height);
    const value = window.prompt('Texte à ajouter');
    if (!value) return;

    const fontSize = SIZE_PRESETS[sizePreset].font;
    await applySimpleOperation(({ canvas, ctx }) => {
      const scaleX = canvas.width / Math.max(rect.width, 1);
      const scaleY = canvas.height / Math.max(rect.height, 1);
      ctx.fillStyle = strokeColor;
      ctx.font = `${fontSize * Math.max(scaleY, 1)}px Inter, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(value, local.x * scaleX, local.y * scaleY);
    });
  }, [applySimpleOperation, sizePreset, strokeColor]);

  const handleSurfacePointerDown = React.useCallback((surface: Surface, event: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    setInlineToolbarOpen(true);

    if (activeTool === 'none') return;

    event.preventDefault();
    event.stopPropagation();

    if (activeTool === 'text') {
      void handleTextPlacement(surface, event);
      return;
    }

    const surfaceEl = surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
    if (!surfaceEl) return;
    const bounds = surfaceEl.getBoundingClientRect();
    const start = clampPoint({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }, bounds.width, bounds.height);

    setDrag({
      tool: activeTool,
      surface,
      start,
      current: start,
      points: [start],
      width: bounds.width,
      height: bounds.height,
    });
  }, [activeTool, canEdit, handleTextPlacement]);

  React.useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      setDrag((prev) => {
        if (!prev) return prev;
        const surfaceEl = prev.surface === 'fullscreen' ? fullscreenSurfaceRef.current : inlineSurfaceRef.current;
        if (!surfaceEl) return prev;
        const rect = surfaceEl.getBoundingClientRect();
        const next = clampPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, rect.width, rect.height);
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

  const toggleTool = (tool: EditTool) => {
    setInlineToolbarOpen(true);
    setShowColorPicker(false);
    setDrag(null);
    setActiveTool(prev => (prev === tool ? 'none' : tool));
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const renderEditToolbar = (surface: Surface, permanent: boolean) => (
    <div className={`memo-image-edit-toolbar ${permanent ? 'is-permanent' : ''}`}>
      <div className="memo-image-edit-group">
        <button type="button" className="memo-image-edit-btn" title="Annuler" onClick={handleUndo} disabled={!canUndo}>
          <i data-lucide="undo" style={{ display: 'none' }} aria-hidden="true"></i>
          <Undo2 size={14} />
        </button>
        <button type="button" className="memo-image-edit-btn" title="Rétablir" onClick={handleRedo} disabled={!canRedo}>
          <i data-lucide="redo" style={{ display: 'none' }} aria-hidden="true"></i>
          <Redo2 size={14} />
        </button>
      </div>

      <div className="memo-image-edit-group">
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'crop' ? 'is-active' : ''}`} title="Rogner" onClick={() => toggleTool('crop')}>
          <i data-lucide="crop" style={{ display: 'none' }} aria-hidden="true"></i>
          <Crop size={14} />
        </button>
        <button type="button" className="memo-image-edit-btn" title="Rotation droite 90°" onClick={() => void runRotate()}>
          <i data-lucide="rotate-cw" style={{ display: 'none' }} aria-hidden="true"></i>
          <RotateCw size={14} />
        </button>
        <button type="button" className="memo-image-edit-btn" title="Fond transparent" onClick={() => void runTransparent()}>
          <i data-lucide="blend" style={{ display: 'none' }} aria-hidden="true"></i>
          <Blend size={14} />
        </button>
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
            {size}
          </button>
        ))}
      </div>

      <div className="memo-image-edit-group memo-image-color-group">
        <button
          type="button"
          className="memo-image-edit-btn"
          title="Couleur"
          onClick={() => setShowColorPicker(prev => !prev)}
        >
          <i data-lucide="circle" style={{ display: 'none' }} aria-hidden="true"></i>
          <Circle size={14} style={{ fill: strokeColor, color: strokeColor }} />
        </button>
        {showColorPicker && (
          <div className="memo-image-color-grid" onClick={(event) => event.stopPropagation()}>
            {IMAGE_EDIT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`memo-image-color-cell ${strokeColor === color ? 'is-active' : ''}`}
                style={{ background: color, borderColor: color === '#FFFFFF' ? 'var(--border-main)' : color }}
                onClick={() => {
                  setStrokeColor(color);
                  setShowColorPicker(false);
                }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>

      <div className="memo-image-edit-group">
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'pencil' ? 'is-active' : ''}`} title="Crayon" onClick={() => toggleTool('pencil')}>
          <i data-lucide="pencil" style={{ display: 'none' }} aria-hidden="true"></i>
          <Pencil size={14} />
        </button>
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'square' ? 'is-active' : ''}`} title="Rectangle" onClick={() => toggleTool('square')}>
          <i data-lucide="square" style={{ display: 'none' }} aria-hidden="true"></i>
          <Square size={14} />
        </button>
        <button type="button" className={`memo-image-edit-btn ${activeTool === 'text' ? 'is-active' : ''}`} title="Texte" onClick={() => toggleTool('text')}>
          <i data-lucide="type" style={{ display: 'none' }} aria-hidden="true"></i>
          <Type size={14} />
        </button>
      </div>

      {surface === 'fullscreen' && (
        <button type="button" className="memo-image-edit-btn" title="Télécharger en PNG" onClick={() => void handleDownload()}>
          <i data-lucide="download" style={{ display: 'none' }} aria-hidden="true"></i>
          <Download size={14} />
        </button>
      )}
    </div>
  );

  const activeDragRect = drag && (drag.tool === 'crop' || drag.tool === 'square')
    ? normalizeRect(drag.start, drag.current)
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
        style={imageStyle}
        onClick={() => {
          if (surface === 'inline' && isGif && activeTool === 'none') replayGif();
          if (surface === 'inline') setInlineToolbarOpen(true);
        }}
        draggable={false}
      />

      <canvas className="memo-image-overlay-canvas" ref={overlayRef} />

      {activeDragRect && drag?.surface === surface && (
        <>
          {drag.tool === 'crop' && <div className="memo-image-crop-overlay" />}
          <div
            className={`memo-image-drag-rect ${drag.tool === 'crop' ? 'is-crop' : ''}`}
            style={{
              left: `${activeDragRect.x}px`,
              top: `${activeDragRect.y}px`,
              width: `${activeDragRect.width}px`,
              height: `${activeDragRect.height}px`,
              borderColor: strokeColor,
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
          <i data-lucide="circle-play" style={{ display: 'none' }} aria-hidden="true"></i>
          <CirclePlay size={52} />
        </button>
      )}
    </div>
  );

  return (
    <NodeViewWrapper className="memo-image-wrapper">
      <div
        ref={wrapperRef}
        className={`memo-image-frame ${inlineToolbarOpen && canEdit ? 'has-inline-toolbar' : ''}`}
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
            <i data-lucide="fullscreen" style={{ display: 'none' }} aria-hidden="true"></i>
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
            <i data-lucide="download" style={{ display: 'none' }} aria-hidden="true"></i>
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
            <i data-lucide="copy" style={{ display: 'none' }} aria-hidden="true"></i>
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
            <i data-lucide="trash-2" style={{ display: 'none' }} aria-hidden="true"></i>
            <Trash2 size={14} />
          </button>
        </div>

        {inlineToolbarOpen && canEdit && renderEditToolbar('inline', false)}

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
          onClick={() => setFullscreenOpen(false)}
        >
          <div
            className="memo-image-fullscreen-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="memo-image-fullscreen-actions">
              {renderEditToolbar('fullscreen', true)}
              <button
                type="button"
                className="block-delete-button memo-image-action"
                title="Fermer"
                onClick={() => setFullscreenOpen(false)}
              >
                <i data-lucide="x" style={{ display: 'none' }} aria-hidden="true"></i>
                <X size={14} />
              </button>
            </div>
            {renderSurface('fullscreen', fullscreenImageRef, fullscreenOverlayRef, fullscreenSurfaceRef)}
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
