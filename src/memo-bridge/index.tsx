import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleEditor } from '@/memo-editor';
import { exportEditorToDocx } from '@/memo-editor/docx-export';
import { EditorState } from '@tiptap/pm/state';

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

const App = () => {
    const [editors, setEditors] = useState<Record<string, EditorInstance>>({});
    const [activeId, setActiveId] = useState<string>('default');
    const [onChangeCb, setOnChangeCb] = useState<((content: string, id?: string) => void) | null>(null);

    // Track active instance for global functions
    const activeInstanceRef = React.useRef<any>(null);

    useEffect(() => {
        const api: MemoEditorApi = {
            setValue: (newContent: string) => {
                const methods = activeInstanceRef.current;
                if (methods?.instance) {
                    methods.instance.commands.setContent(newContent);
                } else if ((window as any).MemoEditor) {
                    (window as any).MemoEditor.commands.setContent(newContent);
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
                setActiveId(id);
                setEditors(prev => {
                    if (prev[id]) return prev;
                    return {
                        ...prev,
                        [id]: { id, content: initialContent || '' }
                    };
                });
            },
            removeInstance: (id: string) => {
                setEditors(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            }
        };

        // Initialize default editor
        setEditors({ 'default': { id: 'default', content: '' } });

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
        }
    }, [activeId, editors]);

    return (
        <div className="memo-card">
            <div className="editor-wrap">
                {Object.values(editors).map((editor) => (
                    <div 
                        key={editor.id} 
                        style={{ display: editor.id === activeId ? 'block' : 'none', height: '100%' }}
                    >
                        <SimpleEditor 
                            editorId={editor.id}
                            content={editor.content}
                            onChange={(newContent, id) => {
                                if (onChangeCb) onChangeCb(newContent, id);
                            }}
                            onReady={(methods) => {
                                setEditors(prev => ({
                                    ...prev,
                                    [editor.id]: { ...prev[editor.id], methods }
                                }));
                            }}
                        />
                    </div>
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
