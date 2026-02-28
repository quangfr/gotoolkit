# GoToolkit Security Audit

Date: 2026-02-27  
Auditor: Static code audit (repository analysis)  
Scope: `public/` frontend and `workers/` Cloudflare Workers

## Executive Summary
Overall posture: **Medium risk**.

The latest changes removed `openai-proxy`, removed the `openrouter-proxy` IP bypass, and retired `feedback-proxy`. Remaining risk is concentrated in worker proxies that still rely on CORS/origin checks as the primary gate and in incomplete CSP coverage on static pages.

## Methodology
- Manual static review of worker request gates (Origin/CORS/auth/rate-limit).
- Route-by-route inspection of sensitive endpoints (AI proxy and OAuth workers).
- HTML entrypoint review for CSP presence.

Limitations:
- No dynamic penetration test.
- No live Cloudflare/WAF configuration verification.

## Verified Security Controls
- `share-proxy` rejects unknown origins with explicit `403`.  
  Evidence: `workers/share-proxy/index.js:1364`, `workers/share-proxy/index.js:1368`
- `openrouter-proxy` no longer has hardcoded IP whitelist bypass and now uses strict origin allowlist resolution.  
  Evidence: `workers/openrouter-proxy/index.js:1`, `workers/openrouter-proxy/index.js:17`, `workers/openrouter-proxy/index.js:51`, `workers/openrouter-proxy/index.js:92`
- OAuth workers enforce origin checks and require `Origin` for non-GET requests.  
  Evidence: `workers/gmail-proxy/index.js:631`, `workers/gmail-proxy/index.js:639`, `workers/notion-proxy/index.js:1044`, `workers/ms-proxy/index.js:511`
- OAuth session cookies are still configured with `HttpOnly`, `Secure`, `SameSite=None`.  
  Evidence: `workers/gmail-proxy/index.js:116`, `workers/notion-proxy/index.js:110`, `workers/ms-proxy/index.js:110`

## Findings

### GT-SEC-2026-001: CORS is still used as primary access control on key-backed proxies
Severity: **High**  
Status: **Mitigated (2026-02-28)**

Risk:
`openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy` previously trusted allowlisted origins without an additional browser friction layer. Non-browser clients could forge an `Origin` header and consume paid upstream APIs.

Evidence:
- OpenRouter uses origin allowlist + forwards shared key: `workers/openrouter-proxy/index.js:35`, `workers/openrouter-proxy/index.js:51`, `workers/openrouter-proxy/index.js:138`
- Google TTS treats missing `Origin` as local and allows `*`: `workers/googletts-proxy/index.js:60`, `workers/googletts-proxy/index.js:61`, `workers/googletts-proxy/index.js:74`
- AssemblyAI treats missing `Origin` as local and allows `*`: `workers/assemblyai-proxy/index.js:23`, `workers/assemblyai-proxy/index.js:24`, `workers/assemblyai-proxy/index.js:37`

Remediation:
- `openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy` now reject missing/unknown `Origin` with explicit `403`.
- Cloudflare Turnstile is now configured on `openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy` for browser-facing requests.
- Frontend browser calls now request a Turnstile token and send it via `X-Turnstile-Token` before calling these proxies.
- `youtube-proxy` origin handling was aligned with the stricter `share-proxy` pattern.

Residual risk:
Turnstile is bot-friction, not durable API authentication. A determined attacker with a real browser can still reach these routes, so signed request auth remains the stronger long-term option if abuse continues.

---

### GT-SEC-2026-004: CSP coverage incomplete across public entry points
Severity: **Medium**  
Status: **Resolved (2026-02-28)**

Risk:
Main apps had CSP, but several public pages did not. Missing CSP weakens XSS blast-radius controls.

Evidence:
- CSP present only in: `public/index.html:7`, `public/grid.html:45`, `public/home.html:108`, `public/mobile.html:43`
- No CSP meta in: `public/docs.html:1`, `public/debug.html:1`, `public/legal.html:1`, `public/404.html:1`

Remediation:
- Added CSP meta tags to `public/docs.html`, `public/debug.html`, `public/legal.html`, and `public/404.html`.
- Added a baseline `Content-Security-Policy` response header for HTML routes in `firebase.json` so deployed Hosting serves CSP at the edge/header layer as well.

Notes:
Meta tags are retained as a fallback, but the preferred policy is now the Hosting response header. Route-specific CSP exceptions should continue to be documented when needed.

---

### GT-SEC-2026-005: YouTube proxy also accepts missing `Origin` as local
Severity: **Low**  
Status: **Resolved (2026-02-28)**

Risk:
`youtube-proxy` treats a missing `Origin` as local. This does not directly expose a shared paid API key, but it weakens consistency of origin enforcement and may increase attack surface for unauthenticated paths.

Evidence:
- Missing-origin considered local: `workers/youtube-proxy/index.js:23`, `workers/youtube-proxy/index.js:24`, `workers/youtube-proxy/index.js:35`

Recommendations:
1. Keep OAuth/session controls as primary auth.
2. Keep origin enforcement aligned with the stricter worker pattern.

## Resolved Since Previous Audit
- `openai-proxy` removed from repository.
- Hardcoded IP privilege bypass removed from `openrouter-proxy`.
- `feedback-proxy` removed from repository.

## Risk Matrix
- Critical: 0
- High: 1
- Medium: 1
- Low: 1

## Priority Remediation Plan
1. **Short term (3-7 days)**: Wire frontend Turnstile token collection for browser calls into `openrouter-proxy`, `googletts-proxy`, and `assemblyai-proxy`.
2. **Backlog (1-2 sprints)**: Evaluate signed request auth for high-value proxy routes if abuse continues.
3. **Backlog (1-2 sprints)**: Normalize all workers to a single origin-validation utility/policy.

## Suggested Verification Checklist (Post-fix)
1. `curl` with forged `Origin` to key-backed proxies is rejected unless authenticated.
2. Requests without `Origin` are denied on all browser-facing workers.
3. Every `public/*.html` entrypoint has explicit CSP, with Hosting serving a CSP response header on deployed HTML routes.
