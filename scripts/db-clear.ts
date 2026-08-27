import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

async function main() {
  const { assertLocalDatabaseEnv, assertLocalDatabaseReachable } =
    await import("@/lib/db/local-guard");
  assertLocalDatabaseEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL,
    DATABASE_DRIVER: process.env.DATABASE_DRIVER,
  });
  await assertLocalDatabaseReachable(process.env.DATABASE_URL!);

  console.log("[db-clear] Local database confirmed. Clearing...");

  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`[db-clear] Command failed: ${command} ${args.join(" ")}`);
      process.exit(result.status ?? 1);
    }
  }

  // No `--skip-seed` flag: this Prisma CLI version (7.9.0) doesn't support
  // it on `migrate reset` (confirmed via `prisma migrate reset --help`),
  // and it isn't needed anyway — neither `package.json`'s legacy
  // `prisma.seed` field nor `prisma.config.ts`'s `migrations.seed` is set,
  // so `migrate reset` has no seed command to invoke in the first place.
  run("pnpm", ["exec", "prisma", "migrate", "reset", "--force"]);
  run("pnpm", ["exec", "prisma", "generate"]);

  console.log("[db-clear] Done. Database is empty and fully migrated.");
}

main().catch((error) => {
  console.error("[db-clear] Failed:", error);
  process.exit(1);
});
