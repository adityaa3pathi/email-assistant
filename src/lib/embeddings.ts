import { embed } from "ai"
import { embeddingModel } from "./ai"
import { db } from "@/server/db"

// ─── Embedding Generation ────────────────────────────────────────────────────

/**
 * Generate a 768-dimensional embedding vector for a text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  })
  return embedding
}

// ─── Embedding Storage ───────────────────────────────────────────────────────

/**
 * Store an embedding in the database. Uses raw SQL because Prisma doesn't
 * natively support the pgvector `vector` column type.
 *
 * The EmailEmbedding row is upserted (created or updated) to be idempotent.
 */
export async function storeEmbedding(
  emailId: string,
  accountId: string,
  content: string,
  embedding: number[]
) {
  const vectorStr = `[${embedding.join(",")}]`

  await db.$executeRaw`
    INSERT INTO "EmailEmbedding" (id, "emailId", "accountId", content, embedding)
    VALUES (gen_random_uuid(), ${emailId}, ${accountId}, ${content}, ${vectorStr}::vector)
    ON CONFLICT ("emailId")
    DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
  `
}

// ─── Semantic Search ─────────────────────────────────────────────────────────

export interface SearchResult {
  emailId: string
  content: string
  subject: string
  bodySnippet: string | null
  sentAt: Date
  threadId: string
  similarity: number
}

/**
 * Search for emails semantically similar to a query string.
 * Uses pgvector's cosine distance operator (<=>).
 *
 * Returns results ordered by similarity (highest first).
 */
export async function searchSimilarEmails(
  accountId: string,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query)
  const vectorStr = `[${queryEmbedding.join(",")}]`

  const results = await db.$queryRaw<SearchResult[]>`
    SELECT
      ee."emailId",
      ee.content,
      e.subject,
      e."bodySnippet",
      e."sentAt",
      e."threadId",
      1 - (ee.embedding <=> ${vectorStr}::vector) as similarity
    FROM "EmailEmbedding" ee
    JOIN "Email" e ON e.id = ee."emailId"
    WHERE ee."accountId" = ${accountId}
    ORDER BY ee.embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `

  return results
}
