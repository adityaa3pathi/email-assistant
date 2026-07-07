import { runInitialSync } from "@/lib/email-sync-service";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // Authenticate via Clerk instead of trusting userId from request body
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { accountId } = await req.json();

    if (!accountId) {
      return NextResponse.json(
        { message: "Missing accountId" },
        { status: 400 }
      );
    }

    await runInitialSync(accountId, userId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Initial sync error:", error);
    return NextResponse.json(
      { error: "Initial sync failed" },
      { status: 500 }
    );
  }
}
