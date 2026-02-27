# GoToolkit Security Audit

Date: 2026-02-27
Scope: `public/` frontend + `workers/` Cloudflare Workers
Method: Static code review (source only)

## Executive Summary
Overall security level: **Moderate (Medium risk)**.

Good security controls are present (OAuth state nonce, secure session cookies, rate limiting, sync anti-replay, optional E2EE). The main remaining high-risk issue is missing authentication/authorization on share data routes (including operational routes now treated as normal routes).

## Implemented Controls (Verified)
- Sync anti-replay envelope (`X-Sync-Session`, `X-Sync-JTI`, `X-Sync-TS`) + KV replay tracking.
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L475)
- Write-path rate limiting in share and AI proxies.
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1202)
  - [workers/openai-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openai-proxy/index.js#L73)
  - [workers/openrouter-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openrouter-proxy/index.js#L78)
- OAuth CSRF state nonce persisted/consumed server-side.
  - [workers/notion-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/notion-proxy/index.js#L199)
- OAuth session cookies are `HttpOnly`, `Secure`, `SameSite=None`.
  - [workers/gmail-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/gmail-proxy/index.js#L116)
- Share worker CORS tightened to explicit allowlist + localhost/127 dev; unknown origin returns `403`.
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L379)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1179)

## Findings

### GT-SEC-001 — Share endpoints are still unauthenticated/unauthorized
Severity: **High**

Impact: Any caller from an allowed origin can read/list/modify/delete share data and trigger maintenance-like operations, because no user/session/token auth is enforced on share routes.

Evidence:
- CRUD/batch routes execute without auth middleware:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1308)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1394)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1590)
- Collection list/tree read is open (origin-gated only):
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1538)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1555)
- Control/repair/ensureConsistency paths now have no admin-token enforcement:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1269)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1535)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1553)

Recommendation:
- Add route-level auth for share endpoints (`X-Share-Token` minimum or scoped short-lived token/JWT).
- Enforce per-space authorization checks for every read/write/delete/list/control operation.

---

### GT-SEC-002 — No visible CSP hardening + third-party scripts without SRI
Severity: **Medium**

Impact: If any frontend injection occurs, blast radius is higher; CDN compromise risk is less bounded.

Evidence:
- No visible CSP policy in `index.html` head.
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L4)
- External scripts without SRI:
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L77)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L85)

Recommendation:
- Add CSP at edge/worker response headers.
- Pin and add SRI where practical.

---

### GT-SEC-003 — OAuth workers treat empty `Origin` as local/trusted
Severity: **Low**

Impact: Non-browser clients can bypass origin allowlist behavior by omitting `Origin` header.

Evidence:
- `isLocalOrigin` returns true when origin is empty:
  - [workers/notion-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/notion-proxy/index.js#L19)
  - [workers/gmail-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/gmail-proxy/index.js#L25)
  - [workers/ms-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/ms-proxy/index.js#L19)

Recommendation:
- Require explicit allowed origins for OAuth worker endpoints:
  - `https://gotoolkit.fr`
  - `https://gotoolkit.web.app`
  - `http://localhost:<any-port>` and `http://127.0.0.1:<any-port>` (development only)
- Reject empty/missing `Origin` in production for browser-facing state-changing routes, unless a separate authenticated server-to-server token path is used.

## Updated Risk Matrix
- Critical: 0
- High: 1
- Medium: 1
- Low: 1

## Delta vs previous audit
- Closed: wildcard CORS fallback on share worker (now explicit allowlist + 403 deny).
- Reframed: prior "admin fail-open" finding is no longer the main issue because admin gates were removed on those routes; risk now consolidates into broader unauthenticated share-route access (GT-SEC-001).

## Priority Remediation
1. Add authz/authn to all share routes (GT-SEC-001).
2. Add CSP + SRI hardening (GT-SEC-002).
3. Tighten OAuth empty-origin behavior (GT-SEC-003).
