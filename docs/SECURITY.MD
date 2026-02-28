# GoToolkit Security

Date: 2026-02-28
Review type: repository-grounded static security review
Scope: `public/`, `workers/`, Playwright test configuration

## Overview

GoToolkit is a static frontend backed by several Cloudflare Workers. The security model is split across:

- browser-side state and user-supplied keys in `public/`
- browser-facing proxy workers for paid APIs
- OAuth workers for third-party account access
- `share-proxy` for shared document storage, sync, asset storage, and protected-space access control

The current posture is materially stronger than earlier revisions:

- browser-facing paid-key proxies enforce explicit origin allowlists
- Turnstile is supported on the high-cost AI/TTS/transcription proxies
- public debug/documentation entry points were removed
- share asset writes are scoped to a valid space token
- shared-space bootstrap is no longer available from ordinary browser auth flow

This document describes how the security model currently works, what each worker is responsible for, and which issues or tradeoffs still remain.

## High-Level Architecture

### Frontend

The main app is a static HTML/JS frontend served from `public/`. It stores local editing state, cloud sync state, and some user-configured integration credentials in browser storage.

Important browser-side behaviors:

- the app can keep user-supplied API keys in `localStorage` for some direct or proxied integrations
- shared-space membership and join codes are also browser state
- shared document operations call `share-proxy`
- AI/TTS/transcription calls use dedicated workers
- OAuth integrations are routed through worker-managed session flows

### Worker Classes

The worker layer has three main classes:

1. Cost-bearing API proxies
2. OAuth/session workers
3. Share/sync/storage worker

## Worker Security Model

### `workers/share-proxy`

`share-proxy` is the most security-sensitive worker in the repo.

Responsibilities:

- Firestore-backed shared document CRUD
- sync replay protection
- protected-space authentication and rotation
- share asset upload/read/delete through R2
- limited control operations such as sync revoke/unrevoke

Key controls:

- explicit origin allowlist with `403` on unknown origin
- signed `space-auth` tokens scoped to `spaceId`
- protected collections (`pages`, `pages-meta`) require `X-Space-Id` plus `X-Space-Auth`
- asset uploads and deletes now also require valid space auth
- uploaded assets are tagged with `spaceId` and deletes are same-space only
- sync replay protection uses `X-Sync-Session`, `X-Sync-JTI`, `X-Sync-TS` plus KV/D1-backed replay state
- shared-space bootstrap now requires `POST /v1/spaces/auth/create` with `SHARE_SPACE_CREATE_SECRET`
- ordinary `POST /v1/spaces/auth` is now join-only for already-created spaces

Storage dependencies:

- Firestore via Google service account
- KV for sync replay / revoke state
- D1 for space auth storage
- R2 for shared asset storage

Operational consequence:

- deleting or recreating the R2 bucket invalidates old asset links
- assets uploaded before space metadata enforcement will fail delete authorization unless migrated or re-uploaded

### `workers/openrouter-proxy`

Responsibilities:

- forward chat and embedding requests to OpenRouter
- expose model-user listing

Key controls:

- explicit origin allowlist
- Turnstile enforcement when `TURNSTILE_SECRET_KEY` is set
- rate limiting through Cloudflare Rate Limiter
- worker-held fallback `OPENROUTER_API_KEY`

Security posture:

- much better than origin-only gating
- still a browser-facing shared-key proxy, so Turnstile should be treated as abuse friction, not as strong authentication

### `workers/googletts-proxy`

Responsibilities:

- proxy text-to-speech calls to Google Cloud
- optionally manage service-account access token flow

Key controls:

- explicit origin allowlist with localhost handling for development
- Turnstile enforcement when configured
- worker-side service-account support instead of exposing Google credentials to the browser
- rate limiting

Security posture:

- appropriate for browser-triggered TTS requests
- still dependent on anti-abuse friction rather than durable per-user auth

### `workers/assemblyai-proxy`

Responsibilities:

- proxy AssemblyAI API calls and streaming token issuance

Key controls:

- explicit origin allowlist
- Turnstile enforcement when configured
- rate limiting on token path
- accepts user-supplied `X-AssemblyAI-Key` or fallback worker key

Security posture:

- better than previous origin-only model
- still exposes a browser-facing request path for a paid upstream API

### OAuth Workers

Workers:

- `workers/youtube-proxy`
- `workers/gmail-proxy`
- `workers/notion-proxy`
- `workers/ms-proxy`

Responsibilities:

- start OAuth flows
- store device/session-scoped tokens
- perform provider-specific operations on behalf of the browser

Key controls:

- origin checks with explicit allowlists
- secure session cookies: `HttpOnly`, `Secure`, `SameSite=None`
- nonce/state generation for OAuth handoff
- server-side token persistence in D1-backed storage

Security posture:

- generally sound for browser-initiated OAuth
- stronger than storing OAuth tokens directly in the browser

## Frontend Security Characteristics

### CSP and Public Surface

Current public HTML coverage is better than before:

- `debug.html` removed
- `docs.html` removed
- remaining public entry points are covered by CSP policy work described in repo config

This materially reduces unauthenticated reconnaissance surface.

### Browser Storage

The frontend still uses browser storage for legitimate product reasons:

- local document state
- share history and sync state
- selected backend configuration
- some user-supplied third-party API keys

This is an intentional trust model choice, not necessarily a bug. It does, however, mean:

- a compromised browser context can still read user-supplied local secrets
- XSS prevention remains very important even though CSP coverage is better than before

### Test Space Configuration

Playwright now uses a fixed shared test space:

- `PW_TEST_SPACE_ID`
- `PW_TEST_SPACE_CODE`

Default values are currently:

- `gotoolkit`
- `gotoolkit`

This is operationally convenient for stable tests, but should be treated as test-only shared credentials rather than meaningful protection.

## Current Security Strengths

### Stronger Trust Boundaries

- browser-side shared-space creation was removed
- share asset writes are now aligned with space authorization
- expensive proxies no longer rely only on permissive CORS behavior

### Reduced Public Reconnaissance

- `debug.html` removal matters
- `docs.html` removal trims extra unauthenticated surface

## Managed Shared Spaces: Encryption Decision

### Microsoft OpenID SSO Rules

Managed shared-space access currently relies on Microsoft OpenID SSO for the Microsoft path.

Current Microsoft identity scope:

- `openid profile email offline_access`

Current identity model:

- the Microsoft worker resolves browser session identity from OpenID claims
- the shared-space authorization decision is then made from the resolved email address
- access is denied if no valid connected identity is available

Current authorization rules:

- `golive`
  - any email in `@savane-group.com`
  - any email in `@safrangroup.com`
  - exact email `quang.tran@savane-group.com`
- `safran`
  - any email in `@safrangroup.com`
  - exact email `quang.tran@savane-group.com`

Operational notes:

- no connected session means no managed shared-space access
- worker-side authorization is the source of truth for access control
- frontend visibility follows the same rules for UX consistency, but must not be treated as a security boundary
- Google SSO may still exist in the UI for other flows, but managed-space authorization rules should be documented and enforced server-side

### Current state

Managed shared spaces such as `golive` and `safran` currently use two distinct concepts:

- an access key enforced by `share-proxy` through Cloudflare worker secrets such as `GOLIVE_SPACE_CODE` and `SAFRAN_SPACE_CODE`
- a content encryption/decryption key used by the browser to encrypt and decrypt `pages` payloads

This distinction became visible during the `golive` rollout:

- worker-side OAuth authorization and space access could succeed
- but previously stored encrypted documents still required the historical browser-side decryption phrase

### Security tradeoff

The strongest model would be to move content decryption fully server-side so that the browser never receives the real content key. However, this has a real cost:

- more worker CPU on every read/write
- more latency for large document payloads and asset-heavy content
- more operational complexity in the most sensitive worker

Returning the real content key to the browser after OAuth authorization would preserve current performance, but it weakens secrecy because an authorized browser session can always extract that key.

### Decision for now

For now, GoToolkit keeps browser-side content encryption/decryption for managed shared spaces.

The short-term recommendation is:

- keep access control enforced by worker secrets (`GOLIVE_SPACE_CODE`, `SAFRAN_SPACE_CODE`)
- keep client-side content encryption/decryption for performance
- migrate away from weak content phrases such as `golive`
- use strong per-space content phrases when rotating encryption keys

Example of an acceptable stronger phrase shape:

- multi-word passphrases with enough entropy
- unique per space
- not derived from the public space identifier

### Recommended next step

The best medium-term compromise is a hybrid model:

- worker keeps the authoritative per-space content key
- OAuth/SOO authorization remains worker-side
- browser receives content-key material only after authorized access
- browser still performs document encryption/decryption locally

This preserves current frontend performance while removing the weakest pattern: hardcoded or guessable content keys such as the plain space identifier.

### Better Secret Placement

- service-account or upstream secrets stay in workers where possible
- OAuth session tokens are server-side rather than browser-native

## Remaining Issues and Tradeoffs

These are the remaining issues or security-relevant tradeoffs I would still track.

### 1. Browser-Stored User Keys Are Still a Deliberate Risk

The app still stores some user-provided credentials in browser storage, especially for user-controlled AI/transcription flows.

Impact:

- any XSS or compromised browser extension can access those values
- security depends heavily on preventing script injection and keeping CSP tight

This is a product tradeoff, not a newly discovered defect.

### 2. Turnstile Is Friction, Not Strong Authentication

The paid-key proxies are meaningfully safer now, but Turnstile does not provide durable caller identity.

Impact:

- it helps against commodity abuse
- it does not provide the same assurance as signed requests or per-user server auth

If abuse pressure increases, the next step should be request signing or stronger worker-issued auth, not just more CAPTCHA-style checks.

### 3. `SHARE_SPACE_CREATE_SECRET` Is a Powerful Bearer Secret

Protected-space bootstrap is now behind a worker secret, which is a strong improvement over browser bootstrap.

Residual concern:

- the secret is still a single bearer capability
- if leaked, an attacker can create arbitrary spaces

Recommended handling:

- keep it only in worker/server-side automation
- do not expose it to browser code, Playwright client code, or public docs
- rotate it if there is any suspicion of leakage

### 4. Sync Replay Window Is Still Fairly Generous

`share-proxy` sync replay protection uses a 10-minute skew window.

Impact:

- replay prevention is stateful and real
- but the acceptance window is broader than ideal if clients can tolerate tighter clocks

This is not an immediate vulnerability, but it is still a tunable hardening lever.

### 5. OAuth Workers Use Similar, Duplicated Security Logic

The OAuth workers each implement their own origin/session/state handling pattern.

Impact:

- this is workable today
- but duplication increases long-term drift risk

Best next step:

- converge common origin/session helpers into shared utilities or at least a common design checklist

### 6. Static Review Is Not the Same as Live Abuse Testing

This review did not include a full live penetration test or broad browser-flow fuzzing.

That means:

- the architecture looks sound from code inspection
- live misconfiguration or integration drift can still exist outside the repo

## Worker-by-Worker Summary

### Safe Enough for Current Model

- `share-proxy`
- `openrouter-proxy`
- `googletts-proxy`
- `assemblyai-proxy`
- `youtube-proxy`
- `gmail-proxy`
- `notion-proxy`
- `ms-proxy`

### Why

- explicit origin checks
- narrower public surface
- better separation of browser state vs worker-held secrets
- space-scoped auth enforced in the shared-storage path

## Recommended Next Steps

1. Add automated regression tests for `/v1/spaces/auth/create` so browser code cannot accidentally regain bootstrap capability.
2. Add regression coverage for asset delete denial across mismatched `spaceId` scopes.
3. Consider reducing `share-proxy` sync skew if client clocks tolerate it.
4. Document clearly which browser-stored keys are intentional product behavior and which must never be stored client-side.
5. Normalize shared origin/auth helper logic across OAuth workers.

## Practical Verification Checklist

1. `POST /v1/spaces/auth` with a missing space should fail and not create anything.
2. `POST /v1/spaces/auth/create` should require `SHARE_SPACE_CREATE_SECRET`.
3. Asset upload/delete should fail without valid `X-Space-Auth`.
4. Asset delete should fail when token `spaceId` and asset `spaceId` differ.
5. Paid-key proxies should still fail closed on bad origin or missing Turnstile token when Turnstile is enabled.
6. No public `debug.html` or `docs.html` route should remain in the built app.

## Bottom Line

The current codebase is in a substantially better state than before the recent hardening work. The core worker trust boundaries now make sense, and I did not find a new high-confidence open vulnerability in this pass.

The remaining concerns are mostly residual tradeoffs:

- browser-stored user keys
- Turnstile as friction rather than strong auth
- bearer-secret protection for privileged bootstrap
- duplicated security logic across multiple workers

Those are worth tracking, but they are different in kind from the earlier direct authorization gaps.
