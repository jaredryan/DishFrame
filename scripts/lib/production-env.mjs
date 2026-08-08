// Shared helper for guarded production-Neon entry points
// (scripts/dev-production-db.mjs, scripts/db-deploy-production.mjs). Parses
// .env.production-access.local and validates it targets Neon — the parsed
// values are only ever injected into a child process's environment, never
// logged or printed here.

import { existsSync, readFileSync } from "node:fs";

export const PRODUCTION_ENV_FILE = ".env.production-access.local";

export function requireProductionConfirmation(commandLabel) {
  if (process.env.CONFIRM_PRODUCTION_DATABASE !== "yes") {
    console.error(
      `[${commandLabel}] Refusing to run: this touches the PRODUCTION ` +
        "database. Re-run with CONFIRM_PRODUCTION_DATABASE=yes to confirm " +
        "this is intentional:\n" +
        `  CONFIRM_PRODUCTION_DATABASE=yes pnpm ${commandLabel}`,
    );
    process.exit(1);
  }
}

export function loadProductionEnvOverrides(commandLabel) {
  if (!existsSync(PRODUCTION_ENV_FILE)) {
    console.error(
      `[${commandLabel}] Missing ${PRODUCTION_ENV_FILE} — see .env.example ` +
        "for what it must contain (DATABASE_DRIVER/DATABASE_URL/DIRECT_URL " +
        "for the real Neon database).",
    );
    process.exit(1);
  }

  const overrides = {};
  for (const line of readFileSync(PRODUCTION_ENV_FILE, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/.exec(trimmed);
    if (!match) continue;
    const [, key, value] = match;
    overrides[key] = value;
  }

  if (overrides.DATABASE_DRIVER !== "neon") {
    console.error(
      `[${commandLabel}] ${PRODUCTION_ENV_FILE} must set DATABASE_DRIVER=neon.`,
    );
    process.exit(1);
  }

  return overrides;
}
