import { config } from "dotenv";
config();

async function main() {
  const { db } = await import("./src/server/db");
  
  // Delete the 3 empty duplicate accounts for ichandratripathi
  const emptyAccounts = ['216828', '216829', '216830'];
  for (const id of emptyAccounts) {
    await db.account.delete({ where: { id } }).catch(() => {});
    console.log(`Deleted empty account ${id}`);
  }
  
  console.log("\nRemaining accounts:");
  const accounts = await db.account.findMany({
    select: { id: true, emailAddress: true, syncStatus: true }
  });
  console.log(JSON.stringify(accounts, null, 2));
}

main().catch(console.error);
