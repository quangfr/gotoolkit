import { Node, mergeAttributes, InputRule, Editor } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { Shapes, RectangleHorizontal, Square, ArrowLeftRight, Workflow, Boxes, Send, Loader2, ChevronUp, Copy, CircleX } from 'lucide-react';

const getMermaidApi = () => (window as any).mermaid;

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

  // AI Generation States
  const [promptInput, setPromptInput] = React.useState('');
  const [diagramType, setDiagramType] = React.useState('flow');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = React.useState(false);
  const composerTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  const code = node.attrs.code || '';
  const excalidrawJSON = node.attrs.excalidrawJSON || '';

  const getAutoResizeHeight = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 140; // ~5 rows
    return Math.min(scrollHeight, maxHeight) + 'px';
  };

  const handlePromptInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptInput(e.target.value);
    e.target.style.height = getAutoResizeHeight(e.target);
    e.target.style.overflowY = e.target.scrollHeight > 140 ? 'auto' : 'hidden';
  };

  const diagramTypes = [
    { id: 'sequence', label: 'Échange', promptValue: 'sequenceDiagram', Icon: ArrowLeftRight },
    { id: 'flow', label: 'Processus', promptValue: 'flowchart', Icon: Workflow },
    { id: 'class', label: 'Structure', promptValue: 'classDiagram', Icon: Boxes }
  ];

  const getDiagramTypeFromCode = (c: string) => {
    const header = getDiagramHeaderLine(c).toLowerCase();
    if (header.startsWith('sequencediagram')) return 'sequence';
    if (header.startsWith('classdiagram')) return 'class';
    if (header.startsWith('flowchart') || header.startsWith('graph')) return 'flow';
    return null;
  };

  React.useEffect(() => {
    const nextType = getDiagramTypeFromCode(draftCode || code);
    if (nextType && nextType !== diagramType) {
      setDiagramType(nextType);
    }
  }, [code, draftCode, diagramType]);

  const handleDrawSend = async () => {
    if (!promptInput.trim() || isGenerating) return;

    setIsGenerating(true);
    setModalError(null);
    try {
      const presets = (window as any).GoToolkitChatPrompt?.PRESETS?.draw;
      const template = presets?.defaultPrompt || presets?.prompt || "";
      
      const selectedType = diagramTypes.find(t => t.id === diagramType);
      const drawTypeValue = selectedType?.promptValue || 'flowchart';

      // Get full document markdown for context
      const documentMarkdown = (window as any).getEditorMarkdown?.() || "Contenu du document non disponible.";

      const userContent = [
        `DOCUMENT\n${documentMarkdown}`,
        `CURRENT_CODE\n${draftCode.trim() || 'Aucun diagramme actuel'}`,
        `DRAW_TYPE\n${drawTypeValue}`,
        `ASK\n${promptInput.trim()}`
      ].join('\n\n');

      const payload = {
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: template },
          { role: "user", content: userContent }
        ],
        temperature: 0.3
      };



      const response = await (window as any).GoToolkitIA.chatCompletion({
        payload
      });



      const responseText = typeof response === 'string' ? response : (response?.text || "");

      if (responseText) {
        let cleanCode = "";
        
        try {
          // Attempt JSON parse as per new prompt definition
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
          const parsed = JSON.parse(jsonStr);
          cleanCode = parsed.mermaid || "";
          
          if (!cleanCode && parsed.code) cleanCode = parsed.code; // Fallback
        } catch (e) {
          // Fallback to extraction if not JSON
          cleanCode = responseText.trim();
          if (cleanCode.includes('```')) {
            const match = cleanCode.match(/```(?:mermaid)?\n?([\s\S]*?)```/);
            if (match) cleanCode = match[1].trim();
          }
        }

        if (cleanCode) {
          // Auto-detect size
          const lowerCode = cleanCode.toLowerCase();
          let newSize = 'small';
          if (lowerCode.includes('flowchart td') || lowerCode.includes('graph td')) {
            newSize = 'large';
          }
          const nextType = getDiagramTypeFromCode(cleanCode);
          if (nextType) {
            setDiagramType(nextType);
          }

          setDraftCode(cleanCode);
          setPromptInput('');
          if (composerTextareaRef.current) {
            composerTextareaRef.current.style.height = 'auto';
          }

          // Sync to Excalidraw immediately
          if ((window as any).GoToolkitDrawMemo) {
            setIsLoading(true);
            try {
              await (window as any).GoToolkitDrawMemo.updateFromMermaid(cleanCode, newSize);
              const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
              const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG('auto');
              
              updateAttributes({ 
                code: cleanCode, 
                size: newSize,
                excalidrawJSON: json || ''
              });
              if (svgHtml) setSvg(svgHtml);
              setLastValidCode(cleanCode);
              setModalError(null);
            } catch (syncErr: any) {
              setModalError(syncErr.message || "Erreur de synchronisation Excalidraw");
            } finally {
              setIsLoading(false);
            }
          }
        }
      }
    } catch (err: any) {
      setModalError(err.message || "Erreur de génération");
    } finally {
      setIsGenerating(false);
    }
  };

  const getDiagramHeaderLine = (c: string) => {
    const lines = (c || '').split('\n');
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('%%')) continue;
      return line;
    }
    return '';
  };

  const getFlowchartDirection = (c: string) => {
    const line = getDiagramHeaderLine(c);
    if (/^(flowchart|graph)\b/i.test(line)) {
      const match = line.match(/\b(LR|TD|TB|BT|RL)\b/i);
      return match ? match[1].toUpperCase() : null;
    }
    return null;
  };

  const setFlowchartDirection = (c: string, direction: string) => {
    const lines = (c || '').split('\n');
    let updated = false;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();
      if (!line || line.startsWith('%%')) continue;
      if (/^(flowchart|graph)\b/i.test(line)) {
        const directionMatch = rawLine.match(/(flowchart|graph)\s+(LR|TD|TB|BT|RL)/i);
        if (directionMatch) {
          lines[i] = rawLine.replace(/(flowchart|graph)\s+(LR|TD|TB|BT|RL)/i, `$1 ${direction}`);
        } else {
          lines[i] = rawLine.replace(/(flowchart|graph)/i, `$1 ${direction}`);
        }
        updated = true;
        break;
      }
    }
    return { code: lines.join('\n'), updated };
  };

  const getAutoDetectedSize = (c: string) => {
    const header = getDiagramHeaderLine(c).toLowerCase();
    if (header.startsWith('classdiagram')) return 'large';
    if (header.startsWith('sequencediagram')) return 'small';
    const direction = getFlowchartDirection(c);
    if (direction === 'TD') return 'large';
    if (direction === 'LR') return 'small';
    if (header.includes('flowchart td') || header.includes('graph td')) return 'large';
    return 'small';
  };

  const isSizeSelectorVisible = (c: string) => {
    const header = getDiagramHeaderLine(c).toLowerCase();
    if (header.startsWith('sequencediagram') || header.startsWith('classdiagram')) return false;
    return header.startsWith('flowchart') || header.startsWith('graph');
  };

  const activeCode = isEditing ? draftCode : code;
  const directionSize = getFlowchartDirection(activeCode);
  let size = directionSize ? (directionSize === 'TD' ? 'large' : 'small') : node.attrs.size || getAutoDetectedSize(activeCode);
  if (size === 'medium') size = 'small'; 
  const showSizeSelector = isSizeSelectorVisible(activeCode);

  // Immediate preview on paste/init if excalidrawJSON is missing but code exists
  React.useEffect(() => {
    if (isEditing) return;
    if (code && !excalidrawJSON && (window as any).GoToolkitDrawMemo) {
      const syncPreview = async () => {
        try {
          // Prefer the bridge preview helper if available (serialized & sized host)
          if ((window as any).GoToolkitDrawMemo.renderPreview) {
            const result = await (window as any).GoToolkitDrawMemo.renderPreview(code, 'auto', size);
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
          await (window as any).GoToolkitDrawMemo.init(tempDiv, code, size);
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
          const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG('auto');
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
  }, [code, excalidrawJSON, isEditing, updateAttributes, size]);

  const renderDiagram = React.useCallback(async () => {
    // Skip preview rendering while editing to avoid competing with the modal view
    // which uses the same singleton Excalidraw bridge instance.
    if (isEditing) return;

    if (excalidrawJSON) {
      try {
        // If we have Excalidraw JSON, use it to generate SVG
        if ((window as any).GoToolkitDrawMemo) {
          if ((window as any).GoToolkitDrawMemo.renderPreview) {
            const result = await (window as any).GoToolkitDrawMemo.renderPreview(excalidrawJSON, 'auto', size);
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
          await (window as any).GoToolkitDrawMemo.init(tempDiv, excalidrawJSON, size);
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
          const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG('auto');
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
      const mermaidApi = getMermaidApi();
      if (!mermaidApi) {
        setError('Mermaid CDN non chargé');
        setSvg('');
        return;
      }

      // Generate unique ID for this diagram
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Configure mermaid for this render
      mermaidApi.initialize({ 
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });

      const { svg } = await mermaidApi.render(id, code);
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
            await (window as any).GoToolkitDrawMemo.init(excalidrawHostRef.current, initialData, size);

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
    try {
      if ((window as any).GoToolkitDrawMemo) {
        // If there's a modal error, we must revert to the last valid code as requested
        const hasError = !!modalError;
        const finalCode = hasError ? lastValidCode : draftCode;

        if (hasError) {
          updateAttributes({ code: lastValidCode });
          // Re-sync Excalidraw with last valid code to clean up the internal state
          try {
            await (window as any).GoToolkitDrawMemo.updateFromMermaid(lastValidCode, size);
          } catch (e) {
            console.warn("Failed to revert Excalidraw to last valid state, continuing...", e);
          }
        } else {
          // Persist the current draft when closing normally
          updateAttributes({ code: draftCode });
        }

        const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
        // Use auto zoom to fit height
        const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG('auto');
        
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
    } catch (err) {
      console.error("Critical error during Mermaid modal close:", err);
    } finally {
      // Ensure the modal actually closes regardless of internal sync results
      setIsEditing(false);
      setModalError(null);
    }
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
      // Use forced size for sequence/class diagrams
      const targetSize = !isSizeSelectorVisible(draftCode) ? getAutoDetectedSize(draftCode) : size;

      // Do not update node attrs here: TipTap attribute updates can remount the node view
      // and steal the Excalidraw singleton away from the modal.
      await (window as any).GoToolkitDrawMemo.updateFromMermaid(draftCode, targetSize);

      // Now that Excalidraw has applied the scene, persist the results.
      const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
      const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG('auto');
      updateAttributes({
        code: draftCode,
        excalidrawJSON: json || '',
        size: targetSize // Persist the forced size too
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

  const handleCopyCode = () => {
    if (!draftCode) return;
    navigator.clipboard.writeText(draftCode).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    });
  };

  const handleClearCode = () => {
    setDraftCode('');
    setModalError(null);
  };

  const handleSizeChange = async (newSize: string, sourceCode?: string) => {
    if (newSize === size) return;
    
    setIsLoading(true);
    try {
      let updatedCode = sourceCode || draftCode || code;

      // Flowchart orientation logic
      const headerLine = getDiagramHeaderLine(updatedCode).toLowerCase();
      const isFlowchart = headerLine.startsWith('flowchart') || headerLine.startsWith('graph');
      if (isFlowchart) {
        const direction = newSize === 'large' ? 'TD' : 'LR';
        const { code: nextCode, updated } = setFlowchartDirection(updatedCode, direction);
        if (updated) {
          updatedCode = nextCode;
          if (sourceCode !== code) {
            setDraftCode(updatedCode);
          }
        }
      }

      // Update attributes (might trigger some re-renders but we stay in modal)
      updateAttributes({ size: newSize, code: updatedCode });
      
      if ((window as any).GoToolkitDrawMemo) {
        // Re-generate the diagram with the new size/font settings
        await (window as any).GoToolkitDrawMemo.updateFromMermaid(updatedCode, newSize);
        
        // Sync the preview immediately
        const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
        const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG('auto');
        updateAttributes({ excalidrawJSON: json });
        if (svgHtml) setSvg(svgHtml);
      }
    } catch (err) {
      console.error("Failed to update size", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <NodeViewWrapper className="mermaid-diagram-wrapper node-mermaidDiagram">
        <div className="table-handle mermaid-node-handle" title="Déplacer">
          ⠿
        </div>
        <div 
          ref={containerRef}
          className="mermaid-diagram-container"
          onDoubleClick={handleDoubleClick}
          title="Double-cliquer pour modifier le diagramme"
          style={{ 
            cursor: 'pointer', 
            maxHeight: size === 'large' ? '650px' : '500px',
            display: 'flex', 
            flexDirection: 'column',
            width: '100%', 
            background: '#ffffff', 
            border: '1px solid #e2e8f0', 
            borderRadius: '8px', 
            visibility: 'visible', 
            opacity: 1, 
            position: 'relative', 
            zIndex: 1, 
            overflow: 'hidden', 
            contentVisibility: 'visible', 
            transform: 'none', 
            minWidth: '100px'
          }}
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
              <div className="mermaid-modal-header-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {showSizeSelector && (
                    <div className="mermaid-modal-size-selector">
                      {[
                        { id: 'small', label: 'Rectangle', Icon: RectangleHorizontal },
                        { id: 'large', label: 'Carré', Icon: Square }
                      ].map((s) => (
                        <button
                          key={s.id}
                          className={`mermaid-modal-size-btn ${size === s.id ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleSizeChange(s.id, draftCode);
                          }}
                          title={s.label}
                        >
                          <s.Icon size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {isLoading && <span className="mermaid-loading-spinner"></span>}
                  <button 
                    className="mermaid-modal-sync btn-secondary" 
                    onClick={handleSyncFromMermaid}
                  >
                    Générer
                  </button>
                  <button className="mermaid-modal-close btn-primary" onClick={handleCloseModal}></button>
                </div>
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                  <textarea
                    className="mermaid-modal-textarea"
                    value={draftCode}
                    onChange={handleCodeChange}
                    placeholder="Entrez votre code Mermaid ici..."
                    spellCheck={false}
                  />
                  <div className="mermaid-modal-textarea-actions">
                    <button
                      type="button"
                      className="mermaid-modal-textarea-btn"
                      onClick={handleCopyCode}
                      title="Copier"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className="mermaid-modal-textarea-btn"
                      onClick={handleClearCode}
                      title="Effacer"
                    >
                      <CircleX size={14} data-lucide="circle-x" />
                    </button>
                  </div>
                  {modalError && (
                    <div className="mermaid-modal-error-display">
                      {modalError}
                    </div>
                  )}
                </div>

                {/* AI Composer */}
                <div id="draw-composer" className="draw-composer chat-composer" style={{ border: 'none', background: 'var(--bg-surface)' }}>
                  <div className="chat-input-wrapper">
                    <textarea
                      ref={composerTextareaRef}
                      id="draw-composer-input"
                      className="chat-input"
                      rows={2}
                      value={promptInput}
                      onChange={handlePromptInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleDrawSend();
                        }
                      }}
                      placeholder="Décrivez votre diagramme..."
                    />
                  </div>
                  <div className="chat-composer-actions">
                    <div className="chat-composer-left-actions">
                      <div className="diagram-type-dropdown chat-prompt-dropdown">
                        <button
                          type="button"
                          id="diagram-type-selector"
                          className="btn-secondary chat-prompt-btn"
                          onClick={() => setIsTypeMenuOpen(!isTypeMenuOpen)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {(() => {
                            const current = diagramTypes.find(t => t.id === diagramType);
                            const Icon = current?.Icon || Workflow;
                            const label = (draftCode || code).trim() ? current?.label : 'Éditer';
                            return <><Icon size={14} /> <span>{label}</span></>;
                          })()}
                          <ChevronUp size={12} style={{ transform: isTypeMenuOpen ? 'rotate(180deg)' : '' }} />
                        </button>
                        
                        {isTypeMenuOpen && (
                          <div id="diagram-type-menu" className="diagram-type-menu chat-prompt-menu open" style={{ bottom: '100%', top: 'auto', marginBottom: '8px' }}>
                            {diagramTypes.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                className="chat-prompt-menu-item"
                                onClick={() => {
                                  setDiagramType(t.id);
                                  setIsTypeMenuOpen(false);
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                              >
                                <t.Icon size={14} />
                                <span>{t.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      className="btn-primary chat-send-btn"
                      onClick={handleDrawSend}
                      disabled={isGenerating || !promptInput.trim()}
                    >
                      {isGenerating ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showToast && <div className="mermaid-toast">Texte copié</div>}
    </>
  );
};

// Custom Tiptap Node Extension
export const MermaidNode = Node.create({
  name: 'mermaidDiagram',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  
  addAttributes() {
    return {
      code: {
        default: '',
      },
      excalidrawJSON: {
        default: '',
      },
      size: {
        default: 'small',
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
