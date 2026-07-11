import { google } from "googleapis";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { env } from "@/env";

// ─── Error Classes ────────────────────────────────────────────────────────────

/** Thrown when a Gmail API operation fails due to missing or invalid tokens. */
export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

/** Thrown when the token refresh flow fails irrecoverably. */
export class TokenRefreshError extends Error {
  constructor(
    message: string,
    public readonly accountId: string,
  ) {
    super(message);
    this.name = "TokenRefreshError";
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Gmail OAuth2 scopes required by the application. */
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

/** Buffer (in ms) before token expiry at which we proactively refresh. */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

// ─── OAuth2 Client ────────────────────────────────────────────────────────────

/**
 * Creates a pre-configured Google OAuth2 client.
 *
 * @returns A `google.auth.OAuth2` instance configured with the app's
 *          client ID, client secret, and redirect URI.
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.NEXT_PUBLIC_URL}/api/google/callback`,
  );
}

// ─── Auth URL Generation (Server Action) ──────────────────────────────────────

/**
 * Generates the Google OAuth2 consent URL.
 *
 * This is a Next.js server action — it can be called directly from client
 * components. It verifies that the user is authenticated via Clerk before
 * generating the URL.
 *
 * @returns The fully-qualified Google consent URL the user should be
 *          redirected to.
 * @throws {GmailAuthError} If the user is not authenticated.
 */
export async function getGoogleAuthUrl(): Promise<string> {
  "use server";

  const { userId } = await auth();
  if (!userId) {
    throw new GmailAuthError(
      "You must be signed in to link a Google account.",
    );
  }

  const oauth2Client = createOAuth2Client();

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GMAIL_SCOPES],
  });

  return url;
}

// ─── Token Exchange ───────────────────────────────────────────────────────────

/** The shape returned after exchanging an authorization code for tokens. */
export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

/**
 * Exchanges a one-time authorization code for OAuth2 tokens.
 *
 * @param code - The authorization code received from Google's consent redirect.
 * @returns An object containing the access token, refresh token, and expiry date.
 * @throws {GmailAuthError} If the token exchange fails or returns no access token.
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<ExchangedTokens> {
  const oauth2Client = createOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new GmailAuthError(
      "Google token exchange did not return an access token.",
    );
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000); // default 1h if missing

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt,
  };
}

// ─── User Profile ─────────────────────────────────────────────────────────────

/** The shape of a Google user's basic profile info. */
export interface GoogleUserProfile {
  email: string;
  name: string;
}

/**
 * Fetches the authenticated user's basic Google profile.
 *
 * @param accessToken - A valid Google OAuth2 access token.
 * @returns The user's email and display name.
 * @throws {GmailAuthError} If the profile request fails or returns no email.
 */
export async function getGoogleUserProfile(
  accessToken: string,
): Promise<GoogleUserProfile> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  if (!data.email) {
    throw new GmailAuthError(
      "Google profile did not include an email address.",
    );
  }

  return {
    email: data.email,
    name: data.name ?? data.email.split("@")[0] ?? data.email,
  };
}

// ─── Authenticated Gmail Client ───────────────────────────────────────────────

/**
 * Returns an authenticated Gmail API client for the given account.
 *
 * If the stored access token is within 5 minutes of expiry, it will be
 * refreshed automatically using the stored refresh token. The new credentials
 * are persisted back to the database.
 *
 * The DB update uses an optimistic-concurrency pattern: only the row matching
 * both `id` and the old `accessToken` is updated, so concurrent callers
 * won't clobber each other.
 *
 * @param accountId - The database ID of the linked Account.
 * @returns A Gmail API client (`gmail_v1.Gmail`) ready for use.
 * @throws {GmailAuthError} If the account is not found.
 * @throws {TokenRefreshError} If the token is expired and cannot be refreshed
 *         (e.g. no refresh token stored). The user must re-link their account.
 */
export async function getAuthedGmailClient(accountId: string) {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });

  if (!account) {
    throw new GmailAuthError(`Account not found: ${accountId}`);
  }

  const oauth2Client = createOAuth2Client();

  // Determine whether a refresh is needed
  const now = Date.now();
  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
  const needsRefresh = expiresAt - now < TOKEN_REFRESH_BUFFER_MS;

  if (needsRefresh) {
    if (!account.refreshToken) {
      throw new TokenRefreshError(
        "Access token expired and no refresh token is available. " +
          "Please re-link your Google account.",
        accountId,
      );
    }

    oauth2Client.setCredentials({ refresh_token: account.refreshToken });

    let refreshedTokens;
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      refreshedTokens = credentials;
    } catch (err) {
      console.error(
        `[gmail-client] Failed to refresh token for account ${accountId}:`,
        err,
      );
      throw new TokenRefreshError(
        "Failed to refresh Google access token. Please re-link your Google account.",
        accountId,
      );
    }

    if (!refreshedTokens.access_token) {
      throw new TokenRefreshError(
        "Token refresh did not return a new access token. " +
          "Please re-link your Google account.",
        accountId,
      );
    }

    const newExpiresAt = refreshedTokens.expiry_date
      ? new Date(refreshedTokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    // Optimistic-concurrency update: only update if the token hasn't been
    // changed by another concurrent request.
    await db.account.updateMany({
      where: {
        id: accountId,
        accessToken: account.accessToken,
      },
      data: {
        accessToken: refreshedTokens.access_token,
        tokenExpiresAt: newExpiresAt,
        // Persist the new refresh token if Google rotated it
        ...(refreshedTokens.refresh_token
          ? { refreshToken: refreshedTokens.refresh_token }
          : {}),
      },
    });

    oauth2Client.setCredentials({
      access_token: refreshedTokens.access_token,
      refresh_token:
        refreshedTokens.refresh_token ?? account.refreshToken,
      expiry_date: refreshedTokens.expiry_date ?? newExpiresAt.getTime(),
    });

    console.log(
      `[gmail-client] Refreshed access token for account ${accountId}`,
    );
  } else {
    // Token is still valid — use it directly
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken ?? undefined,
      expiry_date: expiresAt,
    });
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}
