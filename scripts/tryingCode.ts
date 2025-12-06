import "dotenv/config";
import { PrismaClient } from "@prisma/client"
import { db } from "@/server/db";

async function main() {
  console.log("Running isolated script...");

  const user = await db.user.create({
    data: {
      emailAddress: "test@gmail.com",
      firstName: "aditya",
      lastName: "trippy",
    },
  });

  console.log("Created user:", user);
}

main()
  .catch((err) => console.error(err))
  .finally(async () => {
    await db.$disconnect();
  });
