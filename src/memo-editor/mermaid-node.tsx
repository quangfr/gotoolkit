import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';
import mermaid from 'mermaid';

// Mermaid Diagram Component that shows only the diagram
const MermaidDiagramComponent = ({ node, updateAttributes, extension }: any) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [svg, setSvg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const code = node.attrs.code || '';

  const renderDiagram = React.useCallback(async () => {
    if (!code.trim()) {
      setSvg('');
      setError(null);
      return;
    }

    try {
      // Generate unique ID for this diagram
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Configure mermaid for this render
      mermaid.initialize({ 
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });

      const { svg } = await mermaid.render(id, code);
      setSvg(svg);
      setError(null);
    } catch (err: any) {
      console.warn('Mermaid render error:', err);
      setError(err.message || 'Invalid mermaid syntax');
      setSvg('');
    }
  }, [code]);

  React.useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleCloseModal = () => {
    setIsEditing(false);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateAttributes({ code: e.target.value });
  };

  return (
    <>
      <NodeViewWrapper 
        className="mermaid-diagram-wrapper"
        data-mermaid-code={encodeURIComponent(code)}
        data-code={encodeURIComponent(code)}
      >
        <div 
          ref={containerRef}
          className="mermaid-diagram-container"
          onDoubleClick={handleDoubleClick}
          title="Double-cliquer pour modifier le diagramme"
          style={{ cursor: 'pointer' }}
        >
          {error ? (
            <div className="mermaid-error">
              <div className="mermaid-error-icon">⚠️</div>
              <div className="mermaid-error-text">Erreur de syntaxe</div>
              <div className="mermaid-error-hint">Double-cliquez pour corriger</div>
            </div>
          ) : svg ? (
            <div 
              className="mermaid-svg-container"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="mermaid-placeholder">
              <div className="mermaid-placeholder-icon">📊</div>
              <div className="mermaid-placeholder-text">Diagramme Mermaid</div>
              <div className="mermaid-placeholder-hint">Double-cliquez pour ajouter du code</div>
            </div>
          )}
        </div>
      </NodeViewWrapper>

      {/* Edit Modal */}
      {isEditing && (
        <div className="mermaid-modal-overlay" onClick={handleCloseModal}>
          <div className="mermaid-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mermaid-modal-header">
              <h3>Modifier le diagramme Mermaid</h3>
              <button className="mermaid-modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="mermaid-modal-body">
              <div className="mermaid-modal-preview">
                <div className="mermaid-modal-preview-label">Aperçu</div>
                <div 
                  className="mermaid-modal-preview-content"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
              <div className="mermaid-modal-editor">
                <div className="mermaid-modal-editor-label">Code</div>
                <textarea
                  className="mermaid-modal-textarea"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="Entrez votre code Mermaid ici..."
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="mermaid-modal-footer">
              <button className="mermaid-modal-btn mermaid-modal-btn-primary" onClick={handleCloseModal}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Custom Tiptap Node Extension
export const MermaidNode = Node.create({
  name: 'mermaidDiagram',
  group: 'block',
  atom: true,
  
  addAttributes() {
    return {
      code: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mermaid-diagram',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mermaid-diagram', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidDiagramComponent);
  },
});

// Helper function to insert mermaid diagram
export const insertMermaidDiagram = (editor: Editor, code: string = '') => {
  editor.chain().focus().insertContent({
    type: 'mermaidDiagram',
    attrs: { code },
  }).run();
};