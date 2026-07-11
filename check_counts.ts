import { config } from "dotenv";
config();

async function main() {
  const { db } = await import("./src/server/db");
  const account = await db.account.findFirst({
    where: { emailAddress: 'ichandratripathi@gmail.com' },
    orderBy: { lastSyncedAt: 'desc' }
  });
  if (!account) {
    console.log("Account not found");
    return;
  }
  
  const threads = await db.thread.count({ where: { accountId: account.id } });
  const emails = await db.email.count({ where: { thread: { accountId: account.id } } });
  
  console.log(`Account ${account.id} has ${threads} threads and ${emails} emails.`);
  console.log(`Sync status: ${account.syncStatus}, Error: ${account.syncError}`);
}

main().catch(console.error);
