import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleEditor } from '@/memo-editor';
import { exportEditorToDocx } from '@/memo-editor/docx-export';
import { EditorState } from '@tiptap/pm/state';

// Bridge to maintain compatibility with memo.html
interface MemoEditorApi {
    setValue: (content: string) => void;
    getValue: () => string;
    onChange: (callback: (content: string) => void) => void;
    exportDocx: (title?: string) => Promise<Blob | null>;
    getEditorState: () => any;
    setEditorState: (state: any) => void;
}

const App = () => {
    const [content, setContent] = useState('');
    const [onChangeCb, setOnChangeCb] = useState<((content: string) => void) | null>(null);
    const editorRef = React.useRef<any>(null);

    useEffect(() => {
        const api: MemoEditorApi = {
            setValue: (newContent: string) => {
                // This is a bit tricky with the current SimpleEditor implementation
                // We'll need to expose the editor instance
                if ((window as any).MemoEditor) {
                    (window as any).MemoEditor.commands.setContent(newContent);
                }
            },
            getValue: () => {
                const editor = (window as any).MemoEditor;
                if (editor && typeof editor.getHTML === 'function') {
                    return editor.getHTML();
                }
                return '';
            },
            onChange: (callback: (content: string) => void) => {
                setOnChangeCb(() => callback);
            },
            exportDocx: async (title?: string) => {
                const editor = (window as any).MemoEditor;
                if (editor) {
                    return await exportEditorToDocx(editor, title);
                }
                return null;
            },
            getEditorState: () => {
                try {
                    const editor = (window as any).MemoEditor;
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
                    const editor = (window as any).MemoEditor;
                    if (!editor?.view?.updateState || !state) return;
                    const nextState = EditorState.fromJSON(editor.state.schema, state, editor.state.plugins);
                    editor.view.updateState(nextState);
                } catch (err) {
                    console.warn('setEditorState failed', err);
                }
            }
        };

        // Expose the API to the window as expected by memo.html
        (window as any).GoToolkitMemoEditorReady = Promise.resolve(api);
        (window as any).GoToolkitMemoInstance = api;
    }, []);

    return (
        <div className="memo-card">
            <div className="editor-wrap">
                <SimpleEditor 
                    content={content}
                    onChange={(newContent) => {
                        if (onChangeCb) onChangeCb(newContent);
                    }}
                />
            </div>
        </div>
    );
};

const container = document.getElementById('app');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
