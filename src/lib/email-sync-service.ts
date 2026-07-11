import { inngest } from "@/inngest/client"
import { Account } from "./account-class-perform-sync"
import { syncEmailsToDatabase } from "./sync-to-db"
import { db } from "@/server/db"

/**
 * Runs the initial email sync for an account.
 * This is the single entry point for all sync triggers (OAuth callback, manual re-sync, etc.).
 * 
 * Lifecycle: pending → syncing → syncing_historical → synced | failed
 */
export async function runInitialSync(accountId: string, userId: string) {
  const dbAccount = await db.account.findFirst({
    where: { id: accountId, userId },
  })

  if (!dbAccount) {
    throw new Error(`Account not found: ${accountId}`)
  }

  // Mark sync as in progress
  await db.account.update({
    where: { id: accountId },
    data: { syncStatus: "syncing", syncError: null },
  })

  try {
    const account = new Account(dbAccount.accessToken)

    // Step 1: Start sync and wait for Aurinko to be ready (with retries)
    let syncResponse = await startSyncWithRetry(account, 7)

    let storedDeltaToken: string = syncResponse.syncUpdatedToken

    // Step 2: Fetch emails page by page and save each page immediately
    let totalEmailsSynced = 0
    let updatedResponse = await account.getUpdatedEmails({ deltaToken: storedDeltaToken })

    if (updatedResponse.nextDeltaToken) {
      storedDeltaToken = updatedResponse.nextDeltaToken
    }

    // Save first page
    if (updatedResponse.records.length > 0) {
      await syncEmailsToDatabase(updatedResponse.records, accountId)
      totalEmailsSynced += updatedResponse.records.length
      console.log(`Synced page: ${updatedResponse.records.length} emails (total: ${totalEmailsSynced})`)
    }

    // Fetch remaining pages
    while (updatedResponse.nextPageToken) {
      updatedResponse = await account.getUpdatedEmails({ pageToken: updatedResponse.nextPageToken })

      if (updatedResponse.records.length > 0) {
        await syncEmailsToDatabase(updatedResponse.records, accountId)
        totalEmailsSynced += updatedResponse.records.length
        console.log(`Synced page: ${updatedResponse.records.length} emails (total: ${totalEmailsSynced})`)
      }

      if (updatedResponse.nextDeltaToken) {
        storedDeltaToken = updatedResponse.nextDeltaToken
      }
    }

    // Mark fast sync completed, queue historical
    await db.account.update({
      where: { id: accountId },
      data: {
        nextDeltaToken: storedDeltaToken,
        syncStatus: "syncing_historical",
        syncError: null,
        lastSyncedAt: new Date(),
      },
    })

    // Enqueue background job for full historical sync
    await inngest.send({
      name: "email/sync.historical",
      data: { accountId, userId }
    })

    console.log(`Fast sync completed for account ${accountId}: ${totalEmailsSynced} emails synced. Historical sync queued.`)
  } catch (error) {
    // Record failure in DB so the UI can show it
    const errorMessage = error instanceof Error ? error.message : String(error)
    await db.account.update({
      where: { id: accountId },
      data: {
        syncStatus: "failed",
        syncError: errorMessage,
      },
    }).catch((updateErr) => {
      // Don't let a DB update failure mask the original sync error
      console.error("Failed to record sync failure in DB:", updateErr)
    })

    throw error
  }
}

/**
 * Starts the Aurinko sync with retries for 408 timeouts.
 * Aurinko sometimes returns 408 while it's still preparing the sync on their end.
 */
async function startSyncWithRetry(account: Account, daysWithin: number, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let syncResponse = await account.startSync(daysWithin)
      while (!syncResponse.ready) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        syncResponse = await account.startSync(daysWithin)
      }
      return syncResponse
    } catch (error: any) {
      const is408 = error?.response?.status === 408 || error?.message?.includes('408')
      if (is408 && attempt < maxRetries) {
        console.log(`Aurinko sync attempt ${attempt}/${maxRetries} timed out (408). Retrying in ${attempt * 3}s...`)
        await new Promise(resolve => setTimeout(resolve, attempt * 3000))
        continue
      }
      throw error
    }
  }
  throw new Error("startSyncWithRetry exhausted all retries")
}
