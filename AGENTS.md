# GoToolkit contributor cheat sheet

This file is the short operational guide. Use the docs below as the canonical references when you need deeper detail:

- Architecture and data/storage model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Automation and Playwright: [`docs/TEST.md`](docs/TEST.md)
- Security and space auth: [`docs/SECURITY.MD`](docs/SECURITY.MD)

## Core layout
- Static app entry points live in `public/`.
- Workers live in `workers/`.
- `public/index.html` is the Docs app entry point.
- `public/prompt.js` is the root for AI system prompts/templates.

## High-value rules
- Bump the version only when the user asks for a `bump`, `commit`, or `push`.
- After any HTML/CSS edit in the CSP scope (`public/index.html`, `public/grid.html`, `public/mobile.html`, `public/styles/*`, and CSP mirror/config files), run:
  - `npm run csp:inline:sync`
- For any request involving `bump`, `commit`, or `push`, run:
  - `npm run check:csp`
- Only after CSP hash workflow passes, run `npm run bump`.
- Commit title format: `vYYYY.MM.DD.N : <summary>` with a summary under 15 words.
- Keep the IndexedDB repair version in `public/js/assist.js` aligned with `DB_VERSION` in `public/js/document-rag.js`.
- Reuse existing colors/classes from `public/styles/style.css` before adding new CSS.
- Only `public/js` should attach application globals to `window`.
- Do not edit `public/content/index_releases.md` or `public/content/index_roadmap.md` unless explicitly asked.

## Frontend security (DOM rendering)
- Treat `innerHTML` as unsafe by default.
- Prefer:
  - `textContent` for user/content text
  - `document.createElement(...)` + `appendChild(...)` for UI structure
  - explicit `setAttribute(...)` for attributes (including icon names)
- For icon-only buttons, prefer helper functions that create `<i data-lucide="...">` nodes from normalized icon names (allow `[a-z0-9-]` only, fallback otherwise).
- If line breaks are needed for plain text, build `<br>` nodes instead of `innerHTML = escapedText.replace(...)`.
- Only allow HTML injection when all of the following are true:
  - rich HTML rendering is required (markdown/preview/editor use case)
  - content is sanitized by a trusted sanitizer first
  - the reason is documented in code comments near the sink
- For rich HTML parse/transform/serialize paths (for example `DOMParser` -> modify nodes -> `doc.body.innerHTML`):
  - run a dedicated sanitizer pass on the parsed document before serialization
  - remove active/unsafe nodes (`script`, `iframe`, `object`, `embed`, `template`, form controls)
  - strip unsafe attributes (`on*`, `srcdoc`) and block `javascript:` URLs
  - enforce protocol allowlists per attribute context (`href`, `src`, `xlink:href`, `poster`)
  - add `rel="noopener noreferrer"` on `<a>` nodes
  - centralize this in one helper per module instead of duplicating ad hoc filtering
- Safe resets like `el.innerHTML = ""` are acceptable for clearing containers.
- Before merging frontend changes, run:
  - `rg -n "\\binnerHTML\\b" public -S -g '!**/*.map'`
  - `node --check <touched-js-file>`

## Build and runtime
- Dev server: `npm start` on port `5000`.
- Preferred Playwright server: `npm run start:test`.
- Full build: `npm run build`.
- Use targeted builds when possible:
  - run memo builds only for memo-side `src/` changes
  - run draw/connect builds only for draw-side `src/` changes
- After modifying a worker, deploy that worker with Wrangler through `scripts/with-env-local.sh`.
- If the user asks to deploy workers, automatically deploy each modified worker with Wrangler using credentials from `.env.local`.
  - First verify auth with `npx wrangler whoami`.
  - Then deploy only the touched workers, for example:
    - `./scripts/with-env-local.sh npx wrangler deploy --config workers/share-proxy/wrangler.toml`
  - Do not deploy untouched workers by default.
- Release flow:
  - for any request involving `bump`, `commit`, or `push`, run `npm run check:csp`
  - then run `npm run bump`
  - then commit and push (do not deploy Firebase Hosting directly from this workflow)

## CSP hash workflow (inline scripts)
- Scope: inline `<script>` changes in `public/index.html`, `public/grid.html`, or `public/mobile.html`.
- Step 1: run `npm run csp:inline:sync` (recompute + apply `sha256-...` hashes).
- Treat `scripts/csp-common.js` as canonical; keep CSP in HTML meta tags and `firebase.json` in sync with it.
- Apply the same hash list to all app CSP mirrors (`public/index.html`, `public/grid.html`, `public/mobile.html`, and both Hosting CSP headers in `firebase.json`).
- Step 2: run `npm run check:csp` before merge/push.
  - this now verifies both mirror alignment and inline hash coverage
- After inline script edits in `public/index.html`, run a quick runtime smoke check and confirm there are no console `ReferenceError` failures before push.
- If an inline block uses helpers defined in another script block, either expose the helper on `window` intentionally or provide a local fallback in the dependent block.

## Testing defaults
- On app launch for tests, always click to close the onboarding/tour overlay (`docs-tour-overlay`) before interacting with the UI.
- Before running Playwright, ensure the test server is running on `:5000`; if not, start it with `npm run start:test`.
- Prefer the local Playwright binary: `./node_modules/.bin/playwright test ... --workers=1 --reporter=line`.
- When a request explicitly asks for Playwright/browser automation, use the `playwright` Codex skill workflow first, then adapt to the repo constraints in this section.
- For recording artifacts, follow `docs/TEST.md` naming: write videos under `test-recordings/` with `test-name` + timestamp, and screenshots under `test-screenshots/` with `step-XX-step-name` + `test-name` + timestamp.
- On this machine, do not use the bundled Playwright CLI wrapper from the Codex skill; it targets the `chrome` channel and fails because Chrome is not installed here. Use the repo-local `playwright` package (`./node_modules/.bin/playwright ...`) or small ad hoc Node scripts with `require("playwright")` instead.
- Prestart the server when possible; grouped cloud suites are more stable against a prestarted `start:test` server than Playwright-managed `webServer` restarts.
- For cloud/test-space coverage, prefer `spaceCode` bootstrap over repeated OAuth UI.
- In Playwright, avoid `waitUntil: "load"` on `index.html`; prefer `commit` or `domcontentloaded`, then wait for the exact app primitive you need.
- Inside `page.evaluate(...)`, do not rely on imported Node constants; pass values explicitly as arguments.

## Cloud/share essentials
- `public/js/share-worker-client.js` is the main browser client for cloud shares.
- `workers/share-proxy` is the main worker for shared pages/assets.
- Shared content uses `pages`; shared tree/meta uses `pages-meta`.
- Authenticate protected spaces through `POST /v1/spaces/auth`.
- Reuse returned `X-Space-Auth`, `X-Space-Id`, and `contentKey` for protected operations.
- Protected worker routes also require the sync anti-replay headers:
  - `X-Sync-Session`
  - `X-Sync-JTI`
  - `X-Sync-TS`
- When calling protected worker routes manually, send both the space auth headers and the sync headers:
  - `X-Space-Id`
  - `X-Space-Auth`
  - `X-Sync-Session`
  - `X-Sync-JTI`
  - `X-Sync-TS`
- For cloud reads, the safe fetch order is: auth -> tree -> `pages-meta` -> `pages`.
- For managed-space `spaceCode` issues, verify both the worker secret and D1 `space_code_hashes` alignment.
- Asset downloads and cleanup now also depend on `.env.local` values loaded through `scripts/with-env-local.sh`:
  - `ASSETS_R2_CODE` for the global R2 asset encryption key
  - `ASSETS_CLEANUP_SECRET` for manual asset admin routes such as cleanup/migration

## Quick diagnostics
- `git status --short`
- `rg -n "<feature|error|token>" public workers -S`
- `node --check <touched-js-file>`
- `npm run check:csp`
- `curl -i -H 'Content-Type: application/json' -d '{"spaceId":"<id>","spaceCode":"<code>"}' https://share.gotoolkit.workers.dev/v1/spaces/auth`

## When to open the reference docs
- Open [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for module boundaries, sync architecture, app responsibilities, IndexedDB stores, cloud drafts, share-history, and payload structure.
- Open [`docs/TEST.md`](docs/TEST.md) for Playwright strategy, `spaceCode` bootstrap, and CI guidance.
- Open [`docs/SECURITY.MD`](docs/SECURITY.MD) for CSP, OAuth, managed spaces, `contentKey`, and auth headers.
