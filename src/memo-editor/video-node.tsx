import React from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Copy, Download, Maximize, Pause, Play, Trash2 } from 'lucide-react';
import { sanitizeUrl } from './sanitize';

const parseSizePx = (value: unknown) => {
  if (value == null) return null;
  const numeric = parseFloat(String(value).replace(/px$/i, '').trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const DEFAULT_VIDEO_HEIGHT_PX = 600;
const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;
const VOICE_RECORDING_SPEED_STORAGE_KEY = 'go-toolkit-voice-recording-speed';

const normalizePlaybackSpeed = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1.2;
  const rounded = Math.round(numeric * 10) / 10;
  return Math.min(4, Math.max(0.4, rounded));
};

const getConfiguredPlaybackSpeed = () => {
  const globalSpeed = (window as any).GoToolkitVoiceRecordingSpeed;
  if (globalSpeed != null) return normalizePlaybackSpeed(globalSpeed);
  try {
    const fromLocal = localStorage.getItem(VOICE_RECORDING_SPEED_STORAGE_KEY);
    if (fromLocal) return normalizePlaybackSpeed(fromLocal);
  } catch (err) {
    // noop
  }
  const fromConfig = (window as any).GoToolkitSiteConfig?.get?.('voice.recordingSpeed', null);
  if (fromConfig != null) return normalizePlaybackSpeed(fromConfig);
  return 1.2;
};

const formatVideoTime = (value: unknown) => {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

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
  const localSrc = sanitizeUrl(node?.attrs?.localSrc, ['gtlocal']) || '';
  const [resolvedSrc, setResolvedSrc] = React.useState(src);
  const canEdit = Boolean(editor?.isEditable);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const resizeStateRef = React.useRef<null | { startX: number; startY: number; width: number; height: number }>(null);
  const controlsHideTimerRef = React.useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [aspectRatio, setAspectRatio] = React.useState(DEFAULT_VIDEO_ASPECT_RATIO);
  const [progressRatio, setProgressRatio] = React.useState(0);
  const [controlsVisible, setControlsVisible] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [playbackRate, setPlaybackRate] = React.useState(() => getConfiguredPlaybackSpeed());
  const widthPx = parseSizePx(node?.attrs?.width);
  const heightPx = parseSizePx(node?.attrs?.height);

  const showMiniControls = React.useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current !== null) {
      window.clearTimeout(controlsHideTimerRef.current);
    }
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsHideTimerRef.current = null;
    }, 5000);
  }, []);

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

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const updateProgress = () => {
      const duration = Number(el.duration || 0);
      const current = Number(el.currentTime || 0);
      setDuration(duration > 0 ? duration : 0);
      setCurrentTime(current > 0 ? current : 0);
      setProgressRatio(duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0);
    };
    const onPlay = () => {
      setIsPlaying(true);
      showMiniControls();
    };
    const onPause = () => {
      setIsPlaying(false);
      showMiniControls();
    };
    const onEnded = () => {
      setIsPlaying(false);
      updateProgress();
      showMiniControls();
    };
    const onLoadedMetadata = () => updateProgress();
    const onTimeUpdate = () => updateProgress();
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [showMiniControls]);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
  }, [playbackRate]);

  React.useEffect(() => {
    const onSpeedChange = (event: Event) => {
      const nextValue = (event as CustomEvent)?.detail?.value ?? (window as any).GoToolkitVoiceRecordingSpeed;
      setPlaybackRate(normalizePlaybackSpeed(nextValue));
    };
    window.addEventListener('go-toolkit:voice-recording-speed-changed', onSpeedChange as EventListener);
    return () => {
      window.removeEventListener('go-toolkit:voice-recording-speed-changed', onSpeedChange as EventListener);
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
    return () => {
      if (controlsHideTimerRef.current !== null) {
        window.clearTimeout(controlsHideTimerRef.current);
      }
    };
  }, []);

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

  const handleTogglePlayback = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.memo-image-controls') || target?.closest('.memo-link-block__handle')) return;
    event.preventDefault();
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    showMiniControls();
    if (video.paused) {
      void video.play().catch(() => {
        // no-op
      });
      return;
    }
    video.pause();
  };

  const handleProgressInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const ratio = Math.min(1, Math.max(0, Number(event.target.value) || 0));
    const duration = Number(video.duration || 0);
    if (duration > 0) {
      video.currentTime = duration * ratio;
    }
    setProgressRatio(ratio);
    showMiniControls();
  };

  const handlePlayPauseButton = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    showMiniControls();
    if (video.paused) {
      void video.play().catch(() => null);
    } else {
      video.pause();
    }
  };

  const handleSpeedChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextRate = normalizePlaybackSpeed(event.target.value);
    setPlaybackRate(nextRate);
    showMiniControls();
  };

  const handleDownload = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const href = String(resolvedSrc || src).trim();
    if (!href) return;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = String(node?.attrs?.fileName || node?.attrs?.title || 'video').trim() || 'video';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleFullscreen = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = frameRef.current || videoRef.current;
    const requestFullscreen = (target as any)?.requestFullscreen
      || (target as any)?.webkitRequestFullscreen
      || (target as any)?.msRequestFullscreen;
    if (typeof requestFullscreen === 'function') {
      try {
        await Promise.resolve(requestFullscreen.call(target));
      } catch (err) {
        // noop
      }
    }
    showMiniControls();
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
      <div
        ref={frameRef}
        className="memo-video-frame"
        style={frameStyle}
        onClick={handleTogglePlayback}
        onMouseEnter={showMiniControls}
        onMouseMove={showMiniControls}
      >
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
            title="Plein écran"
            onClick={handleFullscreen}
          >
            <i data-lucide="fullscreen" style={{ display: 'none' }} aria-hidden="true"></i>
            <Maximize size={14} />
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
        <div className={`memo-video-mini-controls${controlsVisible ? ' is-visible' : ''}`} aria-hidden={!controlsVisible}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={String(progressRatio)}
            className="memo-video-mini-progress"
            onClick={(event) => event.stopPropagation()}
            onInput={handleProgressInput}
            onChange={handleProgressInput}
          />
          <div className="memo-video-mini-controls__row">
            <button
              type="button"
              className="memo-video-mini-button"
              title={isPlaying ? 'Pause' : 'Lecture'}
              aria-label={isPlaying ? 'Pause' : 'Lecture'}
              onClick={handlePlayPauseButton}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <span className="memo-video-mini-time">{formatVideoTime(currentTime)}/{formatVideoTime(duration)}</span>
            <select
              className="memo-video-mini-speed"
              value={playbackRate.toFixed(1)}
              aria-label="Vitesse"
              onClick={(event) => event.stopPropagation()}
              onChange={handleSpeedChange}
            >
              {Array.from({ length: 19 }, (_, index) => ((index * 2 + 4) / 10).toFixed(1)).map((value) => (
                <option key={value} value={value}>{value}x</option>
              ))}
            </select>
            <button
              type="button"
              className="memo-video-mini-button"
              title="Télécharger"
              aria-label="Télécharger"
              onClick={handleDownload}
            >
              <Download size={14} />
            </button>
          </div>
        </div>
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
        parseHTML: element => {
          const localSrc = sanitizeUrl(element.getAttribute('data-gt-local-src'), ['gtlocal']);
          if (localSrc) {
            return sanitizeUrl(element.getAttribute('src'), ['http', 'https', 'data']) || '';
          }
          return sanitizeUrl(element.getAttribute('src'), ['http', 'https', 'data', 'gtlocal']) || null;
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
      title: { default: null },
      fileName: { default: null },
      mimeType: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      { tag: 'video[src],video[data-gt-local-src]' },
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
