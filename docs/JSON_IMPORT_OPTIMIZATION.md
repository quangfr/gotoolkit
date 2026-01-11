# JSON Import Optimization (Memo/RAG)

This guide focuses on reducing JSON payload size before import to improve ingestion time
(parse -> chunk -> embed -> index). Smaller text means fewer chunks and fewer embeddings.

## Minify content safely

Goal: keep semantic content, drop noise.

- Remove unused fields: metadata, IDs, timestamps, audit trails, debug fields.
- Drop empty values: null, "", [], {} when they are not needed downstream.
- Collapse whitespace: trim strings, normalize repeated spaces/newlines.
- Prefer arrays of primitives over deep object graphs when only labels matter.
- Split huge documents into smaller, topical files to reduce per-import embedding cost.

## Practical patterns

### Keep only key fields

If the AI only needs titles + descriptions, remove everything else.

```json
// Before
{
  "caseId": "CFM-MA-2023-00048",
  "createdAt": "2025-12-12T12:34:56Z",
  "history": [...],
  "details": {
    "title": "Incident X",
    "summary": "Long narrative...",
    "notes": "..."
  }
}
```

```json
// After
{
  "caseId": "CFM-MA-2023-00048",
  "title": "Incident X",
  "summary": "Long narrative..."
}
```

### Flatten nested text

Flatten text fields that are nested and keep only the content the model needs.

```json
// Before
{ "sections": [{ "label": "Findings", "text": "..." }, { "label": "Actions", "text": "..." }] }
```

```json
// After
{ "findings": "...", "actions": "..." }
```

### Remove verbose lists

Large arrays of raw events are expensive. Keep summaries or aggregates instead.

```json
// Before
{ "events": [{ "ts": "...", "msg": "..." }, ...] }
```

```json
// After
{ "eventSummary": "Key timeline points..." }
```

## Quick checklist

- Keep: titles, summaries, decisions, constraints, key facts.
- Drop: logs, duplicated content, unused metadata, raw dumps.
- Trim: whitespace and repeated boilerplate.
- Split: very large files by topic or timeframe.

## Why this helps

Ingestion cost roughly scales with total text length:

- Parsing time increases with JSON size.
- Chunk count rises with text length.
- Embedding time grows with number of chunks.
- IndexedDB writes increase with chunk count.

Reducing input size has the biggest impact on import time.
