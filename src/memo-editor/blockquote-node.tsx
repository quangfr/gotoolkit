import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { 
  Info, Lightbulb, AlertTriangle, AlertCircle, Quote, SquareCheck 
} from 'lucide-react';

export const ALERT_TYPES = [
  { type: 'default', label: 'Citation', icon: Quote, color: 'var(--text-muted)' },
  { type: 'NOTE', label: 'Note', icon: Info, color: 'var(--intent-info-border)' },
  { type: 'TIP', label: 'Conseil', icon: Lightbulb, color: 'var(--bg-text-yellow)' },
  { type: 'IMPORTANT', label: 'Important', icon: SquareCheck, color: 'var(--bg-text-green)' },
  { type: 'WARNING', label: 'Alerte', icon: AlertTriangle, color: 'var(--intent-warning-border)' },
  { type: 'CAUTION', label: 'Attention', icon: AlertCircle, color: 'var(--intent-error-border)' },
];

const AlertComponent = ({ node, updateAttributes }: any) => {
  const type = node.attrs.type || 'default';
  const alertConfig = ALERT_TYPES.find(a => a.type === type) || ALERT_TYPES[0];
  const Icon = alertConfig.icon;

  return (
    <NodeViewWrapper as="blockquote" data-type={type} className="alert-wrapper node-blockquote">
      <div className="alert-body">
        <div className="alert-icon" contentEditable={false}>
          <Icon size={18} style={{ color: alertConfig.color }} />
        </div>
        <div className="alert-content">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const Alert = Node.create({
  name: 'blockquote',
  content: 'block+',
  group: 'block',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'default',
        parseHTML: element => element.getAttribute('data-type') || 'default',
        renderHTML: attributes => {
          if (attributes.type === 'default') return {}
          return { 'data-type': attributes.type }
        },
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) return {}
          return { 'data-title': attributes.title }
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'blockquote' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setBlockquote: () => ({ commands }) => {
        return commands.wrapIn(this.name)
      },
      toggleBlockquote: () => ({ commands }) => {
        return commands.toggleWrap(this.name)
      },
      unsetBlockquote: () => ({ commands }) => {
        return commands.lift(this.name)
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(AlertComponent);
  },

  addInputRules() {
    return [
      // GitHub-style alerts: >[!NOTE] Title
      wrappingInputRule({
        find: /^> ?\[!(note|tip|important|warning|caution|alerte|attention)\](?:\s+(.*))?\s$/,
        type: this.type,
        getAttributes: match => {
          const typeMap: any = {
            'note': 'NOTE',
            'tip': 'TIP',
            'important': 'IMPORTANT',
            'warning': 'WARNING',
            'alerte': 'WARNING',
            'caution': 'CAUTION',
            'attention': 'CAUTION',
          };
          const rawType = match[1].toLowerCase();
          const type = typeMap[rawType] || 'NOTE';
          const title = match[2] || null;
          return { type, title };
        },
      }),
      wrappingInputRule({
        find: /^>note\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'NOTE' }),
      }),
      wrappingInputRule({
        find: /^>tip\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'TIP' }),
      }),
      wrappingInputRule({
        find: /^>important\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'IMPORTANT' }),
      }),
      wrappingInputRule({
        find: /^>alerte\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'WARNING' }),
      }),
      wrappingInputRule({
        find: /^>attention\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'CAUTION' }),
      }),
      wrappingInputRule({
        find: /^>ℹ️\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'NOTE' }),
      }),
      wrappingInputRule({
        find: /^>💡\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'TIP' }),
      }),
      wrappingInputRule({
        find: /^>✅\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'IMPORTANT' }),
      }),
      wrappingInputRule({
        find: /^>⚠️\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'WARNING' }),
      }),
      wrappingInputRule({
        find: /^>🚨\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'CAUTION' }),
      }),
      wrappingInputRule({
        find: /^>\.\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'default' }),
      }),
    ]
  },
});
