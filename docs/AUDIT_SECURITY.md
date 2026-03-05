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

The strongest controls are now in place for worker-side access control and anti-abuse: scoped `X-Space-Auth` tokens, sync replay protection, OAuth state one-time consumption, origin allowlists, and Turnstile validation with `hostname` + `action` checks in API proxy workers.

The main remaining risks are frontend hardening gaps:
- CSP still permits inline script/style
- a reduced set of `innerHTML` paths remain (mostly static modal templates and container clears)
- AI debug traces are now metadata-only (improved), but still persist in `sessionStorage` for the active tab

## Findings

### 1. Low: Residual `innerHTML` sinks remain and should stay constrained

Risk:
- `innerHTML` is a direct DOM XSS sink when data becomes attacker-controlled.
- Most dynamic icon/label rendering has been migrated to `textContent` + DOM builders, reducing exposure.
- Remaining uses are mainly static templates and reset operations; risk rises if future changes add untrusted interpolation.

Evidence:
- [public/js/voice.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/voice.js#L1252)
- [public/js/voice-audio-player.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/voice-audio-player.js#L364)
- [public/js/voice-video-player.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/voice-video-player.js#L585)

Code:
- Current dynamic UI paths in core modules (`assist`, `document-panel`, `config-modal`, `scan`, `index-gallery`, `grid`, `voice`) are now mostly DOM-based.
- Remaining `innerHTML` paths are primarily:
  - static modal shell templates
  - container clears (`el.innerHTML = ""`)
  - a few intentionally rich-content renderers that must stay sanitized

Recommended fix:
- Keep `textContent`, explicit `createElement`, and attribute setters as default.
- Allow `innerHTML` only for static literals or pre-sanitized content, with a local comment when intentional.

### 2. Medium: CSP still allows inline execution paths (`'unsafe-inline'`)

Risk:
- `'unsafe-inline'` materially reduces CSP’s XSS containment value.
- Meta-tag CSP remains weaker than header-only enforcement for earliest parse protection.

Evidence:
- [public/index.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/index.html#L7)
- [public/mobile.html](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/mobile.html#L43)
- [firebase.json](/mnt/c/Users/tranx/Documents/Github/gotoolkit/firebase.json#L21)

Code:
- `script-src` and `style-src` include `'unsafe-inline'`.
- CSP exists both as HTML meta and hosting headers.

Recommended fix:
- Migrate inline scripts to external bundles or nonce/hash strategy.
- Remove `'unsafe-inline'` from `script-src` first, then reduce inline styles.

### 3. Low: AI debug traces persist in `sessionStorage` (metadata only)

Risk:
- Data is no longer full prompt/response payloads, but still visible to scripts in the active tab.
- Any XSS in-session can read these traces.

Evidence:
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L780)
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L823)
- [public/js/ia-client.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-client.js#L838)

Code:
- `recordAIRequest(...)` and `recordAIResponse(...)` store metadata (`kind`, token counts, message-role summary), not full bodies.
- Storage target is `sessionStorage`.

Recommended fix:
- Keep metadata minimal and bounded.
- Consider in-memory only when debugging is not needed across page refresh.

## Closed Since Previous Audit

### A. Turnstile validation now checks returned context

Status: resolved

Evidence:
- [workers/openrouter-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/openrouter-proxy/index.js#L135)
- [workers/googletts-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/googletts-proxy/index.js#L173)
- [workers/assemblyai-proxy/index.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/workers/assemblyai-proxy/index.js#L117)

What changed:
- Workers reject token success when `hostname` is outside allowlist.
- Workers reject action mismatches (`chat`/`embeddings`/route-specific action).

### B. Legacy frontend API-key methods are no longer exposed

Status: resolved

Evidence:
- [public/js/ia-config.js](/mnt/c/Users/tranx/Documents/Github/gotoolkit/public/js/ia-config.js#L57)

What changed:
- `ia-config.js` no longer exposes `setApiKey(...)` / `setOpenRouterApiKey(...)`.
- Backend selection remains forced to proxy-backed OpenRouter flow.

## Priority Order

1. Tighten CSP by removing inline allowances over time.
2. Keep reducing remaining `innerHTML` exceptions and protect rich HTML paths with sanitization.
3. Minimize session-scoped AI debug metadata persistence.

## Notes

- This is a static audit, not a penetration test.
- Absence from this file does not imply a path is secure; it only means no confirmed issue was identified in inspected scope.
