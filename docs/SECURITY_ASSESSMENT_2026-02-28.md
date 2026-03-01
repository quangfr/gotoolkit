# GoToolkit Security Assessment

Date: 2026-02-28
Reviewer: Codex
Method: repository-grounded static review of `public/`, `src/`, `workers/`, and hosting CSP config

## Executive Summary

The codebase has several solid controls already in place: explicit origin checks on browser-facing workers, Turnstile support on expensive proxy routes, short-lived `X-Space-Auth` tokens for protected share operations, replay protection for sync, and server-side OAuth token storage with `HttpOnly` cookies.

The main remaining risks are concentrated in four areas:

1. Browser-side storage and global exposure of third-party API keys.
2. Public-by-URL asset reads in `share-proxy`.
3. A hardcoded fallback that treats missing `spaceId` as `golive`.
4. A permissive CSP that still allows inline script execution and does not define `frame-ancestors`.

I did not find a single code path that is obviously critical and immediately exploitable without additional conditions. The highest-confidence issues are architectural and trust-boundary weaknesses that materially increase blast radius if any XSS, browser compromise, or data-model drift occurs.

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

- Severity: High
- Title: Share assets are readable without `X-Space-Auth` and are returned as publicly cacheable objects
- Location:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1738)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1747)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1750)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1174)
- Evidence:
  - `GET /v1/assets/:id` reads directly from R2 and returns the body without checking `X-Space-Id` or `X-Space-Auth`.
  - Responses are marked `Cache-Control: public, max-age=31536000, immutable`.
  - Uploads do tag objects with `customMetadata.spaceId`, but that metadata is only enforced for `DELETE`, not `GET`.
- Impact: Any party that obtains an asset URL can fetch the object directly and cross-origin. The object then becomes effectively bearer-by-URL and may also be retained by downstream caches for a year.
- False positive note: if public asset URLs are an intentional product requirement, this is a design tradeoff rather than an implementation bug. The current code should then document that shared assets are public-by-URL, because the write path suggests stronger space scoping than the read path actually enforces.
- Recommended fix:
  - Require valid space auth for asset reads on protected spaces, or
  - issue signed short-lived download URLs/tokens, or
  - explicitly separate "public assets" from "space-private assets" at the route and storage-model level.

### GTK-003

- Severity: Medium
- Title: Missing `spaceId` is silently coerced to `golive`
- Location:
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L248)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L249)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1950)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1993)
- Evidence:
  - `resolvePayloadSpaceId(payload)` returns `normalizeSpaceId(payload?.spaceId || "golive")`.
  - That resolver is then used to scope protected `pages` and `pages-meta` reads and writes.
- Impact: Any record that omits `payload.spaceId` is treated as belonging to `golive`. In a multi-space system, silent tenant defaults are dangerous because malformed, legacy, or partially migrated records can be mis-scoped instead of being rejected.
- Why this matters here: protected collections are explicitly space-scoped elsewhere. A permissive default works against that boundary.
- Recommended fix:
  - Remove the `"golive"` default from protected collection scoping.
  - Reject writes for `pages` and `pages-meta` when `payload.spaceId` is absent or invalid.
  - For legacy data, run an explicit migration instead of depending on an implicit default.

### GTK-004

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

- `share-proxy` requires `X-Space-Auth` for protected collections and asset writes/deletes.
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1765)
  - [workers/share-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/share-proxy/index.js#L1852)
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

1. Decide whether shared assets are intended to be public-by-URL. If not, fix `GET /v1/assets/:id` first.
2. Remove the implicit `golive` tenant fallback and make missing `spaceId` a hard error for protected collections.
3. Reduce browser secret exposure by removing `window` mirrors and minimizing persistent key storage.
4. Tighten CSP after inventorying the remaining inline script dependencies.
