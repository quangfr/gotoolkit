# GoToolkit Test Guide

Date: 2026-03-18
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
  - read [`docs/INTERFACE.md`](docs/INTERFACE.md) first for UI fast-paths, shell structure, and interaction entry points
  - `npm run start:test`
  - `npm run playwright:linux:test -- tests/<spec>.spec.ts --workers=1 --reporter=line --config=playwright.config.ts`

- Cloud/share repro
  - bootstrap with `spaceCode` first
  - prefer direct worker setup + focused Playwright verification
  - read [`docs/DATA.md`](docs/DATA.md) first for sync ordering, tombstones, and shared `pages` vs `pages-meta` expectations

- Worker auth or share-route repro
  - verify the route directly with `curl` or `fetch`
  - then run one focused Playwright spec only if UI confirmation matters
  - read [`docs/SECURITY.MD`](docs/SECURITY.MD) first for worker auth, protected share routes, and required headers

- Iterating on inline-script UI bugs
  - run `npm run csp:inline:sync`
  - do not run `npm run check:csp` on every local repro loop

### 0.0 Triage matrix

Use this before changing app code:

- Playwright fails before expected app globals exist
  - check browser console/page errors for CSP violations first
  - if inline `index.html` scripts are blocked, run `npm run csp:inline:sync`
  - only debug app bootstrap after CSP is clean

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

### 0.0.1 Generic persistence triage

For bugs that mention refresh, reload, close, page switch, or "content was visible then disappeared", localize the failure in this order:

- step 1: inspect the visible editor before reload
  - if wrong already, this is not a reload bug

- step 2: inspect in-page state before reload
  - check active document id
  - check active tab id
  - check `window.__memoState.tabs[*].content`

- step 3: inspect IndexedDB before reload
  - check `window.goToolkitDocumentApi.getRecord(activeDocumentId)`
  - if the record is wrong, troubleshoot save/snapshot paths
  - if the record is correct, troubleshoot restore/bootstrap/editor hydration

- step 4: inspect after reload without interacting first
  - if content appears only after clicking the page again, suspect startup editor hydration
  - if content never reappears and the record is now wrong too, suspect a stale overwrite before unload/reload

- step 5: only then tighten assertions
  - first assert record correctness
  - then assert visible editor correctness
  - then assert secondary renderers like Mermaid/Excalidraw previews

### 0.0.2 Root shell and deep-link triage

Use this when `/` should stay empty or a direct page URL should trigger auth/access UX:

- root-shell bugs
  - reproduce with a focused browser check before changing code
  - verify:
    - `window.GoToolkitMemoGetActiveDocumentId?.()` is empty
    - header breadcrumb is hidden
    - `memo-card` is hidden
    - stale `goToolkit.memo.openDocuments` localStorage alone does not activate a page on `/`
  - if static HTML looks correct but the browser still shows a card, inspect `src/memo-bridge/index.tsx` for default-editor bootstrap

- direct UUID or shared deep-link auth bugs
  - prefer checking the real route loader instead of clicking through the UI manually
  - verify this sequence:
    - deep link detected
    - connection modal opens automatically when auth is missing
    - post-auth space authorization is checked
    - unauthorized result reopens the modal and shows the `Page inaccessible` toast

### 0.0.3 Fast troubleshooting heuristics

Use these rules to shorten the next investigation:

- read the contract doc first, not after the first failed hypothesis
  - UI shell, route, or surface-entry bug: read [`docs/INTERFACE.md`](docs/INTERFACE.md)
  - storage, sync, cloud/share bug: read [`docs/DATA.md`](docs/DATA.md)
  - worker auth, protected route, CSP bug: read [`docs/SECURITY.MD`](docs/SECURITY.MD)

- do not start with broad suites when one fixture can reproduce the issue
  - first add or reuse one focused spec in `tests/debug/` or a single targeted suite
  - only rerun the broader tier after the first divergence is isolated

- for cloud/share bugs, compare these layers in order
  - visible tree/editor state
  - local `share-history`
  - local `cloud-drafts`
  - remote `pages-meta`
  - remote `pages`

- if a delete or archive bug is involved, check draft preservation before remote behavior
  - confirm the destructive draft exists before sync
  - confirm it remains queued until explicit delete/archive acknowledgement
  - only then blame worker-side delete handling

- when a remote result looks wrong, distinguish these three states
  - unsynced local draft
  - synced remote tombstone in `pages-meta`
  - content removal in `pages`

- log skip reasons, not only success paths
  - for queue-building code, log why an item was skipped
  - for clear/remove helpers, log reason and caller/source

- once a cross-layer invariant becomes clear, document it in the repo docs in the same task
  - keep the note synthetic and local to the affected subsystem

### 0.0.4 Memo refresh and repair do and don't

Use these rules for local memo refresh, reload, and page-switch regressions:

- do compare the same content across all four layers before deciding where the bug lives
  - visible headings in `.ProseMirror`
  - `window.__memoState.tabs[*].content`
  - `window.goToolkitDocumentApi.getRecord(activeDocumentId)`
  - bridge/editor HTML such as `MemoEditor.getHTML()` or bridge `getValue()`

- do keep one focused fixture when the bug clusters around one imported document
  - for example, keep `sample.md`-style regressions in one debug spec instead of widening a generic persistence suite first

- do strengthen the first passing debug repro into a reusable guard once the real failing path is isolated
  - prefer one explicit reload or switch invariant over many loosely related assertions

- do log payload lengths and a small heading fingerprint before and after reload
  - this catches "record is correct but editor hydration inflated or truncated content" quickly

- don't assume the first visible `.ProseMirror` is the same editor instance the shell bridge will read or save
  - confirm the active memo bridge/editor instance when multiple cached editors exist

- don't blame IndexedDB first when the record stays correct and only the reopened editor is wrong
  - that pattern points to restore/bootstrap/hydration instead of durable persistence

- don't keep adding unstable typing markers to a persistence spec if the actual regression is document isolation or reload restoration
  - reduce the assertion set to the real contract, then add a separate focused typing repro if needed

- don't change the reload wait sequence casually once a diagnose spec proves a stable order
  - keep the same reload timing in the strengthened guard unless the timing itself is the subject under test

## 0.1 Core rules

- Prefer a real spec under `tests/` over ad hoc scripts for any non-trivial repro.
- On WSL, run Playwright from the Linux mirror, not `/mnt/c/...`.
- Dismiss the docs tour unless it is the subject of the test.
- Add step logs plus `console`, `pageerror`, `request`, and `response` listeners before rewriting a repro.
- Keep one stable log prefix per investigation and include doc ids, token ids, payload length, and a short fingerprint.
- Use `spaceCode` bootstrap first for cloud coverage; fall back to OAuth UI only when the auth UX itself is under test.
- For visual regressions, save screenshots in `tests/results/` before tightening assertions further.
- For root-shell regressions, a tiny focused spec is better than reusing a large persistence suite.
- After the first real signal, narrow the spec instead of adding more unrelated assertions.

## 0.2 Screenshot workflow

Use this when DOM assertions are passing but the UI still looks wrong.

- Save block-level screenshots to `tests/results/` with explicit scenario names.
  - example: `tests/results/mermaid-import-first-block-direct.png`
- Save one full-page companion screenshot when layout/context matters.
  - example: `tests/results/mermaid-import-page-direct.png`
- Prefer capturing from the same Playwright flow under test instead of a separate ad hoc script.
- If the wrapper does not preserve screenshots where expected, do one direct browser capture and save explicitly into the repo `tests/results/` path.
- When a screenshot and DOM assertions disagree, trust the screenshot first and inspect which renderer or fallback path produced the visible output.

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
- `tests/tier/t1-2-cloud-sync-persist.spec.ts`
- `tests/tier/t4-8-cloud-private-transfer-sync.spec.ts`
- `tests/tier/t1-1-cloud-switch-persist.spec.ts`
- `tests/tier/t4-6-cloud-rapid-switch-large.spec.ts`
- `tests/tier/t4-1-close-active-page.spec.ts`
- `tests/tier/t4-2-private-delete-switch-regression.spec.ts`
- `tests/tier/t4-3-private-heading-repair-entrypoints.spec.ts`
- `tests/tier/t4-4-private-switch-persist.spec.ts`
- `tests/tier/t4-5-sample-refresh-heading-diagnose.spec.ts`
- `tests/debug/root-empty-shell.spec.ts`
- `tests/debug/empty-shell-search.spec.ts`
- `tests/debug/assist-knowledge-selection.spec.ts`
- `tests/tier/t3-1-space-code-rotate.spec.ts`
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

### 2.1 Coverage map

Use this as a fast ownership map, not as a full per-spec changelog.

Coverage-map maintenance rule:

- for each Playwright suite entry, keep the compact format:
  - `description`
  - `results` with pass/skip/fail counts, suite duration in `mm:ss` when known, and execution date
  - `details`
- normal repo runs through `npm run playwright:linux:test -- ...` auto-write per-suite metrics and sync the affected Coverage Map `results` and `details`
- tier `results` may use aggregate runtime, but suite `results` must use per-suite runtime when known
- when you rerun the full Playwright suite, update the latest suite result in this section with the execution date, length, duration, and pass/fail summary
- after any tier run (`Tier 1`, `Tier 2`, `Tier 3`, or `Tier 4`), also refresh that tier's aggregate `results` and `details` entry so it matches the latest per-suite records
- `Tier 1` is a maintained local regression tier for cloud persistence and managed-space auth flows; it no longer runs in GitHub Actions by default
- local `bump`, `commit`, and `push` flows do not require rerunning `Tier 1` unless the task explicitly asks for it

Latest targeted Playwright run:

- `Last execution`: `2026-03-18 21:52`
- `Scope`: `tests/tier/t1-3-microsoft-oauth-proxy.spec.ts`
- `Execution length`: `3 tests`
- `Execution time`: `00:21`
- `Result`: `2 passed, 0 failed, 1 skipped`
- `Details`: `Validated the maintained Microsoft OAuth proxy tier entry against the modal-first connection flow and managed-space load path.`

Recent troubleshooting note:

- `private-switch-persist.spec.ts` is the primary fast check for generic local-page persistence regressions
- if that spec passes but a heavier import/reload spec fails, suspect restore hydration or renderer rehydration before suspecting IndexedDB durability
- all promoted tier specs must live under `tests/tier/`
- promoted tier spec filenames must be prefixed with their tier slot as `tX-Y-`, for example `tests/tier/t2-7-assist-page-switch-conversation.spec.ts`
- `tests/tier/t4-5-sample-refresh-heading-diagnose.spec.ts` is the maintained repro for imported Markdown refresh survival plus post-reload heading-title preservation around table and Mermaid-adjacent sections
- keep non-tier or one-off repro specs under `tests/debug/` by default; only promote a spec to `tests/tier/` when it is intentionally part of a maintained tier below
- when promoting a debug spec, move it into `tests/tier/` instead of `tests/`
- `tests/tier/t2-7-assist-page-switch-conversation.spec.ts` is the maintained Tier 2 repro for Assist conversation isolation across private page switches and the empty-shell Explorer scope, plus summary-tab alignment during one delayed inline edit and one send-button edit
- `tests/tier/t4-2-private-delete-switch-regression.spec.ts` is the maintained repro for deleting an active private page, reopening another private page, and verifying no blank or duplicated content across repeated switches
- `tests/tier/t4-1-close-active-page.spec.ts` is the maintained repro for the breadcrumb close button returning the app to the empty shell cleanly
- `tests/tier/t4-3-private-heading-repair-entrypoints.spec.ts` is the maintained guard for private `sample.md` reopen/create/reload heading repair, including headings after `Artefacts PO`
- keep `tests/debug/private-immediate-reload-persist.spec.ts` and `tests/debug/empty-shell-search.spec.ts` in debug until their immediate-reload and empty-search result contracts are stable
- `tests/debug/empty-shell-search.spec.ts` is the focused repro for root empty-shell search takeover from both the document panel and the centered empty-page search field
- `tests/debug/cloud-open-bootstrap-diagnose.spec.ts` is the focused repro for the new no-active-page startup flow before cloud page open

Tier suites:

- `Tier 1` default gate
  - description: essential feature coverage for cloud persistence and Microsoft-managed space access
  - results: `4 passed, 0 failed, 1 skipped` (`5 tests`, `01:14`) on `2026-03-18 21:52`
  - details: `Latest suite entries are all passing. Aggregate summary refreshed from the latest recorded Tier 1 suite results, including the modal-first Microsoft OAuth flow.`

  - `T1.1` `t1-1-cloud-switch-persist.spec.ts`
    - description: cloud page switch persistence and reload isolation
    - results: `passing` (`1 test`, `00:25`) on `2026-03-17 17:42`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

  - `T1.2` `t1-2-cloud-sync-persist.spec.ts`
    - description: cloud create/edit/rename/move/reorder/delete + sync + reload + remote verification
    - results: `passing` (`1 test`, `00:28`) on `2026-03-17 17:29`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

  - `T1.3` `t1-3-microsoft-oauth-proxy.spec.ts`
    - description: Microsoft popup handshake, managed space loading, and auth-state reuse
    - results: `passing` (`3 tests`, `00:21`) on `2026-03-18 21:52`
    - details: `Latest run passed with 1 skipped after updating the spec to follow the current modal-first connection entry before Microsoft popup auth.`

- `Tier 4` essential troubleshooting
  - description: maintained troubleshooting coverage for shell recovery, private persistence/repair, plus cloud draft/transfer stress guards
  - results: `4 passed, 1 failed, 0 skipped` (`5 tests`, `01:01`) on `2026-03-18 10:13`
  - details: `Latest executed suite entries are not all passing. Aggregate summary refreshed from the latest recorded Tier 4 suite results.`

  - `T4.1` `t4-1-close-active-page.spec.ts`
    - description: closing the active page returns to the empty shell without leaving shell chrome visible
    - results: `passing` (`1 test`, `00:04`) on `2026-03-18 10:11`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

  - `T4.2` `t4-2-private-delete-switch-regression.spec.ts`
    - description: deleting an active private page does not blank or duplicate remaining private pages during repeated switches
    - results: `passing` (`1 test`, part of `02:12` grouped local troubleshooting run) on `2026-03-17 21:35`
    - details: `Latest promoted run passed as part of the maintained local troubleshooting slice.`

  - `T4.3` `t4-3-private-heading-repair-entrypoints.spec.ts`
    - description: private reopen/create/reload heading repair for `sample.md`, including headings after `Artefacts PO`
    - results: `passing` (`4 tests`, part of `02:12` grouped local troubleshooting run) on `2026-03-17 21:35`
    - details: `Latest promoted run passed as part of the maintained local troubleshooting slice.`

  - `T4.4` `t4-4-private-switch-persist.spec.ts`
    - description: private document switch persistence and reload survival
    - results: `passing` (`1 test`, `00:18`) on `2026-03-18 10:13`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

  - `T4.5` `t4-5-sample-refresh-heading-diagnose.spec.ts`
    - description: imported `sample.md` refresh survival plus heading visibility across editor, state, and durable record layers
    - results: `passing` (`1 test`, part of `02:12` grouped local troubleshooting run) on `2026-03-17 21:35`
    - details: `Latest promoted run passed as part of the maintained local troubleshooting slice.`

  - `T4.6` `t4-6-cloud-rapid-switch-large.spec.ts`
    - description: large cloud stress switch/edit flow with pre-sync write suppression and post-sync isolation
    - results: `failing` (`1 test`, `00:02`) on `2026-03-10 11:53`
    - details: `Latest run failed. Auto-synced from Playwright suite metrics.`

  - `T4.7` `t4-7-cloud-draft-archive-ops.spec.ts`
    - description: local draft archive/delete terminal semantics
    - results: `passing` (`1 test`, `00:02`) on `2026-03-17 17:52`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

  - `T4.8` `t4-8-cloud-private-transfer-sync.spec.ts`
    - description: grouped cloud copy, private promote, and archived fresh-token promotion with reload verification
    - results: `passing` (`1 test`, `00:35`) on `2026-03-12 14:39`
    - details: `Latest run passed after Playwright readiness was updated for the no-active-page-on-open flow.`

- `Tier 2` advanced features
  - description: advanced coverage for explicit history sync, history isolation, Excalidraw/Mermaid regression behavior, OCR/PDF direct-paste imports, and local voice recording playback/transcript flows
  - results: `3 passed, 3 failed, 1 skipped` (`7 tests`, `02:14`) on `2026-03-18 11:03`
  - details: `Latest suite entries are not all passing. Aggregate summary refreshed from the latest recorded Tier 2 suite results.`

  - `T2.1` `t2-1-cloud-history-explicit-sync.spec.ts`
    - description: explicit sync gating for remote `pages-history` writes
    - results: `passing` (`1 test`, `00:17`) on `2026-03-10 11:53`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

  - `T2.2` `t2-2-memo-history-isolation.spec.ts`
    - description: history isolation plus restore/duplicate correctness per page
    - results: `failing` (`1 test`, `00:01`) on `2026-03-10 11:53`
    - details: `Latest run failed. Auto-synced from Playwright suite metrics.`

  - `T2.3` `t2-3-excalidraw-regression.spec.ts`
    - description: grouped Excalidraw/Mermaid regression across flowchart, sequence, and class docs with manual edit, switch, and reload checks
    - results: `passing` (`1 test`, `00:24`) on `2026-03-12 16:31`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

  - `T2.4` `t2-4-voice-recording-assemblyai-live.spec.ts`
    - description: real AssemblyAI proxy coverage using `tests/fixtures/sample.wav` during an actual recording, with live transcript mutation, cross-page stop/switch return to the origin page, saved transcript polling, badge state, and video playback verification
    - results: `skipped` (`1 test`, `00:00`) on `2026-03-10 11:53`
    - details: `Latest run skipped. Auto-synced from Playwright suite metrics.`

  - `T2.5` `t2-5-memo-import-ocr-regression.spec.ts`
    - description: private-page import of JPG OCR + PDF in one batch with direct paste into the active document
    - results: `failing` (`1 test`, `00:01`) on `2026-03-10 11:53`
    - details: `Latest run failed. Auto-synced from Playwright suite metrics.`

  - `T2.6` `t2-6-memo-import-mermaid-regression.spec.ts`
    - description: blank private-page shared-picker Markdown import with no OpenRouter calls, auto-rendered Mermaid SVG previews, and modal code/diagram parity
    - results: `failing` (`1 test`, `01:13`) on `2026-03-12 08:15`
    - details: `Latest run failed. Auto-synced from Playwright suite metrics.`

  - `T2.7` `t2-7-assist-page-switch-conversation.spec.ts`
    - description: Assist conversation and preset isolation across page A, page B, and empty-shell Explorer scope, including delayed inline edit and send-button flows
    - results: `passing` (`1 test`, `00:18`) on `2026-03-18 11:03`
    - details: `Latest run passed. Auto-synced from Playwright suite metrics.`

- `Tier 3` admin features
  - description: protected-space administration coverage for space-code rotation and post-rotate readability
  - results: `0 passed, 1 failed, 0 skipped` (`1 test`, `00:01`) on `2026-03-10 11:53`
  - details: `Latest suite entries are not all passing. Aggregate summary refreshed from the latest recorded Tier 3 suite results.`

  - `T3.1` `t3-1-space-code-rotate.spec.ts`
    - description: protected-space create/rotate/delete lifecycle and post-rotate readability
    - results: `failing` (`1 test`, `00:01`) on `2026-03-10 11:53`
    - details: `Latest run failed. Auto-synced from Playwright suite metrics.`

Shared test helpers:

- `helpers/cloud-auth.ts`
  - opens `index.html`, bootstraps cloud access, and authenticates with `spaceCode`

- `helpers/share-test-space.ts`
  - exposes the configured Playwright test space ID and code from the environment

- `helpers/memo-ui.ts`
  - provides common memo UI operations used by Playwright specs: waiting for the editor, creating/opening a document, opening the file menu, importing through the file menu, renaming/deleting from the explorer or file menu, typing into the visible editor, interacting with the history modal, capturing share requests, refreshing the explorer, dismissing the docs tour, and triggering cloud sync

- `helpers/cloud-state.ts`
  - provides cloud-state setup and verification primitives: wait for cloud memo APIs, seed shared memo docs, read local cloud draft/history state, and read remote `pages` / `pages-meta` / `pages-history` state

- `helpers/test-debug.ts`
  - provides reusable spec logging primitives: stable step-log prefixes and shared page debug listeners for `console`, `pageerror`, `request`, `requestfailed`, and `response`

Recent fixes now covered by the suite:

- active cloud delete from the file menu must target the currently open document unless the user has a real multi-selection
- memo history restore must replace cached editor-tab content when switching to an already-mounted tab id
- rapid cloud stress assertions should ignore read-only `pages:batchGet` traffic before manual sync

### 2.2 Helper rules

Prefer helper extraction when a Playwright flow is reused in 2 or more specs.

- put UI actions in `helpers/memo-ui.ts`
  - examples: open, rename, delete, drag, sync, history modal interaction

- put cloud setup and cloud assertions in `helpers/cloud-state.ts`
  - examples: seed `pages` + `pages-meta`, read remote content/meta/history, inspect local draft/history state

- keep spec-local helpers only when they are tightly coupled to one scenario
  - examples: custom marker validation for a single stress spec

- prefer selecting history rows by visible preview content, not by raw index

- prefer asserting on mutating remote traffic separately from read-only traffic
  - `pages:batchGet` is a read
  - `pages:batch`, `pages-meta:batch`, `PUT`, and `DELETE` are writes

## 3. Recommended automation model

For this repo, the default model is:

1. bootstrap or bypass auth once
2. persist browser/session state locally
3. reuse that state across runs
4. do setup and verification through APIs when possible
5. keep UI tests focused on real user behavior

When deciding whether to fix the app or the test:

- fix the app when the user-visible contract is wrong
  - examples: restore applies stale editor state, file-menu delete targets the wrong active doc

- fix the test when the assertion is bound to an unstable implementation detail
  - examples: relying on history modal row index instead of selected preview content

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
- Microsoft OAuth reuse state lives in `.tmp/playwright-ms-auth-state.json`
- `PW_PERSIST_PROFILE=1` switches Playwright to single-worker persistent-profile mode

Recommended usage:

- keep a persistent profile in `.tmp/playwright-profile`
- keep reusable auth state in `.tmp/playwright-storage-state.json`
- keep reusable Microsoft OAuth state in `.tmp/playwright-ms-auth-state.json`
- use `./node_modules/.bin/playwright ... --workers=1`
- prefer `waitUntil: "commit"` or `domcontentloaded` on `index.html`
- prestart the server with `npm run start:test`

### 6.0 Canonical local Playwright workflow

Use this exact workflow for local UI debugging and repros on this repo:

1. start the app with `npm run start:test`
2. if you are on WSL, create or refresh the persistent Linux mirror with `npm run playwright:linux:mirror`; do not run Playwright from `/mnt/c/...`
3. write or reuse a real spec under `tests/`
4. attach listeners for `console`, `pageerror`, `request`, and `response` before navigation
5. use helpers before writing raw locator flows inline
6. keep worker setup and worker assertions in helper-backed `page.evaluate(...)` blocks
7. after a fix, rerun the focused spec first, then rerun the relevant suite slice

### 6.0.1 Memo editor observability

Use this short checklist for memo refresh, reload, import, and page-switch bugs.

Browser console:

- enable staged refresh logs:
  - `localStorage.setItem("goToolkit.memo.refreshDebug.v1", "1"); location.reload()`
- disable them:
  - `localStorage.removeItem("goToolkit.memo.refreshDebug.v1")`
- active doc id:
  - `window.GoToolkitMemoGetActiveDocumentId?.()`
- active tab HTML:
  - `(() => { const s = window.__memoState; return s?.tabs?.find(t => t.id === s?.activeTabId)?.content || ""; })()`
- durable record:
  - `await window.goToolkitDocumentApi.getRecord(window.GoToolkitMemoGetActiveDocumentId?.())`
- open-doc snapshot:
  - `localStorage.getItem("goToolkit.memo.openDocuments")`
- visible headings:
  - `Array.from(document.querySelectorAll(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6")).map(node => node.textContent?.trim() || "")`

Interpretation:

- wrong before reload: import/editor/save path
- record wrong before reload: snapshot or overwrite path
- record correct after reload, UI wrong: restore or hydration path
- active doc id empty after reload: route or open-doc restore path

Playwright:

- attach `console` and `pageerror` listeners before navigation
- log snapshots:
  - after import
  - before reload
  - after reload
  - after editor-visible wait
- each snapshot should log:
  - active document id
  - active tab id
  - active tab HTML length
  - record HTML length
  - visible headings

Focused repro:

- `npm run playwright:linux:test -- tests/tier/t4-5-sample-refresh-heading-diagnose.spec.ts --workers=1 --reporter=line --config=playwright.config.ts`

### 6.1 Local noise to treat carefully

These are currently known local-run noises and should not be treated as memo regressions by default:

- transient jsDelivr / Excalidraw chunk load errors during long Playwright runs
  - example: `ChunkLoadError` for `vendor-677e88ca78c86bddf13d.js`
  - if the memo flow under test still completes and assertions pass, treat this as external asset noise first

- `pages:batchGet` requests during cloud stress runs
  - these are read-side fetches
  - do not classify them as premature remote writes when the assertion is specifically about pre-sync mutation traffic

- `pages-history` `404` before first checkpoint creation
  - this is expected when the sync path probes remote history before the first successful remote history write
  - only treat it as a failure if the subsequent `PUT` or final history assertion fails

## 7. Recommended cleanup direction

When touching Playwright coverage in this repo, bias toward:

- fewer large specs with duplicated setup logic
- more shared helpers for cloud bootstrap, remote-state reads, and explorer actions
- assertions written in terms of user-visible behavior and draft/sync semantics
- explicit distinction between local draft state, local history state, and remote worker state
- add explicit `console.log` step markers before every intended UI interaction
- suppress the docs tour unless the tour itself is under test
- keep worker repros focused on route behavior, CORS, and rate limiting
- run the repo-local binary from the Linux mirror: `./node_modules/.bin/playwright test ... --workers=1 --reporter=line`, or use `npm run playwright:linux:test -- ...`
- keep the instrumentation in place until the failing stage is isolated; do not keep rewriting the harness blindly between runs

This is the minimum standard for non-trivial UI debugging.

Persistent Linux mirror details:

- `npm run playwright:linux:mirror` syncs the current repo into `~/.cache/gotoolkit-playwright` by default
- override the location with `PW_LINUX_MIRROR_DIR=/path/to/mirror`
- the script keeps the mirror between runs, performs one full sync on first use, then switches to incremental sync based on the Git worktree
- force a clean resync with `PW_LINUX_MIRROR_FULL_SYNC=1 npm run playwright:linux:mirror`
- the script only re-runs `npm ci` when `package-lock.json` changed or `node_modules/` is missing
- `tests/results/`, `playwright-report/`, and `.tmp/` stay local to each side and are not copied into the mirror
- after the sync, change into the printed mirror path and run Playwright there
- `npm run playwright:linux:test -- tests/tier/t2-7-assist-page-switch-conversation.spec.ts --workers=1 --reporter=line` refreshes the mirror and runs Playwright from it in one command

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

Important CSP constraint:

- `npm run start:test` does not disable CSP
- this app enforces CSP through HTML `<meta http-equiv="Content-Security-Policy">` tags
- because of that, a permissive test server header is not enough to bypass a broken inline-script hash
- if you changed an inline script in `public/index.html`, `public/grid.html`, or `public/mobile.html`, run `npm run csp:inline:sync` before local browser repros
- reserve `npm run check:csp` for merge/release validation and for any `bump` / `commit` / `push` request; it should not be part of every Playwright iteration loop

### 7.1 UI testing workflow for local/private pages

For fast local/private UI debugging:

1. prestart with `npm run start:test`
2. navigate to `http://127.0.0.1:5000/index`
3. use `waitUntil: "commit"` or `domcontentloaded`
4. wait for the exact mounted feature you need
5. keep the test local-only unless cloud behavior is the target

Practical guidance:

- prefer the repo-local Playwright runtime over the bundled Codex wrapper
- on WSL, use the Linux mirror
- use explicit readiness selectors such as visible controls or feature APIs
- suppress the docs tour and set local state directly when the repro allows it
- distinguish “browser never sent the request” from “worker rejected it” through network events

### 7.2 Visual capture workflow (video + step screenshots)

Use one consistent capture style:

- prestart app with `npm run start:test` and close the tour overlay
- render a visible white pointer cursor + yellow click ring
- no global `slowMo`; pace with explicit waits and `0.5s` cursor travel before clicks and input progressive typing
- keep artifacts under `test-recordings/` and `test-screenshots/`
- video name: `test-recordings/<test-name>-<YYYY-MM-DD-HHMMSS>.webm`
- screenshot name: `test-screenshots/step-XX-<step-name>-<test-name>-<YYYY-MM-DD-HHMMSS>.png`
- keep artifacts untracked unless explicitly requested

## 8. Programmatic access to browser-local persisted state

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

## 9. Automating local/cloud edit flows

The most reliable pattern is:

1. seed data through API or local storage helper
2. open browser with persistent session
3. perform the minimum UI actions needed for the target feature
4. verify both UI state and underlying storage/API state


## 10. Worker development automation

Worker automation sequence after changes:

1. syntax check or local targeted verification
2. deploy the changed worker only through `scripts/with-env-local.sh`
3. smoke it with `curl`
4. run one focused UI or API regression on the changed path

## 11. Worker verification patterns

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

## 12. Playwright performance improvements

Current repo guidance is already good. The next useful improvements are:

- segment suites into local persistence, cloud sync, worker/API verification, and OAuth/session flows
- do API-first setup before UI when possible: authenticate space, seed or clean remote data, then open the browser
- keep reusable fixtures for authenticated cloud context, seeded test space, and clean local IndexedDB state
- collect traces/screenshots/videos on failure in CI and on-demand locally, not on every passing run
- keep running Playwright from the Linux mirror on WSL instead of `/mnt/c/...`

## 13. Conditional checks on worker changes

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

## 14. High-value regression suites to add

The repo already has cloud/private persistence coverage. The best additions would be:

- managed-space auth bootstrap tests using `identityToken` without full OAuth UI
- IndexedDB assertion helpers for `document-api`, `cloud-drafts`, `voice-recordings`, and RAG stores
- a stable shared-server cloud suite against a prestarted `npm run start:test` server
- a cloud asset round-trip test covering upload, reload, prefetch/download, and rendering
- worker contract tests for key status codes, headers, and minimal response shapes
- space auth rotation regression for managed-space D1 hash alignment

## 15. Possible implementation helpers

These would materially improve automation productivity:

- `scripts/cloud-auth.mjs` to authenticate a space once and print/export reusable headers
- `scripts/cloud-seed.mjs` to create, update, archive, or clean remote test documents
- `tests/helpers/indexeddb.ts` to inspect `go-toolkit` and `gotoolkit-documents` stores from Playwright
- `tests/helpers/oauth-bootstrap.ts` to capture or inject reusable managed-space OAuth identity state
- `scripts/worker-smoke.mjs` to run standardized post-deploy worker smoke checks

## 16. Practical defaults for agents

When automating work in this repo:

- prefer API bootstrap over repeated UI login
- prefer dedicated test spaces over production-managed spaces
- reuse persistent browser state
- prefer `spaceCode` bootstrap for non-managed/test-space coverage
- verify both UI result and underlying storage/API result
- deploy only changed workers
- run one focused regression after each worker or sync change
