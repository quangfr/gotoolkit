CREATE TABLE IF NOT EXISTS oauth_sessions (
  provider TEXT NOT NULL,
  session_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (provider, session_key)
);

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires_at
ON oauth_sessions (expires_at);
