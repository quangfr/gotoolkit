import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { Copy, Fullscreen, Play, Trash2, X } from 'lucide-react';

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
  const [gifPoster, setGifPoster] = React.useState<string | null>(null);
  const [gifPlaying, setGifPlaying] = React.useState(!isGif);
  const [gifReplayTick, setGifReplayTick] = React.useState(0);
  const [fullscreenOpen, setFullscreenOpen] = React.useState(false);
  const [fullscreenMode, setFullscreenMode] = React.useState<'width' | 'height'>('width');

  const widthPx = getPixels(node.attrs?.width);
  const heightPx = getPixels(node.attrs?.height);

  React.useEffect(() => {
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
    return () => {
      cancelled = true;
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
    setGifReplayTick(prev => prev + 1);
    setGifPlaying(true);
  };

  const handleDelete = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };

  const imgSrc = isGif
    ? (gifPlaying ? src : (gifPoster || src))
    : src;

  const imageStyle: React.CSSProperties = {
    width: widthPx ? `${widthPx}px` : '100%',
    height: heightPx ? `${heightPx}px` : 'auto',
    maxWidth: '100%',
    objectFit: node.attrs?.fit === 'height' ? 'contain' : 'contain',
    cursor: isGif ? 'pointer' : 'default',
  };

  return (
    <NodeViewWrapper className="memo-image-wrapper">
      <div ref={wrapperRef} className="memo-image-frame">
        <div className="memo-image-controls">
          <button
            type="button"
            className="block-delete-button memo-image-action"
            data-lucide="fullscreen"
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
            data-lucide="copy"
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
            data-lucide="trash-2"
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
            <Play size={14} />
            GIF
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
