# Security Audit

Point-in-time code review of the current repository on March 5, 2026.

Scope:
- Browser application code in `public/`
- Proxy workers in `workers/`

Method:
- Static review only
- Findings are limited to issues directly evidenced by inspected code paths
- Priorities are relative to likely impact and ease of abuse

## Executive Summary

The main remaining risks are:
- CSP still permits inline styles (`style-src 'unsafe-inline'`) and depends on hash maintenance for inline scripts
- rich HTML rendering still exists through controlled parsing helpers (`createContextualFragment`) and must remain trusted/sanitized
- AI debug traces are now metadata-only (improved), but still persist in `sessionStorage` for the active tab

## Findings

### 1. Low: Rich HTML rendering paths remain and should stay constrained

Risk:
- HTML parsing remains a potential XSS vector when fed with attacker-controlled content.
- Dynamic icon/label rendering has been migrated to `textContent` + DOM builders, reducing direct sink exposure.
- Risk now mainly comes from trusted-rich-render helpers if future changes pass untrusted strings.

Evidence:
- [public/js/assist.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/assist.js#L1049)
- [public/js/voice.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/voice.js#L1290)
- [public/js/voice-audio-player.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/voice-audio-player.js#L387)
- [public/js/voice-video-player.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/voice-video-player.js#L634)

Code:
- Current dynamic UI paths in core modules (`assist`, `document-panel`, `config-modal`, `scan`, `index-gallery`, `grid`, `voice`) are DOM-based.
- No direct `innerHTML = ...` assignment remains in `public/` source files (excluding bundled artifacts).
- Rich rendering now relies on controlled fragment parsing (`createContextualFragment`) and DOMParser-based parsing.

Recommended guardrails:
- Keep `textContent`, explicit `createElement`, and attribute setters as default.
- Keep centralized wrappers (like `setTrustedHtml`) as single choke points for rich HTML insertion.
- Keep strict rules: only trusted/sanitized HTML can reach fragment parsing helpers.

### 2. Low: CSP hardened for scripts; residual inline-style/hash maintenance risk remains

Risk:
- `script-src` is now significantly stricter (no `'unsafe-inline'`), but policy still allows inline styles.
- Inline script execution now relies on explicit hashes; future inline changes can break at runtime if hashes are not refreshed.
- CSP is duplicated in HTML meta + hosting headers, which increases drift risk.

Evidence:
- [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L7)
- [public/mobile.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/mobile.html#L43)
- [firebase.json](/mnt/c/Users/tranx/Documents/Github/gotoolkit/firebase.json#L22)

Code:
- `script-src` no longer includes `'unsafe-inline'`; it uses `'unsafe-hashes'` plus explicit `sha256-...` allowlist.
- `style-src` still includes `'unsafe-inline'`.
- CSP exists both as HTML meta and hosting headers (aligned through consistency checks).

Recommended fix:
- Keep reducing inline scripts by migrating to external bundles to lower hash-churn/operational risk.
- Plan a second phase to reduce/remove `'unsafe-inline'` from `style-src`.
- Keep CSP as a single canonical source (scripted generation/validation) to avoid header/meta drift.

### 3. Low: AI debug traces persist in `sessionStorage` (metadata only)

Risk:
- Data is no longer full prompt/response payloads, but still visible to scripts in the active tab.
- Any XSS in-session can read these traces.

Evidence:
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L782)
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L823)
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L838)

Code:
- `recordAIRequest(...)` and `recordAIResponse(...)` store metadata (`kind`, token counts, message-role summary), not full bodies.
- Storage target is `sessionStorage`.

Recommended fix:
- Keep metadata minimal and bounded.
- Consider in-memory only when debugging is not needed across page refresh.

## Priority Order

1. Reduce remaining CSP inline allowances (`style-src`) and inline-script hash maintenance burden.
2. Keep rich HTML helper inputs trusted/sanitized and audited.
3. Minimize session-scoped AI debug metadata persistence.

## Notes

- This is a static audit, not a penetration test.
- Absence from this file does not imply a path is secure; it only means no confirmed issue was identified in inspected scope.
