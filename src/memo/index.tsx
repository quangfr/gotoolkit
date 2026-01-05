import React, { useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleEditor } from '@/components/tiptap-templates/simple';

// Bridge to maintain compatibility with memo.html
interface MemoEditorApi {
    setValue: (content: string) => void;
    onChange: (callback: (content: string) => void) => void;
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
                if (window.MemoEditor) {
                    window.MemoEditor.commands.setContent(newContent);
                }
            },
            onChange: (callback: (content: string) => void) => {
                setOnChangeCb(() => callback);
            }
        };

        // Expose the API to the window as expected by memo.html
        (window as any).GoToolkitMemoEditorReady = Promise.resolve(api);
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
