import React from 'react';
import { useEditor, EditorContent, Editor, ReactRenderer, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Extension, InputRule, markInputRule } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import TiptapUnderline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { computePosition, offset, shift } from '@floating-ui/dom';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { NodeSelection } from 'prosemirror-state';
import Details from '@tiptap/extension-details';
import DetailsSummary from '@tiptap/extension-details-summary';
import DetailsContent from '@tiptap/extension-details-content';
import { TableOfContents } from '@tiptap/extension-table-of-contents';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import CodeBlock from '@tiptap/extension-code-block';

import { TableNode, TableRow, TableHeader, CustomTableCell, TABLE_COLORS } from './table-node';
import { TaskListNode, TaskItemNode } from './task-node';

const CustomDetails = Details.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      open: {
        default: true,
        parseHTML: element => element.hasAttribute('open') || element.getAttribute('data-open') === 'true',
        renderHTML: attributes => {
          return {
            open: attributes.open ? '' : null,
          }
        },
      },
    }
  },
});
import { 
  Undo2, Redo2, Heading1, Heading2, Heading3, Heading4, List, SquareCode, 
  Bold, Italic, Underline, Link, Strikethrough, 
  Highlighter, Table as TableIcon, Trash2, CodeXml,
  ChevronDown, Check, CheckCheck, Type,
  Bot, X, Palette, Plus, Baseline, Shapes,
  CheckSquare, ListTree,
  Pencil, Copy, Image as ImageIcon
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
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node }) => {
      const level = Math.min(4, Math.max(1, node.attrs.level || 1));
      const tag = `h${level}` as keyof JSX.IntrinsicElements;
      return (
        <NodeViewWrapper className="node-text">
          <NodeViewContent as={tag} />
        </NodeViewWrapper>
      );
    });
  },
});

const CustomParagraph = Paragraph.extend({
  addNodeView() {
    return ReactNodeViewRenderer(({ editor, getPos }) => {
      let isListItem = false;
      if (typeof getPos === 'function') {
        const pos = getPos();
        if (typeof pos === 'number') {
          const $pos = editor.state.doc.resolve(pos);
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'listItem') {
              isListItem = true;
              break;
            }
          }
        }
      }
      return (
        <NodeViewWrapper className={isListItem ? undefined : 'node-text node-paragraph'}>
          <NodeViewContent as="p" />
        </NodeViewWrapper>
      );
    });
  },
});

const CustomBulletList = BulletList.extend({
  addNodeView() {
    return ReactNodeViewRenderer(() => (
      <NodeViewWrapper className="node-text">
        <NodeViewContent as="ul" />
      </NodeViewWrapper>
    ));
  },
});

const CustomOrderedList = OrderedList.extend({
  addNodeView() {
    return ReactNodeViewRenderer(() => (
      <NodeViewWrapper className="node-text">
        <NodeViewContent as="ol" />
      </NodeViewWrapper>
    ));
  },
});

const CustomCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(() => (
      <NodeViewWrapper className="node-text">
        <pre>
          <NodeViewContent as="code" />
        </pre>
      </NodeViewWrapper>
    ));
  },
});

const LinkSearchModal = ({ editor, onClose }: { editor: Editor, onClose: () => void }) => {
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const modalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const { view } = editor;
    const { selection } = editor.state;
    const { from } = selection;
    
    // Fallback if coordsAtPos fails (e.g. selection at very end)
    let coords;
    try {
      coords = view.coordsAtPos(from);
    } catch (e) {
      coords = { left: window.innerWidth / 2, top: window.innerHeight / 2 };
    }
    
    if (modalRef.current) {
      const virtualElement = {
        getBoundingClientRect() {
          return new DOMRect(coords.left, coords.top, 0, 0);
        },
      };

      computePosition(virtualElement, modalRef.current, {
        placement: 'bottom-start',
        middleware: [
          offset(10),
          shift({ padding: 10 })
        ]
      }).then(({ x, y, strategy }: { x: number, y: number, strategy: string }) => {
        if (modalRef.current) {
          Object.assign(modalRef.current.style, {
            left: `${x}px`,
            top: `${y}px`,
            position: strategy,
            display: 'block',
          });
        }
      });
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editor, onClose]);

  const headings = (window as any).MemoHeadings || [];
  
  // Calculate hierarchy for each heading
  const getHierarchy = (index: number) => {
    const current = headings[index];
    if (!current || current.level === 1) return '';
    
    let path = [];
    let lastLevel = current.level;
    for (let i = index - 1; i >= 0; i--) {
      if (headings[i].level < lastLevel) {
        path.unshift(headings[i].textContent);
        lastLevel = headings[i].level;
        if (lastLevel === 1) break;
      }
    }
    return path.length > 0 ? path.join(' / ') : '';
  };

  const isUrl = (str: string) => {
    const pattern = /^([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;
    return pattern.test(str) || str.startsWith('http');
  };

  const filteredHeadings = headings
    .map((h: any, i: number) => ({ ...h, originalIndex: i }))
    .filter((h: any) => h.textContent.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 3);

  const items = [
    ...filteredHeadings.map((h: any) => ({
      type: 'heading',
      title: h.textContent,
      id: h.id,
      path: getHierarchy(h.originalIndex)
    })),
    ...(query ? [{
      type: 'url',
      title: query,
      isValid: isUrl(query)
    }] : [])
  ];

  const handleSelect = (item: any) => {
    let url = item.type === 'heading' ? `#${item.id}` : item.title;
    if (item.type === 'url' && !url.startsWith('http') && !url.startsWith('#')) {
      url = 'https://' + url;
    }

    const { from, to } = editor.state.selection;
    if (from !== to) {
      editor.chain().focus().setLink({ href: url }).run();
    } else {
      editor.chain().focus().insertContent([
        {
          type: 'text',
          text: item.title,
          marks: [{ type: 'link', attrs: { href: url } }]
        },
        { type: 'text', text: ' ' }
      ]).run();
    }
    onClose();
  };

  return (
    <div 
      ref={modalRef} 
      className="link-search-modal"
      style={{ position: 'fixed', zIndex: 2000, display: 'none' }}
    >
      <input
        autoFocus
        placeholder="Rechercher un titre ou coller un lien..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items[selectedIndex]) {
            handleSelect(items[selectedIndex]);
          } else if (e.key === 'ArrowDown') {
            setSelectedIndex((selectedIndex + 1) % items.length);
            e.preventDefault();
          } else if (e.key === 'ArrowUp') {
            setSelectedIndex((selectedIndex - 1 + items.length) % items.length);
            e.preventDefault();
          } else if (e.key === 'Escape') {
            onClose();
          }
        }}
      />
      <div className="link-search-results">
        {items.map((item, i) => (
          <div 
            key={i}
            className={`link-search-item ${i === selectedIndex ? 'selected' : ''}`}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => handleSelect(item)}
          >
            <div className="link-search-item-info">
              <div className="link-search-item-title">
                {item.type === 'url' ? <Link size={12} style={{ marginRight: 8, opacity: 0.6 }} /> : null}
                {item.title}
              </div>
              {item.path && <div className="link-search-item-path">{item.path}</div>}
              {item.type === 'url' && !item.isValid && (
                <div className="link-search-item-invalid">URL incomplète?</div>
              )}
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

const DetailsInputRule = Extension.create({
  name: 'detailsInputRule',
  addInputRules() {
    return [
      new InputRule({
        find: /^>>\s$/,
        handler: ({ state, range, chain }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name !== 'paragraph') {
            return null;
          }
          
          chain()
            .deleteRange(range)
            .setDetails()
            .run();
        },
      }),
    ]
  },
});

const TEXT_COLORS = [
  { name: 'Défaut', value: 'var(--bg-text-main)' },
  { name: 'Gris', value: 'var(--bg-text-gray)' },
  { name: 'Rouge', value: 'var(--bg-text-red)' },
  { name: 'Orange', value: 'var(--bg-text-orange)' },
  { name: 'Jaune', value: 'var(--bg-text-yellow)' },
  { name: 'Vert', value: 'var(--bg-text-green)' },
  { name: 'Bleu', value: 'var(--bg-text-blue)' },
  { name: 'Violet', value: 'var(--bg-text-purple)' },
];

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
import { MermaidNode, insertMermaidDiagram } from './mermaid-node';
import { Alert, ALERT_TYPES } from './blockquote-node';
import './simple-editor.css';

interface SimpleEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
}

// Custom BubbleMenu component for Tiptap v3
const BubbleMenuComponent = ({ editor, visible, onKeep, onReject, onAssist, onLink }: { 
  editor: Editor | null, 
  visible: boolean,
  onKeep: () => void,
  onReject: () => void,
  onAssist: () => void,
  onLink: () => void,
}) => {
  const [position, setPosition] = React.useState({ top: 0, left: 0, opacity: 0 });
  const [hasMarks, setHasMarks] = React.useState(false);
  const [showColors, setShowColors] = React.useState(false);
  const [showTextColors, setShowTextColors] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const updatePosition = React.useCallback(() => {
    if (!editor || !visible) {
      setPosition(prev => ({ ...prev, opacity: 0 }));
      setShowColors(false);
      return;
    }

    const { from, to } = editor.state.selection;
    if (from === to || editor.isActive('mermaidDiagram')) {
      setPosition(prev => ({ ...prev, opacity: 0 }));
      setShowColors(false);
      return;
    }

    // Check if selection has highlight or strike marks
    const hasHighlight = hasMarkInSelection(editor, 'highlight');
    const hasStrike = hasMarkInSelection(editor, 'strike');
    setHasMarks(hasHighlight || hasStrike);

    try {
      const { view } = editor;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      
      if (!start || !end) {
        setPosition(prev => ({ ...prev, opacity: 0 }));
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
      let bubbleTop = Math.min(start.top, end.top) - parentRect.top - menuHeight - verticalOffset;
      let bubbleLeft = ((start.left + end.left) / 2) - parentRect.left - menuWidth / 2;

      // Check bounds
      const padding = 10;
      const parentWidth = relativeParent?.clientWidth || window.innerWidth;
      const viewportTop = bubbleTop + parentRect.top;

      // 1. Clamp Horizontal (Stay within parent bounds)
      if (bubbleLeft < padding) {
        bubbleLeft = padding;
      } else if (bubbleLeft + menuWidth > parentWidth - padding) {
        bubbleLeft = parentWidth - menuWidth - padding;
      }

      // 2. Clamp Vertical (Stay within screen bounds)
      // If it goes above the top of the screen, move it below the selection
      if (viewportTop < padding) {
        bubbleTop = Math.max(start.bottom, end.bottom) - parentRect.top + verticalOffset;
      } 
      // If it goes below the screen, move it back up (limit at 10px from bottom)
      else if (viewportTop + menuHeight > window.innerHeight - padding) {
        bubbleTop = window.innerHeight - padding - menuHeight - parentRect.top;
      }

      setPosition({
        top: bubbleTop,
        left: bubbleLeft,
        opacity: 1,
      });
    } catch (err) {
      console.warn('BubbleMenu positioning error:', err);
      setPosition(prev => ({ ...prev, opacity: 0 }));
    }
  }, [editor, visible]);

  React.useEffect(() => {
    if (!editor) return;

    editor.on('selectionUpdate', updatePosition);
    editor.on('update', updatePosition);

    updatePosition();

    return () => {
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
            title="Assist"
          >
            <Bot size={16} />
          </button>
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
              onClick={() => {
                setShowTextColors(!showTextColors);
                setShowColors(false);
              }}
              title="Couleur du texte"
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
                      width: '20px', 
                      height: '20px', 
                      backgroundColor: color.value, 
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: '1px solid var(--border-main)'
                    }}
                    title={color.name}
                    onClick={() => {
                      editor.chain().focus().setColor(color.value).run();
                      setShowTextColors(false);
                    }}
                  />
                ))}
                <div 
                  className="table-color-option"
                  style={{ 
                    width: '20px', 
                    height: '20px', 
                    backgroundColor: 'var(--white)', 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: '1px solid var(--border-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px'
                  }}
                  title="Réinitialiser"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setShowTextColors(false);
                  }}
                >
                  <X size={10} />
                </div>
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
          
          {(editor.isActive('tableCell') || editor.isActive('tableHeader')) && (
            <div style={{ position: 'relative' }}>
              <button
                className="tiptap-button"
                type="button"
                onClick={() => {
                  setShowColors(!showColors);
                  setShowTextColors(false);
                }}
                title="Couleur de cellule"
              >
                <Palette size={14} />
              </button>
              {showColors && (
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
                  {TABLE_COLORS.map(color => (
                    <div 
                      key={color.value}
                      className="table-color-option"
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        backgroundColor: color.value === 'var(--bg-none)' ? 'var(--white)' : color.value, 
                        border: color.value === 'var(--bg-none)' ? '1px solid var(--border-main)' : 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title={color.name}
                      onClick={() => {
                        editor.chain().focus().setCellAttribute('backgroundColor', color.value).run();
                        setShowColors(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {hasMarks && (
          <>
            <div className="tiptap-separator" data-orientation="vertical" role="none"></div>
            <div role="group" className="tiptap-toolbar-group">
              <button
                className="tiptap-button bubble-keep"
                type="button"
                onClick={onKeep}
                title="Garder"
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

  if (fromRowIndex < 0 || fromRowIndex >= rows.length || toRowIndex < 0 || toRowIndex >= rows.length) return false;

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

    if ((typeName === 'paragraph' || typeName === 'heading') && node.content.size === 0) {
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

const BlockTypeDropdown = ({ editor, onOpenChange }: { editor: Editor, onOpenChange?: (isOpen: boolean) => void }) => {
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
    { label: 'Titre 4', value: 'h4', icon: Heading4, active: editor.isActive('heading', { level: 4 }) },
    { label: 'Liste à puces', value: 'bulletList', icon: List, active: editor.isActive('bulletList') },
    { label: 'Tâche', value: 'taskList', icon: CheckSquare, active: editor.isActive('taskList') },
    { label: 'Bloc de code', value: 'codeBlock', icon: SquareCode, active: editor.isActive('codeBlock') },
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
    else if (value === 'h4') chain.toggleHeading({ level: 4 }).run();
    else if (value === 'bulletList') chain.toggleBulletList().run();
    else if (value === 'taskList') chain.toggleTaskList().run();
    else if (value === 'code') chain.toggleCode().run();
    else if (value === 'codeBlock') chain.toggleCodeBlock().run();
    setIsOpen(false);
  };

  return (
    <div className="tiptap-dropdown" ref={dropdownRef}>
      <button 
        type="button"
        className="tiptap-dropdown-trigger" 
        onClick={() => setIsOpen(!isOpen)}
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

const Toolbar = ({ editor, onDropdownToggle, onLink }: { 
  editor: Editor, 
  onDropdownToggle?: (isOpen: boolean) => void,
  onLink: () => void 
}) => {
  // Force re-render when editor state changes
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [showTextColors, setShowTextColors] = React.useState(false);
  const toolbarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    onDropdownToggle?.(showTextColors);
  }, [showTextColors, onDropdownToggle]);

  React.useEffect(() => {
    if (!editor) return;

    // Update component on any editor change
    const updateHandler = () => forceUpdate();
    editor.on('update', updateHandler);
    editor.on('selectionUpdate', updateHandler);

    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setShowTextColors(false);
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
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Redo"
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

      <div role="group" className="tiptap-toolbar-group">
        <BlockTypeDropdown editor={editor} onOpenChange={onDropdownToggle} />
      </div>

      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

      <div role="group" className="tiptap-toolbar-group" aria-label="Style">
        <button
          className="tiptap-button"
          aria-label="Bold"
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-active-state={editor.isActive('bold') ? 'on' : 'off'}
        >
          <Bold size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Italic"
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-active-state={editor.isActive('italic') ? 'on' : 'off'}
        >
          <Italic size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Underline"
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          data-active-state={editor.isActive('underline') ? 'on' : 'off'}
        >
          <Underline size={16} />
        </button>

        <div style={{ position: 'relative' }}>
          <button
            className="tiptap-button"
            aria-label="Text Color"
            type="button"
            onClick={() => setShowTextColors(!showTextColors)}
            title="Couleur du texte"
          >
            <Baseline size={16} />
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
                    width: '20px', 
                    height: '20px', 
                    backgroundColor: color.value, 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: '1px solid var(--border-main)'
                  }}
                  title={color.name}
                  onClick={() => {
                    editor.chain().focus().setColor(color.value).run();
                    setShowTextColors(false);
                  }}
                />
              ))}
              <div 
                className="table-color-option"
                style={{ 
                  width: '20px', 
                  height: '20px', 
                  backgroundColor: 'var(--white)', 
                  borderRadius: '4px',
                  cursor: 'pointer',
                  border: '1px solid var(--border-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px'
                }}
                title="Réinitialiser"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowTextColors(false);
                }}
              >
                <X size={10} />
              </div>
            </div>
          )}
        </div>

        <button
          className="tiptap-button"
          aria-label="Strike"
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          data-active-state={editor.isActive('strike') ? 'on' : 'off'}
        >
          <Strikethrough size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Highlight"
          type="button"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          data-active-state={editor.isActive('highlight') ? 'on' : 'off'}
          title="Surligner"
        >
          <Highlighter size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Link"
          type="button"
          onClick={onLink}
          data-active-state={editor.isActive('link') ? 'on' : 'off'}
          title="Lien"
        >
          <Link size={16} />
        </button>
      </div>

      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

      <div role="group" className="tiptap-toolbar-group" aria-label="Bloc">
        <button
          className="tiptap-button"
          aria-label="Bloc dépliable"
          type="button"
          onClick={() => {
            editor.chain().focus().setDetails().run();
            // Focus the summary line
            setTimeout(() => {
              const { state } = editor;
              const { selection } = state;
              const pos = selection.from;
              
              const searchFrom = Math.max(0, pos - 20);
              const searchTo = Math.min(state.doc.content.size, pos + 20);
              
              // Find the detailsSummary node and focus it
              state.doc.nodesBetween(searchFrom, searchTo, (node, nodePos) => {
                if (node.type.name === 'detailsSummary') {
                  editor.chain().focus(nodePos + 1).run();
                  return false;
                }
              });
            }, 10);
          }}
          data-active-state={editor.isActive('details') ? 'on' : 'off'}
          title="Bloc dépliable"
        >
          <ListTree size={16} />
        </button>

        <QuoteTypeDropdown editor={editor} />
      </div>

      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

      <div role="group" className="tiptap-toolbar-group" aria-label="Insertion">
        <button
          className="tiptap-button"
          aria-label="Insert Table"
          type="button"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Insert Mermaid Diagram"
          type="button"
          onClick={() => {
            insertMermaidDiagram(editor);
          }}
          data-active-state={editor.isActive('mermaidDiagram') ? 'on' : 'off'}
          title="Insérer un diagramme Mermaid"
        >
          <Shapes size={16} />
        </button>
      </div>

      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

      <div role="group" className="tiptap-toolbar-group">
        {editor && hasMarksInDocument(editor) && (
          <button
            className="tiptap-button toolbar-action-btn toolbar-keep"
            aria-label="Garder tout"
            type="button"
            title="Garder tout"
            onClick={() => keepAllDocument(editor)}
          >
            <CheckCheck size={16} />
          </button>
        )}
        <button
          className="tiptap-button"
          aria-label="Voir le code source"
          title="Voir le code source"
          type="button"
          onClick={() => {
            (window as any).openMemoSourceModal?.();
            document.dispatchEvent(new CustomEvent('memoEditorOpenSourceModal'));
          }}
        >
          <CodeXml size={16} />
        </button>
      </div>
    </div>
  );
};

// Code Suggestion List Component
const CodeList = React.forwardRef((props: any, ref: any) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const selectItem = (index: number) => {
    const item = props.items?.[index];
    if (item) {
      props.command({ text: item });
    }
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
      {props.items.map((item: string, index: number) => (
        <button
          key={index}
          onClick={() => selectItem(index)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            background: index === selectedIndex ? 'var(--bg-surface)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '13px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            color: 'var(--text-main)',
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
});

// Code suggestion configuration
const codeSuggestion = {
  items: ({ editor, query }: { editor: Editor, query: string }) => {
    const snippets = new Set<string>();
    
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        const codeMark = node.marks.find(m => m.type.name === 'code');
        if (codeMark && node.text) {
          snippets.add(node.text.trim());
        }
      }
      return true;
    });

    return Array.from(snippets)
      .filter(item => item.toLowerCase().includes(query.toLowerCase()))
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
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'text',
                text: props.text,
                marks: [{ type: 'code' }],
              },
              {
                type: 'text',
                text: ' ',
              },
            ])
            .run();
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
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

const SimpleEditor: React.FC<SimpleEditorProps> = ({ 
  content = '', 
  onChange, 
  placeholder = 'Commencez à écrire...' 
}) => {
  const turndownRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  const [rowHandle, setRowHandle] = React.useState<{ top: number, left: number, rowIndex: number, tablePos: number } | null>(null);
  const [colHandle, setColHandle] = React.useState<{ top: number, left: number, colIndex: number, tablePos: number } | null>(null);
  const [blockDeleteHandle, setBlockDeleteHandle] = React.useState<{ top: number, left: number, pos: number, label: string } | null>(null);
  const [quoteHandle, setQuoteHandle] = React.useState<{ top: number, left: number, pos: number, type: string } | null>(null);
  const [quoteMenu, setQuoteMenu] = React.useState<{ top: number, left: number, pos: number } | null>(null);
  const [detailsHandle, setDetailsHandle] = React.useState<{ top: number, left: number, pos: number } | null>(null);
  const [detailsMenu, setDetailsMenu] = React.useState<{ top: number, left: number, pos: number } | null>(null);
  const [mermaidHandles, setMermaidHandles] = React.useState<Array<{ top: number, left: number, pos: number }>>([]);
  const [hoveredMermaidPos, setHoveredMermaidPos] = React.useState<number | null>(null);
  const [textHandle, setTextHandle] = React.useState<{ top: number, left: number, pos: number } | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [selectionData, setSelectionData] = React.useState<any>(null);
  const [tableContextMenu, setTableContextMenu] = React.useState<{ top: number, left: number, type: 'row' | 'col', index: number, tablePos: number } | null>(null);
  const [mouseDownPoints, setMouseDownPoints] = React.useState<{ type: 'row' | 'col', index: number, tablePos: number, x: number, y: number } | null>(null);
  const [dragState, setDragState] = React.useState<{ type: 'row' | 'col', index: number, tablePos: number, x: number, y: number } | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<{ top: number, left: number, width?: number, height?: number, type: 'row' | 'col' } | null>(null);
  const [blockDragPending, setBlockDragPending] = React.useState<{ pos: number, nodeSize: number, startX: number, startY: number } | null>(null);
  const [blockDragState, setBlockDragState] = React.useState<{ pos: number, nodeSize: number, x: number, y: number } | null>(null);
  const [blockDropIndicator, setBlockDropIndicator] = React.useState<{ top: number, left: number, width: number } | null>(null);
  const [showLinkModal, setShowLinkModal] = React.useState(false);
  const blockDragMovedRef = React.useRef(false);

  const editor = useEditor({
    extensions: [
      CustomDetails.configure({
        HTMLAttributes: {
          class: 'details node-details',
        },
      }),
      DetailsSummary,
      DetailsContent,
      StarterKit.configure({
        blockquote: false,
        heading: false, // Use our custom Heading instead to get IDs
        code: false,
        paragraph: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
      }),
      Code.extend({
        addInputRules() {
          return [
            markInputRule({
              find: /(?:^|\s)(`([^`]+)`)$/,
              type: this.type,
            }),
          ]
        },
      }),
      CustomHeading.configure({
        levels: [1, 2, 3, 4],
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
      Image,
      TableNode,
      TableRow,
      TableHeader,
      CustomTableCell,
      TaskListNode,
      TaskItemNode,
      MermaidNode,
      CodeSuggestion,
      DetailsInputRule,
      TableOfContents.configure({
        onUpdate(content: any[]) {
          (window as any).MemoHeadings = content;
          // Dispatch a custom event to notify vanilla JS code
          window.dispatchEvent(new CustomEvent('memo:headings-updated', { detail: content }));
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      if (onChange) {
        // Debounce the onChange call to avoid excessive saves
        if ((window as any)._memoSaveTimeout) {
          clearTimeout((window as any)._memoSaveTimeout);
        }
        (window as any)._memoSaveTimeout = setTimeout(() => {
          onChange(editor.getHTML());
        }, 500);
      }
    },
    onBlur: ({ editor }) => {
      if (onChange) {
        // Save immediately on blur
        if ((window as any)._memoSaveTimeout) {
          clearTimeout((window as any)._memoSaveTimeout);
        }
        onChange(editor.getHTML());
      }
    },
  });

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

  const setAllDetailsOpen = (open: boolean) => {
    if (!editor) return;
    const { tr, doc } = editor.state;
    let touched = false;
    doc.descendants((node, pos) => {
      if (node.type.name === 'details') {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, open });
        touched = true;
      }
    });
    if (touched) {
      editor.view.dispatch(tr);
    }
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
    const codeEl = element?.closest('pre');
    const targetBlock = tableEl || blockquoteEl || detailsEl || mermaidEl || codeEl;

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
    if (detailsEl && containerRef.current.contains(detailsEl)) {
      const rect = detailsEl.getBoundingClientRect();
      let detailsPos = -1;
      try {
        const domPos = editor.view.posAtDOM(detailsEl, 0);
        const $pos = editor.state.doc.resolve(domPos);
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === 'details') {
            detailsPos = $pos.before(d);
            break;
          }
        }
        if (detailsPos === -1) {
          const node = editor.state.doc.nodeAt(domPos);
          if (node?.type.name === 'details') detailsPos = domPos;
        }
      } catch (err) {
        // ignore
      }

      if (detailsPos === -1) {
        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        if (pos !== undefined) {
          const $pos = editor.state.doc.resolve(pos);
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'details') {
              detailsPos = $pos.before(d);
              break;
            }
          }
        }
      }

      if (detailsPos !== -1) {
        setDetailsHandle({
          top: rect.top - containerRect.top + 10,
          left: rect.left - containerRect.left - 15,
          pos: detailsPos
        });
      } else {
        setDetailsHandle(null);
      }
    } else if (!(e.target as HTMLElement).closest('.details-handle')) {
      setDetailsHandle(null);
    }

    // 2c. Text Node Drag Handle (Left)
    let nodeTextEl = element?.closest('.node-text') as HTMLElement | null;
    if (nodeTextEl?.closest('li')) {
      nodeTextEl = element?.closest('ul.node-text, ol.node-text') as HTMLElement | null;
    }
    const isNestedBlock = nodeTextEl?.closest('.alert-wrapper, .details, .tableWrapper, .mermaid-diagram-wrapper, li');
    if (nodeTextEl && containerRef.current.contains(nodeTextEl) && !isNestedBlock) {
      const rect = nodeTextEl.getBoundingClientRect();
      if (e.clientX <= rect.left + 120) {
        try {
          const pos = editor.view.posAtDOM(nodeTextEl, 0);
          const $pos = editor.state.doc.resolve(pos);
          let textPos = -1;
          for (let d = $pos.depth; d > 0; d--) {
            const typeName = $pos.node(d).type.name;
            if (['paragraph', 'heading', 'bulletList', 'orderedList', 'codeBlock'].includes(typeName)) {
              textPos = $pos.before(d);
              break;
            }
          }
          if (textPos !== -1) {
            setTextHandle({
              top: rect.top - containerRect.top + 6,
              left: rect.left - containerRect.left + 5,
              pos: textPos
            });
          } else {
            setTextHandle(null);
          }
        } catch (err) {
          setTextHandle(null);
        }
      } else {
        setTextHandle(null);
      }
    } else if (!(e.target as HTMLElement).closest('.node-handle')) {
      setTextHandle(null);
    }


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
          setRowHandle({
            top: rect.top - containerRect.top + rect.height / 2,
            left: tableWrapperRect.left - containerRect.left + 5,
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
      (window as any).MemoEditor = editor;

      if (!turndownRef.current) {
        const turndown = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
        });
        // Always use GFM for tables and other GitHub-flavored features
        turndown.use(gfm);

        // Custom rule for GitHub-style alerts
        turndown.addRule('blockquote-alerts', {
          filter: 'blockquote',
          replacement: function (content: string, node: any) {
            const type = node.getAttribute('data-type');
            if (!type || type === 'default') return '\n\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n\n';
            const title = node.getAttribute('data-title');
            const alertTag = title ? `[!${type}] ${title}` : `[!${type}]`;
            return '\n\n> ' + alertTag + '\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n\n';
          }
        });

        // Custom rule for Mermaid diagrams
        turndown.addRule('mermaid-diagram', {
          filter: 'mermaid-diagram',
          replacement: function (_content: string, node: any) {
            const code = node.getAttribute('code') || '';
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

        // Custom rule for Task Lists
        turndown.addRule('taskList', {
          filter: function (node: any) {
            return node.nodeName === 'LI' && node.parentNode.nodeName === 'UL' && node.classList.contains('task-list-item');
          },
          replacement: function (content: string, node: any) {
            const checkbox = node.querySelector('input[type="checkbox"]');
            const checked = checkbox && checkbox.checked ? 'x' : ' ';
            return '- [' + checked + '] ' + content.trim() + '\n';
          }
        });

        turndownRef.current = turndown;
      }

      (window as any).getEditorMarkdown = () => {
        try {
          if (typeof editor.getHTML === 'function') {
            const html = editor.getHTML();
            
            // Manual conversion for Mermaid diagrams before Turndown
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 1. Handle Mermaid diagrams
            const diagrams = doc.querySelectorAll('mermaid-diagram');
            diagrams.forEach(diag => {
              const code = diag.getAttribute('code') || '';
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
            
            // Remove Tiptap-specific classes and styles from table elements
            const tables = doc.querySelectorAll('table');
            tables.forEach(table => {
              table.removeAttribute('class');
              table.removeAttribute('style');
              table.querySelectorAll('td, th, tr').forEach(el => {
                el.removeAttribute('class');
                el.removeAttribute('style');
                // Clean up cell content to prevent Turndown from adding extra newlines
                if (el.tagName === 'TD' || el.tagName === 'TH') {
                  // Tiptap often wraps cell content in <p> tags, which Turndown converts to newlines.
                  // We strip these <p> tags and keep only the text/inline content.
                  const paragraphs = el.querySelectorAll('p');
                  paragraphs.forEach(p => {
                    const span = doc.createElement('span');
                    span.innerHTML = p.innerHTML;
                    p.replaceWith(span);
                  });
                  el.innerHTML = el.innerHTML.replace(/\n/g, ' ').trim();
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

      (window as any).getMemoEditorSource = (format: 'markdown' | 'html' | 'json') => {
        try {
          if (format === 'html') {
            return editor.getHTML();
          }

          if (format === 'json') {
            return JSON.stringify(editor.getJSON(), null, 2);
          }

          // Markdown
          return (window as any).getEditorMarkdown?.() || '';
        } catch (err) {
          return '';
        }
      };

      (window as any).setEditorMarkdown = (markdown: string) => {
        if (typeof markdown !== 'string') return;
        try {
          // Pre-process newer alert format: >note, >alerte, etc. (case insensitive)
          const shortAlertRegex = /^>(note|alerte|warning|important|conseil|tip|attention|caution|remarque)\s(.*)$/gmi;
          const markdownWithShortAlerts = markdown.replace(shortAlertRegex, (_match, type, content) => {
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
          const alertRegex = /^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|ALERTE|ATTENTION)(?:\s+(.*))?\]\s*\n((?:>.*\n?)*)/gmi;
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
          
          // Pre-process mermaid code blocks to mermaid-diagram tags
          const mermaidRegex = /```mermaid\n([\s\S]*?)\n```/g;
          const processedMarkdown = markdownWithHighlight.replace(mermaidRegex, (_match, code) => {
            const escapedCode = code.trim()
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
            return `<mermaid-diagram code="${escapedCode}"></mermaid-diagram>`;
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

      (window as any).insertEditorMarkdownAtEnd = (markdown: string) => {
        if (typeof markdown !== 'string') return;
        try {
          // Pre-process newer alert format: >note, >alerte, etc. (case insensitive)
          const shortAlertRegex = /^>(note|alerte|warning|important|conseil|tip|attention|caution|remarque)\s(.*)$/gmi;
          const markdownWithShortAlerts = markdown.replace(shortAlertRegex, (_match, type, content) => {
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
          const alertRegex = /^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|ALERTE|ATTENTION)(?:\s+(.*))?\]\s*\n((?:>.*\n?)*)/gmi;
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
          
          // Pre-process mermaid code blocks to mermaid-diagram tags
          const mermaidRegex = /```mermaid\n([\s\S]*?)\n```/g;
          const processedMarkdown = markdownWithHighlight.replace(mermaidRegex, (_match, code) => {
            const escapedCode = code.trim()
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
            return `<mermaid-diagram code="${escapedCode}"></mermaid-diagram>`;
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

          if (editor) {
            editor.chain().focus().insertContentAt(editor.state.doc.content.size, (editor.isEmpty ? '' : '\n\n') + finalHtml).run();
          }
        } catch (err) {
          console.warn('insertEditorMarkdownAtEnd failed', err);
        }
      };

      // Exposer l'éditeur Tiptap pour le composant flottant chat-inline-editor
      (window as any).memoEditor = editor;
    }
  }, [editor]);

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
            const html = tmp.innerHTML;
            selectionMarkdown = (turndownRef.current?.turndown(html) || '').trim();
          } catch (err) {
            selectionMarkdown = '';
          }

          // Étendre la sélection au bloc complet (paragraphe, tableau, liste, code block)
          let blockFrom = from;
          let blockTo = to;
          let blockText = selectedText;

          editor.state.doc.nodesBetween(from, to > from ? to - 1 : to, (node, pos) => {
            // Trouver le bloc parent (paragraphe, heading, table, code block, list item)
            if (
              node.type.name === 'paragraph' ||
              node.type.name === 'heading' ||
              node.type.name === 'codeBlock' ||
              node.type.name === 'table' ||
              node.type.name === 'listItem' ||
              node.type.name === 'blockquote' ||
              node.type.name === 'mermaidDiagram'
            ) {
              blockFrom = Math.min(blockFrom, pos);
              blockTo = Math.max(blockTo, pos + node.nodeSize);
            }
          });

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
            const html = tmp.innerHTML;
            blockMarkdown = (turndownRef.current?.turndown(html) || '').trim();
          } catch (err) {
            blockMarkdown = '';
          }

          // Calculer la position (en bas de la sélection, à gauche du début)
          try {
            const coordsStart = editor.view.coordsAtPos(blockFrom);
            const coordsEnd = editor.view.coordsAtPos(blockTo, -1);
            
            // Stocker les données pour "Assist" au lieu d'émettre
            setSelectionData({
              isSelected: true,
              nodeType: nodeType,
              selectionText: selectedText,
              selectionMarkdown: selectionMarkdown,
              blockText: blockText,
              blockMarkdown: blockMarkdown,
              selectionExcerpt: blockText.substring(0, 100) + (blockText.length > 100 ? '…' : ''),
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
          !target.closest('.mermaid-controls, .mermaid-modal, .mermaid-modal-overlay, .mermaid-modal-editor') &&
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
        setQuoteHandle(null);
        setDetailsHandle(null);
        setTextHandle(null);
      }}
    >
      <Toolbar editor={editor} onDropdownToggle={setIsDropdownOpen} onLink={() => setShowLinkModal(true)} />
      <BubbleMenuComponent 
        editor={editor}
        visible={!isDropdownOpen}
        onKeep={() => keepSelection(editor)}
        onReject={() => rejectSelection(editor)}
        onAssist={handleAssist}
        onLink={() => setShowLinkModal(true)}
      />
      <EditorContent editor={editor} />

      {showLinkModal && (
        <LinkSearchModal 
          editor={editor} 
          onClose={() => setShowLinkModal(false)} 
        />
      )}

      {rowHandle && !dragState && !blockDragState && (
        <div 
          className="table-handle table-handle-row"
          style={{ top: rowHandle.top, left: rowHandle.left }}
          onMouseDown={(e) => {
            e.preventDefault();
            const node = editor.state.doc.nodeAt(rowHandle.tablePos);
            if (!node) return;
            setBlockDragPending({
              pos: rowHandle.tablePos,
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

      {blockDeleteHandle && !dragState && !blockDragState && (
        <div 
          className="block-handle-container"
          style={{
            position: 'absolute',
            top: blockDeleteHandle.top,
            left: blockDeleteHandle.left - (blockDeleteHandle.label === "le diagramme" ? 104 : 26),
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
              const node = editor.state.doc.nodeAt(blockDeleteHandle.pos);
              if (node) {
                const text = node.textContent;
                navigator.clipboard.writeText(text).then(() => {
                  document.dispatchEvent(new CustomEvent('copyToast', { 
                    detail: { message: 'Text copié' } 
                  }));
                });
              }
            }}
            title="Copier le contenu"
          >
            <Copy size={16} />
          </button>
        )}

        {blockDeleteHandle.label === "le diagramme" && (
          <>
            <button
              className="block-delete-button"
              style={{ position: 'static', opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                const dom = editor.view.nodeDOM(blockDeleteHandle.pos) as HTMLElement;
                if (dom) {
                  const container = dom.querySelector('.mermaid-diagram-container');
                  if (container) {
                    container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                  }
                }
              }}
              title="Modifier le diagramme"
            >
              <Pencil size={16} />
            </button>
            <button
              className="block-delete-button"
              style={{ position: 'static', opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                const node = editor.state.doc.nodeAt(blockDeleteHandle.pos);
                if (node && node.attrs.code) {
                  navigator.clipboard.writeText(node.attrs.code).then(() => {
                    document.dispatchEvent(new CustomEvent('copyToast', { 
                      detail: { message: 'Code copié !' } 
                    }));
                  });
                }
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
                const dom = editor.view.nodeDOM(blockDeleteHandle.pos) as HTMLElement;
                if (dom) {
                  const svg = dom.querySelector('svg');
                  if (svg) {
                    downloadSvgAsPng(svg as any, 'diagramme.png');
                  }
                }
              }}
              title="Télécharger en PNG"
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
            title={`Supprimer ${blockDeleteHandle.label}`}
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

      {textHandle && !dragState && !blockDragState && (
        <div
          className="table-handle node-handle text-handle"
          style={{ top: textHandle.top, left: textHandle.left }}
          onMouseDown={(e) => {
            const node = editor.state.doc.nodeAt(textHandle.pos);
            if (!node) return;
            setBlockDragPending({
              pos: textHandle.pos,
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

      {detailsHandle && !dragState && !blockDragState && (
        <div 
          className="table-handle details-handle"
          style={{ top: detailsHandle.top, left: detailsHandle.left }}
          onMouseDown={(e) => {
            const node = editor.state.doc.nodeAt(detailsHandle.pos);
            if (!node) return;
            setBlockDragPending({
              pos: detailsHandle.pos,
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
            setDetailsMenu({ top: detailsHandle.top, left: detailsHandle.left + 30, pos: detailsHandle.pos });
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

      {detailsMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setDetailsMenu(null)} />
          <div 
            className="quote-context-menu"
            style={{ top: detailsMenu.top, left: detailsMenu.left }}
          >
            <div 
              className="quote-context-menu-item"
              onClick={() => {
                setAllDetailsOpen(true);
                setDetailsMenu(null);
              }}
            >
              Tout déplier
            </div>
            <div 
              className="quote-context-menu-item"
              onClick={() => {
                setAllDetailsOpen(false);
                setDetailsMenu(null);
              }}
            >
              Tout replier
            </div>
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
                  if (type === 'row') editor.chain().addRowBefore().run();
                  else editor.chain().addColumnBefore().run();
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
                  if (type === 'row') editor.chain().deleteRow().run();
                  else editor.chain().deleteColumn().run();
                }
                setTableContextMenu(null);
              }}
            >
              <X size={14} style={{ marginRight: 8 }} />
              Supprimer
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SimpleEditor;
