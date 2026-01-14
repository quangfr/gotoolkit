import React from 'react';
import { useEditor, EditorContent, Editor, ReactRenderer } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { computePosition } from '@floating-ui/dom';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import { 
  Undo2, Redo2, Heading1, Heading2, Heading3, List, Quote, SquareCode, 
  Bold, Italic, Underline, Link as LinkIcon, Strikethrough, 
  Highlighter, Table as TableIcon, Trash2, CodeXml,
  ChevronDown, Check, CheckCheck, Type,
  Bot, X, Palette, Plus, Baseline, Tag, Shapes,
  Info, Lightbulb, AlertTriangle, AlertCircle, MessageSquare
} from 'lucide-react';

const ALERT_TYPES = [
  { type: 'NOTE', label: 'Note', icon: Info, color: '#3b82f6' },
  { type: 'TIP', label: 'Conseil', icon: Lightbulb, color: '#22c55e' },
  { type: 'IMPORTANT', label: 'Important', icon: MessageSquare, color: '#a855f7' },
  { type: 'WARNING', label: 'Alerte', icon: AlertTriangle, color: '#eab308' },
  { type: 'CAUTION', label: 'Attention', icon: AlertCircle, color: '#ef4444' },
];

const Alert = Extension.create({
  name: 'alert',
  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: ['blockquote'],
        attributes: {
          type: {
            default: 'NOTE',
            parseHTML: element => element.getAttribute('data-type') || 'NOTE',
            renderHTML: attributes => {
              return { 'data-type': attributes.type || 'NOTE' }
            },
          },
        },
      },
    ]
  },
});

const TEXT_COLORS = [
  { name: 'Noir', value: '#1e293b' },
  { name: 'Gris', value: '#64748b' },
  { name: 'Rouge', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Jaune', value: '#eab308' },
  { name: 'Vert', value: '#22c55e' },
  { name: 'Bleu', value: '#3b82f6' },
  { name: 'Violet', value: '#a855f7' },
];

const COLORS = [
  { name: 'Défaut', value: 'transparent' },
  { name: 'Bleu', value: '#e0f2fe' },
  { name: 'Vert', value: '#dcfce7' },
  { name: 'Jaune', value: '#fef9c3' },
  { name: 'Rouge', value: '#fee2e2' },
  { name: 'Violet', value: '#f3e8ff' },
  { name: 'Gris', value: '#f3f4f6' },
];
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
import { MermaidNode, insertMermaidDiagram } from './mermaid-node';
import './simple-editor.css';

interface SimpleEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
}

// Custom BubbleMenu component for Tiptap v3
const BubbleMenuComponent = ({ editor, visible, onKeep, onReject, onAssist }: { 
  editor: Editor | null, 
  visible: boolean,
  onKeep: () => void,
  onReject: () => void,
  onAssist: () => void,
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
    if (from === to) {
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
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
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
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  zIndex: 1001,
                  padding: '8px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '4px',
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
                      border: '1px solid #e2e8f0'
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
                    backgroundColor: '#fff', 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: '1px solid #e2e8f0',
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

          <div className="tiptap-separator-inline" style={{ width: '1px', height: '18px', backgroundColor: '#e2e8f0', margin: '0 6px' }}></div>

          <button
            className="tiptap-button"
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            data-active-state={editor.isActive('code') ? 'on' : 'off'}
            title="Libellé"
          >
            <Tag size={14} />
          </button>
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
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    zIndex: 1001,
                    padding: '8px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '4px',
                  }}
                >
                  {COLORS.map(color => (
                    <div 
                      key={color.value}
                      className="table-color-option"
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        backgroundColor: color.value === 'transparent' ? '#fff' : color.value, 
                        border: color.value === 'transparent' ? '1px solid #ddd' : 'none',
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
                style={{ color: '#059669' }}
              >
                <Check size={16} />
              </button>
              <button
                className="tiptap-button bubble-reject"
                type="button"
                onClick={onReject}
                title="Annuler"
                style={{ color: '#dc2626' }}
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

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: element => element.getAttribute('data-background-color'),
        renderHTML: attributes => {
          return {
            'data-background-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          }
        },
      },
    }
  },
})

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

const BlockTypeDropdown = ({ editor }: { editor: Editor }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const options = [
    { label: 'Texte', value: 'paragraph', icon: Type, active: editor.isActive('paragraph') },
    { label: 'Titre 1', value: 'h1', icon: Heading1, active: editor.isActive('heading', { level: 1 }) },
    { label: 'Titre 2', value: 'h2', icon: Heading2, active: editor.isActive('heading', { level: 2 }) },
    { label: 'Titre 3', value: 'h3', icon: Heading3, active: editor.isActive('heading', { level: 3 }) },
    { label: 'Liste à puces', value: 'bulletList', icon: List, active: editor.isActive('bulletList') },
    { label: 'Bloc de code', value: 'codeBlock', icon: SquareCode, active: editor.isActive('codeBlock') },
    { label: 'Lien', value: 'link', icon: LinkIcon, active: editor.isActive('link') },
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
    else if (value === 'code') chain.toggleCode().run();
    else if (value === 'codeBlock') chain.toggleCodeBlock().run();
    else if (value === 'blockquote') chain.toggleBlockquote().updateAttributes('blockquote', { type: 'NOTE' }).run();
    else if (value === 'link') {
      const previousUrl = editor.getAttributes('link').href;
      const url = window.prompt('URL', previousUrl);

      if (url === null) {
        // cancelled
      } else if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      }
    }
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

const Toolbar = ({ editor }: { editor: Editor }) => {
  // Force re-render when editor state changes
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [showTextColors, setShowTextColors] = React.useState(false);
  const toolbarRef = React.useRef<HTMLDivElement>(null);

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
        <BlockTypeDropdown editor={editor} />
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
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                zIndex: 1001,
                padding: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px',
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
                    border: '1px solid #e2e8f0'
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
                  backgroundColor: '#fff', 
                  borderRadius: '4px',
                  cursor: 'pointer',
                  border: '1px solid #e2e8f0',
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

        <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

        <button
          className="tiptap-button"
          aria-label="Note"
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().updateAttributes('blockquote', { type: 'NOTE' }).run()}
          data-active-state={editor.isActive('blockquote') ? 'on' : 'off'}
          title="Note"
        >
          <Info size={16} />
        </button>
        <button
          className="tiptap-button"
          aria-label="Code"
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          data-active-state={editor.isActive('code') ? 'on' : 'off'}
          title="Libellé"
        >
          <Tag size={16} />
        </button>
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
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
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
            background: index === selectedIndex ? '#f1f5f9' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '13px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            color: '#1e293b',
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
        allow: ({ editor, range }: any) => {
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

// Emoji List Component
const EmojiList = React.forwardRef((props: any, ref: any) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const selectItem = (index: number) => {
    const item = props.items?.[index];
    if (item) {
      props.command({ name: item.name });
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
        return false;
      },
    };
  }, [selectedIndex, props.items]);

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        padding: '4px',
        maxHeight: '200px',
        overflowY: 'auto',
      }}
    >
      {(props.items || []).map((item: any, index: number) => (
        <button
          key={index}
          onClick={() => selectItem(index)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px',
            background: index === selectedIndex ? '#f0f0f0' : 'white',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          <span style={{ fontSize: '18px', marginRight: '8px' }}>
            {item.fallbackImage ? <img src={item.fallbackImage} style={{ height: '18px', width: '18px' }} alt={item.name} /> : item.emoji}
          </span>
          :{item.name}:
        </button>
      ))}
    </div>
  );
});

// Emoji suggestion configuration
const suggestion = {
  items: ({ query }: { query: string }) => {
    return gitHubEmojis
      .filter(({ shortcodes, tags }: { shortcodes: string[]; tags: string[] }) => {
        return (
          shortcodes.find(shortcode => shortcode.startsWith(query.toLowerCase())) ||
          tags.find(tag => tag.startsWith(query.toLowerCase()))
        );
      })
      .slice(0, 10);
  },

  allowSpaces: false,

  render: () => {
    let component: any;

    function repositionComponent(clientRect: DOMRect) {
      if (!component?.element) return;

      const virtualElement = {
        getBoundingClientRect() {
          return clientRect;
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
        component = new ReactRenderer(EmojiList, {
          props,
          editor: props.editor,
        });

        document.body.appendChild(component.element);
        repositionComponent(props.clientRect());
      },

      onUpdate(props: any) {
        component.updateProps(props);
        repositionComponent(props.clientRect());
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          if (document.body.contains(component.element)) {
            document.body.removeChild(component.element);
          }
          component.destroy();
          return true;
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

const SimpleEditor: React.FC<SimpleEditorProps> = ({ 
  content = '', 
  onChange, 
  placeholder = 'Commencez à écrire...' 
}) => {
  const turndownRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  const [rowHandle, setRowHandle] = React.useState<{ top: number, left: number, rowIndex: number, tablePos: number } | null>(null);
  const [colHandle, setColHandle] = React.useState<{ top: number, left: number, colIndex: number, tablePos: number } | null>(null);
  const [quoteHandle, setQuoteHandle] = React.useState<{ top: number, left: number, pos: number, type: string } | null>(null);
  const [quoteMenu, setQuoteMenu] = React.useState<{ top: number, left: number, pos: number } | null>(null);
  const [selectionData, setSelectionData] = React.useState<any>(null);
  const [tableContextMenu, setTableContextMenu] = React.useState<{ top: number, left: number, type: 'row' | 'col', index: number, tablePos: number } | null>(null);
  const [mouseDownPoints, setMouseDownPoints] = React.useState<{ type: 'row' | 'col', index: number, tablePos: number, x: number, y: number } | null>(null);
  const [dragState, setDragState] = React.useState<{ type: 'row' | 'col', index: number, tablePos: number, x: number, y: number } | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<{ top: number, left: number, width?: number, height?: number, type: 'row' | 'col' } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit includes: Document, Paragraph, Text, Bold, Italic, Strike, Code, CodeBlock, Heading, HorizontalRule, ListItem, BulletList, OrderedList, History, Dropcap
        // We'll override History with our own config later if needed
      }),
      TextStyle,
      Color,
      Highlight,
      Superscript,
      Subscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image,
      Emoji.configure({
        emojis: gitHubEmojis,
        enableEmoticons: true,
        suggestion,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      CustomTableCell,
      MermaidNode,
      CodeSuggestion,
      Alert,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
  });

  // Expose editor to window for the bridge
  React.useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragState && !mouseDownPoints) return;
      if (!containerRef.current || !editor) return;

      const x = e.clientX;
      const y = e.clientY;

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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!editor || dragState || !containerRef.current) return;
    
    // Don't hide handles if mouse is over them
    if ((e.target as HTMLElement).closest('.table-handle, .quote-handle')) return;

    // Blockquote handle logic
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const blockquote = element?.closest('blockquote');
    
    if (blockquote && containerRef.current.contains(blockquote)) {
      const rect = blockquote.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Use view.posAtCoords for more reliable position detection
      const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
      if (pos !== undefined) {
        const $pos = editor.state.doc.resolve(pos);
        let quotePos = -1;
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === 'blockquote') {
            quotePos = $pos.before(d);
            break;
          }
        }

        if (quotePos !== -1) {
          setQuoteHandle({
            top: rect.top - containerRect.top + 10,
            left: rect.left - containerRect.left - 12,
            pos: quotePos,
            type: editor.state.doc.nodeAt(quotePos)?.attrs.type || 'default'
          });
        } else {
          setQuoteHandle(null);
        }
      }
    } else {
      // Check if we are hovering the handle itself
      if (!(e.target as HTMLElement).closest('.quote-handle')) {
        setQuoteHandle(null);
      }
    }

    let info = getTableCellInfo(editor.view, e.nativeEvent);
    
    // If not directly over a cell, check if we are near a table within the wrapper
    if (!info) {
      const target = e.target as HTMLElement;
      const wrapper = target.closest('.tableWrapper');
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
            // Clamp coordinates to be inside the table so getTableCellInfo can find the cell
            const clampedX = Math.max(rect.left + 5, Math.min(rect.right - 5, e.clientX));
            const clampedY = Math.max(rect.top + 5, Math.min(rect.bottom - 5, e.clientY));
            
            // Temporary event-like object for getTableCellInfo
            const mockEvent = { clientX: clampedX, clientY: clampedY } as MouseEvent;
            info = getTableCellInfo(editor.view, mockEvent);
          }
        }
      }
    }

    if (info) {
      const { tablePos, rowIndex, colIndex } = info;
      const cellDOM = editor.view.nodeDOM(info.cellPos) as HTMLElement;
      const tableDOM = editor.view.nodeDOM(tablePos) as HTMLElement;
      if (cellDOM && tableDOM) {
        const rect = cellDOM.getBoundingClientRect();
        const tableRect = tableDOM.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setRowHandle({
            top: rect.top - containerRect.top + rect.height / 2,
            left: tableRect.left - containerRect.left - 8, // Centered (width 16px)
            rowIndex,
            tablePos
          });
          setColHandle({
            top: tableRect.top - containerRect.top - 10, // Centered (height 20px)
            left: rect.left - containerRect.left + rect.width / 2,
            colIndex,
            tablePos
          });

          return;
        }
      }
    }

    // Check if we are near existing handles to prevent flickering
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const containerRect = containerRef.current?.getBoundingClientRect();
    
    if (containerRect) {
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
            return '\n\n> [!' + type + ']\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n\n';
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
            console.log('[getEditorMarkdown] Processed HTML for Turndown:', processedHtml);
            
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
          // Pre-process alerts: > [!NOTE] -> <blockquote data-type="NOTE">
          const alertRegex = /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n((?:>.*\n?)*)/gm;
          const markdownWithAlerts = markdown.replace(alertRegex, (match, type, content) => {
            const cleanContent = content.replace(/^> ?/gm, '').trim();
            return `<blockquote data-type="${type}">${cleanContent}</blockquote>`;
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
          if ((editor as any)?.commands?.clearContent) {
            (editor as any).commands.clearContent();
          }
          if ((editor as any)?.commands?.setContent) {
            (editor as any).commands.setContent(html);
          }
        } catch (err) {
          console.warn('setEditorMarkdown failed', err);
        }
      };

      (window as any).insertEditorMarkdownAtEnd = (markdown: string) => {
        if (typeof markdown !== 'string') return;
        try {
          // Convert == markers to <mark> HTML before parsing
          const markdownWithHighlight = markdown.replace(
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
          if (editor) {
            editor.chain().focus().insertContentAt(editor.state.doc.content.size, (editor.isEmpty ? '' : '\n\n') + html).run();
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
        detail: selectionData
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

          editor.state.doc.nodesBetween(from, to, (node, pos) => {
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
          editor.state.doc.nodesBetween(from, to, (node) => {
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
            const coordsEnd = editor.view.coordsAtPos(blockTo);
            
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
    <div className="simple-editor" ref={containerRef} onMouseMove={handleMouseMove} onMouseLeave={() => { setRowHandle(null); setColHandle(null); }}>
      <Toolbar editor={editor} />
      <BubbleMenuComponent 
        editor={editor}
        visible={true}
        onKeep={() => keepSelection(editor)}
        onReject={() => rejectSelection(editor)}
        onAssist={handleAssist}
      />
      <EditorContent editor={editor} />

      {rowHandle && !dragState && (
        <div 
          className="table-handle table-handle-row"
          style={{ top: rowHandle.top, left: rowHandle.left }}
          onMouseDown={(e) => {
            e.preventDefault();
            setMouseDownPoints({ type: 'row', index: rowHandle.rowIndex, tablePos: rowHandle.tablePos, x: e.clientX, y: e.clientY });
          }}
        >
          ⠿
        </div>
      )}

      {colHandle && !dragState && (
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
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            transform: `translate(-50%, -50%) ${dragState.type === 'col' ? 'rotate(90deg)' : ''}`
          }}
        >
          ⠿
        </div>
      )}

      {quoteHandle && (
        <div 
          className="table-handle quote-handle"
          style={{ top: quoteHandle.top, left: quoteHandle.left }}
          onClick={(e) => {
            e.stopPropagation();
            setQuoteMenu({ top: quoteHandle.top, left: quoteHandle.left + 30, pos: quoteHandle.pos });
          }}
        >
          ⠿
        </div>
      )}

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
                  editor.chain().focus().setNodeSelection(quoteMenu.pos).updateAttributes('blockquote', { type: alert.type }).run();
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
              <Trash2 size={14} style={{ marginRight: 8 }} />
              Supprimer
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SimpleEditor;
