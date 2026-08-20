import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import LinkAccountButton from "./_components/link-account-button";

export default async function Home() {
  const { userId } = await auth();

  // If the user is signed in, check if they have a linked Google account
  if (userId) {
    const account = await db.account.findFirst({
      where: { userId },
      select: { id: true },
    });

    // If they already have an account linked, send them straight to /mail
    if (account) {
      redirect("/mail");
    }
  }

  return <LinkAccountButton />;
}
