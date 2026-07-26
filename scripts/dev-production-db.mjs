#!/usr/bin/env node
// Guarded, rare-use entry point for running the local dev server against
// the PRODUCTION Neon database. Ordinary `pnpm dev` never touches this
// file — see .env.production-access.local and .env.example for context.
//
// Deliberately narrow: this only ever launches `next dev`. It must never
// grow into a shortcut for tests, seeds, resets, or migrations against
// production — those always belong on the disposable local/CI Postgres.

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const PRODUCTION_ENV_FILE = ".env.production-access.local";

if (process.env.CONFIRM_PRODUCTION_DATABASE !== "yes") {
  console.error(
    "[dev:production-db] Refusing to run: this would connect your local " +
      "dev server to the PRODUCTION database. Re-run with " +
      "CONFIRM_PRODUCTION_DATABASE=yes to confirm this is intentional:\n" +
      "  CONFIRM_PRODUCTION_DATABASE=yes pnpm dev:production-db",
  );
  process.exit(1);
}

if (!existsSync(PRODUCTION_ENV_FILE)) {
  console.error(
    `[dev:production-db] Missing ${PRODUCTION_ENV_FILE} — see .env.example ` +
      "for what it must contain (DATABASE_DRIVER/DATABASE_URL/DIRECT_URL " +
      "for the real Neon database).",
  );
  process.exit(1);
}

// Parsed and injected into the child process's environment only — never
// logged, printed, or otherwise surfaced here.
const overrides = {};
for (const line of readFileSync(PRODUCTION_ENV_FILE, "utf-8").split("\n")) {
  const match = /^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/.exec(line.trim());
  if (!match || line.trim().startsWith("#")) continue;
  const [, key, value] = match;
  overrides[key] = value;
}

if (overrides.DATABASE_DRIVER !== "neon") {
  console.error(
    `[dev:production-db] ${PRODUCTION_ENV_FILE} must set DATABASE_DRIVER=neon.`,
  );
  process.exit(1);
}

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
  console.error("[dev:production-db] Failed to start:", error.message);
  process.exit(1);
});
