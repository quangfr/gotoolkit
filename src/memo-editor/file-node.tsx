import React from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Download, Pencil, Trash2 } from 'lucide-react';
import { sanitizeUrl } from './sanitize';

const FILE_BLOCK_FALLBACK_NAME = 'Fichier';
const SAFE_FILE_EXTENSIONS = new Set([
  'pdf',
  'txt',
  'md',
  'csv',
  'json',
  'docx',
  'xlsx',
  'pptx',
]);
const SAFE_FILE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const formatFileSize = (value: unknown) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let current = size;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  const rounded = current >= 10 || unitIndex === 0 ? Math.round(current) : Math.round(current * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
};

const FileBlockNodeView = ({ node, editor, getPos, updateAttributes }: any) => {
  const href = sanitizeUrl(node?.attrs?.src, ['http', 'https', 'blob', 'gtlocal']) || '';
  const localSrc = sanitizeUrl(node?.attrs?.localSrc, ['gtlocal']) || '';
  const [resolvedHref, setResolvedHref] = React.useState(href);
  const canEdit = Boolean(editor?.isEditable);
  const title = String(node?.attrs?.title || node?.attrs?.fileName || FILE_BLOCK_FALLBACK_NAME).trim() || FILE_BLOCK_FALLBACK_NAME;
  const fileName = String(node?.attrs?.fileName || title || FILE_BLOCK_FALLBACK_NAME).trim() || FILE_BLOCK_FALLBACK_NAME;
  const sizeLabel = formatFileSize(node?.attrs?.size);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const memoMediaStore = (window as any).goToolkitMemoMediaStore;
      const ref = String(localSrc || href);
      if (!memoMediaStore?.isLocalRef?.(ref) || !memoMediaStore?.resolveBlobUrl) {
        setResolvedHref(href);
        return;
      }
      const blobUrl = await memoMediaStore.resolveBlobUrl(ref).catch(() => '');
      if (!cancelled) {
        setResolvedHref(String(blobUrl || href));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [href, localSrc]);

  const handleDownload = React.useCallback((event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    const safeHref = String(resolvedHref || href).trim();
    if (!safeHref) return;
    const anchor = document.createElement('a');
    anchor.href = safeHref;
    anchor.download = fileName;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [fileName, href, resolvedHref]);

  const handleDelete = React.useCallback((event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
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
  }, [editor, getPos, node?.attrs?.localSrc, node?.attrs?.src]);

  return (
    <NodeViewWrapper className="memo-file-block-wrap" contentEditable={false}>
      <div className="memo-link-block memo-file-block">
        <button className="memo-link-block__handle" type="button" aria-label="Déplacer" data-drag-handle>
          <i data-lucide="grip-vertical" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="memo-link-block__main"
          onClick={handleDownload}
          aria-label={title}
        >
          <span className="memo-link-block__icon">
            <i data-lucide="file" aria-hidden="true" />
            <span className="memo-link-block__icon-overlay">
              <Download size={10} />
            </span>
          </span>
          <span className="memo-link-block__title memo-file-block__title-wrap">{title}</span>
        </button>
        <span className="memo-link-block__actions">
          {sizeLabel && <span className="memo-file-block__size">{sizeLabel}</span>}
          {canEdit && (
            <button type="button" className="memo-link-block__action" onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const pos = typeof getPos === 'function' ? getPos() : null;
              const openEditorModal = (window as any).GoToolkitMemoOpenFileBlockEditor;
              if (typeof openEditorModal === 'function' && Number.isFinite(Number(pos))) {
                openEditorModal({
                  pos,
                  title,
                  href,
                  fileName,
                  size: Number(node?.attrs?.size || 0) || 0,
                });
                return;
              }
              updateAttributes?.({ title });
            }} aria-label="Modifier">
              <Pencil size={13} />
            </button>
          )}
          <button type="button" className="memo-link-block__action" onClick={handleDownload} aria-label="Télécharger">
            <Download size={13} />
          </button>
          {canEdit && (
            <button type="button" className="memo-link-block__action" onClick={handleDelete} aria-label="Supprimer">
              <Trash2 size={13} />
            </button>
          )}
        </span>
      </div>
    </NodeViewWrapper>
  );
};

export const FileBlock = Node.create({
  name: 'fileBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: element => sanitizeUrl(element.getAttribute('data-href') || element.getAttribute('href'), ['http', 'https', 'blob', 'gtlocal']) || null,
        renderHTML: attributes => {
          const src = sanitizeUrl(attributes.src, ['http', 'https', 'blob']);
          return src ? { 'data-href': src } : {};
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
      title: { default: FILE_BLOCK_FALLBACK_NAME },
      fileName: { default: FILE_BLOCK_FALLBACK_NAME },
      mimeType: { default: 'application/octet-stream' },
      size: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="memo-file-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const href = sanitizeUrl(HTMLAttributes.src || HTMLAttributes['data-href'], ['http', 'https', 'blob']) || '';
    const title = String(HTMLAttributes.title || HTMLAttributes.fileName || FILE_BLOCK_FALLBACK_NAME).trim() || FILE_BLOCK_FALLBACK_NAME;
    const fileName = String(HTMLAttributes.fileName || title || FILE_BLOCK_FALLBACK_NAME).trim() || FILE_BLOCK_FALLBACK_NAME;
    const mimeType = String(HTMLAttributes.mimeType || '').trim();
    const size = Number(HTMLAttributes.size || 0) || 0;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'memo-file-block',
        'data-file-name': fileName,
        'data-mime-type': mimeType,
        'data-size': String(size),
      }),
      [
        'a',
        {
          href,
          download: fileName,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        title,
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileBlockNodeView);
  },
});

export const getFileExtension = (fileName: string) => {
  const lower = String(fileName || '').trim().toLowerCase();
  const parts = lower.split('.');
  return parts.length > 1 ? String(parts.pop() || '').trim() : '';
};

export const isSupportedGenericFile = (file: File) => {
  if (!(file instanceof File)) return false;
  if (Number(file.size || 0) <= 0) return false;
  const extension = getFileExtension(file.name || '');
  const mimeType = String(file.type || '').trim().toLowerCase();
  if (extension && SAFE_FILE_EXTENSIONS.has(extension)) return true;
  return mimeType ? SAFE_FILE_MIME_TYPES.has(mimeType) : false;
};
