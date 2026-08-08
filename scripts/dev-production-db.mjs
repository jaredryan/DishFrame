#!/usr/bin/env node
// Guarded, rare-use entry point for running the local dev server against
// the PRODUCTION Neon database. Ordinary `pnpm dev` never touches this
// file — see .env.production-access.local and .env.example for context.
//
// Deliberately narrow: this only ever launches `next dev`. It must never
// grow into a shortcut for tests, seeds, resets, or migrations against
// production — those always belong on the disposable local/CI Postgres.

import { spawn } from "node:child_process";
import {
  loadProductionEnvOverrides,
  requireProductionConfirmation,
} from "./lib/production-env.mjs";

const COMMAND_LABEL = "dev:production-db";

requireProductionConfirmation(COMMAND_LABEL);
const overrides = loadProductionEnvOverrides(COMMAND_LABEL);

console.warn("");
console.warn("############################################################");
console.warn("#  WARNING: this local dev server is connected to the       #");
console.warn("#  PRODUCTION Neon database. Any writes are REAL. Ctrl+C     #");
console.warn("#  now if this was not intentional.                         #");
console.warn("############################################################");
console.warn("");

const child = spawn("pnpm", ["run", "dev"], {
  stdio: "inherit",
  env: { ...process.env, ...overrides },
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error(`[${COMMAND_LABEL}] Failed to start:`, error.message);
  process.exit(1);
});
