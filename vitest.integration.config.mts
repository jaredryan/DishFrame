import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Separate from vitest.config.mts: integration tests hit a real disposable
// Postgres (docker-compose locally, a service container in CI — see
// src/lib/db/adapter.ts) instead of running in jsdom. Never point this at
// Neon: see README/.env.example for the local DATABASE_URL these tests
// expect (postgres:postgres@localhost:5432/dishframe).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "server-only": path.resolve(dirname, "./src/test/server-only-mock.ts"),
    },
  },
});
