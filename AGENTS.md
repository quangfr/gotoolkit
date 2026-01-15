# GoToolkit contributor cheat sheet (concise)

## Structure
- Static HTML modules in `public/`;
- Workers live in `workers/` (OpenAI proxy, sharing, feedback, AssemblyAI, OpenRouter proxy).

## Navigation + cache
- `public/index.html` links: `grid.html` and `memo.html`.
- All module links include `?v=2026.01.16.4`; bump everywhere when assets change.
- **Bump the version only when explicitly asked to commit and sync on GitHub.**
- `public/prompt.js` is the root for all AI system prompts and templates.
- All info panel versions should be updated to match the asset version whenever cache-busters are bumped.
- Always update the `hero-version` label in `public/index.html` to match the cache-buster version.
- When bumping versions, ensure all js and css assets in `memo.html` are updated.
- **Deprecated modules in `public/old/` should not be updated (no version bumps, no UI changes).**
- Keep the IndexedDB version in `public/js/assist.js` health-check/repair (`indexedDB.open`) aligned with `DB_VERSION` in `public/js/document-rag.js`.
- When adding and editing UI, reuse colors, similar classes from the `public/styles/style.css` as much as possible before adding new CSS.
- Each page sets `window.GO_TOOLKIT_SHARE_API_URL`: launcher `https://gotoolkit.workers.dev`, modules `https://share.gotoolkit.workers.dev/`.

## Modules
- **Memo** (`memos`): Rich-text editor + RAG-powered chat (assist.js); document management, context embeddings per memo.
- Grid (`grids`): AG Grid, CSV/JSON export, template/criteria modal `public/js/template-criteria.js`, covered by Playwright.
- Canvas (`slides`). Deprecated.
- Draw (`diagrams`): Deprecated.
- Timeline (`timelines`). Deprecated.
- Voice (`voices`). Deprecated.


## Globals (keep stable)
Only `public/js` may touch `window`:
`GoToolkitIAConfig`, `GoToolkitAIBackend`, `GoToolkitIAClient.chatCompletion`, `GoToolkitIA.chatCompletion`, `GoToolkitOpenAI`, `GoToolkitWebLLM`, `GoToolkitExcalidraw`, `goToolkitNexusModal`, `goToolkitDocStore`, `goToolkitDocumentApi`, `goToolkitShareHistory`, `goToolkitShareWorker`, `GoToolkitDocumentManager`.

## AI + storage
- `public/js/ia-config.js`: OpenAI/Ollama/WebLLM config + endpoints (direct + `https://openai.gotoolkit.workers.dev`). Ollama and WebLLM deprecated.
- `public/js/ia-client.js`: stream normalization + backend routing; WebLLM workers in `public/js/webllm-worker.js` / `public/js/webllm-sw.js`.
- `public/js/document-storage.js`: IndexedDB `go-toolkit` (stores `document-api`, `share-history`, `documents-settings`) + shared store wrappers.
- **RAG System** (`public/js/document-rag.js`): Vector search + semantic retrieval via `GoToolkitDocumentManager`. See **[RAG Architecture](public/content/toolkit_import.md)** - for more info on design, chunking strategies, retrieval flow. 
  - IndexedDB stores: `documents` (file metadata + chunking config), `chunks` (384-dim embeddings), `keyword_meta` (hybrid search), `memo_context_embeddings` (memo-scoped links + enabled flag).
  - Model: Transformers.js on-device embedding (Xenova/all-MiniLM-L6-v2, 384 dims), cached via IndexedDB to avoid re-compute.
  - Formats: 12 supported (PDF, DOCX, PPTX, XLSX, JSON, CSV, TSV, TXT, MD, ODF, RTF, logs). Format-specific extraction + chunking strategies.
  - Ingestion: File deduplication (fileHash), heuristic chunking (small/medium based on format), batch embedding, sharding by docId for per-file stats + deletion.
  - Retrieval: `vectorSearch()` embeds query → cosine similarity scoring → min-score filtering (0.1) → top-K (10). Fallback: `searchKeywordCandidates()` for pre-filtering.
  - Text recognition: Optional OpenCV preprocessing; Qwen vision via OpenRouter.
  - Voice recognition: AssemblyAI proxy for media transcription; imported media stores transcript text only.
- **AI Defaults**: By default, use `openai/gpt-oss-120b` and temperature `0.3` for any new AI prompt unless specified otherwise.

## Sharing
- `public/js/share-worker-client.js` builds URLs from `GO_TOOLKIT_SHARE_API_URL(S)`.
- `workers/share-proxy`: Firestore + KV `RATE_LIMIT`; allowed collections `slides`, `timelines`, `diagrams`, `grids`, `voices`, `memos`.
- Local history: `public/js/share-history.js`; documents: `public/js/document-api.js`.

## Build + runtime
- Build: `npm install` → `npm run build` (bundles draw editor + memo bridge).
- Dev: `npm start` serves `public/` on port 5000.
- Excalidraw bridge: `src/draw-editor/index.tsx` forces light theme, normalizes Mermaid, exposes `window.GoToolkitExcalidraw`.
- Memo bridge: `src/memo-bridge/index.tsx` exposes memo API to `window`.

## Workers env
- `workers/openai-proxy`: `OPENAI_API_KEY` + KV `RATE_LIMIT`.
- `workers/share-proxy`: `FIREBASE_SERVICE_ACCOUNT`, optional `FIREBASE_PROJECT_ID`, `SHARE_ALLOWED_ORIGINS`, KV `RATE_LIMIT`.
- `workers/feedback-proxy`: same secrets as share.
- `workers/assemblyai-proxy`: forwards streaming token; browser sends `X-AssemblyAI-Key` (no secret stored).
- `workers/openrouter-proxy`: `OPENROUTER_API_KEY` for fallback LLM routing.

## Debug + docs
- Inspect `window.GoToolkit*`; local state in `localStorage` (`go-toolkit-*`) and IndexedDB (`go-toolkit`, `gotoolkit-documents`).
- RAG state: IndexedDB stores `documents`, `chunks`, `memo_context_embeddings` (see `public/content/toolkit_import.md` for schema).
- Assist state: `window.GoToolkitAssistInstance` exposes sidebar + chat API.
- New module steps: `CONTRIBUTE.md`.
- Do not edit `public/content/index_releases.md` or `public/content/index_roadmap.md` unless explicitly asked.
- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
