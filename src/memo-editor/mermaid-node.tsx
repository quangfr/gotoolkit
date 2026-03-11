import { Node, mergeAttributes, InputRule, Editor } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { Shapes, RectangleHorizontal, Square, ArrowLeftRight, Workflow, Boxes, Send, Loader2, ChevronUp, Copy, CircleX, Sparkles } from 'lucide-react';

const getMermaidApi = () => (window as any).mermaid;

const encodeMermaidHtmlAttr = (value: unknown): string => {
  const text = String(value || "");
  try {
    return encodeURIComponent(text);
  } catch {
    return text;
  }
};

const decodeMermaidHtmlAttr = (value: unknown): string => {
  const text = String(value || "");
  if (!text) return "";
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

const INLINE_MERMAID_RENDER_CONFIG = {
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict' as const,
  flowchart: {
    htmlLabels: false,
  },
};

function sanitizeRenderedSvg(svgMarkup: string): string {
  const raw = String(svgMarkup || '').trim();
  if (!raw) return '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return '';

    const blockedTags = ['script', 'foreignObject', 'iframe', 'object', 'embed', 'link'];
    blockedTags.forEach(tag => {
      doc.querySelectorAll(tag).forEach(node => node.remove());
    });

    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          return;
        }
        if (name === 'href' || name === 'xlink:href') {
          if (/^\s*javascript:/i.test(value)) {
            el.removeAttribute(attr.name);
          }
          return;
        }
        if (name === 'style' && /javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return svg.outerHTML || '';
  } catch {
    return '';
  }
}

// Mermaid Diagram Component that shows only the diagram
const MermaidDiagramComponent = ({ node, updateAttributes, editor }: any) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const initialCode = decodeMermaidHtmlAttr(node.attrs.code || '');
  const initialExcalidrawJson = String(node.attrs.excalidrawJSON || '');
  const initialSize = String(node.attrs.size || 'small');
  const initialPreviewKey = String(node.attrs.previewKey || '');
  const initialContentKey = `${initialCode}::${initialExcalidrawJson}::${initialSize}`;
  const initialPreviewSvg = initialPreviewKey === initialContentKey
    ? decodeMermaidHtmlAttr(node.attrs.previewSvg || '')
    : '';
  const [svg, setSvg] = React.useState(initialPreviewSvg);
  const [error, setError] = React.useState<string | null>(null);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [lastValidCode, setLastValidCode] = React.useState(initialCode);
  const [draftCode, setDraftCode] = React.useState(initialCode);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);
  const [showToast, setShowToast] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const excalidrawHostRef = React.useRef<HTMLDivElement>(null);
  const prevEditableRef = React.useRef<boolean | null>(null);
  const lastStableSvgRef = React.useRef(initialPreviewSvg);
  const lastPreviewSyncKeyRef = React.useRef('');
  const previewSourceRef = React.useRef<'none' | 'mermaid' | 'excalidraw'>('none');
  const updateAttributesRef = React.useRef(updateAttributes);

  // AI Generation States
  const [promptInput, setPromptInput] = React.useState('');
  const [diagramType, setDiagramType] = React.useState('flow');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = React.useState(false);
  const composerTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [editorPanelWidth, setEditorPanelWidth] = React.useState(350);
  const resizeStateRef = React.useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const code = decodeMermaidHtmlAttr(node.attrs.code || '');
  const excalidrawJSON = node.attrs.excalidrawJSON || '';
  const autoOpen = node.attrs.autoOpen === true;

  React.useEffect(() => {
    updateAttributesRef.current = updateAttributes;
  }, [updateAttributes]);

  React.useEffect(() => {
    if (persistedPreviewSvg) {
      setSvg(prev => prev || persistedPreviewSvg);
      lastStableSvgRef.current = persistedPreviewSvg;
    }
  }, [persistedPreviewSvg]);

  React.useEffect(() => {
    if (visibleSvg) {
      lastStableSvgRef.current = visibleSvg;
      return;
    }
    if (!code.trim() && !excalidrawJSON) {
      lastStableSvgRef.current = '';
      previewSourceRef.current = 'none';
    }
  }, [code, excalidrawJSON, visibleSvg]);

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
  }, [code, draftCode]);



  const handleDrawSend = async () => {
    if (!promptInput.trim() || isGenerating) return;

    setIsGenerating(true);
    setModalError(null);
    const drawDuration = Math.min(45000, Math.max(15000, 15000 + Math.round(promptInput.trim().length * 30)));
    (window as any).GoToolkitAIRequestToaster?.startIcon?.("aiRequestCounterToasterDraw", "brush", "Dessin", drawDuration);
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
              // Keep the inline block preview stable while the modal is open.
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
      (window as any).GoToolkitAIRequestToaster?.stop?.("aiRequestCounterToasterDraw");
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
  const contentKey = `${code}::${excalidrawJSON}::${size}`;
  const persistedPreviewSvg = String(node.attrs.previewKey || '') === contentKey
    ? decodeMermaidHtmlAttr(node.attrs.previewSvg || '')
    : '';
  const visibleSvg = svg || persistedPreviewSvg || lastStableSvgRef.current;
  const isMermaidDiagnosticsEnabled = () => {
    try {
      if (localStorage.getItem('goToolkit.mermaidDiagnostics') === '0') return false;
      if ((window as any).GoToolkitMermaidDiagnostics === false) return false;
      return true;
    } catch {
      return true;
    }
  };

  React.useEffect(() => {
    if (!isEditing) return;
    if (!isMermaidDiagnosticsEnabled()) return;

    const logContainer = (label: string) => {
      const container = document.querySelector('.mermaid-modal-draw-container') as HTMLElement | null;
      if (!container) {
        console.warn('[mermaid-modal]', label, 'draw container not found');
        return;
      }
    };

    const logHost = (label: string) => {
      const host = excalidrawHostRef.current;
      if (!host) {
        console.warn('[mermaid-modal]', label, 'excalidraw host not found');
        return;
      }
    };

    const logLib = (label: string) => {
      const lib = (window as any).GoToolkitExcalidraw;
      if (!lib) {
        console.warn('[mermaid-modal]', label, 'GoToolkitExcalidraw missing');
        return;
      }
      if (typeof lib?.convertMermaid !== 'function') {
        console.warn('[mermaid-modal]', label, 'GoToolkitExcalidraw missing convertMermaid');
      }
    };

    const logScene = (label: string) => {
      try {
        (window as any).GoToolkitDrawMemo?.getApi?.();
      } catch (error) {
        console.warn('[mermaid-modal]', label, 'scene log failed', error);
      }
    };

    const logAll = (label: string) => {
      logContainer(label);
      logHost(label);
      logLib(label);
      logScene(label);
    };

    const frame = window.requestAnimationFrame(() => logAll('open:rAF'));
    const timer = window.setTimeout(() => logAll('open:300ms'), 300);
    const timer2 = window.setTimeout(() => logAll('open:1200ms'), 1200);

    let resizeObserver: ResizeObserver | null = null;
    const container = document.querySelector('.mermaid-modal-draw-container') as HTMLElement | null;
    if (container && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => logContainer('resize'));
      resizeObserver.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearTimeout(timer2);
      resizeObserver?.disconnect();
    };
  }, [isEditing, draftCode, code, size]);

  React.useEffect(() => {
    if (isEditing) return;
    if (!code && !excalidrawJSON) return;
    if (persistedPreviewSvg || svg || lastStableSvgRef.current) return;
    if (!(window as any).GoToolkitDrawMemo) return;
    const syncKey = contentKey;
    if (lastPreviewSyncKeyRef.current === syncKey) return;
    lastPreviewSyncKeyRef.current = syncKey;

    const syncPreview = async () => {
      setIsPreviewLoading(true);
      try {
        if ((window as any).GoToolkitDrawMemo.renderPreview) {
          const previewInput = excalidrawJSON || code;
          const result = await (window as any).GoToolkitDrawMemo.renderPreview(previewInput, 'auto', size);
          if (result?.skipped) {
            return;
          }
          const json = result?.json;
          const svgHtml = result?.svg;
          if (json && !excalidrawJSON) {
            updateAttributesRef.current?.({ excalidrawJSON: json });
          }
          if (svgHtml) {
            const cleanSvg = sanitizeRenderedSvg(svgHtml);
            previewSourceRef.current = 'excalidraw';
            setSvg(cleanSvg);
            setLastValidCode(code);
            setError(null);
            updateAttributesRef.current?.({
              previewSvg: cleanSvg,
              previewKey: syncKey,
            });
            return;
          }
        }

        if (!excalidrawJSON && code) {
          let mermaidApi = getMermaidApi();
          if (!mermaidApi) {
            try {
              await (window as any).GoToolkitLazyCdn?.loadMermaid?.();
            } catch (loadErr) {
              console.warn('Mermaid lazy-load failed during preview hydration:', loadErr);
            }
            mermaidApi = getMermaidApi();
          }
          if (!mermaidApi) {
            throw new Error('Mermaid CDN non chargé');
          }
          const id = `mermaid-preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          mermaidApi.initialize(INLINE_MERMAID_RENDER_CONFIG);
          const { svg } = await mermaidApi.render(id, code);
          const cleanSvg = sanitizeRenderedSvg(svg);
          previewSourceRef.current = 'mermaid';
          setSvg(cleanSvg);
          setLastValidCode(code);
          setError(null);
          updateAttributesRef.current?.({
            previewSvg: cleanSvg,
            previewKey: syncKey,
          });
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
        await (window as any).GoToolkitDrawMemo.init(tempDiv, excalidrawJSON || code, size);
        await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
        const json = (window as any).GoToolkitDrawMemo.getSceneJSON();
        const svgHtml = await (window as any).GoToolkitDrawMemo.getSVG('auto');
        if (!excalidrawJSON) {
          updateAttributesRef.current?.({ excalidrawJSON: json });
        }
        const cleanSvg = sanitizeRenderedSvg(svgHtml);
        previewSourceRef.current = 'excalidraw';
        setSvg(cleanSvg);
        setLastValidCode(code);
        updateAttributesRef.current?.({
          previewSvg: cleanSvg,
          previewKey: syncKey,
        });
        document.body.removeChild(tempDiv);
      } catch (e) {
        lastPreviewSyncKeyRef.current = '';
        console.warn("Immediate preview failed", e);
      } finally {
        setIsPreviewLoading(false);
      }
    };
    syncPreview();
  }, [code, contentKey, excalidrawJSON, isEditing, persistedPreviewSvg, size, svg]);

  React.useEffect(() => {
    if (!autoOpen) return;
    setIsEditing(true);
    setIsLoading(true);
    setModalError(null);
    setLastValidCode(code);
    setDraftCode(code);
    updateAttributes({ autoOpen: false });
  }, [autoOpen, code, updateAttributes]);

  const handleDoubleClick = async () => {
    setIsEditing(true);
    setIsLoading(true);
    setModalError(null);
    setLastValidCode(code);
    setDraftCode(code);
  };

  React.useEffect(() => {
    if (isEditing && excalidrawHostRef.current) {
      (window as any).GoToolkitDrawMemo?.beginInteractiveSession?.();

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
        (window as any).GoToolkitDrawMemo?.endInteractiveSession?.();
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
        
        const cleanSvg = svgHtml ? sanitizeRenderedSvg(svgHtml) : '';
        updateAttributes({ 
          excalidrawJSON: finalExcalidrawJSON,
          previewSvg: cleanSvg,
          previewKey: finalCode.trim() || !isExcalidrawEmpty ? `${finalCode}::${finalExcalidrawJSON}::${size}` : '',
        });
        if (cleanSvg && (finalCode.trim() || !isExcalidrawEmpty)) {
          previewSourceRef.current = 'excalidraw';
          setSvg(cleanSvg);
        } else {
          previewSourceRef.current = 'none';
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

  React.useEffect(() => {
    if (!editor) return;

    if (isEditing) {
      if (prevEditableRef.current === null) {
        prevEditableRef.current = editor.isEditable;
      }
      try {
        editor.setEditable(false);
      } catch (err) {
        // Best-effort: avoid blocking the modal if editor can't be toggled.
      }
    } else if (prevEditableRef.current !== null) {
      try {
        editor.setEditable(prevEditableRef.current);
      } catch (err) {
        // Best-effort restore.
      } finally {
        prevEditableRef.current = null;
      }
    }
  }, [editor, isEditing]);

  React.useEffect(() => {
    if (!isEditing) return;
    const raf = requestAnimationFrame(() => {
      excalidrawHostRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditing]);

  React.useEffect(() => {
    if (!isEditing) return;
    const onPointerMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) return;
      const modalEl = document.querySelector('.mermaid-modal') as HTMLElement | null;
      const modalWidth = modalEl?.clientWidth || window.innerWidth;
      const minWidth = 260;
      const maxWidth = Math.max(minWidth, Math.floor(modalWidth * 0.65));
      const nextWidth = resizeStateRef.current.startWidth - (event.clientX - resizeStateRef.current.startX);
      setEditorPanelWidth(Math.min(maxWidth, Math.max(minWidth, Math.round(nextWidth))));
    };
    const onPointerUp = () => {
      resizeStateRef.current = null;
      document.body.classList.remove('table-resize-cursor');
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.classList.remove('table-resize-cursor');
    };
  }, [isEditing]);

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
      // and steal the Excalidraw singleton away from the modal. Commit on close only.
      await (window as any).GoToolkitDrawMemo.updateFromMermaid(draftCode, targetSize);

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
    let updatedCode = sourceCode || draftCode || code;
    const headerLine = getDiagramHeaderLine(updatedCode).toLowerCase();
    const isFlowchart = headerLine.startsWith('flowchart') || headerLine.startsWith('graph');
    if (isFlowchart) {
      const direction = newSize === 'large' ? 'TD' : 'LR';
      const { code: nextCode, updated } = setFlowchartDirection(updatedCode, direction);
      if (updated) {
        updatedCode = nextCode;
      }
    }

    setDraftCode(updatedCode);

    const drawMemo = (window as any).GoToolkitDrawMemo;
    if (drawMemo) {
      (async () => {
        try {
          await drawMemo.updateFromMermaid(updatedCode, newSize);
          setLastValidCode(updatedCode);
        } catch (err) {
          console.error("Failed to update size", err);
        } finally {
          setIsLoading(false);
        }
      })();
    } else {
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
          title="Modifier"
          style={{ 
            cursor: 'pointer', 
            maxHeight: size === 'large' ? '650px' : '500px',
            display: 'flex', 
            flexDirection: 'column',
            width: '100%', 
            border: 'none', 
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
          ) : visibleSvg ? (
            <div 
              className="mermaid-svg-container"
              dangerouslySetInnerHTML={{ __html: visibleSvg }}
            />
          ) : isPreviewLoading && (code.trim() || excalidrawJSON) ? (
            <div className="mermaid-placeholder mermaid-placeholder--loading">
              <div className="mermaid-placeholder-icon"><Loader2 className="mermaid-preview-spinner" size={28} /></div>
              <div className="mermaid-placeholder-text">Chargement</div>
              <div className="mermaid-placeholder-hint">Préparation de l’aperçu</div>
            </div>
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
                          title="Orientation"
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
                    title="Générer"
                  >
                    Générer
                  </button>
                  <button className="mermaid-modal-close btn-primary" onClick={handleCloseModal} title="Fermer"></button>
                </div>
              </div>
            </div>
            <div className="mermaid-modal-body">
              <div className="mermaid-modal-draw-container">
                <div 
                  ref={excalidrawHostRef}
                  className="mermaid-modal-excalidraw-host"
                  style={{ touchAction: 'none', userSelect: 'none' }}
                  tabIndex={0}
                  onMouseDown={() => excalidrawHostRef.current?.focus()}
                />
              </div>
              <div
                className="mermaid-modal-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionner l'éditeur Mermaid"
                onPointerDown={(event) => {
                  event.preventDefault();
                  resizeStateRef.current = {
                    startX: event.clientX,
                    startWidth: editorPanelWidth,
                  };
                  document.body.classList.add('table-resize-cursor');
                }}
              />
              <div
                className="mermaid-modal-editor"
                style={{ width: `${editorPanelWidth}px`, flexBasis: `${editorPanelWidth}px` }}
              >
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
                            const label = current?.label || 'Processus';
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
                      <button
                        type="button"
                        className="btn-secondary chat-prompt-shortcuts-btn"
                        title="Raccourcis"
                        onClick={() => {
                          (window as any).GoToolkitAssistInstance?.openPromptShortcutsModal?.(composerTextareaRef.current);
                        }}
                      >
                        <Sparkles size={14} data-lucide="sparkles" />
                      </button>
                    </div>
                    
                    <button
                      type="button"
                      className="btn-primary chat-send-btn"
                      onClick={handleDrawSend}
                      disabled={isGenerating || !promptInput.trim()}
                      title="Envoyer"
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
      {showToast && <div className="mermaid-toast">Contenu copié</div>}
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
      autoOpen: {
        default: false,
      },
      previewSvg: {
        default: '',
      },
      previewKey: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mermaid-diagram',
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) {
            return {};
          }
          return {
            code: decodeMermaidHtmlAttr(node.getAttribute('code') || ''),
            excalidrawJSON: node.getAttribute('excalidrawJSON') || '',
            size: node.getAttribute('size') || 'small',
            autoOpen: node.getAttribute('autoOpen') === 'true',
            previewSvg: decodeMermaidHtmlAttr(node.getAttribute('previewSvg') || ''),
            previewKey: node.getAttribute('previewKey') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = {
      ...HTMLAttributes,
      code: encodeMermaidHtmlAttr(HTMLAttributes?.code || ''),
      previewSvg: encodeMermaidHtmlAttr(HTMLAttributes?.previewSvg || ''),
    };
    return ['mermaid-diagram', mergeAttributes(attrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidDiagramComponent, {
      update: ({ oldNode, newNode, updateProps }) => {
        const oldAttrs = oldNode.attrs || {};
        const newAttrs = newNode.attrs || {};
        const hasRelevantAttrChange =
          oldAttrs.code !== newAttrs.code ||
          oldAttrs.excalidrawJSON !== newAttrs.excalidrawJSON ||
          oldAttrs.size !== newAttrs.size ||
          oldAttrs.autoOpen !== newAttrs.autoOpen;

        if (hasRelevantAttrChange) {
          updateProps();
        }

        return true;
      },
    });
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
              attrs: { code: '', autoOpen: true },
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
    attrs: { code, autoOpen: true },
  }).run();
};
