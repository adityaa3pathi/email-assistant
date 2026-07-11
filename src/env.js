import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    AURINKO_CLIENT_ID: z.string().min(1),
    AURINKO_CLIENT_SECRET: z.string().min(1),
    AURINKO_SIGNING_SECRET: z.string().min(1).optional(),
    AURINKO_SERVICE_TYPE: z.enum(["Google", "Office365", "IMAP"]).default("Google"),
    AURINKO_AUTH_PROVIDER: z.string().optional(),
    AURINKO_SCOPES: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_URL: z.string().url(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AURINKO_CLIENT_ID: process.env.AURINKO_CLIENT_ID,
    AURINKO_CLIENT_SECRET: process.env.AURINKO_CLIENT_SECRET,
    AURINKO_SIGNING_SECRET: process.env.AURINKO_SIGNING_SECRET,
    AURINKO_SERVICE_TYPE: process.env.AURINKO_SERVICE_TYPE,
    AURINKO_AUTH_PROVIDER: process.env.AURINKO_AUTH_PROVIDER,
    AURINKO_SCOPES: process.env.AURINKO_SCOPES,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
