import { inngest } from "./client";
import { db } from "@/server/db";
import { GmailAccount } from "@/lib/gmail-account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { generateText } from "ai";
import { geminiFlashLite } from "@/lib/ai";
import { generateEmbedding, storeEmbedding } from "@/lib/embeddings";

// ─── Batch size for processing large email sets ─────────────────────────────

/** Number of emails to save to the DB in a single batch. */
const DB_BATCH_SIZE = 50;

/** Delay between AI API calls to stay within Gemini free tier rate limits */
const AI_RATE_LIMIT_DELAY_MS = 2500;

// ─── Helper: sleep for rate limiting ─────────────────────────────────────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Phase 1: Initial Sync (Last 7 Days) ────────────────────────────────────

/**
 * Fast initial sync job — fetches the last 7 days of emails from Gmail.
 *
 * Triggered immediately after OAuth callback so the user sees emails quickly.
 * After completion, it queues the historical backfill job and AI processing.
 *
 * Steps are wrapped in `step.run()` for Inngest durability — if the function
 * crashes mid-way, it resumes from the last completed step.
 */
export const initialSyncJob = inngest.createFunction(
  {
    id: "sync-initial-emails",
    triggers: [{ event: "email/sync.initial" }],
    concurrency: [{ key: "event.data.accountId", limit: 1 }],
  },
  async ({ event, step }) => {
    const { accountId, userId } = event.data as {
      accountId: string;
      userId: string;
    };

    // Step 1: Fetch account from DB
    const accountRecord = await step.run("fetch-account", async () => {
      return await db.account.findFirst({
        where: { id: accountId, userId },
      });
    });

    if (!accountRecord) {
      return { status: "account_not_found" };
    }

    // Step 2: Mark sync as in progress
    await step.run("mark-syncing", async () => {
      await db.account.update({
        where: { id: accountId },
        data: { syncStatus: "syncing", syncError: null },
      });
    });

    // Step 3: Fetch emails from Gmail API (last 7 days)
    let fetchResult: { emails: ReturnType<typeof JSON.parse>; historyId: string };

    try {
      fetchResult = await step.run("fetch-emails", async () => {
        const gmailAccount = new GmailAccount(accountId);
        const result = await gmailAccount.fetchEmails(7);
        console.log(
          `[inngest:initial-sync] Fetched ${result.emails.length} emails for account ${accountId}`,
        );
        return result;
      });
    } catch (error) {
      // Mark as failed if email fetch fails
      await step.run("mark-failed-fetch", async () => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await db.account.update({
          where: { id: accountId },
          data: { syncStatus: "failed", syncError: errorMessage },
        });
      });
      throw error;
    }

    // Step 4: Save emails to DB
    if (fetchResult.emails.length > 0) {
      try {
        await step.run("save-emails", async () => {
          await syncEmailsToDatabase(fetchResult.emails, accountId);
          console.log(
            `[inngest:initial-sync] Saved ${fetchResult.emails.length} emails to DB for account ${accountId}`,
          );
        });
      } catch (error) {
        await step.run("mark-failed-save", async () => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          await db.account.update({
            where: { id: accountId },
            data: { syncStatus: "failed", syncError: errorMessage },
          });
        });
        throw error;
      }
    }

    // Step 5: Store historyId and transition to historical phase
    await step.run("mark-historical", async () => {
      await db.account.update({
        where: { id: accountId },
        data: {
          nextDeltaToken: fetchResult.historyId,
          syncStatus: "syncing_historical",
          syncError: null,
          lastSyncedAt: new Date(),
        },
      });
    });

    // Step 6: Queue historical backfill + AI processing
    const threadIds = await step.run("get-thread-ids", async () => {
      const threads = await db.thread.findMany({
        where: { accountId },
        select: { id: true },
      });
      return threads.map((t) => t.id);
    });

    const emailIds = await step.run("get-email-ids", async () => {
      const emails = await db.email.findMany({
        where: { thread: { accountId } },
        select: { id: true },
      });
      return emails.map((e) => e.id);
    });

    await step.sendEvent("trigger-ai-processing", [
      { name: "email/sync.historical", data: { accountId, userId } },
      { name: "email/ai.summarize", data: { accountId, threadIds } },
      { name: "email/ai.classify", data: { accountId, threadIds } },
      { name: "email/ai.embed", data: { accountId, emailIds } },
    ]);

    return {
      status: "fast_sync_completed",
      emailsSynced: fetchResult.emails.length,
    };
  },
);

// ─── Phase 2: Historical Backfill (All History) ─────────────────────────────

/**
 * Historical sync job — fetches ALL emails from Gmail (no date filter).
 *
 * Since this can return thousands of emails, they are saved to the database
 * in batches of {@link DB_BATCH_SIZE} to avoid memory pressure and long
 * transactions.
 *
 * On completion, the account is marked as fully `synced` and AI processing
 * is triggered for the newly synced emails.
 */
export const historicalSyncJob = inngest.createFunction(
  {
    id: "sync-historical-emails",
    triggers: [{ event: "email/sync.historical" }],
    concurrency: [{ key: "event.data.accountId", limit: 1 }],
  },
  async ({ event, step }) => {
    const { accountId, userId } = event.data as {
      accountId: string;
      userId: string;
    };

    // Step 1: Verify account exists
    const accountRecord = await step.run("fetch-account", async () => {
      return await db.account.findFirst({
        where: { id: accountId, userId },
      });
    });

    if (!accountRecord) {
      return { status: "account_not_found" };
    }

    // Step 2: Fetch ALL emails from Gmail
    let fetchResult: { emails: ReturnType<typeof JSON.parse>; historyId: string };

    try {
      fetchResult = await step.run("fetch-all-emails", async () => {
        const gmailAccount = new GmailAccount(accountId);
        const result = await gmailAccount.fetchEmails(); // No daysWithin → all history
        console.log(
          `[inngest:historical-sync] Fetched ${result.emails.length} total emails for account ${accountId}`,
        );
        return result;
      });
    } catch (error) {
      await step.run("mark-failed", async () => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await db.account.update({
          where: { id: accountId },
          data: { syncStatus: "failed", syncError: errorMessage },
        });
      });
      throw error;
    }

    // Step 3: Save to DB in batches to avoid memory pressure
    const totalEmails = fetchResult.emails.length;
    if (totalEmails > 0) {
      const totalBatches = Math.ceil(totalEmails / DB_BATCH_SIZE);

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const start = batchIdx * DB_BATCH_SIZE;
        const end = Math.min(start + DB_BATCH_SIZE, totalEmails);
        const batch = fetchResult.emails.slice(start, end);

        await step.run(`save-batch-${batchIdx + 1}`, async () => {
          await syncEmailsToDatabase(batch, accountId);
          console.log(
            `[inngest:historical-sync] Saved batch ${batchIdx + 1}/${totalBatches} (${batch.length} emails) for account ${accountId}`,
          );
        });
      }
    }

    // Step 4: Update historyId and mark as fully synced
    await step.run("mark-synced", async () => {
      await db.account.update({
        where: { id: accountId },
        data: {
          nextDeltaToken: fetchResult.historyId,
          syncStatus: "synced",
          syncError: null,
          lastSyncedAt: new Date(),
        },
      });
      console.log(
        `[inngest:historical-sync] Historical sync completed for account ${accountId}: ${totalEmails} emails synced`,
      );
    });

    // Step 5: Trigger AI processing for newly synced emails
    const threadIds = await step.run("get-unsummarized-threads", async () => {
      const threads = await db.thread.findMany({
        where: { accountId, summary: null },
        select: { id: true },
      });
      return threads.map((t) => t.id);
    });

    const emailIds = await step.run("get-unembedded-emails", async () => {
      const emails = await db.email.findMany({
        where: {
          thread: { accountId },
          embedding: null,
        },
        select: { id: true },
      });
      return emails.map((e) => e.id);
    });

    if (threadIds.length > 0 || emailIds.length > 0) {
      const events: Array<{ name: string; data: Record<string, unknown> }> = [];
      if (threadIds.length > 0) {
        events.push({ name: "email/ai.summarize", data: { accountId, threadIds } });
        events.push({ name: "email/ai.classify", data: { accountId, threadIds } });
      }
      if (emailIds.length > 0) {
        events.push({ name: "email/ai.embed", data: { accountId, emailIds } });
      }
      await step.sendEvent("trigger-ai-processing", events);
    }

    return { status: "completed", emailsSynced: totalEmails };
  },
);

// ─── AI Job: Thread Summarization ───────────────────────────────────────────

/**
 * Generates one-line AI summaries for threads using Gemini Flash Lite.
 * Processes threads sequentially with rate limiting to stay within the
 * Gemini free tier (30 RPM for Flash Lite).
 */
export const summarizeThreadsJob = inngest.createFunction(
  {
    id: "ai-summarize-threads",
    triggers: [{ event: "email/ai.summarize" }],
    concurrency: [{ key: "event.data.accountId", limit: 1 }],
  },
  async ({ event, step }) => {
    const { accountId, threadIds } = event.data as {
      accountId: string;
      threadIds: string[];
    };

    let summarized = 0;

    // Process in chunks to keep step sizes manageable
    const CHUNK_SIZE = 10;
    const totalChunks = Math.ceil(threadIds.length / CHUNK_SIZE);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const chunkThreadIds = threadIds.slice(
        chunkIdx * CHUNK_SIZE,
        (chunkIdx + 1) * CHUNK_SIZE
      );

      const chunkSummarized = await step.run(
        `summarize-chunk-${chunkIdx + 1}`,
        async () => {
          let count = 0;

          for (const threadId of chunkThreadIds) {
            try {
              // Fetch thread with its emails
              const thread = await db.thread.findUnique({
                where: { id: threadId },
                include: {
                  emails: {
                    orderBy: { sentAt: "desc" },
                    take: 3,
                    select: {
                      subject: true,
                      bodySnippet: true,
                      from: { select: { name: true, address: true } },
                    },
                  },
                },
              });

              if (!thread || thread.emails.length === 0) continue;

              // Build context from emails
              const context = thread.emails
                .map(
                  (e) =>
                    `From: ${e.from.name || e.from.address}\nSubject: ${e.subject}\n${e.bodySnippet || ""}`
                )
                .join("\n---\n");

              const { text } = await generateText({
                model: geminiFlashLite,
                prompt: `Summarize this email thread in exactly one sentence, maximum 15 words. Be specific about the topic, not generic. Do not use quotes.\n\nThread:\n${context}`,
              });

              const summary = text.trim().replace(/^["']|["']$/g, "");

              await db.thread.update({
                where: { id: threadId },
                data: { summary },
              });

              count++;
              console.log(
                `[ai:summarize] Summarized thread ${threadId}: "${summary}"`
              );

              // Rate limit: wait between API calls
              await sleep(AI_RATE_LIMIT_DELAY_MS);
            } catch (error) {
              console.error(
                `[ai:summarize] Failed to summarize thread ${threadId}:`,
                error
              );
              // Continue with next thread — don't fail the whole batch
            }
          }

          return count;
        }
      );

      summarized += chunkSummarized;
    }

    return { status: "completed", summarized, total: threadIds.length };
  }
);

// ─── AI Job: Email Classification ───────────────────────────────────────────

/**
 * Auto-classifies threads into categories using Gemini Flash Lite.
 * Categories: urgent, newsletter, client-request, internal, meeting,
 * notification, personal.
 */
export const classifyThreadsJob = inngest.createFunction(
  {
    id: "ai-classify-threads",
    triggers: [{ event: "email/ai.classify" }],
    concurrency: [{ key: "event.data.accountId", limit: 1 }],
  },
  async ({ event, step }) => {
    const { accountId, threadIds } = event.data as {
      accountId: string;
      threadIds: string[];
    };

    const VALID_LABELS = [
      "urgent",
      "newsletter",
      "client-request",
      "internal",
      "meeting",
      "notification",
      "personal",
    ];

    let classified = 0;
    const CHUNK_SIZE = 10;
    const totalChunks = Math.ceil(threadIds.length / CHUNK_SIZE);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const chunkThreadIds = threadIds.slice(
        chunkIdx * CHUNK_SIZE,
        (chunkIdx + 1) * CHUNK_SIZE
      );

      const chunkClassified = await step.run(
        `classify-chunk-${chunkIdx + 1}`,
        async () => {
          let count = 0;

          for (const threadId of chunkThreadIds) {
            try {
              const thread = await db.thread.findUnique({
                where: { id: threadId },
                include: {
                  emails: {
                    orderBy: { sentAt: "desc" },
                    take: 1,
                    select: {
                      subject: true,
                      bodySnippet: true,
                      from: { select: { name: true, address: true } },
                    },
                  },
                },
              });

              if (!thread || thread.emails.length === 0) continue;

              const email = thread.emails[0]!;

              const { text } = await generateText({
                model: geminiFlashLite,
                prompt: `Classify this email into one or more categories. Return ONLY a JSON array of strings.
Valid categories: ${VALID_LABELS.join(", ")}

From: ${email.from.name || email.from.address}
Subject: ${email.subject}
Body: ${email.bodySnippet || ""}

Return format: ["category1", "category2"]`,
              });

              // Parse the JSON response, with fallback
              let labels: string[] = [];
              try {
                const parsed = JSON.parse(
                  text.trim().replace(/```json\n?|```/g, "")
                );
                if (Array.isArray(parsed)) {
                  labels = parsed.filter((l: string) =>
                    VALID_LABELS.includes(l)
                  );
                }
              } catch {
                console.warn(
                  `[ai:classify] Could not parse labels for thread ${threadId}: ${text}`
                );
              }

              if (labels.length > 0) {
                await db.thread.update({
                  where: { id: threadId },
                  data: { aiLabels: labels },
                });
                count++;
                console.log(
                  `[ai:classify] Classified thread ${threadId}: [${labels.join(", ")}]`
                );
              }

              await sleep(AI_RATE_LIMIT_DELAY_MS);
            } catch (error) {
              console.error(
                `[ai:classify] Failed to classify thread ${threadId}:`,
                error
              );
            }
          }

          return count;
        }
      );

      classified += chunkClassified;
    }

    return { status: "completed", classified, total: threadIds.length };
  }
);

// ─── AI Job: Embedding Generation ───────────────────────────────────────────

/**
 * Generates vector embeddings for emails using Google text-embedding-004.
 * Embeddings are stored in pgvector for semantic search.
 * Processes emails with rate limiting to stay within free tier limits.
 */
export const generateEmbeddingsJob = inngest.createFunction(
  {
    id: "ai-generate-embeddings",
    triggers: [{ event: "email/ai.embed" }],
    concurrency: [{ key: "event.data.accountId", limit: 1 }],
  },
  async ({ event, step }) => {
    const { accountId, emailIds } = event.data as {
      accountId: string;
      emailIds: string[];
    };

    let embedded = 0;
    const CHUNK_SIZE = 20;
    const totalChunks = Math.ceil(emailIds.length / CHUNK_SIZE);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const chunkEmailIds = emailIds.slice(
        chunkIdx * CHUNK_SIZE,
        (chunkIdx + 1) * CHUNK_SIZE
      );

      const chunkEmbedded = await step.run(
        `embed-chunk-${chunkIdx + 1}`,
        async () => {
          let count = 0;

          for (const emailId of chunkEmailIds) {
            try {
              const email = await db.email.findUnique({
                where: { id: emailId },
                select: {
                  id: true,
                  subject: true,
                  bodySnippet: true,
                  thread: { select: { accountId: true } },
                },
              });

              if (!email) continue;

              // Combine subject + body snippet for embedding
              const textToEmbed = `${email.subject} ${email.bodySnippet || ""}`.trim();
              if (!textToEmbed) continue;

              const embedding = await generateEmbedding(textToEmbed);
              await storeEmbedding(emailId, accountId, textToEmbed, embedding);

              count++;

              // Lighter rate limiting for embeddings (higher RPM limit)
              await sleep(200);
            } catch (error) {
              console.error(
                `[ai:embed] Failed to embed email ${emailId}:`,
                error
              );
            }
          }

          return count;
        }
      );

      embedded += chunkEmbedded;
    }

    return { status: "completed", embedded, total: emailIds.length };
  }
);


