-- Add generated tsvector column for BM25-style full-text search
-- Weight A = subject (higher relevance), Weight B = body snippet
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS fts_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce("bodySnippet", '')), 'B')
  ) STORED;

-- Create GIN index for fast full-text search lookups
CREATE INDEX IF NOT EXISTS idx_email_fts ON "Email" USING gin (fts_vector);

-- Create composite index for account-scoped text search via thread join
CREATE INDEX IF NOT EXISTS idx_email_thread_id_sent ON "Email" ("threadId", "sentAt" DESC);
