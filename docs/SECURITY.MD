# GoToolkit Security Architecture

Date: 2026-03-05
Purpose: short technical map of how security works in the current codebase
Scope: `public/`, `workers/`, `firebase.json`

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

1. Compute the exact `sha256-...` for the blocked inline script body reported by the browser.
2. Add that hash to `script-src` in the canonical CSP in `scripts/csp-common.js`.
3. Propagate the same hash list to:
   - `public/index.html`
   - `public/grid.html`
   - `public/mobile.html`
   - `firebase.json` Hosting CSP headers (`**/*.html` and `/`)
4. Run `npm run check:csp` and only merge when it passes.

Notes:

- Keep `script-src` hash lists identical across app CSP mirrors to avoid environment-specific breakage.
- Do not add `'unsafe-inline'`; prefer explicit hashes for each inline script block.

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
- D1: `space_code_hashes` and `space_content_keys`
- KV: sync/replay support (and auth fallback when D1 bindings are unavailable)

Main collections and records:

- `pages`
- `pages-meta`
- `grids`
- `template-memos`
- `handoffs`
- `codes_map`

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

### Signed space tokens

`X-Space-Auth` is not a raw `spaceCode`.

Current worker behavior in `workers/share-proxy/index.js`:

- `spaceCode` (or verified managed-space OAuth identity) is only used to obtain an auth token
- the worker signs an auth payload with HMAC-SHA256
- the token payload includes:
  - `typ` (`space-auth`)
  - `spaceId`
  - `iat`
  - `exp`
- the worker verifies:
  - token format
  - HMAC signature
  - JSON payload validity
  - `spaceId` scope match against `X-Space-Id`
  - expiration time

So the effective protection is:

- scoped bearer token
- tamper detection
- expiration-based replay reduction for stale tokens

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

Replay protection is enforced with two layers:

- KV-backed replay keys:
  - `sync:replay:${X-Sync-Session}:${X-Sync-JTI}`
- in-worker local caches to short-circuit repeated replays without extra KV reads

Revocation also has two layers:

- KV-backed revoked-session keys:
  - `sync:revoked:${X-Sync-Session}`
- local cache of revoked sessions for faster rejection

Practical consequence:

- a captured write request cannot simply be replayed with the same `X-Sync-Session` + `X-Sync-JTI`
- a revoked sync session is denied even if the bearer token is otherwise still valid

### Content key

`share-proxy` returns a per-space `contentKey` after successful auth.

Current client behavior:

- cache the `contentKey`
- import/use it for local encryption/decryption of some shared content flows

The `contentKey` is stored server-side in KV and is separate from:

- the `spaceCode`
- the signed `X-Space-Auth` token

So current responsibilities are split:

- `spaceCode`: secret used to obtain access
- `X-Space-Auth`: signed scoped access token
- `contentKey`: encryption/decryption material for protected content flows

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

So the effective protection is:

- CSRF protection for OAuth callbacks
- one-time-use state
- short-lived transient state instead of trusting browser-only state

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
- supports origin allowlist, Turnstile, payload size limits, and rate limiting

### Google TTS

- worker: `workers/googletts-proxy/index.js`
- keeps Google credentials server-side
- supports origin allowlist, Turnstile, rate limiting, and server-side service-account token minting

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

Current server-side Turnstile behavior:

- workers verify the token against Cloudflare `siteverify`
- `remoteip` is forwarded from `CF-Connecting-IP` / `X-Forwarded-For`
- verification requests use an `idempotency_key`
- workers validate returned `hostname` against allowed hostnames
- workers validate returned `action` against expected route action
- localhost requests are exempted on some workers
- missing Turnstile secret does not silently pass production traffic:
  - `openrouter-proxy` returns `500 MISSING_ENV`
  - `googletts-proxy` / `assemblyai-proxy` allow localhost but fail non-local traffic with `500 MISSING_ENV`

Current client-side Turnstile behavior:

- the browser requests Turnstile only for protected worker hosts
- the helper first tries a background/off-screen execution
- if that times out, it can escalate to a visible interactive challenge
- the client records diagnostics and last-attempt summaries for debugging
- AI debug capture stores request/response metadata (not full bodies) in `sessionStorage`

This means Turnstile failures can occur in two distinct places:

- client-side before any worker request is sent
- worker-side after a request is sent but Cloudflare rejects the token

### Origin allowlists

The proxy workers do not accept arbitrary browser origins.

Current behavior:

- workers normalize and compare `Origin`
- production origins are explicitly allowlisted
- localhost / loopback origins are allowed for development
- disallowed origins receive `403` with a constrained CORS response

This is an important control in addition to bearer headers because it reduces cross-origin browser abuse against public worker endpoints.

### Rate limiting

Rate limiting is implemented in multiple worker paths through `env.MY_RATE_LIMITER`.

Current behavior:

- keying is based on client IP (`CF-Connecting-IP` or forwarded equivalent)
- rate-limited requests return `429 RATE_LIMIT_EXCEEDED`
- OpenRouter, Google TTS, AssemblyAI token routes, and share write-sensitive paths all use worker-side throttling

This is separate from:

- Turnstile challenge enforcement
- replay protection
- bearer-token verification

### Input and request hardening

Other current request-hardening mechanisms that are easy to miss:

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
