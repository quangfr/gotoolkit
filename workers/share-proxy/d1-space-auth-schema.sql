CREATE TABLE IF NOT EXISTS space_code_hashes (
  space_id TEXT NOT NULL PRIMARY KEY,
  code_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_space_code_hashes_updated_at
ON space_code_hashes (updated_at);
