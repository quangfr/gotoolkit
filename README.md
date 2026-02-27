# GoToolkit

Browser-first productivity toolkit for consultants. GoToolkit combines document authoring, data grid workflows, AI assistance, sharing, and voice/video capture while keeping local-first behavior for user content and settings.

## Core Apps

- `Docs` (`public/index.html`): rich text editor (Tiptap bridge), AI assist sidebar, local document library, semantic RAG over imported files, sharing/export flows.
- `Grid` (`public/grid.html`): AG Grid workspace with templates/criteria helpers, AI-assisted generation, and export capabilities.
- `Mobile` (`public/mobile.html`): narrow-screen optimized experience. `index.html` auto-redirects to this page for mobile contexts.

## Architecture

- Static frontend: `public/` (HTML/CSS/vanilla JS + bundled bridges in `public/js`).
- React bridges bundled with esbuild:
  - `src/memo-bridge/index.tsx` -> `public/js/memo.bundle.js`
  - `src/draw-editor/index.tsx` -> `public/js/draw.bundle.js`
- Cloudflare Workers in `workers/`:
  - `openrouter-proxy`
  - `share-proxy`, `feedback-proxy`
  - `assemblyai-proxy`, `googletts-proxy`
  - `notion-proxy`, `youtube-proxy`, `gmail-proxy`, `ms-proxy`

## AI + Data

- Client AI routing/config: `public/js/ia-config.js`, `public/js/ia-client.js`
- Local storage:
  - `localStorage` for user config
  - IndexedDB (`go-toolkit`, `gotoolkit-documents`) for documents, sharing history, and RAG index data
- RAG engine: `public/js/document-rag.js`
  - On-device embedding model (`Xenova/all-MiniLM-L6-v2`, 384 dims)
  - Vector + keyword retrieval
  - File ingestion/chunking for common office/text formats

## Development

### Requirements

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Start local server

```bash
npm start
```

Serves `public/` on `http://localhost:5000`.

### Full dev mode (watch + server)

```bash
npm run dev
```

### Build

```bash
npm run build
```

Production-optimized bundle build:

```bash
npm run build:prod
```

### Playwright tests

```bash
npm run test:playwright
```

## Versioning and Cache Busting

- Version format: `YYYY.MM.DD.N`
- Automated bump command:

```bash
npm run bump
```

This updates:

- `package.json` version
- HTML cache-buster query params (`?v=...`)
- visible version labels

## Worker Environment Variables

Each worker has its own `wrangler.toml` and required bindings/secrets. Main variables include:

- `OPENROUTER_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT`, optional `FIREBASE_PROJECT_ID`
- OAuth client credentials for Notion/YouTube/Gmail/Microsoft workers
- KV bindings for OAuth/session usage
- R2 bucket bindings for shared/feedback media
- `MY_RATE_LIMITER` binding for request limiting

See each worker under `workers/*/index.js` and `workers/*/wrangler.toml` for exact requirements.

## Deployment Notes

- Frontend is static and can be hosted on any static provider.
- Worker deployment is separate and managed through Cloudflare Workers.
- Build artifacts in `public/js` can appear in Git status after builds.

## Security and Privacy Notes

- User content and RAG indexes are stored locally in the browser by default.
- Proxy workers handle external API calls and secrets server-side.
- Configure strict allowed origins in worker environments for production domains.

## Repository Quick Map

- `public/`: app entrypoints, UI, runtime scripts
- `src/`: React bridge/editor sources and shims
- `workers/`: Cloudflare worker services
- `tests/`: Playwright scenarios
- `scripts/`: build/version helper scripts
