# GoToolkit Security Assessment

Date: 2026-02-28
Reviewer: Codex
Method: repository-grounded static review of `public/`, `src/`, `workers/`, and hosting CSP config

## Executive Summary

The codebase has several solid controls in place: explicit origin checks on browser-facing workers, Turnstile support on expensive proxy routes, short-lived `X-Space-Auth` tokens for protected share operations, replay protection for sync, authenticated and space-scoped asset reads in `share-proxy`, and server-side OAuth token storage with `HttpOnly` cookies.

The main remaining risks are concentrated in two areas:

1. Browser-side storage and global exposure of third-party API keys.
2. A permissive CSP that still allows inline script execution and does not define `frame-ancestors`.

Two previously material worker findings are no longer current in this repository state: share asset reads are now protected by `X-Space-Auth`, and protected `pages` / `pages-meta` writes no longer fall back to `"golive"` when `spaceId` is missing or invalid.

I did not find a single code path that is obviously critical and immediately exploitable without additional conditions. The highest-confidence issues are architectural and trust-boundary weaknesses that materially increase blast radius if any XSS, browser compromise, or malicious browser context occurs.

## Scope

- Frontend HTML and browser JS in `public/`
- Memo editor React bridge in `src/memo-*`
- Cloudflare Workers in `workers/`
- Hosting CSP in `firebase.json`

## Findings

### GTK-001

- Severity: High
- Title: Third-party API keys are stored in `localStorage` and exposed on `window`
- Location:
  - [public/js/ia-config.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-config.js#L35)
  - [public/js/ia-config.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-config.js#L91)
  - [public/js/ia-config.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-config.js#L156)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L10993)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L11010)
  - [public/home.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/home.html#L1574)
  - [public/home.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/home.html#L1615)
- Evidence:
  - `safeStorageWrite()` persists OpenRouter and Google TTS keys to `localStorage`.
  - Settings save flows write AssemblyAI keys to `localStorage`.
  - Runtime also mirrors keys onto globals such as `window.GoToolkitAssemblyAiKey` and `window.GoToolkitGoogleTtsApiKey`.
- Impact: Any XSS in the app, malicious browser extension, or local browser compromise can immediately recover these paid API credentials and reuse them outside the app.
- Why this matters here: the app already handles rich content, embeds, imported documents, and large client-side state. That makes "browser-resident secret" a high-blast-radius trust decision.
- Recommended fix:
  - Prefer worker-held secrets and scoped server-side token minting wherever possible.
  - If user-supplied keys must remain a product feature, avoid mirroring them onto `window`, minimize persistence, and document clearly that they are user-managed browser secrets rather than protected credentials.
  - Consider `sessionStorage` or explicit "remember this key" opt-in for the least durable cases.

### GTK-002

- Severity: Medium
- Title: CSP still permits inline scripts and does not define `frame-ancestors`
- Location:
  - [firebase.json](/mnt/c/Users/tranx/Documents/Github/gotoolkit/firebase.json#L21)
  - [firebase.json](/mnt/c/Users/tranx/Documents/Github/gotoolkit/firebase.json#L22)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L7)
  - [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L8)
- Evidence:
  - The CSP includes `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ...`.
  - The policy does not include `frame-ancestors`.
- Impact:
  - `unsafe-inline` substantially reduces CSP value as an XSS mitigation.
  - Without `frame-ancestors`, the app lacks an explicit clickjacking policy in the visible hosting config.
- False positive note: some inline script allowances may be required by the current static architecture. If so, the issue is still real, but the mitigation path is incremental rather than immediate.
- Recommended fix:
  - Move remaining inline scripts to external files and migrate toward nonce- or hash-based script policy.
  - Add `frame-ancestors 'self'` if embedding is not a product requirement.
  - Reassess whether `wasm-unsafe-eval` is strictly required for the current shipped paths.

## Positive Controls Observed

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

## Suggested Remediation Order

1. Reduce browser secret exposure by removing `window` mirrors and minimizing persistent key storage.
2. Tighten CSP after inventorying the remaining inline script dependencies.
3. Audit legacy protected records in `pages` / `pages-meta` to ensure no old data still depends on pre-fix `spaceId` defaults.
