// Run via `pnpm db:backfill:part-usage` (sets NODE_OPTIONS=--conditions=react-server
// since cooking/service.ts starts with `import "server-only"`, same reasoning as
// scripts/seed.ts). One-time backfill for SLICE_9.md's correction pass — populates
// `CookingSessionPartUsage` rows for Cooking Sessions created before that durable
// Part-use log existed. Idempotent: safe to run more than once, and safe to run
// against a database that already has some backfilled/live-created rows.
//
// Deliberately NOT restricted to the local/CI database (unlike scripts/seed.ts or
// tests/e2e/seed-session.ts) — this is meant to be run once against whatever real
// database (including production) still has pre-Slice-9-correction sessions. Point
// DATABASE_URL/DIRECT_URL/DATABASE_DRIVER at the intended target before running.
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

async function main() {
  const { backfillCookingSessionPartUsage } =
    await import("@/lib/cooking/service");
  const { scanned, created } = await backfillCookingSessionPartUsage();
  console.log(
    `[backfill-cooking-session-part-usage] scanned ${scanned} pre-existing PART unit(s) with no usage log rows, created ${created} CookingSessionPartUsage row(s).`,
  );
}

main()
  .catch((error) => {
    console.error("[backfill-cooking-session-part-usage] FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
