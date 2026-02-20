# GoToolkit contributor cheat sheet (concise)

## Structure
- Static HTML modules in `public/`.
- Workers live in `workers/` (OpenAI proxy, OpenRouter proxy, sharing, feedback, AssemblyAI, Notion proxy, YouTube proxy, Gmail proxy, Microsoft proxy, Google TTS proxy).

## Navigation + cache
- `public/index.html` links: `grid.html` and `docs.html`.
- Version format: `YYYY.MM.DD.N` (N is an increment number for the day).
- **Bump the version systematically ONLY when the user asks for a "bump", "commit", or "push".**
- **Automated Versioning**: Run `npm run bump` to automatically increment the version in `package.json`, update cache-busters `?v=...` in HTML files, and update version labels.
- **Commits and Push**: When asked to "commit" or "push", always run `npm run bump` first, then commit with a descriptive message and push. If multiple changes were made, provide a detailed bulleted list in the commit description (e.g., `git commit -m "title" -m "detailed list of changes"`).
- **Shortcut**: Treat user request `bump` as `bump commit push` (run `npm run bump`, commit, then push).
- **Commit title format**: Use `v2026.xx.xx.xx : <summary>` with a summary under 15 words.
- **Manual Bumping checklist** (if `npm run bump` is not used):
  1. Increment `version` in `package.json`.
  2. Search and replace all `?v=...` cache-busters in `public/index.html`, `public/docs.html`, and `public/grid.html`.
  3. Update the version label in `public/index.html` (`hero-version`), `public/docs.html` (info panel), and `public/grid.html` (info panel).
  4. Sync version in `AGENTS.md` example.
- `public/prompt.js` is the root for all AI system prompts and templates.
- Keep the IndexedDB version in `public/js/assist.js` health-check/repair (`indexedDB.open`) aligned with `DB_VERSION` in `public/js/document-rag.js`.
- When adding/editing UI, reuse colors and classes from `public/styles/style.css` before adding new CSS.
- Each page sets `window.GO_TOOLKIT_SHARE_API_URL` to `https://share.gotoolkit.workers.dev/`.

## Modules
- **Docs** (`memos`): Rich-text editor + RAG-powered chat (`public/js/assist.js`); document management, context embeddings per memo.
- **Grid** (`grids`): AG Grid, CSV/JSON export, template/criteria modal `public/js/template-criteria.js`, covered by Playwright.
- **Templates**: System for sharing and reusing memo structures via `template-memos`.
- **Voice** (`public/js/voice.js`, `public/js/voice-video-player.js`): audio/video capture (mic/webcam/screen), transcript sync, YouTube publish flow, and video exports.
  - Export formats: GIF and MP4 in the video modal (`gifenc` + `@ffmpeg/ffmpeg` in-browser pipeline).
  - Recording format remains browser-native (`video/webm`), with MP4 generated at export time.

## Globals (keep stable)
Only `public/js` may touch `window`:
`GoToolkitIAConfig`, `GoToolkitAIBackend`, `GoToolkitIAClient.chatCompletion`, `GoToolkitIA.chatCompletion`, `GoToolkitOpenAI`, `GoToolkitWebLLM`, `GoToolkitExcalidraw`, `goToolkitNexusModal`, `goToolkitDocStore`, `goToolkitDocumentApi`, `goToolkitShareHistory`, `goToolkitShareWorker`, `GoToolkitDocumentManager`.

## AI + storage
- `public/js/ia-config.js`: OpenAI / OpenRouter config + endpoints (direct + `https://openai.gotoolkit.workers.dev`). 
- `public/js/ia-client.js`: stream normalization + backend routing.
- `public/js/document-storage.js`: IndexedDB `go-toolkit` (stores `document-api`, `share-history`, `documents-settings`) + shared store wrappers.
- **RAG System** (`public/js/document-rag.js`): vector search + semantic retrieval via `GoToolkitDocumentManager`. See **[RAG Architecture](public/content/toolkit_import.md)**.
  - IndexedDB stores: `documents` (file metadata + chunking config), `chunks` (384-dim embeddings), `keyword_meta` (hybrid search), `memo_context_embeddings` (memo-scoped links + enabled flag).
  - Model: Transformers.js on-device embedding (Xenova/all-MiniLM-L6-v2, 384 dims), cached via IndexedDB to avoid re-compute.
  - Formats: 12 supported (PDF, DOCX, PPTX, XLSX, JSON, CSV, TSV, TXT, MD, ODF, RTF, logs). Format-specific extraction + chunking strategies.
  - Ingestion: file deduplication (fileHash), heuristic chunking (small/medium by format), batch embedding, sharding by docId for per-file stats + deletion.
  - Retrieval: `vectorSearch()` embeds query → cosine similarity scoring → min-score filtering (0.1) → top-K (10). Fallback: `searchKeywordCandidates()` pre-filtering.
  - Text recognition: optional OpenCV preprocessing; Qwen vision via OpenRouter.
  - Voice recognition: AssemblyAI proxy for media transcription; imported media stores transcript text only.
- **AI Defaults**: use `openai/gpt-oss-120b` and temperature `0.3` for new AI prompts unless specified otherwise.

## Sharing
- `public/js/share-worker-client.js` builds URLs from `GO_TOOLKIT_SHARE_API_URL(S)`.
- `workers/share-proxy`: Cloudflare Worker → Firestore (Read/Write) + KV (Rate Limit).
- Collections: `memos` (document sharing), `grids` (grid sharing), `template-memos` (reusable document templates).
- Template system: Allows saving and loading memo structures as templates via the `template-memos` collection.
- Local history: `public/js/share-history.js`; documents: `public/js/document-api.js`.
- `workers/feedback-proxy` also stores uploaded feedback media in R2 (`FEEDBACK_MEDIA_BUCKET`) and serves files via `/v1/media/:id`.

## Build + runtime
- Build: `npm install` → `npm run build`. This runs drawing and memo bundles in parallel using `esbuild`. 
- Production: Build is automated via GitHub Actions (`npm run build:prod`). Local result files are ignored by Git. 
- Heavy Libraries: React, ReactDOM, Excalidraw, and Mermaid are loaded via CDN (see `docs.html`).
- Shims: Build aliases in `package.json` map module imports (e.g., `react`, `react-dom`, `excalidraw`, `mermaid`) to `window` globals via `src/*-shim.ts` files (react-shim, react-dom-shim, etc.) to keep bundles small and fast.
- Dev: `npm start` serves `public/` on port 5000.
- Excalidraw bridge: `src/draw-editor/index.tsx` forces light theme, normalizes Mermaid, exposes `window.GoToolkitExcalidraw`.
- Docs bridge: `src/memo-bridge/index.tsx` exposes the Docs editor API to `window`.
- When modifying memo-editor (memo) or draw-editor (connect), run an npm build for the corresponding component after changes.
- **Playwright (WSL anti-hang)**:
  - If Playwright hangs on startup in WSL (`playwright --version` or tests), run tests from Linux FS (e.g. `~/work/gotoolkit`), not `/mnt/c/...`.
  - Sync repo to Linux FS: `rsync -a --delete --exclude node_modules --exclude .git /mnt/c/Users/<you>/Documents/Github/gotoolkit/ ~/work/gotoolkit/`
  - Install deps in Linux FS copy: `cd ~/work/gotoolkit && npm ci`
  - Run Playwright with local binary (avoid `npx`): `./node_modules/.bin/playwright test <spec> --workers=1 --reporter=line`
  - Keep server startup simple: `npm start` should use `serve` directly (no `npx serve ...`) to avoid WSL process stalls.

## Workers env
- `workers/openai-proxy`: `OPENAI_API_KEY` + KV `RATE_LIMIT`.
- `workers/share-proxy`: `FIREBASE_SERVICE_ACCOUNT`, optional `FIREBASE_PROJECT_ID`, `SHARE_ALLOWED_ORIGINS`, KV `RATE_LIMIT`.
- `workers/feedback-proxy`: `FIREBASE_SERVICE_ACCOUNT`, optional `FIREBASE_PROJECT_ID`, `SHARE_ALLOWED_ORIGINS`, optional `ADMIN_TOKEN`, KV `RATE_LIMIT`, and R2 binding `FEEDBACK_MEDIA_BUCKET`.
- `workers/assemblyai-proxy`: forwards streaming token; browser sends `X-AssemblyAI-Key` (no secret stored).
- `workers/openrouter-proxy`: `OPENROUTER_API_KEY` for fallback LLM routing.
- `workers/notion-proxy`: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, optional `NOTION_ALLOWED_ORIGINS`, KV `NOTION_OAUTH` (stores OAuth tokens/workspace selection per device).
- `workers/youtube-proxy`: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, optional `YOUTUBE_ALLOWED_ORIGINS`, KV `YOUTUBE_OAUTH` (stores OAuth tokens/channel selection per device).
- `workers/gmail-proxy`: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, optional `GMAIL_ALLOWED_ORIGINS`, KV `GMAIL_OAUTH` (stores OAuth tokens per device).
- `workers/ms-proxy`: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, optional `MICROSOFT_ALLOWED_ORIGINS`, KV `MICROSOFT_OAUTH` (stores OAuth tokens/account selection per device).

## Debug + docs
- Inspect `window.GoToolkit*`; local state in `localStorage` (`go-toolkit-*`) and IndexedDB (`go-toolkit`, `gotoolkit-documents`).
- RAG state: IndexedDB stores `documents`, `chunks`, `memo_context_embeddings` (see `public/content/toolkit_import.md` for schema).
- Assist state: `window.GoToolkitAssistInstance` exposes sidebar + chat API.
- OAuth browser hooks: `public/js/config-modal.js` + `public/js/youtube-publish.js` orchestrate device-scoped OAuth start/callback/logout for Notion, YouTube, Gmail, and Microsoft.
- Voice video export cache is persisted per recording (`videoExportCache`) and reused by `VoiceVideoPlayerModal`.
- Do not edit `public/content/index_releases.md` or `public/content/index_roadmap.md` unless explicitly asked.
- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
