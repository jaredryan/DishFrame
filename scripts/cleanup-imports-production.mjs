#!/usr/bin/env node
// Guarded, rare-use entry point for running `pnpm cleanup:imports` against
// the PRODUCTION Neon database. See scripts/lib/production-env.mjs for the
// credential-loading/validation logic shared with dev-production-db.mjs.
//
// Requires CONFIRM_PRODUCTION_DATABASE=yes like dev-production-db.mjs (not
// db-deploy-production.mjs) because this can run destructively (--delete).
//
// Deliberately narrow: this only ever invokes cleanup:imports against
// production. It must never grow into a general production script runner.

import { spawn } from "node:child_process";
import {
  loadProductionEnvOverrides,
  requireProductionConfirmation,
} from "./lib/production-env.mjs";

const COMMAND_LABEL = "cleanup:imports:production";

requireProductionConfirmation(COMMAND_LABEL);
const overrides = loadProductionEnvOverrides(COMMAND_LABEL);

console.warn("");
console.warn("############################################################");
console.warn("#  WARNING: this cleanup runs against the PRODUCTION Neon    #");
console.warn("#  database. With --delete, deletions are REAL and           #");
console.warn("#  irreversible. Omit --delete first to preview.             #");
console.warn("############################################################");
console.warn("");

const child = spawn(
  "pnpm",
  ["run", "cleanup:imports", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, ...overrides },
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error(`[${COMMAND_LABEL}] Failed to start:`, error.message);
  process.exit(1);
});
