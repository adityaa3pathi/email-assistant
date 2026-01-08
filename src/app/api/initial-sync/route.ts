import { Account } from "@/lib/account-class";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {


  try {
    const { accountId, userId } = await req.json();

    if (!accountId || !userId) {
      return NextResponse.json(
        { message: "Missing account id or user id" },
        { status: 400 }
      );
    }

    const dbAccount = await db.account.findUnique({
      where: { id: accountId, userId },
    });

    if (!dbAccount) {
      return NextResponse.json(
        { message: "Account not found" },
        { status: 400 }
      );
    }

    const account = new Account(dbAccount.accessToken);
    const response = await account.performInitialSync();

    if (!response) {
      return NextResponse.json(
        { error: "failed to perform initial sync" },
        { status: 500 }
      );
    }

    const { emails, deltaToken } = response;

    await db.account.update({
      where: { id: accountId },
      data: { nextDeltaToken: deltaToken },
    });

    console.log("synced emails:", emails);

    await syncEmailsToDatabase(emails, accountId)

    console.log('Sync Completed', deltaToken)

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Initial sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
