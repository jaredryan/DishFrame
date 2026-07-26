// Run via `tsx`, never via Playwright's own test transform (see
// preferences-tasters-grocery.spec.ts for why) — this script's job is
// purely to shell out from a Playwright spec to a process that correctly
// handles the generated Prisma client's ESM output and the "@/" path
// alias, both of which Playwright's bundler chokes on today.
import { testAuth } from "@/lib/auth/test-auth";
import { prisma } from "@/lib/db/prisma";
import { initializeNewUser } from "@/lib/account/init";
import { env } from "@/lib/env/server";

// Refuses to run against anything but the disposable local/CI Postgres this
// spec is meant for. DATABASE_DRIVER defaults to "neon" (see
// src/lib/env/server.ts) specifically so a developer who runs
// `pnpm test:e2e` without first exporting the local-Postgres env vars gets
// a loud, immediate failure here — never a silent write to the real Neon
// database this test creates and deletes user rows against.
if (env.DATABASE_DRIVER !== "pg") {
  console.error(
    "[seed-session] Refusing to run: DATABASE_DRIVER is not 'pg'. " +
      "This script creates and deletes real rows and must only run against " +
      "a disposable local/CI Postgres (see docker-compose.yml), never Neon. " +
      "Export DATABASE_URL/DIRECT_URL/DATABASE_DRIVER=pg before running this spec.",
  );
  process.exit(1);
}

async function login() {
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

  const cookies = await helpers.getCookies({ userId: saved.id });
  process.stdout.write(JSON.stringify({ userId: saved.id, cookies }));
}

async function cleanup(userId: string) {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

const [, , command, arg] = process.argv;

const run =
  command === "login"
    ? login()
    : command === "cleanup" && arg
      ? cleanup(arg)
      : Promise.reject(
          new Error(`Usage: seed-session.ts login|cleanup <userId>`),
        );

run
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
