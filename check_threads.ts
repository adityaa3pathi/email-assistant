import { config } from "dotenv"
config()
import { db } from "./src/server/db"

async function main() {
  const threads = await db.thread.findMany({
    take: 5
  })
  console.log(threads)
}

main().catch(console.error)
