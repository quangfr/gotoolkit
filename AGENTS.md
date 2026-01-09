# GoToolkit contributor cheat sheet (concise)

## Structure
- Static HTML modules in `public/`; only `src/draw-editor` is bundled (esbuild → `public/js/draw.bundle.js`).
- Workers live in `workers/` (OpenAI proxy, sharing, feedback, AssemblyAI).

## Navigation + cache
- `public/index.html` links: `canvas.html`, `grid.html`, `draw.html`, `timeline.html`, `voice.html`.
- All module links include `?v=2025.12.29`; bump everywhere when assets change.
- Each page sets `window.GO_TOOLKIT_SHARE_API_URL`: launcher `https://gotoolkit.workers.dev`, modules `https://share.gotoolkit.workers.dev/`.

## Modules
- Canvas (`slides`): PPTX/PNG/JSON export; templates in `public/js/prompt.js`. Deprecated.
- Grid (`grids`): AG Grid, CSV/JSON export, template/criteria modal `public/js/template-criteria.js`, covered by Playwright.
- Draw (`diagrams`): Excalidraw via `window.GoToolkitExcalidraw` (Mermaid → Excalidraw).
- Timeline (`timelines`): vis-timeline, XLSX/PNG/JSON export. Deprecated.
- Voice (`voices`): recording + STT; diarization uses participant list; shareable via `voices` collection. Deprecated.

## Globals (keep stable)
Only `public/js` may touch `window`:
`GoToolkitIAConfig`, `GoToolkitAIBackend`, `GoToolkitIAClient.chatCompletion`, `GoToolkitIA.chatCompletion`, `GoToolkitOpenAI`, `GoToolkitWebLLM`, `GoToolkitExcalidraw`, `goToolkitNexusModal`, `goToolkitDocStore`, `goToolkitCapsuleDrafts`, `goToolkitShareHistory`, `goToolkitShareWorker`.

## AI + storage
- `public/js/ia-config.js`: OpenAI/Ollama/WebLLM config + endpoints (direct + `https://openai.gotoolkit.workers.dev`). Ollama and WebLLM deprecated.
- `public/js/ia-client.js`: stream normalization + backend routing; WebLLM workers in `public/js/webllm-worker.js` / `public/js/webllm-sw.js`.
- `public/js/document-storage.js`: IndexedDB `go-toolkit` (stores `capsule-drafts`, `share-history`, `documents-settings`) + shared store wrappers.
- `public/js/document-parser.js`: `gotoolkit-documents` DB (stores `documents`, `chunks`, `keyword_meta`) via `GoToolkitDocumentManager`.

## Sharing
- `public/js/share-worker-client.js` builds URLs from `GO_TOOLKIT_SHARE_API_URL(S)`.
- `workers/share-proxy`: Firestore + KV `RATE_LIMIT`; allowed collections `slides`, `timelines`, `diagrams`, `grids`, `voices`.
- Local history: `public/js/share-history.js`; drafts: `public/js/capsule-drafts.js`.

## Build + runtime
- Build: `npm install` → `npm run build` (bundles draw editor).
- Dev: `npm start` serves `public/` on port 5000.
- Excalidraw bridge: `src/draw-editor/index.tsx` forces light theme, normalizes Mermaid, exposes `window.GoToolkitExcalidraw`.

## Workers env
- `workers/openai-proxy`: `OPENAI_API_KEY` + KV `RATE_LIMIT`.
- `workers/share-proxy`: `FIREBASE_SERVICE_ACCOUNT`, optional `FIREBASE_PROJECT_ID`, `SHARE_ALLOWED_ORIGINS`, KV `RATE_LIMIT`.
- `workers/feedback-proxy`: same secrets as share.
- `workers/assemblyai-proxy`: forwards streaming token; browser sends `X-AssemblyAI-Key` (no secret stored).

## Specs & Optimization
See [specs/README.md](specs/README.md) for performance optimization guides:
- [JSON Import Optimization](specs/JSON_IMPORT_OPTIMIZATION.md) - 8-15x speedup strategies
- [JSON Import Implementation](specs/JSON_IMPORT_OPTIMIZATION_IMPL.md) - Ready-to-apply code patches
- [RAG Indexing Strategy](specs/RAG_INDEXING_STRATEGY.md) - Hybrid vector + keyword indexing

## Debug + docs
- Inspect `window.GoToolkit*`; local state in `localStorage` (`go-toolkit-*`) and IndexedDB (`capsule-drafts`, `share-history`).
- New module steps: `CONTRIBUTE.md`.
- Do not edit `public/releases.md` or `public/roadmap.md` unless explicitly asked.
