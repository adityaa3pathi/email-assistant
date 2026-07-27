"use server";

import { getGoogleAuthUrl as _getGoogleAuthUrl } from "./gmail-client";

/**
 * Server action wrapper for Google OAuth URL generation.
 * Client components import this from `@/lib/actions`.
 */
export async function getGoogleAuthUrl(): Promise<string> {
  return _getGoogleAuthUrl();
}
