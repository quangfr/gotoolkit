# GoToolkit Test Guide

Date: 2026-03-01
Purpose: describe how to automate testing, cloud document manipulation, browser-session reuse, worker verification, deployment checks, and CI regression coverage in the current repo
Audience: coding agents and maintainers working from the repo and terminal

## 0. When to use this doc

Open this file when you need to answer questions like:

- how to reproduce a UI bug quickly on this machine
- how to bootstrap a cloud/share test without full OAuth UI
- how Playwright should be run under WSL
- which spec or helper should cover a regression

## 0. Fast paths

Use these as the default entry points before reading the full guide.

- UI repro on this machine
  - `npm run start:test`
  - `npm run playwright:linux:test -- tests/<spec>.spec.ts --workers=1 --reporter=line --config=playwright.config.ts`

- Cloud/share repro
  - bootstrap with `spaceCode` first
  - prefer direct worker setup + focused Playwright verification

- Worker auth or share-route repro
  - verify the route directly with `curl` or `fetch`
  - then run one focused Playwright spec only if UI confirmation matters

- Iterating on inline-script UI bugs
  - run `npm run csp:inline:sync`
  - do not run `npm run check:csp` on every local repro loop

### 0.0 Triage matrix

Use this before changing app code:

- editor content is wrong before reload
  - likely editor, switch, or save-path bug
  - inspect the visible editor first, then rerun the closest `private-switch-*` or `cloud-switch-*` spec

- editor is correct but local persisted state is wrong
  - likely snapshot, open-doc, `share-history`, or cloud-draft bug
  - compare editor output with IndexedDB `documents`, `share-history`, and `cloud-drafts`

- local persisted state is correct but remote `pages` is wrong
  - likely sync timing, worker write, or worker read/materialization bug
  - compare local draft state with remote `pages-meta` and `pages`, and do not assume rate limiting without `429` or failed batch evidence

- remote `pages` looks stale before final reload or sync
  - first confirm whether the latest edits are still unsynced local drafts
  - for rapid cloud-switch repros, prefer final reload + sync before asserting remote content

## 0.1 Core rules

- Prefer a real spec under `tests/` over ad hoc scripts for any non-trivial repro.
- On WSL, run Playwright from the Linux mirror, not `/mnt/c/...`.
- Dismiss the docs tour unless it is the subject of the test.
- Add step logs plus `console`, `pageerror`, `request`, and `response` listeners before rewriting a repro.
- Use `spaceCode` bootstrap first for cloud coverage; fall back to OAuth UI only when the auth UX itself is under test.

## 1. Main automation surfaces

The repo already supports four automation layers:

- browser automation with Playwright
- direct API automation against workers
- persistent browser/session state reuse
- deploy/smoke automation through Wrangler and `.env.local`

Most useful flows combine them: bootstrap through API, reuse state in Playwright, verify with UI plus worker/storage assertions.

## 2. What is already available

Current built-in automation hooks in the repo:

- `playwright.config.ts`
- `npm run start:test`
- `npm run playwright:auth:bootstrap`
- `npm run playwright:persist`
- `npm run playwright:persist:headed`
- `scripts/playwright-auth-bootstrap.mjs`
- `scripts/playwright-persist.sh`
- `tests/cloud-sync-persist.spec.ts`
- `tests/cloud-private-transfer-sync.spec.ts`
- `tests/cloud-switch-persist.spec.ts`
- `tests/cloud-rapid-switch-large.spec.ts`
- `tests/private-switch-persist.spec.ts`
- `tests/private-switch-rapid-repro.spec.ts`
- `tests/space-code-rotate.spec.ts`
- `scripts/with-env-local.sh`

Current useful worker/API surfaces:

- `POST /v1/spaces/auth`
- `POST /v1/spaces/auth/rotate`
- `GET /v1/shares/pages?view=tree&spaceId=...`
- `GET /v1/shares/pages-meta/:id`
- `GET /v1/shares/pages/:id`
- `POST /v1/assets/upload`
- `GET /v1/assets/:id`
- `DELETE /v1/assets/:id`

### 2.1 Current test inventory

Functional intent of the tests currently present in `tests/`:

- `private-switch-persist.spec.ts`
  - verifies that edits on private documents survive document switching and a full page reload

- `private-switch-rapid-repro.spec.ts`
  - stress repro for rapid private-page switching while typing, followed by a reload check on both pages

- `cloud-sync-persist.spec.ts`
  - end-to-end cloud persistence scenario covering create, edit, rename, move, reorder, delete, sync, reload, and remote state verification

- `cloud-switch-persist.spec.ts`
  - verifies that edits on cloud documents survive switching between cloud pages and remain present after reload

- `cloud-switch-noop-pending.spec.ts`
  - verifies that switching between cloud pages without edits does not create a pending draft or sync badge

- `cloud-rapid-switch-large.spec.ts`
  - stress repro for 3 cloud pages seeded with large content, then 12 rapid edit/switch operations with refresh, sync, and reload validation
  - current expected outcome: pass after final reload + sync; do not assert latest markers in remote `pages` before that final sync because the last edits may still be local drafts

- `cloud-private-transfer-sync.spec.ts`
  - verifies two transfer paths: copying a cloud document to private storage and promoting a private document to cloud storage, with sync persistence checks

- `cloud-spacecode-bootstrap.spec.ts`
  - verifies space access bootstrap with `spaceCode` without OAuth UI, and verifies that cloud drafts persist across reload and flush correctly on sync

- `cloud-archive-retry.spec.ts`
  - verifies that an archive operation remains queued after a transient failure and is retried successfully on the next sync

- `cloud-draft-archive-ops.spec.ts`
  - verifies local draft semantics: archive and delete drafts remain terminal operations and are not overwritten by later non-terminal updates

- `space-code-rotate.spec.ts`
  - verifies protected-space lifecycle around create/rotate/delete: create a protected space, write a cloud document, rotate the space code, confirm the old code is rejected, confirm the document remains readable with the new code across reload and sync, then delete the protected space with the admin create secret

- `microsoft-oauth-proxy.spec.ts`
  - covers Microsoft OAuth integration in four layers: contract-level popup handshake through `ms-proxy`, real Microsoft login and managed space loading, auth state capture for reuse, and interactive headed popup debugging

Shared test helpers:

- `helpers/cloud-auth.ts`
  - opens `index.html`, bootstraps cloud access, and authenticates with `spaceCode`

- `helpers/share-test-space.ts`
  - exposes the configured Playwright test space ID and code from the environment

- `helpers/memo-ui.ts`
  - provides common memo UI operations used by Playwright specs: waiting for the editor, opening a document, typing into the visible editor, refreshing the explorer, dismissing the docs tour, and triggering cloud sync

## 3. Recommended automation model

For this repo, the default model is:

1. bootstrap or bypass auth once
2. persist browser/session state locally
3. reuse that state across runs
4. do setup and verification through APIs when possible
5. keep UI tests focused on real user behavior

## 4. Bypassing OAuth for cloud document automation

There are two practical paths.

### 4.1 Preferred path for managed spaces: use `identityToken`

Current code already supports managed-space auth through OAuth-derived identity assertions:

- `workers/ms-proxy/index.js` can mint an `identityToken`
- `public/js/share-worker-client.js` listens to `go-toolkit:microsoft-oauth-success`
- `workers/share-proxy/index.js` accepts `identityToken` in `POST /v1/spaces/auth` when `spaceCode` is omitted

This means browser automation does not need full Microsoft OAuth every run.

Preferred options:

- capture a valid browser session once and reuse it
- inject a synthetic `go-toolkit:microsoft-oauth-success` event when a valid `identityToken` is already available
- call `POST /v1/spaces/auth` directly with a valid `identityToken`

### 4.2 Direct path for non-managed or test spaces: use `spaceCode`

For automation, test spaces are simpler than OAuth.

Current Playwright config already supports:

- `PW_TEST_SPACE_ID`
- `PW_TEST_SPACE_CODE`

Preferred usage:

- create or maintain one dedicated automation/test space
- upsert that space locally in `GoToolkitSpaces` with `id + spaceJoinCode` before cloud writes
- prefer the browser-client bootstrap path (`goToolkitShareWorker.verifySpaceCredentials(...)`) over manual UI login when the test only needs cloud access
- authenticate with `POST /v1/spaces/auth`
- reuse returned `token` as `X-Space-Auth`
- reuse returned `contentKey` for encrypted page/media handling

This is the cleanest way to manipulate cloud documents programmatically without UI login.

Operational note:

- in Playwright, the most reliable readiness gate is the minimum bootstrap state: `goToolkitShareWorker.isReady` and `GoToolkitSpaces.upsertSpace`
- do not block on broader app readiness if the test only needs cloud auth/bootstrap

## 5. Programmatic cloud document manipulation

Preserve this API order:

1. `POST /v1/spaces/auth`
2. `GET /v1/shares/pages?view=tree&spaceId=...`
3. `GET /v1/shares/pages-meta/:id`
4. `GET /v1/shares/pages/:id`
5. write/update through the browser client path or equivalent authenticated worker calls

Required headers for authenticated reads/writes:

- `X-Space-Id`
- `X-Space-Auth`

Required sync headers for protected write flows:

- `X-Sync-Session`
- `X-Sync-JTI`
- `X-Sync-TS`

Important constraints:

- payloads may be encrypted and require `contentKey`
- some large payloads may be offloaded by reference
- assets are space-scoped and enforced server-side

## 6. Browser automation with persistent local sessions

Current repo support:

- `playwright.config.ts` supports `storageState`
- `scripts/playwright-auth-bootstrap.mjs` writes `.tmp/playwright-storage-state.json`
- `PW_PERSIST_PROFILE=1` switches Playwright to single-worker persistent-profile mode

Recommended usage:

- keep a persistent profile in `.tmp/playwright-profile`
- keep reusable auth state in `.tmp/playwright-storage-state.json`
- use `./node_modules/.bin/playwright ... --workers=1`
- prefer `waitUntil: "commit"` or `domcontentloaded` on `index.html`
- prestart the server with `npm run start:test`

### 6.0 Canonical local Playwright workflow

Use this exact workflow for local UI debugging and repros on this repo:

1. start the app with `npm run start:test`
2. if you are on WSL, create or refresh the persistent Linux mirror with `npm run playwright:linux:mirror`; do not run Playwright from `/mnt/c/...`
3. write or reuse a real spec under `tests/`
4. attach listeners for `console`, `pageerror`, `request`, and `response` before navigation
5. add explicit `console.log` step markers before every intended UI interaction
6. suppress the docs tour unless the tour itself is under test
7. keep worker repros focused on route behavior, CORS, and rate limiting
8. run the repo-local binary from the Linux mirror: `./node_modules/.bin/playwright test ... --workers=1 --reporter=line`, or use `npm run playwright:linux:test -- ...`
9. keep the instrumentation in place until the failing stage is isolated; do not keep rewriting the harness blindly between runs

This is the minimum standard for non-trivial UI debugging.

Persistent Linux mirror details:

- `npm run playwright:linux:mirror` syncs the current repo into `~/.cache/gotoolkit-playwright` by default
- override the location with `PW_LINUX_MIRROR_DIR=/path/to/mirror`
- the script keeps the mirror between runs, performs one full sync on first use, then switches to incremental sync based on the Git worktree
- force a clean resync with `PW_LINUX_MIRROR_FULL_SYNC=1 npm run playwright:linux:mirror`
- the script only re-runs `npm ci` when `package-lock.json` changed or `node_modules/` is missing
- `test-results/`, `playwright-report/`, `.tmp/`, and `tmp/` stay local to each side and are not copied into the mirror
- after the sync, change into the printed mirror path and run Playwright there
- `npm run playwright:linux:test -- tests/foo.spec.ts --workers=1 --reporter=line` refreshes the mirror and runs Playwright from it in one command

Generic step-logging pattern:

- define one small helper near the top of the spec, for example `const logStep = (label, details) => console.log("[spec-name] " + label, details ?? "");`
- emit one log before each meaningful UI step and one after each state-changing phase completes
- keep labels stable and action-oriented, for example `connect-space:start`, `connect-space:done`, `delete-root:start`, `delete-root:done`
- log the final remote or storage snapshot before assertions when the scenario depends on async sync behavior
- attach Playwright listeners before navigation and print them in a compact format:
  - `page.on("console", msg => console.log("[browser:console]", msg.type(), msg.text()))`
  - `page.on("pageerror", err => console.log("[browser:pageerror]", err.message))`
  - `page.on("request", req => ...)` and `page.on("response", res => ...)` when network ordering matters
- keep this instrumentation in the spec until the failing stage is isolated; remove or reduce it only after the repro is stable

The goal is to learn exactly where the scenario stopped without rewriting the test harness on every rerun.

Fast isolation rules from the latest cloud-sync investigation:

- for rapid cloud-switch repros, treat pre-reload remote `pages` reads as potentially stale when the last edits are still unsynced drafts
- if the failure appears only in remote assertions, compare all three layers before changing app code:
  - editor content
  - local `share-history` / cloud drafts
  - remote `pages`
- when a batch write reports success, verify whether the bug is on write, sync timing, or read/materialization before assuming rate limiting
- disable unrelated subsystems in the repro first when they add noise, for example remote `pages-history` writes

Important CSP constraint:

- `npm run start:test` does not disable CSP
- this app enforces CSP through HTML `<meta http-equiv="Content-Security-Policy">` tags
- because of that, a permissive test server header is not enough to bypass a broken inline-script hash
- if you changed an inline script in `public/index.html`, `public/grid.html`, or `public/mobile.html`, run `npm run csp:inline:sync` before local browser repros
- reserve `npm run check:csp` for merge/release validation and for any `bump` / `commit` / `push` request; it should not be part of every Playwright iteration loop

### 6.1 UI testing workflow for local/private pages

For fast local/private UI debugging:

1. prestart with `npm run start:test`
2. navigate to `http://127.0.0.1:5000/index`
3. use `waitUntil: "commit"` or `domcontentloaded`
4. wait for the exact mounted feature you need
5. keep the test local-only unless cloud behavior is the target

Practical guidance:

- prefer the repo-local Playwright runtime over the bundled Codex wrapper
- on WSL, use the Linux mirror
- prefer a real spec under `tests/` over an ad hoc script
- attach listeners before navigation
- use explicit readiness selectors such as visible controls or feature APIs
- suppress the docs tour and set local state directly when the repro allows it
- distinguish “browser never sent the request” from “worker rejected it” through network events

### 6.2 Visual capture workflow (video + step screenshots)

Use one consistent capture style:

- prestart app with `npm run start:test` and close the tour overlay
- render a visible white pointer cursor + yellow click ring
- no global `slowMo`; pace with explicit waits and `0.5s` cursor travel before clicks and input progressive typing
- keep artifacts under `test-recordings/` and `test-screenshots/`
- video name: `test-recordings/<test-name>-<YYYY-MM-DD-HHMMSS>.webm`
- screenshot name: `test-screenshots/step-XX-<step-name>-<test-name>-<YYYY-MM-DD-HHMMSS>.png`
- keep artifacts untracked unless explicitly requested

## 7. Programmatic access to browser-local persisted state

The app stores important state in:

- `localStorage`
- IndexedDB `go-toolkit`
- IndexedDB `gotoolkit-documents`

Programmatic automation options:

- Playwright `page.evaluate(...)` for localStorage/sessionStorage reads/writes
- Playwright page scripts to inspect IndexedDB contents
- a repo-local Node helper for selected store dumps

Important rule:

- never rely on imported Node constants directly inside `page.evaluate(...)`
- always pass values as explicit arguments

High-value stores for automation:

- `document-api`
- `share-history`
- `cloud-drafts`
- `voice-recordings`
- `documents`
- `chunks`
- `memo_context_embeddings`

Useful assertions:

- document exists locally after creation/import
- cloud draft queue changed after edit/move/delete
- share history reflects cloud state
- a voice recording linked to a memo exists in `voice-recordings`
- RAG ingestion created `documents` and `chunks`

## 8. Automating local/cloud edit flows

The most reliable pattern is:

1. seed data through API or local storage helper
2. open browser with persistent session
3. perform the minimum UI actions needed for the target feature
4. verify both UI state and underlying storage/API state


## 9. Worker development automation

Worker automation sequence after changes:

1. syntax check or local targeted verification
2. deploy the changed worker only through `scripts/with-env-local.sh`
3. smoke it with `curl`
4. run one focused UI or API regression on the changed path

## 10. Worker verification patterns

### `share-proxy`

Automate these checks:

- `POST /v1/spaces/auth` success with valid space auth input
- `POST /v1/spaces/auth` failure with invalid auth input
- tree fetch with `X-Space-Auth`
- metadata fetch with `X-Space-Auth`
- content fetch with `X-Space-Auth`
- asset upload/read/delete with matching `spaceId`
- sync-protected write rejection when `X-Sync-*` is missing or invalid

### OAuth workers

Automate these checks:

- `/oauth/start` or equivalent route responds
- missing `OAUTH_DB` path fails in expected way
- callback path rejects invalid state
- authenticated session returns identity payload

### Cost-bearing proxy workers

Automate these checks:

- allowed origin works
- bad origin fails
- rate-limited route rejects excess requests
- configured secret/env path succeeds when present

## 11. Playwright performance improvements

Current repo guidance is already good. The next useful improvements are:

- segment suites into local persistence, cloud sync, worker/API verification, and OAuth/session flows
- do API-first setup before UI when possible: authenticate space, seed or clean remote data, then open the browser
- keep reusable fixtures for authenticated cloud context, seeded test space, and clean local IndexedDB state
- collect traces/screenshots/videos on failure in CI and on-demand locally, not on every passing run
- keep running Playwright from the Linux mirror on WSL instead of `/mnt/c/...`

## 12. Good CI candidates

The goal is not to put every scenario in CI. The goal is to prevent regressions cheaply.

Recommended CI tiers:

### Fast checks on every PR

- `npm run check:csp`
- targeted `node --check` for touched JS files
- targeted build if touched code requires it
- one or two fast Playwright local-persistence tests

### Medium checks on every PR touching cloud/share/workers

- `tests/cloud-sync-persist.spec.ts`
- `tests/cloud-private-transfer-sync.spec.ts`
- `tests/cloud-archive-retry.spec.ts`
- `tests/cloud-draft-terminal-ops.spec.ts`
- one API smoke script for `share-proxy`

### Conditional checks on worker changes

If `workers/share-proxy/**` changed:

- auth flow smoke
- tree/meta/content smoke
- asset scope smoke

If `workers/ms-proxy/**` or other OAuth worker changed:

- OAuth state/session smoke
- identity payload smoke

If `workers/openrouter-proxy/**`, `workers/googletts-proxy/**`, or `workers/assemblyai-proxy/**` changed:

- CORS smoke
- rate-limit smoke
- happy-path env check

## 13. High-value regression suites to add

The repo already has cloud/private persistence coverage. The best additions would be:

- managed-space auth bootstrap tests using `identityToken` without full OAuth UI
- IndexedDB assertion helpers for `document-api`, `cloud-drafts`, `voice-recordings`, and RAG stores
- a stable shared-server cloud suite against a prestarted `npm run start:test` server
- a cloud asset round-trip test covering upload, reload, prefetch/download, and rendering
- worker contract tests for key status codes, headers, and minimal response shapes
- space auth rotation regression for managed-space D1 hash alignment

## 14. Possible implementation helpers

These would materially improve automation productivity:

- `scripts/cloud-auth.mjs` to authenticate a space once and print/export reusable headers
- `scripts/cloud-seed.mjs` to create, update, archive, or clean remote test documents
- `tests/helpers/indexeddb.ts` to inspect `go-toolkit` and `gotoolkit-documents` stores from Playwright
- `tests/helpers/oauth-bootstrap.ts` to capture or inject reusable managed-space OAuth identity state
- `scripts/worker-smoke.mjs` to run standardized post-deploy worker smoke checks

## 15. Practical defaults for agents

When automating work in this repo:

- prefer API bootstrap over repeated UI login
- prefer dedicated test spaces over production-managed spaces
- reuse persistent browser state
- prefer `spaceCode` bootstrap for non-managed/test-space coverage
- verify both UI result and underlying storage/API result
- deploy only changed workers
- run one focused regression after each worker or sync change
