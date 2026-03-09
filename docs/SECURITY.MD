# GoToolkit Security Architecture

Date: 2026-03-09
Purpose: short technical map of how security works in the current codebase
Scope: `public/`, `workers/`, `firebase.json`

## 0. When to use this doc

Open this file when you need to answer questions like:

- which auth material is trusted and which is not
- how CSP is enforced and updated
- what headers or secrets protect a worker route
- what security property must not regress during a refactor

## 0. Security invariants

- No protected share read/write should rely on raw `spaceCode`; use `X-Space-Auth`.
- No sync-protected write should bypass `X-Sync-Session`, `X-Sync-JTI`, and `X-Sync-TS`.
- No rich HTML should be inserted without sanitization.
- No CSP-affecting inline script change should ship without `npm run csp:inline:sync` and a runtime smoke check.
- No managed-space assumption should bypass worker-side authorization and secret checks.

## 0.1 Fast map

- CSP lives in app HTML meta tags and must stay aligned with `firebase.json`.
- Share protection is split between `X-Space-Auth`, `contentKey`, and sync anti-replay headers.
- `spaceCode` obtains access; it does not act as the bearer token.
- Worker secrets such as `X-Space-Create-Secret` are for privileged admin/bootstrap routes only.

## 1. Security layers

GoToolkit security is split across four layers:

- static HTML entry points and CSP in `public/*.html` and `firebase.json`
- browser storage in `localStorage`, `sessionStorage`, and IndexedDB
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

### 2.1 CSP hash update process for inline scripts

When a browser console reports `Executing inline script violates ...` for an app page:

1. Recompute and apply inline hashes with:
   - `npm run csp:inline:sync`
2. This updates `script-src` hashes in the canonical CSP (`scripts/csp-common.js`) and propagates them to:
   - `public/index.html`
   - `public/grid.html`
   - `public/mobile.html`
   - `firebase.json` Hosting CSP headers (`**/*.html` and `/`)
3. Run `npm run check:csp` and only merge when it passes.

Notes:

- Keep `script-src` hash lists identical across app CSP mirrors to avoid environment-specific breakage.
- Do not add `'unsafe-inline'`; prefer explicit hashes for each inline script block.
- `npm run check:csp` verifies both mirror alignment and that every inline script hash currently present in app entrypoints is covered by `APP_CSP`.
- CSP hash alignment alone is not sufficient: script-scope/runtime errors (for example `ReferenceError` from cross-block helper visibility) can still break security-sensitive and user-critical flows like export, auth UX, and share actions.
- After CSP-affecting inline script changes, run a post-change runtime smoke check and verify the browser console is free of new script errors.

## 2.2 Frontend DOM injection posture

Current coding direction in `public/` is:

- avoid dynamic `innerHTML` for runtime labels/icons/content
- prefer `textContent`, `createElement`, and attribute setters
- keep `innerHTML` mostly for:
  - static modal skeleton templates
  - container resets (`innerHTML = ""`)
  - explicitly sanitized rich HTML rendering

Operational rule:

- treat `innerHTML` as unsafe by default; any rich HTML path must sanitize before insertion.

Current implementation note:

- `public/js/assist.js` centralizes rich HTML writes via `setTrustedHtml(...)` as a choke point for guarded rendering paths.
- Dynamic icon/label UI in main surfaces has largely moved to DOM assembly (`createElement`/`textContent`) instead of template-string injection.

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

AI debug payload capture is not persisted in `localStorage`.

Examples of current keys:

- `go-toolkit-theme`
- `go-toolkit-ai-backend`
- `go-toolkit-speech-mode`
- `go-toolkit-share-records`

### `sessionStorage`

The AI client records the last AI request/response debug metadata in `sessionStorage`.

Behavior:

- scoped to the current tab/session
- exposed through `window.GoToolkitIA.getLastAIRequest()` and `window.GoToolkitIA.getLastAIResponse()`

This reduces persistence compared with `localStorage`, and no longer stores full prompt/response bodies. The metadata is still readable by scripts in the active tab, so shared/untrusted browsers remain a bad fit for sensitive workflows.

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
- D1: `space_code_hashes`, `space_content_keys`, `sync_replay_nonces`, and `sync_revoked_sessions`
- KV: auth fallback when D1 bindings are unavailable

Main collections and records:

- `pages`
- `pages-meta`
- `grids`
- `template-memos`
- `handoffs`
- `codes_map`

### Space auth

Protected space lifecycle currently uses:

- `POST /v1/spaces/auth`
- `POST /v1/spaces/auth/create`
- `POST /v1/spaces/auth/rotate`
- `POST /v1/spaces/auth/delete`

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

Route-specific authorization model:

- `POST /v1/spaces/auth`
  - accepts a user-provided `spaceCode`, or a verified managed-space `identityToken`
  - returns a signed `X-Space-Auth` token plus the per-space `contentKey`

- `POST /v1/spaces/auth/create`
  - requires `X-Space-Create-Secret`
  - stores the initial `spaceCode` hash for a new protected space
  - returns the same bootstrap material as `/v1/spaces/auth`

- `POST /v1/spaces/auth/rotate`
  - requires the current valid `X-Space-Auth`
  - validates the current `spaceCode`
  - updates only the access-code hash
  - does not rotate the `contentKey`, so existing encrypted content remains readable

- `POST /v1/spaces/auth/delete`
  - requires `X-Space-Create-Secret`
  - removes both the stored access-code hash and the stored `contentKey`
  - is intended for administrative cleanup and automated test teardown

Auth material model:

- `spaceCode` is used only to obtain access, never as the bearer token for protected routes.
- `X-Space-Auth` is a signed scoped token (`typ`, `spaceId`, `iat`, `exp`) with HMAC verification and expiration checks.
- `contentKey` is separate from both `spaceCode` and `X-Space-Auth`, and is used for protected content encryption/decryption.
- protected shared content currently includes `pages` and `pages-history`; `pages-meta` stays auth-protected but is not encrypted with `contentKey`
- `POST /v1/spaces/auth/rotate` changes the access-code hash only; it does not rotate the `contentKey`.

### Sync protection

Write and sync-sensitive operations also use:

- `X-Sync-Session`
- `X-Sync-JTI`
- `X-Sync-TS`

These are validated server-side to reject missing or replayed sync requests.

Current server-side checks include:

- all three headers are required when sync protection is enabled
- `X-Sync-TS` must be within an allowed clock-skew window
- `X-Sync-Session` can be revoked server-side
- non-read operations treat `X-Sync-JTI` as single-use per session

Replay protection uses two layers:

- D1-backed replay rows in `sync_replay_nonces`
  - primary key: `(session_id, jti)`
  - rows carry `created_at`, `expires_at`, `operation`, and `collection`
- in-worker local caches to short-circuit repeated replays without extra D1 reads

Revocation also uses two layers:

- D1-backed revoked-session rows in `sync_revoked_sessions`
  - primary key: `session_id`
  - rows carry `revoked_at` and `expires_at`
- local cache of revoked sessions for faster rejection

Practical consequence:

- a captured write request cannot simply be replayed with the same `X-Sync-Session` + `X-Sync-JTI`
- a revoked sync session is denied even if the bearer token is otherwise still valid

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

### OAuth state / CSRF protection

OAuth workers for Microsoft, Gmail, Notion, and YouTube all use nonce-based state protection.

Current behavior:

- worker generates a nonce for the outbound OAuth request
- worker persists that nonce server-side in `OAUTH_DB`
- the browser/provider round-trip returns a signed/encoded `state`
- the callback consumes the stored nonce exactly once

Effective protection:

- CSRF protection for OAuth callbacks
- one-time-use state
- short-lived transient state instead of trusting browser-only state

## 6. Microsoft SSO

Microsoft SSO is handled by `workers/ms-proxy/index.js`.

Behavior:

- allowed origins are restricted to GoToolkit origins plus localhost for development
- OAuth uses Microsoft authorize/token endpoints
- session cookie name is `gt_ms_sid`
- session state is stored in `oauth_sessions` through `env.OAUTH_DB`
- OAuth transient state is short-lived
- worker can create a signed short-lived identity token using `SHARE_OAUTH_IDENTITY_SECRET`

That identity token is then used by the share system when a managed space is accessed without a manual `spaceCode`.

## 7. Per-email-domain permissions for managed spaces

Managed shared-space authorization currently exists in both frontend and share worker logic.

Frontend definitions in `public/index.html`:

- `golive`
  - domains: `savane-group.com`, `safrangroup.com`
  - explicit email allowlist includes `quang.tran@savane-group.com`, `maximepispisa@gmail.com`
- `safran`
  - domains: `safrangroup.com`
  - explicit email allowlist includes `quang.tran@savane-group.com`

Frontend helper:

- `getAuthorizedManagedSpaceIdsForEmail(emailRaw)`

Frontend behavior:

- resolve connected identity
- extract email domain
- map authorized domains/emails to managed space ids
- write authorized managed spaces locally with `accessMode: "oauth"` and `accessManaged: true`

Worker-side enforcement:

- `workers/share-proxy/index.js`
- `resolveAllowedSpacesForEmail(emailRaw)`

Worker behavior for managed space auth:

- if no `spaceCode` is provided, `share-proxy` expects `identityToken`
- worker verifies the OAuth identity token
- worker extracts the email
- worker resolves allowed spaces from the email/domain mapping
- worker only grants access if the requested `spaceId` is in that allowed set
- worker then loads the managed `spaceCode` server-side and issues normal `X-Space-Auth`

Effective rule:

- UI visibility is derived from the connected identity email
- real authorization is enforced by `share-proxy` using the verified identity email

## 8. Proxy workers for external APIs

### OpenRouter

- worker: `workers/openrouter-proxy/index.js`
- holds `OPENROUTER_API_KEY`
- used for chat and embeddings
- supports origin allowlist, payload size limits, and rate limiting

### Google TTS

- worker: `workers/googletts-proxy/index.js`
- keeps Google credentials server-side
- supports origin allowlist, rate limiting, and server-side service-account token minting

### AssemblyAI

- worker: `workers/assemblyai-proxy/index.js`
- proxies upload/transcript/token routes
- supports origin allowlist and rate limiting

## 9. Browser-facing worker protection

Current posture for paid/browser-facing worker routes:

- no Turnstile challenge is required on OpenRouter, Google TTS, or AssemblyAI routes
- browser clients no longer send Turnstile headers to those workers
- protection relies on origin allowlists plus worker-side rate limiting
- Google TTS still enforces monthly upstream character quotas separately from request throttling

### Origin allowlists

The proxy workers do not accept arbitrary browser origins.

Behavior:

- workers normalize and compare `Origin`
- production origins are explicitly allowlisted
- localhost / loopback origins are allowed for development
- disallowed origins receive `403` with a constrained CORS response

This is an important control in addition to bearer headers because it reduces cross-origin browser abuse against public worker endpoints.

### Rate limiting

Rate limiting is implemented in multiple worker paths through `env.MY_RATE_LIMITER`.

Behavior:

- keying is based on client IP (`CF-Connecting-IP` or forwarded equivalent)
- rate-limited requests return `429 RATE_LIMIT_EXCEEDED`
- OpenRouter, Google TTS, AssemblyAI token routes, and share write-sensitive paths all use worker-side throttling

This is separate from replay protection and bearer-token verification.

### Input and request hardening

Other request-hardening mechanisms:

- `openrouter-proxy` enforces a maximum request body size before forwarding upstream
- sync protection is stricter on writes than reads
- browser clients generate fresh `X-Sync-JTI` values per request
- workers derive client IP from Cloudflare headers rather than trusting only browser-provided metadata
- some privileged share operations also support explicit admin/create secrets (`X-Admin-Token`, `X-Space-Create-Secret`) for worker-controlled paths

## 10. Files to inspect first

- `public/index.html`
- `public/mobile.html`
- `public/grid.html`
- `public/js/share-worker-client.js`
- `public/js/document-storage.js`
- `public/js/document-rag.js`
- `public/js/ia-client.js`
- `public/js/googletts.js`
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
