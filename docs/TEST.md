# GoToolkit Test Guide

Date: 2026-03-01
Purpose: describe how to automate testing, cloud document manipulation, browser-session reuse, worker verification, deployment checks, and CI regression coverage in the current repo
Audience: coding agents and maintainers working from the repo and terminal

## 1. Main automation surfaces

The current codebase already allows automation at four levels:

- browser automation with Playwright
- direct API automation against `share-proxy` and other workers
- local browser-state automation through persistent Playwright profiles and storage state
- deploy/smoke automation for Cloudflare Workers through Wrangler and `.env.local`

In practice, most useful test flows are combinations of these layers:

- bootstrap auth or cloud access through API
- reuse the resulting browser/session state in Playwright
- manipulate local and cloud documents
- verify worker behavior directly with API calls
- deploy changed workers and run smoke checks

## 2. What is already available

Current built-in automation hooks in the repo:

- `playwright.config.ts`
- `npm run start:test`
- `npm run playwright:auth:bootstrap`
- `npm run playwright:persist`
- `npm run playwright:persist:headed`
- `scripts/playwright-auth-bootstrap.mjs`
- `scripts/playwright-persist.sh`
- `tests/playwright-search-ui-scenario.mjs`
- `tests/cloud-sync-persist.spec.ts`
- `tests/cloud-private-transfer-sync.spec.ts`
- `tests/cloud-switch-persist.spec.ts`
- `tests/private-switch-persist.spec.ts`
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

## 3. Recommended automation model

For this repo, the most productive model is:

1. bootstrap or bypass auth once
2. persist browser/session state locally
3. reuse the same browser state across many Playwright runs
4. call cloud APIs directly for setup and verification
5. keep UI tests focused on real user behavior, not repetitive login/setup

That avoids paying the cost of OAuth flows and browser cold starts in every test.

## 4. Bypassing OAuth for cloud document automation

There are two practical paths.

### 4.1 Preferred path for managed spaces: use `identityToken`

Current code already supports managed-space auth through OAuth-derived identity assertions:

- `workers/ms-proxy/index.js` can mint an `identityToken`
- `public/js/share-worker-client.js` listens to `go-toolkit:microsoft-oauth-success`
- `workers/share-proxy/index.js` accepts `identityToken` in `POST /v1/spaces/auth` when `spaceCode` is omitted

This means browser automation does not need to click through full Microsoft OAuth every time.

Productive automation options:

- capture a valid browser session once and reuse it
- inject a synthetic `go-toolkit:microsoft-oauth-success` event in a controlled test environment if a valid `identityToken` is already available
- call `POST /v1/spaces/auth` directly with a valid `identityToken` to obtain `X-Space-Auth` and `contentKey`

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

Operational note from current tests:

- in Playwright, the most reliable readiness gate for this path is the minimum bootstrap state:
  `goToolkitShareWorker.isReady` and `GoToolkitSpaces.upsertSpace`
- do not block on broader app readiness if the test only needs cloud auth/bootstrap

## 5. Programmatic cloud document manipulation

The recommended API order is already established in `AGENTS.md` and should be preserved:

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

Important current constraint:

- payloads may be encrypted and require `contentKey`
- some large payloads may be offloaded by reference
- assets are space-scoped and enforced server-side

So API-based automation must not assume:

- plaintext page JSON
- inline payload only
- asset access without `spaceId` scope

## 6. Browser automation with persistent local sessions

Current repo support:

- `playwright.config.ts` supports `storageState`
- `scripts/playwright-auth-bootstrap.mjs` writes `.tmp/playwright-storage-state.json`
- `PW_PERSIST_PROFILE=1` switches Playwright to single-worker persistent-profile mode

Recommended usage:

- keep a persistent profile in `.tmp/playwright-profile`
- keep reusable auth state in `.tmp/playwright-storage-state.json`
- reuse that state across iterative test runs

Best use cases:

- cloud document debugging
- managed-space UI flows
- long-running local persistence tests
- reproducing regressions without relogging

Current performance tips that should stay standard:

- prestart the server with `npm run start:test`
- run `./node_modules/.bin/playwright ...` instead of `npx`
- use `--workers=1` when reusing a persistent profile
- use persistent context for local debugging
- use `storageState` for login reuse
- navigate directly to target pages

Additional improvements worth adopting:

- keep separate profiles per suite type, for example:
  - `.tmp/playwright-profile-cloud`
  - `.tmp/playwright-profile-local`
- add a small helper to clear only app IndexedDB stores without destroying login state
- split auth bootstrap from content bootstrap so tests can reuse auth while resetting data
- capture and reuse a pre-authenticated cloud space state file per environment

Practical reliability notes for this repo:

- `index.html` is heavy; avoid `page.goto(..., { waitUntil: "load" })` and `page.reload(..., { waitUntil: "load" })` in cloud flows
- prefer `waitUntil: "commit"` or `domcontentloaded`, then wait explicitly for the app primitive you need
- when running many cloud specs in one command, prefer a prestarted server (`npm run start:test`) over relying on Playwright-managed `webServer`

### 6.1 UI testing workflow for local/private pages

For fast UI debugging on private pages, use a lightweight local-only workflow:

1. prestart the static app with `npm run start:test`
2. navigate to `http://127.0.0.1:5000/index` (not `index.html`, which redirects)
3. use `waitUntil: "commit"` or `domcontentloaded`
4. wait for the exact mounted feature you need, not full-page readiness
5. keep the test focused on the private/local path unless cloud behavior is the target

Current practical guidance from repo debugging:

- prefer the repo-local Playwright runtime (`./node_modules/.bin/playwright` or `require("playwright")`) over the bundled Playwright CLI wrapper when working from this machine
- the bundled Playwright CLI wrapper currently tries to launch the `chrome` channel and fails here because the Chrome channel is not installed
- prefer a real Playwright spec under `tests/` over an ad hoc Node script as soon as the repro involves more than a trivial one-command sanity check
- use ad hoc Node scripts only for throwaway smoke checks; for iterative debugging, logging, screenshots, and reruns, move immediately to a spec file so the harness itself does not need to be rewritten every run
- when reproducing UI issues, attach listeners for `console`, `pageerror`, `request`, and `response` before navigation so transient failures are captured
- for local repros where Turnstile is not the subject of the test, stub or disable Turnstile before navigation with `page.addInitScript(...)` or an equivalent test-only bootstrap so anti-bot failures do not mask the UI bug
- before rewriting a failing Playwright repro, instrument the intended UI path with explicit `console.log` step markers and read those logs back from Playwright first; prefer isolating the exact failing step over repeated edit-and-rerun loops

Recommended readiness pattern:

- wait for feature APIs like `window.GoToolkitAssistInstance`
- if needed, open panels programmatically after mount, for example `window.GoToolkitAssistInstance?.open?.()`
- query visible controls explicitly, for example `textarea.chat-input:visible` and `button.chat-send-btn:visible`
- avoid broad selectors like plain `textarea` on complex screens because hidden modals and editors can match first

Recommended local-state setup:

- if the guided tour is not under test, suppress it before navigation with `localStorage.setItem("go-toolkit-docs-tour-seen.v1", "1")`
- when a repro only concerns private pages, do not spend time authenticating cloud spaces or bootstrapping OAuth state
- if a feature depends on a specific prompt preset or panel mode, set that state directly after mount before interacting

Recommended assertion pattern for UI debugging:

- capture the user-visible message or DOM state
- also capture any relevant client diagnostics, for example `window.GoToolkitTurnstile.getDiagnostics()`
- distinguish between “browser never sent the request” and “worker rejected the request” by inspecting network events
- when a scenario has multiple UI steps, emit one `console.log` marker per step before the interaction and keep a final marker after the expected state change; this gives you a stable breadcrumb trail in Playwright output and usually removes the need to rewrite the test just to learn where it stopped

This distinction matters in this repo because anti-bot and auth flows can fail before the worker is ever reached.

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
- a repo-local Node helper that opens a page and dumps selected IndexedDB stores for assertions

Important Playwright rule:

- never rely on imported Node constants directly inside `page.evaluate(...)`
- always pass values (for example `spaceId`, `spaceCode`, tokens, markers) as explicit `page.evaluate(arg => ..., arg)` arguments

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

The repo already defines the expected deployment path:

- run Wrangler through `scripts/with-env-local.sh`
- deploy the specific modified worker only

Examples:

```bash
scripts/with-env-local.sh npx wrangler deploy --config workers/share-proxy/wrangler.jsonc
scripts/with-env-local.sh npx wrangler deploy --config workers/ms-proxy/wrangler.toml
```

Recommended worker automation sequence after changes:

1. syntax check or local targeted verification
2. deploy changed worker only
3. smoke the worker with `curl`
4. run one UI or API regression that touches the changed path

Per `AGENTS.md`, smoke checks should cover:

- endpoint responsiveness
- CORS
- auth or env-sensitive behavior
- rate limiting behavior when relevant
- storage binding read/write when relevant

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
- Turnstile-required route rejects missing token
- configured secret/env path succeeds when present

## 11. Playwright performance improvements

Current repo guidance is already good. The next useful improvements are:

### 11.1 Suite segmentation

Split tests into:

- pure local persistence
- cloud sync
- worker/API verification
- OAuth/session flows

This keeps the expensive tests out of the fast path.

### 11.2 API-first setup

Before opening UI:

- authenticate space
- seed or clean remote pages
- set browser state directly when appropriate

This removes a lot of UI setup cost.

### 11.3 Persistent test fixtures

Add fixtures for:

- authenticated cloud context
- seeded test space
- clean local IndexedDB state
- preloaded memo data

### 11.4 Trace policy

Run traces/screenshots/videos only:

- on failure in CI
- on-demand locally

Avoid paying that cost on every passing run.

### 11.5 Native Linux path on WSL

When running many tests repeatedly:

- mirror repo to Linux FS
- run Playwright from Linux FS, not `/mnt/c/...`

That remains one of the highest-impact practical improvements.

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
- missing Turnstile failure smoke
- happy-path env check

## 13. High-value regression suites to add

The repo already has cloud/private persistence coverage. The best additions would be:

### 13.1 Managed-space auth bootstrap tests

Goal:

- verify that a valid `identityToken` can bootstrap space auth without manual OAuth UI

### 13.2 IndexedDB assertion helpers

Goal:

- assert `document-api`, `cloud-drafts`, `voice-recordings`, and RAG stores directly from Playwright

### 13.3 Stable shared-server cloud suite

Goal:

- run the cloud persistence specs against a prestarted `npm run start:test` server instead of relying on Playwright to repeatedly manage the server lifecycle

Rationale:

- the current cloud specs are more stable individually than in one large grouped run when the built-in `webServer` is under load

### 13.3 Cloud asset round-trip test

Goal:

- attach media
- sync upload
- reload
- verify prefetch/download and rendering

### 13.4 Worker contract tests

Goal:

- validate status codes, headers, and minimal response shapes for key worker routes

### 13.5 Space auth rotation regression

Goal:

- verify `spaceCode` rotation path and D1 hash alignment for managed spaces

## 14. Possible implementation helpers

These would materially improve automation productivity.

### Option 1: `scripts/cloud-auth.mjs`

Purpose:

- authenticate a space once
- print/export `token`, `contentKey`, and reusable headers

### Option 2: `scripts/cloud-seed.mjs`

Purpose:

- create, update, archive, or clean remote test documents in a known test space

### Option 3: `tests/helpers/indexeddb.ts`

Purpose:

- expose helper functions to inspect `go-toolkit` and `gotoolkit-documents` stores from Playwright

### Option 4: `tests/helpers/oauth-bootstrap.ts`

Purpose:

- capture or inject reusable OAuth identity state for managed-space tests

### Option 5: `scripts/worker-smoke.mjs`

Purpose:

- run standardized smoke checks against changed workers after deploy

## 15. Practical defaults for agents

When automating work in this repo:

- prefer API bootstrap over repeated UI login
- prefer dedicated test spaces over production-managed spaces
- reuse persistent browser state
- prefer `spaceCode` bootstrap for non-managed/test-space coverage
- verify both UI result and underlying storage/API result
- deploy only changed workers
- run one focused regression after each worker or sync change

## 16. Bottom line

The current repo already supports a strong automation strategy without inventing new infrastructure:

- use `spaceCode` or existing OAuth-derived `identityToken` to bootstrap cloud access
- reuse persistent browser sessions for Playwright
- inspect IndexedDB and worker APIs directly for assertions
- deploy workers via `scripts/with-env-local.sh`
- keep CI focused on small, high-signal regressions around sync, auth, assets, and worker contracts

That is the most productive path for reliable automation here.
