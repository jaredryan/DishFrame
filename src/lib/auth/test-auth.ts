import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { testUtils } from "better-auth/plugins";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env/server";

/**
 * Test-only Better Auth instance — used exclusively by Playwright specs
 * (tests/e2e/**) to mint a valid session/cookie for a throwaway user
 * without driving the real Google OAuth flow. Never imported by
 * application code. Mirrors src/lib/auth/auth.ts's config and shares its
 * `prisma` connection, plus Better Auth's own `testUtils` plugin — per that
 * plugin's own guidance, kept as a separate instance rather than added to
 * the production auth config, so `ctx.test` stays correctly typed and its
 * routes/hooks never run in a real deployment.
 *
 * Named `test-auth.ts`, not `auth.test.ts` — the latter would collide with
 * vitest's `src/**\/*.test.ts` glob and be picked up as an (empty) unit
 * test file.
 */
export const testAuth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [testUtils()],
});
