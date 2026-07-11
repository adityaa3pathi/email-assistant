import { inngest } from "./client";
import { db } from "@/server/db";
import { Account } from "@/lib/account-class-perform-sync";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";

/**
 * Phase 1: Fast initial sync (last 7 days).
 * Triggered immediately from the OAuth callback so the user is redirected instantly.
 */
export const initialSyncJob = inngest.createFunction(
  {
    id: "sync-initial-emails",
    triggers: [{ event: "email/sync.initial" }],
    concurrency: [{ key: "event.data.accountId", limit: 1 }], // Prevent duplicate syncs
  },
  async ({ event, step }) => {
    const { accountId, userId } = event.data as {
      accountId: string;
      userId: string;
    };

    const accountRecord = await step.run("fetch-account", async () => {
      return await db.account.findFirst({
        where: { id: accountId, userId },
      });
    });

    if (!accountRecord) {
      return { status: "account_not_found" };
    }

    // Mark sync as in progress
    await step.run("mark-syncing", async () => {
      await db.account.update({
        where: { id: accountId },
        data: { syncStatus: "syncing", syncError: null },
      });
    });

    const account = new Account(accountRecord.accessToken);

    // Step 1: Start sync with retries for 408 timeouts
    const syncToken = await step.run("start-sync", async () => {
      let syncResponse = await account.startSync(7);
      let retries = 0;
      while (!syncResponse.ready) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        syncResponse = await account.startSync(7);
        retries++;
        if (retries > 30) throw new Error("Sync readiness timeout");
      }
      return syncResponse.syncUpdatedToken;
    });

    // Step 2: Fetch first page
    let updatedResponse = await step.run("fetch-page-1", async () => {
      return await account.getUpdatedEmails({ deltaToken: syncToken });
    });

    let storedDeltaToken = updatedResponse.nextDeltaToken ?? syncToken;
    let totalSynced = 0;

    // Step 3: Save first page
    if (updatedResponse.records.length > 0) {
      await step.run("save-page-1", async () => {
        await syncEmailsToDatabase(updatedResponse.records, accountId);
      });
      totalSynced += updatedResponse.records.length;
    }

    // Step 4: Fetch remaining pages
    let pageNum = 2;
    while (updatedResponse.nextPageToken) {
      const nextPageToken = updatedResponse.nextPageToken;
      updatedResponse = await step.run(`fetch-page-${pageNum}`, async () => {
        return await account.getUpdatedEmails({ pageToken: nextPageToken });
      });

      if (updatedResponse.records.length > 0) {
        await step.run(`save-page-${pageNum}`, async () => {
          await syncEmailsToDatabase(updatedResponse.records, accountId);
        });
        totalSynced += updatedResponse.records.length;
      }

      if (updatedResponse.nextDeltaToken) {
        storedDeltaToken = updatedResponse.nextDeltaToken;
      }
      pageNum++;
    }

    // Step 5: Mark fast sync done, queue historical
    await step.run("mark-syncing-historical", async () => {
      await db.account.update({
        where: { id: accountId },
        data: {
          nextDeltaToken: storedDeltaToken,
          syncStatus: "syncing_historical",
          syncError: null,
          lastSyncedAt: new Date(),
        },
      });
    });

    // Step 6: Trigger historical backfill
    await step.sendEvent("trigger-historical", {
      name: "email/sync.historical",
      data: { accountId, userId },
    });

    return { status: "fast_sync_completed", emailsSynced: totalSynced };
  }
);

/**
 * Phase 2: Historical backfill (all remaining emails).
 * Fetches one page at a time and self-chains to avoid timeouts.
 */
export const syncEmailsJob = inngest.createFunction(
  { 
    id: "sync-historical-emails",
    triggers: [{ event: "email/sync.historical" }]
  },
  async ({ event, step }) => {
    const { accountId, userId, deltaToken, pageToken } = event.data as {
      accountId: string;
      userId: string;
      deltaToken?: string;
      pageToken?: string;
    };

    const accountRecord = await db.account.findUnique({
      where: { id: accountId, userId },
    });

    if (!accountRecord) {
      return { status: "account_not_found" };
    }

    const account = new Account(accountRecord.accessToken);

    let currentDeltaToken = deltaToken;
    let currentPageToken = pageToken;

    // Step 1: If no tokens provided, start the full historical sync
    if (!currentDeltaToken && !currentPageToken) {
      const startResponse = await step.run("start-sync", async () => {
        let syncResponse = await account.startSync(); // No daysWithin fetches full history
        while (!syncResponse.ready) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          syncResponse = await account.startSync();
        }
        return syncResponse;
      });
      currentDeltaToken = startResponse.syncUpdatedToken;
    }

    // Step 2: Fetch one page of emails
    const updatedResponse = await step.run("fetch-emails", async () => {
      return await account.getUpdatedEmails({
        deltaToken: currentDeltaToken,
        pageToken: currentPageToken,
      });
    });

    // Step 3: Save fetched emails to database
    await step.run("save-to-db", async () => {
      if (updatedResponse.records.length > 0) {
        await syncEmailsToDatabase(updatedResponse.records, accountId);
      }
    });

    // Step 4: Pagination - trigger next page if needed
    if (updatedResponse.nextPageToken) {
      await step.sendEvent("trigger-next-page", {
        name: "email/sync.historical",
        data: {
          accountId,
          userId,
          deltaToken: currentDeltaToken,
          pageToken: updatedResponse.nextPageToken,
        },
      });
      return { status: "paginating", nextPageToken: updatedResponse.nextPageToken };
    }

    // Completed all pages
    await step.run("mark-synced", async () => {
      await db.account.update({
        where: { id: accountId },
        data: { syncStatus: "synced", lastSyncedAt: new Date() },
      });
    });

    return { status: "completed" };
  }
);
