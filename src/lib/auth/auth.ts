import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db/prisma";
import { env, isGoogleAuthConfigured } from "@/lib/env/server";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

// Always trust local dev and the configured public app URL. Also trust the
// current Vercel deployment's own unique URL (VERCEL_URL, injected
// automatically by Vercel) so Preview deployments work even though
// NEXT_PUBLIC_APP_URL points at the stable production domain there.
const trustedOrigins = [
  "http://localhost:3000",
  env.NEXT_PUBLIC_APP_URL,
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
];

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Long-lived, ordinary consumer-app sessions: 30 days, refreshed on use.
  // Better Auth allows multiple concurrent sessions per user by default —
  // no per-device restriction is configured here on purpose.
  session: {
    expiresIn: 30 * ONE_DAY_IN_SECONDS,
    updateAge: ONE_DAY_IN_SECONDS,
  },

  socialProviders: isGoogleAuthConfigured
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : undefined,
});

export type Session = typeof auth.$Infer.Session;
