"use server";

/**
 * Server actions for the email assistant UI.
 *
 * All Google OAuth functionality lives in `./gmail-client.ts`. This module
 * re-exports the server action(s) that client components need so they can
 * continue importing from `@/lib/actions`.
 */
export { getGoogleAuthUrl } from "./gmail-client";
