import { Client } from "pg";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

type LocalDatabaseEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  DATABASE_DRIVER?: string;
};

/**
 * Refuses to proceed unless the environment unambiguously targets the
 * disposable local/CI Postgres (docker-compose.yml) — never Neon,
 * production, or an unrecognized remote database. Checked on both
 * DATABASE_URL and DIRECT_URL, and never on DATABASE_DRIVER alone: a
 * misconfigured .env.production-access.local override could otherwise
 * set DATABASE_DRIVER=pg while pointing at a real Neon host.
 */
export function assertLocalDatabaseEnv(vars: LocalDatabaseEnv): void {
  if (vars.DATABASE_DRIVER !== "pg") {
    throw new Error(
      `Refusing to run: DATABASE_DRIVER is "${vars.DATABASE_DRIVER ?? "unset"}", not "pg". ` +
        "This command only ever runs against the disposable local Postgres — see docker-compose.yml.",
    );
  }

  for (const [name, value] of [
    ["DATABASE_URL", vars.DATABASE_URL],
    ["DIRECT_URL", vars.DIRECT_URL],
  ] as const) {
    if (!value) {
      throw new Error(`Refusing to run: ${name} is not set.`);
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        `Refusing to run: ${name} is not a valid connection URL.`,
      );
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

    if (hostname.toLowerCase().includes("neon.tech")) {
      throw new Error(
        `Refusing to run: ${name} points at a neon.tech host. This command must never run against Neon.`,
      );
    }

    if (!LOCAL_HOSTNAMES.has(hostname)) {
      throw new Error(
        `Refusing to run: ${name}'s host ("${hostname}") is not a recognized local database host ` +
          `(${[...LOCAL_HOSTNAMES].join(", ")}). This command only ever runs against the disposable local Postgres.`,
      );
    }
  }
}

/**
 * Preflight connectivity check for the local db:clear/db:seed/db:reset
 * scripts. Without this, an unreachable Postgres (most often: Docker
 * Desktop or the `dishframe-postgres` container isn't running) surfaces as
 * a raw ECONNREFUSED deep inside a Prisma CLI subprocess, which reads like
 * something is broken with the data rather than with connectivity —
 * historically prompting a `db:reset` that doesn't actually address it
 * (db:reset never starts Docker) and destroys local data for nothing. This
 * turns that into one clear message pointing at the real, non-destructive
 * fix (`pnpm db:docker:up`) before any script touches the database.
 */
export async function assertLocalDatabaseReachable(
  databaseUrl: string,
): Promise<void> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Refusing to run: could not reach the local Postgres (${describeConnectionError(error)}). ` +
        "Start it with `pnpm db:docker:up` (safe — preserves existing data), then retry. " +
        "This does not require db:reset.",
    );
  } finally {
    await client.end().catch(() => {});
  }
}

// Node wraps a refused localhost connection in an AggregateError (one
// attempt per resolved address, e.g. ::1 and 127.0.0.1) whose own
// `.message` is empty — the useful detail is on `.code` or the first
// nested error instead.
function describeConnectionError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.message) return error.message;
  const code = (error as { code?: string }).code;
  if (code) return code;
  const nested = (error as { errors?: unknown[] }).errors?.[0];
  return nested ? describeConnectionError(nested) : error.name;
}
