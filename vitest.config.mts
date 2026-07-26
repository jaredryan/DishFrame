import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Vitest doesn't load .env.local the way `next dev` does. Load it here
// (same trick as prisma.config.ts) so src/lib/env/server.ts's required
// vars (BETTER_AUTH_SECRET, etc.) are present under a plain `pnpm test`.
// Never overrides a var already set by the shell/CI — see prisma.config.ts.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "*.test.{ts,tsx}"],
    // Integration tests hit a real disposable Postgres and run separately
    // via vitest.integration.config.mts (`pnpm test:integration`).
    exclude: ["tests/e2e/**", "src/**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "server-only": path.resolve(dirname, "./src/test/server-only-mock.ts"),
    },
  },
});
