import { Node, mergeAttributes, InputRule, Editor } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import mermaid from 'mermaid';
import { Shapes } from 'lucide-react';

// Mermaid Diagram Component that shows only the diagram
const MermaidDiagramComponent = ({ node, updateAttributes }: any) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [svg, setSvg] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [lastValidCode, setLastValidCode] = React.useState(node.attrs.code || '');
  const [draftCode, setDraftCode] = React.useState(node.attrs.code || '');
  const [isLoading, setIsLoading] = React.useState(false);
  const [showToast, setShowToast] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const excalidrawHostRef = React.useRef<HTMLDivElement>(null);

  const code = node.attrs.code || '';
  const excalidrawJSON = node.attrs.excalidrawJSON || '';

  // Immediate preview on paste/init if excalidrawJSON is missing but code exists
  React.useEffect(() => {
    if (isEditing) return;
    if (code && !excalidrawJSON && (window as any).GoToolkitDrawMemo) {
      const syncPreview = async () => {
        try {
          // Prefer the bridge preview helper if available (serialized & sized host)
          if ((window as any).GoToolkitDrawMemo.renderPreview) {
            const result = await (window as any).GoToolkitDrawMemo.renderPreview(code, 0.6);
            const json = result?.json;
            const svgHtml = result?.svg;
            if (json) {
              updateAttributes({ excalidrawJSON: json });
            }
            if (svgHtml) {
              setSvg(svgHtml);
            }
            setLastValidCode(code);
            return;
          }

          // Fallback: sized offscreen host (do not use display:none)
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'fixed';
          tempDiv.style.left = '-10000px';
          tempDiv.style.top = '0';
          tempDiv.style.width = '1200px';
          tempDiv.style.height = '800px';
          tempDiv.style.opacity = '0';
          tempDiv.style.pointerEvents = 'none';
          document.body.appendChild(tempDiv);
          await (window as any).GoToolkitDrawMemo.init(tempDiv, code);
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
          const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG(0.6);
          updateAttributes({ excalidrawJSON: json });
          setSvg(svgHtml);
          setLastValidCode(code);
          document.body.removeChild(tempDiv);
        } catch (e) {
          console.warn("Immediate preview failed", e);
        }
      };
      syncPreview();
    }
  }, [code, excalidrawJSON, isEditing, updateAttributes]);

  const renderDiagram = React.useCallback(async () => {
    // Skip preview rendering while editing to avoid competing with the modal view
    // which uses the same singleton Excalidraw bridge instance.
    if (isEditing) return;

    if (excalidrawJSON) {
      try {
        // If we have Excalidraw JSON, use it to generate SVG
        if ((window as any).GoToolkitDrawMemo) {
          if ((window as any).GoToolkitDrawMemo.renderPreview) {
            const result = await (window as any).GoToolkitDrawMemo.renderPreview(excalidrawJSON, 0.6);
            if (result?.svg) {
              setSvg(result.svg);
              setError(null);
              return;
            }
          }

          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'fixed';
          tempDiv.style.left = '-10000px';
          tempDiv.style.top = '0';
          tempDiv.style.width = '1200px';
          tempDiv.style.height = '800px';
          tempDiv.style.opacity = '0';
          tempDiv.style.pointerEvents = 'none';
          document.body.appendChild(tempDiv);
          await (window as any).GoToolkitDrawMemo.init(tempDiv, excalidrawJSON);
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG(0.6);
          setSvg(svgHtml);
          document.body.removeChild(tempDiv);
          setError(null);
          return;
        }
      } catch (err) {
        console.warn('Excalidraw render error, falling back to mermaid:', err);
      }
    }

    if (!code.trim() && !excalidrawJSON) {
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
  }, [code, excalidrawJSON, isEditing]);

  React.useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  const handleDoubleClick = async () => {
    setIsEditing(true);
    setIsLoading(true);
    setModalError(null);
    setLastValidCode(code);
    setDraftCode(code);
  };

  React.useEffect(() => {
    if (isEditing && excalidrawHostRef.current) {
      const initExcalidraw = async () => {
        try {
          if ((window as any).GoToolkitDrawMemo) {
            // Use excalidrawJSON if available, otherwise fallback to code (mermaid)
            const initialData = excalidrawJSON || code;
            await (window as any).GoToolkitDrawMemo.init(excalidrawHostRef.current, initialData);

            // Excalidraw sometimes needs a layout nudge when mounted in a modal.
            // Without it, interactions like resize handles may not work reliably.
            const nudge = () => {
              try {
                window.dispatchEvent(new Event('resize'));
              } catch {
                // no-op
              }
            };

            // Double rAF to wait until the host has final dimensions.
            const raf1 = window.requestAnimationFrame(() => {
              window.requestAnimationFrame(nudge);
            });

            let ro: ResizeObserver | null = null;
            const hostEl = excalidrawHostRef.current;
            if (hostEl && typeof (window as any).ResizeObserver !== 'undefined') {
              ro = new ResizeObserver(() => nudge());
              ro.observe(hostEl);
            }

            // Ensure selection tool is active (resize handles visible)
            try {
              const api = (window as any).GoToolkitDrawMemo?.getApi?.();
              api?.setActiveTool?.({ type: 'selection' });
              api?.refresh?.();
            } catch {
              // no-op
            }

            // Some browsers/layouts need an additional delayed refresh.
            const t1 = window.setTimeout(() => {
              try {
                const api = (window as any).GoToolkitDrawMemo?.getApi?.();
                api?.setActiveTool?.({ type: 'selection' });
                api?.refresh?.();
                nudge();
              } catch {
                // no-op
              }
            }, 150);

            const t2 = window.setTimeout(() => {
              try {
                const api = (window as any).GoToolkitDrawMemo?.getApi?.();
                api?.setActiveTool?.({ type: 'selection' });
                api?.refresh?.();
                nudge();
              } catch {
                // no-op
              }
            }, 500);

            return () => {
              window.cancelAnimationFrame(raf1);
              window.clearTimeout(t1);
              window.clearTimeout(t2);
              ro?.disconnect();
            };
          }
        } catch (err) {
          console.error("Failed to init Excalidraw", err);
        } finally {
          setIsLoading(false);
        }
      };

      let cleanup: undefined | (() => void);
      void initExcalidraw().then(fn => {
        cleanup = typeof fn === 'function' ? fn : undefined;
      });

      return () => {
        cleanup?.();
      };
    }
  }, [isEditing]);

  const handleCloseModal = async () => {
    if ((window as any).GoToolkitDrawMemo) {
      const finalCode = modalError ? lastValidCode : draftCode;

      // If there's a modal error, reset to last valid code before closing
      if (modalError) {
        updateAttributes({ code: lastValidCode });
        // Re-sync Excalidraw with last valid code
        await (window as any).GoToolkitDrawMemo.updateFromMermaid(lastValidCode);
      } else {
        // Persist whatever is in the textarea when closing
        updateAttributes({ code: draftCode });
      }

      const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
      // Use 60% zoom for the document preview
      const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG(0.6);
      
      // If both code and excalidraw are empty, we clear everything
      const isExcalidrawEmpty = !json || json === '{"elements":[],"appState":{}}' || json.includes('"elements":[]');
      const finalExcalidrawJSON = (finalCode.trim() || !isExcalidrawEmpty) ? json : '';
      
      updateAttributes({ 
        excalidrawJSON: finalExcalidrawJSON,
      });
      if (svgHtml && (finalCode.trim() || !isExcalidrawEmpty)) {
        setSvg(svgHtml);
      } else {
        setSvg('');
      }
    }
    setIsEditing(false);
    setModalError(null);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditing) {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, modalError, lastValidCode]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setDraftCode(newCode);
  };

  const handleSyncFromMermaid = async () => {
    if (!(window as any).GoToolkitDrawMemo) return;
    setIsLoading(true);
    try {
      // Do not update node attrs here: TipTap attribute updates can remount the node view
      // and steal the Excalidraw singleton away from the modal.
      await (window as any).GoToolkitDrawMemo.updateFromMermaid(draftCode);

      // Now that Excalidraw has applied the scene, persist the results.
      const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
      const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG(0.6);
      updateAttributes({
        code: draftCode,
        excalidrawJSON: json || '',
      });
      if (svgHtml) {
        setSvg(svgHtml);
      }

      setModalError(null);
      setLastValidCode(draftCode);
    } catch (err: any) {
      if (draftCode?.trim()) {
        setModalError(err.message || 'Syntaxe Mermaid invalide');
      } else {
        setModalError(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextareaFocus = () => {
    if (draftCode) {
      navigator.clipboard.writeText(draftCode).then(() => {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
      });
    }
  };

  return (
    <>
      <NodeViewWrapper className="mermaid-diagram-wrapper">
        <div 
          ref={containerRef}
          className="mermaid-diagram-container"
          onDoubleClick={handleDoubleClick}
          onClick={(e) => e.stopPropagation()}
          title="Double-cliquer pour modifier le diagramme"
          style={{ cursor: 'pointer', minHeight: '100px', display: 'block', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', visibility: 'visible', opacity: 1, position: 'relative', zIndex: 1, overflow: 'visible', contentVisibility: 'visible', transform: 'none', minWidth: '100px', height: 'auto' }}
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
              <div className="mermaid-placeholder-icon"><Shapes size={32} /></div>
              <div className="mermaid-placeholder-text">Diagramme vide</div>
              <div className="mermaid-placeholder-hint">Double-cliquez pour éditer</div>
            </div>
          )}
        </div>
      </NodeViewWrapper>

      {/* Edit Modal */}
      {isEditing && (
        <div className="mermaid-modal-overlay" onClick={handleCloseModal}>
          <div className="mermaid-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mermaid-modal-header">
              <div className="mermaid-modal-header-actions">
                {isLoading && <span className="mermaid-loading-spinner"></span>}
                <button 
                  className="mermaid-modal-sync btn-secondary" 
                  onClick={handleSyncFromMermaid}
                  style={{ marginRight: '2px' }}
                >
                  Générer
                </button>
                <button className="mermaid-modal-close btn-primary" onClick={handleCloseModal}></button>
              </div>
            </div>
            <div className="mermaid-modal-body">
              <div className="mermaid-modal-draw-container">
                <div 
                  ref={excalidrawHostRef}
                  className="mermaid-modal-excalidraw-host"
                  style={{ touchAction: 'none', userSelect: 'none' }}
                />
              </div>
              <div className="mermaid-modal-editor">
                <textarea
                  className="mermaid-modal-textarea"
                  value={draftCode}
                  onChange={handleCodeChange}
                  onFocus={handleTextareaFocus}
                  placeholder="Entrez votre code Mermaid ici..."
                  spellCheck={false}
                />
                {modalError && (
                  <div className="mermaid-modal-error-display">
                    {modalError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showToast && <div className="mermaid-toast">Code copié !</div>}
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