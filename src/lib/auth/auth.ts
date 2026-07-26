import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db/prisma";
import { env, isGoogleAuthConfigured } from "@/lib/env/server";
import { initializeNewUser } from "@/lib/account/init";

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

  // Idempotent account setup (BUILD_PLAN.md Slice 2): seeds UserPreference,
  // the protected Favorite tag, default Grocery Categories, starter Flavor
  // profiles, and the built-in owner Taster "You" right after Better Auth
  // creates the user row. Safe to re-run — see src/lib/account/init.ts.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await initializeNewUser(user.id);
        },
      },
    },
  },

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
