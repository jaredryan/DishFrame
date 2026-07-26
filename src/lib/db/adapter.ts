import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { env } from "@/lib/env/server";

neonConfig.webSocketConstructor = ws;

// Used only when DATABASE_URL is unset, so a Prisma client can still be
// constructed in environments without a configured database (see
// isDatabaseConfigured in src/lib/env/server.ts). No query is issued
// against it unless a caller ignores that flag.
const FALLBACK_CONNECTION_STRING =
  "postgresql://user:password@localhost:5432/dishframe";

/**
 * Selects the Prisma driver adapter for the current environment.
 *
 * - `neon` (default): deployed environments connected to Neon, via
 *   `@prisma/adapter-neon` — unchanged from the working production setup.
 * - `pg`: local development and CI, against a disposable plain Postgres
 *   (Docker Compose locally, a service container in GitHub Actions), via
 *   `@prisma/adapter-pg` (node-postgres).
 *
 * Selection is driven entirely by the explicit `DATABASE_DRIVER` env var,
 * never inferred from the shape of `DATABASE_URL` — see the comment on
 * that var in src/lib/env/server.ts for why.
 */
export function createPrismaAdapter() {
  const connectionString = env.DATABASE_URL ?? FALLBACK_CONNECTION_STRING;

  if (env.DATABASE_DRIVER === "pg") {
    return new PrismaPg({ connectionString });
  }

  return new PrismaNeon({ connectionString });
}
