(() => {
    const STORAGE_KEY = "goToolkit.memo.editorjs";
    const editorRoot = document.getElementById("editor");

    if (!editorRoot || typeof window.EditorJS === "undefined") return;

    async function saveData() {
        try {
            const output = await editor.save();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(output));
            return output;
        } catch (err) {
            console.warn("Memo editor save failed", err);
            return null;
        }
    }

    async function loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.blocks)) return null;
            await editor.render(data);
            return data;
        } catch (err) {
            console.warn("Memo editor load failed", err);
            return null;
        }
    }

    const tools = {
        header: {
            class: window.Header,
            inlineToolbar: true
        },
        list: {
            class: window.EditorjsList,
            inlineToolbar: true,
            config: {
                defaultStyle: "unordered"
            }
        },
        code: CodeTool,
        quote: {
            class: Quote,
            inlineToolbar: true,
            shortcut: 'CMD+SHIFT+O',
            config: {
                quotePlaceholder: 'Enter a quote',
                captionPlaceholder: 'Quote\'s author',
            },
        },
        onReady: () => {
            new Undo({ editor });
        },
        Marker: {
            class: Marker,
            shortcut: 'CMD+SHIFT+M',
        },
        quote: {
            class: Quote,
            inlineToolbar: true,
            shortcut: 'CMD+SHIFT+O',
            config: {
                quotePlaceholder: 'Enter a quote',
                captionPlaceholder: 'Quote\'s author',
            },
        },
    };

    const editor = new window.EditorJS({
        holderId: "editor",
        autofocus: true,
        placeholder: "Type / for tools…",
        defaultBlock: "paragraph",
        tools,
        onChange: async () => {
            await saveData();
        }
    });

    const readyPromise = editor.isReady
        .then(async () => {
            await loadFromStorage();
            return {
                async save() {
                    return saveData();
                },
                async load(data) {
                    if (data) {
                        await editor.render(data);
                    }
                },
                destroy() {
                    return editor.destroy();
                }
            };
        })
        .catch(err => {
            console.error("Memo editor ready failed", err);
        });

    if (!window.GoToolkitMemoEditorReady) {
        window.GoToolkitMemoEditorReady = readyPromise;
    }
})();
