# GoToolkit contributor cheat sheet

This file is the short operational guide. Use the docs below as the canonical references when you need deeper detail:

- Architecture and data/storage model: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Automation and Playwright: [`docs/TESTING.md`](docs/TESTING.md)
- Security and space auth: [`docs/SECURITY.MD`](docs/SECURITY.MD)

## Decision rules
- If the task touches storage, sync, cloud data flow, or worker responsibilities, open [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- If the task touches DOM injection, CSP, OAuth, auth headers, or protected-space rules, open [`docs/SECURITY.MD`](docs/SECURITY.MD).
- If the task touches Playwright, repros, browser automation, or test coverage, open [`docs/TESTING.md`](docs/TESTING.md).

## Core layout
- Static app entry points live in `public/`.
- Workers live in `workers/`.
- `public/index.html` is the Docs app entry point.
- `public/prompt.js` is the root for AI system prompts/templates.

## High-value rules
- Bump the version only when the user asks for a `bump`, `commit`, or `push`.
- If the user request changes architecture, security, cloud/share auth, or testing workflow/coverage, update the matching reference docs in the same task as needed:
  - [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  - [`docs/SECURITY.MD`](docs/SECURITY.MD)
  - [`docs/TESTING.md`](docs/TESTING.md)
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

## Frontend security
- Follow [`docs/SECURITY.MD`](docs/SECURITY.MD) for DOM rendering, sanitization, CSP, and share auth rules.
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
- If the user asks to deploy workers, automatically deploy each modified worker with Wrangler using credentials from `.env.local`.
  - First verify auth with `npx wrangler whoami`.
  - Then deploy only the touched workers through `scripts/with-env-local.sh`.
  - Do not deploy untouched workers by default.
- Release flow:
  - run `npm run check:csp`
  - then `npm run bump`
  - include the versioned static entry files updated by the bump
  - then commit and push
  - do not deploy Firebase Hosting directly from this workflow

## CSP hash workflow (inline scripts)
- For inline `<script>` changes in `public/index.html`, `public/grid.html`, or `public/mobile.html`, run `npm run csp:inline:sync`.
- Treat `scripts/csp-common.js` as canonical and keep CSP mirrors aligned.
- After inline script edits, do a quick runtime smoke check for console `ReferenceError`s before push.

## Testing defaults
- Before running Playwright, ensure the test server is running on `:5000`; if not, start it with `npm run start:test`.
- When a request explicitly asks for Playwright/browser automation, use the `playwright` Codex skill workflow first, then adapt to the repo constraints.
- On this machine, do not use the bundled Playwright CLI wrapper from the Codex skill; it targets the `chrome` channel and fails here.
- On WSL, do not run Playwright from `/mnt/c/...`; use `npm run playwright:linux:mirror` or `npm run playwright:linux:test -- ...`.
- During local Playwright iteration, skip `npm run check:csp`; if you changed an inline script in CSP scope, run `npm run csp:inline:sync` before browser repros.
- Follow [`docs/TESTING.md`](docs/TESTING.md) for the full Playwright workflow, logging pattern, Turnstile/tour handling, artifact naming, and `spaceCode` bootstrap rules.

## Cloud/share essentials
- For the full share model, routes, storage split, and auth details, follow [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/SECURITY.MD`](docs/SECURITY.MD).

## Quick diagnostics
- `git status --short`
- `rg -n "<feature|error|token>" public workers -S`
- `node --check <touched-js-file>`
- `npm run check:csp`
