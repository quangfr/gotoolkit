# GoToolkit Security Audit

Date: 2026-02-28
Auditor: Static code audit (repository analysis)
Scope: `public/` frontend and `workers/` Cloudflare Workers

## Executive Summary
Overall posture: **Low risk**.

The recent hardening work closed the earlier proxy-gating gaps: browser-facing paid-key workers now enforce explicit origin allowlists, reject missing origins, and require Turnstile when configured. CSP coverage across the remaining public HTML entry points is also materially better than in the prior audit.

No open high-confidence findings remain from this audit pass. The recent work removed browser-side space creation, moved protected-space bootstrap behind a worker secret, and removed the stale `feedback-admin-token` path from the UI.

## Methodology
- Manual static review of worker request gates, auth checks, origin enforcement, and storage access.
- Route-by-route inspection of high-risk worker endpoints in `workers/`.
- Public HTML entry-point review in `public/`, with focus on debug/admin surfaces.
- Targeted searches for token handling, local storage usage, and asset upload paths.

Limitations:
- No full dynamic penetration test.
- No live Cloudflare dashboard or WAF/ruleset review.
- No complete end-to-end abuse simulation against deployed infrastructure.

## Verified Security Controls
- `share-proxy` rejects unknown or missing origins for non-OPTIONS requests and emits explicit `403`.
  Evidence: `workers/share-proxy/index.js:1364`, `workers/share-proxy/index.js:1368`
- `openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy` now use explicit allowlists, reject missing/unknown `Origin`, and support Turnstile verification.
  Evidence: `workers/openrouter-proxy/index.js`, `workers/googletts-proxy/index.js`, `workers/assemblyai-proxy/index.js`
- `youtube-proxy` origin handling is aligned to the stricter explicit-allowlist model.
  Evidence: `workers/youtube-proxy/index.js`
- Remaining public HTML entry points now have CSP coverage, with Hosting-level CSP configured in `firebase.json` and page-level fallback meta tags retained where applicable.
  Evidence: `firebase.json`, `public/index.html`, `public/grid.html`, `public/home.html`, `public/mobile.html`, `public/legal.html`, `public/404.html`
- OAuth workers continue to use server-side OAuth state/session handling with secure cookies.
  Evidence: `workers/gmail-proxy/index.js`, `workers/notion-proxy/index.js`, `workers/ms-proxy/index.js`, `workers/youtube-proxy/index.js`

## Findings

No open findings were confirmed in this pass after the latest remediations.

## Resolved Since Previous Audit
- Browser-facing paid-key proxies no longer rely on permissive missing-origin handling.
- Turnstile support is now wired into `openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy`.
- `youtube-proxy` now follows the stricter explicit-origin model.
- CSP coverage has been extended to previously uncovered public HTML entry points.
- `public/debug.html` and `public/docs.html` have been removed from the repository, eliminating the public debug surface and an extra static entry point.
- `share-proxy` asset writes now require `X-Space-Auth`, uploaded assets are tagged with `spaceId`, and deletes are restricted to same-space callers.
- `share-proxy` space creation is no longer available from browser auth flow; bootstrap now requires a worker secret via `/v1/spaces/auth/create`.
- `public/index.html` no longer persists or reacts to `feedback-admin-token`.
- The previously cited `openai-proxy` and `feedback-proxy` removal remains consistent with the current repository state.

## Risk Matrix
- Critical: 0
- High: 0
- Medium: 0
- Low: 0

## Priority Remediation Plan
1. **Backlog**: Consolidate worker auth/origin utilities so future worker routes do not drift into weaker trust models.
2. **Backlog**: Add regression coverage for secret-gated space creation and join-only browser auth.

## Suggested Verification Checklist
1. Attempt to create a new `spaceId` through `/v1/spaces/auth` without the worker secret and confirm it returns `404` or `403`.
2. Attempt to create a new `spaceId` through `/v1/spaces/auth/create` with an invalid secret and confirm it returns `403`.
3. Attempt asset upload and delete without `X-Space-Auth` and confirm the worker returns `401` or `403`.
4. Attempt delete with a valid token from a different `spaceId` and confirm the worker returns `403`.
5. Re-run a smoke pass on the paid-key proxies to ensure Turnstile and explicit-origin enforcement still fail closed.
