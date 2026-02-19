import React from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Copy, Trash2 } from 'lucide-react';

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

const VideoNodeView = ({ node, editor, getPos }: any) => {
  const src = String(node?.attrs?.src || '');
  const canEdit = Boolean(editor?.isEditable);

  const handleDelete = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };

  return (
    <NodeViewWrapper className="memo-video-wrapper">
      <div className="memo-video-frame">
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
          className="memo-video"
          src={src}
          controls
          playsInline
          preload="metadata"
          title={String(node?.attrs?.title || '')}
        />
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
      src: { default: null },
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

