import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleEditor } from '@/memo-editor';
import { exportEditorToDocx } from '@/memo-editor/docx-export';

// Bridge to maintain compatibility with memo.html
interface MemoEditorApi {
    setValue: (content: string) => void;
    onChange: (callback: (content: string) => void) => void;
    exportDocx: (title?: string) => Promise<Blob | null>;
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
            onChange: (callback: (content: string) => void) => {
                setOnChangeCb(() => callback);
            },
            exportDocx: async (title?: string) => {
                const editor = (window as any).MemoEditor;
                if (editor) {
                    return await exportEditorToDocx(editor, title);
                }
                return null;
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
