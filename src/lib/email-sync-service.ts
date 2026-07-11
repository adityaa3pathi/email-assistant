import { inngest } from "@/inngest/client";
import { GmailAccount } from "./gmail-account";
import { syncEmailsToDatabase } from "./sync-to-db";
import { db } from "@/server/db";

/**
 * Runs the initial email sync for an account (last 7 days).
 *
 * This is the single entry point for all sync triggers (OAuth callback,
 * manual re-sync, etc.). It fetches recent emails directly from the Gmail API,
 * saves them to the database, and then queues a background job for full
 * historical backfill.
 *
 * Lifecycle: pending → syncing → syncing_historical → synced | failed
 *
 * @param accountId - The database ID of the Account to sync.
 * @param userId    - The Clerk user ID that owns the account.
 * @throws If the account is not found or the sync fails irrecoverably.
 */
export async function runInitialSync(accountId: string, userId: string) {
  // 1. Fetch account from DB
  const dbAccount = await db.account.findFirst({
    where: { id: accountId, userId },
  });

  if (!dbAccount) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // 2. Mark sync as in progress
  await db.account.update({
    where: { id: accountId },
    data: { syncStatus: "syncing", syncError: null },
  });

  try {
    // 3. Create Gmail sync engine and fetch last 7 days
    const gmailAccount = new GmailAccount(accountId);
    const { emails, historyId } = await gmailAccount.fetchEmails(7);

    console.log(
      `[email-sync] Fetched ${emails.length} emails for account ${accountId} (last 7 days)`,
    );

    // 4. Save emails to DB
    if (emails.length > 0) {
      await syncEmailsToDatabase(emails, accountId);
    }

    // 5. Store historyId and transition to historical sync phase
    await db.account.update({
      where: { id: accountId },
      data: {
        nextDeltaToken: historyId,
        syncStatus: "syncing_historical",
        syncError: null,
        lastSyncedAt: new Date(),
      },
    });

    // 6. Queue historical backfill in the background
    await inngest.send({
      name: "email/sync.historical",
      data: { accountId, userId },
    });

    console.log(
      `[email-sync] Initial sync completed for account ${accountId}: ${emails.length} emails synced. Historical sync queued.`,
    );
  } catch (error) {
    // Record failure so the UI can display it
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await db.account
      .update({
        where: { id: accountId },
        data: {
          syncStatus: "failed",
          syncError: errorMessage,
        },
      })
      .catch((updateErr) => {
        // Don't let a DB update failure mask the original sync error
        console.error(
          "[email-sync] Failed to record sync failure in DB:",
          updateErr,
        );
      });

    throw error;
  }
}
