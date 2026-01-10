# Go-Toolkit RAG Architecture

## Overview

The RAG (Retrieval-Augmented Generation) system in Go-Toolkit enables semantic search across ingested documents using vector embeddings. It combines local IndexedDB storage, on-device embedding models (Transformers.js), and keyword indexing for efficient document retrieval.

**Key Components:**
- `document-rag.js` — Document manager, embedding, vectorization, retrieval
- `document-parser.js` — Text extraction, chunking, embedding batch processing
- `keywordIndex.js` — Hybrid keyword search for candidate filtering
- `document-storage.js` — IndexedDB persistence layer

---

## Storage Architecture

### IndexedDB Database: `gotoolkit-documents` (v5)

#### Stores

| Store | Purpose | Indexes |
|-------|---------|---------|
| `documents` | File metadata + chunking config | `conversationId`, `fileHash` |
| `chunks` | Text chunks + embeddings (int8 quantized) | `conversationId` |
| `keyword_meta` | Keyword search index | `conversationId` |
| `memo_context_embeddings` | Memo-scoped document links | `memoId`, `docId` |

#### Document Schema
```javascript
{
  id: UUID,                       // Unique doc identifier
  conversationId: string,         // Scope (conversation/memo)
  name: string,                   // Display name
  sourceFileName: string,         // Original filename
  fileHash: string,               // Content hash (dedup key)
  size: number,                   // File size in bytes
  mime: string,                   // MIME type
  scope: ["local"|"attachments"|"embedded"],
  status: "pending" | "ready" | "error",
  chunkCount: number,             // Total chunks ingested
  chunkSize: number,              // Token target per chunk
  chunkOverlap: number,           // Overlap tokens
  chunkSizeCategory: "small" | "medium",
  sourceType: "context" | "embedded",
  abstract: string,               // Derived summary
  uploadedAt: number,             // Timestamp
  parsedAt: number,               // Indexing completion
  rawText: string,                // Full extracted text
  fileBuffer: ArrayBuffer,        // PDF/attachment binary (optional)
  error: string                   // Error message if failed
}
```

#### Chunk Schema
```javascript
{
  id: UUID,                       // Unique chunk identifier
  conversationId: string,         // Scope
  docId: UUID,                    // Parent document (sharding)
  idx: number,                    // Sequence index in document
  text: string,                   // Chunk content
  emb: Int8Array,                 // 384-dim embedding (MiniLM-L6, int8 quantized)
  page: number,                   // PDF page number (optional)
  path: string,                   // JSON path (for structured data)
  parentPath: string,             // Parent JSON path
  rawChunk: object,               // Original JSON structure (optional)
  metadata: object,               // Type-specific metadata
  size: "small" | "medium",       // Chunk size category
  sourceType: "context" | "embedded",
  createdAt: number               // Indexing timestamp
}
```

#### Memo Embeddings Link Schema
```javascript
{
  id: string,                     // `${memoId}:${docId}`
  memoId: string,                 // Associated memo
  tabId: string,                  // Memo tab (optional)
  docId: UUID,                    // Document ID
  fileHash: string,               // Content hash
  fileName: string,               // Display name
  size: number,                   // File size
  importedAt: number,             // Link timestamp
  chunkCount: number,             // Chunks available
  enabled: boolean                // Active for retrieval (default: true)
}
```

---

## Text Extraction & Chunking Pipeline

### 1. Format-Specific Extraction

| Format | Method | Output |
|--------|--------|--------|
| `.pdf` | pdfjs-dist (page extraction) | `{ text, pdfPages: [{pageNumber, text}] }` |
| `.docx` / `.doc` | JSZip + XML parsing | Plain text |
| `.pptx` | JSZip + slide XML parsing | Text per slide |
| `.xlsx` / `.ods` | JSZip + table extraction | Tabular rows |
| `.json` | JSON structure analysis | `{ text, jsonChunks: [...] }` |
| `.csv` / `.tsv` | Row-based parsing | Tabular format |
| `.md` / `.txt` | Direct parsing | Plain text |
| `.odt` / `.rtf` | XML/RTF parsing | Plain text |

### 2. Heuristic-Based Chunk Sizing

**Algorithm:** Analyze text to determine chunk category:

```javascript
const CHUNK_HEURISTICS = {
  lineBreakThreshold: 1500,     // If > 1500 line breaks → small chunks
  bulletThreshold: 30,          // If > 30 bullets → small chunks
  tableThreshold: 80,           // If > 80 pipe chars → small chunks
  charThreshold: 80000          // If > 80KB → small chunks
}
```

**Categories:**
- **Small** (default): `chunkSize=360`, `overlap=120` tokens
- **Medium** (structured): `chunkSize=600`, `overlap=210` tokens

### 3. Format-Specific Chunking Strategy

#### JSON
- **Algorithm:** Recursive depth-first traversal with size-aware splitting
- **Output:** `jsonChunks` array with `{ textForEmbedding, rawChunk, path, parentPath, metadata }`
- **Limits:** 6500 chars max per chunk, 1400 chars max total

#### CSV/TSV/XLSX/ODS
- **Algorithm:** `chunkRows()` — group rows (min: 20, max: 200 per chunk)
- **Metadata:** `{ chunkType: "table-rows" }`

#### Markdown/DOCX/PPTX/ODT/RTF/DOC
- **Algorithm:** 
  1. Extract sections via heading hierarchy
  2. Within each section, split by tokens (target: 600, min: 300, max: 800)
  3. Metadata: `{ chunkType: "section", headingPath: [...] }`

#### PDF
- **Algorithm:**
  1. Extract text per page
  2. Split by paragraphs (max: 2400 chars)
  3. Fallback to token-based chunking if no paragraphs
  4. Metadata: `{ chunkType: "pdf-paragraph", pageNumber }`

#### Log Files (.log, .jsonl, .ndjson)
- **Detection:** Check if ≥6 lines start with `[YYYY-MM-DD]` timestamp
- **Algorithm:** Batch events (default: 80 lines per chunk)
- **Metadata:** Parsed timestamps, log levels (INFO/WARN/ERROR), service names

### 4. Batch Embedding

**Model:** `Xenova/all-MiniLM-L6-v2` (384-dim vectors)
- Downloaded on-demand via Transformers.js
- Cached in `window.GoToolkitWebLLM`
- Embedded chunks: All chunks from all docs → batch embed via transformer
- **Quantization:** Float32 → Int8Array for storage (4x reduction)

**Skip Condition:** Chunks < 20 chars → zero embedding `Int8Array(384)`

---

## Retrieval Pipeline

### Vector Search: `vectorSearch(query, conversationId, options)`

**Flow:**
1. **Embed Query** → 384-dim vector via MiniLM-L6
2. **Load Candidates** → Fetch chunks from conversation
3. **Dequantize** → Convert Int8Array → Float32Array for similarity
4. **Score** → Cosine similarity: `score = dot(query_emb, chunk_emb) / (||query|| * ||chunk||)`
5. **Filter** → Min score threshold (default: 0.1)
6. **Rank** → Sort by descending similarity
7. **Truncate** → Return top-K (default: 10)

**Options:**
```javascript
{
  vector: Float32Array,           // Pre-computed embedding (optional)
  candidateIds: string[],         // Filter by chunk IDs (docId sharding)
  minScore: number,               // Similarity threshold (default: 0.1)
  topK: number,                   // Result limit (default: 10)
  chunks: Chunk[],                // Pre-loaded chunks (optional)
  docs: Document[]                // Pre-loaded documents (optional)
}
```

### Hybrid Keyword Fallback: `searchKeywordCandidates(query, conversationId)`

**Algorithm:** Frequency-based term matching
- **Input:** Query string
- **Output:** Set of candidate chunk IDs matching keywords
- **Used For:** Pre-filtering expensive vector searches

---

## Ingestion Workflow

### `ingestFiles(files, conversationId, options)`

**Sequence:**
1. **Deduplication** → Compute file hash, check `existingHashes`
2. **Skip if Duplicate** → Return `{ duplicate: true }`
3. **Extraction** → Call format-specific `extract*()` method
4. **Chunking** → Apply heuristic-based strategy
5. **Embedding** → Batch embed all chunks via transformer
6. **Quantization** → Convert Float32Array → Int8Array (4x storage savings)
7. **Storage** → Insert document + chunks into IndexedDB
8. **Keyword Index** → Add to hybrid search index
9. **Memo Link** → If `memoId` provided, link in `memo_context_embeddings`

**Options:**
```javascript
{
  sourceType: "context" | "embedded",
  memoId: string,                 // Associate with memo (optional)
  tabId: string,                  // Memo tab ID (optional)
  metadata: Map<filename, meta>,  // Custom metadata
  onProgress: (event) => {}       // Progress callback
}
```

**Progress Events:**
- `{ type: "file-start", index, total, file }`
- `{ type: "file-skip", file, reason: "duplicate" | "reused" }`
- `{ type: "chunk", file, progress: 0-100 }`
- `{ type: "chars", file, processedChars, totalChars }`
- `{ type: "file-done", file }`

---

## Key Features

### Sharding by Document (docId)
Each chunk stores `docId` → enables:
- **Per-file stats:** `getChunksByDocId(docId)`
- **Selective deletion:** Delete all chunks of a file
- **Scoped retrieval:** RAG queries filtered by `docId` (future)

### Deduplication
Files with identical hash → reuse existing chunks
- Saves embedding compute
- Prevents duplicate retrieval results
- Maintains single copy in storage

### Incremental Indexing
Files can be re-indexed independently
- Other files' embeddings untouched
- Supports updates without full re-ingestion

### Format Normalization
All text paths converted to UTF-8, line endings normalized
- Consistent across PDF/DOCX/JSON imports
- Preserves structure metadata (heading path, JSON path, page)

### Error Resilience
Failed extraction → document marked as `status: "error"`
- Subsequent retrieval skips broken docs
- User-visible error feedback

---

## Configuration

### Chunk Size Settings

**File:** `public/config.json` (future) or defaults in `document-rag.js`

```javascript
DEFAULT_SETTINGS = {
  chunkSize: 360,               // Tokens per small chunk
  chunkOverlap: 120,            // Overlap tokens
  embedModelId: "Xenova/all-MiniLM-L6-v2"
}

CHUNK_CATEGORY_DEFINITIONS = {
  small: { chunkSize: 360, overlap: 120, ... },
  medium: { chunkSize: 600, overlap: 210, ... }
}
```

### Retrieval Defaults

```javascript
DEFAULT_RETRIEVAL_TOP_K = 10;
DEFAULT_RETRIEVAL_MIN_SCORE = 0.1;
```

---

## Integration Points

### Assist Module (`assist.js`)
- Calls `docManager.ingestFiles()` on document import
- Filters retrieval by `enabled` flag (memo attachments)
- Displays chunk count in UI
- Manages document lifecycle: upload → indexing → activation

### Memo Module (`memo.html` + `memo.bundle.js`)
- Links documents to memos via `memoEmbeddings`
- Toggle `enabled` state for RAG activation
- Displays active documents in composer
- Shows context attachment status

### Chat System
- User message → Query embedding → `vectorSearch()` → Top-K chunks
- Chunks dequantized on retrieval for similarity computation
- Context injected into LLM prompt with chunk `docName`, `fileName`, `score`

---

## Performance Considerations

### Optimizations (Implemented)
1. **Quantized Storage** (Int8Array): 4x storage reduction vs Float32
2. **Keyword Pre-filtering**: Reduce vector comparisons via candidate pre-selection
3. **Chunked Indexing**: IndexedDB caching prevents re-embedding across sessions
4. **In-Memory Similarity**: Fast cosine computation with float arrays

### Bottlenecks
1. **First embedding:** Transformer.js download (~50MB) on first use
2. **Batch embedding:** Large document sets (100+ chunks) → noticeable compute
3. **Dequantization:** Int8 → Float32 on each retrieval (negligible overhead)

### Future Scaling
- Web Worker embedding → prevent UI blocking on large batches
- GPU-accelerated search (TensorFlow.js) → for 10k+ chunk corpora
- Progressive quantization schemes → fine-tuned trade-offs

---

## Troubleshooting

### Embeddings not indexing
- Check IndexedDB `gotoolkit-documents` exists (v5+)
- Verify Transformers.js loaded: `window.GoToolkitWebLLM`
- Check browser console for extraction errors
- Verify `indexedDB.open()` succeeds with sufficient quota

### Retrieval returns no results
- Verify document status: `ready` (not `pending` or `error`)
- Check similarity threshold: min score 0.1
- Try keyword search: `searchKeywordCandidates()`
- Confirm `enabled` flag is true for memo documents

### Slow ingestion
- Large files (>100MB) → browser memory limit
- Many small files → embedding batching overhead
- Monitor IndexedDB quota: `navigator.storage.estimate()`
- Consider API-based embedding for very large corpora

### Storage concerns
- Quantized embeddings use ~400 bytes per chunk (384 dims × 1 byte)
- Large libraries: 10k chunks ≈ 4MB storage
- Clean up old documents via `deleteDocumentChunks(docId)`

---

## Related Files

- `document-rag.js` — Core RAG engine (2176+ lines)
- `document-parser.js` — File parsing + chunking (referenced, separate module)
- `keywordIndex.js` — Hybrid search index
- `document-storage.js` — IndexedDB wrapper
- `assist.js` — Integration with chat/memo UI (6636+ lines)
- `memo.bundle.js` — Memo-specific RAG features
- `config.json` — Feature flags & file size limits
