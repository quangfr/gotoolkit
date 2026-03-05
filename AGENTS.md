# GoToolkit contributor cheat sheet

This file is the short operational guide. Use the docs below as the canonical references when you need deeper detail:

- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Data model and storage: [`docs/DATA.md`](docs/DATA.md)
- Automation and Playwright: [`docs/AUTOMATION.md`](docs/AUTOMATION.md)
- Security and space auth: [`docs/SECURITY.MD`](docs/SECURITY.MD)

## Core layout
- Static app entry points live in `public/`.
- Workers live in `workers/`.
- `public/index.html` is the Docs app entry point.
- `public/prompt.js` is the root for AI system prompts/templates.

## High-value rules
- Bump the version only when the user asks for a `bump`, `commit`, or `push`.
- When asked to `commit` or `push`, run `npm run bump` first.
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
- Release flow:
  - for any request involving `bump`, `commit`, or `push`, run `npm run bump` first
  - then commit and push (do not deploy Firebase Hosting directly from this workflow)
- When editing CSP in HTML or `firebase.json`, follow the CSP workflow below, then run `npm run check:csp`.

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
- Prefer the local Playwright binary: `./node_modules/.bin/playwright test ... --workers=1 --reporter=line`.
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
- For cloud reads, the safe fetch order is: auth -> tree -> `pages-meta` -> `pages`.
- For managed-space `spaceCode` issues, verify both the worker secret and D1 `space_code_hashes` alignment.

## Quick diagnostics
- `git status --short`
- `rg -n "<feature|error|token>" public workers -S`
- `node --check <touched-js-file>`
- `npm run check:csp`
- `curl -i -H 'Content-Type: application/json' -d '{"spaceId":"<id>","spaceCode":"<code>"}' https://share.gotoolkit.workers.dev/v1/spaces/auth`

## When to open the reference docs
- Open [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for module boundaries, sync architecture, and app responsibilities.
- Open [`docs/DATA.md`](docs/DATA.md) for IndexedDB stores, cloud drafts, share-history, and payload structure.
- Open [`docs/AUTOMATION.md`](docs/AUTOMATION.md) for Playwright strategy, `spaceCode` bootstrap, and CI guidance.
- Open [`docs/SECURITY.MD`](docs/SECURITY.MD) for CSP, OAuth, managed spaces, `contentKey`, and auth headers.
