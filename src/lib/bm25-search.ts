import { db } from "@/server/db";

export interface KeywordSearchResult {
  emailId: string;
  subject: string;
  bodySnippet: string;
  sentAt: Date;
  threadId: string;
  rank: number;
}

/**
 * Searches emails using PostgreSQL full-text search (BM25-style ranking).
 * 
 * @param accountId - The ID of the account to scope the search to
 * @param query - The search query string
 * @param limit - Maximum number of results to return (default 10)
 * @returns Array of KeywordSearchResult ordered by rank
 */
export async function searchByKeyword(
  accountId: string,
  query: string,
  limit: number = 10
): Promise<KeywordSearchResult[]> {
  if (!query || query.trim() === '') {
    return [];
  }

  try {
    const results = await db.$queryRaw<KeywordSearchResult[]>`
      SELECT 
        e.id as "emailId", 
        e.subject, 
        e."bodySnippet", 
        e."sentAt", 
        e."threadId", 
        ts_rank_cd(e.fts_vector, plainto_tsquery('english', ${query})) as rank
      FROM "Email" e
      JOIN "Thread" t ON e."threadId" = t.id
      WHERE t."accountId" = ${accountId}
        AND e.fts_vector @@ plainto_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
    return results || [];
  } catch (error) {
    console.error("Keyword search failed:", error);
    return [];
  }
}
