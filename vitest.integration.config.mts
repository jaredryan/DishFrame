import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// See vitest.config.mts for why this is here — loads .env.local's
// non-database vars (BETTER_AUTH_SECRET, etc.) without ever overriding the
// DATABASE_URL/DIRECT_URL/DATABASE_DRIVER this config's own npm scripts set
// explicitly (process.loadEnvFile never overrides an already-set var).
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

// Separate from vitest.config.mts: integration tests hit a real disposable
// Postgres (docker-compose locally, a service container in CI — see
// src/lib/db/adapter.ts) instead of running in jsdom. Never point this at
// Neon: see README/.env.example for the local DATABASE_URL these tests
// expect (postgres:postgres@localhost:5432/dishframe).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./src/test/integration-setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Same shared-local-Postgres parallelism flake `verify:e2e`'s
    // single-worker Playwright config already works around: separate test
    // files running concurrently can hit genuine SERIALIZABLE write
    // conflicts against the same Postgres instance even when they touch
    // unrelated rows (Postgres's SSI can false-positive on overlapping
    // predicate/index-range reads). Files within this suite are otherwise
    // independent, so running them sequentially costs time, not coverage.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "server-only": path.resolve(dirname, "./src/test/server-only-mock.ts"),
    },
  },
});
