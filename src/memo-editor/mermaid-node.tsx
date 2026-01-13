import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';
import mermaid from 'mermaid';

// Mermaid Diagram Component that shows only the diagram
const MermaidDiagramComponent = ({ node, updateAttributes, extension }: any) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [svg, setSvg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const excalidrawHostRef = React.useRef<HTMLDivElement>(null);

  const code = node.attrs.code || '';
  const excalidrawJSON = node.attrs.excalidrawJSON || '';

  const renderDiagram = React.useCallback(async () => {
    if (excalidrawJSON) {
      try {
        // If we have Excalidraw JSON, use it to generate SVG
        if ((window as any).GoToolkitDrawMemo) {
          const tempDiv = document.createElement('div');
          tempDiv.style.display = 'none';
          document.body.appendChild(tempDiv);
          const instance = await (window as any).GoToolkitDrawMemo.init(tempDiv, excalidrawJSON);
          const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG();
          setSvg(svgHtml);
          document.body.removeChild(tempDiv);
          setError(null);
          return;
        }
      } catch (err) {
        console.warn('Excalidraw render error, falling back to mermaid:', err);
      }
    }

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
  }, [code, excalidrawJSON]);

  React.useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  const handleDoubleClick = async () => {
    setIsEditing(true);
    setIsLoading(true);
  };

  React.useEffect(() => {
    if (isEditing && excalidrawHostRef.current) {
      const initExcalidraw = async () => {
        try {
          if ((window as any).GoToolkitDrawMemo) {
            // Use excalidrawJSON if available, otherwise fallback to code (mermaid)
            const initialData = excalidrawJSON || code;
            await (window as any).GoToolkitDrawMemo.init(excalidrawHostRef.current, initialData);
          }
        } catch (err) {
          console.error("Failed to init Excalidraw", err);
        } finally {
          setIsLoading(false);
        }
      };
      initExcalidraw();
    }
  }, [isEditing]);

  const handleCloseModal = async () => {
    if ((window as any).GoToolkitDrawMemo) {
      const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
      const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG();
      updateAttributes({ 
        excalidrawJSON: json,
        // We keep the code as is, unless we want to try to sync back to mermaid
      });
      if (svgHtml) setSvg(svgHtml);
    }
    setIsEditing(false);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    updateAttributes({ code: newCode });
    
    // Optional: Sync to Excalidraw if it's open
    if (isEditing && (window as any).GoToolkitDrawMemo) {
      (window as any).GoToolkitDrawMemo.updateFromMermaid(newCode);
    }
  };

  return (
    <>
      <NodeViewWrapper className="mermaid-diagram-wrapper">
        <div 
          ref={containerRef}
          className="mermaid-diagram-container"
          onDoubleClick={handleDoubleClick}
          title="Double-cliquer pour modifier le diagramme"
          style={{ cursor: 'pointer', minHeight: '100px', display: 'block', width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', visibility: 'visible', opacity: 1, position: 'relative', zIndex: 1, overflow: 'visible', pointerEvents: 'auto', userSelect: 'none', contentVisibility: 'visible', transform: 'none', minWidth: '100px', height: 'auto' }}
        >
          {error ? (
            <div className="mermaid-error">
              <div className="mermaid-error-icon">⚠︎</div>
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
              <div className="mermaid-placeholder-icon">⇄</div>
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
              <h3>Modifier le diagramme</h3>
              <div className="mermaid-modal-header-actions">
                {isLoading && <span className="mermaid-loading-spinner"></span>}
                <button className="mermaid-modal-close" onClick={handleCloseModal}>×</button>
              </div>
            </div>
            <div className="mermaid-modal-body">
              <div className="mermaid-modal-draw-container">
                <div className="mermaid-modal-preview-label">Éditeur Visuel (Excalidraw)</div>
                <div 
                  ref={excalidrawHostRef}
                  className="mermaid-modal-excalidraw-host"
                />
              </div>
              <div className="mermaid-modal-editor">
                <div className="mermaid-modal-editor-label">Code (Mermaid)</div>
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
                Enregistrer et Fermer
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
      excalidrawJSON: {
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

  addInputRules() {
    return [
      new InputRule({
        find: /```mermaid\s$/,
        handler: ({ state, range, chain }) => {
          const { tr } = state;
          const start = range.from;
          const end = range.to;

          // Delete the trigger text
          tr.delete(start, end);
          
          // Insert the mermaid diagram node
          chain()
            .insertContentAt(start, {
              type: this.name,
              attrs: { code: '' },
            })
            .run();
        },
      }),
    ];
  },
});

// Helper function to insert mermaid diagram
export const insertMermaidDiagram = (editor: Editor, code: string = '') => {
  editor.chain().focus().insertContent({
    type: 'mermaidDiagram',
    attrs: { code },
  }).run();
};