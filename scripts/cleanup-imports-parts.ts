// Maintenance script: deletes untouched imported Parts for one account —
// the Part-only counterpart to scripts/cleanup-imports.ts, for repeatedly
// clearing untouched Parts imported from a Recipe Gallery migration without
// touching imported Recipes. Not a product feature — points at whatever
// DATABASE_URL is currently configured (see .env.local/.env).
//
// Eligibility logic (sourceKind: "IMPORT" + exactly 1 DishVersion) is shared
// with scripts/cleanup-imports.ts via scripts/lib/cleanup-imports-core.ts —
// only the targeted Dish `kind` differs.
//
//   pnpm cleanup:imports:parts --email user@example.com            (dry run, default)
//   pnpm cleanup:imports:parts --email user@example.com --delete   (destructive)
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

async function run() {
  const { main } = await import("./lib/cleanup-imports-core");
  await main(process.argv.slice(2), {
    kind: "PART",
    logTag: "cleanup-imports-parts",
    commandName: "cleanup:imports:parts",
    noun: "Part",
    nounPlural: "Parts",
  });
}

void run();
