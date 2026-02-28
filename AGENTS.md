# GoToolkit contributor cheat sheet (concise)

## Structure
- Static HTML modules in `public/`.
- Workers live in `workers/` (OpenRouter proxy, sharing, feedback, AssemblyAI, Notion proxy, YouTube proxy, Gmail proxy, Microsoft proxy, Google TTS proxy).

## Navigation + cache
- `public/index.html` is the Docs app entry point.
- Version format: `YYYY.MM.DD.N` (N is an increment number for the day).
- **Bump the version systematically ONLY when the user asks for a "bump", "commit", or "push".**
- **Automated Versioning**: Run `npm run bump` to automatically increment the version in `package.json`, update cache-busters `?v=...` in HTML files, and update version labels.
- **Commits and Push**: When asked to "commit" or "push", always run `npm run bump` first, then commit with a descriptive message and push. If multiple changes were made, provide a detailed bulleted list in the commit description (e.g., `git commit -m "title" -m "detailed list of changes"`)
- **Commit title format**: Use `v2026.xx.xx.xx : <summary>` with a summary under 15 words.
- **Manual Bumping checklist** (if `npm run bump` is not used):
  1. Increment `version` in `package.json`.
  2. Search and replace all `?v=...` cache-busters in `public/index.html` and `public/grid.html`.
  3. Update the version label in `public/index.html` (`hero-version`) and `public/grid.html` (info panel).
  4. Verify version labels and cache-busters are consistent across touched pages.
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
- `public/js/ia-config.js`: OpenRouter config + endpoints (direct + `https://openrouter.gotoolkit.workers.dev`). 
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
- Production: Build is automated via GitHub Actions (`npm run build:prod`). Local build outputs in `public/js` may still appear in Git status depending on changes.
- For Wrangler/Cloudflare commands in this repo, run them through `scripts/with-env-local.sh` so `CLOUDFLARE_API_TOKEN` from `.env.local` is exported in non-interactive shells. Example: `scripts/with-env-local.sh npx wrangler secret put OPENROUTER_API_KEY`.
- CSP guardrail: when editing CSP in `firebase.json` or any HTML `<meta http-equiv="Content-Security-Policy">`, run `npm run check:csp` and keep Hosting headers aligned with the canonical app CSP used by the HTML entry points.
- Heavy Libraries: React, ReactDOM, Excalidraw, and Mermaid are loaded via CDN (see `index.html`).
- Shims: Build aliases in `package.json` map module imports (e.g., `react`, `react-dom`, `excalidraw`, `mermaid`) to `window` globals via `src/*-shim.ts` files (react-shim, react-dom-shim, etc.) to keep bundles small and fast.
- Dev: `npm start` serves `public/` on port 5000.
- Excalidraw bridge: `src/draw-editor/index.tsx` forces light theme, normalizes Mermaid, exposes `window.GoToolkitExcalidraw`.
- Docs bridge: `src/memo-bridge/index.tsx` exposes the Docs editor API to `window`.
- When modifying memo-editor (memo) or draw-editor (connect), run an npm build for the corresponding component after changes.
- Build scope rule: do not run `build:connect`/draw build unless draw-related `src/` files changed, and do not run `build:memo` unless memo-related `src/` files changed. Prefer targeted builds over full `npm run build` when only one side changed.
- **Playwright (generic workflow for all tests)**:
  - Pre-run the server when possible (`npm run start:test` preferred, `npm start` acceptable). `playwright.config.ts` uses `reuseExistingServer: true`, so Playwright will attach to an existing server instead of waiting for boot.
  - Use the cache-friendly test server profile for Playwright (`start:test`), which serves JS/CSS with cache headers to reduce cold-start load time across repeated runs.
  - Run Playwright with the local binary (avoid `npx`): `./node_modules/.bin/playwright test <spec> --workers=1 --reporter=line`.
  - Prefer browser persistency for iterative/local debugging: launch tests with a stable `userDataDir` (`chromium.launchPersistentContext`) so cookies, localStorage, and login sessions survive between runs.
  - Keep persistent profile data under repo-local temp storage (example: `.tmp/playwright-profile`) and reuse it across reruns; delete it only when you need a clean-state verification.
  - For suite runs, combine persistency with `--workers=1` to prevent profile contention and avoid repeated browser cold starts.
  - When authentication is needed, capture once and reuse (`storageState`) rather than logging in per test.
  - Navigate directly to the target page in tests (avoid redirect shims when possible) to reduce startup roundtrips.
  - On WSL, prefer running from native Linux FS (e.g. `~/work/gotoolkit`) rather than `/mnt/c/...`:
    - `rsync -a --delete --exclude node_modules --exclude .git /mnt/c/Users/<you>/Documents/Github/gotoolkit/ ~/work/gotoolkit/`
    - `cd ~/work/gotoolkit && npm ci`
  - If Playwright MCP fails with missing Chrome channel (`browserType.launchPersistentContext: Chromium distribution 'chrome' is not found`), install Chromium: `npx playwright install chromium`.
  - If MCP browser tools still fail/time out, run Playwright directly with Node scripts (`require("playwright")`) using `chromium.launch()` for page flows or `request.newContext()` for API timing checks.

## MCP + Troubleshooting
- **Debug playbook (always follow order)**:
  1. Reproduce with exact page/action and capture timestamp.
  2. Collect evidence (`console`, network request, worker response, local storage/IndexedDB state).
  3. Isolate layer (UI vs client store vs worker vs external API).
  4. Fix smallest surface first.
  5. Verify with a clean state + one regression check.
- **MCP fallback ladder**:
  1. Use MCP tool first.
  2. If MCP fails/timeouts, use local CLI equivalent.
  3. If still unclear, use direct API checks (`curl` or Playwright `request.newContext()`).
  4. Use manual browser flow last.
- **Known failure signatures**:
  - `browserType.launchPersistentContext ... chrome not found` → run `npx playwright install chromium` and use local Node Playwright script.
  - `TypeError: Failed to fetch` from share client → verify worker reachability with `curl https://share.gotoolkit.workers.dev/...`.
  - Shared tree appears stale after move → verify remote `parentId/spaceId/updatedAt`, then run space refresh.
  - When checking whether a file exists in a cloud space, inspect the share tree metadata first (`view=tree`) and verify the file `id` plus `parentId`, `spaceId`, and `updatedAt`.
- **Cloud share fetch order**:
  1. Authenticate the space with `POST /v1/spaces/auth` using `spaceId` + `spaceCode`.
  2. Reuse the returned `X-Space-Auth` token with `X-Space-Id` and sync headers (`X-Sync-Session`, `X-Sync-JTI`, `X-Sync-TS`). `/v1/spaces/auth` now also returns a stable per-space `contentKey` for local page/media encryption and decryption.
  3. Check `pages?view=tree&spaceId=...` first to confirm the page id and inspect tree metadata.
  4. Check `pages-meta/:id` next for title/description/icon/parent/status metadata.
  5. Fetch `pages/:id` last for content; payloads in `pages` may be encrypted (`gtke=1`, AES-GCM) and must be decrypted locally with the auth-returned `contentKey`, not the `spaceCode`.
- **Context7 usage**:
  - Use Context7 for external library/API behavior and setup.
  - Prefer local code inspection for repo-specific behavior and regressions.

## Workers smoke checks
- After worker changes, run a minimal smoke pass:
  1. Basic endpoint responds (2xx/expected 4xx).
  2. CORS headers present for browser-facing routes.
  3. Auth/env-dependent path behaves with missing and valid config.
  4. Rate limiter path returns expected error format.
  5. R2/KV bindings touched by change can read/write.

## Quick diagnostics
- `git status --short`
- `rg -n "<feature|error|token>" public workers -S`
- `npm run check:csp`
- `node --check <touched-js-file>`
- `curl -i https://share.gotoolkit.workers.dev/v1/shares/memos?view=tree\\&spaceId=golive`
- `curl -i https://share.gotoolkit.workers.dev/v1/shares/pages?view=tree\\&spaceId=golive`
- `curl -i -H 'Origin: https://gotoolkit.fr' -H 'Content-Type: application/json' -d '{"spaceId":"golive","spaceCode":"<code>"}' https://share.gotoolkit.workers.dev/v1/spaces/auth`
  Response includes `token`, `expiresAt`, and `contentKey` for local decrypt/encrypt.
- `curl -i -H 'Origin: https://gotoolkit.fr' -H 'X-Space-Id: golive' -H 'X-Space-Auth: <token>' -H 'X-Sync-Session: <session>' -H 'X-Sync-JTI: <jti>' -H 'X-Sync-TS: <ts>' 'https://share.gotoolkit.workers.dev/v1/shares/pages-meta/<id>'`
- `curl -i -H 'Origin: https://gotoolkit.fr' -H 'X-Space-Id: golive' -H 'X-Space-Auth: <token>' -H 'X-Sync-Session: <session>' -H 'X-Sync-JTI: <jti>' -H 'X-Sync-TS: <ts>' 'https://share.gotoolkit.workers.dev/v1/shares/pages/<id>'`
- Playwright API timing (when UI MCP is flaky): use `require(\"playwright\").request.newContext()`.

## Workers env
- `workers/share-proxy`: `FIREBASE_SERVICE_ACCOUNT`, optional `FIREBASE_PROJECT_ID`, `SHARE_ALLOWED_ORIGINS`, Rate Limiter binding `MY_RATE_LIMITER`, and R2 binding `SHARE_MEDIA_BUCKET`.
- `workers/feedback-proxy`: `FIREBASE_SERVICE_ACCOUNT`, optional `FIREBASE_PROJECT_ID`, `SHARE_ALLOWED_ORIGINS`, optional `ADMIN_TOKEN`, Rate Limiter binding `MY_RATE_LIMITER`, and R2 binding `FEEDBACK_MEDIA_BUCKET`.
- `workers/assemblyai-proxy`: forwards streaming token; browser sends `X-AssemblyAI-Key` (no secret stored) + Rate Limiter binding `MY_RATE_LIMITER`.
- `workers/openrouter-proxy`: `OPENROUTER_API_KEY` for fallback LLM routing.
- `workers/googletts-proxy`: `GOOGLE_TTS_API_KEY`, optional OAuth vars for service-account/token fallback, KV `USAGE_KV`, and Rate Limiter binding `MY_RATE_LIMITER`.
- `workers/notion-proxy`: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, optional `NOTION_ALLOWED_ORIGINS`, KV `NOTION_OAUTH` (stores OAuth tokens/workspace selection per device).
- `workers/youtube-proxy`: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, optional `YOUTUBE_ALLOWED_ORIGINS`, KV `YOUTUBE_OAUTH` (stores OAuth tokens/channel selection per device).
- `workers/gmail-proxy`: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, optional `GMAIL_ALLOWED_ORIGINS`, KV `GMAIL_OAUTH` (stores OAuth tokens per device).
- `workers/ms-proxy`: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, optional `MICROSOFT_ALLOWED_ORIGINS`, KV `MICROSOFT_OAUTH` (stores OAuth tokens/account selection per device).

## Debug + docs
- Inspect `window.GoToolkit*`; local state in `localStorage` (`go-toolkit-*`) and IndexedDB (`go-toolkit`, `gotoolkit-documents`).
- RAG state: IndexedDB stores `documents`, `chunks`, `memo_context_embeddings` (see `public/content/toolkit_import.md` for schema).
- Assist state: `window.GoToolkitAssistInstance` exposes sidebar + chat API.
- Private/cloud sync architecture + current Playwright coverage: `STORAGE_SYNC_PLAYWRIGHT.md`.
- OAuth browser hooks: `public/js/config-modal.js` + `public/js/youtube-publish.js` orchestrate device-scoped OAuth start/callback/logout for Notion, YouTube, Gmail, and Microsoft.
- Voice video export cache is persisted per recording (`videoExportCache`) and reused by `VoiceVideoPlayerModal`.
- Do not edit `public/content/index_releases.md` or `public/content/index_roadmap.md` unless explicitly asked.
- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
