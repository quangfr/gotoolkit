# GoToolkit Data Architecture

Date: 2026-03-01
Purpose: describe how app data is structured, stored, synced, ingested, and processed so coding agents can modify the right layer without guessing
Scope: `public/`, `workers/share-proxy`, browser storage, cloud storage

## 1. Data layers

GoToolkit uses three main data layers:

- browser-local state in `localStorage`
- browser-local structured state in IndexedDB
- remote shared state through `share-proxy`

The app does not use one universal persistence model. Data location depends on the feature:

- private docs and most editor state: local
- shared pages and shared assets: remote
- AI/RAG imports: mostly local, sometimes processed through workers/upstream APIs
- voice recordings: local
- OAuth/session state: worker-side plus browser cookies/events

## 2. Browser storage

## 2.1 `localStorage`

Used for small persistent values:

- theme and UI preferences
- AI backend selection
- speech settings
- prompt presets
- cloud sync helper state
- some integration preferences

Important point:

- `document-api` and `share-history` previously had `localStorage` keys but current code removes those old keys and uses IndexedDB-backed storage wrappers instead

## 2.2 IndexedDB

Main DB in `public/js/document-storage.js`:

- DB name: `go-toolkit`
- DB version: `11`

Current stores:

- `document-api`
- `share-history`
- `documents-settings`
- `memo-images`
- `voice-recordings`
- `knowledge-manifest`
- `knowledge-manifest-cache`
- `knowledge-overrides`
- `knowledge-selection`
- `knowledge-descriptions-overrides`
- `knowledge-local-docs`
- `templates`
- `cloud-drafts`

Important naming note:

- `templates` is legacy naming still present in storage/code
- treat it as a historical label for reusable/shared memo payloads, not as the primary current product concept
- current user-facing persistence should be reasoned about first through cloud shares and shared pages
- `knowledge-*` is also internal naming that mostly refers to pages/docs selected and ingested for AI retrieval, not a separate business data domain

RAG DB in `public/js/document-rag.js`:

- DB name: `gotoolkit-documents`
- DB version: `6`

Current stores:

- `documents`
- `chunks`
- `keyword_meta`
- `memo_context_embeddings`

## 3. Document model

Main local document registry:

- `public/js/document-api.js`
- IndexedDB store: `document-api`

Each document record is keyed by `id` and includes at least:

- `id`
- `app`
- `payload`
- `title`
- `description`
- `category`
- `superpowers`
- `updatedAt`
- `lastOpenedAt`
- `pinned`

Optional linkage fields:

- `voiceRecordingId`
- `handoffId`
- `notionPageId`
- `notionPageUrl`
- `notionPath`
- `notionWorkspaceId`
- `parentId`
- `icon`
- `spaceId`
- `shareToken`

Interpretation:

- `payload` is the app-specific content
- `app` identifies which app owns the content
- `spaceId` and `shareToken` connect a local record to shared/cloud state
- `voiceRecordingId` links a memo/document to a local recording in `voice-recordings`

## 4. Share history and cloud drafts

Share history store:

- file: `public/js/share-history.js`
- IndexedDB store: `share-history`

Structure:

- grouped by app
- then by share `token`

Typical record role:

- remember previously shared records
- keep cloud-facing identifiers and ordering metadata for the UI

Cloud draft queue:

- IndexedDB store: `cloud-drafts`
- UI logic mainly in `public/index.html`

Role:

- queue pending cloud operations before sync
- current operations include create/edit/move/archive/delete

This queue is central to offline-first or delayed-sync behavior.

## 5. Shared/cloud page model

Main browser client:

- `public/js/share-worker-client.js`

Main worker:

- `workers/share-proxy/index.js`

Remote collections:

- content collection: `pages`
- metadata/tree collection: `pages-meta`

Collection families also used elsewhere by sharing:

- `memos`
- `grids`
- `template-memos`

Naming note:

- `template-memos` is still used in some functions and storage paths
- this is legacy naming and should be read as a share-backed memo variant, not as a separate modern persistence model

Current separation of concerns:

- `pages`: content payload
- `pages-meta`: title, tree, hierarchy, status, sharing metadata

For cloud pages, agents should assume:

- content and tree metadata are not stored in the same remote record
- sync logic may need to reconcile both layers

## 6. Shared assets

Remote asset flow is handled by `share-proxy`.

Remote storage:

- R2 bucket via worker bindings

Asset routes:

- upload: `/v1/assets/upload`
- read: `/v1/assets/:id`
- delete: `/v1/assets/:id`

Browser-side handling exists in:

- `public/js/share-worker-client.js`
- sync/orchestration in `public/index.html`

Important details from current code:

- asset scope is tied to a `spaceId`
- read/delete require `X-Space-Id` and `X-Space-Auth`
- worker rejects assets outside the authenticated space scope
- assets can be referenced inside page payloads and then prefetched locally after sync

Cloud sync has explicit asset phases:

- upload-assets
- download-assets

The UI sync button reflects these phases.

## 7. Encrypted asset and page payload handling

`public/js/share-worker-client.js` supports encrypted content flows for shared spaces.

Important constants:

- `E2EE_ASSET_MIME = "application/x-gotoolkit-e2ee+json"`
- `PAGE_PAYLOAD_REF_TYPE = "page-payload-ref"`
- `PAGE_PAYLOAD_REF_VERSION = 1`
- `PAGE_PAYLOAD_OFFLOAD_THRESHOLD_BYTES = 350 * 1024`

Meaning:

- some payloads/assets are materialized, encrypted, uploaded, and then referenced indirectly
- large page payloads can be offloaded by reference instead of staying inline

Key browser caches:

- `assetBlobCache`
- `spaceKeyCache`
- `spaceContentKeyCache`
- `spaceAuthTokenCache`
- `oauthIdentityCache`

Current crypto path:

- `/v1/spaces/auth` returns `contentKey`
- browser caches/imports the key
- AES-GCM is used client-side for encryption/decryption

Agents should not assume:

- all shared payloads are plain JSON directly stored inline in Firestore

## 8. Sync model

Main sync behavior is orchestrated in `public/index.html` and worker calls are made through `share-worker-client.js`.

Current sync model:

- tree/content reconciliation first
- then asset upload phase
- then asset prefetch/download phase

Current sync headers on protected write paths:

- `X-Sync-Session`
- `X-Sync-JTI`
- `X-Sync-TS`

Share auth headers:

- `X-Space-Id`
- `X-Space-Auth`

Current browser sync behavior:

- sync session id is generated client-side and reused during TTL
- each request gets a fresh JTI
- response `Date` header can adjust client clock offset
- one retry is performed on invalid sync timestamp errors

Current delete semantics:

- cloud deletion writes `pages-meta.status = "deleted"`
- legacy records may still appear as `archived`
- UI sync treats both as removed

## 9. Private vs cloud moves

Private -> Cloud:

- a cloud create draft is queued
- shared record is created locally
- sync persists it remotely

Cloud -> Private:

- a local private copy is created
- cloud record is preserved in shared storage/list

Asset handling follows the same sync pipeline after the structural move.

## 10. Voice recordings

Main file:

- `public/js/voice.js`

Local store:

- IndexedDB store: `voice-recordings`

Voice recordings are local-first data. They are not part of the shared page persistence by default.

A saved recording record currently includes fields such as:

- `id`
- `type: "voice-recording"`
- `documentId`
- `memoId`
- `memoName`
- `audioBlob`
- `videoBlob`
- `duration`
- `recordingDate`
- `transcriptText`
- additional recording/session metadata depending on mode

Current recording behavior:

- recording blobs are assembled in browser
- saved to IndexedDB
- linked back to a memo through `voiceRecordingId`
- UI can later resolve the recording and choose icon/audio/video behavior from the stored blob presence

Related files:

- `public/js/voice-audio-player.js`
- `public/js/voice-video-player.js`
- `public/js/voice-transcript.js`

## 11. Transcription flow

Recording and media transcription use AssemblyAI through the worker path, not direct browser credentials by default.

Path:

- browser -> `assemblyai-proxy` -> AssemblyAI

Current operations:

- upload media
- request transcript
- poll transcript
- fetch VTT
- delete transcript upstream after retrieval in some flows

Results:

- transcript text can be stored back into the local recording record
- transcript text can also be imported into memo/document flows as plain text content

Important distinction:

- the media blob is local
- the generated transcript can become document content, imported content, or recording metadata

## 12. Imported documents and RAG ingestion

Main file:

- `public/js/document-rag.js`

Local RAG storage is in IndexedDB `gotoolkit-documents`.

Current accepted file families include:

- text and markdown
- PDF
- Office documents
- CSV/TSV/JSON/log formats
- images for OCR
- media-adjacent transcript text imports

Current RAG data model:

- `documents`: file metadata and ingestion config
- `chunks`: embedded chunks
- `keyword_meta`: keyword/hybrid search metadata
- `memo_context_embeddings`: memo-scoped links and enabled flags

Processing behavior:

- extract text by format
- choose chunk strategy
- embed locally with Transformers.js by default
- optionally use cloud embeddings for some oversized files/configurations
- retrieve by vector similarity and keyword fallback

Important point:

- imported source files are not the same thing as app documents in `document-api`
- RAG has its own DB, schema, and ingestion lifecycle

## 13. Legacy `knowledge` naming for AI ingestion

The `go-toolkit` IndexedDB also contains `knowledge-*` stores:

- `knowledge-manifest`
- `knowledge-manifest-cache`
- `knowledge-overrides`
- `knowledge-selection`
- `knowledge-descriptions-overrides`
- `knowledge-local-docs`

The word `knowledge` is misleading if read literally. In the current app, it mostly means:

- pages or documents selected as AI retrieval input
- cached manifests and selection state for AI-in indexing
- local overrides and descriptive metadata used by the assist UI

It should not be treated as a separate primary storage system alongside private docs or cloud shares.

For agents, the practical interpretation is:

- `knowledge-*` stores support AI ingestion, indexing selection, caching, and preview flows
- the underlying source data is usually still private docs, shared pages, or imported documents
- when changing AI-in or retrieval behavior, inspect these stores before adding new persistence or inventing a new data model

## 14. Legacy `template` naming

The word `template` is still present in several stores, helpers, and collection names:

- IndexedDB store: `templates`
- helper: `window.goToolkitTemplateStore`
- remote collection naming: `template-memos`

For current development, do not assume this means there is a separate primary data system called "templates".

The safer interpretation is:

- these names are legacy labels still used by some code paths
- the active persistence model to reason about is still local data plus cloud shares
- when changing a flow, inspect whether it is really a share flow with older naming rather than a distinct template subsystem

## 15. Practical debugging map

If a document disappears locally:

- inspect `document-api`
- inspect `voice-recordings` if the doc references `voiceRecordingId`
- inspect local reset logic that clears IndexedDB/localStorage

If a cloud page exists but tree navigation is wrong:

- inspect `pages-meta`
- inspect `parentId`, `spaceId`, `updatedAt`
- inspect local `share-history`

If shared content loads but media is missing:

- inspect asset references inside payload
- inspect `/v1/assets/:id` scope/auth
- inspect sync `download-assets` prefetch phase

If sync duplicates or drops changes:

- inspect `cloud-drafts`
- inspect `X-Sync-*` request path
- inspect `pages` vs `pages-meta` divergence

If an imported file is searchable but not visible as a memo:

- inspect `gotoolkit-documents`
- do not expect it in `document-api`

## 16. Files to inspect first

- `public/js/document-storage.js`
- `public/js/document-api.js`
- `public/js/share-history.js`
- `public/js/share-worker-client.js`
- `public/js/document-rag.js`
- `public/js/voice.js`
- `public/js/voice-transcript.js`
- `public/js/voice-audio-player.js`
- `public/js/voice-video-player.js`
- `public/index.html`
- `workers/share-proxy/index.js`

## 17. Rule for agents

Before changing data behavior, identify which data family you are touching:

- local app document
- shared cloud page
- shared asset
- local voice recording
- imported/RAG document
- AI-ingestion metadata (`knowledge-*`) or legacy-template metadata

These data families use different stores, schemas, and sync rules. Avoid moving data between them implicitly.
