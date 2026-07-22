import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db/prisma";
import { env, isGoogleAuthConfigured } from "@/lib/env/server";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],

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
