# GoToolkit Security Assessment

Date: 2026-02-28
Reviewer: Codex
Method: repository-grounded static review of `public/`, `src/`, `workers/`, and hosting CSP config

## Executive Summary

The codebase has several solid controls in place: explicit origin checks on browser-facing workers, Turnstile support on expensive proxy routes, short-lived `X-Space-Auth` tokens for protected share operations, replay protection for sync, authenticated and space-scoped asset reads in `share-proxy`, and server-side OAuth token storage with `HttpOnly` cookies.

The main remaining risk is now concentrated in one area:

1. A permissive CSP that still allows inline script execution and keeps a broad script execution posture.

Two previously material worker findings are no longer current in this repository state: share asset reads are now protected by `X-Space-Auth`, and protected `pages` / `pages-meta` writes no longer fall back to `"golive"` when `spaceId` is missing or invalid.

I did not find a single code path that is obviously critical and immediately exploitable without additional conditions. The highest-confidence issues are architectural and trust-boundary weaknesses that materially increase blast radius if any XSS, browser compromise, or malicious browser context occurs.

This reassessment confirms the earlier worker hardening is still effective in the current repo state: the browser client still uses `"golive"` as a default space in several local/runtime helpers, but protected `pages` / `pages-meta` writes in `share-proxy` continue to require an explicit valid `payload.spaceId` and do not silently re-scope writes server-side.

## Scope

- Frontend HTML and browser JS in `public/`
- Memo editor React bridge in `src/memo-*`
- Cloudflare Workers in `workers/`
- Hosting CSP in `firebase.json`

## Findings

### GTK-001

- Severity: Medium
- Title: CSP still permits inline scripts and keeps a broad script execution posture
- Location:
  - [firebase.json](/mnt/c/Users/tranx/Documents/Github/gotoolkit/firebase.json#L21)
  - [firebase.json](/mnt/c/Users/tranx/Documents/Github/gotoolkit/firebase.json#L22)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L7)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L8)
- Evidence:
  - The CSP includes `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ...`.
  - `frame-ancestors 'self'` is now present, but `unsafe-inline` still weakens CSP as an XSS mitigation and `wasm-unsafe-eval` remains broadly enabled.
- Impact:
  - `unsafe-inline` substantially reduces CSP value as an XSS mitigation.
  - A broad script execution policy leaves more room than necessary for unexpected code execution paths if a browser-side injection occurs.
- False positive note: some inline script allowances may be required by the current static architecture. If so, the issue is still real, but the mitigation path is incremental rather than immediate.
- Recommended fix:
  - Move remaining inline scripts to external files and migrate toward nonce- or hash-based script policy.
  - Narrow `wasm-unsafe-eval` to only the pages or bundles that genuinely require it, if any.
  - Reassess whether `wasm-unsafe-eval` is strictly required for the current shipped paths.

## Positive Controls Observed

- Browser-managed third-party API key usage has been removed from the browser runtime: OpenRouter and Google TTS getters return empty values, and AssemblyAI browser-key reads now return empty as well.
  - [public/js/ia-config.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-config.js#L86)
  - [public/js/voice.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/voice.js#L479)
- The app CSP now declares `frame-ancestors 'self'`, and several small head bootstrap scripts have already been externalized from the HTML entrypoints.
  - [firebase.json](/mnt/c/Users/tranx/Documents/Github/gotoolkit/firebase.json#L22)
  - [scripts/csp-common.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/scripts/csp-common.js#L1)
  - [public/js/bootstrap-theme.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/bootstrap-theme.js)
- `share-proxy` requires `X-Space-Auth` for protected collections and for asset reads, writes, and deletes.
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1747)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1781)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1819)
- `share-proxy` rejects missing or invalid `payload.spaceId` for protected `pages` and `pages-meta` writes instead of silently defaulting to `"golive"`.
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L248)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L2301)
- `share-proxy` issues short-lived space tokens instead of long-lived bearer credentials.
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1724)
- OAuth workers use `HttpOnly`, `Secure`, `SameSite=None` cookies.
  - [workers/youtube-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/youtube-proxy/index.js#L120)
- OAuth callback `postMessage` targets an explicit normalized origin rather than `"*"`.
  - [workers/youtube-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/youtube-proxy/index.js#L508)
  - [workers/youtube-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/youtube-proxy/index.js#L513)
- External video embeds in the memo editor are constrained to YouTube and Loom URL parsing rather than arbitrary iframe URLs.
  - [src/memo-editor/simple-editor.tsx](/mnt/c/Users/tranx/Documents/Github/gotoolkit/src/memo-editor/simple-editor.tsx#L1275)

## Areas Reviewed But Not Escalated To Findings

- Markdown preview rendering appears to escape input before generating HTML.
  - [public/js/document-markdown.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/document-markdown.js#L146)
- Worker origin allowlists and Turnstile gates are present on cost-bearing proxy routes.
  - [workers/openrouter-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openrouter-proxy/index.js#L35)
  - [workers/openrouter-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openrouter-proxy/index.js#L65)
- The browser client still carries `"golive"` defaults in several local share/sync helpers, but the previously material tenant-scoping risk remains mitigated because server-side protected writes reject missing or malformed `payload.spaceId`.
  - [public/js/share-worker-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/share-worker-client.js#L384)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L248)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L2301)

## Suggested Remediation Order

1. Finish externalizing the larger inline runtime scripts so `unsafe-inline` can be removed.
2. Audit legacy protected records in `pages` / `pages-meta` to ensure no old data still depends on pre-fix `spaceId` defaults.
3. Reassess whether `wasm-unsafe-eval` is required across every app entrypoint.
