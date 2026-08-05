// Run via `tsx`, never via Playwright's own test transform (see
// preferences-tasters-grocery.spec.ts for why) — this script's job is
// purely to shell out from a Playwright spec to a process that correctly
// handles the generated Prisma client's ESM output and the "@/" path
// alias, both of which Playwright's bundler chokes on today.
import { existsSync } from "node:fs";

// This process doesn't inherit `next dev`'s .env.local loading — load it
// here (same trick as prisma.config.ts/vitest.config.mts) so
// src/lib/env/server.ts's required vars (BETTER_AUTH_SECRET, etc.) are
// present. Never overrides a var already set by the parent process's env.
// Must run before anything below is imported: static ES module imports are
// hoisted and evaluated before this file's own top-level code, so
// "@/lib/env/server" (and everything that transitively imports it) is
// loaded dynamically, after this, rather than statically at the top.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

async function main() {
  const { testAuth } = await import("@/lib/auth/test-auth");
  const { prisma } = await import("@/lib/db/prisma");
  const { initializeNewUser } = await import("@/lib/account/init");
  const { env } = await import("@/lib/env/server");

  // Refuses to run against anything but the disposable local/CI Postgres
  // this spec is meant for. DATABASE_DRIVER defaults to "neon" (see
  // src/lib/env/server.ts) specifically so a developer who runs
  // `pnpm test:e2e` without first exporting the local-Postgres env vars
  // gets a loud, immediate failure here — never a silent write to the real
  // Neon database this test creates and deletes user rows against.
  if (env.DATABASE_DRIVER !== "pg") {
    console.error(
      "[seed-session] Refusing to run: DATABASE_DRIVER is not 'pg'. " +
        "This script creates and deletes real rows and must only run against " +
        "a disposable local/CI Postgres (see docker-compose.yml), never Neon. " +
        "Export DATABASE_URL/DIRECT_URL/DATABASE_DRIVER=pg before running this spec.",
    );
    process.exit(1);
  }

  async function login(withIntro: boolean) {
    const ctx = await testAuth.$context;
    const helpers = ctx.test;

    const user = helpers.createUser({
      name: "E2E Test User",
      email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
    });
    const saved = await helpers.saveUser(user);

    // Mirrors the production `user.create.after` databaseHook
    // (src/lib/auth/auth.ts) — testUtils' saveUser writes through the
    // adapter directly and does not trigger it, so account seeding is
    // invoked explicitly here, exactly as a real Google sign-in would.
    await initializeNewUser(saved.id);

    // BUILD_PLAN.md Slice 20: a genuinely brand-new account sees the
    // skippable welcome introduction (InitialIntro, PRODUCT_SPEC.md
    // §92.2) on its first (app) page view. That's correct product
    // behavior, but every e2e spec besides onboarding.spec.ts seeds a
    // "fresh" account purely as a login mechanism for an unrelated golden
    // path — the modal would otherwise block those specs' first
    // interactions (its overlay intercepts pointer events). Pre-marking
    // the "intro" guide completed here is what keeps this seed script's
    // default behavior "an ordinary already-onboarded test user."
    // onboarding.spec.ts itself passes `login with-intro` to opt out of
    // this and see the real first-run state.
    if (!withIntro) {
      await prisma.userPreference.update({
        where: { userId: saved.id },
        data: { onboardingState: { intro: "completed" } },
      });
    }

    const cookies = await helpers.getCookies({ userId: saved.id });
    process.stdout.write(JSON.stringify({ userId: saved.id, cookies }));
  }

  async function cleanup(userId: string) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }

  const [, , command, arg] = process.argv;

  const run =
    command === "login"
      ? login(arg === "with-intro")
      : command === "cleanup" && arg
        ? cleanup(arg)
        : Promise.reject(
            new Error(
              `Usage: seed-session.ts login [with-intro]|cleanup <userId>`,
            ),
          );

  await run;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
