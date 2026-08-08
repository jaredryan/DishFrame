#!/usr/bin/env node
// Guarded, rare-use entry point for applying `pnpm db:deploy:upgrade`
// (prisma migrate deploy, then the Part-usage backfill) against the
// PRODUCTION Neon database. See scripts/lib/production-env.mjs for the
// credential-loading/validation logic shared with dev-production-db.mjs.
//
// No CONFIRM_PRODUCTION_DATABASE=yes gate here (unlike
// dev-production-db.mjs, which does require it) — see README.md's
// "Production deployment" section for why: this only ever runs
// `prisma migrate deploy` plus an idempotent, additive backfill, never a
// destructive operation, and the credentials file below still has to
// exist and explicitly target Neon before anything runs.
//
// Deliberately narrow: this only ever invokes db:deploy:upgrade against
// production. It must never grow into a general production script runner.

import { spawn } from "node:child_process";
import { loadProductionEnvOverrides } from "./lib/production-env.mjs";

const COMMAND_LABEL = "db:deploy:production";

const overrides = loadProductionEnvOverrides(COMMAND_LABEL);

for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  if (!overrides[key]) {
    console.error(
      `[${COMMAND_LABEL}] .env.production-access.local is missing ${key} — ` +
        "required to migrate the production database.",
    );
    process.exit(1);
  }
}

console.warn("");
console.warn("############################################################");
console.warn("#  WARNING: about to run `prisma migrate deploy` + the       #");
console.warn("#  Part-usage backfill against the PRODUCTION Neon database. #");
console.warn("#  This applies pending migrations for real.                 #");
console.warn("############################################################");
console.warn("");

const child = spawn("pnpm", ["run", "db:deploy:upgrade"], {
  stdio: "inherit",
  env: { ...process.env, ...overrides },
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error(`[${COMMAND_LABEL}] Failed to start:`, error.message);
  process.exit(1);
});
