import React from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Copy, Play, Trash2 } from 'lucide-react';
import { sanitizeUrl } from './sanitize';

const parseSizePx = (value: unknown) => {
  if (value == null) return null;
  const numeric = parseFloat(String(value).replace(/px$/i, '').trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const DEFAULT_VIDEO_HEIGHT_PX = 600;
const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;

const copyVideoHtml = async (attrs: Record<string, any>) => {
  const src = String(attrs?.src || '');
  if (!src) return;
  const video = document.createElement('video');
  video.setAttribute('controls', 'true');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('preload', 'metadata');
  video.src = src;
  if (attrs?.title) video.title = String(attrs.title);
  if (attrs?.width) video.setAttribute('width', String(attrs.width).replace(/px$/, ''));
  if (attrs?.height) video.setAttribute('height', String(attrs.height).replace(/px$/, ''));
  if (attrs?.mimeType) video.setAttribute('data-mime-type', String(attrs.mimeType));
  if (attrs?.fileName) video.setAttribute('data-file-name', String(attrs.fileName));

  const source = document.createElement('source');
  source.src = src;
  source.type = String(attrs?.mimeType || '');
  video.appendChild(source);

  const html = video.outerHTML;
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

const VideoNodeView = ({ node, editor, getPos, updateAttributes }: any) => {
  const src = sanitizeUrl(node?.attrs?.src, ['http', 'https', 'data', 'gtlocal']) || '';
  const [resolvedSrc, setResolvedSrc] = React.useState(src);
  const canEdit = Boolean(editor?.isEditable);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const resizeStateRef = React.useRef<null | { startX: number; startY: number; width: number; height: number }>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [aspectRatio, setAspectRatio] = React.useState(DEFAULT_VIDEO_ASPECT_RATIO);
  const widthPx = parseSizePx(node?.attrs?.width);
  const heightPx = parseSizePx(node?.attrs?.height);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const memoMediaStore = (window as any).goToolkitMemoMediaStore;
      if (!memoMediaStore?.isLocalRef?.(src) || !memoMediaStore?.resolveBlobUrl) {
        setResolvedSrc(src);
        return;
      }
      const blobUrl = await memoMediaStore.resolveBlobUrl(src).catch(() => '');
      if (!cancelled) {
        setResolvedSrc(String(blobUrl || src));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [src]);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const syncRatio = () => {
      const w = Number(el.videoWidth || 0);
      const h = Number(el.videoHeight || 0);
      if (w > 0 && h > 0) {
        setAspectRatio(w / h);
      }
    };
    syncRatio();
    el.addEventListener('loadedmetadata', syncRatio);
    return () => {
      el.removeEventListener('loadedmetadata', syncRatio);
    };
  }, [resolvedSrc]);

  React.useEffect(() => {
    if (!canEdit) return;
    const onPointerMove = (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (!current) return;
      const nextWidth = Math.max(220, current.width + (event.clientX - current.startX));
      const nextHeight = Math.max(124, current.height + (event.clientY - current.startY));
      if (typeof updateAttributes === 'function') {
        updateAttributes({
          width: `${Math.round(nextWidth)}px`,
          height: `${Math.round(nextHeight)}px`,
        });
      }
    };
    const onPointerUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.classList.remove('table-resize-cursor');
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.body.classList.remove('table-resize-cursor');
    };
  }, [canEdit, updateAttributes]);

  const handleDelete = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };

  const handleTogglePlayback = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.memo-image-controls') || target?.closest('.memo-link-block__handle')) return;
    event.preventDefault();
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        // no-op
      });
      return;
    }
    video.pause();
  };

  const defaultHeightPx = DEFAULT_VIDEO_HEIGHT_PX;
  const defaultWidthPx = Math.round(defaultHeightPx * (aspectRatio || DEFAULT_VIDEO_ASPECT_RATIO));
  const frameStyle: React.CSSProperties = {
    width: widthPx ? `${widthPx}px` : `${defaultWidthPx}px`,
    height: `${heightPx ?? defaultHeightPx}px`,
  };

  const videoStyle: React.CSSProperties = {
    width: '100%',
    height: heightPx ? '100%' : 'auto',
  };

  return (
    <NodeViewWrapper className="memo-video-wrapper">
      <div ref={frameRef} className="memo-video-frame" style={frameStyle} onClick={handleTogglePlayback}>
        <button className="memo-link-block__handle" type="button" aria-label="Déplacer" data-drag-handle>
          <i data-lucide="grip-vertical" aria-hidden="true" />
        </button>
        <div className="memo-image-controls">
          <button
            type="button"
            className="block-delete-button memo-image-action"
            title="Copier"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              copyVideoHtml(node.attrs || {});
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
        <video
          ref={videoRef}
          className="memo-video"
          style={videoStyle}
          src={resolvedSrc}
          playsInline
          preload="metadata"
          title={String(node?.attrs?.title || '')}
        />
        {!isPlaying && (
          <div className="memo-video-play-overlay" aria-hidden="true">
            <i data-lucide="play" style={{ display: 'none' }} aria-hidden="true"></i>
            <Play size={28} />
          </div>
        )}
        {canEdit && (
          <div
            className="memo-video-resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = frameRef.current?.getBoundingClientRect();
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
    </NodeViewWrapper>
  );
};

const EmbedNodeView = ({ node, editor, getPos, updateAttributes }: any) => {
  const canEdit = Boolean(editor?.isEditable);
  const src = sanitizeUrl(node?.attrs?.src, ['http', 'https']) || '';
  const title = String(node?.attrs?.title || '');
  const provider = String(node?.attrs?.provider || '').trim().toLowerCase();
  const providerLabel = provider === 'youtube' ? 'Youtube' : provider === 'loom' ? 'Loom' : 'Video';
  const watchLabel = `Regarder (${providerLabel})`;
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const resizeStateRef = React.useRef<null | { startX: number; startY: number; width: number; height: number }>(null);
  const widthPx = parseSizePx(node?.attrs?.width);
  const heightPx = parseSizePx(node?.attrs?.height);

  const handleDelete = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };

  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src);
    } catch (err) {
      // noop
    }
  };

  React.useEffect(() => {
    if (!canEdit) return;
    const onPointerMove = (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (!current) return;
      const nextWidth = Math.max(220, current.width + (event.clientX - current.startX));
      const nextHeight = Math.max(180, current.height + (event.clientY - current.startY));
      if (typeof updateAttributes === 'function') {
        updateAttributes({
          width: `${Math.round(nextWidth)}px`,
          height: `${Math.round(nextHeight)}px`,
        });
      }
    };
    const onPointerUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.classList.remove('table-resize-cursor');
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.body.classList.remove('table-resize-cursor');
    };
  }, [canEdit, updateAttributes]);

  const frameStyle: React.CSSProperties = {
    width: widthPx ? `${widthPx}px` : undefined,
    height: heightPx ? `${heightPx}px` : undefined,
  };

  const embedStyle: React.CSSProperties = {
    height: heightPx ? '100%' : undefined,
  };

  return (
    <NodeViewWrapper className="memo-video-wrapper">
      <div ref={frameRef} className="memo-video-frame memo-embed-frame" style={frameStyle}>
        <button className="memo-link-block__handle" type="button" aria-label="Déplacer" data-drag-handle>
          <i data-lucide="grip-vertical" aria-hidden="true" />
        </button>
        <div className="memo-image-controls">
          <button
            type="button"
            className="block-delete-button memo-image-action"
            title="Copier"
            onClick={handleCopy}
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
        <iframe
          className="memo-embed"
          style={embedStyle}
          src={src}
          title={title || 'Embedded video'}
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
        <div className="memo-video-embed-overlay" aria-hidden="true">
          <span className="memo-video-embed-overlay__icon">
            <i data-lucide="play" style={{ display: 'none' }} aria-hidden="true"></i>
            <Play size={28} />
          </span>
          <span className="memo-video-embed-overlay__label">{watchLabel}</span>
        </div>
        {canEdit && (
          <div
            className="memo-video-resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = frameRef.current?.getBoundingClientRect();
              resizeStateRef.current = {
                startX: event.clientX,
                startY: event.clientY,
                width: rect?.width || 640,
                height: rect?.height || 360,
              };
              document.body.classList.add('table-resize-cursor');
            }}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: element => sanitizeUrl(element.getAttribute('src'), ['http', 'https', 'data', 'gtlocal']) || null,
        renderHTML: attributes => {
          const src = sanitizeUrl(attributes.src, ['http', 'https', 'data', 'gtlocal']);
          return src ? { src } : {};
        },
      },
      title: { default: null },
      fileName: { default: null },
      mimeType: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      { tag: 'video[src]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(
        {
          controls: 'true',
          playsinline: 'true',
          preload: 'metadata',
        },
        HTMLAttributes
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },
});

export const ExternalVideoEmbed = Node.create({
  name: 'externalVideoEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: element => sanitizeUrl(element.getAttribute('src'), ['http', 'https']) || null,
        renderHTML: attributes => {
          const src = sanitizeUrl(attributes.src, ['http', 'https']);
          return src ? { src } : {};
        },
      },
      title: { default: null },
      provider: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'iframe[data-type="external-video-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'iframe',
      mergeAttributes(
        {
          'data-type': 'external-video-embed',
          loading: 'lazy',
          allowfullscreen: 'true',
          allow: 'autoplay; fullscreen; picture-in-picture; clipboard-write',
          referrerpolicy: 'strict-origin-when-cross-origin',
        },
        HTMLAttributes
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },
});
