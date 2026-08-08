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
    DIRECT_URL: process.env.DIRECT_URL,
    DATABASE_DRIVER: process.env.DATABASE_DRIVER,
  });
  await assertLocalDatabaseReachable(process.env.DATABASE_URL!);

  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`[db-reset] Command failed: ${command} ${args.join(" ")}`);
      process.exit(result.status ?? 1);
    }
  }

  run("pnpm", ["run", "db:clear"]);
  run("pnpm", ["run", "db:seed"]);

  console.log("[db-reset] Done.");
}

main().catch((error) => {
  console.error("[db-reset] Failed:", error);
  process.exit(1);
});
