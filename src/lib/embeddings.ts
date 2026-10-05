import { embed, generateObject } from "ai"
import { embeddingModel, geminiFlashLite } from "./ai"
import { db } from "@/server/db"
import { z } from "zod"
import { searchByKeyword } from "./bm25-search"

// ─── Embedding Generation ────────────────────────────────────────────────────

/**
 * Generate a 768-dimensional embedding vector for a text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: 768,
      },
    },
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

export interface SearchFilters {
  from?: string
  after?: Date
  before?: Date
  labels?: string[]
  hasAttachments?: boolean
}

export async function searchSimilarEmailsFiltered(
  accountId: string,
  query: string,
  filters?: SearchFilters,
  limit: number = 10
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query)
  const vectorStr = `[${queryEmbedding.join(",")}]`

  let sql = `
    SELECT
      ee."emailId",
      ee.content,
      e.subject,
      e."bodySnippet",
      e."sentAt",
      e."threadId",
      1 - (ee.embedding <=> $1::vector) as similarity
    FROM "EmailEmbedding" ee
    JOIN "Email" e ON e.id = ee."emailId"
    JOIN "Thread" t ON t.id = e."threadId"
  `

  if (filters?.from) {
    sql += ` JOIN "EmailAddress" from_addr ON from_addr.id = e."fromId"`
  }

  sql += ` WHERE ee."accountId" = $2`

  const params: any[] = [vectorStr, accountId]
  let paramIdx = 3

  if (filters) {
    if (filters.from) {
      sql += ` AND (from_addr.name ILIKE $${paramIdx} OR from_addr.address ILIKE $${paramIdx})`
      params.push(`%${filters.from}%`)
      paramIdx++
    }
    if (filters.after) {
      sql += ` AND e."sentAt" >= $${paramIdx}`
      params.push(filters.after)
      paramIdx++
    }
    if (filters.before) {
      sql += ` AND e."sentAt" <= $${paramIdx}`
      params.push(filters.before)
      paramIdx++
    }
    if (filters.labels && filters.labels.length > 0) {
      sql += ` AND (e."sysLabels" && $${paramIdx} OR t."aiLabels" && $${paramIdx})`
      params.push(filters.labels)
      paramIdx++
    }
    if (filters.hasAttachments !== undefined) {
      sql += ` AND e."hasAttachments" = $${paramIdx}`
      params.push(filters.hasAttachments)
      paramIdx++
    }
  }

  sql += `
    ORDER BY ee.embedding <=> $1::vector
    LIMIT $${paramIdx}
  `
  params.push(limit)

  return await db.$queryRawUnsafe<SearchResult[]>(sql, ...params)
}

export async function hybridSearch(
  accountId: string,
  query: string,
  filters?: SearchFilters,
  limit: number = 10
): Promise<SearchResult[]> {
  const [semanticResults, keywordResults] = await Promise.all([
    searchSimilarEmailsFiltered(accountId, query, filters, limit),
    searchByKeyword(accountId, query, limit)
  ])

  const k = 60
  const fusedScores = new Map<string, { score: number, result: SearchResult }>()

  semanticResults.forEach((result, rank) => {
    const score = 1 / (k + rank)
    fusedScores.set(result.emailId, { score, result })
  })

  keywordResults.forEach((kwResult, rank) => {
    const score = 1 / (k + rank)
    const existing = fusedScores.get(kwResult.emailId)
    if (existing) {
      existing.score += score
    } else {
      const result: SearchResult = {
        emailId: kwResult.emailId,
        content: '',
        subject: kwResult.subject,
        bodySnippet: kwResult.bodySnippet,
        sentAt: kwResult.sentAt,
        threadId: kwResult.threadId,
        similarity: 0
      }
      fusedScores.set(kwResult.emailId, { score, result })
    }
  })

  return Array.from(fusedScores.values())
    .sort((a, b) => b.score - a.score)
    .map(x => x.result)
    .slice(0, limit)
}

export async function rerank(
  query: string,
  results: SearchResult[],
  topK: number = 5
): Promise<SearchResult[]> {
  if (!results.length) return []
  const candidates = results.slice(0, 20)

  try {
    const prompt = `You are a relevance judge. Score each email 0-10 for relevance to the query: '${query}'. Consider subject match, content relevance, and recency.
    
Emails:
${candidates.map((c, i) => `[${i}] emailId: ${c.emailId}, subject: ${c.subject}, snippet: ${c.bodySnippet}, date: ${c.sentAt.toISOString()}`).join('\n')}`

    const { object } = await generateObject({
      model: geminiFlashLite,
      schema: z.object({
        scores: z.array(z.object({
          emailId: z.string(),
          relevanceScore: z.number()
        }))
      }),
      prompt
    })

    const scoreMap = new Map<string, number>()
    for (const score of object.scores) {
      scoreMap.set(score.emailId, score.relevanceScore)
    }

    const reranked = [...candidates].sort((a, b) => {
      const scoreA = scoreMap.get(a.emailId) ?? 0
      const scoreB = scoreMap.get(b.emailId) ?? 0
      return scoreB - scoreA
    })

    return reranked.slice(0, topK)
  } catch (error) {
    console.error("Reranking failed:", error)
    return candidates.slice(0, topK)
  }
}
