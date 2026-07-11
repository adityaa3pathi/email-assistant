import { exchangeCodeForTokens, getGoogleUserProfile } from "@/lib/gmail-client";
import { inngest } from "@/inngest/client";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * GET /api/google/callback
 *
 * Handles the OAuth2 redirect from Google after user consent.
 *
 * Flow:
 * 1. Validates that the user is authenticated (Clerk).
 * 2. Exchanges the authorization `code` for access & refresh tokens.
 * 3. Fetches the user's Google profile (email + name).
 * 4. Upserts the Account record in the database.
 * 5. Triggers an Inngest background job for the initial email sync.
 * 6. Redirects the user to `/mail`.
 */
export const GET = async (req: NextRequest) => {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { message: "Unauthorized — you must be signed in." },
      { status: 401 },
    );
  }

  // ── Extract code from query params ──────────────────────────────────────
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { message: "Missing authorization code from Google." },
      { status: 400 },
    );
  }

  // ── Exchange code for tokens ────────────────────────────────────────────
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    console.error("[google/callback] Token exchange failed:", err);
    return NextResponse.json(
      { message: "Failed to exchange authorization code for tokens." },
      { status: 500 },
    );
  }

  // ── Fetch user profile ──────────────────────────────────────────────────
  let profile;
  try {
    profile = await getGoogleUserProfile(tokens.accessToken);
  } catch (err) {
    console.error("[google/callback] Profile fetch failed:", err);
    return NextResponse.json(
      { message: "Failed to retrieve Google profile." },
      { status: 500 },
    );
  }

  // ── Upsert account in DB ───────────────────────────────────────────────
  const existingAccount = await db.account.findFirst({
    where: {
      userId,
      emailAddress: profile.email,
    },
  });

  let accountId: string;

  if (existingAccount) {
    // Update the existing account with fresh tokens
    await db.account.update({
      where: { id: existingAccount.id },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? existingAccount.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        name: profile.name,
      },
    });
    accountId = existingAccount.id;
    console.log(
      `[google/callback] Updated existing account ${accountId} for ${profile.email}`,
    );
  } else {
    // Create a new account
    accountId = crypto.randomUUID();
    await db.account.create({
      data: {
        id: accountId,
        userId,
        emailAddress: profile.email,
        name: profile.name,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        syncStatus: "pending",
      },
    });
    console.log(
      `[google/callback] Created new account ${accountId} for ${profile.email}`,
    );
  }

  // ── Trigger initial sync ───────────────────────────────────────────────
  await inngest.send({
    name: "email/sync.initial",
    data: { accountId, userId },
  });

  return NextResponse.redirect(new URL("/mail", req.url));
};
