import { config } from "dotenv"
config()
import { db } from "./src/server/db"

async function main() {
  const threads = await db.thread.findMany({
    take: 5,
    include: {
      emails: true
    }
  })
  console.log(threads.map(t => ({ id: t.id, emailsCount: t.emails.length })))
}

main().catch(console.error)
