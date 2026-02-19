import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { CirclePlay, Copy, Fullscreen, Trash2, X } from 'lucide-react';

const SUPPORTED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]);

const SUPPORTED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif'];

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
    // Graphics Control Extension: 0x21,0xF9,0x04,packed,delayLo,delayHi,transparent,index
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9 && bytes[i + 2] === 0x04) {
      const delayCs = bytes[i + 4] | (bytes[i + 5] << 8); // centiseconds
      // Very small delay values are clamped in browsers; 10cs ~= 100ms is a safe minimum.
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

const ImageNodeView = ({ node, editor, updateAttributes, getPos }: any) => {
  const src = String(node?.attrs?.src || '');
  const canEdit = Boolean(editor?.isEditable);
  const isGif = isGifSource(src);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const resizeStateRef = React.useRef<null | { startX: number; startY: number; width: number; height: number }>(null);
  const gifPlayTimeoutRef = React.useRef<number | null>(null);
  const [gifPoster, setGifPoster] = React.useState<string | null>(null);
  const [gifPlaying, setGifPlaying] = React.useState(!isGif);
  const [gifDurationMs, setGifDurationMs] = React.useState(4000);
  const [gifReplayTick, setGifReplayTick] = React.useState(0);
  const [fullscreenOpen, setFullscreenOpen] = React.useState(false);
  const [fullscreenMode, setFullscreenMode] = React.useState<'width' | 'height'>('width');

  const widthPx = getPixels(node.attrs?.width);
  const heightPx = getPixels(node.attrs?.height);

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

  const imgSrc = isGif
    ? (gifPlaying ? replaySrc : (gifPoster || src))
    : src;

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: heightPx ? '100%' : 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: node.attrs?.fit === 'height' ? 'contain' : 'contain',
    cursor: isGif ? 'pointer' : 'default',
  };

  const frameStyle: React.CSSProperties = {
    width: widthPx ? `${widthPx}px` : '100%',
    ...(heightPx ? { height: `${heightPx}px` } : {}),
  };

  return (
    <NodeViewWrapper className="memo-image-wrapper">
      <div ref={wrapperRef} className="memo-image-frame" style={frameStyle}>
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

        <img
          key={isGif ? `gif-${gifReplayTick}-${gifPlaying ? 'play' : 'poster'}` : 'img'}
          src={imgSrc}
          alt={String(node?.attrs?.alt || '')}
          title={String(node?.attrs?.title || '')}
          className="memo-image"
          style={imageStyle}
          onClick={() => {
            if (isGif) replayGif();
          }}
          draggable={false}
        />

        {isGif && !gifPlaying && (
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

        {canEdit && (
          <div
            className="memo-image-resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const img = wrapperRef.current?.querySelector('.memo-image') as HTMLElement | null;
              const rect = img?.getBoundingClientRect();
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
              <button
                type="button"
                className="block-delete-button memo-image-action"
                title={fullscreenMode === 'width' ? 'Plein hauteur' : 'Plein largeur'}
                onClick={() => setFullscreenMode(prev => prev === 'width' ? 'height' : 'width')}
              >
                <Fullscreen size={14} />
              </button>
              <button
                type="button"
                className="block-delete-button memo-image-action"
                title="Fermer"
                onClick={() => setFullscreenOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            <img
              src={src}
              alt={String(node?.attrs?.alt || '')}
              className="memo-image-fullscreen"
              style={{
                width: fullscreenMode === 'width' ? '100%' : 'auto',
                height: fullscreenMode === 'height' ? '100%' : 'auto',
              }}
            />
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
