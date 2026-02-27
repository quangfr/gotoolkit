# Private/Cloud Storage And Playwright Sync Tests

## Storage model
- Private documents are stored locally in IndexedDB via `goToolkitDocumentApi` (`go-toolkit` DB).
- Cloud documents are stored in Firestore through `goToolkitShareWorker`:
  - page content collection: `pages`
  - metadata/tree collection: `pages-meta`
- Cloud history/cache in browser is tracked by `goToolkitShareHistory`.
- Pending cloud operations are tracked in `goToolkitCloudDrafts` (create/edit/move/archive/delete).

## Sync behavior (current)
- Entry point: sync button in shared section (`.document-explorer__item-action--sync-refresh`).
- Main sync resolves tree/pages conflicts first (LWW + pending ops handling).
- Remote delete semantics:
  - cloud delete writes `pages-meta.status = "deleted"` (legacy records may still have `archived`),
  - sync treats both `archived` and `deleted` as removed from the shared tree UI.
- After core sync:
  - upload phase materializes inline media assets and pushes updated payloads.
  - download phase prefetches referenced cloud assets for local availability.
- Icon phases:
  - core sync: `refresh-cw` (spin)
  - asset upload phase: `arrow-big-up` (slide-up animation)
  - asset download phase: `arrow-big-down` (slide-down animation)

## Private/cloud move behavior
- Cloud → Private move:
  - local private copy is created,
  - cloud record is removed from local shared list,
  - archive operation is queued for sync.
- Private → Cloud move:
  - cloud create draft is queued,
  - shared record is created locally,
  - sync persists it remotely.
- Asset handling is shared through the same cloud payload/asset workflow after sync phases.

## Playwright tests to run
- Main cloud sync non-regression:
  - `tests/cloud-sync-persist.spec.ts`
- Cloud/private transfer and persistence coverage:
  - `tests/cloud-private-transfer-sync.spec.ts`
- Other persistence checks:
  - `tests/cloud-switch-persist.spec.ts`
  - `tests/private-switch-persist.spec.ts`

## Commands
- Start test server:
  - `npm run start:test`
- Run selected specs:
  - `./node_modules/.bin/playwright test tests/cloud-sync-persist.spec.ts tests/cloud-private-transfer-sync.spec.ts --workers=1 --reporter=line`

## Archived -> Deleted migration (remote worker)
- Script:
  - `scripts/migrate-archived-pages-to-deleted.mjs`
- What it migrates:
  - `pages-meta` records where `status === "archived"` and `archivedReason === "deleted"` to `status = "deleted"`.
  - It preserves metadata and adds `deletedAt` if missing.
- Safety:
  - default mode is dry-run (no writes),
  - does not touch archive records that are not delete-origin (for example `moved-to-local`).
- Commands:
  - Dry-run:
    - `node scripts/migrate-archived-pages-to-deleted.mjs --dry-run`
  - Apply:
    - `node scripts/migrate-archived-pages-to-deleted.mjs --apply`
  - Optional flags:
    - `--base-url=https://share.gotoolkit.workers.dev`
    - `--batch-size=100` (max 200)
    - `--include-missing-reason` (also migrates archived records with no `archivedReason`)
