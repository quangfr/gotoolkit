# GoToolkit Security Architecture

Date: 2026-03-01
Purpose: short technical map of how security works in the current codebase
Scope: `public/`, `workers/`, `firebase.json`

## 1. Security layers

GoToolkit security is split across four layers:

- static HTML entry points and CSP in `public/*.html` and `firebase.json`
- browser storage in `localStorage` and IndexedDB
- Cloudflare Workers that hold secrets, OAuth state, and upstream API credentials
- cloud persistence used by sharing: Firestore, R2, KV, and D1

There is no single backend. Each feature has its own path:

- local/private docs: browser storage only
- shared/cloud docs: browser -> `share-proxy` -> Firestore/R2/KV/D1
- AI/TTS/transcription: browser -> dedicated worker -> upstream API
- OAuth/SSO: browser popup -> provider worker -> provider API

## 2. Entry points and CSP

Public entry points:

- `public/index.html`
- `public/mobile.html`
- `public/grid.html`
- `public/home.html`
- `public/legal.html`
- `public/404.html`

Main app pages use CSP that currently allows:

- `'unsafe-inline'` in scripts and styles
- `'wasm-unsafe-eval'` in scripts
- `frame-ancestors 'self'`

`public/legal.html` has a narrower CSP.

When changing network targets, script loading, iframes, or workers, check both:

- page-level CSP in the HTML file
- hosting CSP in `firebase.json`

## 3. Browser storage

### `localStorage`

Used for lightweight persistent state such as:

- theme and UI preferences
- AI backend selection
- speech/TTS settings
- prompt presets
- share history
- cloud draft queues
- some user-entered configuration

Examples of current keys:

- `go-toolkit-theme`
- `go-toolkit-ai-backend`
- `go-toolkit-api-key`
- `go-toolkit-speech-mode`
- `go-toolkit-share-records`

### IndexedDB

Main databases:

- `go-toolkit`
- `gotoolkit-documents`

Main stores used by the app:

- `document-api`
- `share-history`
- `documents-settings`
- `documents`
- `chunks`
- `keyword_meta`
- `memo_context_embeddings`

Private docs and RAG state are primarily local IndexedDB data.

## 4. Share system

Main browser client:

- `public/js/share-worker-client.js`

Main worker:

- `workers/share-proxy/index.js`

Main storage:

- Firestore: shared page content and metadata
- R2: shared media/assets
- D1: `space_code_hashes`
- KV: content keys and sync/replay support

Main collections and records:

- `pages`
- `pages-meta`
- `memos`
- `grids`
- `template-memos`

### Space auth

Protected spaces are accessed through `POST /v1/spaces/auth`.

Successful auth returns:

- `token`
- `spaceId`
- `expiresAt`
- `contentKey`
- `contentKeyVersion`

The browser then uses:

- `X-Space-Id`
- `X-Space-Auth`

for protected share routes.

### Sync protection

Write and sync-sensitive operations also use:

- `X-Sync-Session`
- `X-Sync-JTI`
- `X-Sync-TS`

These are validated server-side to reject missing or replayed sync requests.

### Content key

`share-proxy` returns a per-space `contentKey` after successful auth.

Current client behavior:

- cache the `contentKey`
- import/use it for local encryption/decryption of some shared content flows

## 5. SSO / OAuth

Provider workers:

- `workers/ms-proxy`
- `workers/gmail-proxy`
- `workers/notion-proxy`
- `workers/youtube-proxy`

Shared pattern:

- browser starts flow through worker
- worker stores OAuth state server-side
- provider redirects back to worker callback
- worker exchanges code for tokens
- worker stores session/token state server-side
- worker coordinates browser state through secure cookies

Cookie attributes used by OAuth workers include:

- `HttpOnly`
- `Secure`
- `SameSite=None`

## 6. Microsoft SSO

Microsoft SSO is handled by `workers/ms-proxy/index.js`.

Current behavior:

- allowed origins are restricted to GoToolkit origins plus localhost for development
- OAuth uses Microsoft authorize/token endpoints
- session cookie name is `gt_ms_sid`
- session state is stored in D1 table `oauth_sessions` through `env.OAUTH_DB`
- OAuth transient state is stored with short TTL
- worker can create a signed short-lived identity token using `SHARE_OAUTH_IDENTITY_SECRET`

This identity token is then used by the share system when a managed space is accessed without a manual `spaceCode`.

## 7. Per-email-domain permissions for managed spaces

Managed shared-space authorization currently exists in both frontend and share worker logic.

Frontend definitions in `public/index.html`:

- `golive`
  - domains: `savane-group.com`, `safrangroup.com`
  - explicit email allowlist includes `quang.tran@savane-group.com`
- `safran`
  - domains: `safrangroup.com`
  - explicit email allowlist includes `quang.tran@savane-group.com`

Frontend helper:

- `getAuthorizedManagedSpaceIdsForEmail(emailRaw)`

Current frontend behavior:

- resolve connected identity
- extract email domain
- map authorized domains/emails to managed space ids
- write authorized managed spaces locally with `accessMode: "oauth"` and `accessManaged: true`

Worker-side enforcement:

- `workers/share-proxy/index.js`
- `resolveAllowedSpacesForEmail(emailRaw)`

Current worker behavior for managed space auth:

- if no `spaceCode` is provided, `share-proxy` expects `identityToken`
- worker verifies the OAuth identity token
- worker extracts the email
- worker resolves allowed spaces from the email/domain mapping
- worker only grants access if the requested `spaceId` is in that allowed set
- worker then loads the managed `spaceCode` server-side and issues normal `X-Space-Auth`

So the effective rule is:

- UI visibility is derived from the connected identity email
- real authorization is enforced by `share-proxy` using the verified identity email

## 8. Proxy workers for external APIs

### OpenRouter

- worker: `workers/openrouter-proxy/index.js`
- holds `OPENROUTER_API_KEY`
- used for chat and embeddings
- supports origin allowlist and Turnstile

### Google TTS

- worker: `workers/googletts-proxy/index.js`
- keeps Google credentials server-side
- supports origin allowlist, Turnstile, and rate limiting

### AssemblyAI

- worker: `workers/assemblyai-proxy/index.js`
- proxies upload/transcript/token routes
- supports origin allowlist, Turnstile, and rate limiting

## 9. Turnstile

Client helper:

- `public/js/turnstile-helper.js`

Browser API:

- `window.GoToolkitTurnstile.getHeadersForUrl(...)`

Used on current paid/browser-facing worker flows including:

- OpenRouter
- Google TTS
- AssemblyAI

Workers expect headers such as:

- `X-Turnstile-Token`
- `CF-Turnstile-Response`

## 10. Files to inspect first

- `public/index.html`
- `public/mobile.html`
- `public/grid.html`
- `public/home.html`
- `public/js/share-worker-client.js`
- `public/js/document-storage.js`
- `public/js/document-rag.js`
- `public/js/ia-client.js`
- `public/js/googletts.js`
- `public/js/turnstile-helper.js`
- `workers/share-proxy/index.js`
- `workers/ms-proxy/index.js`
- `workers/gmail-proxy/index.js`
- `workers/notion-proxy/index.js`
- `workers/youtube-proxy/index.js`
- `workers/openrouter-proxy/index.js`
- `workers/googletts-proxy/index.js`
- `workers/assemblyai-proxy/index.js`
- `firebase.json`

## 11. Practical rule

Before changing any security-sensitive behavior, identify which path the feature uses:

- browser only
- share worker
- OAuth worker
- external API proxy worker

Then preserve the storage, headers, and auth mechanism already used on that path.
