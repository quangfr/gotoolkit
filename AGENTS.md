# GoToolkit agent guide

This file is the short operational guide for AI agents and contributors working in this repo.

Use it for the default workflow and repo-specific rules. For deeper detail, open the canonical docs:

- Architecture, storage, sync, cloud flows: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Security, CSP, OAuth, protected spaces: [`docs/SECURITY.MD`](docs/SECURITY.MD)
- Playwright, repro workflow, coverage map: [`docs/TESTING.md`](docs/TESTING.md)

## Default workflow

When the user asks for a change, follow this order unless the task clearly does not need it:

1. Read the relevant code and the matching reference doc if the task touches architecture, security, or testing.
2. Make the smallest change that solves the request cleanly.
3. Update any repo docs that are part of the same contract.
4. Run the narrowest useful validation.
5. Only run release steps when the user explicitly asks for `bump`, `commit`, or `push`.

## When to open which doc

- Open [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for:
  - storage
  - sync
  - cloud/shared pages
  - worker responsibilities

- Open [`docs/SECURITY.MD`](docs/SECURITY.MD) for:
  - DOM rendering
  - CSP
  - OAuth
  - auth headers
  - protected/shared space rules

- Open [`docs/TESTING.md`](docs/TESTING.md) for:
  - Playwright
  - browser repros
  - coverage updates
  - WSL test execution

## Repo map

- `public/`: static frontend
- `public/index.html`: main Docs app entry
- `public/grid.html`: Grid app entry
- `public/mobile.html`: mobile app entry
- `public/data/`: frontend static config and prompt/preset data
- `public/docs/`: Markdown content served to the frontend
- `public/js/`: app runtime scripts and generated bundles
- `src/`: React/TypeScript sources compiled into `public/js/`
- `workers/`: Cloudflare Workers
- `tests/`: Playwright specs, helpers, fixtures, debug scripts
- `scripts/`: build, CSP, versioning, Playwright, utility scripts
- `.tmp/`: local runtime artifacts only

## High-value rules

- Only bump the version when the user explicitly asks for `bump`, `commit`, or `push`.
- When creating a commit, use this message format:
  `v(version number) : 3-8 words summary of changes`
  Body: `3-10` bullet items, each `5-18` words, summarizing the main changes.
- If the task changes architecture, security, cloud/share auth, or test workflow/coverage, update the matching reference doc in the same task.
- When updating a reference doc, refresh its visible date or last-updated field in the same edit.
- Do not edit `public/docs/index_releases.md` or `public/docs/index_roadmap.md` unless explicitly asked.
- Keep the IndexedDB repair version in `public/js/assist.js` aligned with `DB_VERSION` in `public/js/document-rag.js`.
- Reuse existing colors/classes from `public/styles/style.css` before adding new CSS.
- Only `public/js` should attach application globals to `window`.

## Local commands

- Install: `npm install`
- App server: `npm start`
- Preferred Playwright server: `npm run start:test`
- Dev watch: `npm run dev`
- Build: `npm run build`
- CSP inline sync: `npm run csp:inline:sync`
- CSP verification: `npm run check:csp`

## Frontend and CSP rules

Run `npm run csp:inline:sync` after changes to:

- `public/index.html`
- `public/grid.html`
- `public/mobile.html`
- `public/styles/*`
- CSP mirror/config files

Before merging frontend JS changes, run:

- `rg -n "\\binnerHTML\\b" public -S -g '!**/*.map'`
- `node --check <touched-js-file>`

Treat `scripts/csp-common.js` as canonical for CSP-related checks.

## Testing rules

- Before Playwright, ensure the test server is available on `:5000`; otherwise start it with `npm run start:test`.
- Prefer the repo Playwright workflow over ad hoc local wrappers.
- On this machine, do not use the bundled Playwright Codex wrapper that targets the `chrome` channel.
- On WSL, do not run Playwright from `/mnt/c/...`; use:
  - `npm run playwright:linux:mirror`
  - `npm run playwright:linux:test -- ...`
- During local Playwright iteration, skip `npm run check:csp` unless the user explicitly asked for release-oriented validation.
- If you changed inline scripts in CSP scope, run `npm run csp:inline:sync` before browser repros.
- Keep reusable Playwright sample files in `tests/fixtures/`.
- Keep Playwright local artifacts in `tests/results/`.
- Keep ad hoc test/debug scripts in `tests/debug/`.
- After any requested Playwright execution, verify the coverage-map update in [`docs/TESTING.md`](docs/TESTING.md).
- If a suite still shows `duration not measured separately`, rerun that suite or tier through the repo wrapper so metrics are written back correctly.

## Build and deployment rules

- Use targeted builds when possible:
  - memo-side `src/` changes -> prefer memo build path
  - draw-side `src/` changes -> prefer draw build path

- If the user asks to deploy workers:
  1. verify auth with `npx wrangler whoami`
  2. deploy only modified workers
  3. use `scripts/with-env-local.sh`
  4. do not deploy untouched workers by default

- Release flow when explicitly requested:
  1. `npm run check:csp`
  2. `npm run bump`
  3. include updated versioned static entry files
  4. commit and push

- Do not deploy Firebase Hosting as part of the default release workflow.

## Quick diagnostics

- `git status --short`
- `rg -n "<feature|error|token>" public workers -S`
- `node --check <touched-js-file>`
- `npm run check:csp`
