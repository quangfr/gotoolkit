# Contributing: Create a New App Module

This file is a concise HOWTO for creating a new module. High-level architecture, worker requirements, and repo-wide notes live in `AGENTS.md` — read that first.

## Quick steps

1. Copy an existing module (example: `public/grid.html`) to `public/your-app.html`.
2. Define a `STORAGE_KEY` and implement `loadState()` / `persistState()` to store module state in `localStorage`.
3. Add app header and tabs consistent with existing modules. Reuse IDs for share UI: `shareBtn`, `shareMenu`, `shareLinkField`, `shareCreateBtn`, `shareUpdateBtn`, `shareMenuStatus`.
4. Implement share payload builders: `buildSharePayload()` and `buildSharePreview()` and wire `window.goToolkitShareWorker` for saving/fetching shares if needed.
5. Add local drafts via `window.goToolkitCapsuleDrafts` (IndexedDB helpers) when offline persistence is desired.
   - Reuse the shared IndexedDB helpers (`public/js/idb-doc-store.js`) so every module talks to the same `go-toolkit` database (`capsule-drafts`, `share-history`, `documents-settings` stores) without re-implementing the boilerplate. Call `goToolkitDocStore.createStore("capsule-drafts")` (or `"share-history"` etc.) to `get`/`set` JSON objects and rely on the helper’s fallback to no-ops when IndexedDB is unavailable.
6. Create the context/sidebar UI (prompt input, `promptTemplateMeta`) inside a `gtContextModal` block so it can resize, overlay, and backdrop like the existing modules, and hook IA controls to `GoToolkitIAClient` using `public/js/ia-config.js` for routing.
   - Mirror the launcher pattern: a `gtContextModalTrigger` button toggles a `gtContextModal` aside, a `gtContextModalBackdrop`/drawer overlay closes it when clicked or Escape is pressed, and `gtContextModalResizer` plus `gtContextModalVerticalResizer` let users drag the panel on both axes. Persist that width (examples store `${app}-context-width`) so the drawer remembers sizing, collapse the panel when it shrinks below a closing threshold, and keep the vertical resizer aligned with the drawer height so the context area stays usable.
7. Reuse `public/js/prompt.js` templates and wire the `gtTemplateModal` modal (trigger, list, close, apply buttons) so contributors can browse and apply saved templates; `public/js/template-criteria.js` can power additional filters when needed.
8. Surface the IA prompt chooser inside `gtPromptModal` (trigger, overlay, close button) to let users craft prompts before calling `GoToolkitIAClient`.
9. Verify CORS/Authorization headers for any requests that include `Authorization` and ensure worker preflight allows them.
10. Bump cache-buster query strings (see `AGENTS.md` for the canonical value) and deploy workers with `npx wrangler publish` when ready.
11. Hook the shared feedback launcher (`public/js/feedback.js`) by supplying `GoToolkitAppFeedbackConfig` (app id/name/share collection + payload builder) and load the shared CGU script (`public/js/cgu.js`) so `data-open-nexus-modal`/`data-close-nexus-modal` buttons keep the legal modal consistent.

## Checklist

- [ ] Copy base module and rename.
- [ ] Implement `loadState()` / `persistState()` and `STORAGE_KEY`.
- [ ] Implement share UI and `buildSharePayload()` / `buildSharePreview()`.
- [ ] Add capsule/draft save via `goToolkitCapsuleDrafts` when needed.
- [ ] Wire IA client (`GoToolkitIAClient`) and `ia-config`.
- [ ] Add prompt templates through `gtTemplateModal` and optional `template-criteria` modal.
- [ ] Set up `gtContextModal` and `gtPromptModal` triggers/overlays for context & prompt dialogs.
- [ ] Persist the context drawer width and wire the resizer/backdrop (`gtContextModalResizer`, `gtContextModalVerticalResizer`, `gtContextModalBackdrop`) so it closes on small width or outside clicks and stays aligned with the drawer height.
- [ ] Validate CORS and worker secrets, then `npx wrangler publish`.
- [ ] Include the shared feedback launcher + `GoToolkitAppFeedbackConfig` and load `cgu.js` so CGU buttons work consistently.

If you want, I can scaffold `public/newmodule.html` with the common wiring. Tell me the name and required features (share, drafts, IA), and I'll create it.

## IndexedDB data flows

- Modules that need more than localStorage should reuse the shared document manager (`public/js/documents.js` + `public/js/idb-doc-store.js`). `documents.js` builds its own `gotoolkit-documents` database (stores: `documents`, `chunks`, `keyword_meta`) for embedded docs/knowledge chunks, while `idb-doc-store.js` exposes wrappers around the `go-toolkit` database that stores drafts, share history, and desktop settings. This unified approach keeps all app surfaces pointing at the same IndexedDB schema so knowledge, drafts, and share metadata stay aligned across tabs and modules.

***
Short reference: `AGENTS.md` covers repo architecture, workers, and global contracts.
