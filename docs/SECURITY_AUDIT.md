# GoToolkit Security Audit

Date: 2026-02-27  
Auditor: Static code audit (repository analysis)  
Scope: `public/` frontend and `workers/` Cloudflare Workers

## Executive Summary
Overall posture: **Medium risk**.

The latest changes removed `openai-proxy`, removed the `openrouter-proxy` IP bypass, and tightened `feedback-proxy` CORS to explicit origin checks. Remaining risk is concentrated in worker proxies that still rely on CORS/origin checks as the primary gate and in incomplete CSP coverage on static pages.

## Methodology
- Manual static review of worker request gates (Origin/CORS/auth/rate-limit).
- Route-by-route inspection of sensitive endpoints (AI proxy, feedback, OAuth workers).
- HTML entrypoint review for CSP presence.

Limitations:
- No dynamic penetration test.
- No live Cloudflare/WAF configuration verification.

## Verified Security Controls
- `share-proxy` and `feedback-proxy` reject unknown origins with explicit `403`.  
  Evidence: `workers/share-proxy/index.js:1364`, `workers/share-proxy/index.js:1368`, `workers/feedback-proxy/index.js:43`, `workers/feedback-proxy/index.js:48`
- `openrouter-proxy` no longer has hardcoded IP whitelist bypass and now uses strict origin allowlist resolution.  
  Evidence: `workers/openrouter-proxy/index.js:1`, `workers/openrouter-proxy/index.js:17`, `workers/openrouter-proxy/index.js:51`, `workers/openrouter-proxy/index.js:92`
- OAuth workers enforce origin checks and require `Origin` for non-GET requests.  
  Evidence: `workers/gmail-proxy/index.js:631`, `workers/gmail-proxy/index.js:639`, `workers/notion-proxy/index.js:1044`, `workers/ms-proxy/index.js:511`
- OAuth session cookies are still configured with `HttpOnly`, `Secure`, `SameSite=None`.  
  Evidence: `workers/gmail-proxy/index.js:116`, `workers/notion-proxy/index.js:110`, `workers/ms-proxy/index.js:110`

## Findings

### GT-SEC-2026-001: CORS is still used as primary access control on key-backed proxies
Severity: **High**  
Status: **Open**

Risk:
`openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy` trust allowlisted origins but do not require strong request authentication (signed token/JWT/service token). Non-browser clients can still forge an `Origin` header and consume paid upstream APIs.

Evidence:
- OpenRouter uses origin allowlist + forwards shared key: `workers/openrouter-proxy/index.js:35`, `workers/openrouter-proxy/index.js:51`, `workers/openrouter-proxy/index.js:138`
- Google TTS treats missing `Origin` as local and allows `*`: `workers/googletts-proxy/index.js:60`, `workers/googletts-proxy/index.js:61`, `workers/googletts-proxy/index.js:74`
- AssemblyAI treats missing `Origin` as local and allows `*`: `workers/assemblyai-proxy/index.js:23`, `workers/assemblyai-proxy/index.js:24`, `workers/assemblyai-proxy/index.js:37`

Recommendations:
1. Add real request authentication on these proxies (JWT/service token/HMAC).
2. Treat missing `Origin` as denied unless a valid non-browser auth token is present.
3. Keep rate limiting as defense-in-depth, not primary protection.

---

### GT-SEC-2026-003: Feedback list remains publicly enumerable
Severity: **Medium**  
Status: **Open**

Risk:
`GET /v1/feedback` is still intentionally public and returns the full `items` list. If records include sensitive data (message text, share links, media references), external parties can enumerate them from allowed origins.

Evidence:
- Public list path: `workers/feedback-proxy/index.js:99`, `workers/feedback-proxy/index.js:102`

Recommendations:
1. Require admin auth for list/read endpoints if feedback is not public by policy.
2. If public listing is required, return only redacted/minimal fields.
3. Add explicit retention and purge policy for stored feedback payloads and media metadata.

---

### GT-SEC-2026-004: CSP coverage incomplete across public entry points
Severity: **Medium**  
Status: **Open**

Risk:
Main apps have CSP, but several public pages do not. Missing CSP weakens XSS blast-radius controls.

Evidence:
- CSP present only in: `public/index.html:7`, `public/grid.html:45`, `public/home.html:108`, `public/mobile.html:43`
- No CSP meta in: `public/docs.html:1`, `public/debug.html:1`, `public/legal.html:1`, `public/404.html:1`

Recommendations:
1. Add CSP to all public HTML entry points.
2. Prefer edge/header CSP over only meta tags.
3. Keep a baseline CSP template and document route-level exceptions.

---

### GT-SEC-2026-005: YouTube proxy also accepts missing `Origin` as local
Severity: **Low**  
Status: **Open**

Risk:
`youtube-proxy` treats a missing `Origin` as local. This does not directly expose a shared paid API key, but it weakens consistency of origin enforcement and may increase attack surface for unauthenticated paths.

Evidence:
- Missing-origin considered local: `workers/youtube-proxy/index.js:23`, `workers/youtube-proxy/index.js:24`, `workers/youtube-proxy/index.js:35`

Recommendations:
1. Align with `share-proxy` style: explicit allowlist + `403` on unknown/missing origin.
2. Keep OAuth/session controls as primary auth, but tighten origin policy for consistency.

## Resolved Since Previous Audit
- `openai-proxy` removed from repository.
- Hardcoded IP privilege bypass removed from `openrouter-proxy`.
- `feedback-proxy` wildcard CORS fallback replaced with explicit allowlist rejection (`403`).

## Risk Matrix
- Critical: 0
- High: 1
- Medium: 2
- Low: 1

## Priority Remediation Plan
1. **Immediate (0-2 days)**: Add request authentication to `openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy`.
2. **Short term (3-7 days)**: Decide and enforce policy for `GET /v1/feedback` exposure.
3. **Short term (3-7 days)**: Add CSP to `docs.html`, `debug.html`, `legal.html`, `404.html`.
4. **Backlog (1-2 sprints)**: Normalize all workers to a single origin-validation utility/policy.

## Suggested Verification Checklist (Post-fix)
1. `curl` with forged `Origin` to key-backed proxies is rejected unless authenticated.
2. Requests without `Origin` are denied on all browser-facing workers.
3. `GET /v1/feedback` output matches explicit data exposure policy.
4. Every `public/*.html` entrypoint has explicit CSP (prefer response header).
