# Security Audit

Point-in-time code review of the current repository on March 3, 2026.

Scope:
- Browser application code in `public/`
- Proxy workers in `workers/`

Method:
- Static review only
- Findings are limited to issues directly evidenced by the code paths inspected
- Priorities are relative to likely impact and ease of abuse

## Executive Summary

The codebase has several solid controls already in place, including CSP, worker-side auth gates, Turnstile enforcement in proxy workers, replay protection in sync flows, and removal of the old `home.html` entry point. The most important remaining issues are now hardening gaps rather than obvious secret leaks: full AI payloads are still cached on the client (now in `sessionStorage` instead of `localStorage`), some UI paths still build DOM with raw `innerHTML`, and Turnstile validation in the worker accepts any successful token without verifying returned metadata such as hostname or action.

## Findings

### 1. Medium: AI request and response payloads are still cached in browser `sessionStorage`

Risk:
- Full AI prompts and model responses can contain sensitive user content, copied documents, or confidential context.
- `sessionStorage` is shorter-lived than `localStorage`, but it is still readable by any script running on the same origin, including future XSS in the active tab.
- This increases the blast radius of any frontend compromise.

Evidence:
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L683)
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L694)

Code:
- `recordAIRequest(...)` stores `goToolkit.chat.lastAIRequest`
- `recordAIResponse(...)` stores `goToolkit.chat.lastAIResponse`
- both now write to `sessionStorage`, not `localStorage`

Why this matters:
- These are not just UI preferences. They are full serialized payloads.
- A successful XSS or malicious extension can still exfiltrate previous prompts and responses from the active tab without needing to intercept live traffic.

Recommended fix:
- Prefer in-memory storage over persistent browser storage when possible.
- If session-scoped debugging remains necessary, store redacted metadata rather than full prompt/response bodies.
- If persistence is unavoidable, store only redacted metadata such as timestamp, model, and request ID.

### 2. Low: Legacy API-key methods remain exposed in the frontend config surface

Risk:
- The frontend config layer still exposes legacy API-key methods even though browser-stored API keys are no longer supported.
- These methods are now no-ops, so the direct storage risk is removed, but the surface area still creates ambiguity for future maintenance.

Evidence:
- [public/js/ia-config.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-config.js#L62)
- [public/js/ia-config.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-config.js#L89)

Code:
- `ia-config.js` still exposes legacy `setApiKey(...)` and `setOpenRouterApiKey(...)` methods
- Those methods are part of the browser config surface even though API keys are no longer supported
- The methods are currently explicit no-ops and do not write to browser storage

Why this matters:
- Legacy key-handling interfaces in frontend code create ambiguity about whether browser-stored secrets are supported.
- This is primarily a maintainability and clarity issue now, not an active secret leak.

Recommended fix:
- Remove the legacy API-key methods entirely if no caller still requires them.
- Keep secret material server-side only.
- If compatibility must remain, keep them as no-ops and document that they are deprecated.

### 3. Medium: Turnstile verification accepts `success` only and does not validate returned hostname or action

Risk:
- The worker trusts any token that Cloudflare marks as successful, without binding that token to the expected hostname or intended action.
- This weakens provenance checks and reduces defense-in-depth around anti-bot verification.

Evidence:
- [workers/openrouter-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openrouter-proxy/index.js#L65)
- [workers/openrouter-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openrouter-proxy/index.js#L91)

Code:
- `enforceTurnstile(...)` submits the token to `siteverify`
- The response is rejected only when `!response.ok || !result?.success`
- The code does not inspect returned `hostname`, `action`, or other verification metadata

Why this matters:
- Successful verification alone is weaker than successful verification plus context binding.
- If Turnstile is used to protect distinct routes/actions, validating the returned action adds another constraint against token misuse.

Recommended fix:
- Validate `result.hostname` against the expected allowed hostname(s).
- Validate `result.action` against the route-specific expected action when provided.
- Log and reject tokens that are successful but context-mismatched.

### 4. Medium: Several UI paths inject dynamic values with raw `innerHTML`

Risk:
- Dynamic values inserted into `innerHTML` become DOM XSS sinks if those values are attacker-controlled now or in a future refactor.
- This is especially relevant in a content-heavy app where labels, titles, presets, or imported template data may eventually come from sync or external sources.

Evidence:
- [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L9977)
- [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L11866)
- [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L12298)
- [public/js/document-panel.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/document-panel.js#L214)
- [public/js/document-panel.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/document-panel.js#L2135)

Code:
- `convertTemplateHtmlToMarkdown(html)` parses incoming HTML via `container.innerHTML = html`
- Multiple UI builders render labels/titles/icons with template literals directly into `innerHTML`

Why this matters:
- Some of these values may be internal today, but the sink is still unsafe by default.
- As soon as a value is user-controlled, synced, or externally imported, the pattern becomes exploitable.

Recommended fix:
- Replace `innerHTML` with DOM node construction using `textContent`, `setAttribute`, and explicit element creation.
- If HTML parsing is required for trusted documents, sanitize before assigning.
- Treat icon names and labels as untrusted data unless they are hardcoded.

### 5. Medium: CSP is delivered by HTML meta tag and still permits inline script/style execution

Risk:
- Allowing `'unsafe-inline'` weakens CSP as an XSS mitigation.
- A meta-delivered CSP is also weaker than an HTTP response header and cannot protect the initial parse the same way a header can.

Evidence:
- [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L7)

Code:
- CSP is defined with `<meta http-equiv="Content-Security-Policy" ...>`
- `script-src` includes `'unsafe-inline'`
- `style-src` includes `'unsafe-inline'`

Why this matters:
- CSP is most valuable when it blocks inline script injection.
- The current policy still provides useful restrictions, but it does not provide strong XSS containment.

Recommended fix:
- Move CSP to HTTP response headers wherever possible.
- Replace inline scripts with external files or nonce/hash-based allowances.
- Remove `'unsafe-inline'` from `script-src` first, then reduce inline style dependence over time.

## Priority Order

1. Remove or redact full AI request/response payload storage in the browser.
2. Harden worker-side Turnstile verification by checking returned metadata.
3. Eliminate dynamic `innerHTML` sinks in UI rendering paths.
4. Strengthen CSP by moving to headers and reducing inline allowances.
5. Remove or formally deprecate remaining legacy API-key methods.

## Notes

- This is a static audit, not a penetration test.
- Absence from this file does not imply a code path is secure; it only means it was not identified as a confirmed issue in the inspected scope.
- Some issues above become materially worse if an XSS bug already exists, which is why frontend storage and `innerHTML` usage still rank highly even after the `sessionStorage` migration.
