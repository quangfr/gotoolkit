# GoToolkit Interface Map

Date: 2026-03-17
Purpose: help coding agents locate the right frontend surface, bridge, helper, and runtime owner before changing UI behavior
Scope: `public/*.html`, `public/js/`, `src/`, frontend window globals, shared UI helpers

## 0. When to use this doc

Open this file when you need to answer questions like:

- which entry page owns a UI behavior
- whether a change belongs in `public/js/` or `src/`
- which frontend module owns explorer, tabs, Assist, share UI, or storage-facing UI glue
- which `window` global is the intended interface between legacy HTML and bundled React code

## 0. Do not assume

- `public/index.html` still owns a large amount of app orchestration; not every UI flow has been moved into `src/`.
- `src/` is not the whole app. The memo editor and draw editor are bundled from `src/`, but most shell, explorer, modal, share, and settings logic still lives in `public/js/` or inline `index.html`.
- Only `public/js` should attach app globals to `window`; bundled React code is usually consumed through bridge globals.
- A UI bug is not always a render bug. Many visible issues come from bootstrap order, global wiring, storage hydration, or share/client state.

## 0.1 Fast map

- `public/index.html` is the main Docs shell and still coordinates much of the runtime.
- `src/memo-bridge/index.tsx` mounts the React memo editor and exposes a compatibility bridge for the shell.
- `src/draw-editor/index.tsx` owns the Excalidraw-based draw surface and exposes its own bridge.
- `public/js/document-panel.js` owns the left document explorer and document metadata UI.
- `public/js/document-tabs.js` owns breadcrumb/tab-style active document header rendering.
- `public/js/assist.js` owns Assist bootstrap, config loading, RAG DB repair, and much of the assistant-side UI/runtime behavior.
- `public/js/share-worker-client.js` owns cloud/share connection state and share-route client behavior.
- `public/js/shared-ui.js` owns reusable share-menu, toast, and splitter helpers used across surfaces.

## 1. Entry surfaces

Main entry pages:

- `public/index.html`
  - primary Docs app
  - includes bootstraps, shell markup, many inline handlers, and most document/Assist wiring

- `public/grid.html`
  - grid-specific UI shell
  - reuses several shared `public/js` services but has its own inline runtime

- `public/mobile.html`
  - mobile-specific UI shell
  - lighter feature set, separate markup, separate script load list

Practical rule:

- if the problem is Docs-shell behavior, open `public/index.html` first even when the visible symptom is inside a React editor
- if the problem is shared document state, then inspect the relevant `public/js` module next

## 2. Frontend ownership

### 2.1 Shell and orchestration

- `public/index.html`
  - shell layout
  - inline event wiring
  - script load order
  - many top-level memo, Assist, and modal flows

- `public/js/config.js`
  - site config loading and shared config API

- `public/js/config-modal.js`
  - settings modal UI
  - category config API
  - integration publish/config globals

- `public/js/feature-visibility.js`
  - feature flag style UI visibility decisions

### 2.2 Documents UI

- `public/js/document-panel.js`
  - document explorer tree
  - category/superpower selection UI
  - rename/create/edit metadata flows

- `public/js/document-tabs.js`
  - active-document breadcrumb/header rendering
  - cloud/private breadcrumb normalization

- `public/js/document-api.js`
  - frontend document registry access layer
  - used by multiple shell features, not just storage code

- `public/js/document-storage.js`
  - IndexedDB store plumbing for app state

### 2.3 Memo editor surface

- `src/memo-editor/*`
  - actual React/Tiptap editor implementation
  - node views such as table, image, file, mermaid, task, blockquote, and video

- `src/memo-bridge/index.tsx`
  - React mount point
  - editor instance cache/switching
  - compatibility bridge consumed by legacy shell code

- `public/js/memo.bundle.js`
  - built output consumed by the app

### 2.4 Draw surface

- `src/draw-editor/index.tsx`
  - Excalidraw mount and API
  - Mermaid-to-Excalidraw conversion and draw-surface bridge

- `public/js/draw.bundle.js`
  - built output consumed by the app

### 2.5 Assist and AI UI

- `public/js/assist.js`
  - Assist bootstrap/runtime
  - config bootstrap
  - RAG DB readiness/repair
  - assistant-side UI helpers and integration glue

- `public/js/ia-config.js`
  - backend/model configuration

- `public/js/ia-client.js`
  - network client for AI backends

### 2.6 Share and shared UI

- `public/js/share-worker-client.js`
  - share/cloud auth and worker-facing UI client behavior

- `public/js/share-history.js`
  - share history UI/data glue

- `public/js/shared-ui.js`
  - reusable share menu
  - toast rendering
  - action countdown helper
  - context modal splitter helper

## 3. Bridge and global model

This repo still uses a mixed model:

- bundled React editors in `src/`
- legacy shell logic in `public/index.html` and `public/js/`
- `window` globals as the contract between them

High-value globals to look for first:

- `window.GoToolkitDocumentExplorer`
  - document explorer creation/binding API

- `window.GoToolkitDocumentTabs`
  - active breadcrumb/header renderer

- `window.GoToolkitMemoBridge` or `window.goToolkitMemoBridge`
  - memo editor bridge consumed by shell code

- `window.GoToolkitExcalidraw`
  - draw-surface bridge

- `window.GoToolkitAssistInstance`
  - live Assist sidebar/controller instance

- `window.GoToolkitSettingsModal`
  - settings modal API

- `window.GoToolkitSharedUI`
  - shared toast/share-menu helpers

Practical rule:

- when a shell feature calls a `window.GoToolkit*` API, treat that global contract as the stable seam first
- if the seam is wrong, fix the producer
- if the seam is correct but the caller misuses it, fix the shell consumer

Memo bridge do and don't:

- do start with `public/index.html` and `src/memo-bridge/index.tsx` together when a memo page looks wrong after reload or page switch
  - the shell may be selecting the right page while the bridge hydrates the wrong editor instance, or the inverse

- do verify which bridge/global actually represents the active editor before patching shell logic
  - confirm active document id, active tab id, and the editor instance the bridge will read for save/restore

- do treat the memo bridge active-id cache as more authoritative than stale legacy globals when the two disagree
  - the shell can outlive an older `window.MemoEditor` reference

- don't assume DOM visibility alone tells you which cached editor instance the shell is using
  - visible markup and bridge save targets can diverge during delayed hydration or tab restore

- don't change `public/index.html` hydration timing in isolation when the issue might be stale bridge instance selection
  - check both the shell timing and bridge cache behavior in the same investigation

## 4. Where to edit first

Use this routing before changing code:

- explorer tree, rename modal, document metadata, category pills
  - start in `public/js/document-panel.js`

- active breadcrumb, close-page header, parent-chain display
  - start in `public/js/document-tabs.js`

- editor content rendering, node behavior, editor commands, editor hydration
  - start in `src/memo-bridge/index.tsx` and `src/memo-editor/*`

- draw canvas, Mermaid conversion inside draw, Excalidraw integration
  - start in `src/draw-editor/index.tsx`

- Assist sidebar, prompt behavior, RAG readiness, assistant UI glue
  - start in `public/js/assist.js`

- settings, category configuration, integration verification buttons
  - start in `public/js/config-modal.js`

- toasts, share menu, shared modal splitter
  - start in `public/js/shared-ui.js`

- cloud/share connect, protected page open, sync-client UI behavior
  - start in `public/js/share-worker-client.js`

- bootstrap or load-order bug, missing globals, inline event regression
  - start in `public/index.html`

## 5. Build and validation notes

- Any change under `src/` requires `npm run build`.
- If a frontend change touches inline scripts or CSP-scoped HTML, run `npm run csp:inline:sync`.
- Before merging touched frontend JS, prefer:
  - `node --check <touched-js-file>`
  - the narrowest useful Playwright repro or spec

## 6. Helper map for navigation

Useful helpers already documented or reused in tests:

- `tests/helpers/memo-ui.ts`
  - common memo UI actions and editor waits

- `tests/helpers/cloud-auth.ts`
  - space-code bootstrap and cloud auth helpers

- `tests/helpers/cloud-state.ts`
  - local/remote cloud state reads and assertions

- `tests/helpers/share-test-space.ts`
  - configured Playwright test-space identifiers

Use these when diagnosing interface behavior:

- if the issue is a real user flow, prefer an existing helper-backed Playwright spec over ad hoc DOM clicking
- if a helper has to work around unstable UI behavior repeatedly, that is often evidence the interface contract is unclear or broken
