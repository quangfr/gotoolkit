import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleEditor } from '@/memo-editor';
import { exportEditorToDocx } from '@/memo-editor/docx-export';
import { EditorState } from '@tiptap/pm/state';

console.warn('!!! MEMO BRIDGE JS EXECUTED !!!');

// Bridge to maintain compatibility with memo.html
interface MemoEditorApi {
    setValue: (content: string) => void;
    getValue: () => string;
    onChange: (callback: (content: string, id?: string) => void) => void;
    exportDocx: (title?: string) => Promise<Blob | null>;
    getEditorState: () => any;
    setEditorState: (state: any) => void;
    switchTo: (id: string, initialContent?: string) => void;
    removeInstance: (id: string) => void;
}

interface EditorInstance {
    id: string;
    content: string;
    methods?: any;
}

const EditorItem = React.memo(({ editor, activeId, onChangeCb, handleEditorReady }: any) => {
    // Stable onReady for this specific editor ID
    const onReady = React.useCallback((methods: any) => {
        handleEditorReady(editor.id, methods);
    }, [editor.id, handleEditorReady]);

    const onChange = React.useCallback((newContent: string, id?: string) => {
        if (onChangeCb) onChangeCb(newContent, id);
    }, [onChangeCb]);

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
    const [editors, setEditors] = useState<Record<string, EditorInstance>>({});
    const [activeId, setActiveId] = useState<string>('');
    const [onChangeCb, setOnChangeCb] = useState<((content: string, id?: string) => void) | null>(null);

    // Track active instance for global functions
    const activeInstanceRef = React.useRef<any>(null);

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

    useEffect(() => {
        const api: MemoEditorApi = {
            setValue: (newContent: string) => {
                const methods = activeInstanceRef.current;
                const contentLength = newContent?.length || 0;
                console.log(`[MemoBridge] setValue called, length: ${contentLength}`);
                const start = performance.now();
                if (methods?.instance) {
                    methods.instance.commands.setContent(newContent);
                } else if ((window as any).MemoEditor) {
                    (window as any).MemoEditor.commands.setContent(newContent);
                }
                const duration = Math.round(performance.now() - start);
                if (duration > 100) {
                   console.warn(`[MemoBridge] setContent took ${duration}ms for ${contentLength} chars`);
                }
            },
            getValue: () => {
                const editor = activeInstanceRef.current?.instance || (window as any).MemoEditor;
                if (editor && typeof editor.getHTML === 'function') {
                    return editor.getHTML();
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
            switchTo: (id: string, initialContent?: string) => {
                const start = performance.now();
                console.log(`[MemoBridge] switching to ${id}`);
                setActiveId(id);
                setEditors(prev => {
                    if (prev[id]) return prev;
                    return {
                        ...prev,
                        [id]: { id, content: initialContent || '' }
                    };
                });
                setTimeout(() => {
                    console.log(`[MemoBridge] switched to ${id} in ${Math.round(performance.now() - start)}ms`);
                }, 0);
            },
            removeInstance: (id: string) => {
                setEditors(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
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

        // Expose the API to the window as expected by memo.html
        (window as any).GoToolkitMemoEditorReady = Promise.resolve(api);
        (window as any).GoToolkitMemoInstance = api;
    }, []);

    // Update global methods whenever active instance changes
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
                        onChangeCb={onChangeCb}
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
