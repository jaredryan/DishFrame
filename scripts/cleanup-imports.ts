// Maintenance script: deletes untouched imported Recipes for one account, so
// a sample/test account can be reset after bulk import testing without
// touching imports that have since been edited (which have grown a second
// DishVersion). Not a product feature — points at whatever DATABASE_URL is
// currently configured (see .env.local/.env), same convention as
// scripts/backfill-cooking-session-part-usage.ts.
//
// Eligibility logic lives in scripts/lib/cleanup-imports-core.ts, shared
// with the Part-only counterpart (scripts/cleanup-imports-parts.ts) so the
// two entry points can't drift on what counts as an eligible import.
//
//   pnpm cleanup:imports --email user@example.com            (dry run, default)
//   pnpm cleanup:imports --email user@example.com --delete   (destructive)
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

async function run() {
  const { main } = await import("./lib/cleanup-imports-core");
  await main(process.argv.slice(2), {
    kind: "RECIPE",
    logTag: "cleanup-imports",
    commandName: "cleanup:imports",
    noun: "Recipe",
    nounPlural: "Recipes",
  });
}

void run();
