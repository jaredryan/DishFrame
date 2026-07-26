// Refuses to run integration tests against anything but the disposable
// local/CI Postgres — never Neon. These tests create and delete real rows;
// see tests/e2e/seed-session.ts for the same guard applied to Playwright's
// session-seeding script.
if (process.env.DATABASE_DRIVER !== "pg") {
  throw new Error(
    "[integration tests] Refusing to run: DATABASE_DRIVER is not 'pg'. " +
      "Integration tests must only run against a disposable local/CI " +
      "Postgres (see docker-compose.yml), never Neon. Use `pnpm test:integration`, " +
      "which sets this explicitly.",
  );
}
