(() => {
    const STORAGE_KEY = "goToolkit.memo.editorjs";
    const editorRoot = document.getElementById("editor");

    if (!editorRoot || typeof window.EditorJS === "undefined") return;

    const editor = new window.EditorJS({
        holderId: "editor",
        autofocus: true,
        placeholder: "Write something…",
        defaultBlock: "paragraph",
        onChange: async () => {
            try {
                const output = await editor.save();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(output));
            } catch (err) {
                console.warn("Memo editor change sync failed", err);
            }
        }
    });

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

    const readyPromise = editor.isReady
        .then(async () => {
            await loadFromStorage();
            return {
                async save() {
                    const output = await editor.save();
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(output));
                    return output;
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
