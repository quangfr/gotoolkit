import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { 
  Info, Lightbulb, AlertTriangle, AlertCircle, MessageSquare, Star 
} from 'lucide-react';

export const ALERT_TYPES = [
  { type: 'default', label: 'Remarque', icon: MessageSquare, color: '#4a5568' },
  { type: 'NOTE', label: 'Note', icon: Info, color: '#1d4ed8' },
  { type: 'TIP', label: 'Conseil', icon: Lightbulb, color: '#15803d' },
  { type: 'IMPORTANT', label: 'Important', icon: Star, color: '#7e22ce' },
  { type: 'WARNING', label: 'Alerte', icon: AlertTriangle, color: '#a16207' },
  { type: 'CAUTION', label: 'Attention', icon: AlertCircle, color: '#b91c1c' },
];

const AlertComponent = ({ node, updateAttributes }: any) => {
  const type = node.attrs.type || 'default';
  const alertConfig = ALERT_TYPES.find(a => a.type === type) || ALERT_TYPES[0];
  const Icon = alertConfig.icon;
  const displayTitle = node.attrs.title || alertConfig.label;

  if (type === 'default') {
    return (
      <NodeViewWrapper as="blockquote" className="alert-wrapper">
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="blockquote" data-type={type} className="alert-wrapper">
      <div 
        className="alert-header" 
        contentEditable={false}
      >
        <div className="alert-header-main">
          <Icon size={16} style={{ color: alertConfig.color }} />
          <span
            className="alert-title"
            style={{ color: alertConfig.color }}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onBlur={(e: any) => {
              const newTitle = e.target.innerText;
              if (newTitle !== (node.attrs.title || alertConfig.label)) {
                updateAttributes({ title: newTitle });
              }
            }}
            onKeyDown={(e: any) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
              }
            }}
          >
            {displayTitle}
          </span>
        </div>
      </div>
      <div className="alert-content">
        <NodeViewContent />
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
        find: /^>\.\s$/,
        type: this.type,
        getAttributes: () => ({ type: 'default' }),
      }),
    ]
  },
});
