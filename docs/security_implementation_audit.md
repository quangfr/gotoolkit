# GoToolkit Security Implementation & Vulnerability Audit

Date: 2026-02-27
Scope: `public/` frontend + `workers/` Cloudflare Workers (share, AI proxies, OAuth proxies)
Method: Static code review (no dynamic pentest, no infrastructure scan)

## Executive Summary
Overall security level: **Moderate (Medium risk)**.

The project has several solid controls already in place (OAuth state nonce, secure HttpOnly session cookies, rate limiting, replay protection, optional E2EE for shared pages/assets). However, the current share service exposes a high-impact risk: core share CRUD/list endpoints are accessible without authentication, and admin protection is fail-open when admin token env is not configured.

## Current Security Implementation (What is already good)
- Replay protection on sync write/delete requests using `X-Sync-*` envelope + KV anti-replay keys.
  - Evidence: [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L475), [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L512)
- Rate limiting is applied on write paths in share and AI proxy workers.
  - Evidence: [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1202), [workers/openai-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openai-proxy/index.js#L73), [workers/openrouter-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openrouter-proxy/index.js#L78)
- OAuth flows use nonce state persisted server-side and consumed once.
  - Evidence: [workers/notion-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/notion-proxy/index.js#L199), [workers/notion-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/notion-proxy/index.js#L219)
- OAuth session cookies are `HttpOnly`, `Secure`, `SameSite=None`.
  - Evidence: [workers/gmail-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/gmail-proxy/index.js#L116), [workers/ms-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/ms-proxy/index.js#L110)
- Frontend markdown renderer escapes HTML and restricts URL schemes to `http/https`.
  - Evidence: [public/js/document-markdown.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/document-markdown.js#L5), [public/js/document-markdown.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/document-markdown.js#L22)
- Client-side optional E2EE for shared page/media payloads with AES-GCM + PBKDF2.
  - Evidence: [public/js/share-worker-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/share-worker-client.js#L129), [public/js/share-worker-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/share-worker-client.js#L162)

## Vulnerability Findings

### GT-SEC-001 — Unauthenticated share read/write/delete/list endpoints
Severity: **High**

Impact: Any party that can reach the worker endpoint can read/list/modify/delete share records without user authentication.

Evidence:
- Endpoint routing handles batch and single-document writes/deletes without identity/session auth checks:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1308)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1394)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1590)
- Collection listing/tree retrieval is accessible on GET path without auth check:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1538)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1555)

Recommendation:
- Require a signed user/session token (or HMAC service token) for all share endpoints except explicitly public ones.
- Enforce per-space authorization checks before read/write/delete/list.

---

### GT-SEC-002 — Admin protection is fail-open if env missing
Severity: **High**

Impact: If `SHARE_ADMIN_TOKEN` is unset, admin routes become effectively unauthenticated.

Evidence:
- `verifyAdminAccess` returns `true` when token is not configured:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L378)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L380)

Recommendation:
- Change to fail-closed for admin routes (`missing token` => deny).
- Add startup/runtime warning + healthcheck failure when required admin secret is missing.

---

### GT-SEC-003 — Share proxy CORS defaults to wildcard
Severity: **Medium**

Impact: Increases attack surface for browser-origin access and data scraping, especially when combined with unauthenticated endpoints.

Evidence:
- `Access-Control-Allow-Origin` falls back to `*` when not localhost / not in allowlist:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L348)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L352)

Recommendation:
- Default deny unknown origins; require explicit allowlist in production.
- Return `403` for disallowed origins (pattern already used by OAuth workers).

---

### GT-SEC-004 — No visible CSP hardening + third-party scripts without SRI
Severity: **Medium**

Impact: Higher XSS/supply-chain blast radius if any frontend injection occurs or a CDN asset is compromised.

Evidence:
- No CSP meta/header visible in `public/index.html` head.
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L4)
- Multiple CDN script loads without `integrity` attributes:
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L77)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L85)

Recommendation:
- Add CSP at edge/worker response headers (preferred) or strict meta policy if constrained.
- Pin third-party script versions and add SRI where feasible.

---

### GT-SEC-005 — OAuth workers treat missing `Origin` as local/trusted
Severity: **Low**

Impact: Non-browser clients can bypass origin allowlist logic by omitting `Origin`; this does not directly bypass OAuth state/cookies but weakens request-origin policy.

Evidence:
- `isLocalOrigin` returns true when origin is empty:
  - [workers/notion-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/notion-proxy/index.js#L19)
  - [workers/gmail-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/gmail-proxy/index.js#L25)
  - [workers/ms-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/ms-proxy/index.js#L19)

Recommendation:
- For production mode, require explicit allowed `Origin` (or equivalent auth token) on state-changing routes.

## Risk Level Matrix (Current)
- Critical: 0
- High: 2
- Medium: 2
- Low: 1

## Priority Remediation Plan
1. Lock down share endpoints with authentication + authorization (GT-SEC-001).
2. Make admin auth fail-closed (GT-SEC-002).
3. Tighten share CORS and deny unknown origins by default (GT-SEC-003).
4. Add CSP + SRI for frontend hardening (GT-SEC-004).
5. Tighten OAuth origin policy for non-browser requests (GT-SEC-005).

## Notes
- This is a source-code audit only. It does not include runtime configuration checks (Cloudflare dashboard secrets, WAF, DNS/TLS, D1 encryption posture, IAM bindings).
- Re-run this audit after fixes and add regression tests for auth/cors/security headers.
