import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleEditor } from '@/memo-editor';
import { exportEditorToDocx } from '@/memo-editor/docx-export';
import { EditorState } from '@tiptap/pm/state';

// Bridge to maintain compatibility with index.html
interface MemoEditorApi {
    setValue: (content: string) => void;
    getValue: () => string;
    onChange: (callback: (content: string, id?: string) => void) => void;
    exportDocx: (title?: string) => Promise<Blob | null>;
    getEditorState: () => any;
    setEditorState: (state: any) => void;
    setEditable: (editable: boolean) => void;
    switchTo: (id: string, initialContent?: string) => void;
    removeInstance: (id: string) => void;
    applyOutputTo: (id: string, output: string, mode: 'edit' | 'suggest') => void;
    applyStructuredOpsTo: (id: string, ops: Array<{ action?: string; type?: string; start?: number; end?: number; text?: string; content?: string }>) => void;
}

interface EditorInstance {
    id: string;
    content: string;
    methods?: any;
}

const EditorItem = React.memo(({ editor, activeId, onEditorChange, handleEditorReady }: any) => {
    // Stable onReady for this specific editor ID
    const onReady = React.useCallback((methods: any) => {
        handleEditorReady(editor.id, methods);
    }, [editor.id, handleEditorReady]);

    const onChange = React.useCallback((newContent: string, id?: string) => {
        if (onEditorChange) onEditorChange(newContent, id || editor.id);
    }, [editor.id, onEditorChange]);

    return (
        <div 
            style={{ display: editor.id === activeId ? 'block' : 'none', height: '100%' }}
        >
            <SimpleEditor 
                editorId={editor.id}
                content={editor.content}
                onChange={onChange}
                onReady={onReady}
            />
        </div>
    );
});

const App = () => {
    const MAX_CACHED_EDITORS = 8;
    const [editors, setEditors] = useState<Record<string, EditorInstance>>({});
    const [activeId, setActiveId] = useState<string>('');
    const [onChangeCb, setOnChangeCb] = useState<((content: string, id?: string) => void) | null>(null);
    const editorOrderRef = React.useRef<string[]>([]);
    const editorsRef = React.useRef<Record<string, EditorInstance>>({});
    const activeIdRef = React.useRef<string>('');
    const suppressedProgrammaticChangeRef = React.useRef<Record<string, string>>({});

    // Track active instance for global functions
    const activeInstanceRef = React.useRef<any>(null);

    const normalizeProgrammaticContent = React.useCallback((content: string) => {
        return String(content || '')
            .replace(/>\s+</g, '><')
            .replace(/\s+/g, ' ')
            .trim();
    }, []);

    const hashProgrammaticContent = React.useCallback((content: string) => {
        const normalized = normalizeProgrammaticContent(content);
        let hash = 2166136261;
        for (let i = 0; i < normalized.length; i += 1) {
            hash ^= normalized.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `${normalized.length}:${(hash >>> 0).toString(16)}`;
    }, [normalizeProgrammaticContent]);

    const suppressProgrammaticChange = React.useCallback((id: string, content: string) => {
        const targetId = String(id || '').trim();
        if (!targetId) return;
        suppressedProgrammaticChangeRef.current = {
            ...suppressedProgrammaticChangeRef.current,
            [targetId]: hashProgrammaticContent(content)
        };
    }, [hashProgrammaticContent]);

    const applyProgrammaticContent = React.useCallback((id: string, methods: any, content: string) => {
        const targetId = String(id || '').trim();
        if (!targetId || !methods?.instance?.commands?.setContent) return;
        suppressProgrammaticChange(targetId, content);
        try {
            methods.instance.commands.setContent(content);
        } catch (err) {
            const nextSuppressed = { ...suppressedProgrammaticChangeRef.current };
            delete nextSuppressed[targetId];
            suppressedProgrammaticChangeRef.current = nextSuppressed;
            throw err;
        }
    }, [suppressProgrammaticChange]);

    // Stable callback to prevent render loops
    const handleEditorReady = React.useCallback((id: string, methods: any) => {
        setEditors(prev => {
            // Only update if methods object is actually different
            if (prev[id]?.methods === methods) return prev;
            return {
                ...prev,
                [id]: { ...prev[id], methods }
            };
        });
    }, []);

    const handleEditorChange = React.useCallback((newContent: string, id?: string) => {
        const targetId = String(id || "").trim();
        if (!targetId) {
            if (onChangeCb) onChangeCb(newContent, id);
            return;
        }
        const suppressedContentHash = suppressedProgrammaticChangeRef.current[targetId];
        const nextContentHash = hashProgrammaticContent(newContent);
        if (typeof suppressedContentHash === 'string' && suppressedContentHash === nextContentHash) {
            const nextSuppressed = { ...suppressedProgrammaticChangeRef.current };
            delete nextSuppressed[targetId];
            suppressedProgrammaticChangeRef.current = nextSuppressed;
            setEditors(prev => {
                const current = prev[targetId];
                if (!current || current.content === newContent) return prev;
                const next = {
                    ...prev,
                    [targetId]: {
                        ...current,
                        content: newContent
                    }
                };
                editorsRef.current = next;
                return next;
            });
            return;
        }
        setEditors(prev => {
            const current = prev[targetId];
            if (!current) return prev;
            if (current.content === newContent) return prev;
            const next = {
                ...prev,
                [targetId]: {
                    ...current,
                    content: newContent
                }
            };
            editorsRef.current = next;
            return next;
        });
        if (onChangeCb) onChangeCb(newContent, targetId);
    }, [hashProgrammaticContent, onChangeCb]);

    useEffect(() => {
        const api: MemoEditorApi = {
            setValue: (newContent: string) => {
                const methods = activeInstanceRef.current;
                const contentLength = newContent?.length || 0;
                const start = performance.now();
                if (methods?.instance) {
                    const targetId = String(activeIdRef.current || 'default');
                    applyProgrammaticContent(targetId, methods, newContent);
                } else if ((window as any).MemoEditor) {
                    const targetId = String(activeIdRef.current || 'default');
                    suppressProgrammaticChange(targetId, newContent);
                    (window as any).MemoEditor.commands.setContent(newContent);
                }
                const duration = Math.round(performance.now() - start);
                if (duration > 100) {
                   console.warn(`[MemoBridge] setContent took ${duration}ms for ${contentLength} chars`);
                }
            },
            getValue: () => {
                const activeEditorId = String(activeIdRef.current || activeId || '');
                const byActiveId = activeEditorId ? editorsRef.current?.[activeEditorId] : null;
                const editor = byActiveId?.methods?.instance || activeInstanceRef.current?.instance || (window as any).MemoEditor;
                if (editor && typeof editor.getHTML === 'function') {
                    return editor.getHTML();
                }
                if (byActiveId && typeof byActiveId.content === 'string') {
                    return byActiveId.content;
                }
                return '';
            },
            onChange: (callback: (content: string, id?: string) => void) => {
                setOnChangeCb(() => callback);
            },
            exportDocx: async (title?: string) => {
                const editor = activeInstanceRef.current?.instance || (window as any).MemoEditor;
                if (editor) {
                    return await exportEditorToDocx(editor, title);
                }
                return null;
            },
            getEditorState: () => {
                try {
                    const editor = activeInstanceRef.current?.instance || (window as any).MemoEditor;
                    if (editor?.state?.toJSON) {
                        return editor.state.toJSON();
                    }
                } catch (err) {
                    // ignore
                }
                return null;
            },
            setEditorState: (state: any) => {
                try {
                    const editor = activeInstanceRef.current?.instance || (window as any).MemoEditor;
                    if (!editor?.view?.updateState || !state) return;
                    const nextState = EditorState.fromJSON(editor.state.schema, state, editor.state.plugins);
                    editor.view.updateState(nextState);
                } catch (err) {
                    console.warn('setEditorState failed', err);
                }
            },
            setEditable: (editable: boolean) => {
                const methods = activeInstanceRef.current;
                if (methods?.setEditable) {
                    methods.setEditable(editable);
                    return;
                }
                const editor = methods?.instance || (window as any).MemoEditor;
                if (editor?.setEditable) {
                    editor.setEditable(Boolean(editable));
                }
            },
            switchTo: (id: string, initialContent?: string) => {
                const start = performance.now();
    // no-op
                setActiveId(id);
                activeIdRef.current = id;
                setEditors(prev => {
                    const hasExisting = Boolean(prev[id]);
                    const nextContent = typeof initialContent === 'string' ? initialContent : '';
                    const existingContent = hasExisting && typeof prev[id]?.content === 'string' ? prev[id].content : '';
                    const resolvedContent = hasExisting && existingContent
                        ? existingContent
                        : nextContent;
                    const next: Record<string, EditorInstance> = hasExisting
                        ? {
                            ...prev,
                            [id]: {
                                ...prev[id],
                                content: resolvedContent
                            }
                        }
                        : {
                            ...prev,
                            [id]: { id, content: resolvedContent }
                        };

                    const existingMethods = next[id]?.methods;
                    if (hasExisting && existingMethods?.instance?.commands?.setContent) {
                        try {
                            applyProgrammaticContent(id, existingMethods, resolvedContent);
                        } catch (err) {
                            // ignore editor hydration failures and keep state content as fallback
                        }
                    }
                    if (existingMethods) {
                        activeInstanceRef.current = existingMethods;
                        (window as any).MemoEditor = existingMethods.instance;
                        (window as any).memoEditor = existingMethods.instance;
                        (window as any).getEditorMarkdown = existingMethods.getMarkdown;
                        (window as any).setEditorMarkdown = existingMethods.setMarkdown;
                        (window as any).insertEditorMarkdownAtRange = existingMethods.insertMarkdownAtRange;
                        (window as any).insertEditorMarkdownAtEnd = existingMethods.insertMarkdownAtEnd;
                        (window as any).applyEditorStructuredOps = existingMethods.applyStructuredOps;
                        (window as any).getMemoEditorSource = existingMethods.getSource;
                        (window as any).exportMemoToDocx = existingMethods.exportDocx;
                    }
                    if (!hasExisting) {
                        const currentMethods = activeInstanceRef.current;
                        if (currentMethods?.instance?.commands?.setContent) {
                            try {
                                applyProgrammaticContent(id, currentMethods, resolvedContent);
                            } catch (err) {
                                // ignore immediate hydration fallback failures
                            }
                        }
                    }

                    let nextOrder = editorOrderRef.current.filter(editorId => Boolean(next[editorId]));
                    nextOrder = nextOrder.filter(editorId => editorId !== id);
                    nextOrder.push(id);

                    while (nextOrder.length > MAX_CACHED_EDITORS) {
                        const victimId = nextOrder.find(editorId => editorId !== id && editorId !== activeId);
                        if (!victimId) break;
                        delete next[victimId];
                        nextOrder = nextOrder.filter(editorId => editorId !== victimId);
                    }
                    editorOrderRef.current = nextOrder;
                    editorsRef.current = next;
                    return next;
                });
                setTimeout(() => {
                    // no-op
                }, 0);
            },
            removeInstance: (id: string) => {
                setEditors(prev => {
                    const next = { ...prev };
                    delete next[id];
                    editorOrderRef.current = editorOrderRef.current.filter(editorId => editorId !== id);
                    return next;
                });
            },
            applyOutputTo: (id: string, output: string, mode: "edit" | "suggest") => {
                setEditors(prev => {
                    const editor = prev[id];
                    if (editor && editor.methods) {
                        if (mode === "edit" && typeof editor.methods.insertMarkdownAtEnd === "function") {
                            editor.methods.insertMarkdownAtEnd(output);
                        } else if (mode === "suggest" && typeof editor.methods.setMarkdown === "function") {
                            editor.methods.setMarkdown(output);
                        }
                    }
                    return prev;
                });
            },
            applyStructuredOpsTo: (id: string, ops: Array<{ action?: string; type?: string; start?: number; end?: number; text?: string; content?: string }>) => {
                setEditors(prev => {
                    const editor = prev[id];
                    if (editor && editor.methods && typeof editor.methods.applyStructuredOps === "function") {
                        editor.methods.applyStructuredOps(ops);
                    }
                    return prev;
                });
            }
        };

        // Initialize default editor (only if no activeId is set yet)
        setEditors(prev => {
            if (Object.keys(prev).length === 0) {
                return { 'default': { id: 'default', content: '' } };
            }
            return prev;
        });
        setActiveId(prev => prev || 'default');

        // Expose the API to the window as expected by index.html
        (window as any).GoToolkitMemoEditorReady = Promise.resolve(api);
        (window as any).GoToolkitMemoInstance = api;
    }, [applyProgrammaticContent, suppressProgrammaticChange]);

    // Update global methods whenever active instance changes
    useEffect(() => {
        editorsRef.current = editors;
    }, [editors]);

    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    useEffect(() => {
        const methods = editors[activeId]?.methods;
        if (methods) {
            activeInstanceRef.current = methods;
            (window as any).MemoEditor = methods.instance;
            (window as any).memoEditor = methods.instance;
            (window as any).getEditorMarkdown = methods.getMarkdown;
            (window as any).setEditorMarkdown = methods.setMarkdown;
            (window as any).insertEditorMarkdownAtRange = methods.insertMarkdownAtRange;
            (window as any).insertEditorMarkdownAtEnd = methods.insertMarkdownAtEnd;
            (window as any).applyEditorStructuredOps = methods.applyStructuredOps;
            (window as any).getMemoEditorSource = methods.getSource;
            (window as any).exportMemoToDocx = methods.exportDocx;
        }
    }, [activeId, editors]);

    return (
        <div className="memo-card">
            <div className="editor-wrap">
                {Object.values(editors).map((editor) => (
                    <EditorItem 
                        key={editor.id}
                        editor={editor}
                        activeId={activeId}
                        onEditorChange={handleEditorChange}
                        handleEditorReady={handleEditorReady}
                    />
                ))}
            </div>
        </div>
    );
};

const container = document.getElementById('app');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
