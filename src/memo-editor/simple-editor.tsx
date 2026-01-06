import React from 'react';
import { useEditor, EditorContent, BubbleMenu, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { CellSelection } from 'prosemirror-tables';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
import './simple-editor.css';

interface SimpleEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
}

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

import { NodeSelection } from 'prosemirror-state';

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
};

const keepAllDocument = (editor: Editor | null) => {
  if (!editor) return;
  
  // Enlever highlight de tout
  editor.chain().focus().selectAll().run();
  editor.chain().focus().unsetMark('highlight').run();
  
  // Supprimer tous les éléments avec strikethrough
  let toDelete: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.marks.some(m => m.type.name === 'strike')) {
      toDelete.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  
  toDelete.reverse().forEach(({ from: delFrom, to: delTo }) => {
    editor.chain().deleteRange({ from: delFrom, to: delTo }).run();
  });
};

const rejectAllDocument = (editor: Editor | null) => {
  if (!editor) return;
  
  // Enlever strikethrough de tout
  editor.chain().focus().selectAll().run();
  editor.chain().focus().unsetMark('strike').run();
  
  // Supprimer tous les éléments avec highlight
  let toDelete: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.marks.some(m => m.type.name === 'highlight')) {
      toDelete.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  
  toDelete.reverse().forEach(({ from: delFrom, to: delTo }) => {
    editor.chain().deleteRange({ from: delFrom, to: delTo }).run();
  });
};

const Toolbar = ({ editor }: { editor: Editor }) => {
  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const { selection } = editor.state;
  const isCellSelection = selection instanceof CellSelection;
  const isRowSelection = isCellSelection && selection.isRowSelection();
  const isColSelection = isCellSelection && selection.isColSelection();
  const isNodeSelection = selection instanceof NodeSelection;
  const deleteButtonDisabled =
    isCellSelection && !isRowSelection && !isColSelection
      ? true
      : isNodeSelection && selection.node.type.name !== 'table';

  return (
    <div role="toolbar" aria-label="toolbar" data-variant="fixed" className="tiptap-toolbar">
      <div style={{ flex: 1 }}></div>
      <div role="group" className="tiptap-toolbar-group">
        <button
          className="tiptap-button"
          aria-label="Undo"
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M9.70711 3.70711C10.0976 3.31658 10.0976 2.68342 9.70711 2.29289C9.31658 1.90237 8.68342 1.90237 8.29289 2.29289L3.29289 7.29289C2.90237 7.68342 2.90237 8.31658 3.29289 8.70711L8.29289 13.7071C8.68342 14.0976 9.31658 14.0976 9.70711 13.7071C10.0976 13.3166 10.0976 12.6834 9.70711 12.2929L6.41421 9H14.5C15.0909 9 15.6761 9.1164 16.2221 9.34254C16.768 9.56869 17.2641 9.90016 17.682 10.318C18.0998 10.7359 18.4313 11.232 18.6575 11.7779C18.8836 12.3239 19 12.9091 19 13.5C19 14.0909 18.8836 14.6761 18.6575 15.2221C18.4313 15.768 18.0998 16.2641 17.682 16.682C17.2641 17.0998 16.768 17.4313 16.2221 17.6575C15.6761 17.8836 15.0909 18 14.5 18H11C10.4477 18 10 18.4477 10 19C10 19.5523 10.4477 20 11 20H14.5C15.3536 20 16.1988 19.8319 16.9874 19.5052C17.7761 19.1786 18.4926 18.6998 19.0962 18.0962C19.6998 17.4926 20.1786 16.7761 20.5052 15.9874C20.8319 15.1988 21 14.3536 21 13.5C21 12.6464 20.8319 11.8012 20.5052 11.0126C20.1786 10.2239 19.6998 9.50739 19.0962 8.90381C18.4926 8.30022 17.7761 7.82144 16.9874 7.49478C16.1988 7.16813 15.3536 7 14.5 7H6.41421L9.70711 3.70711Z" fill="currentColor"></path></svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Redo"
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M15.7071 2.29289C15.3166 1.90237 14.6834 1.90237 14.2929 2.29289C13.9024 2.68342 13.9024 3.31658 14.2929 3.70711L17.5858 7H9.5C7.77609 7 6.12279 7.68482 4.90381 8.90381C3.68482 10.1228 3 11.7761 3 13.5C3 14.3536 3.16813 15.1988 3.49478 15.9874C3.82144 16.7761 4.30023 17.4926 4.90381 18.0962C6.12279 19.3152 7.77609 20 9.5 20H13C13.5523 20 14 19.5523 14 19C14 18.4477 13.5523 18 13 18H9.5C8.30653 18 7.16193 17.5259 6.31802 16.682C5.90016 16.2641 5.56869 15.768 5.34254 15.2221C5.1164 14.6761 5 14.0909 5 13.5C5 12.3065 5.47411 11.1619 6.31802 10.318C7.16193 9.47411 8.30653 9 9.5 9H17.5858L14.2929 12.2929C13.9024 12.6834 13.9024 13.3166 14.2929 13.7071C14.6834 14.0976 15.3166 14.0976 15.7071 13.7071L20.7071 8.70711C21.0976 8.31658 21.0976 7.68342 20.7071 7.29289L15.7071 2.29289Z" fill="currentColor"></path></svg>
        </button>
      </div>
      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>
      <div role="group" className="tiptap-toolbar-group">
        <button
          className="tiptap-button"
          aria-label="Heading 1"
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          data-active-state={editor.isActive('heading', { level: 1 }) ? 'on' : 'off'}
        >
          <span className="tiptap-heading-label">H1</span>
        </button>
        <button
          className="tiptap-button"
          aria-label="Heading 2"
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          data-active-state={editor.isActive('heading', { level: 2 }) ? 'on' : 'off'}
        >
          <span className="tiptap-heading-label">H2</span>
        </button>
                <button
          className="tiptap-button"
          aria-label="Heading 3"
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          data-active-state={editor.isActive('heading', { level: 3 }) ? 'on' : 'off'}
        >
          <span className="tiptap-heading-label">H3</span>
        </button>
        <button
          className="tiptap-button"
          aria-label="List options"
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-active-state={editor.isActive('bulletList') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M7 6C7 5.44772 7.44772 5 8 5H21C21.5523 5 22 5.44772 22 6C22 6.55228 21.5523 7 21 7H8C7.44772 7 7 6.55228 7 6Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M7 12C7 11.4477 7.44772 11 8 11H21C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H8C7.44772 13 7 12.5523 7 12Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M7 18C7 17.4477 7.44772 17 8 17H21C21.5523 17 22 17.4477 22 18C22 18.5523 21.5523 19 21 19H8C7.44772 19 7 18.5523 7 18Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M2 6C2 5.44772 2.44772 5 3 5H3.01C3.56228 5 4.01 5.44772 4.01 6C4.01 6.55228 3.56228 7 3.01 7H3C2.44772 7 2 6.55228 2 6Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 11.4477 2.44772 11 3 11H3.01C3.56228 11 4.01 11.4477 4.01 12C4.01 12.5523 3.56228 13 3.01 13H3C2.44772 13 2 12.5523 2 12Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M2 18C2 17.4477 2.44772 17 3 17H3.01C3.56228 17 4.01 17.4477 4.01 18C4.01 18.5523 3.56228 19 3.01 19H3C2.44772 19 2 18.5523 2 18Z" fill="currentColor"></path></svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Task list"
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          data-active-state={editor.isActive('taskList') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7l2 2 4-4" />
            <path d="M4 13l2 2 4-4" />
            <path d="M4 19l2 2 4-4" />
            <path d="M10 7h10" />
            <path d="M10 13h10" />
            <path d="M10 19h10" />
          </svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Blockquote"
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          data-active-state={editor.isActive('blockquote') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M8 6C8 5.44772 8.44772 5 9 5H16C16.5523 5 17 5.44772 17 6C17 6.55228 16.5523 7 16 7H9C8.44772 7 8 6.55228 8 6Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M4 3C4.55228 3 5 3.44772 5 4L5 20C5 20.5523 4.55229 21 4 21C3.44772 21 3 20.5523 3 20L3 4C3 3.44772 3.44772 3 4 3Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M8 12C8 11.4477 8.44772 11 9 11H20C20.5523 11 21 11.4477 21 12C21 12.5523 20.5523 13 20 13H9C8.44772 13 8 12.5523 8 12Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M8 18C8 17.4477 8.44772 17 9 17H16C16.5523 17 17 17.4477 17 18C17 18.5523 16.5523 19 16 19H9C8.44772 19 8 18.5523 8 18Z" fill="currentColor"></path></svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Code Block"
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          data-active-state={editor.isActive('codeBlock') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M6.70711 2.29289C7.09763 2.68342 7.09763 3.31658 6.70711 3.70711L4.41421 6L6.70711 8.29289C7.09763 8.68342 7.09763 9.31658 6.70711 9.70711C6.31658 10.0976 5.68342 10.0976 5.29289 9.70711L2.29289 6.70711C1.90237 6.31658 1.90237 5.68342 2.29289 5.29289L5.29289 2.29289C5.68342 1.90237 6.31658 1.90237 6.70711 2.29289Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M10.2929 2.29289C10.6834 1.90237 11.3166 1.90237 11.7071 2.29289L14.7071 5.29289C15.0976 5.68342 15.0976 6.31658 14.7071 6.70711L11.7071 9.70711C11.3166 10.0976 10.6834 10.0976 10.2929 9.70711C9.90237 9.31658 9.90237 8.68342 10.2929 8.29289L12.5858 6L10.2929 3.70711C9.90237 3.31658 9.90237 2.68342 10.2929 2.29289Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M17 4C17 3.44772 17.4477 3 18 3H19C20.6569 3 22 4.34315 22 6V18C22 19.6569 20.6569 21 19 21H5C3.34315 21 2 19.6569 2 18V12C2 11.4477 2.44772 11 3 11C3.55228 11 4 11.4477 4 12V18C4 18.5523 4.44772 19 5 19H19C19.5523 19 20 18.5523 20 18V6C20 5.44772 19.5523 5 19 5H18C17.4477 5 17 4.55228 17 4Z" fill="currentColor"></path></svg>
        </button>
      </div>
      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>
      <div role="group" className="tiptap-toolbar-group">
        <button
          className="tiptap-button"
          aria-label="Bold"
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-active-state={editor.isActive('bold') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M6 2.5C5.17157 2.5 4.5 3.17157 4.5 4V20C4.5 20.8284 5.17157 21.5 6 21.5H15C16.4587 21.5 17.8576 20.9205 18.8891 19.8891C19.9205 18.8576 20.5 17.4587 20.5 16C20.5 14.5413 19.9205 13.1424 18.8891 12.1109C18.6781 11.9 18.4518 11.7079 18.2128 11.5359C19.041 10.5492 19.5 9.29829 19.5 8C19.5 6.54131 18.9205 5.14236 17.8891 4.11091C16.8576 3.07946 15.4587 2.5 14 2.5H6ZM14 10.5C14.663 10.5 15.2989 10.2366 15.7678 9.76777C16.2366 9.29893 16.5 8.66304 16.5 8C16.5 7.33696 16.2366 6.70107 15.7678 6.23223C15.2989 5.76339 14.663 5.5 14 5.5H7.5V10.5H14ZM7.5 18.5V13.5H15C15.663 13.5 16.2989 13.7634 16.7678 14.2322C17.2366 14.7011 17.5 15.337 17.5 16C17.5 16.663 17.2366 17.2989 16.7678 17.7678C16.2989 18.2366 15.663 18.5 15 18.5H7.5Z" fill="currentColor"></path></svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Italic"
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-active-state={editor.isActive('italic') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15.0222 3H19C19.5523 3 20 3.44772 20 4C20 4.55228 19.5523 5 19 5H15.693L10.443 19H14C14.5523 19 15 19.4477 15 20C15 20.5523 14.5523 21 14 21H9.02418C9.00802 21.0004 8.99181 21.0004 8.97557 21H5C4.44772 21 4 20.5523 4 20C4 19.4477 4.44772 19 5 19H8.30704L13.557 5H10C9.44772 5 9 4.55228 9 4C9 3.44772 9.44772 3 10 3H14.9782C14.9928 2.99968 15.0075 2.99967 15.0222 3Z" fill="currentColor"></path></svg>
        </button>
       
        <button
          className="tiptap-button"
          aria-label="Code"
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          data-active-state={editor.isActive('code') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M15.4545 4.2983C15.6192 3.77115 15.3254 3.21028 14.7983 3.04554C14.2712 2.88081 13.7103 3.1746 13.5455 3.70175L8.54554 19.7017C8.38081 20.2289 8.6746 20.7898 9.20175 20.9545C9.72889 21.1192 10.2898 20.8254 10.4545 20.2983L15.4545 4.2983Z" fill="currentColor"></path><path d="M6.70711 7.29289C7.09763 7.68342 7.09763 8.31658 6.70711 8.70711L3.41421 12L6.70711 15.2929C7.09763 15.6834 7.09763 16.3166 6.70711 16.7071C6.31658 17.0976 5.68342 17.0976 5.29289 16.7071L1.29289 12.7071C0.902369 12.3166 0.902369 11.6834 1.29289 11.2929L5.29289 7.29289C5.68342 6.90237 6.31658 6.90237 6.70711 7.29289Z" fill="currentColor"></path><path d="M17.2929 7.29289C17.6834 6.90237 18.3166 6.90237 18.7071 7.29289L22.7071 11.2929C23.0976 11.6834 23.0976 12.3166 22.7071 12.7071L18.7071 16.7071C18.3166 17.0976 17.6834 17.0976 17.2929 16.7071C16.9024 16.3166 16.9024 15.6834 17.2929 15.2929L20.5858 12L17.2929 8.70711C16.9024 8.31658 16.9024 7.68342 17.2929 7.29289Z" fill="currentColor"></path></svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Underline"
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          data-active-state={editor.isActive('underline') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M7 4C7 3.44772 6.55228 3 6 3C5.44772 3 5 3.44772 5 4V10C5 11.8565 5.7375 13.637 7.05025 14.9497C8.36301 16.2625 10.1435 17 12 17C13.8565 17 15.637 16.2625 16.9497 14.9497C18.2625 13.637 19 11.8565 19 10V4C19 3.44772 18.5523 3 18 3C17.4477 3 17 3.44772 17 4V10C17 11.3261 16.4732 12.5979 15.5355 13.5355C14.5979 14.4732 13.3261 15 12 15C10.6739 15 9.40215 14.4732 8.46447 13.5355C7.52678 12.5979 7 11.3261 7 10V4ZM4 19C3.44772 19 3 19.4477 3 20C3 20.5523 3.44772 21 4 21H20C20.5523 21 21 20.5523 21 20C21 19.4477 20.5523 19 20 19H4Z" fill="currentColor"></path></svg>
        </button>
      
        <button
          className="tiptap-button"
          aria-label="Link"
          type="button"
          onClick={setLink}
          data-active-state={editor.isActive('link') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M16.9958 1.06669C15.4226 1.05302 13.907 1.65779 12.7753 2.75074L12.765 2.76086L11.045 4.47086C10.6534 4.86024 10.6515 5.49341 11.0409 5.88507C11.4303 6.27673 12.0634 6.27858 12.4551 5.88919L14.1697 4.18456C14.9236 3.45893 15.9319 3.05752 16.9784 3.06662C18.0272 3.07573 19.0304 3.49641 19.772 4.23804C20.5137 4.97967 20.9344 5.98292 20.9435 7.03171C20.9526 8.07776 20.5515 9.08563 19.8265 9.83941L16.833 12.8329C16.4274 13.2386 15.9393 13.5524 15.4019 13.7529C14.8645 13.9533 14.2903 14.0359 13.7181 13.9949C13.146 13.9539 12.5894 13.7904 12.0861 13.5154C11.5827 13.2404 11.1444 12.8604 10.8008 12.401C10.47 11.9588 9.84333 11.8685 9.40108 12.1993C8.95883 12.5301 8.86849 13.1568 9.1993 13.599C9.71464 14.288 10.3721 14.858 11.1272 15.2705C11.8822 15.683 12.7171 15.9283 13.5753 15.9898C14.4334 16.0513 15.2948 15.9274 16.1009 15.6267C16.907 15.326 17.639 14.8555 18.2473 14.247L21.2472 11.2471L21.2593 11.2347C22.3523 10.1031 22.9571 8.58751 22.9434 7.01433C22.9297 5.44115 22.2987 3.93628 21.1863 2.82383C20.0738 1.71138 18.5689 1.08036 16.9958 1.06669Z" fill="currentColor"></path><path d="M10.4247 8.0102C9.56657 7.94874 8.70522 8.07256 7.89911 8.37326C7.09305 8.67395 6.36096 9.14458 5.75272 9.753L2.75285 12.7529L2.74067 12.7653C1.64772 13.8969 1.04295 15.4125 1.05662 16.9857C1.07029 18.5589 1.70131 20.0637 2.81376 21.1762C3.9262 22.2886 5.43108 22.9196 7.00426 22.9333C8.57744 22.947 10.0931 22.3422 11.2247 21.2493L11.2371 21.2371L12.9471 19.5271C13.3376 19.1366 13.3376 18.5034 12.9471 18.1129C12.5565 17.7223 11.9234 17.7223 11.5328 18.1129L9.82932 19.8164C9.07555 20.5414 8.06768 20.9425 7.02164 20.9334C5.97285 20.9243 4.9696 20.5036 4.22797 19.762C3.48634 19.0203 3.06566 18.0171 3.05655 16.9683C3.04746 15.9222 3.44851 14.9144 4.17355 14.1606L7.16719 11.167C7.5727 10.7613 8.06071 10.4476 8.59811 10.2471C9.13552 10.0467 9.70976 9.96412 10.2819 10.0051C10.854 10.0461 11.4106 10.2096 11.9139 10.4846C12.4173 10.7596 12.8556 11.1397 13.1992 11.599C13.53 12.0412 14.1567 12.1316 14.5989 11.8007C15.0412 11.4699 15.1315 10.8433 14.8007 10.401C14.2854 9.71205 13.6279 9.14198 12.8729 8.72948C12.1178 8.31697 11.2829 8.07166 10.4247 8.0102Z" fill="currentColor"></path></svg>
        </button>
      </div>

      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>

      <div role="group" className="tiptap-toolbar-group">
        <button
          className="tiptap-button"
          aria-label="Insert Table"
          type="button"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3H20C21.1046 3 22 3.89543 22 5V19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3ZM4 5V8H9V5H4ZM11 5V8H13V5H11ZM15 5V8H20V5H15ZM20 10H15V14H20V10ZM13 10H11V14H13V10ZM9 10H4V14H9V10ZM4 16V19H9V16H4ZM11 16V19H13V16H11ZM15 16V19H20V16H15Z" fill="currentColor"></path></svg>
        </button>
        {editor.isActive('table') && (
          <>
            <button
              className="tiptap-button"
              aria-label="Add Column After"
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3H20C21.1046 3 22 3.89543 22 5V19C22 20.1046 21.1046 21 20 21H12V19H20V5H12V3ZM10 3H4C2.89543 3 2 3.89543 2 5V19C2 20.1046 2.89543 21 4 21H10V19H4V5H10V3ZM14 11V7H16V11H20V13H16V17H14V13H10V11H14Z" fill="currentColor"></path></svg>
            </button>
            <button
              className="tiptap-button"
              aria-label="Add Row After"
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 12V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V12H19V20H5V12H3ZM3 10V4C3 2.89543 3.89543 2 5 2H19C20.1046 2 21 2.89543 21 4V10H19V4H5V10H3ZM11 14H7V16H11V20H13V16H17V14H13V10H11V14Z" fill="currentColor"></path></svg>
            </button>
            <button
              className="tiptap-button"
              aria-label="Delete Table or Selection"
              type="button"
              onClick={() => {
                if (deleteButtonDisabled) {
                  return;
                }
                if (isRowSelection) {
                  editor.chain().focus().deleteRow().run();
                  return;
                }
                if (isColSelection) {
                  editor.chain().focus().deleteColumn().run();
                  return;
                }
                editor.chain().focus().deleteTable().run();
              }}
              disabled={deleteButtonDisabled}
            >
              <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z" fill="currentColor"></path></svg>
            </button>
          </>
        )}
      </div>
      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>
      <div role="group" className="tiptap-toolbar-group">
        <button
          className="tiptap-button"
          aria-label="Align left"
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          data-active-state={editor.isActive({ textAlign: 'left' }) ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M2 6C2 5.44772 2.44772 5 3 5H21C21.5523 5 22 5.44772 22 6C22 6.55228 21.5523 7 21 7H3C2.44772 7 2 6.55228 2 6Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 11.4477 2.44772 11 3 11H15C15.5523 11 16 11.4477 16 12C16 12.5523 15.5523 13 15 13H3C2.44772 13 2 12.5523 2 12Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M2 18C2 17.4477 2.44772 17 3 17H17C17.5523 17 18 17.4477 18 18C18 18.5523 17.5523 19 17 19H3C2.44772 19 2 18.5523 2 18Z" fill="currentColor"></path></svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Align center"
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          data-active-state={editor.isActive({ textAlign: 'center' }) ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M2 6C2 5.44772 2.44772 5 3 5H21C21.5523 5 22 5.44772 22 6C22 6.55228 21.5523 7 21 7H3C2.44772 7 2 6.55228 2 6Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M6 12C6 11.4477 6.44772 11 7 11H17C17.5523 11 18 11.4477 18 12C18 12.5523 17.5523 13 17 13H7C6.44772 13 6 12.5523 6 12Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M4 18C4 17.4477 4.44772 17 5 17H19C19.5523 17 20 17.4477 20 18C20 18.5523 19.5523 19 19 19H5C4.44772 19 4 18.5523 4 18Z" fill="currentColor"></path></svg>
        </button>
        <button
          className="tiptap-button"
          aria-label="Align right"
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          data-active-state={editor.isActive({ textAlign: 'right' }) ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M2 6C2 5.44772 2.44772 5 3 5H21C21.5523 5 22 5.44772 22 6C22 6.55228 21.5523 7 21 7H3C2.44772 7 2 6.55228 2 6Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M8 12C8 11.4477 8.44772 11 9 11H21C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H9C8.44772 13 8 12.5523 8 12Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M6 18C6 17.4477 6.44772 17 7 17H21C21.5523 17 22 17.4477 22 18C22 18.5523 21.5523 19 21 19H7C6.44772 19 6 18.5523 6 18Z" fill="currentColor"></path></svg>
        </button>
      </div>
      <div className="tiptap-separator" data-orientation="vertical" role="none"></div>
      <div role="group" className="tiptap-toolbar-group">
 <button
          className="tiptap-button"
          aria-label="Strike"
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          data-active-state={editor.isActive('strike') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9.00039 3H16.0001C16.5524 3 17.0001 3.44772 17.0001 4C17.0001 4.55229 16.5524 5 16.0001 5H9.00011C8.68006 4.99983 8.36412 5.07648 8.07983 5.22349C7.79555 5.37051 7.55069 5.5836 7.36585 5.84487C7.181 6.10614 7.06155 6.40796 7.01754 6.72497C6.97352 7.04198 7.00623 7.36492 7.11292 7.66667C7.29701 8.18737 7.02414 8.75872 6.50344 8.94281C5.98274 9.1269 5.4114 8.85403 5.2273 8.33333C5.01393 7.72984 4.94851 7.08396 5.03654 6.44994C5.12456 5.81592 5.36346 5.21229 5.73316 4.68974C6.10285 4.1672 6.59256 3.74101 7.16113 3.44698C7.72955 3.15303 8.36047 2.99975 9.00039 3Z" fill="currentColor"></path><path d="M18 13H20C20.5523 13 21 12.5523 21 12C21 11.4477 20.5523 11 20 11H4C3.44772 11 3 11.4477 3 12C3 12.5523 3.44772 13 4 13H14C14.7956 13 15.5587 13.3161 16.1213 13.8787C16.6839 14.4413 17 15.2044 17 16C17 16.7956 16.6839 17.5587 16.1213 18.1213C15.5587 18.6839 14.7956 19 14 19H6C5.44772 19 5 19.4477 5 20C5 20.5523 5.44772 21 6 21H14C15.3261 21 16.5979 20.4732 17.5355 19.5355C18.4732 18.5979 19 17.3261 19 16C19 14.9119 18.6453 13.8604 18 13Z" fill="currentColor"></path></svg>
        </button>
  <button
          className="tiptap-button"
          aria-label="Highlight"
          type="button"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          data-active-state={editor.isActive('highlight') ? 'on' : 'off'}
        >
          <svg width="24" height="24" className="tiptap-button-icon" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M14.7072 4.70711C15.0977 4.31658 15.0977 3.68342 14.7072 3.29289C14.3167 2.90237 13.6835 2.90237 13.293 3.29289L8.69294 7.89286L8.68594 7.9C8.13626 8.46079 7.82837 9.21474 7.82837 10C7.82837 10.2306 7.85491 10.4584 7.90631 10.6795L2.29289 16.2929C2.10536 16.4804 2 16.7348 2 17V20C2 20.5523 2.44772 21 3 21H12C12.2652 21 12.5196 20.8946 12.7071 20.7071L15.3205 18.0937C15.5416 18.1452 15.7695 18.1717 16.0001 18.1717C16.7853 18.1717 17.5393 17.8639 18.1001 17.3142L22.7072 12.7071C23.0977 12.3166 23.0977 11.6834 22.7072 11.2929C22.3167 10.9024 21.6835 10.9024 21.293 11.2929L16.6971 15.8887C16.5105 16.0702 16.2605 16.1717 16.0001 16.1717C15.7397 16.1717 15.4897 16.0702 15.303 15.8887L10.1113 10.697C9.92992 10.5104 9.82837 10.2604 9.82837 10C9.82837 9.73963 9.92992 9.48958 10.1113 9.30297L14.7072 4.70711ZM13.5858 17L9.00004 12.4142L4 17.4142V19H11.5858L13.5858 17Z" fill="currentColor"></path></svg>
        </button>
           <div className="tiptap-separator" data-orientation="vertical" role="none"></div>
      <div role="group" className="tiptap-toolbar-group">
          {editor && hasMarksInDocument(editor) && (
          <>
            <button
              className="tiptap-button toolbar-action-btn toolbar-keep"
              aria-label="Garder tout"
              type="button"
              title="Garder tout"
              onClick={() => keepAllDocument(editor)}
            >
              ✓
            </button>
            <button
              className="tiptap-button toolbar-action-btn toolbar-reject"
              aria-label="Annuler tout"
              type="button"
              title="Annuler tout"
              onClick={() => rejectAllDocument(editor)}
            >
              ✗
            </button>
            
          </>
        )}
        </div>
</div>
      <div style={{ flex: 1 }}></div>
    </div>
  );
};

const SimpleEditor: React.FC<SimpleEditorProps> = ({ 
  content = '', 
  onChange, 
  placeholder = 'Commencez à écrire...' 
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem,
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
      }),
      Superscript,
      Subscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      CustomTableCell,
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
    if (editor) {
      (window as any).MemoEditor = editor;

      const turndown = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
      });
      try {
        turndown.use(gfm);
      } catch (err) {
        // ignore plugin load failures
      }

      (window as any).getEditorMarkdown = () => {
        try {
          if (typeof editor.getHTML === 'function') {
            return turndown.turndown(editor.getHTML());
          }
          if (typeof editor.getText === 'function') {
            return editor.getText();
          }
        } catch (err) {
          // ignore
        }
        return '';
      };

      (window as any).setEditorMarkdown = (markdown: string) => {
        if (typeof markdown !== 'string') return;
        try {
          const html = marked.parse(markdown, { gfm: true }) as string;
          if ((editor as any)?.commands?.clearContent) {
            (editor as any).commands.clearContent(true);
          }
          if ((editor as any)?.commands?.setContent) {
            (editor as any).commands.setContent(html, true);
          }
        } catch (err) {
          console.warn('setEditorMarkdown failed', err);
        }
      };
    }
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="simple-editor">
      <Toolbar editor={editor} />
      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
          <div className="bubble-menu">
            {(hasMarkInSelection(editor, 'highlight') || hasMarkInSelection(editor, 'strike')) && (
              <>
                <button
                  onClick={() => keepSelection(editor)}
                  className="bubble-menu-btn bubble-keep"
                  title="Garder la sélection"
                >
                  ✓ Garder
                </button>
                <button
                  onClick={() => rejectSelection(editor)}
                  className="bubble-menu-btn bubble-reject"
                  title="Annuler la sélection"
                >
                  ✗ Annuler
                </button>
              </>
            )}
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
};

export default SimpleEditor;
