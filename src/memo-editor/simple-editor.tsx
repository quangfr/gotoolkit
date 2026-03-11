import React from 'react';
import { useEditor, EditorContent, Editor, ReactRenderer, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Extension, markInputRule, mergeAttributes } from '@tiptap/core';
import { Node as TiptapNode } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import TiptapUnderline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import TiptapLink from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { computePosition, offset, shift } from '@floating-ui/dom';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { TableOfContents } from '@tiptap/extension-table-of-contents';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import CodeBlock from '@tiptap/extension-code-block';

import { TableNode, TableRow, TableHeader, CustomTableCell } from './table-node';
import { columnResizingWithMaxPluginKey } from './table-resize';
import { TaskListNode, TaskItemNode } from './task-node';
import { sanitizeHtml, sanitizeUrl } from './sanitize';


const CustomCode = Code.extend({
  excludes: '',
  inclusive: false,
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)(`([^`]+)`)$/,
        type: this.type,
      }),
    ]
  },
});
import { 
  Undo2, Redo2, Heading1, Heading2, Heading3, List, SquareCode, 
  Bold, Italic, Underline, Link, Strikethrough,
  Highlighter, Table as TableIcon, Trash2, CodeXml,
  ChevronDown, Check, CheckCheck, Type,
  Bot, X, Plus, Baseline, Shapes, Quote,
  CheckSquare,
  Pencil, Copy, Image as ImageIcon, Clapperboard,
  Square, RectangleHorizontal, Tag,
  ArrowDownAZ, ArrowUpAZ, ArrowUpRight, Link2, ListTree, FolderTree, ListOrdered, File as FileIcon
  , ArrowUp
} from 'lucide-react';



const CustomHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: element => element.getAttribute('id'),
        renderHTML: attributes => ({
          id: attributes.id,
        }),
      },
      collapsed: {
        default: false,
        parseHTML: element => element.getAttribute('data-collapsed') === 'true',
        renderHTML: attributes => ({
          'data-collapsed': attributes.collapsed,
        }),
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          const { tr } = newState;
          let modified = false;

          if (transactions.some(transaction => transaction.docChanged)) {
            newState.doc.descendants((node, pos) => {
              if (node.type.name === 'heading' && !node.attrs.id) {
                const id = `h-${Math.random().toString(36).substr(2, 6)}`;
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  id,
                });
                modified = true;
              }
            });
          }

          return modified ? tr : null;
        },
      }),
      new Plugin({
        key: new PluginKey('heading-folding'),
        props: {
          decorations(state) {
            const decorations: any[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === 'heading' && node.attrs.collapsed) {
                const level = node.attrs.level;
                const docSize = state.doc.content.size;
                let end = docSize;
                
                // Find the next heading of the same or higher level
                state.doc.nodesBetween(pos + node.nodeSize, docSize, (nextChild, nextPos) => {
                  if (end !== docSize) return false;
                  if (nextChild.isBlock && nextChild.type.name === 'heading' && nextChild.attrs.level <= level) {
                    end = nextPos;
                    return false;
                  }
                  return true;
                });
                
                // Hide all top-level blocks in this range
                let currentPos = pos + node.nodeSize;
                while (currentPos < end) {
                  const childNode = state.doc.nodeAt(currentPos);
                  if (!childNode) break;
                  decorations.push(Decoration.node(currentPos, currentPos + childNode.nodeSize, {
                    style: 'display: none',
                    class: 'collapsed-node'
                  }));
                  currentPos += childNode.nodeSize;
                }
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node, editor, getPos }) => {
      React.useEffect(() => {
        // no-op
      }, []);
      const level = Math.min(4, Math.max(1, node.attrs.level || 1));
      const tag = `h${level}` as any;
      const collapsed = node.attrs.collapsed;

      const toggleCollapse = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === 'function') {
          const pos = getPos();
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            collapsed: !collapsed
          }));
        }
      };

      return (
        <NodeViewWrapper className={`node-heading-wrapper ${collapsed ? 'is-collapsed' : ''}`}>
          <button 
            className="heading-collapse-toggle" 
            onClick={toggleCollapse}
            contentEditable={false}
            title={collapsed ? "Déplier" : "Réduire"}
          >
            {collapsed ? '▶' : '◢'}
          </button>
          <NodeViewContent as={tag} className="node-text" />
        </NodeViewWrapper>
      );
    }, {
      // Headings must contain phrasing content. The default block-level contentDOM
      // element is a div, which produces invalid h1/h2/h3 markup and can break
      // mutation tracking / persistence for edited heading text.
      contentDOMElementTag: 'span',
    });
  },
});

const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: {
        default: 'node-text node-paragraph',
        renderHTML: attributes => {
          return {
            class: attributes.class,
          };
        },
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'p' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

import { exportEditorToDocx } from './docx-export';

const hasAncestorNode = ($pos: any, typeName: string) => {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === typeName) return true;
  }
  return false;
};

const getLinkMarkAtCursor = (editor: Editor) => {
  const linkMark = editor.state.schema.marks.link;
  if (!linkMark) return null;
  const { from, empty } = editor.state.selection;
  if (!empty) return null;
  const $pos = editor.state.doc.resolve(from);
  const parent = $pos.parent;
  const parentStart = $pos.start();
  const segments: Array<{ index: number; from: number; to: number; text: string; href: string }> = [];
  let targetIndex = -1;

  parent.forEach((node, offset, index) => {
    if (!node.isText) return;
    const href = String(node.marks.find((item: any) => item.type === linkMark)?.attrs?.href || '').trim();
    if (!href) return;
    const nodeFrom = parentStart + offset;
    const nodeTo = nodeFrom + node.nodeSize;
    segments.push({ index, from: nodeFrom, to: nodeTo, text: node.text || '', href });
    if (from >= nodeFrom && from <= nodeTo) targetIndex = segments.length - 1;
  });

  if (targetIndex < 0) return null;
  const targetHref = segments[targetIndex].href;
  let first = targetIndex;
  let last = targetIndex;

  while (first > 0 && segments[first - 1].index === segments[first].index - 1 && segments[first - 1].href === targetHref) {
    first -= 1;
  }
  while (last < segments.length - 1 && segments[last + 1].index === segments[last].index + 1 && segments[last + 1].href === targetHref) {
    last += 1;
  }

  const text = segments.slice(first, last + 1).map((item) => item.text).join('');
  const rangeFrom = segments[first].from;
  const rangeTo = segments[last].to;

  if (!text) return null;
  return {
    href: targetHref,
    text,
    from: rangeFrom,
    to: rangeTo,
  };
};

const getSelectionLinkContext = (editor: Editor) => {
  const linkMark = editor.state.schema.marks.link;
  if (!linkMark) return null;
  const { from, to, empty } = editor.state.selection;

  if (empty) {
    return getLinkMarkAtCursor(editor);
  }

  let href = '';
  let text = '';
  let coveredFrom = from;
  let coveredTo = to;

  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((item: any) => item.type === linkMark);
    if (!mark) return;
    if (!href) href = String(mark.attrs?.href || '').trim();
    if (href !== String(mark.attrs?.href || '').trim()) return false;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (start >= end) return;
    if (!text) coveredFrom = start;
    coveredTo = end;
    text += (node.text || '').slice(start - pos, end - pos);
  });

  if (!href || !text) return null;
  return { href, text, from: coveredFrom, to: coveredTo };
};

const getScrollableAncestors = (element: HTMLElement | null): HTMLElement[] => {
  const scrollables: HTMLElement[] = [];
  let current = element?.parentElement || null;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const canScroll =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight + 1;
    if (canScroll) scrollables.push(current);
    current = current.parentElement;
  }
  return scrollables;
};

const getDiagramHeaderLine = (code: string) => {
  const lines = (code || '').split('\n');
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;
    return line;
  }
  return '';
};

const EDITOR_SPELLCHECK_STORAGE_KEY = 'go-toolkit-editor-spellcheck';
const EDITOR_SPELLCHECK_EVENT = 'go-toolkit:editor-spellcheck-changed';

const normalizeEditorSpellcheckMode = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fr' || normalized === 'off') return normalized;
  return 'auto';
};

const readEditorSpellcheckMode = () => {
  const fromGlobal = (window as any).GoToolkitEditorSpellcheckMode;
  if (fromGlobal != null) return normalizeEditorSpellcheckMode(fromGlobal);
  try {
    const fromLocal = window.localStorage.getItem(EDITOR_SPELLCHECK_STORAGE_KEY);
    if (fromLocal != null) return normalizeEditorSpellcheckMode(fromLocal);
  } catch (err) {
    // ignore
  }
  return 'auto';
};

const applyEditorSpellcheckPreferences = (editor: Editor | null) => {
  const dom = editor?.view?.dom as HTMLElement | undefined;
  if (!dom) return;
  const mode = readEditorSpellcheckMode();
  const enabled = mode !== 'off';
  const lang = !enabled
    ? ''
    : (mode === 'fr' ? 'fr' : '');
  dom.spellcheck = enabled;
  dom.setAttribute('spellcheck', enabled ? 'true' : 'false');
  dom.setAttribute('autocorrect', enabled ? 'on' : 'off');
  dom.setAttribute('autocapitalize', enabled ? 'sentences' : 'off');
  if (lang) {
    dom.setAttribute('lang', lang);
  } else {
    dom.removeAttribute('lang');
  }
};

const isFlowchartDiagram = (code: string) => {
  const header = getDiagramHeaderLine(code).toLowerCase();
  return header.startsWith('flowchart') || header.startsWith('graph');
};

const decodeMermaidAttrCode = (value: unknown) => {
  const text = String(value || '');
  if (!text) return '';
  try {
    const decoded = decodeURIComponent(text);
    const textarea = document.createElement('textarea');
    textarea.innerHTML = decoded;
    return textarea.value || decoded;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value || text;
  }
};

const hasInlineMarkdownSyntax = (value: string) => {
  const text = String(value || '');
  if (!text) return false;
  return /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)]+\))/m.test(text);
};

const unescapeMarkdownLiteralEscapes = (value: string) => {
  const text = String(value || '');
  if (!text) return '';
  return text.replace(/\\([\\`*_[\]{}()#+\-.!|~])/g, '$1');
};

const setFlowchartDirection = (code: string, direction: string) => {
  const lines = (code || '').split('\n');
  let updated = false;
  const maxLines = Math.min(lines.length, 8);
  let targetIndex = -1;
  for (let i = 0; i < maxLines; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;
    if (/^(flowchart|graph)\b/i.test(line)) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex !== -1) {
    const rawLine = lines[targetIndex];
    const directionMatch = rawLine.match(/(flowchart|graph)\s+(LR|TD|TB|BT|RL)/i);
    if (directionMatch) {
      lines[targetIndex] = rawLine.replace(/(flowchart|graph)\s+(LR|TD|TB|BT|RL)/i, `$1 ${direction}`);
    } else {
      lines[targetIndex] = rawLine.replace(/(flowchart|graph)/i, `$1 ${direction}`);
    }
    updated = true;
  }
  return { code: lines.join('\n'), updated };
};

const selectTableCellText = (view: any, pos: number) => {
  const { state } = view;
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const cellPos = $pos.before(depth);
      const from = cellPos + 1;
      const to = cellPos + node.nodeSize - 1;
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
      return true;
    }
  }
  return false;
};

const CustomBulletList = BulletList.extend({
  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'node-text' }), 0];
  },
});

const CustomOrderedList = OrderedList.extend({
  renderHTML({ HTMLAttributes }) {
    return ['ol', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'node-text' }), 0];
  },
});

const CustomCodeBlock = CodeBlock.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'node-text node-codeBlock' }),
      ['code', {}, 0],
    ];
  },
});

const LinkSearchModal = ({
  editor,
  onClose,
  anchorPos,
  selectionRange,
  containerRef,
  initialQuery,
  initialLabel,
}: {
  editor: Editor,
  onClose: () => void,
  anchorPos: number,
  selectionRange: { from: number; to: number },
  containerRef: React.RefObject<HTMLDivElement | null>,
  initialQuery?: string,
  initialLabel?: string,
}) => {
  const [query, setQuery] = React.useState(initialQuery || '');
  const [label, setLabel] = React.useState(initialLabel || '');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [documents, setDocuments] = React.useState<any[]>([]);
  const modalRef = React.useRef<HTMLDivElement>(null);
  const queryInputRef = React.useRef<HTMLInputElement>(null);
  const [modalStyle, setModalStyle] = React.useState<React.CSSProperties>({
    position: 'absolute',
    zIndex: 2000,
    visibility: 'hidden',
  });

  React.useEffect(() => {
    setQuery(initialQuery || '');
  }, [initialQuery]);

  React.useEffect(() => {
    setLabel(initialLabel || '');
  }, [initialLabel]);

  React.useEffect(() => {
    let cancelled = false;
    const loadDocuments = async () => {
      const rows: any[] = [];
      try {
        const localDocs = await (window as any).goToolkitDocumentApi?.getAllRecords?.();
        (Array.isArray(localDocs) ? localDocs : [])
          .filter((item: any) => item && item.app === 'memo')
          .forEach((item: any) => rows.push({
            type: 'document',
            id: String(item.id || ''),
            title: String(item.title || item.payload?.tabs?.[0]?.title || 'Nouvelle page'),
            icon: String(item.icon || ''),
            section: 'private',
            updatedAt: String(item.updatedAt || '')
          }));
      } catch (err) {
        // ignore
      }
      try {
        const shared = await (window as any).goToolkitShareHistory?.getRecordsByApp?.('memo');
        (Array.isArray(shared) ? shared : []).forEach((item: any) => rows.push({
          type: 'document',
          id: `share:${String(item.token || '')}`,
          title: String(item.title || 'Document partagé'),
          icon: String(item.icon || 'file-symlink'),
          section: 'shared',
          updatedAt: String(item.updatedAt || '')
        }));
      } catch (err) {
        // ignore
      }
      try {
        const common = await (window as any).goToolkitTemplateStore?.list?.();
        (Array.isArray(common) ? common : []).forEach((item: any) => rows.push({
          type: 'document',
          id: `common:${String(item.id || '')}`,
          title: String(item.label || 'Commun'),
          icon: String(item.icon || ''),
          section: 'common',
          updatedAt: String(item.updatedAt || '')
        }));
      } catch (err) {
        // ignore
      }
      const deduped = new Map<string, any>();
      rows.forEach(row => {
        if (!row?.id) return;
        if (!deduped.has(row.id)) deduped.set(row.id, row);
      });
      const sorted = Array.from(deduped.values()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      if (!cancelled) setDocuments(sorted);
    };
    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateModalPosition = React.useCallback(() => {
    const { view } = editor;
    const from = Math.max(1, Math.min(anchorPos || 1, editor.state.doc.content.size));
    const host = containerRef.current;
    const modal = modalRef.current;
    if (!host || !modal) return;

    // Fallback if coordsAtPos fails (e.g. selection at very end)
    let coords;
    try {
      coords = view.coordsAtPos(from);
    } catch (e) {
      const hostRect = host.getBoundingClientRect();
      coords = { left: hostRect.left + 20, top: hostRect.top + 20 };
    }
    const hostRect = host.getBoundingClientRect();
    const padding = 10;
    const caretLeftInHost = coords.left - hostRect.left;
    const caretTopInHost = coords.top - hostRect.top;
    const caretBottomInHost = (coords.bottom ?? coords.top) - hostRect.top;
    const modalWidth = modal.offsetWidth || 450;
    const modalHeight = modal.offsetHeight || 320;
    const minLeft = padding;
    const maxLeft = Math.max(minLeft, host.clientWidth - modalWidth - padding);
    const nextLeft = Math.min(Math.max(caretLeftInHost, minLeft), maxLeft);

    const aboveTop = caretTopInHost - modalHeight - 8;
    const belowTop = caretBottomInHost + 8;
    const minTop = padding;
    const maxTop = Math.max(minTop, host.clientHeight - modalHeight - padding);

    // Prefer opening above the caret to keep the selector visible and out of the typing flow.
    const preferredTop = aboveTop >= minTop ? aboveTop : belowTop;
    const nextTop = Math.min(Math.max(preferredTop, minTop), maxTop);

    setModalStyle({
      position: 'absolute',
      zIndex: 2000,
      left: `${nextLeft}px`,
      top: `${nextTop}px`,
      visibility: 'visible',
    });
  }, [anchorPos, containerRef, editor]);

  React.useLayoutEffect(() => {
    updateModalPosition();

    const onLayoutChange = () => updateModalPosition();
    window.addEventListener('resize', onLayoutChange);
    const host = containerRef.current;
    host?.addEventListener('scroll', onLayoutChange, true);

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', onLayoutChange);
      host?.removeEventListener('scroll', onLayoutChange, true);
    };
  }, [containerRef, onClose, updateModalPosition]);

  const isUrl = (str: string) => {
    const value = String(str || '').trim().toLowerCase();
    if (!value) return false;
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('memo://')) return true;
    if (value.startsWith('www.')) return true;
    const pattern = /^([\da-z.-]+)\.([a-z.]{2,})([\/\w .~%:#?&=+-]*)*\/?$/;
    return pattern.test(value);
  };

  const filteredDocs = documents
    .filter((d: any) => String(d?.title || '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);

  const queryTrimmed = String(query || '').trim();
  const hasUrlQuery = isUrl(queryTrimmed);
  const items = [
    ...filteredDocs,
    ...(hasUrlQuery ? [{
      type: 'url',
      title: queryTrimmed,
      isValid: true
    }] : [])
  ];

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [queryTrimmed, hasUrlQuery]);

  React.useEffect(() => {
    queryInputRef.current?.focus();
    queryInputRef.current?.select();
  }, []);

  const handleSelect = (item: any) => {
    let url = item.type === 'document' ? `memo://${item.id}` : item.title;
    if (item.type === 'url' && !url.startsWith('http') && !url.startsWith('#') && !url.startsWith('memo://')) {
      url = 'https://' + url;
    }
    const safeUrl = sanitizeUrl(
      url,
      item.type === 'document' ? ['memo'] : ['http', 'https', 'memo'],
      { allowRelative: item.type !== 'document' }
    );

    const from = Math.max(1, Math.min(selectionRange?.from ?? editor.state.selection.from, editor.state.doc.content.size));
    const to = Math.max(from, Math.min(selectionRange?.to ?? editor.state.selection.to, editor.state.doc.content.size));
    const finalLabel = String(label || '').trim() || (item.type === 'document' ? String(item.title || 'Document') : queryTrimmed);

    if (item.type !== 'document') {
      const insertedEmbed = insertExternalEmbedAtSelection(editor, from, to, item.title);
      if (insertedEmbed) {
        onClose();
        return;
      }
      if (isExternalVideoCandidateUrl(item.title)) {
        editor.chain().focus().insertContentAt({ from, to }, item.title).run();
        onClose();
        return;
      }
    }
    if (!safeUrl) {
      onClose();
      return;
    }

    const contentToInsert: any[] = [
      {
        type: 'text',
        text: finalLabel,
        marks: [{ type: 'link', attrs: { href: safeUrl } }, { type: 'textStyle', attrs: { color: 'var(--color-primary)' } }]
      }
    ];
    if (from === to) {
      contentToInsert.push({ type: 'text', text: ' ' });
    }

    editor.chain().focus().insertContentAt({ from, to }, contentToInsert).run();
    onClose();
  };

  const handleSubmit = () => {
    if (items[selectedIndex]) {
      handleSelect(items[selectedIndex]);
      return;
    }
    if (!queryTrimmed) return;
    handleSelect({ type: 'url', title: queryTrimmed });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'query' | 'label') => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (field === 'query' && e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
      return;
    }
    if (field === 'query' && e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  };

  return (
    <div 
      ref={modalRef} 
      className="link-search-modal"
      style={modalStyle}
    >
      <input
        ref={queryInputRef}
        type="text"
        value={query}
        className="link-search-modal__search-input"
        placeholder="Rechercher une page ou coller une URL"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => handleInputKeyDown(e, 'query')}
      />
      <input
        type="text"
        value={label}
        className={`link-search-modal__query ${String(label || '').trim() ? 'has-value' : ''}`}
        placeholder="Libellé du lien"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => handleInputKeyDown(e, 'label')}
      />
      <div className="link-search-results">
        {items.map((item, i) => (
          <div 
            key={i}
            className={`link-search-item ${i === selectedIndex ? 'selected' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => handleSelect(item)}
          >
            <div className="link-search-item-info">
              <div className="link-search-item-title">
                {item.type === 'url' ? <Link size={12} style={{ marginRight: 8, opacity: 0.6 }} /> : <Link size={12} style={{ marginRight: 8, opacity: 0.6 }} />}
                {item.title}
              </div>
              {item.type === 'document' && <div className="link-search-item-path">{item.section === 'shared' ? 'Partagé' : item.section === 'common' ? 'Commun' : 'Privé'}</div>}
            </div>
            <div className="link-search-item-action">
              <Check size={14} />
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="link-search-no-results">
            Aucun titre trouvé
          </div>
        )}
      </div>
    </div>
  );
};

const FileSearchModal = ({
  editor,
  onClose,
  anchorPos,
  selectionRange,
  containerRef,
  initialLabel,
  onUploadFiles,
}: {
  editor: Editor,
  onClose: () => void,
  anchorPos: number,
  selectionRange: { from: number; to: number },
  containerRef: React.RefObject<HTMLDivElement | null>,
  initialLabel?: string,
  onUploadFiles: (files: File[]) => Promise<Array<Record<string, any>>>,
}) => {
  const [query, setQuery] = React.useState('');
  const [label, setLabel] = React.useState(initialLabel || '');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const modalRef = React.useRef<HTMLDivElement>(null);
  const queryInputRef = React.useRef<HTMLInputElement>(null);
  const [modalStyle, setModalStyle] = React.useState<React.CSSProperties>({
    position: 'absolute',
    zIndex: 2000,
    visibility: 'hidden',
  });

  React.useEffect(() => {
    setLabel(initialLabel || '');
  }, [initialLabel]);

  React.useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      setLoading(true);
      const nextItems: any[] = [];
      const memoMediaStore = (window as any).goToolkitMemoMediaStore;
      const currentSpaceId = String((window as any).GoToolkitSpaces?.getCurrentSpaceId?.() || 'golive').trim().toLowerCase() || 'golive';
      const baseUrl = String((window as any).goToolkitShareWorker?.baseUrl || '').trim();
      const localAssets = await memoMediaStore?.list?.().catch(() => []) || [];
      localAssets.forEach((entry: any) => {
        const fileName = String(entry?.fileName || '').trim();
        const mimeType = String(entry?.mimeType || '').trim().toLowerCase();
        if (!fileName || !isSupportedGenericFile(new File(['x'], fileName, { type: mimeType || 'application/octet-stream' }))) return;
        const localRef = memoMediaStore?.createRef?.(entry?.id);
        const href = String(localRef || entry?.sourceUrl || '').trim();
        if (!href) return;
        nextItems.push({
          id: `local:${String(entry?.id || '')}`,
          source: 'local',
          href,
          fileName,
          title: fileName,
          size: Number(entry?.size || entry?.blob?.size || 0),
          ext: getFileExtension(fileName).toUpperCase(),
          mimeType,
        });
      });
      if ((window as any).goToolkitShareWorker?.listAssets) {
        const listed = await (window as any).goToolkitShareWorker.listAssets({ spaceId: currentSpaceId }).catch(() => ({ assets: [] }));
        const remoteAssets = Array.isArray(listed?.assets) ? listed.assets : [];
        remoteAssets.forEach((asset: any) => {
          const objectName = String(asset?.objectName || '').trim();
          const fileName = objectName.split('/').pop()?.replace(/^[a-f0-9]+-/, '') || '';
          const mimeType = String(asset?.mimeType || '').trim().toLowerCase();
          if (!fileName || !isSupportedGenericFile(new File(['x'], fileName, { type: mimeType || 'application/octet-stream' }))) return;
          const href = asset?.url || (baseUrl && asset?.id ? (window as any).goToolkitShareWorker?.buildAssetUrl?.(asset.id) || `${baseUrl}/v1/assets/${encodeURIComponent(asset.id)}` : '');
          if (!href) return;
          nextItems.push({
            id: `remote:${String(asset?.id || '')}`,
            source: 'remote',
            href,
            fileName,
            title: fileName,
            size: Number(asset?.size || 0),
            ext: getFileExtension(fileName).toUpperCase(),
            mimeType,
          });
        });
      }
      const deduped = new Map<string, any>();
      nextItems.forEach((item) => {
        const key = `${String(item?.href || '')}|${String(item?.fileName || '')}`;
        if (!deduped.has(key)) deduped.set(key, item);
      });
      if (!cancelled) {
        setItems(Array.from(deduped.values()));
        setLoading(false);
      }
    };
    void loadItems();
    return () => { cancelled = true; };
  }, []);

  const updateModalPosition = React.useCallback(() => {
    const { view } = editor;
    const from = Math.max(1, Math.min(anchorPos || 1, editor.state.doc.content.size));
    const host = containerRef.current;
    const modal = modalRef.current;
    if (!host || !modal) return;
    let coords;
    try {
      coords = view.coordsAtPos(from);
    } catch {
      const hostRect = host.getBoundingClientRect();
      coords = { left: hostRect.left + 20, top: hostRect.top + 20 };
    }
    const hostRect = host.getBoundingClientRect();
    const padding = 10;
    const caretLeftInHost = coords.left - hostRect.left;
    const caretTopInHost = coords.top - hostRect.top;
    const caretBottomInHost = (coords.bottom ?? coords.top) - hostRect.top;
    const modalWidth = modal.offsetWidth || 520;
    const modalHeight = modal.offsetHeight || 360;
    const nextLeft = Math.min(Math.max(caretLeftInHost, padding), Math.max(padding, host.clientWidth - modalWidth - padding));
    const aboveTop = caretTopInHost - modalHeight - 8;
    const belowTop = caretBottomInHost + 8;
    const preferredTop = aboveTop >= padding ? aboveTop : belowTop;
    const nextTop = Math.min(Math.max(preferredTop, padding), Math.max(padding, host.clientHeight - modalHeight - padding));
    setModalStyle({
      position: 'absolute',
      zIndex: 2000,
      left: `${nextLeft}px`,
      top: `${nextTop}px`,
      visibility: 'visible',
    });
  }, [anchorPos, containerRef, editor]);

  React.useLayoutEffect(() => {
    updateModalPosition();
    const onLayoutChange = () => updateModalPosition();
    window.addEventListener('resize', onLayoutChange);
    const host = containerRef.current;
    host?.addEventListener('scroll', onLayoutChange, true);
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', onLayoutChange);
      host?.removeEventListener('scroll', onLayoutChange, true);
    };
  }, [containerRef, onClose, updateModalPosition]);

  React.useEffect(() => {
    queryInputRef.current?.focus();
  }, []);

  const filteredItems = React.useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => {
      const haystack = [
        item?.title,
        item?.fileName,
        item?.ext,
        item?.mimeType,
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, query]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query, items.length]);

  const insertFileNode = React.useCallback((item: any) => {
    const from = Math.max(1, Math.min(selectionRange?.from ?? editor.state.selection.from, editor.state.doc.content.size));
    const to = Math.max(from, Math.min(selectionRange?.to ?? editor.state.selection.to, editor.state.doc.content.size));
    const finalLabel = String(label || '').trim() || String(item?.fileName || item?.title || 'Fichier').trim() || 'Fichier';
    editor.chain().focus().insertContentAt({ from, to }, {
      type: 'fileBlock',
      attrs: {
        src: String(item?.href || '').trim(),
        localSrc: String(item?.source === 'local' && String(item?.href || '').startsWith('gtlocal://') ? item.href : '').trim(),
        title: finalLabel,
        fileName: String(item?.fileName || finalLabel).trim() || finalLabel,
        mimeType: String(item?.mimeType || '').trim(),
        size: Number(item?.size || 0) || 0,
      },
    }).run();
    onClose();
  }, [editor, label, onClose, selectionRange]);

  const insertMultipleFileNodes = React.useCallback((entries: any[]) => {
    const from = Math.max(1, Math.min(selectionRange?.from ?? editor.state.selection.from, editor.state.doc.content.size));
    const to = Math.max(from, Math.min(selectionRange?.to ?? editor.state.selection.to, editor.state.doc.content.size));
    const content = (Array.isArray(entries) ? entries : []).flatMap((item, index) => {
      const finalLabel = (index === 0 && String(label || '').trim())
        ? String(label || '').trim()
        : (String(item?.fileName || item?.title || 'Fichier').trim() || 'Fichier');
      const node = {
        type: 'fileBlock',
        attrs: {
          src: String(item?.href || '').trim(),
          localSrc: String(item?.source === 'local' && String(item?.href || '').startsWith('gtlocal://') ? item.href : '').trim(),
          title: finalLabel,
          fileName: String(item?.fileName || finalLabel).trim() || finalLabel,
          mimeType: String(item?.mimeType || '').trim(),
          size: Number(item?.size || 0) || 0,
        },
      };
      return index === 0 ? [node] : [{ type: 'paragraph' }, node];
    });
    if (!content.length) return;
    editor.chain().focus().insertContentAt({ from, to }, content).run();
    onClose();
  }, [editor, label, onClose, selectionRange]);

  const handleUpload = React.useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []).filter(isSupportedGenericFile);
      if (!files.length) return;
      const created = await onUploadFiles(files);
      if (!created.length) return;
      insertMultipleFileNodes(created);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [insertMultipleFileNodes, onUploadFiles]);

  const handleSubmit = React.useCallback(() => {
    if (filteredItems[selectedIndex]) {
      insertFileNode(filteredItems[selectedIndex]);
    }
  }, [filteredItems, insertFileNode, selectedIndex]);

  const renderItem = (item: any, index: number) => (
    <div
      key={item.id || index}
      className={`link-search-item ${index === selectedIndex ? 'selected' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseEnter={() => setSelectedIndex(index)}
      onClick={() => insertFileNode(item)}
    >
      <div className="link-search-item-info">
        <div className="link-search-item-title memo-file-search-item-title">
          <span className="memo-file-search-item__ext">{item.ext || 'FILE'}</span>
          <span>{item.fileName}</span>
        </div>
        <div className="link-search-item-path">{item.source === 'remote' ? 'Cloud' : 'Local'}</div>
      </div>
      <div className="link-search-item-action memo-file-search-item__size">
        {formatFileSize(item.size)}
      </div>
    </div>
  );

  return (
    <div ref={modalRef} className="link-search-modal memo-file-search-modal" style={modalStyle}>
      <input
        ref={queryInputRef}
        type="text"
        value={query}
        className="link-search-modal__search-input"
        placeholder="Rechercher un fichier"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === 'ArrowDown' && filteredItems.length) {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
            return;
          }
          if (e.key === 'ArrowUp' && filteredItems.length) {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <input
        type="text"
        value={label}
        className={`link-search-modal__query ${String(label || '').trim() ? 'has-value' : ''}`}
        placeholder="Libellé du fichier"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="memo-file-search-modal__toolbar">
        <button type="button" className="memo-file-search-modal__upload" onMouseDown={(e) => e.preventDefault()} onClick={handleUpload}>
          Ajouter un fichier
        </button>
      </div>
      <div className="link-search-results">
        {loading && <div className="link-search-no-results">Chargement…</div>}
        {!loading && filteredItems.map(renderItem)}
        {!loading && !filteredItems.length && (
          <div className="link-search-no-results">Aucun fichier trouvé</div>
        )}
      </div>
    </div>
  );
};

const MemoLinkBlockView = ({ node, editor, getPos, updateAttributes }: any) => {
  const href = String(node?.attrs?.href || '');
  const title = String(node?.attrs?.title || 'Document');
  const icon = String(node?.attrs?.icon || '');
  const documentId = String(node?.attrs?.documentId || '');
  const canEdit = Boolean(editor?.isEditable);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(title);
  const [resolvedTitle, setResolvedTitle] = React.useState(title);
  const [resolvedIcon, setResolvedIcon] = React.useState(icon);
  const iconRef = React.useRef<HTMLSpanElement | null>(null);
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setDraftTitle(title);
    setResolvedTitle(title);
  }, [title]);
  React.useEffect(() => {
    setResolvedIcon(icon);
  }, [icon]);

  React.useEffect(() => {
    if (!isEditingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);
  React.useEffect(() => {
    try {
      (window as any).lucide?.createIcons?.({
        attrs: {
          width: '14',
          height: '14'
        },
        elements: iconRef.current ? [iconRef.current] : undefined
      });
    } catch (err) {
      // ignore
    }
  }, [icon]);
  React.useEffect(() => {
    let cancelled = false;
    const resolveTarget = async () => {
      const resolver = (window as any).GoToolkitMemoResolveLinkTarget;
      const targetId = documentId || href.replace(/^memo:\/\//, '');
      if (!targetId || typeof resolver !== 'function') return;
      try {
        const target = await resolver(targetId);
        if (cancelled || !target) return;
        const nextTitle = String(target?.title || '').trim() || title || 'Document';
        const nextIcon = String(target?.icon || '').trim();
        setResolvedTitle(nextTitle);
        setResolvedIcon(nextIcon || icon);
        if (typeof updateAttributes === 'function') {
          const patch: Record<string, string> = {};
          if (nextTitle && nextTitle !== title) patch.title = nextTitle;
          if (nextIcon !== icon) patch.icon = nextIcon;
          if (Object.keys(patch).length) {
            updateAttributes(patch);
          }
        }
      } catch (err) {
        // ignore
      }
    };
    const onTargetsUpdated = (event: Event) => {
      const detailIds = (event as CustomEvent)?.detail?.ids;
      if (!Array.isArray(detailIds) || !detailIds.length) {
        void resolveTarget();
        return;
      }
      const targetId = documentId || href.replace(/^memo:\/\//, '');
      if (targetId && detailIds.map((value: any) => String(value || '').trim()).includes(targetId)) {
        void resolveTarget();
      }
    };
    void resolveTarget();
    window.addEventListener('goToolkitMemoLinkTargetsUpdated', onTargetsUpdated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('goToolkitMemoLinkTargetsUpdated', onTargetsUpdated as EventListener);
    };
  }, [documentId, href, icon, title, updateAttributes]);

  const handleOpen = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const open = (window as any).GoToolkitMemoOpenDocumentByLink;
    if (typeof open === 'function') {
      open(documentId || href.replace(/^memo:\/\//, ''));
    } else if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };
  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const markdown = `[${title}](${href})`;
    try {
      let copiedRich = false;
      if (typeof getPos === 'function') {
        const pos = getPos();
        const nodeAtPos = editor?.state?.doc?.nodeAt?.(pos);
        if (nodeAtPos) {
          const slice = editor.state.doc.slice(pos, pos + nodeAtPos.nodeSize);
          const serializer = DOMSerializer.fromSchema(editor.state.schema);
          const fragment = serializer.serializeFragment(slice.content);
          const tmp = document.createElement('div');
          tmp.appendChild(fragment);
          const html = tmp.innerHTML.trim();
          if (html && navigator.clipboard && typeof (navigator.clipboard as any).write === 'function' && typeof (window as any).ClipboardItem === 'function') {
            const item = new (window as any).ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([markdown], { type: 'text/plain' }),
            });
            await (navigator.clipboard as any).write([item]);
            copiedRich = true;
          }
        }
      }
      if (!copiedRich) {
        await navigator.clipboard.writeText(markdown);
      }
    } catch (err) {
      // ignore
    }
  };
  const handleDelete = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView();
    editor.view.dispatch(tr);
    editor.view.focus();
  };
  const commitTitle = React.useCallback(() => {
    const nextTitle = String(draftTitle || '').trim() || 'Document';
    setIsEditingTitle(false);
    if (nextTitle === title) return;
    if (typeof updateAttributes === 'function') {
      updateAttributes({ title: nextTitle });
    }
  }, [draftTitle, title, updateAttributes]);

  const cancelTitleEdit = React.useCallback(() => {
    setDraftTitle(title);
    setIsEditingTitle(false);
  }, [title]);
  const handleMainClick = React.useCallback((event: React.MouseEvent) => {
    if (isEditingTitle) return;
    event.preventDefault();
    event.stopPropagation();
  }, [isEditingTitle]);

  return (
    <NodeViewWrapper className="memo-link-block-wrap" contentEditable={false}>
      <div
        className="memo-link-block"
        data-document-id={documentId}
        onMouseDown={(event) => {
          if (isEditingTitle) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <button className="memo-link-block__handle" type="button" aria-label="Déplacer" data-drag-handle>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10 4h2v2h-2V4zm0 7h2v2h-2v-2zm0 7h2v2h-2v-2zm4-14h2v2h-2V4zm0 7h2v2h-2v-2zm0 7h2v2h-2v-2z" /></svg>
        </button>
        <button
          type="button"
          className="memo-link-block__main"
          onClick={handleMainClick}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (canEdit && event.shiftKey) {
              setIsEditingTitle(true);
              return;
            }
            handleOpen(event);
          }}
          onKeyDown={(event) => {
            if (isEditingTitle) return;
            if (event.key === 'Enter' || event.key === ' ') {
              handleOpen(event);
            }
          }}
          aria-label={title}
        >
          <span className="memo-link-block__icon" onClick={(event) => handleOpen(event)}>
            <span ref={iconRef}>{resolvedIcon ? <i data-lucide={resolvedIcon}></i> : <i data-lucide="file"></i>}</span>
            <span className="memo-link-block__icon-overlay"><ArrowUpRight size={10} /></span>
          </span>
          <span className="memo-link-block__title">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                className="memo-link-block__title-input"
                value={draftTitle}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={() => commitTitle()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitTitle();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTitleEdit();
                  }
                }}
              />
            ) : (
              resolvedTitle
            )}
          </span>
        </button>
        <span className="memo-link-block__actions">
          <button type="button" className="memo-link-block__action" onClick={handleCopy} aria-label="Copier"><Copy size={13} /></button>
          <button type="button" className="memo-link-block__action" onClick={handleDelete} aria-label="Supprimer"><Trash2 size={13} /></button>
        </span>
      </div>
    </NodeViewWrapper>
  );
};

const MemoLinkBlock = TiptapNode.create({
  name: 'memoLinkBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      href: { default: '' },
      title: { default: 'Document' },
      icon: { default: '' },
      documentId: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="memo-link-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'memo-link-block' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MemoLinkBlockView);
  },
});

const MemoNavigationBlockView = ({ node, editor, getPos }: any) => {
  const rawTitle = String(node?.attrs?.title || 'Navigation').trim();
  const title = (!rawTitle || rawTitle.toLowerCase() === 'sommaire') ? 'Navigation' : rawTitle;
  const parentIdAttr = String(node?.attrs?.parentId || '').trim();
  const [children, setChildren] = React.useState<Array<{ id: string; title: string; icon?: string }>>([]);
  const blockRef = React.useRef<HTMLDivElement | null>(null);

  const refreshChildren = React.useCallback(async () => {
    const resolver = (window as any).GoToolkitMemoGetChildrenForDocument;
    const fallbackParentId = String((window as any).__memoActiveDocumentId || '').trim();
    const parentId = parentIdAttr || fallbackParentId;
    if (!parentId || typeof resolver !== 'function') {
      setChildren([]);
      return;
    }
    try {
      const rows = await resolver(parentId);
      const next = (Array.isArray(rows) ? rows : [])
        .map((item: any) => ({
          id: String(item?.id || '').trim(),
          title: String(item?.title || 'Document').trim() || 'Document',
          icon: String(item?.icon || '').trim()
        }))
        .filter((item: any) => item.id);
      setChildren(next);
    } catch (err) {
      setChildren([]);
    }
  }, [parentIdAttr]);

  React.useEffect(() => {
    refreshChildren();
    const onChildrenUpdated = () => refreshChildren();
    window.addEventListener('goToolkitMemoChildrenUpdated', onChildrenUpdated as EventListener);
    return () => window.removeEventListener('goToolkitMemoChildrenUpdated', onChildrenUpdated as EventListener);
  }, [refreshChildren]);

  React.useEffect(() => {
    try {
      (window as any).lucide?.createIcons?.({
        attrs: { width: '14', height: '14' },
        elements: blockRef.current ? [blockRef.current] : undefined
      });
    } catch (err) {
      // ignore
    }
  }, [children]);

  const handleOpenChild = React.useCallback((event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    const open = (window as any).GoToolkitMemoOpenDocumentByLink;
    if (typeof open === 'function') open(id);
  }, []);

  const handleCopy = React.useCallback(async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const markdown = [
      `## ${title}`,
      ...children.map(item => `- [${item.title}](memo://${item.id})`)
    ].join('\n');
    try {
      if (typeof getPos === 'function') {
        const pos = getPos();
        const nodeAtPos = editor?.state?.doc?.nodeAt?.(pos);
        if (nodeAtPos && navigator.clipboard && typeof (navigator.clipboard as any).write === 'function' && typeof (window as any).ClipboardItem === 'function') {
          const slice = editor.state.doc.slice(pos, pos + nodeAtPos.nodeSize);
          const serializer = DOMSerializer.fromSchema(editor.state.schema);
          const fragment = serializer.serializeFragment(slice.content);
          const tmp = document.createElement('div');
          tmp.appendChild(fragment);
          const html = tmp.innerHTML.trim();
          if (html) {
            const item = new (window as any).ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([markdown], { type: 'text/plain' }),
            });
            await (navigator.clipboard as any).write([item]);
            return;
          }
        }
      }
      await navigator.clipboard.writeText(markdown);
    } catch (err) {
      // ignore
    }
  }, [children, editor, getPos, title]);

  const handleDelete = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView();
    editor.view.dispatch(tr);
    editor.view.focus();
  }, [editor, getPos, node?.nodeSize]);

  return (
    <NodeViewWrapper className="memo-summary-block-wrap" contentEditable={false}>
      <div className="memo-summary-block" data-parent-id={parentIdAttr} ref={blockRef}>
        <div className="memo-summary-block__header">
          <span className="memo-summary-block__title">{title}</span>
          <span className="memo-summary-block__actions">
            <button type="button" className="memo-summary-block__action" onClick={handleCopy} aria-label="Copier"><Copy size={13} /></button>
            <button type="button" className="memo-summary-block__action" onClick={handleDelete} aria-label="Supprimer"><Trash2 size={13} /></button>
          </span>
        </div>
        <div className="memo-summary-block__list">
          {children.length ? children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="memo-link-block memo-summary-block__link-block"
              onClick={(event) => handleOpenChild(event, child.id)}
              aria-label={child.title}
            >
              <span className="memo-link-block__icon">
                <i data-lucide={child.icon || 'file'}></i>
                <span className="memo-link-block__icon-overlay"><ArrowUpRight size={10} /></span>
              </span>
              <span className="memo-link-block__title">{child.title}</span>
            </button>
          )) : (
            <div className="memo-summary-block__empty">Aucune page enfant</div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

const MemoNavigationBlock = TiptapNode.create({
  name: 'memoSummaryBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      title: { default: 'Navigation' },
      parentId: { default: '' },
    };
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="memo-navigation-block"]' },
      { tag: 'div[data-type="memo-summary-block"]' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'memo-navigation-block' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MemoNavigationBlockView);
  },
});

const MemoPageSummaryBlockView = ({ node }: any) => {
  const title = String(node?.attrs?.title || 'Sommaire');
  const blockRef = React.useRef<HTMLDivElement | null>(null);
  const [headings, setHeadings] = React.useState<Array<{ id: string; text: string; level: number; pos: number | null }>>([]);

  const refreshHeadings = React.useCallback(() => {
    const raw = Array.isArray((window as any).MemoHeadings) ? (window as any).MemoHeadings : [];
    const next = raw
      .map((h: any, index: number) => {
        const level = Number(h?.level || 0);
        const id = String(h?.id || h?.anchor || h?.node?.attrs?.id || h?.node?.attrs?.['data-toc-id'] || `memo-heading-${index}`).trim();
        const text = String(h?.textContent || h?.text || h?.node?.textContent || '').trim() || '(Sans titre)';
        const pos = Number.isFinite(Number(h?.pos)) ? Number(h.pos) : null;
        return (level >= 1 && level <= 4 && id) ? { id, text, level, pos } : null;
      })
      .filter(Boolean) as Array<{ id: string; text: string; level: number; pos: number | null }>;
    setHeadings(next);
  }, []);

  React.useEffect(() => {
    refreshHeadings();
    const onUpdate = () => refreshHeadings();
    window.addEventListener('memo:headings-updated', onUpdate as EventListener);
    return () => window.removeEventListener('memo:headings-updated', onUpdate as EventListener);
  }, [refreshHeadings]);

  React.useEffect(() => {
    try {
      (window as any).lucide?.createIcons?.({
        attrs: { width: '14', height: '14' },
        elements: blockRef.current ? [blockRef.current] : undefined
      });
    } catch (err) {
      // ignore
    }
  }, [headings]);

  const handleOpenHeading = React.useCallback((event: React.MouseEvent, heading: { id: string; pos: number | null }) => {
    event.preventDefault();
    event.stopPropagation();
    const editor = (window as any).MemoEditor || (window as any).memoEditor;
    const scrollArea = document.querySelector('.editor-wrap');
    if (!editor || !scrollArea) return;
    try {
      if (Number.isFinite(Number(heading?.pos))) {
        editor.chain().focus().setTextSelection(Number(heading.pos)).run();
      }
    } catch (err) {
      // ignore
    }
    const selector = `[id="${heading.id}"], [data-toc-id="${heading.id}"], [data-rail-id="${heading.id}"]`;
    const element = editor.view?.dom?.querySelector?.(selector);
    if (!element) return;
    const areaRect = scrollArea.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const relativeTop = elementRect.top - areaRect.top + (scrollArea as HTMLElement).scrollTop;
    (scrollArea as HTMLElement).scrollTo({ top: Math.max(0, relativeTop - 20), behavior: 'smooth' });
  }, []);

  const handleBackToTop = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const scrollArea = document.querySelector('.editor-wrap') as HTMLElement | null;
    if (!scrollArea) return;
    const summaryEl = (blockRef.current?.closest('[data-type="memo-page-summary-block"]') as HTMLElement | null)
      || (document.querySelector('[data-type="memo-page-summary-block"]') as HTMLElement | null);
    if (summaryEl) {
      const areaRect = scrollArea.getBoundingClientRect();
      const elementRect = summaryEl.getBoundingClientRect();
      const relativeTop = elementRect.top - areaRect.top + scrollArea.scrollTop;
      scrollArea.scrollTo({ top: Math.max(0, relativeTop - 20), behavior: 'smooth' });
      return;
    }
    scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <NodeViewWrapper className="memo-summary-block-wrap" contentEditable={false}>
      <div className="memo-summary-block" ref={blockRef}>
        <div className="memo-summary-block__header">
          <span className="memo-summary-block__title">{title}</span>
        </div>
        <div className="memo-summary-block__list">
          {headings.length ? headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              className={`memo-summary-block__item memo-summary-block__item--h${heading.level}`}
              onClick={(event) => handleOpenHeading(event, heading)}
              aria-label={heading.text}
            >
              <span className="memo-summary-block__item-title">{heading.text}</span>
              <span
                className="memo-summary-block__item-top"
                onClick={handleBackToTop}
                role="button"
                aria-label="Revenir en haut"
                title="Revenir en haut"
              >
                <ArrowUp size={12} />
              </span>
            </button>
          )) : (
            <div className="memo-summary-block__empty">Aucun titre</div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

const MemoPageSummaryBlock = TiptapNode.create({
  name: 'memoPageSummaryBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      title: { default: 'Sommaire' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="memo-page-summary-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'memo-page-summary-block' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MemoPageSummaryBlockView);
  },
});

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
import { MermaidNode, insertMermaidDiagram } from './mermaid-node';
import { Alert, ALERT_TYPES } from './blockquote-node';
import { CustomImage, isSupportedImageFile } from './image-node';
import { ExternalVideoEmbed, VideoEmbed } from './video-node';
import { FileBlock, formatFileSize, getFileExtension, isSupportedGenericFile } from './file-node';
import './simple-editor.css';

const TEXT_COLORS = [
  { name: 'Défaut', value: 'var(--bg-text-main)' },
  { name: 'Gris', value: 'var(--bg-text-gray)' },
  { name: 'Marron', value: 'var(--bg-text-brown)' },
  { name: 'Orange', value: 'var(--bg-text-orange)' },
  { name: 'Jaune', value: 'var(--bg-text-yellow)' },
  { name: 'Vert', value: 'var(--bg-text-green)' },
  { name: 'Bleu', value: 'var(--bg-text-blue)' },
  { name: 'Violet', value: 'var(--bg-text-purple)' },
  { name: 'Rose', value: 'var(--bg-text-pink)' },
  { name: 'Rouge', value: 'var(--bg-text-red)' },
];

const MAX_FILE_BLOCK_BYTES = 100 * 1024 * 1024;

interface SimpleEditorProps {
  content?: string;
  onChange?: (content: string, id?: string) => void;
  editorId?: string;
  editable?: boolean;
  onReady?: (methods: {
    getMarkdown: () => string;
    setMarkdown: (md: string) => void;
    insertMarkdownAtRange: (md: string, range: { from: number; to: number }) => void;
    insertMarkdownAtEnd: (md: string) => void;
    applyStructuredOps: (ops: Array<{ action?: string; type?: string; start?: number; end?: number; text?: string; content?: string }>) => void;
    getSource: (format: 'markdown' | 'html' | 'json') => string;
    setEditable: (editable: boolean) => void;
    instance: any;
  }) => void;
  placeholder?: string;
}

type ExternalEmbedMatch = {
  provider: 'youtube' | 'loom';
  sourceUrl: string;
  embedUrl: string;
  title: string;
};

const normalizeHttpUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return raw;
};

const parseExternalVideoUrl = (value: string): ExternalEmbedMatch | null => {
  const normalized = normalizeHttpUrl(value);
  if (!/^https?:\/\//i.test(normalized)) return null;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch (err) {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname || '/';

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    let id = '';
    if (host === 'youtu.be') {
      id = path.replace(/^\/+/, '').split('/')[0] || '';
    } else if (path.startsWith('/watch')) {
      id = parsed.searchParams.get('v') || '';
    } else if (path.startsWith('/shorts/')) {
      id = path.split('/')[2] || '';
    } else if (path.startsWith('/embed/')) {
      id = path.split('/')[2] || '';
    }
    id = id.trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return {
      provider: 'youtube',
      sourceUrl: normalized,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      title: `YouTube ${id}`,
    };
  }

  if (host === 'loom.com') {
    const match = path.match(/^\/share\/([A-Za-z0-9]+)(?:\/|$)/i);
    const id = String(match?.[1] || '').trim();
    if (!id) return null;
    return {
      provider: 'loom',
      sourceUrl: normalized,
      embedUrl: `https://www.loom.com/embed/${id}`,
      title: `Loom ${id}`,
    };
  }

  return null;
};

const isExternalVideoCandidateUrl = (value: string) => {
  const normalized = normalizeHttpUrl(value);
  if (!/^https?:\/\//i.test(normalized)) return false;
  try {
    const host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'loom.com';
  } catch (err) {
    return false;
  }
};

const insertExternalEmbedAtSelection = (
  editor: Editor,
  from: number,
  to: number,
  rawUrl: string
) => {
  const match = parseExternalVideoUrl(rawUrl);
  if (!match) return false;
  const { schema, selection } = editor.state;
  const embedType = schema.nodes.externalVideoEmbed;
  const paragraphType = schema.nodes.paragraph;
  if (!embedType || !paragraphType) return false;
  const safeFrom = Math.max(1, Math.min(from, editor.state.doc.content.size));
  const safeTo = Math.max(safeFrom, Math.min(to, editor.state.doc.content.size));
  const embedNode = embedType.create({
    src: match.embedUrl,
    title: match.title,
    provider: match.provider,
  });
  const trailingParagraph = paragraphType.create();
  const fragment = schema.nodes.doc.create(null, [embedNode, trailingParagraph]).content;
  let tr = editor.state.tr;
  const $from = selection.$from;
  const inParagraph = $from.parent?.type?.name === 'paragraph';
  const paragraphText = String($from.parent?.textContent || '');
  const selectedText = editor.state.doc.textBetween(safeFrom, safeTo, ' ', ' ');
  const fullParagraphMatchesUrl = inParagraph
    && paragraphText.trim() === selectedText.trim()
    && selectedText.trim() === String(rawUrl || '').trim();

  if (inParagraph && $from.depth > 0 && (selection.empty ? $from.parent.content.size === 0 : fullParagraphMatchesUrl)) {
    const paraFrom = $from.before($from.depth);
    const paraTo = paraFrom + $from.parent.nodeSize;
    tr = tr.replaceWith(paraFrom, paraTo, fragment);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(paraFrom + embedNode.nodeSize + 1), 1));
  } else {
    tr = tr.replaceWith(safeFrom, safeTo, embedNode);
    const nextPos = safeFrom + embedNode.nodeSize;
    tr = tr.insert(nextPos, trailingParagraph);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos + 1), 1));
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
};

// Custom BubbleMenu component for Tiptap v3
const BubbleMenuComponent = ({ editor, visible, onKeep, onReject, onAssist, onLink, onInsertImage, onInsertVideo, onInsertFile, onDropdownToggle }: { 
  editor: Editor | null, 
  visible: boolean,
  onKeep: () => void,
  onReject: () => void,
  onAssist: () => void,
  onLink: () => void,
  onInsertImage: () => void,
  onInsertVideo: () => void,
  onInsertFile: () => void,
  onDropdownToggle?: (isOpen: boolean) => void,
}) => {
  const [position, setPosition] = React.useState({ top: 0, left: 0, opacity: 0 });
  const [hasMarks, setHasMarks] = React.useState(false);
  const [showTextColors, setShowTextColors] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const pointerDownRef = React.useRef(false);

  const updatePosition = React.useCallback(() => {
    if (!editor || !visible || pointerDownRef.current) {
      setPosition(prev => ({ ...prev, opacity: 0 }));
      setShowTextColors(false);
      return;
    }

    const selection = editor.state.selection;
    const isCellSelection = selection instanceof CellSelection;
    const isImageNodeSelection = selection instanceof NodeSelection && selection.node?.type?.name === 'image';
    const { from, to } = selection;
    if (isImageNodeSelection) {
      setPosition(prev => ({ ...prev, opacity: 0 }));
      setShowTextColors(false);
      return;
    }
    if (!isCellSelection && from === to) {
      setPosition(prev => ({ ...prev, opacity: 0 }));
      setShowTextColors(false);
      return;
    }

    // Check if selection has highlight or strike marks
    const hasHighlight = hasMarkInSelection(editor, 'highlight');
    const hasStrike = hasMarkInSelection(editor, 'strike');
    setHasMarks(hasHighlight || hasStrike);

    try {
      const { view } = editor;
      let selectionRect: DOMRect | null = null;

      if (isCellSelection) {
        let minTop = Infinity;
        let minLeft = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;

        selection.forEachCell((_cell, pos) => {
          const cellDom = view.nodeDOM(pos) as HTMLElement | null;
          if (!cellDom) return;
          const rect = cellDom.getBoundingClientRect();
          minTop = Math.min(minTop, rect.top);
          minLeft = Math.min(minLeft, rect.left);
          maxRight = Math.max(maxRight, rect.right);
          maxBottom = Math.max(maxBottom, rect.bottom);
        });

        if (minTop !== Infinity) {
          selectionRect = new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop);
        }
      } else {
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        if (start && end) {
          const left = Math.min(start.left, end.left);
          const right = Math.max(start.right, end.right);
          const top = Math.min(start.top, end.top);
          const bottom = Math.max(start.bottom, end.bottom);
          selectionRect = new DOMRect(left, top, right - left, bottom - top);
        }
      }

      if (!selectionRect) {
        setPosition(prev => ({ ...prev, opacity: 0 }));
        setShowTextColors(false);
        return;
      }

      const container = containerRef.current;
      // Get the closest relative/absolute/fixed parent rect for positioning
      // In this case, .simple-editor is the parent and is position: relative
      const relativeParent = container?.parentElement;
      const parentRect = relativeParent?.getBoundingClientRect() || { top: 0, left: 0 };

      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || menuRef.current?.offsetWidth || 250;
      const menuHeight = menuRect?.height || menuRef.current?.offsetHeight || 40;

      // Target: above selection
      const verticalOffset = 18; // Gap between menu and selection
      let bubbleTop = selectionRect.top - parentRect.top - menuHeight - verticalOffset;
      let bubbleLeft = (selectionRect.left + selectionRect.right) / 2 - parentRect.left - menuWidth / 2;

      // Check bounds
      const padding = 10;
      const parentWidth = relativeParent?.clientWidth || window.innerWidth;
      const parentHeight = relativeParent?.clientHeight || window.innerHeight;
      const boundedMenuWidth = Math.min(menuWidth, Math.max(parentWidth - (padding * 2), 0));
      // 1. Clamp Horizontal (Stay within parent bounds)
      if (bubbleLeft < padding) {
        bubbleLeft = padding;
      } else if (bubbleLeft + boundedMenuWidth > parentWidth - padding) {
        bubbleLeft = parentWidth - boundedMenuWidth - padding;
      }

      // 2. Clamp Vertical (prefer staying inside memo container bounds)
      // If not enough room above in container, place below selection.
      if (bubbleTop < padding) {
        bubbleTop = selectionRect.bottom - parentRect.top + verticalOffset;
      }
      // If it overflows container bottom, move it up inside container.
      if (bubbleTop + menuHeight > parentHeight - padding) {
        bubbleTop = parentHeight - padding - menuHeight;
      }
      // Final viewport safety clamp for edge cases when container is off-screen.
      const viewportTop = bubbleTop + parentRect.top;
      const viewportBottom = viewportTop + menuHeight;
      if (viewportTop < padding) {
        bubbleTop = Math.max(padding - parentRect.top, bubbleTop);
      } else if (viewportBottom > window.innerHeight - padding) {
        bubbleTop = Math.min(window.innerHeight - padding - menuHeight - parentRect.top, bubbleTop);
      }

      setPosition({
        top: bubbleTop,
        left: bubbleLeft,
        opacity: 1,
      });
    } catch (err) {
      console.warn('BubbleMenu positioning error:', err);
      setPosition(prev => ({ ...prev, opacity: 0 }));
      setShowTextColors(false);
    }
  }, [editor, visible]);

  React.useEffect(() => {
    if (!editor) return;

    const viewDom = editor.view.dom;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
        return;
      }
      pointerDownRef.current = true;
      setPosition(prev => ({ ...prev, opacity: 0 }));
      setShowTextColors(false);
    };
    const handlePointerUp = () => {
      if (!pointerDownRef.current) return;
      pointerDownRef.current = false;
      updatePosition();
    };

    viewDom.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    editor.on('selectionUpdate', updatePosition);
    editor.on('update', updatePosition);

    updatePosition();

    return () => {
      viewDom.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      editor.off('selectionUpdate', updatePosition);
      editor.off('update', updatePosition);
    };
  }, [editor, updatePosition]);

  if (!editor) return null;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'contents' }}>
      <div
        ref={menuRef}
        className="tiptap-toolbar tiptap-bubble-menu"
        style={{
          position: 'absolute',
          top: `${position.top}px`,
          left: `${position.left}px`,
          opacity: position.opacity,
          pointerEvents: position.opacity === 0 ? 'none' : 'auto',
          transition: 'opacity 0.15s ease-in-out',
          zIndex: 1000,
          willChange: 'opacity',
          padding: '4px 8px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div role="group" className="tiptap-toolbar-group">
          <button
            className="tiptap-button tiptap-button--primary"
            type="button"
            onClick={onAssist}
            title="Assistant"
          >
            <Bot size={16} />
          </button>
          {editor && (
            <BubbleActionsDropdown
              editor={editor}
              onOpenChange={onDropdownToggle}
              onLink={onLink}
              onInsertImage={onInsertImage}
              onInsertVideo={onInsertVideo}
              onInsertFile={onInsertFile}
            />
          )}
        </div>

        <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

        <div role="group" className="tiptap-toolbar-group">
          <button
            className="tiptap-button"
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            data-active-state={editor.isActive('bold') ? 'on' : 'off'}
            title="Gras"
          >
            <Bold size={14} />
          </button>
          <button
            className="tiptap-button"
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            data-active-state={editor.isActive('italic') ? 'on' : 'off'}
            title="Italique"
          >
            <Italic size={14} />
          </button>
          <button
            className="tiptap-button"
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            data-active-state={editor.isActive('underline') ? 'on' : 'off'}
            title="Souligné"
          >
            <Underline size={14} />
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="tiptap-button"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setShowTextColors(!showTextColors);
              }}
              title="Couleur"
            >
              <Baseline size={14} />
            </button>
            {showTextColors && (
              <div
                className="table-color-grid"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: '8px',
                }}
              >
                {TEXT_COLORS.map(color => (
                  <div
                    key={color.value}
                    className="table-color-option"
                    style={{
                      backgroundColor: color.value,
                    }}
                    title={color.name}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().setColor(color.value).run();
                      setShowTextColors(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="tiptap-separator-inline" style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-main)', margin: '0 6px' }}></div>
          <button
            className="tiptap-button"
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            data-active-state={editor.isActive('strike') ? 'on' : 'off'}
            title="Barré"
          >
            <Strikethrough size={14} />
          </button>
          <button
            className="tiptap-button"
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            data-active-state={editor.isActive('highlight') ? 'on' : 'off'}
            title="Surligné"
          >
            <Highlighter size={14} />
          </button>
          <button
            className="tiptap-button"
            type="button"
            onClick={onLink}
            data-active-state={editor.isActive('link') ? 'on' : 'off'}
            title="Lien"
          >
            <Link size={14} />
          </button>
          
        </div>

        {hasMarks && (
          <>
            <div className="tiptap-separator" data-orientation="vertical" role="none"></div>
            <div role="group" className="tiptap-toolbar-group">
              <button
                className="tiptap-button bubble-keep"
                type="button"
                onClick={onKeep}
                title="Approuver"
                style={{ color: 'var(--intent-success-border)' }}
              >
                <Check size={16} />
              </button>
              <button
                className="tiptap-button bubble-reject"
                type="button"
                onClick={onReject}
                title="Annuler"
                style={{ color: 'var(--intent-error-border)' }}
              >
                <X size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const getTableCellInfo = (view: any, event: MouseEvent) => {
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!pos) return null;

  const $pos = view.state.doc.resolve(pos.pos);
  let table = null;
  let row = null;
  let cell = null;
  let tablePos = -1;
  let rowPos = -1;
  let cellPos = -1;

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cell = node;
      cellPos = $pos.before(d);
    } else if (node.type.name === 'tableRow') {
      row = node;
      rowPos = $pos.before(d);
    } else if (node.type.name === 'table') {
      table = node;
      tablePos = $pos.before(d);
    }
  }

  if (!table || !row || !cell) return null;

  // Find row and col index
  let rowIndex = -1;
  let colIndex = -1;

  table.forEach((_r: PMNode, offset: number, index: number) => {
    if (offset === rowPos - tablePos - 1) {
      rowIndex = index;
      _r.forEach((_c: PMNode, offsetInRow: number, ci: number) => {
        if (offsetInRow + offset + tablePos + 2 === cellPos) {
          colIndex = ci;
        }
      });
    }
  });

  return { table, tablePos, row, rowPos, cell, cellPos, rowIndex, colIndex };
};

const getTableCellInfoFromPos = (doc: PMNode, cellPos: number) => {
  const $pos = doc.resolve(Math.min(cellPos + 1, doc.content.size));
  let table = null;
  let row = null;
  let cell = null;
  let tablePos = -1;
  let rowPos = -1;
  let resolvedCellPos = -1;

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cell = node;
      resolvedCellPos = $pos.before(d);
    } else if (node.type.name === 'tableRow') {
      row = node;
      rowPos = $pos.before(d);
    } else if (node.type.name === 'table') {
      table = node;
      tablePos = $pos.before(d);
    }
  }

  if (!table || !row || !cell) return null;

  let rowIndex = -1;
  let colIndex = -1;

  table.forEach((_r: PMNode, offset: number, index: number) => {
    if (offset === rowPos - tablePos - 1) {
      rowIndex = index;
      _r.forEach((_c: PMNode, offsetInRow: number, ci: number) => {
        if (offsetInRow + offset + tablePos + 2 === resolvedCellPos) {
          colIndex = ci;
        }
      });
    }
  });

  return { table, tablePos, row, rowPos, cell, cellPos: resolvedCellPos, rowIndex, colIndex };
};

const getTableCellPosFromResolved = (resolvedPos: any) => {
  for (let d = resolvedPos.depth; d > 0; d--) {
    const node = resolvedPos.node(d);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      return resolvedPos.before(d);
    }
  }
  return null;
};

const getTableColumnCount = (table: PMNode | null) => {
  if (!table || table.type.name !== 'table' || table.childCount === 0) return 0;
  const firstRow = table.child(0);
  let count = 0;
  firstRow.forEach((cell: PMNode) => {
    count += cell.attrs?.colspan || 1;
  });
  return count;
};

const getTableCellPosByIndex = (table: PMNode, tablePos: number, rowIndex: number, colIndex: number) => {
  if (rowIndex < 0 || rowIndex >= table.childCount) return null;
  let targetPos: number | null = null;
  table.forEach((row: PMNode, rowOffset: number, index: number) => {
    if (index !== rowIndex) return;
    let colCursor = 0;
    row.forEach((_cell: PMNode, cellOffset: number) => {
      if (targetPos !== null) return;
      const colspan = _cell.attrs?.colspan || 1;
      if (colIndex >= colCursor && colIndex < colCursor + colspan) {
        targetPos = tablePos + rowOffset + cellOffset + 2;
        return;
      }
      colCursor += colspan;
    });
  });
  return targetPos;
};


const isNumericText = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  return /[0-9]/.test(trimmed) && /^[\s\d.,%+\-]+$/.test(trimmed);
};

const areNumberArraysEqual = (a?: number[], b?: number[]) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const moveRow = (editor: Editor, tablePos: number, fromRowIndex: number, toRowIndex: number) => {
  const { tr } = editor.state;
  const table = editor.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return false;

  const rows: PMNode[] = [];
  table.forEach((node: PMNode) => {
    if (node.type.name === 'tableRow') {
      rows.push(node);
    }
  });

  if (fromRowIndex <= 0 || toRowIndex <= 0) return false;
  if (fromRowIndex >= rows.length || toRowIndex >= rows.length) return false;

  const newRows = [...rows];
  const [rowToMove] = newRows.splice(fromRowIndex, 1);
  newRows.splice(toRowIndex, 0, rowToMove);

  const newTable = table.type.create(table.attrs, newRows);
  editor.view.dispatch(tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable));
  return true;
};

const moveColumn = (editor: Editor, tablePos: number, fromColIndex: number, toColIndex: number) => {
  const { tr } = editor.state;
  const table = editor.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return false;

  const newRows: PMNode[] = [];
  table.forEach((row: PMNode) => {
    const cells: PMNode[] = [];
    row.forEach((cell: PMNode) => cells.push(cell));
    
    if (fromColIndex >= 0 && fromColIndex < cells.length && toColIndex >= 0 && toColIndex < cells.length) {
      const [cellToMove] = cells.splice(fromColIndex, 1);
      cells.splice(toColIndex, 0, cellToMove);
    }
    newRows.push(row.type.create(row.attrs, cells));
  });

  const newTable = table.type.create(table.attrs, newRows);
  editor.view.dispatch(tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable));
  return true;
};

const sortColumn = (editor: Editor, tablePos: number, colIndex: number, direction: 'asc' | 'desc') => {
  const { tr } = editor.state;
  const table = editor.state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== 'table') return false;

  const rows: PMNode[] = [];
  table.forEach((row: PMNode) => {
    if (row.type.name === 'tableRow') rows.push(row);
  });

  if (rows.length <= 1) return false;

  const headerRow = rows[0];
  const bodyRows = rows.slice(1);
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  const getCellText = (row: PMNode) => {
    const cell = row.childCount > colIndex ? row.child(colIndex) : null;
    return cell ? cell.textContent.trim() : '';
  };

  const sortedRows = bodyRows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aText = getCellText(a.row);
      const bText = getCellText(b.row);
    if (!aText && !bText) return 0;
    if (!aText) return 1;
    if (!bText) return -1;
    const result = collator.compare(aText, bText);
      if (result !== 0) return direction === 'asc' ? result : -result;
      return a.index - b.index;
    })
    .map(({ row }) => row);

  const newTable = table.type.create(table.attrs, [headerRow, ...sortedRows]);
  editor.view.dispatch(tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable));
  return true;
};

// Fonctions utilitaires pour les marks
const hasMarkInSelection = (editor: Editor | null, markName: 'highlight' | 'strike'): boolean => {
  if (!editor) return false;
  const { from, to } = editor.state.selection;
  if (from === to) return false; // Pas de sélection
  
  let hasMarked = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.marks.some(m => m.type.name === markName)) {
      hasMarked = true;
      return false;
    }
  });
  return hasMarked;
};

const hasMarksInDocument = (editor: Editor | null): boolean => {
  if (!editor) return false;
  let hasMarks = false;
  editor.state.doc.descendants((node) => {
    if (node.marks.some(m => m.type.name === 'highlight' || m.type.name === 'strike')) {
      hasMarks = true;
      return false;
    }
  });
  return hasMarks;
};

const getTableItemsFromSelection = (editor: Editor): string[] => {
  const { selection, doc } = editor.state;
  if (selection.empty) return [];
  const items: string[] = [];
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type.name === 'listItem') {
      const text = node.textContent.trim();
      if (text) items.push(text);
      return false;
    }
    if (node.type.name === 'paragraph') {
      const $pos = doc.resolve(pos);
      let inListItem = false;
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === 'listItem') {
          inListItem = true;
          break;
        }
      }
      if (!inListItem) {
        const text = node.textContent.trim();
        if (text) items.push(text);
      }
      return false;
    }
    return true;
  });
  return items;
};

const buildTableNodeFromItems = (editor: Editor, items: string[], cols = 2) => {
  const { schema } = editor.state;
  const tableType = schema.nodes.table;
  const rowType = schema.nodes.tableRow;
  const cellType = schema.nodes.tableCell;
  const paragraphType = schema.nodes.paragraph;
  if (!tableType || !rowType || !cellType || !paragraphType) return null;

  const rowsCount = items.length + 1;
  const rows: PMNode[] = [];

  for (let rowIndex = 0; rowIndex < rowsCount; rowIndex++) {
    const cells: PMNode[] = [];
    for (let colIndex = 0; colIndex < cols; colIndex++) {
      let paragraph = paragraphType.createAndFill();
      if (colIndex === 0 && rowIndex > 0 && rowIndex - 1 < items.length) {
        const textValue = items[rowIndex - 1] || '';
        paragraph = paragraphType.create(null, textValue ? schema.text(textValue) : null);
      }
      if (!paragraph) {
        paragraph = paragraphType.create();
      }
      cells.push(cellType.createChecked(null, paragraph));
    }
    rows.push(rowType.createChecked(null, cells));
  }

  return tableType.createChecked(null, rows);
};

const cleanupEmptyBlocks = (tr: any) => {
  const nodesToDelete: { from: number; to: number }[] = [];
  const emptyListItemTypes = new Set(['listItem']);
  const emptyListTypes = new Set(['bulletList', 'orderedList']);

  tr.doc.descendants((node: any, pos: number) => {
    const typeName = node.type?.name;

    if (emptyListItemTypes.has(typeName)) {
      const hasNestedList = node.childCount > 1 && Array.from({ length: node.childCount }).some((_, idx) => {
        const childType = node.child(idx)?.type?.name;
        return emptyListTypes.has(childType);
      });

      const isSingleEmptyParagraph =
        node.childCount === 1 &&
        node.firstChild?.type?.name === 'paragraph' &&
        node.firstChild?.content?.size === 0;

      if (!hasNestedList && isSingleEmptyParagraph) {
        nodesToDelete.push({ from: pos, to: pos + node.nodeSize });
        return;
      }
    }

    if (typeName === 'paragraph' && node.content.size === 0) {
      const $pos = tr.doc.resolve(pos);
      const parentType = $pos.parent?.type?.name;
      if (emptyListItemTypes.has(parentType)) {
        return;
      }
      nodesToDelete.push({ from: pos, to: pos + node.nodeSize });
      return;
    }

    if (emptyListTypes.has(typeName) && node.childCount === 0) {
      nodesToDelete.push({ from: pos, to: pos + node.nodeSize });
    }
  });

  nodesToDelete.reverse().forEach(({ from: delFrom, to: delTo }) => {
    tr.delete(delFrom, delTo);
  });
};

const keepSelection = (editor: Editor | null) => {
  if (!editor) return;
  const { from, to } = editor.state.selection;
  
  // Enlever le highlight de la sélection
  editor.chain().focus().unsetMark('highlight').run();
  
  // Supprimer les éléments en strikethrough de la sélection
  let toDelete: { from: number; to: number }[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.marks.some(m => m.type.name === 'strike')) {
      toDelete.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  
  // Supprimer de la fin vers le début
  toDelete.reverse().forEach(({ from: delFrom, to: delTo }) => {
    editor.chain().deleteRange({ from: delFrom, to: delTo }).run();
  });
  
  // Enlever les lignes vides laissées
  editor.chain().focus().command(({ tr }) => {
    cleanupEmptyBlocks(tr);
    return true;
  }).run();
};

const rejectSelection = (editor: Editor | null) => {
  if (!editor) return;
  const { from, to } = editor.state.selection;
  
  // Enlever le strikethrough de la sélection
  editor.chain().focus().unsetMark('strike').run();
  
  // Supprimer les éléments en highlight de la sélection
  let toDelete: { from: number; to: number }[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.marks.some(m => m.type.name === 'highlight')) {
      toDelete.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  
  // Supprimer de la fin vers le début
  toDelete.reverse().forEach(({ from: delFrom, to: delTo }) => {
    editor.chain().deleteRange({ from: delFrom, to: delTo }).run();
  });
  
  // Enlever les lignes vides laissées
  editor.chain().focus().command(({ tr }) => {
    cleanupEmptyBlocks(tr);
    return true;
  }).run();
};

const keepAllDocument = (editor: Editor | null) => {
  if (!editor) return;
  
  // Grouper toutes les opérations en une seule transaction pour l'History
  editor.chain()
    .focus()
    .command(({ tr }) => {
      // Première passe: enlever highlight et supprimer les strikes
      const toDelete: { from: number; to: number }[] = [];
      
      tr.doc.descendants((node, pos) => {
        // Enlever highlight
        if (node.marks.some(m => m.type.name === 'highlight')) {
          node.marks.forEach(mark => {
            if (mark.type.name === 'highlight') {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
            }
          });
        }
        // Marquer le strike pour suppression
        if (node.marks.some(m => m.type.name === 'strike')) {
          toDelete.push({ from: pos, to: pos + node.nodeSize });
        }
      });
      
      // Supprimer les nœuds strikethrough
      toDelete.reverse().forEach(({ from: delFrom, to: delTo }) => {
        tr.delete(delFrom, delTo);
      });
      
      // Deuxième passe: enlever les lignes vides
      cleanupEmptyBlocks(tr);
      
      return true;
    })
    .run();
};

const BlockTypeDropdown = ({ editor, onOpenChange, onLink }: { editor: Editor, onOpenChange?: (isOpen: boolean) => void, onLink?: () => void }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const options = [
    { label: 'Texte', value: 'paragraph', icon: Type, active: editor.isActive('paragraph') },
    { label: 'Titre 1', value: 'h1', icon: Heading1, active: editor.isActive('heading', { level: 1 }) },
    { label: 'Titre 2', value: 'h2', icon: Heading2, active: editor.isActive('heading', { level: 2 }) },
    { label: 'Titre 3', value: 'h3', icon: Heading3, active: editor.isActive('heading', { level: 3 }) },
    { label: 'Liste à puces', value: 'bulletList', icon: List, active: editor.isActive('bulletList') },
    { label: 'Liste numérotée', value: 'orderedList', icon: ListOrdered, active: editor.isActive('orderedList') },
    { label: 'Tâche', value: 'taskList', icon: CheckSquare, active: editor.isActive('taskList') },
    { label: 'Bloc de code', value: 'codeBlock', icon: SquareCode, active: editor.isActive('codeBlock') },
    { label: 'Lien', value: 'link', icon: Link, active: editor.isActive('link') },
  ];

  const currentOption = options.find(o => o.active) || options[0];

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (value: string) => {
    const chain = editor.chain().focus();
    if (value === 'paragraph') chain.setParagraph().run();
    else if (value === 'h1') chain.toggleHeading({ level: 1 }).run();
    else if (value === 'h2') chain.toggleHeading({ level: 2 }).run();
    else if (value === 'h3') chain.toggleHeading({ level: 3 }).run();
    else if (value === 'bulletList') chain.toggleBulletList().run();
    else if (value === 'taskList') chain.toggleTaskList().run();
    else if (value === 'code') chain.toggleCode().run();
    else if (value === 'codeBlock') chain.toggleCodeBlock().run();
    else if (value === 'link') onLink?.();
    setIsOpen(false);
  };

  return (
    <div className="tiptap-dropdown" ref={dropdownRef}>
      <button 
        type="button"
        className="tiptap-dropdown-trigger" 
        onClick={() => setIsOpen(!isOpen)}
        title="Format"
      >
        <currentOption.icon size={16} />
        <span>{currentOption.label}</span>
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div className="tiptap-dropdown-menu">
          {options.map((option) => (
            <div 
              key={option.value} 
              className="tiptap-dropdown-item" 
              data-active={option.active}
              onClick={() => handleSelect(option.value)}
            >
              <option.icon size={16} />
              <span style={{ flex: 1 }}>{option.label}</span>
              {option.active && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TiptapActionsDropdown = ({
  editor,
  onOpenChange,
  onLink,
  onInsertImage,
  onInsertVideo,
  onInsertFile,
}: {
  editor: Editor,
  onOpenChange?: (isOpen: boolean) => void,
  onLink?: () => void,
  onInsertImage?: () => void,
  onInsertVideo?: () => void,
  onInsertFile?: () => void,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    { label: 'Texte', value: 'paragraph', icon: Type, active: editor.isActive('paragraph') },
    { label: 'Titre 1', value: 'h1', icon: Heading1, active: editor.isActive('heading', { level: 1 }) },
    { label: 'Titre 2', value: 'h2', icon: Heading2, active: editor.isActive('heading', { level: 2 }) },
    { label: 'Titre 3', value: 'h3', icon: Heading3, active: editor.isActive('heading', { level: 3 }) },
    { label: 'Liste à puces', value: 'bulletList', icon: List, active: editor.isActive('bulletList') },
    { label: 'Liste numérotée', value: 'orderedList', icon: ListOrdered, active: editor.isActive('orderedList') },
    { label: 'Tâche', value: 'taskList', icon: CheckSquare, active: editor.isActive('taskList') },
    { label: 'Bloc de code', value: 'codeBlock', icon: SquareCode, active: editor.isActive('codeBlock') },
    { label: 'Lien', value: 'link', icon: Link, active: editor.isActive('link') },
    { label: 'Navigation', value: 'navigation', icon: FolderTree, active: editor.isActive('memoSummaryBlock') },
    { label: 'Sommaire', value: 'summary', icon: ListTree, active: editor.isActive('memoPageSummaryBlock') },
    { label: 'Libellé', value: 'label', icon: Tag, active: editor.isActive('code') },
    { label: 'Citation', value: 'quote', icon: Quote, active: editor.isActive('blockquote') },
    { label: 'Tableau', value: 'table', icon: TableIcon, active: editor.isActive('table') },
    { label: 'Diagramme', value: 'diagram', icon: Shapes, active: editor.isActive('mermaidDiagram') },
    { label: 'Image', value: 'image', icon: ImageIcon, active: false },
    { label: 'Vidéo', value: 'video', icon: Clapperboard, active: false },
    { label: 'Fichier', value: 'file', icon: FileIcon, active: false },
  ];
  const currentOption = options.find(o => o.active) || options[0];

  const handleSelect = (value: string) => {
    runEditorDropdownAction(editor, value, { onLink, onInsertImage, onInsertVideo, onInsertFile });
    setIsOpen(false);
  };

  return (
    <div className="tiptap-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="tiptap-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Actions"
      >
        <currentOption.icon size={16} />
        <span>{currentOption.label}</span>
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div className="tiptap-dropdown-menu" style={{ minWidth: '190px' }}>
          {options.map((option) => (
            <div
              key={option.value}
              className="tiptap-dropdown-item"
              data-active={option.active}
              onClick={() => handleSelect(option.value)}
            >
              <option.icon size={16} />
              <span style={{ flex: 1 }}>{option.label}</span>
              {option.active && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BubbleActionsDropdown = ({
  editor,
  onOpenChange,
  onLink,
  onInsertImage,
  onInsertVideo,
  onInsertFile,
}: {
  editor: Editor,
  onOpenChange?: (isOpen: boolean) => void,
  onLink?: () => void,
  onInsertImage?: () => void,
  onInsertVideo?: () => void,
  onInsertFile?: () => void,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options = [
    { label: 'Texte', value: 'paragraph', icon: Type, active: editor.isActive('paragraph') },
    { label: 'Titre 1', value: 'h1', icon: Heading1, active: editor.isActive('heading', { level: 1 }) },
    { label: 'Titre 2', value: 'h2', icon: Heading2, active: editor.isActive('heading', { level: 2 }) },
    { label: 'Titre 3', value: 'h3', icon: Heading3, active: editor.isActive('heading', { level: 3 }) },
    { label: 'Liste à puces', value: 'bulletList', icon: List, active: editor.isActive('bulletList') },
    { label: 'Liste numérotée', value: 'orderedList', icon: ListOrdered, active: editor.isActive('orderedList') },
    { label: 'Tâche', value: 'taskList', icon: CheckSquare, active: editor.isActive('taskList') },
    { label: 'Bloc de code', value: 'codeBlock', icon: SquareCode, active: editor.isActive('codeBlock') },
    { label: 'Lien', value: 'link', icon: Link, active: editor.isActive('link') },
    { label: 'Navigation', value: 'navigation', icon: FolderTree, active: editor.isActive('memoSummaryBlock') },
    { label: 'Sommaire', value: 'summary', icon: ListTree, active: editor.isActive('memoPageSummaryBlock') },
    { label: 'Libellé', value: 'label', icon: Tag, active: editor.isActive('code') },
    { label: 'Citation', value: 'quote', icon: Quote, active: editor.isActive('blockquote') },
    { label: 'Tableau', value: 'table', icon: TableIcon, active: editor.isActive('table') },
    { label: 'Diagramme', value: 'diagram', icon: Shapes, active: editor.isActive('mermaidDiagram') },
    { label: 'Image', value: 'image', icon: ImageIcon, active: false },
    { label: 'Vidéo', value: 'video', icon: Clapperboard, active: false },
    { label: 'Fichier', value: 'file', icon: FileIcon, active: false },
  ];
  const currentOption = options.find(o => o.active) || options[0];

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (event: React.MouseEvent<HTMLDivElement>, value: string) => {
    event.preventDefault();
    event.stopPropagation();
    runEditorDropdownAction(editor, value, { onLink, onInsertImage, onInsertVideo, onInsertFile });
    setIsOpen(false);
  };

  return (
    <div className="tiptap-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="tiptap-dropdown-trigger"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={handleToggle}
        title="Actions"
      >
        <currentOption.icon size={16} />
        <span>{currentOption.label}</span>
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div
          className="tiptap-dropdown-menu"
          style={{ minWidth: '190px' }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {options.map((option) => (
            <div
              key={option.value}
              className="tiptap-dropdown-item"
              data-active={option.active}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => handleSelect(event, option.value)}
            >
              <option.icon size={16} />
              <span style={{ flex: 1 }}>{option.label}</span>
              {option.active && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const QuoteTypeDropdown = ({ editor }: { editor: Editor }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (type: string) => {
    const chain = editor.chain().focus();
    if (editor.isActive('blockquote', { type })) {
      // Si on clique sur le type déjà actif, on "déblogquotise" (on descend d'un niveau)
      chain.lift('blockquote').run();
    } else if (editor.isActive('blockquote')) {
      // Si on est déjà dans une citation mais d'un autre type, on change juste l'attribut
      chain.updateAttributes('blockquote', { type }).run();
    } else {
      // Sinon on crée la citation et on met le bon type
      chain.setBlockquote().updateAttributes('blockquote', { type }).run();
    }
    setIsOpen(false);
  };

  const isAnyQuoteActive = editor.isActive('blockquote');
  const currentQuoteType = editor.getAttributes('blockquote').type || 'default';
  const currentOption = ALERT_TYPES.find(a => a.type === currentQuoteType) || ALERT_TYPES[0];

  return (
    <div className="tiptap-dropdown" ref={dropdownRef}>
      <button 
        type="button"
        className="tiptap-button" 
        onClick={() => setIsOpen(!isOpen)}
        data-active-state={isAnyQuoteActive ? 'on' : 'off'}
        title="Citation"
        style={{ width: 'auto', padding: '0 4px', gap: '2px', display: 'flex', alignItems: 'center' }}
      >
        <currentOption.icon size={16} style={{ color: isAnyQuoteActive ? currentOption.color : 'inherit' }} />
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div className="tiptap-dropdown-menu" style={{ width: '180px' }}>
          {ALERT_TYPES.map((alert) => (
            <div 
              key={alert.type} 
              className="tiptap-dropdown-item" 
              data-active={editor.isActive('blockquote', { type: alert.type })}
              onClick={() => handleSelect(alert.type)}
            >
              <alert.icon size={16} style={{ color: alert.color }} />
              <span style={{ flex: 1 }}>{alert.label}</span>
              {editor.isActive('blockquote', { type: alert.type }) && <Check size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Toolbar = ({ editor, onDropdownToggle, onLink, onInsertImage, onInsertVideo, onInsertFile }: {
  editor: Editor, 
  onDropdownToggle?: (isOpen: boolean) => void,
  onLink: () => void,
  onInsertImage: () => void,
  onInsertVideo: () => void,
  onInsertFile: () => void,
}) => {
  // Force re-render when editor state changes
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const toolbarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!editor) return;

    // Update component on any editor change
    const updateHandler = () => forceUpdate();
    editor.on('update', updateHandler);
    editor.on('selectionUpdate', updateHandler);

    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        onDropdownToggle?.(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      editor.off('update', updateHandler);
      editor.off('selectionUpdate', updateHandler);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <div ref={toolbarRef} role="toolbar" aria-label="toolbar" data-variant="fixed" className="tiptap-toolbar">
      <div role="group" className="tiptap-toolbar-group">
        <button
          className="tiptap-button"
          aria-label="Undo"
          title="Annuler"
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Redo"
          title="Rétablir"
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

      <div role="group" className="tiptap-toolbar-group">
        {editor && hasMarksInDocument(editor) && (
          <button
            className="tiptap-button toolbar-action-btn toolbar-keep"
            aria-label="Garder tout"
            type="button"
            title="Approuver tout"
            onClick={() => keepAllDocument(editor)}
          >
            <CheckCheck size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

const runEditorDropdownAction = (
  editor: Editor,
  value: string,
  callbacks: {
    onLink?: () => void;
    onInsertImage?: () => void;
    onInsertVideo?: () => void;
    onInsertFile?: () => void;
    onInsertNavigation?: () => void;
    onInsertPageSummary?: () => void;
  }
) => {
  const chain = editor.chain().focus();
  if (value === 'paragraph') chain.setParagraph().run();
  else if (value === 'h1') chain.toggleHeading({ level: 1 }).run();
  else if (value === 'h2') chain.toggleHeading({ level: 2 }).run();
  else if (value === 'h3') chain.toggleHeading({ level: 3 }).run();
  else if (value === 'bulletList') chain.toggleBulletList().run();
  else if (value === 'orderedList') chain.toggleOrderedList().run();
  else if (value === 'taskList') chain.toggleTaskList().run();
  else if (value === 'codeBlock') chain.toggleCodeBlock().run();
  else if (value === 'link') callbacks.onLink?.();
  else if (value === 'label') chain.insertContent('`').run();
  else if (value === 'quote') chain.setBlockquote().run();
  else if (value === 'table') {
    const selectedItems = getTableItemsFromSelection(editor);
    if (selectedItems.length) {
      const tableNode = buildTableNodeFromItems(editor, selectedItems, 2);
      if (tableNode) {
        const tr = editor.state.tr.replaceSelectionWith(tableNode).scrollIntoView();
        const selectionPos = tr.selection.from + 1;
        tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)));
        editor.view.dispatch(tr);
        return;
      }
    }
    chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  } else if (value === 'diagram') {
    insertMermaidDiagram(editor);
  } else if (value === 'image') {
    callbacks.onInsertImage?.();
  } else if (value === 'video') {
    callbacks.onInsertVideo?.();
  } else if (value === 'file') {
    callbacks.onInsertFile?.();
  } else if (value === 'navigation') {
    callbacks.onInsertNavigation?.();
  } else if (value === 'summary') {
    callbacks.onInsertPageSummary?.();
  }
};

// Code Suggestion List Component
const CodeList = React.forwardRef((props: any, ref: any) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const selectItem = (index: number) => {
    const item = props.items?.[index];
    if (!item) return;
    if (typeof item === 'string') {
      props.command({ text: item });
      return;
    }
    props.command({ text: item.text, marks: item.marks || [] });
  };

  const upHandler = () => {
    const len = props.items?.length || 0;
    if (!len) return;
    setSelectedIndex((prev: number) => (prev + len - 1) % len);
  };

  const downHandler = () => {
    const len = props.items?.length || 0;
    if (!len) return;
    setSelectedIndex((prev: number) => (prev + 1) % len);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  React.useEffect(() => setSelectedIndex(0), [props.items]);

  React.useImperativeHandle(ref, () => {
    return {
      onKeyDown: (x: any) => {
        if (x.event.key === 'ArrowUp') {
          upHandler();
          return true;
        }
        if (x.event.key === 'ArrowDown') {
          downHandler();
          return true;
        }
        if (x.event.key === 'Enter') {
          enterHandler();
          return true;
        }
        if (x.event.key === 'Tab') {
          if (props.items?.length > 0) {
            selectItem(0);
            return true;
          }
        }
        return false;
      },
    };
  }, [selectedIndex, props.items]);

  if (!props.items?.length) return null;

  return (
    <div
      className="code-dropdown-autocomplete"
      style={{
        background: 'var(--bg-surface-soft)',
        border: '1px solid var(--border-main)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        padding: '4px',
        maxHeight: '200px',
        overflowY: 'auto',
        minWidth: '150px',
        zIndex: 9999,
      }}
    >
      {props.items.map((item: any, index: number) => {
        const label = typeof item === 'string' ? item : item.text;
        const marks = typeof item === 'string' ? [] : (item.marks || []);
        const color = marks.find((mark: any) => mark.type === 'textStyle')?.attrs?.color;
        const isBold = marks.some((mark: any) => mark.type === 'bold');
        const isItalic = marks.some((mark: any) => mark.type === 'italic');
        const isUnderline = marks.some((mark: any) => mark.type === 'underline');
        const isStrike = marks.some((mark: any) => mark.type === 'strike');
        const isHighlight = marks.some((mark: any) => mark.type === 'highlight');
        return (
        <button
          key={index}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectItem(index);
          }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '13px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            color: color || 'var(--text-main)',
            fontWeight: isBold ? 700 : 400,
            fontStyle: isItalic ? 'italic' : 'normal',
            textDecoration: `${isUnderline ? 'underline' : ''}${isStrike ? ' line-through' : ''}`.trim() || 'none',
            backgroundColor: isHighlight
              ? (marks.find((mark: any) => mark.type === 'highlight')?.attrs?.color || 'var(--bg-surface)')
              : (index === selectedIndex ? 'var(--bg-surface)' : 'var(--bg-surface-soft)'),
          }}
        >
          {label}
        </button>
      )})}
    </div>
  );
});

const CODE_SUGGESTION_USAGE_KEY = 'go-toolkit-code-suggestion-usage';
const CODE_SUGGESTION_STYLE_KEY = 'go-toolkit-code-suggestion-styles';
const codeSuggestionInitialSyncMap = new WeakMap<Editor, boolean>();
type CodeSuggestionStyle = {
  bold?: boolean;
  italic?: boolean;
  color?: string;
};

const loadCodeSuggestionStyles = (): Record<string, CodeSuggestionStyle> => {
  try {
    const raw = localStorage.getItem(CODE_SUGGESTION_STYLE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
};

const saveCodeSuggestionStyles = (styles: Record<string, CodeSuggestionStyle>) => {
  try {
    localStorage.setItem(CODE_SUGGESTION_STYLE_KEY, JSON.stringify(styles));
  } catch (err) {
    // ignore storage failures
  }
};

const normalizeCodeSuggestionText = (text: string) => (text || '').trim();

const extractCodeSuggestionStyle = (marks: ReadonlyArray<{ type: any; attrs?: Record<string, any> }>) => {
  const hasType = (type: string) => marks.some(mark => (mark.type?.name || mark.type) === type);
  const colorMark = marks.find(mark => (mark.type?.name || mark.type) === 'textStyle');
  const color = colorMark?.attrs?.color;
  return {
    bold: hasType('bold'),
    italic: hasType('italic'),
    color: color || undefined,
  } as CodeSuggestionStyle;
};

const codeSuggestionStylesEqual = (a?: CodeSuggestionStyle, b?: CodeSuggestionStyle) => {
  const normalizedA = {
    bold: !!a?.bold,
    italic: !!a?.italic,
    color: a?.color || '',
  };
  const normalizedB = {
    bold: !!b?.bold,
    italic: !!b?.italic,
    color: b?.color || '',
  };
  return normalizedA.bold === normalizedB.bold
    && normalizedA.italic === normalizedB.italic
    && normalizedA.color === normalizedB.color;
};

const buildMarksFromCodeSuggestionStyle = (style?: CodeSuggestionStyle) => {
  const marks: Array<{ type: string; attrs?: Record<string, any> }> = [];
  if (style?.bold) {
    marks.push({ type: 'bold' });
  }
  if (style?.italic) {
    marks.push({ type: 'italic' });
  }
  if (style?.color) {
    marks.push({ type: 'textStyle', attrs: { color: style.color } });
  }
  return marks;
};

const syncCodeSuggestionStylesOnLoad = (editor: Editor) => {
  const storedStyles = loadCodeSuggestionStyles();
  const nextStyles: Record<string, CodeSuggestionStyle> = { ...storedStyles };
  let stylesChanged = false;

  const latestStyles = new Map<string, CodeSuggestionStyle>();

  editor.state.doc.descendants((node) => {
    if (!node.isText || !node.text) return true;
    const hasCode = node.marks.some(mark => mark.type.name === 'code');
    if (!hasCode) return true;
    const key = normalizeCodeSuggestionText(node.text);
    if (!key) return true;
    const style = extractCodeSuggestionStyle(node.marks);
    latestStyles.set(key, style);
    return true;
  });

  latestStyles.forEach((style, key) => {
    if (!nextStyles[key]) {
      nextStyles[key] = style;
      stylesChanged = true;
    }
  });

  if (stylesChanged) {
    saveCodeSuggestionStyles(nextStyles);
  }

  const { schema } = editor.state;
  let tr = editor.state.tr;
  let modified = false;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const hasCode = node.marks.some(mark => mark.type.name === 'code');
    if (!hasCode) return true;
    const key = normalizeCodeSuggestionText(node.text);
    if (!key) return true;
    const desired = nextStyles[key];
    if (!desired) return true;
    const current = extractCodeSuggestionStyle(node.marks);
    if (codeSuggestionStylesEqual(desired, current)) return true;

    const end = pos + node.nodeSize;
    if (schema.marks.bold) {
      tr.removeMark(pos, end, schema.marks.bold);
    }
    if (schema.marks.italic) {
      tr.removeMark(pos, end, schema.marks.italic);
    }
    if (schema.marks.textStyle) {
      tr.removeMark(pos, end, schema.marks.textStyle);
    }
    if (desired.bold && schema.marks.bold) {
      tr.addMark(pos, end, schema.marks.bold.create());
    }
    if (desired.italic && schema.marks.italic) {
      tr.addMark(pos, end, schema.marks.italic.create());
    }
    if (desired.color && schema.marks.textStyle) {
      tr.addMark(pos, end, schema.marks.textStyle.create({ color: desired.color }));
    }

    modified = true;
    return true;
  });

  if (modified) {
    tr.setMeta('codeSuggestionInitialSync', true);
    editor.view.dispatch(tr);
  }
};
const loadCodeSuggestionUsage = () => {
  try {
    const raw = localStorage.getItem(CODE_SUGGESTION_USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
};

const bumpCodeSuggestionUsage = (snippet: string) => {
  const key = (snippet || '').trim();
  if (!key) return;
  const usage = loadCodeSuggestionUsage();
  usage[key] = (usage[key] || 0) + 1;
  try {
    localStorage.setItem(CODE_SUGGESTION_USAGE_KEY, JSON.stringify(usage));
  } catch (err) {
    // ignore storage failures
  }
};

// Code suggestion configuration
const codeSuggestion = {
  items: ({ editor, query }: { editor: Editor, query: string }) => {
    const snippets = new Map<string, { text: string; marks: Array<{ type: string; attrs?: Record<string, any> }> }>();
    const styles = loadCodeSuggestionStyles();
    
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        const codeMark = node.marks.find(m => m.type.name === 'code');
        if (codeMark && node.text) {
          const trimmed = normalizeCodeSuggestionText(node.text);
          if (!trimmed) return true;
          if (!snippets.has(trimmed)) {
            const storedStyle = styles[trimmed];
            const marks = storedStyle
              ? buildMarksFromCodeSuggestionStyle(storedStyle)
              : node.marks.map(mark => ({
                type: mark.type.name,
                attrs: mark.attrs || {},
              }));
            snippets.set(trimmed, { text: trimmed, marks });
          }
        }
      }
      return true;
    });

    const usage = loadCodeSuggestionUsage();
    return Array.from(snippets.values())
      .filter(({ text }) => text.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        const aCount = usage[a.text] || 0;
        const bCount = usage[b.text] || 0;
        if (aCount !== bCount) return bCount - aCount;
        return a.text.localeCompare(b.text);
      })
      .slice(0, 10);
  },

  render: () => {
    let component: any;

    function repositionComponent(clientRect: any) {
      if (!component?.element) return;

      const rect = typeof clientRect === 'function' ? clientRect() : clientRect;
      if (!rect) return;

      const virtualElement = {
        getBoundingClientRect() {
          return rect;
        },
      };

      computePosition(virtualElement, component.element, {
        placement: 'bottom-start',
      }).then((pos: any) => {
        Object.assign(component.element.style, {
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          position: pos.strategy === 'fixed' ? 'fixed' : 'absolute',
        });
      });
    }

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(CodeList, {
          props,
          editor: props.editor,
          className: 'code-dropdown-autocomplete',
        });

        document.body.appendChild(component.element);
        repositionComponent(props.clientRect);
      },

      onUpdate(props: any) {
        component.updateProps(props);
        repositionComponent(props.clientRect);
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape' || props.event.key === '`') {
          if (document.body.contains(component.element)) {
            document.body.removeChild(component.element);
          }
          component.destroy();
          return props.event.key === 'Escape';
        }

        return component.ref?.onKeyDown(props);
      },

      onExit() {
        if (component?.element && document.body.contains(component.element)) {
          document.body.removeChild(component.element);
        }
        component?.destroy();
      },
    };
  },
};

const CodeSuggestion = Extension.create({
  name: 'codeSuggestion',

  addOptions() {
    return {
      suggestion: {
        char: '`',
        pluginKey: new PluginKey('codeSuggestion'),
        allow: ({ editor }: any) => {
          return !editor.isActive('codeBlock');
        },
        command: ({ editor, range, props }: any) => {
          bumpCodeSuggestionUsage(props.text);
          const activeColor = editor.getAttributes('textStyle')?.color;
          const storedMarks = editor.state.storedMarks || editor.state.selection.$from.marks();
          const suggestionMarks = Array.isArray(props.marks) ? props.marks : [];
          const marksMap = new Map<string, { type: string; attrs?: Record<string, any> }>();
          const normalizeType = (type: any) => (typeof type === 'string' ? type : type?.name);
          const isStyleMarkType = (type: string) => type === 'bold' || type === 'italic' || type === 'textStyle';
          const addMark = (mark: { type: any; attrs?: Record<string, any> }) => {
            const key = normalizeType(mark.type);
            if (!key) return;
            if (key === 'code') {
              marksMap.set('code', { type: 'code' });
              return;
            }
            marksMap.set(key, { type: key, attrs: mark.attrs || {} });
          };

          addMark({ type: 'code' });
          suggestionMarks.forEach(mark => addMark(mark));
          storedMarks.forEach(mark => {
            const key = normalizeType(mark.type);
            if (key && isStyleMarkType(key)) return;
            addMark({ type: mark.type, attrs: mark.attrs });
          });
          if (activeColor && !suggestionMarks.some(mark => normalizeType(mark.type) === 'textStyle')) {
            marksMap.set('textStyle', { type: 'textStyle', attrs: { color: activeColor } });
          }
          const finalMarks = Array.from(marksMap.values());
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'text',
                text: props.text,
                marks: finalMarks,
              },
              {
                type: 'text',
                text: ' ',
              },
            ])
            .run();
          const nextPos = range.from + props.text.length + 1;
          const restoreChain = editor.chain().focus().setTextSelection(nextPos);
          storedMarks
            .filter(mark => mark.type.name !== 'code')
            .forEach(mark => restoreChain.setMark(mark.type.name, mark.attrs || {}));
          if (activeColor) {
            restoreChain.setColor(activeColor);
          }
          restoreChain.run();
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('codeSuggestionStyleSync'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(transaction => transaction.docChanged)) {
            return null;
          }

          const storedStyles = loadCodeSuggestionStyles();
          const nextStyles: Record<string, CodeSuggestionStyle> = { ...storedStyles };
          let stylesChanged = false;

          const latestStyles = new Map<string, CodeSuggestionStyle>();

          newState.doc.descendants((node) => {
            if (!node.isText || !node.text) return true;
            const hasCode = node.marks.some(mark => mark.type.name === 'code');
            if (!hasCode) return true;
            const key = normalizeCodeSuggestionText(node.text);
            if (!key) return true;
            const style = extractCodeSuggestionStyle(node.marks);
            latestStyles.set(key, style);
            return true;
          });

          latestStyles.forEach((style, key) => {
            const existing = nextStyles[key];
            if (!existing || !codeSuggestionStylesEqual(existing, style)) {
              nextStyles[key] = style;
              stylesChanged = true;
            }
          });

          let tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return true;
            const hasCode = node.marks.some(mark => mark.type.name === 'code');
            if (!hasCode) return true;
            const key = normalizeCodeSuggestionText(node.text);
            if (!key) return true;
            const desired = nextStyles[key];
            if (!desired) return true;

            const current = extractCodeSuggestionStyle(node.marks);
            if (codeSuggestionStylesEqual(desired, current)) return true;

            const end = pos + node.nodeSize;
            const { schema } = newState;

            if (schema.marks.bold) {
              tr.removeMark(pos, end, schema.marks.bold);
            }
            if (schema.marks.italic) {
              tr.removeMark(pos, end, schema.marks.italic);
            }
            if (schema.marks.textStyle) {
              tr.removeMark(pos, end, schema.marks.textStyle);
            }

            if (desired.bold && schema.marks.bold) {
              tr.addMark(pos, end, schema.marks.bold.create());
            }
            if (desired.italic && schema.marks.italic) {
              tr.addMark(pos, end, schema.marks.italic.create());
            }
            if (desired.color && schema.marks.textStyle) {
              tr.addMark(pos, end, schema.marks.textStyle.create({ color: desired.color }));
            }

            modified = true;
            return true;
          });

          if (stylesChanged) {
            saveCodeSuggestionStyles(nextStyles);
          }

          return modified ? tr : null;
        },
      }),
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: codeSuggestion.items,
        render: codeSuggestion.render,
      }),
    ]
  },
});

async function downloadSvgAsPng(svgElement: SVGSVGElement, filename: string = 'diagramme.png') {
  try {
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new (window as any).Image();
    
    const rect = svgElement.getBoundingClientRect();
    const scale = 2;
    const width = rect.width * scale;
    const height = rect.height * scale;
    
    canvas.width = width;
    canvas.height = height;
    
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
    }
    
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  } catch (err) {
    console.error("Error downloading PNG:", err);
  }
}

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Impossible de lire le fichier image'));
  reader.readAsDataURL(file);
});

const isSupportedVideoFile = (file: File) => {
  const mime = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return mime.startsWith('video/')
    || mime === 'application/octet-stream'
    || name.endsWith('.mp4')
    || name.endsWith('.webm')
    || name.endsWith('.mov')
    || name.endsWith('.m4v');
};

const INITIAL_NAV_DISMISSED_KEY = 'go-toolkit-memo-initial-navigation-dismissed-v1';

const parseDismissedInitialNavigation = () => {
  try {
    const raw = localStorage.getItem(INITIAL_NAV_DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : []);
  } catch (err) {
    return new Set<string>();
  }
};

const persistDismissedInitialNavigation = (next: Set<string>) => {
  try {
    localStorage.setItem(INITIAL_NAV_DISMISSED_KEY, JSON.stringify(Array.from(next)));
  } catch (err) {
    // ignore storage failures
  }
};

const hasPersistedNavigationBlock = (html: string) => {
  const source = String(html || '');
  return /data-type=["'](?:memo-navigation-block|memo-summary-block)["']/.test(source);
};

const isHtmlEffectivelyEmptyForInitialNavigation = (html: string) => {
  const source = String(html || '');
  if (!source.trim()) return true;
  const withoutBlocks = source
    .replace(/<div[^>]*data-type=["'](?:memo-navigation-block|memo-summary-block|memo-page-summary-block)["'][\s\S]*?<\/div>/gi, '')
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
  const textOnly = withoutBlocks
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '');
  return !textOnly;
};

const SimpleEditor: React.FC<SimpleEditorProps> = ({ 
  content = '', 
  onChange, 
  editorId,
  onReady,
  editable = true,
  placeholder = "Appuyer sur 'espace' pour l'Assistant ou '/' pour les commandes"
}) => {
  const mountStart = React.useRef(performance.now());
  const turndownRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  const [rowHandle, setRowHandle] = React.useState<{ top: number, left: number, rowIndex: number, tablePos: number } | null>(null);
  const [colHandle, setColHandle] = React.useState<{ top: number, left: number, colIndex: number, tablePos: number } | null>(null);
  const [blockDeleteHandle, setBlockDeleteHandle] = React.useState<{ top: number, left: number, pos: number, label: string } | null>(null);
  const [quoteHandle, setQuoteHandle] = React.useState<{ top: number, left: number, pos: number, type: string } | null>(null);
  const [quoteMenu, setQuoteMenu] = React.useState<{ top: number, left: number, pos: number } | null>(null);
  const [codeHandle, setCodeHandle] = React.useState<{ top: number, left: number, pos: number } | null>(null);
  const [mermaidHandles, setMermaidHandles] = React.useState<Array<{ top: number, left: number, pos: number }>>([]);
  const [hoveredMermaidPos, setHoveredMermaidPos] = React.useState<number | null>(null);
  const [mediaHandles, setMediaHandles] = React.useState<Array<{ top: number, left: number, pos: number }>>([]);
  const [hoveredMediaPos, setHoveredMediaPos] = React.useState<number | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [selectionData, setSelectionData] = React.useState<any>(null);
  const [tableContextMenu, setTableContextMenu] = React.useState<{ top: number, left: number, type: 'row' | 'col', index: number, tablePos: number } | null>(null);
  const [mouseDownPoints, setMouseDownPoints] = React.useState<{ type: 'row' | 'col', index: number, tablePos: number, x: number, y: number } | null>(null);
  const [dragState, setDragState] = React.useState<{ type: 'row' | 'col', index: number, tablePos: number, x: number, y: number } | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<{ top: number, left: number, width?: number, height?: number, type: 'row' | 'col' } | null>(null);
  const [blockDragPending, setBlockDragPending] = React.useState<{ pos: number, nodeSize: number, startX: number, startY: number } | null>(null);
  const [blockDragState, setBlockDragState] = React.useState<{ pos: number, nodeSize: number, x: number, y: number } | null>(null);
  const [blockDropIndicator, setBlockDropIndicator] = React.useState<{ top: number, left: number, width: number } | null>(null);
  const [dragGhost, setDragGhost] = React.useState<{ html: string, width: number, height: number, offsetX: number, offsetY: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = React.useState(false);
  const [linkModalAnchorPos, setLinkModalAnchorPos] = React.useState(1);
  const [linkModalRange, setLinkModalRange] = React.useState<{ from: number; to: number }>({ from: 1, to: 1 });
  const [linkModalInitialQuery, setLinkModalInitialQuery] = React.useState('');
  const [linkModalInitialLabel, setLinkModalInitialLabel] = React.useState('');
  const [linkTooltip, setLinkTooltip] = React.useState<{ href: string; top: number; left: number } | null>(null);
  const [showFileModal, setShowFileModal] = React.useState(false);
  const [fileModalAnchorPos, setFileModalAnchorPos] = React.useState(1);
  const [fileModalRange, setFileModalRange] = React.useState<{ from: number; to: number }>({ from: 1, to: 1 });
  const [fileModalInitialLabel, setFileModalInitialLabel] = React.useState('');
  const [showSlashActionMenu, setShowSlashActionMenu] = React.useState(false);
  const [slashActionMenuPos, setSlashActionMenuPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [slashActionQuery, setSlashActionQuery] = React.useState('');
  const [editorHtmlSnapshot, setEditorHtmlSnapshot] = React.useState<string>(String(content || ''));
  const [initialNavigationChildren, setInitialNavigationChildren] = React.useState<Array<{ id: string; title: string; icon?: string }>>([]);
  const [dismissedInitialNavigation, setDismissedInitialNavigation] = React.useState<Set<string>>(() => parseDismissedInitialNavigation());
  const slashActionMenuRef = React.useRef<HTMLDivElement>(null);
  const [isFocusWithinMemoCard, setIsFocusWithinMemoCard] = React.useState(false);
  const [tableSelectionBox, setTableSelectionBox] = React.useState<{ top: number, left: number, width: number, height: number } | null>(null);
  const [tableSelectionResize, setTableSelectionResize] = React.useState<{ anchorPos: number, tablePos: number } | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);
  const saveIdleRef = React.useRef<number | null>(null);
  const snapshotTimeoutRef = React.useRef<number | null>(null);
  const lastSerializedHtmlRef = React.useRef<string>(String(content || ''));
  const blockDragMovedRef = React.useRef(false);
  const tableLayoutRafRef = React.useRef<number | null>(null);
  const isAutoLayoutRef = React.useRef(false);
  const tocPendingRef = React.useRef<any[] | null>(null);
  const tocLastHashRef = React.useRef<string>('');
  const tocThrottleTimerRef = React.useRef<number | null>(null);
  const tocIdleTimerRef = React.useRef<number | null>(null);
  const tocLastRunAtRef = React.useRef<number>(0);
  const activeDocumentId = String(editorId || (window as any).__memoActiveDocumentId || '').trim();

  const clearPendingSaveTasks = React.useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const idleHandle = saveIdleRef.current;
    if (idleHandle !== null) {
      const cancelIdle = (window as any).cancelIdleCallback;
      if (typeof cancelIdle === 'function') cancelIdle(idleHandle);
      else window.clearTimeout(idleHandle);
      saveIdleRef.current = null;
    }
  }, []);

  const clearPendingSnapshotTasks = React.useCallback(() => {
    if (snapshotTimeoutRef.current !== null) {
      window.clearTimeout(snapshotTimeoutRef.current);
      snapshotTimeoutRef.current = null;
    }
  }, []);

  const scheduleEditorSync = React.useCallback((editorInstance: Editor, options: { delayMs?: number } = {}) => {
    clearPendingSaveTasks();
    const delayMs = Math.max(0, Number(options.delayMs ?? 500) || 0);
    const runSync = () => {
      saveTimeoutRef.current = null;
      saveIdleRef.current = window.setTimeout(() => {
        const html = editorInstance.getHTML();
        lastSerializedHtmlRef.current = html;
        setEditorHtmlSnapshot((prev) => (prev === html ? prev : html));
        if (onChange) {
          onChange(html, editorId);
        }
        saveIdleRef.current = null;
      }, 0);
    };
    if (delayMs > 0) {
      saveTimeoutRef.current = window.setTimeout(runSync, delayMs);
      return;
    }
    saveTimeoutRef.current = window.setTimeout(runSync, 0);
  }, [clearPendingSaveTasks, editorId, onChange]);

  React.useEffect(() => {
    lastSerializedHtmlRef.current = String(content || '');
  }, [content, editorId]);

  const clearScheduledTocSync = React.useCallback(() => {
    if (tocThrottleTimerRef.current !== null) {
      window.clearTimeout(tocThrottleTimerRef.current);
      tocThrottleTimerRef.current = null;
    }
    const idleHandle = tocIdleTimerRef.current;
    if (idleHandle !== null) {
      window.clearTimeout(idleHandle);
      tocIdleTimerRef.current = null;
    }
  }, []);

  const scheduleEditorSnapshot = React.useCallback((editorInstance: Editor, options: { delayMs?: number } = {}) => {
    clearPendingSnapshotTasks();
    const delayMs = Math.max(0, Number(options.delayMs ?? 250) || 0);
    const runSnapshot = () => {
      snapshotTimeoutRef.current = null;
      const html = editorInstance.getHTML();
      lastSerializedHtmlRef.current = html;
      setEditorHtmlSnapshot((prev) => (prev === html ? prev : html));
    };
    snapshotTimeoutRef.current = window.setTimeout(runSnapshot, delayMs);
  }, [clearPendingSnapshotTasks]);

  const computeTocHash = React.useCallback((rawContent: any[]) => {
    const rows = Array.isArray(rawContent) ? rawContent : [];
    let out = `${rows.length}|`;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      out += `${row?.id || row?.anchor || ''}#${row?.level || ''}#${row?.textContent || row?.text || ''}|`;
    }
    return out;
  }, []);

  const flushTocSync = React.useCallback(() => {
    const nextContent = Array.isArray(tocPendingRef.current) ? tocPendingRef.current : [];
    tocPendingRef.current = null;
    tocIdleTimerRef.current = null;
    const nextHash = computeTocHash(nextContent);
    if (nextHash === tocLastHashRef.current) return;
    tocLastHashRef.current = nextHash;
    (window as any).MemoHeadings = nextContent;
    window.dispatchEvent(new CustomEvent('memo:headings-updated', { detail: nextContent }));
    tocLastRunAtRef.current = Date.now();
  }, [computeTocHash]);

  const scheduleTocSync = React.useCallback((nextContent: any[]) => {
    tocPendingRef.current = Array.isArray(nextContent) ? nextContent : [];
    if (tocThrottleTimerRef.current !== null) return;
    const now = Date.now();
    const elapsed = now - tocLastRunAtRef.current;
    const delay = elapsed >= 220 ? 0 : (220 - elapsed);
    tocThrottleTimerRef.current = window.setTimeout(() => {
      tocThrottleTimerRef.current = null;
      if (tocIdleTimerRef.current !== null) return;
      tocIdleTimerRef.current = window.setTimeout(() => flushTocSync(), 0);
    }, delay);
  }, [flushTocSync]);

  React.useEffect(() => {
    return () => clearScheduledTocSync();
  }, [clearScheduledTocSync]);

  const resolveActiveMemoSpaceId = React.useCallback(async () => {
    const globalScope = window as any;
    const currentActiveDocumentId = typeof globalScope.GoToolkitMemoGetActiveDocumentId === 'function'
      ? String(globalScope.GoToolkitMemoGetActiveDocumentId() || '').trim()
      : String(activeDocumentId || '').trim();
    if (!currentActiveDocumentId) return 'golive';
    try {
      const record = await globalScope.goToolkitDocumentApi?.getRecord?.(currentActiveDocumentId);
      const rawSpaceId = record?.spaceId || record?.payload?.spaceId || record?.content?.spaceId;
      const normalizedSpaceId = String(rawSpaceId || '').trim().toLowerCase();
      return normalizedSpaceId || 'golive';
    } catch (err) {
      return 'golive';
    }
  }, [activeDocumentId]);

  const resolveActiveMemoDocumentId = React.useCallback(() => {
    const globalScope = window as any;
    return typeof globalScope.GoToolkitMemoGetActiveDocumentId === 'function'
      ? String(globalScope.GoToolkitMemoGetActiveDocumentId() || '').trim()
      : String(activeDocumentId || '').trim();
  }, [activeDocumentId]);

  const uploadEditorAssetFile = React.useCallback(async (file: File) => {
    const mimeType = String(file?.type || '').trim() || 'application/octet-stream';
    const fileName = String(file?.name || 'asset').trim() || 'asset';
    const spaceId = await resolveActiveMemoSpaceId();
    const ownerDocumentId = resolveActiveMemoDocumentId();
    console.log('[SimpleEditor] media local-store:start', {
      source: 'file-insert',
      fileName,
      mimeType,
      size: Number(file?.size || 0),
      spaceId,
      ownerDocumentId,
    });
    const saved = await (window as any).goToolkitMemoMediaStore?.saveFile?.(file, {
      fileName,
      mimeType,
      spaceId,
      ownerDocumentId,
    });
    const localRef = String(saved?.ref || '').trim();
    if (!localRef) {
      throw new Error('Missing local media ref');
    }
    const blobUrl = await (window as any).goToolkitMemoMediaStore?.resolveBlobUrl?.(localRef);
    const resolvedSrc = String(blobUrl || '').trim();
    if (!resolvedSrc) {
      throw new Error('Missing local media blob URL');
    }
    console.log('[SimpleEditor] media local-store:done', {
      source: 'file-insert',
      fileName,
      mimeType,
      size: Number(file?.size || 0),
      spaceId,
      ownerDocumentId,
      localRef,
      resolvedSrc,
    });
    return {
      src: resolvedSrc,
      localSrc: localRef,
      fileName,
      mimeType,
      size: Number(file?.size || 0),
    };
  }, [resolveActiveMemoDocumentId, resolveActiveMemoSpaceId]);

  const buildDroppedMediaContent = React.useCallback(async (files: FileList | File[]) => {
    const selected = Array.from(files || []);
    const content: Array<Record<string, any>> = [];
    for (const file of selected) {
        if (isSupportedImageFile(file)) {
          try {
            console.log('[SimpleEditor] media insert:prepare', {
              trigger: 'file-input',
              type: 'image',
              fileName: String(file?.name || ''),
              mimeType: String(file?.type || ''),
              size: Number(file?.size || 0),
            });
            const uploaded = await uploadEditorAssetFile(file);
            content.push({
              type: 'image',
            attrs: {
              src: uploaded.src,
              localSrc: uploaded.localSrc || '',
              alt: uploaded.fileName || 'image',
              title: uploaded.fileName || '',
              fileName: uploaded.fileName || '',
              mimeType: uploaded.mimeType || '',
            },
          });
        } catch (err) {
          try {
            const src = await readFileAsDataUrl(file);
            if (!src) continue;
            content.push({
              type: 'image',
              attrs: {
                src,
                alt: file.name || 'image',
                title: file.name || '',
                fileName: file.name || '',
                mimeType: file.type || '',
              },
            });
          } catch (_fallbackErr) {
            // Keep processing remaining files.
          }
        }
        continue;
      }
        if (isSupportedVideoFile(file)) {
          try {
            console.log('[SimpleEditor] media insert:prepare', {
              trigger: 'file-input',
              type: 'video',
              fileName: String(file?.name || ''),
              mimeType: String(file?.type || ''),
              size: Number(file?.size || 0),
            });
            const uploaded = await uploadEditorAssetFile(file);
            content.push({
              type: 'videoEmbed',
            attrs: {
              src: uploaded.src,
              localSrc: uploaded.localSrc || '',
              title: uploaded.fileName || 'video',
              fileName: uploaded.fileName || '',
              mimeType: uploaded.mimeType || '',
            },
          });
        } catch (err) {
          // Keep processing remaining files.
        }
        continue;
      }
      if (isSupportedGenericFile(file)) {
        if (Number(file.size || 0) > MAX_FILE_BLOCK_BYTES) {
          (window as any).GoToolkitMemoToast?.('Fichier trop volumineux (100 Mo max)', true);
          continue;
        }
        try {
          console.log('[SimpleEditor] media insert:prepare', {
            trigger: 'file-input',
            type: 'file',
            fileName: String(file?.name || ''),
            mimeType: String(file?.type || ''),
            size: Number(file?.size || 0),
          });
          const uploaded = await uploadEditorAssetFile(file);
          content.push({
            type: 'fileBlock',
            attrs: {
              src: uploaded.src,
              localSrc: uploaded.localSrc || '',
              title: uploaded.fileName || 'Fichier',
              fileName: uploaded.fileName || '',
              mimeType: uploaded.mimeType || '',
              size: uploaded.size || Number(file?.size || 0),
            },
          });
        } catch (err) {
          (window as any).GoToolkitMemoToast?.(`Import fichier échoué: ${String(file?.name || 'fichier')}`, true);
        }
      }
    }
    return content;
  }, [uploadEditorAssetFile]);

  React.useEffect(() => {
    setEditorHtmlSnapshot(String(content || ''));
  }, [content, editorId]);

  React.useEffect(() => {
    const resolver = (window as any).GoToolkitMemoGetChildrenForDocument;
    const docId = String(activeDocumentId || '').trim();
    if (!docId || typeof resolver !== 'function') {
      setInitialNavigationChildren([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const rows = await resolver(docId);
        if (cancelled) return;
        const next = (Array.isArray(rows) ? rows : [])
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            title: String(item?.title || 'Document').trim() || 'Document',
            icon: String(item?.icon || '').trim(),
          }))
          .filter((item: any) => item.id);
        setInitialNavigationChildren(next);
      } catch (err) {
        if (!cancelled) setInitialNavigationChildren([]);
      }
    };
    run();
    const onChildrenUpdated = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const parentId = String(detail?.parentId || '').trim();
      if (parentId && parentId !== docId) return;
      run();
    };
    window.addEventListener('goToolkitMemoChildrenUpdated', onChildrenUpdated as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('goToolkitMemoChildrenUpdated', onChildrenUpdated as EventListener);
    };
  }, [activeDocumentId]);

  const isInitialNavigationDismissed = React.useMemo(() => {
    const docId = String(activeDocumentId || '').trim();
    if (!docId) return false;
    return dismissedInitialNavigation.has(docId);
  }, [activeDocumentId, dismissedInitialNavigation]);

  const showInitialNavigationBlock = React.useMemo(() => {
    if (!editable) return false;
    if (!activeDocumentId) return false;
    if (!initialNavigationChildren.length) return false;
    if (isInitialNavigationDismissed) return false;
    if (hasPersistedNavigationBlock(editorHtmlSnapshot)) return false;
    return isHtmlEffectivelyEmptyForInitialNavigation(editorHtmlSnapshot);
  }, [activeDocumentId, editable, editorHtmlSnapshot, initialNavigationChildren.length, isInitialNavigationDismissed]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        heading: false, // Use our custom Heading instead to get IDs
        code: false,
        paragraph: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
      }),
      CustomCode,
      CustomHeading.configure({
        levels: [1, 2, 3],
      }),
      CustomParagraph,
      CustomBulletList,
      CustomOrderedList,
      CustomCodeBlock,
      Alert,
      TextStyle,
      Color,
      Highlight,
      TiptapUnderline,
      Superscript,
      Subscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'memo-link',
        },
      }),
      MemoLinkBlock,
      MemoNavigationBlock,
      MemoPageSummaryBlock,
      CustomImage,
      VideoEmbed,
      ExternalVideoEmbed,
      FileBlock,
      TableNode,
      TableRow,
      TableHeader,
      CustomTableCell,
      TaskListNode,
      TaskItemNode,
      MermaidNode,
      CodeSuggestion,
      TableOfContents.configure({
        onUpdate(content: any[]) {
          scheduleTocSync(content);
        },
      }),
      Placeholder.configure({
        placeholder,
        showOnlyCurrent: true,
        includeChildren: true,
      }),
    ],
    content,
    editable,
    onCreate: () => {
      // no-op
    },
    editorProps: {
      handleTripleClickOn: (view, pos) => selectTableCellText(view, pos),
      handlePaste: (_view, event) => {
        if (!(event instanceof ClipboardEvent)) return false;
        const text = String(event.clipboardData?.getData('text/plain') || '').trim();
        if (!text || text.includes('\n')) return false;
        if (!parseExternalVideoUrl(text)) return false;
        const { from, to } = editor.state.selection;
        const inserted = insertExternalEmbedAtSelection(editor, from, to, text);
        if (!inserted) return false;
        event.preventDefault();
        return true;
      },
      handleDOMEvents: {
        dragstart: (view, event) => {
          const selection = view.state.selection;
          if (selection instanceof CellSelection) {
            event.preventDefault();
            return true;
          }
          if (hasAncestorNode(selection.$from, 'table') || hasAncestorNode(selection.$to, 'table')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      handleClick: (view, _pos, event) => {
        if (event instanceof MouseEvent) {
          const target = event.target as HTMLElement | null;
          const anchor = target?.closest?.('a.memo-link') as HTMLAnchorElement | null;
          const linkBlock = target?.closest?.('.memo-link-block') as HTMLElement | null;
          const href = anchor?.getAttribute('href') || '';
          const blockDocId = linkBlock?.getAttribute('data-document-id') || '';
          const open = (window as any).GoToolkitMemoOpenDocumentByLink;
          if (typeof open === 'function' && href.startsWith('memo://') && !blockDocId) {
            event.preventDefault();
            event.stopPropagation();
            const id = href.replace(/^memo:\/\//, '');
            if (id) open(id);
            return true;
          }
        }
        if (!(event instanceof MouseEvent)) return false;
        const info = getTableCellInfo(view, event);
        if (!info) return false;

        const selection = view.state.selection;
        const isCellSelection = selection instanceof CellSelection;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const clickCellPos = info.cellPos;
        const selectionCellPos = selection instanceof TextSelection
          ? getTableCellPosFromResolved(selection.$from)
          : null;
        const isTextSelectionInCell = selection instanceof TextSelection && selectionCellPos !== null;
        let clickedCellSelected = false;
        if (isCellSelection) {
          selection.forEachCell((_cell, pos) => {
            if (pos === clickCellPos) clickedCellSelected = true;
          });
        }

        const setCaretAtClick = () => {
          if (!coords) return false;
          let targetPos = coords.pos;
          const $target = view.state.doc.resolve(targetPos);
          if ($target.parent.type.name === 'table_cell' || $target.parent.type.name === 'table_header') {
            const cell = $target.parent;
            if (cell.firstChild) {
              targetPos = $target.before($target.depth) + 2;
            }
          }
          const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, targetPos));
          view.dispatch(tr.setMeta('addToHistory', false));
          view.dispatch(view.state.tr.scrollIntoView());
          view.focus();
          return true;
        };

        const selectAllCellText = () => {
          const cellNode = view.state.doc.nodeAt(clickCellPos);
          if (!cellNode) return false;
          const from = clickCellPos + 1;
          const to = clickCellPos + cellNode.nodeSize - 1;
          const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
          view.dispatch(tr);
          view.focus();
          return true;
        };

        if (event.detail >= 2) {
          if (isTextSelectionInCell && selectionCellPos === clickCellPos) {
            return selectAllCellText();
          }
          return setCaretAtClick();
        }

        if (isTextSelectionInCell && selectionCellPos === clickCellPos) {
          return setCaretAtClick();
        }

        if (isCellSelection && clickedCellSelected) {
          return setCaretAtClick();
        }

        const $cell = view.state.doc.resolve(info.cellPos);
        view.dispatch(view.state.tr.setSelection(new CellSelection($cell)));
        view.focus();
        return true;
      },
      handleTextInput: (view, _from, _to, text) => {
        const selection = view.state.selection;
        if (!(selection instanceof CellSelection)) return false;

        const { tr, schema } = view.state;
        const paragraph = schema.nodes.paragraph;
        if (!paragraph) return false;

        const cells: Array<{ pos: number; nodeSize: number }> = [];
        selection.forEachCell((cell, pos) => {
          cells.push({ pos, nodeSize: cell.nodeSize });
        });

        cells.sort((a, b) => b.pos - a.pos).forEach(({ pos, nodeSize }) => {
          tr.replaceWith(pos + 1, pos + nodeSize - 1, paragraph.create(null, schema.text(text)));
        });

        const mappedAnchor = tr.mapping.map(selection.$anchorCell.pos);
        const cellNode = tr.doc.nodeAt(mappedAnchor);
        if (cellNode && cellNode.firstChild && cellNode.firstChild.isTextblock) {
          const textLength = cellNode.firstChild.textContent?.length || 0;
          const caretPos = mappedAnchor + 2 + textLength;
          tr.setSelection(TextSelection.create(tr.doc, caretPos));
        }
        view.dispatch(tr);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (!editor) return false;
        const selection = editor.state.selection;
        const selectedNodeType = selection instanceof NodeSelection
          ? String(selection.node?.type?.name || '')
          : '';
        const isProtectedBlockSelection =
          selection instanceof NodeSelection &&
          (selectedNodeType === 'image' || selectedNodeType === 'videoEmbed' || selectedNodeType === 'mermaidDiagram');
        if (isProtectedBlockSelection) {
          const isSpaceKey = event.key === ' ' || event.key === 'Spacebar';
          const isDeleteKey = event.key === 'Backspace' || event.key === 'Delete';
          const isTextEntryKey =
            event.key.length === 1 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey;
          const isBlockedMediaKey =
            isSpaceKey ||
            isDeleteKey ||
            isTextEntryKey ||
            event.key === 'Enter';

          if (isBlockedMediaKey) {
            if (isDeleteKey) return false;
            event.preventDefault();
            event.stopPropagation();
            if (isSpaceKey && selectedNodeType === 'videoEmbed') {
              const nodeDom = editor.view.nodeDOM(selection.from) as HTMLElement | null;
              const videoEl = nodeDom?.querySelector('video') as HTMLVideoElement | null;
              if (videoEl) {
                if (videoEl.paused) {
                  void videoEl.play().catch(() => null);
                } else {
                  videoEl.pause();
                }
              }
            }
            return true;
          }
        }
        const docEnd = editor.state.doc.content.size;
        const isNearDocumentEnd = selection.to >= Math.max(0, docEnd - 1);
        const shouldStickToBottomAfterEnter =
          event.key === 'Enter' &&
          selection.empty &&
          isNearDocumentEnd &&
          !hasAncestorNode(selection.$from, 'table');

        if (shouldStickToBottomAfterEnter) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!editor || editor.isDestroyed) return;
              const scrollContainers = getScrollableAncestors(editor.view.dom as HTMLElement);
              scrollContainers.forEach((scrollContainer) => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
              });
              const rootScroller = document.scrollingElement as HTMLElement | null;
              if (rootScroller) {
                rootScroller.scrollTop = rootScroller.scrollHeight;
              }
              window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
            });
          });
        }

        const isInlineTriggerCandidate =
          selection.empty &&
          !event.shiftKey &&
          !event.altKey &&
          !event.metaKey &&
          !event.ctrlKey;
        const { $from } = selection;
        const isEmptyCurrentLine =
          $from.parent?.isTextblock &&
          $from.parent.type?.name === 'paragraph' &&
          $from.parent.content.size === 0;

        const dispatchInlineEditorOpen = () => {
          const currentSelection = editor.state.selection;
          const pos = currentSelection.from;
          const node = currentSelection.$from.parent;
          const blockFrom = currentSelection.$from.start();
          const blockTo = currentSelection.$from.end();
          let blockMarkdown = '';
          try {
            const blockSlice = editor.state.doc.slice(blockFrom, blockTo);
            const serializer = DOMSerializer.fromSchema(editor.state.schema);
            const fragment = serializer.serializeFragment(blockSlice.content);
            const tmp = document.createElement('div');
            tmp.appendChild(fragment);
            blockMarkdown = (turndownRef.current?.turndown(tmp.innerHTML) || '').trim();
          } catch (err) {
            blockMarkdown = '';
          }
          const blockText = (node?.textContent || '').trim();
          const excerpt = blockText ? blockText.slice(0, 100) : 'Ligne vide';
          const coords = editor.view.coordsAtPos(pos);
          document.dispatchEvent(new CustomEvent('memoEditorSelectionChanged', {
            detail: {
              isSelected: true,
              nodeType: node?.type?.name || 'paragraph',
              selectionText: '',
              selectionMarkdown: '',
              blockText,
              blockMarkdown,
              selectionExcerpt: excerpt,
              positionFrom: blockFrom,
              positionTo: blockTo,
              coords: {
                top: coords.bottom + 10,
                left: coords.left,
                bottom: coords.bottom,
                right: coords.right,
              },
              inlineTrigger: 'space',
              focus: true,
            }
          }));
        };

        if (event.key === ' ' && isInlineTriggerCandidate && selection.empty) {
          const { $from } = selection;
          const isParagraph = $from.parent?.type?.name === 'paragraph';
          if (isParagraph) {
            const beforeText = $from.parent.textBetween(0, $from.parentOffset, ' ', ' ');
            const match = String(beforeText || '').match(/(?:^|\s)(https?:\/\/[^\s]+|www\.[^\s]+)$/i);
            const rawUrl = String(match?.[1] || '');
            if (rawUrl) {
              const from = $from.start() + beforeText.length - rawUrl.length;
              const to = $from.start() + $from.parentOffset;
              const inserted = insertExternalEmbedAtSelection(editor, from, to, rawUrl);
              if (inserted) {
                event.preventDefault();
                return true;
              }
            }
          }
        }

        if (event.key === ' ' && isInlineTriggerCandidate && isEmptyCurrentLine) {
          event.preventDefault();
          dispatchInlineEditorOpen();
          return true;
        }

        if (
          event.key === '/' &&
          isInlineTriggerCandidate
        ) {
          requestAnimationFrame(() => {
            if (!editor || editor.isDestroyed) return;
            const pos = editor.state.selection.from;
            const coords = editor.view.coordsAtPos(pos);
            const query = getSlashTriggerQuery() || '';
            setSlashActionQuery(query);
            setSlashActionMenuPos({ top: coords.bottom + 8, left: coords.left });
            setShowSlashActionMenu(true);
          });
          return false;
        }
        if (event.key === 'Escape' && showSlashActionMenu) {
          setSlashActionQuery('');
          setShowSlashActionMenu(false);
          return true;
        }
        const clearStoredMarks = () => {
          const blockedMarks = new Set(['code', 'textStyle', 'bold', 'italic', 'underline', 'strike', 'highlight']);
          const storedMarks = editor.state.storedMarks || editor.state.selection.$from.marks();
          if (!storedMarks?.length) return;
          const filtered = storedMarks.filter(mark => !blockedMarks.has(mark.type.name));
          if (filtered.length === storedMarks.length) return;
          const tr = editor.state.tr.setStoredMarks(filtered.length ? filtered : null);
          editor.view.dispatch(tr);
        };

        if (event.key === 'Backspace' && selection.empty) {
          if (
            showSlashActionMenu &&
            selection.$from.parent?.isTextblock &&
            selection.$from.parent.textContent === '/' &&
            selection.$from.parentOffset === 1
          ) {
            setSlashActionQuery('');
            setShowSlashActionMenu(false);
          }
          const { $from } = selection;
          const isAtStart = $from.parentOffset === 0;
          const isEmptyParagraph = $from.parent?.type?.name === 'paragraph' && $from.parent?.content?.size === 0;
          const inListItem = editor.isActive('listItem');
          if (isAtStart && isEmptyParagraph && !inListItem) {
            const parentDepth = $from.depth - 1;
            const indexInParent = parentDepth >= 0 ? $from.index(parentDepth) : -1;
            const prevSibling = parentDepth >= 0 && indexInParent > 0
              ? $from.node(parentDepth).child(indexInParent - 1)
              : null;
            const prevType = prevSibling?.type?.name || '';
            if (prevType === 'bulletList' || prevType === 'orderedList' || prevType === 'taskList') {
              event.preventDefault();
              const currentBlockDepth = $from.depth;
              const currentBlockPos = $from.before(currentBlockDepth);
              const currentBlockNode = $from.node(currentBlockDepth);
              const tr = editor.state.tr.delete(currentBlockPos, currentBlockPos + currentBlockNode.nodeSize);
              const targetPos = Math.max(1, currentBlockPos - 1);
              tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos), -1));
              editor.view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
          if (isAtStart && isEmptyParagraph && inListItem) {
            event.preventDefault();
            let listItemDepth = -1;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              if ($from.node(depth).type?.name === 'listItem') {
                listItemDepth = depth;
                break;
              }
            }
            if (listItemDepth > 0) {
              const listItemNode = $from.node(listItemDepth);
              const listNode = $from.node(listItemDepth - 1);
              const itemIndex = $from.index(listItemDepth - 1);
              const hasSiblingBefore = itemIndex > 0;
              const hasSiblingAfter = itemIndex < (listNode?.childCount || 0) - 1;
              const isPlainEmptyItem = listItemNode.childCount === 1
                && listItemNode.firstChild?.type?.name === 'paragraph'
                && listItemNode.firstChild?.content?.size === 0;
              if (isPlainEmptyItem && (hasSiblingBefore || hasSiblingAfter)) {
                const listItemPos = $from.before(listItemDepth);
                const tr = editor.state.tr.delete(listItemPos, listItemPos + listItemNode.nodeSize);
                const docSize = tr.doc.content.size;
                const rawTarget = hasSiblingAfter ? listItemPos + 1 : Math.max(1, listItemPos - 1);
                const targetPos = Math.max(1, Math.min(rawTarget, docSize));
                tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos), hasSiblingAfter ? 1 : -1));
                editor.view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
            // Fallback: only lift one level when deleting an empty list item.
            if (editor.chain().focus().liftListItem('listItem').run()) return true;
          }
        }

        if (event.key === 'Delete' && selection.empty) {
          const { $from } = selection;
          const inListItem = editor.isActive('listItem');
          const isAtEnd = $from.parentOffset === $from.parent.content.size;
          if (inListItem && isAtEnd) {
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              let afterPos = 0;
              try {
                afterPos = $from.after(depth);
              } catch (err) {
                continue;
              }
              if (afterPos <= 0 || afterPos >= editor.state.doc.content.size) continue;
              const $after = editor.state.doc.resolve(afterPos);
              const nextNode = $after.nodeAfter;
              if (!nextNode) continue;
              const isEmptySpacer = nextNode.type?.name === 'paragraph' && nextNode.content?.size === 0;
              if (isEmptySpacer) {
                event.preventDefault();
                let tr = editor.state.tr;
                let deletePos = afterPos;
                for (let i = 0; i < 16; i += 1) {
                  if (deletePos <= 0 || deletePos >= tr.doc.content.size) break;
                  const $probe = tr.doc.resolve(deletePos);
                  const probeNode = $probe.nodeAfter;
                  const probeIsEmptyParagraph = probeNode?.type?.name === 'paragraph' && probeNode?.content?.size === 0;
                  if (!probeIsEmptyParagraph) break;
                  tr = tr.delete(deletePos, deletePos + probeNode.nodeSize);
                }
                const mapped = tr.mapping.map(selection.from);
                tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, Math.min(mapped, tr.doc.content.size))), -1));
                editor.view.dispatch(tr.scrollIntoView());
                return true;
              }
              break;
            }
          }
        }

        if (
          !event.shiftKey &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
        ) {
          if (hasAncestorNode(selection.$from, 'table')) {
            const currentCellPos = selection instanceof CellSelection
              ? selection.$anchorCell.pos
              : getTableCellPosFromResolved(selection.$from);
            if (currentCellPos !== null) {
              const info = getTableCellInfoFromPos(editor.state.doc, currentCellPos);
              if (info) {
                let nextRow = info.rowIndex;
                let nextCol = info.colIndex;
                const colCount = getTableColumnCount(info.table);
                const rowCount = info.table.childCount;

                if (event.key === 'ArrowRight') {
                  nextCol += 1;
                  if (nextCol >= colCount) {
                    if (nextRow < rowCount - 1) {
                      nextRow += 1;
                      nextCol = 0;
                    } else {
                      event.preventDefault();
                      return true;
                    }
                  }
                } else if (event.key === 'ArrowLeft') {
                  nextCol -= 1;
                  if (nextCol < 0) {
                    if (nextRow > 0) {
                      nextRow -= 1;
                      nextCol = Math.max(0, colCount - 1);
                    } else {
                      event.preventDefault();
                      return true;
                    }
                  }
                } else if (event.key === 'ArrowDown') {
                  nextRow += 1;
                  if (nextRow >= rowCount) {
                    event.preventDefault();
                    return true;
                  }
                } else if (event.key === 'ArrowUp') {
                  nextRow -= 1;
                  if (nextRow < 0) {
                    event.preventDefault();
                    return true;
                  }
                }

                const nextPos = getTableCellPosByIndex(info.table, info.tablePos, nextRow, nextCol);
                if (nextPos !== null) {
                  event.preventDefault();
                  const $cell = editor.state.doc.resolve(nextPos);
                  editor.view.dispatch(editor.state.tr.setSelection(new CellSelection($cell)));
                  editor.view.focus();
                  return true;
                }
              }
            }
          }
        }

        if (event.key === 'Enter' && !event.shiftKey && hasAncestorNode(selection.$from, 'table')) {
          const cellPos = getTableCellPosFromResolved(selection.$from);
          if (cellPos !== null) {
            event.preventDefault();
            const $cell = editor.state.doc.resolve(cellPos);
            editor.view.dispatch(editor.state.tr.setSelection(new CellSelection($cell)));
            return true;
          }
        }

        if ((event.key === 'Delete' || event.key === 'Backspace') && selection instanceof CellSelection) {
          event.preventDefault();
          const { tr, schema } = editor.state;
          const paragraph = schema.nodes.paragraph;
          if (!paragraph) return true;

          const cells: Array<{ pos: number; nodeSize: number }> = [];
          selection.forEachCell((cell, pos) => {
            cells.push({ pos, nodeSize: cell.nodeSize });
          });

          if (cells.length === 0) return true;

          // If the selection covers the entire table, delete the table node
          const $anchor = selection.$anchorCell;
          let tablePos = -1;
          let tableNode: any = null;
          for (let d = $anchor.depth; d > 0; d--) {
            if ($anchor.node(d).type.name === 'table') {
              tablePos = $anchor.before(d);
              tableNode = $anchor.node(d);
              break;
            }
          }
          if (tablePos >= 0 && tableNode) {
            const totalCellCount = tableNode.content?.childCount
              ? tableNode.content.content.reduce((count: number, row: any) => {
                  const rowCellCount = row?.content?.childCount || 0;
                  return count + rowCellCount;
                }, 0)
              : 0;
            if (totalCellCount > 0 && cells.length >= totalCellCount) {
              tr.delete(tablePos, tablePos + tableNode.nodeSize);
              editor.view.dispatch(tr.scrollIntoView());
              return true;
            }
          }

          // Find top-left pos before modifying doc
          const minPos = cells.reduce((min, c) => Math.min(min, c.pos), Infinity);

          // Sort DESC for safe document modification
          cells.sort((a, b) => b.pos - a.pos).forEach(({ pos, nodeSize }) => {
            tr.replaceWith(pos + 1, pos + nodeSize - 1, paragraph.create());
          });

          // Reset selection to a single top-left cell
          if (minPos !== Infinity) {
            const mappedMinPos = tr.mapping.map(minPos);
            tr.setSelection(CellSelection.create(tr.doc, mappedMinPos));
          }

          editor.view.dispatch(tr);
          return true;
        }

        if (event.key === ' ' || event.key === 'Spacebar') {
          if (!editor.isActive('code')) return false;
          editor.chain().focus().insertContent(' ').unsetCode().run();
          clearStoredMarks();
          return true;
        }

        if (event.key === 'ArrowRight' && editor.isActive('code')) {
          setTimeout(() => {
            if (!editor.isActive('code')) {
              clearStoredMarks();
            }
          }, 0);
        }
        if (event.key === 'Enter') {
          const { state } = editor;
          const { selection } = state;
          const $from = selection.$from;
          const parent = $from.parent;
          if (parent?.type?.name === 'heading' && parent.attrs?.collapsed) {
            const level = parent.attrs.level || 1;
            const headingPos = $from.before($from.depth);
            const docSize = state.doc.content.size;
            let insertPos = docSize;

            // Find the end of the collapsed section to insert after it
            state.doc.nodesBetween(headingPos + parent.nodeSize, docSize, (node, pos) => {
              if (insertPos !== docSize) return false;
              if (node.type.name === 'heading' && node.attrs.level <= level) {
                insertPos = pos;
                return false;
              }
              return true;
            });

            event.preventDefault();
            const tr = state.tr.insert(insertPos, state.schema.nodes.heading.create({ level }, state.schema.text('')));
            const nextSelection = TextSelection.create(tr.doc, insertPos + 1);
            tr.setSelection(nextSelection);
            editor.view.dispatch(tr);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        if (!event || !(event instanceof DragEvent)) return false;
        const rawCustomDocId = String(event.dataTransfer?.getData('application/x-gotoolkit-docid') || '').trim();
        const rawUriList = String(event.dataTransfer?.getData('text/uri-list') || '').trim();
        const rawPlainText = String(event.dataTransfer?.getData('text/plain') || '').trim();
        const droppedDocId = String(rawCustomDocId || rawUriList || rawPlainText || '').trim().replace(/^memo:\/\//, '');
        const isMemoUriDrop = rawUriList.startsWith('memo://');
        const isDocumentPanelDrop = Boolean(rawCustomDocId) || isMemoUriDrop;
        if (droppedDocId && (isDocumentPanelDrop || /^(share:|common:|[a-z0-9-]{8,})/i.test(droppedDocId))) {
          event.preventDefault();
          event.stopPropagation();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const insertionPos = coords?.pos ?? view.state.selection.from;
          const resolver = (window as any).GoToolkitMemoResolveLinkTarget;
          const apply = async () => {
            const target = typeof resolver === 'function'
              ? await resolver(droppedDocId)
              : { id: droppedDocId, title: 'Document', icon: '' };
            if (!target?.id) return;
            const schema = editor.state.schema;
            const nodeType = schema?.nodes?.memoLinkBlock;
            if (!nodeType) return;
            const safePos = Math.max(0, Math.min(insertionPos, editor.state.doc.content.size));
            const linkNode = nodeType.create({
              href: `memo://${target.id}`,
              title: target.title || 'Document',
              icon: target.icon || '',
              documentId: target.id
            });
            const paragraph = schema.nodes.paragraph?.create?.() || null;
            const fragment = paragraph ? schema.nodes.doc.create(null, [linkNode, paragraph]).content : schema.nodes.doc.create(null, [linkNode]).content;
            const tr = editor.state.tr.insert(safePos, fragment);
            view.dispatch(tr);
          };
          apply();
          return true;
        }
        const droppedFiles = Array.from(event.dataTransfer?.files || []);
        const droppedAcceptedFiles = droppedFiles.filter((file) =>
          isSupportedImageFile(file) || isSupportedVideoFile(file) || isSupportedGenericFile(file)
        );
        if (droppedAcceptedFiles.length) {
          console.log('[SimpleEditor] media insert:drop', droppedAcceptedFiles.map((file) => ({
            fileName: String(file?.name || ''),
            mimeType: String(file?.type || ''),
            size: Number(file?.size || 0),
            type: isSupportedVideoFile(file) ? 'video' : isSupportedImageFile(file) ? 'image' : 'file',
          })));
          event.preventDefault();
          event.stopPropagation();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const insertionPos = coords?.pos ?? view.state.selection.from;
          (async () => {
            const mediaNodes = await buildDroppedMediaContent(droppedAcceptedFiles);
            if (!mediaNodes.length || !editor) return;
            const content = mediaNodes.flatMap((mediaNode, index) => (
              index === 0 ? [mediaNode] : [{ type: 'paragraph' }, mediaNode]
            ));
            editor.chain().focus().insertContentAt(insertionPos, content).run();
          })();
          return true;
        }
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!coords) return false;
        const originCellPos = getTableCellPosFromResolved(view.state.selection.$from);
        const targetCellPos = getTableCellPosFromResolved(view.state.doc.resolve(coords.pos));
        if (originCellPos !== null && targetCellPos !== null && originCellPos !== targetCellPos) {
          event.preventDefault();
          return true;
        }
        const selection = view.state.selection;
        const originIsDetailsNode = selection instanceof NodeSelection && selection.node.type.name === 'details';
        const originInDetails = originIsDetailsNode || hasAncestorNode(view.state.selection.$from, 'details');
        const targetInDetails = hasAncestorNode(view.state.doc.resolve(coords.pos), 'details');
        if (originInDetails || targetInDetails) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const start = performance.now();
      scheduleEditorSnapshot(editor, { delayMs: 180 });
      scheduleEditorSync(editor, { delayMs: 500 });
      const totalDuration = Math.round(performance.now() - start);
      if (totalDuration > 10) {
        // no-op
      }
    },
    onBlur: ({ editor }) => {
      scheduleEditorSnapshot(editor, { delayMs: 0 });
      scheduleEditorSync(editor, { delayMs: 0 });
    },
  });

  React.useEffect(() => {
    return () => {
      clearPendingSaveTasks();
      clearPendingSnapshotTasks();
    };
  }, [clearPendingSaveTasks, clearPendingSnapshotTasks]);

  React.useEffect(() => {
    if (!editor) return;
    const syncSpellcheck = () => {
      applyEditorSpellcheckPreferences(editor);
    };
    syncSpellcheck();
    editor.on('create', syncSpellcheck);
    editor.on('update', syncSpellcheck);
    window.addEventListener(EDITOR_SPELLCHECK_EVENT, syncSpellcheck as EventListener);
    return () => {
      editor.off('create', syncSpellcheck);
      editor.off('update', syncSpellcheck);
      window.removeEventListener(EDITOR_SPELLCHECK_EVENT, syncSpellcheck as EventListener);
    };
  }, [editor]);

  const insertImageFiles = React.useCallback(async (files: FileList | File[]) => {
    if (!editor || !files?.length) return;
    const selected = Array.from(files).filter(isSupportedImageFile);
    if (!selected.length) return;
    const imageNodes = (await buildDroppedMediaContent(selected)).filter((node) => node?.type === 'image');
    if (!imageNodes.length) return;
    const content = imageNodes.flatMap((imageNode, index) => (
      index === 0 ? [imageNode] : [{ type: 'paragraph' }, imageNode]
    ));
    editor.chain().focus().insertContent(content).run();
  }, [buildDroppedMediaContent, editor]);

  const openImagePicker = React.useCallback(() => {
    console.log('[SimpleEditor] media picker:open', { trigger: 'slash-menu', type: 'image' });
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg,image/gif';
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.addEventListener('change', async () => {
      const files = input.files;
      if (files?.length) {
        await insertImageFiles(files);
      }
      try {
        input.remove();
      } catch (err) {
        // noop
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [insertImageFiles]);

  const openVideoInsertDialog = React.useCallback(() => {
    if (!editor) return;
    console.log('[SimpleEditor] media picker:open', { trigger: 'slash-menu', type: 'video' });
    const insertVideoNode = (attrs: Record<string, any>) => {
      const normalizedSrc = String(attrs?.src || '').trim();
      const safeSrc = sanitizeUrl(normalizedSrc, ['http', 'https', 'blob', 'data']);
      if (!safeSrc) return;

      const label = (() => {
        if (attrs?.fileName) return String(attrs.fileName);
        if (attrs?.title) return String(attrs.title);
        const withoutQuery = safeSrc.split('#')[0].split('?')[0];
        const file = withoutQuery.split('/').pop() || '';
        return file || 'video';
      })();

      const mimeType = String(attrs?.mimeType || '').trim() || (
        (/\.mp4([?#].*)?$/i.test(safeSrc)
          ? 'video/mp4'
          : (/\.mov([?#].*)?$/i.test(safeSrc)
            ? 'video/quicktime'
            : (/\.m4v([?#].*)?$/i.test(safeSrc) ? 'video/x-m4v' : 'video/webm')))
      );

      editor
        .chain()
        .focus()
        .insertContent({
          type: 'videoEmbed',
          attrs: {
            src: safeSrc,
            localSrc: String(attrs?.localSrc || '').trim(),
            title: label,
            fileName: label,
            mimeType,
          },
        })
        .run();
    };

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mp4,.webm,.mov,.m4v';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        try { input.remove(); } catch (err) { /* noop */ }
        return;
      }
      const mimeType = String(file.type || '').toLowerCase();
      const looksSupported = isSupportedVideoFile(file);
      if (!looksSupported) {
        try { input.remove(); } catch (err) { /* noop */ }
        return;
      }
      try {
        const mediaNodes = await buildDroppedMediaContent([file]);
        const videoNode = mediaNodes.find((node) => node?.type === 'videoEmbed');
        const videoAttrs = videoNode?.attrs && typeof videoNode.attrs === 'object' ? videoNode.attrs : null;
        if (!videoAttrs?.src) throw new Error('Missing prepared video attrs');
        insertVideoNode({
          ...videoAttrs,
          fileName: file.name || videoAttrs.fileName || 'video',
          mimeType: mimeType || videoAttrs.mimeType || undefined,
        });
      } catch (err) {
        (window as any).GoToolkitMemoToast?.('Import vidéo échoué', true);
      } finally {
        try { input.remove(); } catch (err) { /* noop */ }
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [buildDroppedMediaContent, editor]);

  const uploadFilesToFileBlocks = React.useCallback(async (files: File[]) => {
    const fileNodes = (await buildDroppedMediaContent(files)).filter((node) => node?.type === 'fileBlock');
    return fileNodes.map((node) => ({ ...(node?.attrs || {}) }));
  }, [buildDroppedMediaContent]);

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(Boolean(editable));
  }, [editor, editable]);

  const applyTableDomStyles = React.useCallback((
    tableDom: HTMLTableElement,
    numericColumns: boolean[]
  ) => {
    Array.from(tableDom.querySelectorAll('tr')).forEach((row) => {
      let colIndex = 0;
      Array.from(row.querySelectorAll('th, td')).forEach((cell) => {
        const span = cell.colSpan || 1;
        const spanIndices = Array.from({ length: span }, (_v, i) => colIndex + i);
        const isNumeric = spanIndices.every(idx => numericColumns[idx]);

        cell.classList.toggle('table-col-numeric', isNumeric);
        cell.classList.remove('table-cell-pinned', 'table-cell-pinned-divider');
        (cell as HTMLElement).style.left = '';
        (cell as HTMLElement).style.zIndex = '';

        colIndex += span;
      });
    });
  }, []);

  const syncTableScrollbars = React.useCallback(() => {
    if (!editor) return;
    editor.view.dom.querySelectorAll('.tableWrapper').forEach((wrapper) => {
      const table = wrapper.querySelector('table') as HTMLTableElement | null;
      if (!table) return;
      wrapper.removeAttribute('data-pinned-width');
      wrapper.style.removeProperty('--table-pinned-width');
      let scrollbar = wrapper.querySelector('.table-scrollbar') as HTMLDivElement | null;
      if (!scrollbar) {
        scrollbar = document.createElement('div');
        scrollbar.className = 'table-scrollbar';
        scrollbar.innerHTML = '<div class="table-scrollbar__inner"></div>';
        wrapper.insertBefore(scrollbar, wrapper.firstChild);
      }
      const inner = scrollbar.querySelector('.table-scrollbar__inner') as HTMLDivElement | null;
      if (!inner) return;
      inner.style.width = `${table.scrollWidth}px`;

      const needsHorizontal = table.scrollWidth > wrapper.clientWidth + 2;
      scrollbar.style.display = needsHorizontal ? 'block' : 'none';

      if (!wrapper.getAttribute('data-scrollbar-init')) {
        wrapper.setAttribute('data-scrollbar-init', 'true');
        let syncing = false;
        wrapper.addEventListener('scroll', () => {
          if (syncing) return;
          syncing = true;
          scrollbar!.scrollLeft = wrapper.scrollLeft;
          syncing = false;
        });
        scrollbar.addEventListener('scroll', () => {
          if (syncing) return;
          syncing = true;
          wrapper.scrollLeft = scrollbar!.scrollLeft;
          syncing = false;
        });
      }
    });
  }, [editor]);

  const applySmartTableLayout = React.useCallback(() => {
    if (!editor || isAutoLayoutRef.current) return;
    const view = editor.view;
    if (view.dom.classList.contains('resize-cursor')) return;
    const resizeState = columnResizingWithMaxPluginKey.getState(view.state);
    if (resizeState?.dragging) return;

    const tables = Array.from(view.dom.querySelectorAll('table')) as HTMLTableElement[];
    if (!tables.length) return;

    tables.forEach((tableDom) => {
      const rows = Array.from(tableDom.querySelectorAll('tr'));
      if (!rows.length) return;

      const colCount = rows.reduce((max, row) => {
        const count = Array.from(row.querySelectorAll('th, td'))
          .reduce((sum, cell) => sum + (cell.colSpan || 1), 0);
        return Math.max(max, count);
      }, 0);

      if (!colCount) return;

      const numericFlags = new Array(colCount).fill(true);
      const hasValue = new Array(colCount).fill(false);

      rows.forEach((row) => {
        let colIndex = 0;
        Array.from(row.querySelectorAll('th, td')).forEach((cell) => {
          const span = cell.colSpan || 1;
          const text = cell.textContent || '';
          const numeric = isNumericText(text);
          const hasText = Boolean(text.trim());

          for (let i = 0; i < span; i++) {
            if (hasText) {
              hasValue[colIndex + i] = true;
              if (!numeric) numericFlags[colIndex + i] = false;
            }
          }
          colIndex += span;
        });
      });

      const numericColumns = numericFlags.map((flag, idx) => flag && hasValue[idx]);

      applyTableDomStyles(tableDom, numericColumns);
    });

    syncTableScrollbars();
  }, [editor, applyTableDomStyles, syncTableScrollbars]);

  const scheduleTableLayout = React.useCallback(() => {
    if (tableLayoutRafRef.current) {
      cancelAnimationFrame(tableLayoutRafRef.current);
    }
    tableLayoutRafRef.current = requestAnimationFrame(() => {
      applySmartTableLayout();
      tableLayoutRafRef.current = null;
    });
  }, [applySmartTableLayout]);

  const copyBlockHtmlAtPos = React.useCallback((pos: number) => {
    if (!editor) return;
    try {
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return;
      const slice = editor.state.doc.slice(pos, pos + node.nodeSize);
      const serializer = DOMSerializer.fromSchema(editor.state.schema);
      const fragment = serializer.serializeFragment(slice.content);
      const tmp = document.createElement('div');
      tmp.appendChild(fragment);
      const html = tmp.innerHTML.trim();
      if (!html) return;
      const text = (tmp.textContent || '').trim();
      const write = async () => {
        if (navigator.clipboard && typeof (navigator.clipboard as any).write === 'function' && typeof (window as any).ClipboardItem === 'function') {
          const item = new (window as any).ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text || html], { type: 'text/plain' })
          });
          await (navigator.clipboard as any).write([item]);
        } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text || html);
        }
      };
      write().then(() => {
        document.dispatchEvent(new CustomEvent('copyToast', {
          detail: { message: 'Contenu copié' }
        }));
      });
    } catch (err) {
      // ignore
    }
  }, [editor]);

  React.useEffect(() => {
    if (!editor) return;
    const syncTableWrappers = () => {
      editor.view.dom.querySelectorAll('.tableWrapper').forEach((el) => {
        el.classList.add('node-table');
      });
    };
    syncTableWrappers();
    editor.on('update', syncTableWrappers);
    return () => {
      editor.off('update', syncTableWrappers);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor) return;
    syncTableScrollbars();
    editor.on('update', syncTableScrollbars);
    window.addEventListener('resize', syncTableScrollbars);
    window.addEventListener('scroll', syncTableScrollbars, { passive: true });
    return () => {
      editor.off('update', syncTableScrollbars);
      window.removeEventListener('resize', syncTableScrollbars);
      window.removeEventListener('scroll', syncTableScrollbars);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor) return;
    let isAdjusting = false;
    const clearInlineCodeCarryover = () => {
      if (isAdjusting) return;
      if (editor.isActive('code')) return;
      const storedMarks = editor.state.storedMarks || editor.state.selection.$from.marks();
      if (!storedMarks?.length) return;
      const blockedMarks = new Set(['code', 'textStyle', 'bold', 'italic', 'underline', 'strike', 'highlight']);
      const filtered = storedMarks.filter(mark => !blockedMarks.has(mark.type.name));
      if (filtered.length === storedMarks.length) return;
      const tr = editor.state.tr.setStoredMarks(filtered.length ? filtered : null);
      isAdjusting = true;
      editor.view.dispatch(tr);
      isAdjusting = false;
    };
    editor.on('selectionUpdate', clearInlineCodeCarryover);
    return () => {
      editor.off('selectionUpdate', clearInlineCodeCarryover);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor) return;

    const syncDetailsState = () => {
      editor.view.dom.querySelectorAll('details.details, .details.node-details').forEach((el) => {
        const detailsEl = el as HTMLElement & { open?: boolean };
        const dataOpen = detailsEl.getAttribute('data-open');
        const contentEl = detailsEl.querySelector('[data-type="detailsContent"]') as HTMLElement | null;
        const isContentHidden = contentEl ? contentEl.hasAttribute('hidden') : false;
        const isOpen = dataOpen !== null
          ? dataOpen === 'true'
          : contentEl
            ? !isContentHidden
            : !!detailsEl.open;
        detailsEl.classList.toggle('is-open', isOpen);
      });
    };

    const handleToggle = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!(target instanceof HTMLDetailsElement)) return;
      const isOpen = target.open || target.getAttribute('data-open') === 'true';
      target.classList.toggle('is-open', isOpen);
    };

    syncDetailsState();
    editor.view.dom.addEventListener('toggle', handleToggle, true);
    editor.on('update', syncDetailsState);

    return () => {
      editor.view.dom.removeEventListener('toggle', handleToggle, true);
      editor.off('update', syncDetailsState);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor || !containerRef.current) return;
    let selectionBoxRaf: number | null = null;

    const computeSelectionBox = () => {
      const selection = editor.state.selection;
      const cellPositions: number[] = [];

      if (selection instanceof CellSelection) {
        selection.forEachCell((_cell, pos) => {
          cellPositions.push(pos);
        });
      } else {
        const cellPos = getTableCellPosFromResolved(selection.$from);
        if (cellPos !== null) {
          cellPositions.push(cellPos);
        }
      }

      if (cellPositions.length === 0) {
        setTableSelectionBox(null);
        return;
      }

      let minTop = Infinity;
      let minLeft = Infinity;
      let maxRight = -Infinity;
      let maxBottom = -Infinity;

      cellPositions.forEach((pos) => {
        const cellDom = editor.view.nodeDOM(pos) as HTMLElement | null;
        if (!cellDom) return;
        const rect = cellDom.getBoundingClientRect();
        minTop = Math.min(minTop, rect.top);
        minLeft = Math.min(minLeft, rect.left);
        maxRight = Math.max(maxRight, rect.right);
        maxBottom = Math.max(maxBottom, rect.bottom);
      });

      if (minTop === Infinity || !containerRef.current) {
        setTableSelectionBox(null);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const nextBox = {
        top: minTop - containerRect.top,
        left: minLeft - containerRect.left,
        width: maxRight - minLeft,
        height: maxBottom - minTop,
      };

      setTableSelectionBox(prev => {
        if (!prev || prev.top !== nextBox.top || prev.left !== nextBox.left || 
            prev.width !== nextBox.width || prev.height !== nextBox.height) {
          return nextBox;
        }
        return prev;
      });
    };

    const updateTableSelectionBox = () => {
      if (selectionBoxRaf) {
        cancelAnimationFrame(selectionBoxRaf);
      }
      selectionBoxRaf = requestAnimationFrame(() => {
        computeSelectionBox();
        selectionBoxRaf = null;
      });
    };

    updateTableSelectionBox();
    editor.on('selectionUpdate', updateTableSelectionBox);
    editor.on('update', updateTableSelectionBox);
    window.addEventListener('resize', updateTableSelectionBox);
    const container = containerRef.current;
    container.addEventListener('scroll', updateTableSelectionBox, { passive: true });
    window.addEventListener('scroll', updateTableSelectionBox, { passive: true });

    return () => {
      editor.off('selectionUpdate', updateTableSelectionBox);
      editor.off('update', updateTableSelectionBox);
      window.removeEventListener('resize', updateTableSelectionBox);
      container.removeEventListener('scroll', updateTableSelectionBox);
      window.removeEventListener('scroll', updateTableSelectionBox);
      if (selectionBoxRaf) {
        cancelAnimationFrame(selectionBoxRaf);
      }
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor) return;
    scheduleTableLayout();
    editor.on('update', scheduleTableLayout);
    window.addEventListener('resize', scheduleTableLayout);
    return () => {
      editor.off('update', scheduleTableLayout);
      window.removeEventListener('resize', scheduleTableLayout);
      if (tableLayoutRafRef.current) {
        cancelAnimationFrame(tableLayoutRafRef.current);
        tableLayoutRafRef.current = null;
      }
    };
  }, [editor, scheduleTableLayout]);

  React.useEffect(() => {
    if (!editor || !tableSelectionResize) return;

    const handleMouseMove = (event: MouseEvent) => {
      const info = getTableCellInfo(editor.view, event);
      if (!info || info.tablePos !== tableSelectionResize.tablePos) return;
      const nextSelection = CellSelection.create(editor.state.doc, tableSelectionResize.anchorPos, info.cellPos);
      editor.view.dispatch(editor.state.tr.setSelection(nextSelection));
    };

    const handleMouseUp = () => {
      setTableSelectionResize(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [editor, tableSelectionResize]);

  React.useEffect(() => {
    const memoCard = containerRef.current?.closest('.memo-card');
    if (!memoCard) return;

    const updateFocusState = () => {
      const activeElement = document.activeElement;
      setIsFocusWithinMemoCard(!!activeElement && memoCard.contains(activeElement));
    };

    const handleFocusOut = () => {
      requestAnimationFrame(updateFocusState);
    };

    memoCard.addEventListener('focusin', updateFocusState);
    memoCard.addEventListener('focusout', handleFocusOut);
    updateFocusState();

    return () => {
      memoCard.removeEventListener('focusin', updateFocusState);
      memoCard.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Expose editor to window for the bridge
  React.useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragState && !mouseDownPoints) return;
      if (!containerRef.current || !editor) return;

      const x = e.clientX;
      const y = e.clientY;
      maybeAutoScroll(y);

      if (!dragState && mouseDownPoints) {
        const dist = Math.sqrt(Math.pow(x - mouseDownPoints.x, 2) + Math.pow(y - mouseDownPoints.y, 2));
        if (dist > 5) {
          setDragState({ ...mouseDownPoints, x, y });
        }
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      setDragState(prev => prev ? { ...prev, x, y } : null);

      // Update drop indicator
      if (dragState) {
        const info = getTableCellInfo(editor.view, e);
        if (info && info.tablePos === dragState.tablePos) {
          const cellDOM = editor.view.nodeDOM(info.cellPos) as HTMLElement;
          const rect = cellDOM.getBoundingClientRect();
          const tableDOM = editor.view.nodeDOM(info.tablePos) as HTMLElement;
          const tableRect = tableDOM.getBoundingClientRect();

          if (dragState.type === 'row') {
            const isAfter = y > rect.top + rect.height / 2;
            setDropIndicator({
              top: (isAfter ? rect.bottom : rect.top) - containerRect.top,
              left: tableRect.left - containerRect.left,
              width: tableRect.width,
              type: 'row'
            });
          } else {
            const isAfter = x > rect.left + rect.width / 2;
            setDropIndicator({
              top: tableRect.top - containerRect.top,
              left: (isAfter ? rect.right : rect.left) - containerRect.left,
              height: tableRect.height,
              type: 'col'
            });
          }
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (dragState && editor) {
        const info = getTableCellInfo(editor.view, e);
        if (info && info.tablePos === dragState.tablePos) {
          const cellDOM = editor.view.nodeDOM(info.cellPos) as HTMLElement;
          const rect = cellDOM.getBoundingClientRect();
          
          if (dragState.type === 'row') {
            const isAfter = e.clientY > rect.top + rect.height / 2;
            let targetIndex = isAfter ? info.rowIndex + 1 : info.rowIndex;
            // Adjustment if target is after the dragged row
            if (targetIndex > dragState.index) targetIndex--;
            if (targetIndex !== dragState.index) {
              moveRow(editor, dragState.tablePos, dragState.index, targetIndex);
            }
          } else {
            const isAfter = e.clientX > rect.left + rect.width / 2;
            let targetIndex = isAfter ? info.colIndex + 1 : info.colIndex;
            if (targetIndex > dragState.index) targetIndex--;
            if (targetIndex !== dragState.index) {
              moveColumn(editor, dragState.tablePos, dragState.index, targetIndex);
            }
          }
        } else {
          const target = getBlockTargetFromCoords(e.clientX, e.clientY);
          if (target) {
            const rect = getBlockRectForPos(target.pos, target.node);
            const placeAfter = rect ? e.clientY > rect.top + rect.height / 2 : true;
            if (target.pos !== dragState.tablePos) {
              moveBlockNode(dragState.tablePos, target.pos, placeAfter);
            }
          }
        }
      } else if (mouseDownPoints) {
        setTableContextMenu({ 
          top: e.clientY, 
          left: e.clientX, 
          type: mouseDownPoints.type, 
          index: mouseDownPoints.index, 
          tablePos: mouseDownPoints.tablePos 
        });
      }

      setDragState(null);
      setMouseDownPoints(null);
      setDropIndicator(null);
    };

    if (dragState || mouseDownPoints) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState, mouseDownPoints, editor]);

  React.useEffect(() => {
    if (!editor) return;
    if (!dragState && !blockDragState) {
      setDragGhost(null);
      return;
    }

    if (dragGhost) return;
    if (dragState) {
      const tableDOM = editor.view.nodeDOM(dragState.tablePos) as HTMLElement | null;
      if (!tableDOM) return;
      const ghost =
        dragState.type === 'row'
          ? buildRowGhost(tableDOM, dragState.index)
          : buildColGhost(tableDOM, dragState.index);
      if (!ghost) return;
      const offsetX = dragState.x - ghost.rect.left;
      const offsetY = dragState.y - ghost.rect.top;
      setDragGhost({
        html: ghost.html,
        width: ghost.rect.width,
        height: ghost.rect.height,
        offsetX,
        offsetY
      });
      return;
    }

    if (blockDragState) {
      const node = editor.state.doc.nodeAt(blockDragState.pos);
      if (!node) return;
      const ghost = buildBlockGhost(blockDragState.pos, node);
      if (!ghost) return;
      const offsetX = blockDragState.x - ghost.rect.left;
      const offsetY = blockDragState.y - ghost.rect.top;
      setDragGhost({
        html: ghost.html,
        width: ghost.rect.width,
        height: ghost.rect.height,
        offsetX,
        offsetY
      });
    }
  }, [dragState, blockDragState, dragGhost, editor]);

  const moveBlockNode = (fromPos: number, targetPos: number, placeAfter: boolean) => {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(fromPos);
    const targetNode = editor.state.doc.nodeAt(targetPos);
    if (!node || !targetNode) return;

    let insertPos = targetPos + (placeAfter ? targetNode.nodeSize : 0);
    if (insertPos > fromPos) {
      insertPos -= node.nodeSize;
    }
    if (insertPos === fromPos) return;

    const tr = editor.state.tr;
    tr.delete(fromPos, fromPos + node.nodeSize);
    tr.insert(insertPos, node);
    tr.setSelection(NodeSelection.create(tr.doc, insertPos));
    editor.view.dispatch(tr);
  };

  const getBlockTargetFromCoords = (x: number, y: number) => {
    if (!editor) return null;
    const coords = editor.view.posAtCoords({ left: x, top: y });
    if (!coords) return null;
    const $pos = editor.state.doc.resolve(coords.pos);
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d);
      if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
        return { pos: $pos.before(d), node };
      }
      if (node.type.name === 'listItem') {
        continue;
      }
      if (node.isBlock && node.type.name !== 'doc') {
        return { pos: $pos.before(d), node };
      }
    }
    return null;
  };

  const updateMermaidHandles = React.useCallback(() => {
    if (!editor || !containerRef.current) return;
    if (hoveredMermaidPos === null) {
      setMermaidHandles([]);
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const handles: Array<{ top: number, left: number, pos: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'mermaidDiagram') return;
      if (pos !== hoveredMermaidPos) return;
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
      const wrapper = dom?.closest('.mermaid-diagram-wrapper') as HTMLElement | null;
      const rect = (wrapper || dom)?.getBoundingClientRect();
      if (!rect) return;
      handles.push({
        top: rect.top - containerRect.top + 10,
        left: rect.left - containerRect.left + 5,
        pos
      });
    });
    setMermaidHandles(handles);
  }, [editor, hoveredMermaidPos]);

  const updateMediaHandles = React.useCallback(() => {
    if (!editor || !containerRef.current) return;
    if (hoveredMediaPos === null) {
      setMediaHandles([]);
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const handles: Array<{ top: number, left: number, pos: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      const isMediaNode = node.type.name === 'image' || node.type.name === 'videoEmbed';
      if (!isMediaNode || pos !== hoveredMediaPos) return;
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
      const wrapper = dom?.closest('.memo-image-wrapper, .memo-video-wrapper') as HTMLElement | null;
      const rect = (wrapper || dom)?.getBoundingClientRect();
      if (!rect) return;
      handles.push({
        top: rect.top - containerRect.top + 10,
        left: rect.left - containerRect.left + 5,
        pos
      });
    });
    setMediaHandles(handles);
  }, [editor, hoveredMediaPos]);

  React.useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => updateMermaidHandles();
    handleUpdate();
    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [editor, updateMermaidHandles]);

  React.useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => updateMediaHandles();
    handleUpdate();
    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [editor, updateMediaHandles]);

  const getBlockRectForPos = (pos: number, node: PMNode) => {
    if (!editor || !containerRef.current) return null;
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (dom?.getBoundingClientRect) {
      let rect = dom.getBoundingClientRect();
      const wrapper = dom.closest('.tableWrapper, .mermaid-diagram-wrapper, .alert-wrapper');
      if (wrapper) {
        rect = wrapper.getBoundingClientRect();
      }
      return rect;
    }
    const start = editor.view.coordsAtPos(pos);
    const end = editor.view.coordsAtPos(pos + node.nodeSize, -1);
    return {
      top: start.top,
      bottom: end.bottom,
      left: start.left,
      right: end.right,
      width: containerRef.current.getBoundingClientRect().width
    } as DOMRect;
  };

  const buildRowGhost = (tableDOM: HTMLElement, rowIndex: number) => {
    const rows = Array.from(tableDOM.querySelectorAll('tr'));
    const row = rows[rowIndex] as HTMLElement | undefined;
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    const ghostTable = document.createElement('table');
    ghostTable.className = tableDOM.className;
    ghostTable.style.borderCollapse = 'collapse';
    const tbody = document.createElement('tbody');
    tbody.appendChild(row.cloneNode(true));
    ghostTable.appendChild(tbody);
    return { html: ghostTable.outerHTML, rect };
  };

  const buildColGhost = (tableDOM: HTMLElement, colIndex: number) => {
    const rows = Array.from(tableDOM.querySelectorAll('tr'));
    const ghostTable = document.createElement('table');
    ghostTable.className = tableDOM.className;
    ghostTable.style.borderCollapse = 'collapse';
    const tbody = document.createElement('tbody');
    let cellRect: DOMRect | null = null;
    rows.forEach((row) => {
      const cell = row.children[colIndex] as HTMLElement | undefined;
      if (!cell) return;
      if (!cellRect) cellRect = cell.getBoundingClientRect();
      const newRow = document.createElement('tr');
      const cloned = cell.cloneNode(true) as HTMLElement;
      newRow.appendChild(cloned);
      tbody.appendChild(newRow);
    });
    if (!tbody.children.length || !cellRect) return null;
    ghostTable.appendChild(tbody);
    const tableRect = tableDOM.getBoundingClientRect();
    const rect = new DOMRect((cellRect as DOMRect).left, tableRect.top, (cellRect as DOMRect).width, tableRect.height);
    return { html: ghostTable.outerHTML, rect };
  };

  const buildBlockGhost = (pos: number, node: PMNode) => {
    if (!editor) return null;
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    const wrapper = dom?.closest('.tableWrapper, .mermaid-diagram-wrapper, .alert-wrapper');
    const target = (wrapper as HTMLElement | null) || dom;
    if (!target) return null;
    const rect = getBlockRectForPos(pos, node);
    if (!rect) return null;
    return { html: target.outerHTML, rect };
  };

  const maybeAutoScroll = (clientY: number) => {
    const threshold = 140;
    const maxSpeed = 24;
    if (clientY < threshold) {
      const speed = Math.min(maxSpeed, Math.ceil((threshold - clientY) / 6));
      window.scrollBy(0, -speed);
      return;
    }
    const distanceBottom = clientY - (window.innerHeight - threshold);
    if (distanceBottom > 0) {
      const speed = Math.min(maxSpeed, Math.ceil(distanceBottom / 6));
      window.scrollBy(0, speed);
    }
  };

  React.useEffect(() => {
    if (!editor || (!blockDragPending && !blockDragState)) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (blockDragPending && !blockDragState) {
        const dx = Math.abs(e.clientX - blockDragPending.startX);
        const dy = Math.abs(e.clientY - blockDragPending.startY);
        if (dx > 4 || dy > 4) {
          blockDragMovedRef.current = true;
          setBlockDragState({
            pos: blockDragPending.pos,
            nodeSize: blockDragPending.nodeSize,
            x: e.clientX,
            y: e.clientY
          });
        } else {
          return;
        }
      }

      if (blockDragState && containerRef.current) {
        setBlockDragState(prev => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
        maybeAutoScroll(e.clientY);
        const target = getBlockTargetFromCoords(e.clientX, e.clientY);
        if (target) {
          const rect = getBlockRectForPos(target.pos, target.node);
          if (rect) {
            const placeAfter = e.clientY > rect.top + rect.height / 2;
            const containerRect = containerRef.current.getBoundingClientRect();
            setBlockDropIndicator({
              top: (placeAfter ? rect.bottom : rect.top) - containerRect.top,
              left: rect.left - containerRect.left,
              width: rect.width
            });
          } else {
            setBlockDropIndicator(null);
          }
        } else {
          setBlockDropIndicator(null);
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (blockDragState && editor) {
        const target = getBlockTargetFromCoords(e.clientX, e.clientY);
        if (target) {
          const rect = getBlockRectForPos(target.pos, target.node);
          const placeAfter = rect ? e.clientY > rect.top + rect.height / 2 : true;
          if (target.pos !== blockDragState.pos) {
            moveBlockNode(blockDragState.pos, target.pos, placeAfter);
          }
        }
      }

      setBlockDragPending(null);
      setBlockDragState(null);
      setBlockDropIndicator(null);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [blockDragPending, blockDragState, editor]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!editor || dragState || blockDragState || !containerRef.current) return;
    
    // Don't hide handles if mouse is over them
    if ((e.target as HTMLElement).closest('.table-handle, .quote-handle, .details-handle, .mermaid-handle, .node-handle, .block-delete-button')) return;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    const containerRect = containerRef.current.getBoundingClientRect();

    // 1. Generic Block Delete Handle (Top-Right)
    const tableEl = element?.closest('table');
    const blockquoteEl = element?.closest('.node-blockquote');
    const detailsEl = element?.closest('.node-details');
    const mermaidEl = element?.closest('.node-mermaidDiagram, .mermaid-diagram-container');
    const mediaEl = element?.closest('.memo-image-frame, .memo-video-frame, .node-image, .node-videoEmbed');
    const codeEl = element?.closest('.node-codeBlock, pre');
    const targetBlock = tableEl || blockquoteEl || detailsEl || mermaidEl || mediaEl || codeEl;

    if (targetBlock && containerRef.current.contains(targetBlock)) {
      let rect = targetBlock.getBoundingClientRect();
      
      // For tables and other potentially scrollable blocks, use their wrapper's rect
      // to keep the delete button fixed at the visible right edge.
      const wrapper = (targetBlock as HTMLElement).closest('.tableWrapper, .mermaid-diagram-wrapper');
      if (wrapper) {
        rect = wrapper.getBoundingClientRect();
      }

      // More reliable way to get the node position from the DOM element
      let blockPos = -1;
      let label = "le bloc";

      try {
        // Try to get position directly from the DOM element
        const pos = editor.view.posAtDOM(targetBlock, 0);
        const $pos = editor.state.doc.resolve(pos);

        if (tableEl) {
          for (let d = $pos.depth; d >= 0; d--) {
            if ($pos.node(d)?.type.name === 'table') {
              blockPos = $pos.before(d);
              label = "le tableau";
              break;
            }
          }
        } else if (detailsEl) {
          for (let d = $pos.depth; d >= 0; d--) {
            if ($pos.node(d)?.type.name === 'details') {
              blockPos = $pos.before(d);
              label = "le bloc dépliable";
              break;
            }
          }
        } else if (blockquoteEl) {
          for (let d = $pos.depth; d >= 0; d--) {
            if ($pos.node(d)?.type.name === 'blockquote') {
              blockPos = $pos.before(d);
              label = "la citation";
              break;
            }
          }
        } else if (mermaidEl) {
          for (let d = $pos.depth; d >= 0; d--) {
            if ($pos.node(d)?.type.name === 'mermaidDiagram') {
              blockPos = $pos.before(d);
              label = "le diagramme";
              break;
            }
          }
          // Fallback if the resolved position is just before the atom
          if (blockPos === -1) {
            const node = editor.state.doc.nodeAt(pos);
            if (node?.type.name === 'mermaidDiagram') {
              blockPos = pos;
              label = "le diagramme";
            }
          }
        } else if (mediaEl) {
          for (let d = $pos.depth; d >= 0; d--) {
            const typeName = $pos.node(d)?.type.name;
            if (typeName === 'image' || typeName === 'videoEmbed') {
              blockPos = $pos.before(d);
              label = typeName === 'image' ? "l'image" : "la vidéo";
              break;
            }
          }
          if (blockPos === -1) {
            const node = editor.state.doc.nodeAt(pos);
            if (node?.type.name === 'image' || node?.type.name === 'videoEmbed') {
              blockPos = pos;
              label = node.type.name === 'image' ? "l'image" : "la vidéo";
            }
          }
        } else if (codeEl) {
          for (let d = $pos.depth; d >= 0; d--) {
            if ($pos.node(d)?.type.name === 'codeBlock') {
              blockPos = $pos.before(d);
              label = "le bloc de code";
              break;
            }
          }
        }
      } catch (err) {
        // Fallback to posAtCoords if posAtDOM fails
        const coordsPos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        if (coordsPos !== undefined) {
          const $cPos = editor.state.doc.resolve(coordsPos);
          if (mermaidEl) {
            for (let d = $cPos.depth; d >= 0; d--) {
              if ($cPos.node(d)?.type.name === 'mermaidDiagram') {
                blockPos = $cPos.before(d);
                label = "le diagramme";
                break;
              }
            }
          }
        }
      }

      if (mermaidEl && blockPos !== -1) {
        setHoveredMermaidPos(blockPos);
      } else if (!mermaidEl && hoveredMermaidPos !== null) {
        setHoveredMermaidPos(null);
      }

      if (mediaEl && blockPos !== -1) {
        setHoveredMediaPos(blockPos);
      } else if (!mediaEl && hoveredMediaPos !== null) {
        setHoveredMediaPos(null);
      }

      if (blockPos !== -1) {
        setBlockDeleteHandle({
          top: rect.top - containerRect.top + 8,
          left: rect.right - containerRect.left - (label === "le diagramme" ? 36 : 48),
          pos: blockPos,
          label
        });
      }
    } else if (!(e.target as HTMLElement).closest('.block-delete-button')) {
      setBlockDeleteHandle(null);
    }
    if (!mermaidEl && hoveredMermaidPos !== null) {
      setHoveredMermaidPos(null);
    }
    if (!mediaEl && hoveredMediaPos !== null) {
      setHoveredMediaPos(null);
    }

    // 2. Code Block Drag Handle (Top-Left)
    if (codeEl && containerRef.current.contains(codeEl)) {
      const rect = codeEl.getBoundingClientRect();
      let codePos = -1;
      try {
        const domPos = editor.view.posAtDOM(codeEl, 0);
        const $pos = editor.state.doc.resolve(domPos);
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === 'codeBlock') {
            codePos = $pos.before(d);
            break;
          }
        }
      } catch (err) {
        // ignore
      }

      if (codePos === -1) {
        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        if (pos !== undefined) {
          const $pos = editor.state.doc.resolve(pos);
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'codeBlock') {
              codePos = $pos.before(d);
              break;
            }
          }
        }
      }

      if (codePos !== -1) {
        setCodeHandle({
          top: rect.top - containerRect.top + 10,
          left: rect.left - containerRect.left + 8,
          pos: codePos
        });
      } else {
        setCodeHandle(null);
      }
    } else if (!(e.target as HTMLElement).closest('.code-handle')) {
      setCodeHandle(null);
    }

    // 2. Blockquote Menu Handle (Left)
    if (blockquoteEl && containerRef.current.contains(blockquoteEl)) {
      let quotePos = -1;
      try {
        const domPos = editor.view.posAtDOM(blockquoteEl, 0);
        const $pos = editor.state.doc.resolve(domPos);
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === 'blockquote') {
            quotePos = $pos.before(d);
            break;
          }
        }
        if (quotePos === -1) {
          const node = editor.state.doc.nodeAt(domPos);
          if (node?.type.name === 'blockquote') quotePos = domPos;
        }
      } catch (err) {
        // ignore
      }

      if (quotePos === -1) {
        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        if (pos !== undefined) {
          const $pos = editor.state.doc.resolve(pos);
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'blockquote') {
              quotePos = $pos.before(d);
              break;
            }
          }
        }
      }

      if (quotePos !== -1) {
        const node = editor.state.doc.nodeAt(quotePos);
        const rect = node ? getBlockRectForPos(quotePos, node) : blockquoteEl.getBoundingClientRect();
        if (rect) {
          setQuoteHandle({
            top: rect.top - containerRect.top + 10,
            left: rect.left - containerRect.left + 5,
            pos: quotePos,
            type: node?.attrs.type || 'default'
          });
        } else {
          setQuoteHandle(null);
        }
      } else {
        setQuoteHandle(null);
      }
    } else if (!(e.target as HTMLElement).closest('.quote-handle')) {
      setQuoteHandle(null);
    }

    // 2b. Details Drag Handle (Left)
    // 3. Table Cell Handles (Row/Col)
    let info = getTableCellInfo(editor.view, e.nativeEvent);
    
    // If not directly over a cell, check if we are near a table within the wrapper
    if (!info) {
      const wrapper = element?.closest('.tableWrapper');
      if (wrapper) {
        const table = wrapper.querySelector('table');
        if (table) {
          const rect = table.getBoundingClientRect();
          const margin = 20;
          if (
            e.clientX >= rect.left - margin &&
            e.clientX <= rect.right + margin &&
            e.clientY >= rect.top - margin &&
            e.clientY <= rect.bottom + margin
          ) {
            const clampedX = Math.max(rect.left + 5, Math.min(rect.right - 5, e.clientX));
            const clampedY = Math.max(rect.top + 5, Math.min(rect.bottom - 5, e.clientY));
            const mockEvent = { clientX: clampedX, clientY: clampedY } as MouseEvent;
            info = getTableCellInfo(editor.view, mockEvent);
          }
        }
      }
    }

    if (info) {
      const { rowIndex, colIndex, tablePos } = info;
      const cellDOM = editor.view.nodeDOM(info.cellPos) as HTMLElement;
      const tableDOM = editor.view.nodeDOM(tablePos) as HTMLElement;
      if (cellDOM && tableDOM) {
        const rect = cellDOM.getBoundingClientRect();
        const tableRect = tableDOM.getBoundingClientRect();
        const tableWrapper = tableDOM.closest('.tableWrapper') as HTMLElement | null;
        const tableWrapperRect = tableWrapper ? tableWrapper.getBoundingClientRect() : tableRect;
        const isInWrapper =
          e.clientX >= tableWrapperRect.left &&
          e.clientX <= tableWrapperRect.right &&
          e.clientY >= tableWrapperRect.top &&
          e.clientY <= tableWrapperRect.bottom;
        const isInTable =
          e.clientX >= tableRect.left &&
          e.clientX <= tableRect.right &&
          e.clientY >= tableRect.top &&
          e.clientY <= tableRect.bottom;

        if (isInWrapper) {
          const rowHandleLeft = tableRect.left - containerRect.left;
          setRowHandle({
            top: rect.top - containerRect.top + rect.height / 2,
            left: rowHandleLeft,
            rowIndex,
            tablePos
          });
        } else {
          setRowHandle(null);
        }

        if (isInTable) {
          setColHandle({
            top: tableRect.top - containerRect.top - 10,
            left: rect.left - containerRect.left + rect.width / 2,
            colIndex,
            tablePos
          });
        } else {
          setColHandle(null);
        }

        if (isInWrapper || isInTable) {
          return;
        }
      }
    }

    // Check near existing handles to prevent flickering
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    if (rowHandle) {
      const handleX = containerRect.left + rowHandle.left;
      const handleY = containerRect.top + rowHandle.top;
      if (Math.sqrt(Math.pow(mouseX - handleX, 2) + Math.pow(mouseY - handleY, 2)) < 30) return;
    }
    if (colHandle) {
      const handleX = containerRect.left + colHandle.left;
      const handleY = containerRect.top + colHandle.top;
      if (Math.sqrt(Math.pow(mouseX - handleX, 2) + Math.pow(mouseY - handleY, 2)) < 30) return;
    }

    setRowHandle(null);
    setColHandle(null);
  };

  React.useEffect(() => {
    if (editor) {
      if (!turndownRef.current) {
        const turndown = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
        });
        // Always use GFM for tables and other GitHub-flavored features
        turndown.use(gfm);

        // Custom rule for blockquote alerts (using emojis instead of [!TAG])
        turndown.addRule('blockquote-alerts', {
          filter: 'blockquote',
          replacement: function (content: string, node: any) {
            const type = node.getAttribute('data-type');
            // Standard blockquote
            if (!type || type === 'default') return '\n\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n\n';
            
            // Map types to emojis for visual export
            const emojiMap: Record<string, string> = {
              'NOTE': 'ℹ️',
              'TIP': '💡',
              'IMPORTANT': '✅',
              'WARNING': '⚠️',
              'CAUTION': '🚨',
            };
            const emoji = emojiMap[type] || 'ℹ️';
            const title = node.getAttribute('data-title');
            
            // Format: > ℹ️ Content (on the same line)
            const alertHeader = title ? `${emoji} **${title}** ` : `${emoji} `;
            
            return '\n\n> ' + alertHeader + content.trim().replace(/\n/g, '\n> ') + '\n\n';
          }
        });

        // Custom rule for Mermaid diagrams
        turndown.addRule('mermaid-diagram', {
          filter: function (node: HTMLElement) {
            return node.nodeName === 'MERMAID-DIAGRAM' || node.tagName === 'MERMAID-DIAGRAM' || node.nodeName === 'mermaid-diagram';
          },
          replacement: function (_content: string, node: any) {
            const code = decodeMermaidAttrCode(node.getAttribute('code') || node.getAttribute('data-code') || '');
            return '\n\n```mermaid\n' + code.trim() + '\n```\n\n';
          }
        });

        // Custom rule for Details/Summary (Toggle block)
        turndown.addRule('details', {
          filter: 'details',
          replacement: function (content: string, node: any) {
            const summary = node.querySelector('summary');
            const summaryText = summary ? summary.textContent.trim() : 'Détails';
            
            // For Tiptap Details, content is inside a specialized div
            const contentDiv = node.querySelector('.details-content') || node.querySelector('[data-type="details-content"]');
            let innerMarkdown = '';
            
            if (contentDiv) {
              innerMarkdown = turndownRef.current.turndown(contentDiv.innerHTML).trim();
            } else {
              // Fallback: try to strip summary from the already converted content
              innerMarkdown = content.trim();
              if (summaryText && innerMarkdown.startsWith(summaryText)) {
                innerMarkdown = innerMarkdown.substring(summaryText.length).trim();
              }
            }
            
            return `\n\n<details>\n<summary>${summaryText}</summary>\n${innerMarkdown}\n</details>\n\n`;
          }
        });

        // Custom rule for Task Lists (using pretty ☒/☐ symbols)
        turndown.addRule('taskList', {
          filter: function (node: any) {
            return node.nodeName === 'LI' && node.parentNode.nodeName === 'UL' && node.classList.contains('task-list-item');
          },
          replacement: function (content: string, node: any) {
            const checkbox = node.querySelector('input[type="checkbox"]');
            const checked = checkbox && checkbox.checked ? '☒' : '☐';
            // Start with a space then the box as requested
            return ' ' + checked + ' ' + content.trim() + '\n';
          }
        });

        turndownRef.current = turndown;
      }

      const getEditorMarkdown = () => {
        const resolvePublicAssetUrl = (rawUrl: string) => {
          const candidate = String(rawUrl || '').trim();
          if (!candidate) return '';
          const shareWorker = (window as any).goToolkitShareWorker;
          const assetId = String(shareWorker?.extractAssetIdFromAnyUrl?.(candidate) || '').trim();
          if (!assetId) return candidate;
          return String(shareWorker?.buildPublicAssetUrl?.(assetId) || candidate).trim() || candidate;
        };
        try {
          if (typeof editor.getHTML === 'function') {
            const html = editor.getHTML();
            
            // Manual conversion for Mermaid diagrams before Turndown
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 1. Handle Mermaid diagrams
            const diagrams = doc.querySelectorAll('mermaid-diagram');
            diagrams.forEach(diag => {
              const code = decodeMermaidAttrCode(diag.getAttribute('code') || diag.getAttribute('data-code') || '');
              const pre = doc.createElement('pre');
              const codeElement = doc.createElement('code');
              codeElement.className = 'language-mermaid';
              codeElement.textContent = code.trim();
              pre.appendChild(codeElement);
              diag.replaceWith(pre);
            });

            // 2. Clean up Tiptap tables for Turndown GFM
            // Strip colgroup and col which confuse some Turndown GFM implementations
            const colgroups = doc.querySelectorAll('colgroup');
            colgroups.forEach(cg => cg.remove());

            // 3. Handle Task Lists for Turndown
            const taskLists = doc.querySelectorAll('ul[data-type="taskList"]');
            taskLists.forEach(ul => {
              ul.querySelectorAll('li').forEach(li => {
                li.classList.add('task-list-item');
              });
            });

            // 4. For markdown/mail/text flows, represent media embeds as URL text.
            doc.querySelectorAll('video').forEach(video => {
              const src = resolvePublicAssetUrl(String(video.getAttribute('src') || '').trim());
              const label = String(video.getAttribute('data-file-name') || video.getAttribute('title') || 'Vidéo').trim() || 'Vidéo';
              const replacement = doc.createElement('a');
              replacement.textContent = `${label} : ${src || 'link'}`;
              if (src) replacement.setAttribute('href', src);
              video.replaceWith(replacement);
            });
            doc.querySelectorAll('div[data-type="memo-file-block"]').forEach(fileBlock => {
              const href = resolvePublicAssetUrl(String(fileBlock.getAttribute('data-href') || '').trim());
              const title = String(fileBlock.getAttribute('data-file-name') || fileBlock.textContent || 'Fichier').trim() || 'Fichier';
              const replacement = doc.createElement('a');
              replacement.textContent = `${title} : ${href || 'link'}`;
              if (href) replacement.setAttribute('href', href);
              fileBlock.replaceWith(replacement);
            });
            doc.querySelectorAll('img').forEach(img => {
              const src = resolvePublicAssetUrl(String(img.getAttribute('src') || '').trim());
              if (!src) return;
              const label = String(img.getAttribute('data-file-name') || img.getAttribute('alt') || 'Image').trim() || 'Image';
              const replacement = doc.createElement('a');
              replacement.textContent = `${label} : ${src}`;
              replacement.setAttribute('href', src);
              img.replaceWith(replacement);
            });
            doc.querySelectorAll('iframe[data-type="external-video-embed"], iframe').forEach(iframe => {
              const src = String(iframe.getAttribute('src') || '').trim();
              const replacement = doc.createElement('a');
              replacement.textContent = src || 'video';
              if (src) replacement.setAttribute('href', src);
              iframe.replaceWith(replacement);
            });
            
            // 5. Remove Tiptap-specific classes and styles from table elements
            const tables = doc.querySelectorAll('table');
            tables.forEach(table => {
              table.removeAttribute('class');
              table.removeAttribute('style');
              table.querySelectorAll('td, th, tr').forEach(el => {
                el.removeAttribute('class');
                el.removeAttribute('style');
                // Clean up cell content to prevent Turndown from adding extra newlines
                if (el.tagName === 'TD' || el.tagName === 'TH') {
                  // Convert cell HTML to markdown text to avoid any HTML tags in AI payload
                  const rawCellHtml = el.innerHTML || '';
                  const markdownCell = (turndownRef.current?.turndown(rawCellHtml) || el.textContent || '')
                    .replace(/\n+/g, ' ')
                    .trim();
                  el.textContent = markdownCell;
                }
              });
            });

            const processedHtml = doc.body.innerHTML;
            const markdown = (turndownRef.current?.turndown(processedHtml) || '').toString();
            return markdown;
          }
          if (typeof editor.getText === 'function') {
            return editor.getText();
          }
        } catch (err) {
          // ignore
        }
        return '';
      };

      const getMemoEditorSource = (format: 'markdown' | 'html' | 'json' | 'text' | 'pdf') => {
        if (!editor) return '';
        try {
          const resolvePublicAssetUrl = (rawUrl: string) => {
            const candidate = String(rawUrl || '').trim();
            if (!candidate) return '';
            const shareWorker = (window as any).goToolkitShareWorker;
            const assetId = String(shareWorker?.extractAssetIdFromAnyUrl?.(candidate) || '').trim();
            if (!assetId) return candidate;
            return String(shareWorker?.buildPublicAssetUrl?.(assetId) || candidate).trim() || candidate;
          };
          if (format === 'html' || format === 'pdf') {
            const editorHtml = editor.getHTML();
            if (!editorHtml) return '';
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(editorHtml, 'text/html');
            if (!doc || !doc.body) return editorHtml;

            const FONT_SANS = 'Arial, Helvetica, sans-serif';
            const getSanitizedSvgNode = (svgMarkup: string): SVGSVGElement | null => {
              const raw = String(svgMarkup || '').trim();
              if (!raw) return null;
              try {
                const svgDoc = new DOMParser().parseFromString(raw, 'image/svg+xml');
                const svg = svgDoc.documentElement;
                if (!svg || svg.nodeName.toLowerCase() !== 'svg') return null;
                svgDoc.querySelectorAll('script,foreignObject,iframe,object,embed,link').forEach((node) => node.remove());
                svgDoc.querySelectorAll('*').forEach((el) => {
                  Array.from(el.attributes).forEach((attr) => {
                    const name = attr.name.toLowerCase();
                    const value = String(attr.value || '').trim();
                    if (name.startsWith('on')) {
                      el.removeAttribute(attr.name);
                      return;
                    }
                    if ((name === 'href' || name === 'xlink:href') && /^\s*javascript:/i.test(value)) {
                      el.removeAttribute(attr.name);
                    }
                  });
                });
                return svg;
              } catch {
                return null;
              }
            };
            const liveMermaidSvgs = (() => {
              const root: HTMLElement | null = editor?.view?.dom || null;
              if (!root) return [];
              const result: string[] = [];
              // Mermaid NodeViews are rendered as .node-mermaidDiagram in the live editor DOM.
              root.querySelectorAll('.node-mermaidDiagram, mermaid-diagram').forEach((diagram) => {
                const svg = diagram.querySelector('.mermaid-svg-container svg, svg');
                if (svg instanceof SVGSVGElement) result.push(svg.outerHTML);
              });
              return result;
            })();

            // 1. Handle Mermaid diagrams with rendered SVG in export order.
            try {
              const diagrams = doc.querySelectorAll('mermaid-diagram, .mermaid-diagram');
              diagrams.forEach((diag, diagramIndex) => {
                const code = decodeMermaidAttrCode(diag.getAttribute('code') || diag.getAttribute('data-code') || '').trim();
                const svgMarkup = liveMermaidSvgs[diagramIndex] || '';
                const svgNode = getSanitizedSvgNode(svgMarkup);
                if (svgNode) {
                  const container = doc.createElement('div');
                  container.style.margin = '20px 0';
                  container.style.textAlign = 'center';
                  const importedSvg = doc.importNode(svgNode, true) as SVGSVGElement;
                  importedSvg.setAttribute('width', importedSvg.getAttribute('width') || '100%');
                  importedSvg.style.maxWidth = '100%';
                  importedSvg.style.height = 'auto';
                  importedSvg.style.display = 'inline-block';
                  container.appendChild(importedSvg);
                  diag.replaceWith(container);
                } else {
                  const pre = doc.createElement('pre');
                  pre.style.background = '#f4f4f4';
                  pre.style.padding = '10px';
                  pre.style.border = '1px solid #ddd';
                  pre.style.fontFamily = 'monospace';
                  pre.style.fontSize = '12px';
                  pre.textContent = code;
                  diag.replaceWith(pre);
                }
              });
            } catch (mermaidErr) {
              console.warn('Error processing Mermaid for source:', mermaidErr);
            }

            // 2. Handle blockquote alerts
            const emojiMap: Record<string, string> = {
              'NOTE': 'ℹ️', 'TIP': '💡', 'IMPORTANT': '✅', 'WARNING': '⚠️', 'CAUTION': '🚨',
            };

            const blockquotes = doc.querySelectorAll('blockquote');
            blockquotes.forEach(q => {
              const bq = q as HTMLElement;
              const type = bq.getAttribute('data-type');
              const alertColorMap: Record<string, string> = {
                'NOTE': '#2563eb', 'TIP': '#059669', 'IMPORTANT': '#059669', 'WARNING': '#d97706', 'CAUTION': '#dc2626', 'default': '#6b7280'
              };
              const color = alertColorMap[type || 'default'] || alertColorMap.default;
              
              bq.style.borderLeft = `4px solid ${color}`;
              bq.style.padding = '4px 16px';
              bq.style.margin = '16px 0';
              bq.style.color = '#333333';
              bq.style.background = '#f9fafb';
              bq.style.fontFamily = FONT_SANS;
              bq.style.borderRadius = '4px';

              if (type && type !== 'default') {
                const emoji = emojiMap[type] || 'ℹ️';
                const title = bq.getAttribute('data-title');
                const header = doc.createElement('strong');
                header.style.color = color;
                header.style.fontWeight = 'bold';
                header.textContent = title ? `${emoji} ${title} ` : `${emoji} `;
                
                const firstChild = bq.firstChild;
                if (firstChild && firstChild.nodeType === 1 && (firstChild as HTMLElement).tagName === 'P') {
                  (firstChild as HTMLElement).insertBefore(header, (firstChild as HTMLElement).firstChild);
                } else {
                  bq.insertBefore(header, bq.firstChild);
                }
              }
            });

            // 3. Handle Task Lists (Unicode symbols)
            const taskLists = doc.querySelectorAll('ul[data-type="taskList"]');
            taskLists.forEach(l => {
              const ul = l as HTMLElement;
              ul.querySelectorAll('li').forEach(it => {
                const li = it as HTMLElement;
                const checked = li.getAttribute('data-checked') === 'true' || li.querySelector('input[checked]') !== null;
                const symbol = checked ? '☒' : '☐';
                const p = (li.querySelector('p') as HTMLElement) || doc.createElement('p');
                if (!li.querySelector('p')) p.innerHTML = li.innerHTML;
                
                const symbolSpan = doc.createElement('strong');
                symbolSpan.style.marginRight = '8px';
                symbolSpan.style.fontWeight = 'bold';
                symbolSpan.textContent = symbol + ' ';
                
                p.insertBefore(symbolSpan, p.firstChild);
                p.style.margin = '10px 0';
                ul.parentNode?.insertBefore(p, ul);
              });
              ul.remove();
            });

            // 4. Global element styling
            doc.querySelectorAll('p').forEach(p => {
              const el = p as HTMLElement;
              el.style.margin = '10px 0';
              el.style.fontSize = '14px';
              el.style.lineHeight = '20px';
              el.style.color = '#333333';
              el.style.fontFamily = FONT_SANS;
            });

            doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
              const el = h as HTMLElement;
              const isH1 = el.tagName === 'H1';
              const isH2 = el.tagName === 'H2';
              el.style.margin = '20px 0 10px 0';
              el.style.fontWeight = 'bold';
              el.style.color = '#111111';
              el.style.fontFamily = FONT_SANS;
              if (isH1) {
                el.style.fontSize = '24px';
                el.style.lineHeight = '32px';
              } else if (isH2) {
                el.style.fontSize = '18px';
                el.style.lineHeight = '26px';
              } else {
                el.style.fontSize = '16px';
                el.style.lineHeight = '22px';
              }
            });

            doc.querySelectorAll('strong, b').forEach(s => {
              (s as HTMLElement).style.fontWeight = 'bold';
            });

            doc.querySelectorAll('code').forEach(c => {
              const el = c as HTMLElement;
              el.style.background = '#f3f4f6';
              el.style.padding = '2px 4px';
              el.style.fontFamily = 'monospace';
              el.style.fontSize = '13px';
              el.style.borderRadius = '3px';
            });

            doc.querySelectorAll('table').forEach(t => {
              const tableEl = t as HTMLElement;
              tableEl.setAttribute('border', '1');
              tableEl.setAttribute('cellspacing', '0');
              tableEl.setAttribute('cellpadding', '10');
              tableEl.setAttribute('width', '100%');
              tableEl.style.borderCollapse = 'collapse';
              tableEl.style.width = '100%';
              tableEl.style.margin = '20px 0';
              tableEl.style.border = '1px solid #d1d5db';
              
              tableEl.querySelectorAll('td, th').forEach(cell => {
                const el = cell as HTMLElement;
                el.style.border = '1px solid #d1d5db';
                el.style.textAlign = 'left';
                el.style.verticalAlign = 'top';
                el.style.fontFamily = FONT_SANS;
                el.style.fontSize = '14px';
                el.setAttribute('align', 'left');
                el.setAttribute('valign', 'top');
              });
              tableEl.querySelectorAll('th').forEach(th => {
                const el = th as HTMLElement;
                el.style.background = '#f9fafb';
                el.style.fontWeight = 'bold';
              });
            });

            doc.querySelectorAll('ul, ol').forEach(l => {
              const el = l as HTMLElement;
              el.style.paddingLeft = '30px';
              el.style.margin = '10px 0';
              el.querySelectorAll('li').forEach(li => {
                const liel = li as HTMLElement;
                liel.style.fontSize = '14px';
                liel.style.lineHeight = '20px';
                liel.style.fontFamily = FONT_SANS;
                liel.style.marginBottom = '5px';
              });
            });

            doc.querySelectorAll('img').forEach(img => {
              const el = img as HTMLElement;
              el.style.display = 'block';
              el.style.maxWidth = '100%';
              el.style.margin = '20px auto';
              const w = el.getAttribute('width');
              const h = el.getAttribute('height');
              if (w) el.style.width = w.endsWith('%') ? w : w + 'px';
              if (h) el.style.height = h.endsWith('%') ? h : h + 'px';

              const src = String(el.getAttribute('src') || '').trim().toLowerCase();
              const isGif = src.startsWith('data:image/gif') || /\.gif([?#].*)?$/.test(src);
              if (format !== 'html' || !isGif || !el.parentElement) return;

              const wrapper = doc.createElement('div');
              wrapper.className = 'gif-replay-wrap';
              wrapper.setAttribute('style', 'position:relative;display:block;width:fit-content;max-width:100%;margin:20px auto;');
              el.style.margin = '0';

              const replayBtn = doc.createElement('button');
              replayBtn.className = 'gif-replay-button';
              replayBtn.setAttribute('type', 'button');
              replayBtn.setAttribute('title', 'Replay GIF');
              replayBtn.setAttribute('aria-label', 'Replay GIF');
              replayBtn.setAttribute('data-gif-replay', 'true');
              wrapper.setAttribute('data-gif-state', 'stopped');
              replayBtn.setAttribute(
                'onclick',
                "var w=this.parentElement,i=w&&w.querySelector('img');if(!w||!i)return false;w.setAttribute('data-gif-state','playing');var s=i.getAttribute('src')||'';i.setAttribute('src','');void i.offsetHeight;i.setAttribute('src',s);if(!w.__gifReplayLeaveBound){w.addEventListener('mouseleave',function(){w.setAttribute('data-gif-state','stopped');});w.__gifReplayLeaveBound=true;}setTimeout(function(){if(w&&w.getAttribute('data-gif-state')==='playing'){w.setAttribute('data-gif-state','stopped');}},1800);return false;"
              );
              replayBtn.textContent = '▷';

              const parent = el.parentElement;
              parent.insertBefore(wrapper, el);
              wrapper.appendChild(el);
              wrapper.appendChild(replayBtn);
            });

            doc.querySelectorAll('video').forEach(video => {
              const el = video as HTMLVideoElement;
              const src = resolvePublicAssetUrl(String(el.getAttribute('src') || '').trim());
              const label = String(el.getAttribute('data-file-name') || el.getAttribute('title') || 'Vidéo').trim() || 'Vidéo';
              const link = doc.createElement('a');
              if (src) link.href = src;
              link.textContent = label;
              link.setAttribute('style', 'color:#2563eb;text-decoration:underline;word-break:break-all;');
              el.replaceWith(link);
            });

            doc.querySelectorAll('div[data-type="memo-file-block"]').forEach(block => {
              const el = block as HTMLElement;
              const href = resolvePublicAssetUrl(String(el.getAttribute('data-href') || '').trim());
              const title = String(el.getAttribute('data-file-name') || el.textContent || 'Fichier').trim() || 'Fichier';
              const link = doc.createElement('a');
              if (href) link.href = href;
              link.textContent = title;
              link.setAttribute('download', title);
              link.setAttribute('style', 'color:#2563eb;text-decoration:underline;word-break:break-all;');
              el.replaceWith(link);
            });

            doc.querySelectorAll('iframe[data-type="external-video-embed"], iframe').forEach(frame => {
              const el = frame as HTMLIFrameElement;
              const src = String(el.getAttribute('src') || '').trim();

              if (format === 'pdf') {
                const wrap = doc.createElement('p');
                wrap.setAttribute('style', 'font-size:12px;color:#6b7280;margin:8px 0 20px 0;');
                if (src) {
                  const link = doc.createElement('a');
                  link.href = src;
                  link.textContent = src;
                  link.setAttribute('style', 'color:#2563eb;text-decoration:underline;word-break:break-all;');
                  wrap.textContent = 'Video: ';
                  wrap.appendChild(link);
                } else {
                  wrap.textContent = 'Video';
                }
                el.replaceWith(wrap);
                return;
              }

              el.setAttribute('loading', 'lazy');
              el.setAttribute('allowfullscreen', 'true');
              el.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; clipboard-write');
              const style = el.style;
              style.display = 'block';
              style.width = '100%';
              style.maxWidth = '100%';
              style.minHeight = '420px';
              style.margin = '20px auto';
              style.border = '0';
              style.borderRadius = '10px';
              style.background = '#000';
            });

            doc.querySelectorAll('hr').forEach(hr => {
              const el = hr as HTMLElement;
              el.style.border = 'none';
              el.style.borderTop = '1px solid #e5e7eb';
              el.style.margin = '30px 0';
            });

            doc.querySelectorAll('a').forEach(a => {
              const el = a as HTMLElement;
              el.style.color = '#2563eb';
              el.style.textDecoration = 'underline';
            });

            const content = doc.body.innerHTML;

            if (format === 'pdf') {
              return `
<div class="pdf-export" style="font-family:${FONT_SANS}; font-size:14px; line-height:20px; color:#333333; max-width: 800px; margin: 0 auto;">
  ${content}
</div>`.trim();
            }

            // Return rich HTML content (without the full grey background card for direct copy-paste)
            return `
<div class="html-email-export" style="font-family:${FONT_SANS}; color: #374151; line-height: 1.6; max-width: 650px;">
  <style>
    .html-email-export .gif-replay-wrap .gif-replay-button {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 10px;
      border: none;
      background: rgba(15, 23, 42, 0.38);
      color: #111827;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 44px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease;
      z-index: 3;
      padding: 0;
      color: #ffffff;
    }
    .html-email-export .gif-replay-wrap[data-gif-state="stopped"]:hover .gif-replay-button {
      opacity: 1;
      pointer-events: auto;
    }
    .html-email-export .gif-replay-wrap .gif-replay-button:hover {
      background: rgba(15, 23, 42, 0.52);
    }
    .html-email-export video {
      width: 100%;
      height: auto;
      max-width: 100%;
    }
    .html-email-export iframe {
      width: 100%;
      min-height: 420px;
      border: 0;
      border-radius: 10px;
      background: #000;
    }
  </style>
  ${content}
</div>`.trim();
          }

          if (format === 'json') {
            return JSON.stringify(editor.getJSON(), null, 2);
          }

          if (format === 'text') {
            const markdown = getEditorMarkdown();
            // Simplify markdown for plain text
            return markdown
              .replace(/\\-/g, '-')                     // Remove escaping: \- -> -
              .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '$1 ($2)') // Raw text: Title (URL Link)
              .replace(/(\*\*|__)(.*?)\1/g, '$2')      // Strip bold: **Text** -> Text
              .replace(/(\*|_)(.*?)\1/g, '$2')         // Strip italic: *Text* -> Text
              .replace(/~~(.*?)~~/g, '$1')              // Strip strikethrough
              .replace(/`(.*?)`/g, '$1')               // Strip inline code
              .replace(/^#+\s+/gm, '')                 // Strip header hashes
              .replace(/^\s*>\s*/gm, '> ')             // Clean blockquotes
              .replace(/^\s*-\s+/gm, '- ')             // List items: ensure single space and normalize
              .replace(/\n\n(?=\s*-)/g, '\n');          // Remove blank line between list items
          }

          // Markdown
          return getEditorMarkdown();
        } catch (err) {
          console.error('getMemoEditorSource error:', err);
          return '';
        }
      };

      const convertEditorMarkdownToHtml = (markdown: string) => {
        if (typeof markdown !== 'string') return '';

        // Handle unicode tasks at beginning of lines, allowing optional leading whitespace
        const markdownWithUnicodeTasks = markdown.replace(/^[ \t]*([☐☒])\s+(.*)$/gm, (_match, char, content) => {
          const checked = char === '☒';
          // Tiptap's TaskList and TaskItem expect this structure to be parsed correctly as task items
          return `<ul data-type="taskList"><li data-type="taskItem" data-checked="${checked}"><p>${content}</p></li></ul>`;
        });

        // Pre-process emoji alert format: >ℹ️, >💡, etc. (supports multi-line with >)
        // Allowing leading whitespace and optional space after emoji
        const emojiAlertRegex = /^[ \t]*>(ℹ️|💡|✅|⚠️|🚨)\s?([^\n]*(?:\n[ \t]*>.*)*)/gm;
        const markdownWithEmojiAlerts = markdownWithUnicodeTasks.replace(emojiAlertRegex, (_match, emoji, content) => {
          const emojiMap: any = {
            'ℹ️': 'NOTE',
            '💡': 'TIP',
            '✅': 'IMPORTANT',
            '⚠️': 'WARNING',
            '🚨': 'CAUTION'
          };
          const normalizedType = emojiMap[emoji] || 'NOTE';
          const cleanContent = content.replace(/^[ \t]*> ?/gm, '').trim();
          return `<blockquote data-type="${normalizedType}">${cleanContent}</blockquote>`;
        });

        // Pre-process newer alert format: >note, >alerte, etc. (case insensitive)
        const shortAlertRegex = /^[ \t]*>(note|alerte|warning|important|conseil|tip|attention|caution|remarque)\s(.*)$/gmi;
        const markdownWithShortAlerts = markdownWithEmojiAlerts.replace(shortAlertRegex, (_match, type, content) => {
          const typeMap: any = {
            'note': 'NOTE',
            'alerte': 'WARNING',
            'warning': 'WARNING',
            'important': 'IMPORTANT',
            'conseil': 'TIP',
            'tip': 'TIP',
            'attention': 'CAUTION',
            'caution': 'CAUTION',
            'remarque': 'default'
          };
          return `<blockquote data-type="${typeMap[type.toLowerCase()] || 'NOTE'}">${content}</blockquote>`;
        });

        // Pre-process GitHub style alerts: > [!NOTE] Custom Title -> <blockquote data-type="NOTE" data-title="Custom Title">
        const alertRegex = /^[ \t]*> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|ALERTE|ATTENTION)(?:\s+(.*))?\]\s*\n((?:>.*\n?)*)/gmi;
        const markdownWithAlerts = markdownWithShortAlerts.replace(alertRegex, (_match, type, title, content) => {
          const typeMap: any = {
            'NOTE': 'NOTE',
            'TIP': 'TIP',
            'IMPORTANT': 'IMPORTANT',
            'WARNING': 'WARNING',
            'ALERTE': 'WARNING',
            'CAUTION': 'CAUTION',
            'ATTENTION': 'CAUTION',
          };
          const normalizedType = typeMap[type.toUpperCase()] || 'NOTE';
          const cleanContent = content.replace(/^> ?/gm, '').trim();
          const titleAttr = title ? ` data-title="${title.trim()}"` : '';
          return `<blockquote data-type="${normalizedType}"${titleAttr}>${cleanContent}</blockquote>`;
        });

        // Convert == markers to <mark> HTML before parsing
        const markdownWithHighlight = markdownWithAlerts.replace(
          /==(.*?)==/g,
          '<mark>$1</mark>'
        );

        // Convert Mermaid fences into editor blocks before generic markdown parsing.
        // This catches importer and AI-output flows that both pass through markdown conversion.
        const mermaidRegex = /```[ \t]*mermaid[^\n\r]*\r?\n([\s\S]*?)\r?\n?```/gi;
        const processedMarkdown = markdownWithHighlight.replace(mermaidRegex, (_match, code) => {
          const encodedCode = encodeURIComponent(code.trim());
          return `<mermaid-diagram code="${encodedCode}"></mermaid-diagram>`;
        });

        const html = marked.parse(processedMarkdown, { gfm: true }) as string;

        // Post-process to ensure Tiptap Details structure: <details><summary>...</summary><div data-type="details-content">...</div></details>
        const finalHtml = html.replace(/<details>([\s\S]*?)<\/details>/g, (match, inner) => {
          if (inner.includes('data-type="details-content"') || inner.includes('class="details-content"')) {
            return match;
          }
          // Find the summary
          const summaryMatch = inner.match(/<summary>([\s\S]*?)<\/summary>/);
          if (summaryMatch) {
            const summary = summaryMatch[0];
            const content = inner.replace(summary, '').trim();
            return `<details>${summary}<div data-type="details-content">${content}</div></details>`;
          }
          return match;
        });
        // Post-process tables to ensure valid Tiptap tableCell content
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(finalHtml, 'text/html');
          if (doc && doc.body) {
            doc.querySelectorAll('pre > code').forEach(codeEl => {
              const className = String((codeEl as HTMLElement).className || '').toLowerCase();
              if (!className.includes('language-mermaid')) return;
              const pre = codeEl.parentElement;
              if (!pre) return;
              const mermaidCode = decodeMermaidAttrCode(codeEl.textContent || '').trim();
              if (!mermaidCode) return;
              const mermaidDiagram = doc.createElement('mermaid-diagram');
              mermaidDiagram.setAttribute('code', encodeURIComponent(mermaidCode));
              pre.parentNode?.replaceChild(mermaidDiagram, pre);
            });

            doc.querySelectorAll('a[href]').forEach(anchor => {
              const el = anchor as HTMLAnchorElement;
              const href = String(el.getAttribute('href') || '').trim();
              const isDataVideo = /^data:video\/(webm|mp4);/i.test(href);
              const isWebm = /\.webm([?#].*)?$/i.test(href);
              const isMp4 = /\.mp4([?#].*)?$/i.test(href);
              if (!isDataVideo && !isWebm && !isMp4) return;

              const video = doc.createElement('video');
              video.setAttribute('controls', 'true');
              video.setAttribute('playsinline', 'true');
              video.setAttribute('preload', 'metadata');
              video.setAttribute('src', href);

              const source = doc.createElement('source');
              source.setAttribute('src', href);
              if (isMp4) source.setAttribute('type', 'video/mp4');
              else source.setAttribute('type', 'video/webm');
              video.appendChild(source);

              const fallback = doc.createElement('p');
              fallback.textContent = `Video: ${href}`;

              const wrap = doc.createElement('div');
              wrap.appendChild(video);
              wrap.appendChild(fallback);
              el.parentNode?.replaceChild(wrap, el);
            });

            const tables = doc.querySelectorAll('table');
            tables.forEach(table => {
              table.querySelectorAll('td, th').forEach(cell => {
                const raw = (cell.innerHTML || '').trim();
                const hasBlock = !!cell.querySelector('p, div, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, table');
                if (!raw || raw === '<>') {
                  cell.innerHTML = '<p></p>';
                  return;
                }
                if (!hasBlock) {
                  const rawText = String(cell.textContent || '').trim();
                  const p = doc.createElement('p');
                  if (hasInlineMarkdownSyntax(rawText)) {
                    const inlineHtml = marked.parseInline(rawText, { gfm: true }) as string;
                    p.innerHTML = sanitizeHtml(unescapeMarkdownLiteralEscapes(inlineHtml));
                  } else {
                    p.innerHTML = sanitizeHtml(unescapeMarkdownLiteralEscapes(cell.innerHTML));
                  }
                  cell.innerHTML = '';
                  cell.appendChild(p);
                }
              });
            });
            return sanitizeHtml(doc.body.innerHTML.replace(/<>/g, ''));
          }
        } catch (err) {
          // noop
        }

        return sanitizeHtml(finalHtml.replace(/<>/g, ''));
      };

      const setEditorMarkdown = (markdown: string) => {
        if (typeof markdown !== 'string') return;
        try {
          const finalHtml = sanitizeHtml(convertEditorMarkdownToHtml(markdown));

          if ((editor as any)?.commands?.clearContent) {
            (editor as any).commands.clearContent();
          }
          if ((editor as any)?.commands?.setContent) {
            (editor as any).commands.setContent(finalHtml);
          }
        } catch (err) {
          console.warn('setEditorMarkdown failed', err);
        }
      };

      const insertEditorMarkdownAtRange = (markdown: string, range: { from: number; to: number }) => {
        if (typeof markdown !== 'string' || !range) return;
        try {
          const rawFrom = Number(range.from);
          const rawTo = Number(range.to);
          if (!Number.isFinite(rawFrom) || !Number.isFinite(rawTo)) return;
          let listReplaceRange: { from: number; to: number } | null = null;
          const isListMarkdown = (text: string) => {
            if (typeof text !== 'string') return false;
            const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            if (!lines.length) return false;
            const listLineRe = /^([-*+]|\\d+[.)])\\s+\\S+/;
            let listLines = 0;
            let nonListLines = 0;
            for (let i = 0; i < lines.length; i += 1) {
              if (listLineRe.test(lines[i])) {
                listLines += 1;
              } else {
                nonListLines += 1;
              }
            }
            return listLines >= 2 && listLines >= nonListLines;
          };
          const finalHtml = convertEditorMarkdownToHtml(markdown);
          if (editor) {
            const maxPos = editor.state.doc.content.size;
            const clampedFrom = Math.max(0, Math.min(rawFrom, maxPos));
            const clampedTo = Math.max(0, Math.min(rawTo, maxPos));
            let from = Math.min(clampedFrom, clampedTo);
            let to = Math.max(clampedFrom, clampedTo);

            // If selection intersects or is inside a table, replace the whole table node range
            let tableFrom: number | null = null;
            let tableTo: number | null = null;
            editor.state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name === 'table') {
                tableFrom = tableFrom === null ? pos : Math.min(tableFrom, pos);
                tableTo = tableTo === null ? (pos + node.nodeSize) : Math.max(tableTo, pos + node.nodeSize);
              }
            });

            const resolved = editor.state.doc.resolve(from);
            if (tableFrom === null && getTableCellPosFromResolved(resolved) !== null) {
              let $pos = resolved;
              for (let d = $pos.depth; d > 0; d--) {
                if ($pos.node(d).type.name === 'table') {
                  tableFrom = $pos.before(d);
                  tableTo = $pos.after(d);
                  break;
                }
              }
            }

            if (tableFrom !== null && tableTo !== null) {
              from = tableFrom;
              to = tableTo;
            }

            if (isListMarkdown(markdown)) {
              const isListContainer = (node: any) => {
                const name = (node?.type?.name || '').toString().toLowerCase();
                return name.includes('list') && name !== 'listitem';
              };
              let listContainerRange: { from: number; to: number } | null = null;
              let listItemRange: { from: number; to: number } | null = null;
              editor.state.doc.descendants((node, pos) => {
                if (node.type?.name === 'listItem') {
                  const end = pos + node.nodeSize;
                  if (pos <= from && end >= to) {
                    listItemRange = { from: pos, to: end };
                  }
                }
              });
              if (listItemRange) {
                const probePos = Math.min(listItemRange.from + 1, editor.state.doc.content.size);
                const resolved = editor.state.doc.resolve(probePos);
                for (let depth = resolved.depth; depth >= 0; depth -= 1) {
                  const node = resolved.node(depth);
                  if (node && isListContainer(node)) {
                    listContainerRange = { from: resolved.before(depth), to: resolved.after(depth) };
                    break;
                  }
                }
              }
              if (!listContainerRange) {
                editor.state.doc.descendants((node, pos) => {
                  if (!isListContainer(node)) return;
                  const end = pos + node.nodeSize;
                  if (pos <= from && end >= to) {
                    const size = end - pos;
                    const currentSize = listContainerRange ? (listContainerRange.to - listContainerRange.from) : Infinity;
                    if (size < currentSize) {
                      listContainerRange = { from: pos, to: end };
                    }
                  }
                });
              }
              if (listContainerRange) {
                from = listContainerRange.from;
                to = listContainerRange.to;
                listReplaceRange = listContainerRange;
              } else if (listItemRange) {
                from = listItemRange.from;
                to = listItemRange.to;
                listReplaceRange = listItemRange;
              }
            }

            const trimmedHtml = typeof finalHtml === 'string' ? finalHtml.trim() : '';
            const safeHtml = (!trimmedHtml || trimmedHtml === '<>') ? '<p></p>' : finalHtml;

            if (listReplaceRange) {
              editor.chain().focus().insertContentAt({ from, to }, safeHtml).run();
              return;
            }

            // Delete first, then insert at the mapped position to avoid invalid tableCell inserts
            const tr = editor.state.tr.deleteRange(from, to);
            const mappedFrom = tr.mapping.map(from);
            editor.view.dispatch(tr);

            const insertPos = Math.max(0, Math.min(mappedFrom, editor.state.doc.content.size));
            editor.chain().focus().insertContentAt(insertPos, safeHtml).run();
          }
        } catch (err) {
          console.warn('insertEditorMarkdownAtRange failed', err);
        }
      };

      const insertEditorMarkdownAtEnd = (markdown: string) => {
        if (typeof markdown !== 'string') return;
        try {
          const finalHtml = convertEditorMarkdownToHtml(markdown);

          if (editor) {
            const trimmedHtml = typeof finalHtml === 'string' ? finalHtml.trim() : '';
            const safeHtml = (!trimmedHtml || trimmedHtml === '<>') ? '<p></p>' : finalHtml;
            const currentMarkdown = String(getEditorMarkdown() || '').trim();
            const needsSeparator = currentMarkdown.length > 0;
            editor
              .chain()
              .focus()
              .insertContentAt(editor.state.doc.content.size, (needsSeparator ? '\n\n' : '') + safeHtml)
              .run();
          }
        } catch (err) {
          console.warn('insertEditorMarkdownAtEnd failed', err);
        }
      };

      const applyStructuredOps = (ops: Array<{ action?: string; type?: string; start?: number; end?: number; text?: string; content?: string }>) => {
        if (!Array.isArray(ops) || !ops.length) return;
        try {
          const current = getEditorMarkdown();
          if (typeof current !== 'string') return;
          const normalized = ops
            .map((raw) => {
              const action = String(raw?.action || raw?.type || '').toLowerCase();
              const start = Number(raw?.start);
              const endRaw = Number(raw?.end);
              const text = typeof raw?.text === 'string'
                ? raw.text
                : (typeof raw?.content === 'string' ? raw.content : '');
              const safeStart = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;
              const safeEnd = Number.isFinite(endRaw) ? Math.max(safeStart, Math.floor(endRaw)) : safeStart;
              if (!action) return null;
              if (action !== 'insert' && action !== 'replace' && action !== 'delete') return null;
              return { action, start: safeStart, end: safeEnd, text };
            })
            .filter(Boolean) as Array<{ action: string; start: number; end: number; text: string }>;
          if (!normalized.length) return;

          // Apply from the end of the document to keep indices stable.
          normalized.sort((a, b) => b.start - a.start);
          let next = current;
          normalized.forEach((op) => {
            const boundedStart = Math.max(0, Math.min(op.start, next.length));
            const boundedEnd = Math.max(boundedStart, Math.min(op.end, next.length));
            if (op.action === 'insert') {
              next = next.slice(0, boundedStart) + op.text + next.slice(boundedStart);
            } else if (op.action === 'replace') {
              next = next.slice(0, boundedStart) + op.text + next.slice(boundedEnd);
            } else if (op.action === 'delete') {
              next = next.slice(0, boundedStart) + next.slice(boundedEnd);
            }
          });
          setEditorMarkdown(next);
        } catch (err) {
          console.warn('applyStructuredOps failed', err);
        }
      };

      const methods = {
        getMarkdown: getEditorMarkdown,
        setMarkdown: setEditorMarkdown,
        insertMarkdownAtRange: insertEditorMarkdownAtRange,
        insertMarkdownAtEnd: insertEditorMarkdownAtEnd,
        applyStructuredOps,
        getSource: getMemoEditorSource,
        exportDocx: (title?: string) => exportEditorToDocx(editor, title),
        setEditable: (nextEditable: boolean) => {
          editor?.setEditable(Boolean(nextEditable));
        },
        instance: editor
      };

      if (onReady) {
        onReady(methods);
      }
    }
  }, [editor, onReady]);

  const handleAssist = () => {
    if (selectionData) {
      document.dispatchEvent(new CustomEvent('memoEditorSelectionChanged', {
        detail: { ...selectionData, focus: true }
      }));
    }
  };

  // Focuser l'input et vider le contenu quand le tippy-box apparaît
  // Émettre un événement custom quand la sélection change (pour le composant flottant chat-inline-editor)
  React.useEffect(() => {
    if (!editor) return;

    let selectionTimeout: ReturnType<typeof setTimeout>;

    const sanitizeTableHtmlForMarkdown = (html: string) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        if (!doc || !doc.body) return html;

        const colgroups = doc.querySelectorAll('colgroup');
        colgroups.forEach(cg => cg.remove());

        const tables = doc.querySelectorAll('table');
        tables.forEach(table => {
          table.removeAttribute('class');
          table.removeAttribute('style');
          table.querySelectorAll('td, th, tr').forEach(el => {
            el.removeAttribute('class');
            el.removeAttribute('style');
            if (el.tagName === 'TD' || el.tagName === 'TH') {
              const rawCellHtml = el.innerHTML || '';
              const markdownCell = (turndownRef.current?.turndown(rawCellHtml) || el.textContent || '')
                .replace(/\n+/g, ' ')
                .trim();
              el.textContent = markdownCell;
            }
          });
        });

        return doc.body.innerHTML;
      } catch (err) {
        return html;
      }
    };

    const handleSelectionChange = () => {
      const { from, to, empty } = editor.state.selection;
      
      // Annuler le timeout précédent
      clearTimeout(selectionTimeout);
      
      // Si pas de sélection, émettre l'événement "pas de sélection"
      if (empty) {
        document.dispatchEvent(new CustomEvent('memoEditorSelectionChanged', {
          detail: { isSelected: false }
        }));
        setSelectionData(null);
        return;
      }

      // Attendre que la sélection soit stable (300ms sans changement)
      selectionTimeout = setTimeout(() => {
        // Vérifier que la sélection n'a pas changé
        const currentSelection = editor.state.selection;
        if (currentSelection.from === from && currentSelection.to === to) {
          // Récupérer le texte sélectionné
          const selectedText = editor.state.doc.textBetween(from, to, ' ');

          // Récupérer le markdown de la sélection (préserve la mise en forme)
          let selectionMarkdown = '';
          try {
            const slice = editor.state.selection.content();
            const serializer = DOMSerializer.fromSchema(editor.state.schema);
            const fragment = serializer.serializeFragment(slice.content);
            const tmp = document.createElement('div');
            tmp.appendChild(fragment);
            const html = sanitizeTableHtmlForMarkdown(tmp.innerHTML);
            selectionMarkdown = (turndownRef.current?.turndown(html) || '').trim();
          } catch (err) {
            selectionMarkdown = '';
          }

          // Étendre la sélection au bloc complet (paragraphe, tableau, liste, code block)
          let blockFrom = from;
          let blockTo = to;
          let blockText = selectedText;
          const allowedBlockTypes = new Set([
            'paragraph',
            'heading',
            'codeBlock',
            'table',
            'listItem',
            'blockquote',
            'mermaidDiagram'
          ]);
          const isWhitespaceSelection = selectedText.trim().length === 0;

          if (isWhitespaceSelection) {
            const { $from, $to } = editor.state.selection;
            const pickBlockDepth = (resolvedPos: typeof $from) => {
              for (let depth = resolvedPos.depth; depth >= 0; depth--) {
                if (allowedBlockTypes.has(resolvedPos.node(depth).type.name)) {
                  return depth;
                }
              }
              return -1;
            };
            const isEmptyTextblock = (resolvedPos: typeof $from) =>
              resolvedPos.parent?.isTextblock && resolvedPos.parent.content.size === 0;
            const preferPos = isEmptyTextblock($to) ? $to : $from;
            let blockDepth = pickBlockDepth(preferPos);

            if (blockDepth < 0 && preferPos !== $from) {
              blockDepth = pickBlockDepth($from);
            }
            if (blockDepth >= 0) {
              blockFrom = preferPos.start(blockDepth);
              blockTo = preferPos.end(blockDepth);
            }
          } else {
            editor.state.doc.nodesBetween(from, to > from ? to - 1 : to, (node, pos) => {
              // Trouver le bloc parent (paragraphe, heading, table, code block, list item)
              if (allowedBlockTypes.has(node.type.name)) {
                blockFrom = Math.min(blockFrom, pos);
                blockTo = Math.max(blockTo, pos + node.nodeSize);
              }
            });
          }

          // Extraire le texte du bloc complet
          blockText = editor.state.doc.textBetween(blockFrom, blockTo, '\n').trim();

          // Déterminer le type de nœud principal
          let nodeType = '';
          editor.state.doc.nodesBetween(from, to > from ? to - 1 : to, (node) => {
            if (node.type.name === 'mermaidDiagram') nodeType = 'mermaidDiagram';
          });

          // Extraire le markdown du bloc complet (préserve listes, gras, titres, etc.)
          let blockMarkdown = '';
          try {
            const blockSlice = editor.state.doc.slice(blockFrom, blockTo);
            const serializer = DOMSerializer.fromSchema(editor.state.schema);
            const fragment = serializer.serializeFragment(blockSlice.content);
            const tmp = document.createElement('div');
            tmp.appendChild(fragment);
            const html = sanitizeTableHtmlForMarkdown(tmp.innerHTML);
            blockMarkdown = (turndownRef.current?.turndown(html) || '').trim();
          } catch (err) {
            blockMarkdown = '';
          }

          // Calculer la position (en bas de la sélection, à gauche du début)
          try {
            const coordsStart = editor.view.coordsAtPos(blockFrom);
            const coordsEnd = editor.view.coordsAtPos(blockTo, -1);
            
            // Stocker les données pour "Assist" au lieu d'émettre
            let finalExcerpt = blockText.substring(0, 100) + (blockText.length > 100 ? '…' : '');
            if (!finalExcerpt.trim() && nodeType === 'mermaidDiagram') {
              finalExcerpt = 'Diagramme Mermaid';
            }

            setSelectionData({
              isSelected: true,
              nodeType: nodeType,
              selectionText: selectedText,
              selectionMarkdown: selectionMarkdown,
              blockText: blockText,
              blockMarkdown: blockMarkdown,
              selectionExcerpt: finalExcerpt,
              positionFrom: blockFrom,
              positionTo: blockTo,
              coords: {
                top: coordsEnd.bottom + 10,
                left: coordsStart.left,
                bottom: coordsEnd.bottom,
                right: coordsEnd.right,
              }
            });
          } catch (err) {
            console.warn('Error getting selection coords:', err);
          }
        }
      }, 300);
    };

    // Écouter les changements de sélection
    editor.on('update', handleSelectionChange);
    editor.on('selectionUpdate', handleSelectionChange);

    return () => {
      clearTimeout(selectionTimeout);
      editor.off('update', handleSelectionChange);
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!editor) return;

    const updateLinkTooltip = () => {
      const host = containerRef.current;
      const context = getSelectionLinkContext(editor);
      if (!host || !context) {
        setLinkTooltip(null);
        return;
      }
      try {
        const coords = editor.view.coordsAtPos(context.from);
        const hostRect = host.getBoundingClientRect();
        setLinkTooltip({
          href: context.href,
          left: coords.left - hostRect.left,
          top: coords.top - hostRect.top - 40,
        });
      } catch {
        setLinkTooltip(null);
      }
    };

    editor.on('update', updateLinkTooltip);
    editor.on('selectionUpdate', updateLinkTooltip);
    updateLinkTooltip();

    return () => {
      editor.off('update', updateLinkTooltip);
      editor.off('selectionUpdate', updateLinkTooltip);
    };
  }, [editor]);

  const openLinkModal = React.useCallback(() => {
    if (!editor) return;
    const context = getSelectionLinkContext(editor);
    if (context) {
      setLinkModalAnchorPos(context.from);
      setLinkModalRange({ from: context.from, to: context.to });
      setLinkModalInitialQuery(context.href);
      setLinkModalInitialLabel(context.text);
    } else {
      const { from, to } = editor.state.selection;
      setLinkModalAnchorPos(from);
      setLinkModalRange({ from, to });
      setLinkModalInitialQuery('');
      setLinkModalInitialLabel('');
    }
    setShowLinkModal(true);
  }, [editor]);

  const openFileModal = React.useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? '' : String(editor.state.doc.textBetween(from, to, ' ', ' ') || '').trim();
    setFileModalAnchorPos(from);
    setFileModalRange({ from, to });
    setFileModalInitialLabel(selectedText);
    setShowFileModal(true);
  }, [editor]);

  React.useEffect(() => {
    (window as any).GoToolkitMemoOpenFileBlockEditor = (payload: any) => {
      if (!editor) return;
      const pos = Number(payload?.pos);
      const node = Number.isFinite(pos) ? editor.state.doc.nodeAt(pos) : null;
      if (!node || node.type.name !== 'fileBlock') return;
      setFileModalAnchorPos(pos);
      setFileModalRange({ from: pos, to: pos + node.nodeSize });
      setFileModalInitialLabel(String(payload?.title || node.attrs?.title || node.attrs?.fileName || '').trim());
      setShowFileModal(true);
    };
    return () => {
      try {
        delete (window as any).GoToolkitMemoOpenFileBlockEditor;
      } catch {
        (window as any).GoToolkitMemoOpenFileBlockEditor = undefined;
      }
    };
  }, [editor]);

  const openFileInsertDialog = React.useCallback(() => {
    openFileModal();
  }, [openFileModal]);

  const insertNavigationBlock = React.useCallback(() => {
    if (!editor) return;
    const parentId = String((window as any).__memoActiveDocumentId || '').trim();
    editor.chain().focus().insertContent([
      { type: 'memoSummaryBlock', attrs: { title: 'Navigation', parentId } },
      { type: 'paragraph' }
    ]).run();
  }, [editor]);

  const insertPageSummaryBlock = React.useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent([
      { type: 'memoPageSummaryBlock', attrs: { title: 'Sommaire' } },
      { type: 'paragraph' }
    ]).run();
  }, [editor]);

  const handlePersistInitialNavigation = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    insertNavigationBlock();
  }, [insertNavigationBlock]);

  const handleDismissInitialNavigation = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const docId = String(activeDocumentId || '').trim();
    if (!docId) return;
    setDismissedInitialNavigation((prev) => {
      const next = new Set(prev);
      next.add(docId);
      persistDismissedInitialNavigation(next);
      return next;
    });
  }, [activeDocumentId]);

  React.useEffect(() => {
    if (!showInitialNavigationBlock) return;
    try {
      (window as any).lucide?.createIcons?.();
    } catch (err) {
      // ignore
    }
  }, [showInitialNavigationBlock, initialNavigationChildren]);

  React.useEffect(() => {
    if (!showSlashActionMenu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.memo-slash-actions-menu')) return;
      setShowSlashActionMenu(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showSlashActionMenu]);

  const normalizeSlashSearchValue = React.useCallback((value: string) => {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }, []);

  const getSlashTriggerQuery = React.useCallback((): string | null => {
    if (!editor || editor.isDestroyed) return null;
    const { selection, doc } = editor.state;
    if (!selection.empty) return null;
    const { $from } = selection;
    const blockStart = $from.start($from.depth);
    const textBefore = doc.textBetween(blockStart, selection.from, '\n', '\n');
    const match = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
    if (!match) return null;
    return match[1] || '';
  }, [editor]);

  React.useEffect(() => {
    if (!editor || !showSlashActionMenu) return;
    const syncSlashQuery = () => {
      const query = getSlashTriggerQuery();
      if (query === null) {
        setShowSlashActionMenu(false);
        return;
      }
      setSlashActionQuery(query);
    };
    editor.on('update', syncSlashQuery);
    editor.on('selectionUpdate', syncSlashQuery);
    syncSlashQuery();
    return () => {
      editor.off('update', syncSlashQuery);
      editor.off('selectionUpdate', syncSlashQuery);
    };
  }, [editor, showSlashActionMenu, getSlashTriggerQuery]);

  React.useEffect(() => {
    if (!showSlashActionMenu) return;
    const raf = requestAnimationFrame(() => {
      // Trigger one extra render once the menu is mounted so width/height-based clamping is accurate.
      setSlashActionMenuPos(prev => ({ ...prev }));
    });
    return () => cancelAnimationFrame(raf);
  }, [showSlashActionMenu]);

  type SlashActionItem = {
    label: string;
    value: string;
    icon: React.ComponentType<{ size?: number }>;
    markdownShortcut: string;
    aliases?: string[];
  };

  const slashActions = React.useMemo<SlashActionItem[]>(() => ([
    { label: 'Texte', value: 'paragraph', icon: Type, markdownShortcut: 'texte', aliases: ['paragraphe', 'text'] },
    { label: 'Titre 1', value: 'h1', icon: Heading1, markdownShortcut: '#', aliases: ['titre', 'heading'] },
    { label: 'Titre 2', value: 'h2', icon: Heading2, markdownShortcut: '##', aliases: ['titre', 'heading'] },
    { label: 'Titre 3', value: 'h3', icon: Heading3, markdownShortcut: '###', aliases: ['titre', 'heading'] },
    { label: 'Liste à puces', value: 'bulletList', icon: List, markdownShortcut: '-', aliases: ['liste', 'puce', 'list'] },
    { label: 'Liste numérotée', value: 'orderedList', icon: ListOrdered, markdownShortcut: '1.', aliases: ['liste numérotée', 'ordered', 'numbered'] },
    { label: 'Tâche', value: 'taskList', icon: CheckSquare, markdownShortcut: '[]', aliases: ['todo', 'task', 'checklist'] },
    { label: 'Bloc de code', value: 'codeBlock', icon: SquareCode, markdownShortcut: '```', aliases: ['code', 'snippet'] },
    { label: 'Lien', value: 'link', icon: Link, markdownShortcut: '[texte](url)', aliases: ['url', 'hyperlink'] },
    { label: 'Navigation', value: 'navigation', icon: FolderTree, markdownShortcut: 'navigation', aliases: ['children', 'enfants', 'pages'] },
    { label: 'Sommaire', value: 'summary', icon: ListTree, markdownShortcut: 'sommaire', aliases: ['summary', 'toc', 'titres', 'headings'] },
    { label: 'Libellé', value: 'label', icon: Tag, markdownShortcut: '@', aliases: ['tag', 'etiquette'] },
    { label: 'Citation', value: 'quote', icon: Quote, markdownShortcut: '>', aliases: ['blockquote', 'citation'] },
    { label: 'Tableau', value: 'table', icon: TableIcon, markdownShortcut: '|', aliases: ['table', 'grille'] },
    { label: 'Diagramme', value: 'diagram', icon: Shapes, markdownShortcut: 'mermaid', aliases: ['schema', 'graph', 'mermaid'] },
    { label: 'Image', value: 'image', icon: ImageIcon, markdownShortcut: '![alt](url)', aliases: ['photo', 'illustration'] },
    { label: 'Vidéo', value: 'video', icon: Clapperboard, markdownShortcut: 'video', aliases: ['movie', 'clip'] },
    { label: 'Fichier', value: 'file', icon: FileIcon, markdownShortcut: '[titre](fichier)', aliases: ['document', 'piece jointe', 'attachment'] },
  ]), []);

  const filteredSlashActions = React.useMemo(() => {
    const query = normalizeSlashSearchValue(slashActionQuery);
    if (!query) return slashActions;
    return slashActions.filter((item) => {
      const haystack = normalizeSlashSearchValue([
        item.label,
        item.value,
        item.markdownShortcut,
        ...(Array.isArray(item.aliases) ? item.aliases : []),
      ].join(' '));
      return haystack.includes(query);
    });
  }, [slashActionQuery, slashActions, normalizeSlashSearchValue]);

  const runSlashAction = React.useCallback((action: SlashActionItem | null | undefined) => {
    if (!editor) return;
    if (!action) return;

    const { selection, doc } = editor.state;
    if (selection.empty) {
      const { $from } = selection;
      const blockStart = $from.start($from.depth);
      const textBefore = doc.textBetween(blockStart, selection.from, '\n', '\n');
      const match = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
      if (match) {
        const query = match[1] || '';
        const from = Math.max(blockStart, selection.from - (query.length + 1));
        if (from < selection.from) {
          editor.chain().focus().deleteRange({ from, to: selection.from }).run();
        }
      }
    }

    runEditorDropdownAction(editor, action.value, {
      onLink: openLinkModal,
      onInsertImage: openImagePicker,
      onInsertVideo: openVideoInsertDialog,
      onInsertFile: openFileInsertDialog,
      onInsertNavigation: insertNavigationBlock,
      onInsertPageSummary: insertPageSummaryBlock,
    });
    setSlashActionQuery('');
    setShowSlashActionMenu(false);
  }, [editor, insertNavigationBlock, insertPageSummaryBlock, openFileInsertDialog, openImagePicker, openLinkModal, openVideoInsertDialog]);

  const runFirstSlashAction = React.useCallback(() => {
    const firstAction = filteredSlashActions[0];
    runSlashAction(firstAction);
  }, [filteredSlashActions, runSlashAction]);

  React.useEffect(() => {
    if (!showSlashActionMenu || !editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      runFirstSlashAction();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [editor, showSlashActionMenu, runFirstSlashAction]);

  const slashActionMenuStyle = React.useMemo(() => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      top: `${slashActionMenuPos.top}px`,
      left: `${slashActionMenuPos.left}px`,
      zIndex: 1600,
      minWidth: '250px',
    };
    if (!containerRect) return baseStyle;

    const padding = 10;
    const menuWidth = slashActionMenuRef.current?.offsetWidth || 250;
    const menuHeight = slashActionMenuRef.current?.offsetHeight || 320;

    const rawLeft = slashActionMenuPos.left - containerRect.left;
    const rawTop = slashActionMenuPos.top - containerRect.top;
    const minLeft = padding;
    const minTop = padding;
    const maxLeft = Math.max(minLeft, containerRect.width - menuWidth - padding);
    const maxTop = Math.max(minTop, containerRect.height - menuHeight - padding);

    const clampedLeft = Math.min(Math.max(rawLeft, minLeft), maxLeft);
    const clampedTop = Math.min(Math.max(rawTop, minTop), maxTop);

    return {
      ...baseStyle,
      top: `${clampedTop}px`,
      left: `${clampedLeft}px`,
    };
  }, [slashActionMenuPos]);

  const getNodeAtSafe = React.useCallback((pos: number) => {
    if (!editor || !Number.isFinite(Number(pos))) return null;
    const numericPos = Number(pos);
    const maxPos = Number(editor.state.doc.content.size || 0);
    if (numericPos < 0 || numericPos > maxPos) return null;
    try {
      return editor.state.doc.nodeAt(numericPos);
    } catch {
      return null;
    }
  }, [editor]);

  React.useEffect(() => {
    if (!blockDeleteHandle) return;
    if (!getNodeAtSafe(blockDeleteHandle.pos)) {
      setBlockDeleteHandle(null);
    }
  }, [blockDeleteHandle, getNodeAtSafe, editor.state.doc]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className="simple-editor"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (!editor || e.button !== 0) return;
        const handle = target.closest('.mermaid-node-handle');
        const mermaidContainer = target.closest('.mermaid-diagram-container');
        const isMermaidDragTarget = !!handle || (
          mermaidContainer &&
          !target.closest('.mermaid-modal, .mermaid-modal-overlay, .mermaid-modal-editor') &&
          !target.closest('button, input, textarea, select')
        );
        if (!isMermaidDragTarget) return;
        if (handle) e.preventDefault();
        const wrapper = (handle || mermaidContainer)?.closest('.mermaid-diagram-wrapper') as HTMLElement | null;
        if (!wrapper) return;
        try {
          const pos = editor.view.posAtDOM(wrapper, 0);
          const $pos = editor.state.doc.resolve(pos);
          let mermaidPos = -1;
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'mermaidDiagram') {
              mermaidPos = $pos.before(d);
              break;
            }
          }
          if (mermaidPos === -1) return;
          const node = editor.state.doc.nodeAt(mermaidPos);
          if (!node) return;
          setBlockDragPending({
            pos: mermaidPos,
            nodeSize: node.nodeSize,
            startX: e.clientX,
            startY: e.clientY
          });
          blockDragMovedRef.current = false;
        } catch (err) {
          // ignore
        }
      }}
      onMouseLeave={() => {
        setRowHandle(null);
        setColHandle(null);
        setBlockDeleteHandle(null);
        setQuoteHandle(null);
        setCodeHandle(null);
        setHoveredMermaidPos(null);
        setHoveredMediaPos(null);
      }}
    >
      <Toolbar
        editor={editor}
        onDropdownToggle={setIsDropdownOpen}
        onLink={openLinkModal}
        onInsertImage={openImagePicker}
        onInsertVideo={openVideoInsertDialog}
        onInsertFile={openFileInsertDialog}
      />
      <BubbleMenuComponent 
        editor={editor}
        visible={isFocusWithinMemoCard}
        onKeep={() => keepSelection(editor)}
        onReject={() => rejectSelection(editor)}
        onAssist={handleAssist}
        onLink={openLinkModal}
        onInsertImage={openImagePicker}
        onInsertVideo={openVideoInsertDialog}
        onInsertFile={openFileInsertDialog}
        onDropdownToggle={setIsDropdownOpen}
      />
      {showInitialNavigationBlock && (
        <div className="memo-summary-block memo-summary-block--initial" data-parent-id={activeDocumentId}>
          <div className="memo-summary-block__header">
            <span className="memo-summary-block__title">Navigation</span>
            <span className="memo-summary-block__actions" style={{ opacity: 1 }}>
              <button type="button" className="memo-summary-block__action" onClick={handlePersistInitialNavigation} aria-label="Ajouter">
                <Plus size={13} />
              </button>
              <button type="button" className="memo-summary-block__action" onClick={handleDismissInitialNavigation} aria-label="Masquer">
                <Trash2 size={13} />
              </button>
            </span>
          </div>
          <div className="memo-summary-block__list">
            {initialNavigationChildren.map((child) => (
              <button
                key={child.id}
                type="button"
                className="memo-link-block memo-summary-block__link-block"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const open = (window as any).GoToolkitMemoOpenDocumentByLink;
                  if (typeof open === 'function') open(child.id);
                }}
                aria-label={child.title}
              >
                <span className="memo-link-block__icon">
                  <i data-lucide={child.icon || 'file'}></i>
                  <span className="memo-link-block__icon-overlay"><ArrowUpRight size={10} /></span>
                </span>
                <span className="memo-link-block__title">{child.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <EditorContent editor={editor} />

      {showSlashActionMenu && editor && (
        <div
          ref={slashActionMenuRef}
          className="memo-slash-actions-menu tiptap-dropdown-menu"
          style={slashActionMenuStyle}
        >
          {filteredSlashActions.map((item) => (
            <div
              key={item.value}
              className="tiptap-dropdown-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                runSlashAction(item);
              }}
            >
              <item.icon size={16} />
              <span style={{ flex: 1 }}>{item.label}</span>
              <span className="memo-slash-actions-menu__shortcut">{item.markdownShortcut}</span>
            </div>
          ))}
          {!filteredSlashActions.length && (
            <div className="tiptap-dropdown-item" style={{ cursor: 'default', opacity: 0.75 }}>
              <span style={{ flex: 1 }}>Aucun bloc trouvé pour "{slashActionQuery}"</span>
            </div>
          )}
          <button
            type="button"
            className="memo-slash-actions-menu__close"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSlashActionQuery('');
              setShowSlashActionMenu(false);
            }}
          >
            <span>Fermer le menu</span>
            <span className="memo-slash-actions-menu__shortcut">esc</span>
          </button>
        </div>
      )}

      {showLinkModal && (
        <LinkSearchModal 
          editor={editor} 
          anchorPos={linkModalAnchorPos}
          selectionRange={linkModalRange}
          initialQuery={linkModalInitialQuery}
          initialLabel={linkModalInitialLabel}
          containerRef={containerRef}
          onClose={() => setShowLinkModal(false)} 
        />
      )}

      {showFileModal && (
        <FileSearchModal
          editor={editor}
          anchorPos={fileModalAnchorPos}
          selectionRange={fileModalRange}
          initialLabel={fileModalInitialLabel}
          containerRef={containerRef}
          onUploadFiles={uploadFilesToFileBlocks}
          onClose={() => setShowFileModal(false)}
        />
      )}

      {linkTooltip && !showLinkModal && (
        <div
          className="memo-link-tooltip"
          style={{ top: linkTooltip.top, left: linkTooltip.left }}
        >
          <button
            type="button"
            className="memo-link-tooltip__edit"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openLinkModal()}
            aria-label="Modifier le lien"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            className="memo-link-tooltip__href"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const href = String(linkTooltip.href || '').trim();
              if (!href) return;
              if (href.startsWith('memo://')) {
                const open = (window as any).GoToolkitMemoOpenDocumentByLink;
                if (typeof open === 'function') {
                  open(href.replace(/^memo:\/\//, ''));
                  return;
                }
              }
              window.open(href, '_blank', 'noopener,noreferrer');
            }}
            title={linkTooltip.href}
          >
            {linkTooltip.href}
          </button>
        </div>
      )}

      {rowHandle && !dragState && !blockDragState && (
        <div 
          className="table-handle table-handle-row"
          style={{ top: rowHandle.top, left: rowHandle.left }}
          onMouseDown={(e) => {
            e.preventDefault();
            if (rowHandle.rowIndex === 0) {
              const node = editor.state.doc.nodeAt(rowHandle.tablePos);
              if (!node) return;
              setBlockDragPending({
                pos: rowHandle.tablePos,
                nodeSize: node.nodeSize,
                startX: e.clientX,
                startY: e.clientY
              });
              blockDragMovedRef.current = false;
              return;
            }
            setMouseDownPoints({
              type: 'row',
              index: rowHandle.rowIndex,
              tablePos: rowHandle.tablePos,
              x: e.clientX,
              y: e.clientY
            });
          }}
        >
          ⠿
        </div>
      )}

      {colHandle && !dragState && !blockDragState && (
        <div 
          className="table-handle table-handle-col"
          style={{ top: colHandle.top, left: colHandle.left }}
          onMouseDown={(e) => {
            e.preventDefault();
            setMouseDownPoints({ type: 'col', index: colHandle.colIndex, tablePos: colHandle.tablePos, x: e.clientX, y: e.clientY });
          }}
        >
          ⠿
        </div>
      )}

      {blockDeleteHandle && getNodeAtSafe(blockDeleteHandle.pos) && !dragState && !blockDragState && (
        <div 
          className="block-handle-container"
          style={{
            position: 'absolute',
            top: blockDeleteHandle.top,
            left: blockDeleteHandle.left - (blockDeleteHandle.label === "le diagramme" ? 140 : 26),
            display: 'flex',
            gap: '4px',
            zIndex: 10
        }}>
          {["le bloc de code", "la citation", "le tableau", "le bloc dépliable"].includes(blockDeleteHandle.label) && (
            <button
              className="block-delete-button"
              style={{ position: 'static', opacity: 1 }}
              onClick={(e) => {
              e.stopPropagation();
              copyBlockHtmlAtPos(blockDeleteHandle.pos);
            }}
            title="Copier"
          >
            <Copy size={16} />
          </button>
        )}

        {blockDeleteHandle.label === "le diagramme" && (
          <>
            {(() => {
              const node = getNodeAtSafe(blockDeleteHandle.pos);
              if (!node || node.type.name !== 'mermaidDiagram') return null;
              const code = node.attrs.code || '';
              if (!code.trim() || !isFlowchartDiagram(code)) return null;
              const isSquare = node.attrs.size === 'large';
              const nextSize = isSquare ? 'small' : 'large';
              const label = isSquare ? 'Rectangle' : 'Carré';
              const Icon = isSquare ? RectangleHorizontal : Square;
              return (
                <button
                  className="block-delete-button mermaid-size-toggle"
                  style={{ position: 'static', opacity: 1 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const { code: nextCode, updated } = setFlowchartDirection(
                      code,
                      nextSize === 'large' ? 'TD' : 'LR'
                    );
                    const updatedCode = updated ? nextCode : code;
                    editor.chain()
                      .focus()
                      .setNodeSelection(blockDeleteHandle.pos)
                      .updateAttributes('mermaidDiagram', {
                        size: nextSize,
                        code: updatedCode,
                        excalidrawJSON: null
                      })
                      .run();
                    const drawMemo = (window as any).GoToolkitDrawMemo;
                    if (drawMemo) {
                      (async () => {
                        try {
                          await drawMemo.updateFromMermaid(updatedCode, nextSize);
                          const json = drawMemo.getSceneJSON();
                          editor.chain()
                            .focus()
                            .setNodeSelection(blockDeleteHandle.pos)
                            .updateAttributes('mermaidDiagram', {
                              excalidrawJSON: json
                            })
                            .run();
                        } catch (err) {
                          console.error("Failed to update mermaid preview", err);
                        }
                      })();
                    }
                  }}
                  title="Orientation"
                  aria-label={label}
                >
                  <Icon size={14} />
                </button>
              );
            })()}
            <button
              className="block-delete-button"
              style={{ position: 'static', opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                const dom = editor.view.nodeDOM(blockDeleteHandle.pos) as HTMLElement | null;
                if (dom) {
                  const container = dom.querySelector('.mermaid-diagram-container');
                  if (container) {
                    container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                  }
                }
              }}
              title="Modifier"
            >
              <Pencil size={16} />
            </button>
            <button
              className="block-delete-button"
              style={{ position: 'static', opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                copyBlockHtmlAtPos(blockDeleteHandle.pos);
              }}
              title="Copier"
            >
              <Copy size={16} />
            </button>
            <button
              className="block-delete-button"
              style={{ position: 'static', opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                const dom = editor.view.nodeDOM(blockDeleteHandle.pos) as HTMLElement | null;
                if (dom) {
                  const svg = dom.querySelector('svg');
                  if (svg) {
                    downloadSvgAsPng(svg as any, 'diagramme.png');
                  }
                }
              }}
              title="Image"
            >
              <ImageIcon size={16} />
            </button>
          </>
        )}

          <button
            className="block-delete-button"
            style={{ position: 'static', opacity: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              editor.chain().focus().setNodeSelection(blockDeleteHandle.pos).deleteSelection().run();
              setBlockDeleteHandle(null);
            }}
            title="Supprimer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {dropIndicator && (
        <div 
          className={`table-drop-indicator table-drop-indicator-${dropIndicator.type}`}
          style={{ 
            top: dropIndicator.top, 
            left: dropIndicator.left, 
            width: dropIndicator.width, 
            height: dropIndicator.height 
          }}
        />
      )}

      {blockDropIndicator && (
        <div 
          className="table-drop-indicator table-drop-indicator-row"
          style={{ 
            top: blockDropIndicator.top, 
            left: blockDropIndicator.left, 
            width: blockDropIndicator.width, 
            height: 2 
          }}
        />
      )}

      {tableSelectionBox && (
        <div
          className="table-selection-outline"
          style={{
            top: tableSelectionBox.top,
            left: tableSelectionBox.left,
            width: tableSelectionBox.width,
            height: tableSelectionBox.height,
          }}
        >
          <div
            className="table-selection-handle"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const selection = editor.state.selection;
              let anchorPos: number | null = null;
              let $pos = null;

              if (selection instanceof CellSelection) {
                anchorPos = selection.$anchorCell?.pos;
                $pos = selection.$anchorCell;
              } else {
                anchorPos = getTableCellPosFromResolved(selection.$from);
                if (anchorPos !== null) $pos = editor.state.doc.resolve(anchorPos);
              }

              if (typeof anchorPos !== 'number' || !$pos) return;
              
              let tablePos = -1;
              for (let d = $pos.depth; d > 0; d--) {
                if ($pos.node(d).type.name === 'table') {
                  tablePos = $pos.before(d);
                  break;
                }
              }
              if (tablePos === -1) return;
              setTableSelectionResize({ anchorPos, tablePos });
            }}
          />
        </div>
      )}

      {dragGhost && (dragState || blockDragState) && (
        <div
          className="drag-ghost"
          style={{
            top: (dragState?.y ?? blockDragState?.y ?? 0) - dragGhost.offsetY,
            left: (dragState?.x ?? blockDragState?.x ?? 0) - dragGhost.offsetX,
            width: dragGhost.width,
            height: dragGhost.height
          }}
        >
          <div className="drag-ghost-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(dragGhost.html) }} />
        </div>
      )}

      {dragState && (
        <div 
          className={`table-handle ${dragState.type === 'col' ? 'table-handle-col' : 'table-handle-row'}`}
          style={{ 
            position: 'fixed',
            top: dragState.y,
            left: dragState.x,
            opacity: 0.8,
            pointerEvents: 'none',
            zIndex: 2000,
            boxShadow: 'var(--shadow-md)',
            transform: `translate(-50%, -50%) ${dragState.type === 'col' ? 'rotate(90deg)' : ''}`
          }}
        >
          ⠿
        </div>
      )}

      {blockDragState && (
        <div
          className="table-handle block-drag-handle"
          style={{
            position: 'fixed',
            top: blockDragState.y,
            left: blockDragState.x,
            opacity: 0.8,
            pointerEvents: 'none',
            zIndex: 2000,
            boxShadow: 'var(--shadow-md)',
            transform: 'translate(-50%, -50%)'
          }}
        >
          ⠿
        </div>
      )}

      {quoteHandle && !dragState && !blockDragState && (
        <div 
          className="table-handle quote-handle"
          style={{ top: quoteHandle.top, left: quoteHandle.left }}
          onMouseDown={(e) => {
            const node = editor.state.doc.nodeAt(quoteHandle.pos);
            if (!node) return;
            setBlockDragPending({
              pos: quoteHandle.pos,
              nodeSize: node.nodeSize,
              startX: e.clientX,
              startY: e.clientY
            });
            blockDragMovedRef.current = false;
          }}
          onClick={(e) => {
            if (blockDragMovedRef.current) {
              blockDragMovedRef.current = false;
              return;
            }
            e.stopPropagation();
            setQuoteMenu({ top: quoteHandle.top, left: quoteHandle.left + 30, pos: quoteHandle.pos });
          }}
        >
          ⠿
        </div>
      )}

      {codeHandle && !dragState && !blockDragState && (
        <div
          className="table-handle code-handle"
          style={{ top: codeHandle.top, left: codeHandle.left }}
          onMouseDown={(e) => {
            const node = editor.state.doc.nodeAt(codeHandle.pos);
            if (!node) return;
            setBlockDragPending({
              pos: codeHandle.pos,
              nodeSize: node.nodeSize,
              startX: e.clientX,
              startY: e.clientY
            });
            blockDragMovedRef.current = false;
          }}
        >
          ⠿
        </div>
      )}

      {!dragState && !blockDragState && mermaidHandles.map((handle) => (
        <div
          key={`mermaid-handle-${handle.pos}`}
          className="table-handle mermaid-handle"
          style={{ top: handle.top, left: handle.left }}
          onMouseDown={(e) => {
            const node = editor.state.doc.nodeAt(handle.pos);
            if (!node) return;
            setBlockDragPending({
              pos: handle.pos,
              nodeSize: node.nodeSize,
              startX: e.clientX,
              startY: e.clientY
            });
            blockDragMovedRef.current = false;
          }}
        >
          ⠿
        </div>
      ))}

      {!dragState && !blockDragState && mediaHandles.map((handle) => (
        <div
          key={`media-handle-${handle.pos}`}
          className="table-handle media-handle"
          style={{ top: handle.top, left: handle.left }}
          onMouseDown={(e) => {
            const node = editor.state.doc.nodeAt(handle.pos);
            if (!node) return;
            setBlockDragPending({
              pos: handle.pos,
              nodeSize: node.nodeSize,
              startX: e.clientX,
              startY: e.clientY
            });
            blockDragMovedRef.current = false;
          }}
        >
          ⠿
        </div>
      ))}

      {quoteMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setQuoteMenu(null)} />
          <div 
            className="quote-context-menu"
            style={{ top: quoteMenu.top, left: quoteMenu.left }}
          >
            {ALERT_TYPES.map((alert) => (
              <div 
                key={alert.type}
                className="quote-context-menu-item"
                data-active={editor.state.doc.nodeAt(quoteMenu.pos)?.attrs.type === alert.type}
                onClick={() => {
                  const node = editor.state.doc.nodeAt(quoteMenu.pos);
                  if (node?.attrs.type === alert.type) {
                    // Si on clique sur le type déjà actif, on enlève la citation
                    editor.chain().focus()
                      .setTextSelection({ from: quoteMenu.pos + 1, to: quoteMenu.pos + 1 })
                      .lift('blockquote')
                      .run();
                  } else {
                    // Sinon on change juste le type de l'alerte
                    editor.chain().focus()
                      .setNodeSelection(quoteMenu.pos)
                      .updateAttributes('blockquote', { type: alert.type })
                      .run();
                  }
                  setQuoteMenu(null);
                }}
              >
                <alert.icon size={14} style={{ color: alert.color }} />
                {alert.label}
              </div>
            ))}
          </div>
        </>
      )}

      {tableContextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setTableContextMenu(null)} />
          <div 
            className="table-context-menu"
            style={{ top: tableContextMenu.top, left: tableContextMenu.left }}
          >
            <div 
              className="table-context-menu-item"
              onClick={() => {
                const { type, index, tablePos } = tableContextMenu;
                const table = editor.state.doc.nodeAt(tablePos);
                if (table) {
                  let cellPos = -1;
                  if (type === 'row') {
                    cellPos = tablePos + 1;
                    for (let i = 0; i < index; i++) cellPos += table.child(i).nodeSize;
                    cellPos += 1;
                  } else {
                    const row = table.child(0);
                    cellPos = tablePos + 1 + 1;
                    for (let i = 0; i < index; i++) cellPos += row.child(i).nodeSize;
                  }
                  editor.chain().focus().setNodeSelection(cellPos).run();
                  if (type === 'row') {
                    editor.chain().addRowBefore().run();
                  } else {
                    editor.chain().addColumnBefore().run();
                  }
                }
                setTableContextMenu(null);
              }}
            >
              <Plus size={14} style={{ marginRight: 8 }} />
              Ajouter
            </div>
            <div 
              className="table-context-menu-item"
              onClick={() => {
                const { type, index, tablePos } = tableContextMenu;
                const table = editor.state.doc.nodeAt(tablePos);
                if (table) {
                  let cellPos = -1;
                  if (type === 'row') {
                    cellPos = tablePos + 1;
                    for (let i = 0; i < index; i++) cellPos += table.child(i).nodeSize;
                    cellPos += 1;
                  } else {
                    const row = table.child(0);
                    cellPos = tablePos + 1 + 1;
                    for (let i = 0; i < index; i++) cellPos += row.child(i).nodeSize;
                  }
                  editor.chain().focus().setNodeSelection(cellPos).run();
                  if (type === 'row') {
                    editor.chain().deleteRow().run();
                  } else {
                    editor.chain().deleteColumn().run();
                  }
                }
                setTableContextMenu(null);
              }}
            >
              <X size={14} style={{ marginRight: 8 }} />
              Supprimer
            </div>
            {tableContextMenu.type === 'col' && (
              <>
                <div
                  className="table-context-menu-item"
                  onClick={() => {
                    sortColumn(editor, tableContextMenu.tablePos, tableContextMenu.index, 'asc');
                    setTableContextMenu(null);
                  }}
                >
                  <ArrowDownAZ size={14} style={{ marginRight: 8 }} />
                  Trier a-z
                </div>
                <div
                  className="table-context-menu-item"
                  onClick={() => {
                    sortColumn(editor, tableContextMenu.tablePos, tableContextMenu.index, 'desc');
                    setTableContextMenu(null);
                  }}
                >
                  <ArrowUpAZ size={14} style={{ marginRight: 8 }} />
                  Trier z-a
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SimpleEditor;
