# Go-Toolkit Import + RAG Overview

## Scope
This document summarizes the document ingestion pipeline, OCR/voice recognition strategy, and IndexedDB storage used by Memo (Assist) imports.

---

## Storage Architecture

### IndexedDB Database: `gotoolkit-documents` (v6)

#### Stores

| Store | Purpose | Indexes |
|-------|---------|---------|
| `documents` | File metadata + chunking config | `conversationId`, `fileHash`, `memoId` |
| `chunks` | Text chunks + embeddings (int8 quantized) | `conversationId`, `docId`, `sourceDocId` |
| `keyword_meta` | Keyword search index metadata | `id` |
| `memo_context_embeddings` | Memo-scoped document links | `memoId`, `docId`, `fileHash` |

#### Document Highlights
- `fileHash` drives deduplication.
- `sourceDocId` is used when duplicating chunks across memos/conversations.
- `qualityMetrics` (optional) captures OCR quality diagnostics.

#### Chunk Highlights
- `emb`: 384-dim embedding stored as `Int8Array`.
- `sourceDocId`: lineage link when chunks are reused (no re-embedding).

---

## File Import Types

### Supported document formats
- PDF, DOCX, PPTX, XLSX, JSON, CSV, TSV, TXT, MD, ODF, RTF, logs.

### Images (OCR)
- PNG, JPG/JPEG, WebP, GIF, BMP, TIFF.

### Audio/Video (Transcription)
- Audio: MP3, WAV, MP4/M4A, AAC, OGG, WebM, FLAC
- Video: MP4, WebM, MOV, AVI (audio extracted only)

### Limits
- Media: 5 GB max, 2 hours duration (client-side validation).
- Text (TXT/MD): 5 MB max.
- Structured data (JSON/CSV/HAG): 2 MB max.
- Documents (PDF/DOCX/DOC/ODT/RTF): 5 MB max.
- Presentations (PPTX): 5 MB max.
- Spreadsheets (XLSX/ODS): 5 MB max.
- Images: 20 MB max.

---

## OCR Strategy (Text Recognition)

### Cloud OCR (Qwen only)
- Uses Qwen 2.5 VL via OpenRouter: `qwen/qwen-2.5-vl-7b-instruct`.
- Images are batched up to 5 per request.
- Prompt comes from `GoToolkitChatPrompt.PRESETS.extract`.
- Errors emit: `OpenRouter : Traitement d'image impossible`.

---

## Voice Recognition (Transcription)

### AssemblyAI Proxy
- Upload to `/upload` → request `/transcript` → poll `/transcript/{id}`.
- Diarization enabled (speaker labels), auto chapters, profanity filtering, EN/FR detection.
- Output uses utterances (text) rather than VTT for ingestion.
- Queue is sequential with per-file progress (upload/transcribe counts).

### Storage Policy
- Imported audio/video: store text only (no blobs) in IndexedDB.
- Voice recordings (◉): keep audio blob in `voice-recordings` (separate path).

---

## Ingestion Flow (Assist)

1. Validate file (size, type, duration).
2. Extract text or transcribe media.
3. Chunk + embed (MiniLM-L6, 384 dims) with int8 quantization.
4. Store document metadata + chunks + keyword metadata.
5. For memo context: link via `memo_context_embeddings`.

### Indexing Behavior
- Keyword index is scoped per `conversationId` (knowledge vs chat are separate).
- Chat file attachments are indexed in the chat conversation, not in the knowledge conversation.
- Index rebuild happens only when `ingestFiles()` runs (imports, manual reindex, checkbox selection changes).
- Sending a prompt to IA never rebuilds the index; it only queries existing chunks/keywords.

### Dedup & Reuse
- If `fileHash` exists and status is `ready`, reuse chunks by copying with `sourceDocId`.
- Avoids re-embedding; only metadata duplicated.

---

## Retrieval
- `vectorSearch()` performs cosine similarity on de-quantized vectors.
- Keyword fallback provides candidate filtering when needed.

---

## Key Files
- `public/js/document-rag.js` — ingestion, OCR, vector search
- `public/js/assist.js` — upload/transcription orchestration + UI
- `public/js/voice-transcript.js` — AssemblyAI proxy calls
- `public/js/ia-client.js` / `public/js/ia-config.js` — OpenRouter vision calls
