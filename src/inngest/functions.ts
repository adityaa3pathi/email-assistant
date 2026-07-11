import { inngest } from "./client";
import { db } from "@/server/db";
import { GmailAccount } from "@/lib/gmail-account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";

// ─── Batch size for processing large email sets ─────────────────────────────

/** Number of emails to save to the DB in a single batch. */
const DB_BATCH_SIZE = 50;

// ─── Phase 1: Initial Sync (Last 7 Days) ────────────────────────────────────

/**
 * Fast initial sync job — fetches the last 7 days of emails from Gmail.
 *
 * Triggered immediately after OAuth callback so the user sees emails quickly.
 * After completion, it queues the historical backfill job.
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

    // Step 6: Queue historical backfill
    await step.sendEvent("trigger-historical", {
      name: "email/sync.historical",
      data: { accountId, userId },
    });

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
 * On completion, the account is marked as fully `synced`.
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

    return { status: "completed", emailsSynced: totalEmails };
  },
);
