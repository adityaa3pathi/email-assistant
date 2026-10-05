-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding vector column to EmailEmbedding table
-- (Prisma can't natively manage vector columns, so we use raw SQL)
ALTER TABLE "EmailEmbedding" ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create HNSW index for approximate nearest neighbor search
-- m=16: number of bi-directional links per node (higher = better recall, more memory)
-- ef_construction=200: size of dynamic candidate list during index build (higher = better quality)
CREATE INDEX IF NOT EXISTS idx_email_embedding_hnsw
  ON "EmailEmbedding"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Create composite index for account-scoped vector queries
CREATE INDEX IF NOT EXISTS idx_email_embedding_account
  ON "EmailEmbedding" ("accountId");
