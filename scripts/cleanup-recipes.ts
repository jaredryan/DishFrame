// Maintenance script: permanently deletes every Recipe owned by one account
// (created, imported, duplicated, or received via sharing — any sourceKind),
// so an account can be fully reset. Not a product feature — points at
// whatever DATABASE_URL is currently configured (see .env.local/.env), same
// convention as scripts/cleanup-imports.ts. Never touches Parts.
//
//   pnpm cleanup:recipes:local --email user@example.com            (dry run, default)
//   pnpm cleanup:recipes:local --email user@example.com --delete   (destructive)
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

function parseArgs(argv: string[]): { email: string | null; delete: boolean } {
  let email: string | null = null;
  let del = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // --dry-run is accepted as an explicit no-op alias for the default (safe)
    // mode — no longer required for safety, kept for callers that pass it.
    if (arg === "--delete") {
      del = true;
    } else if (arg === "--dry-run") {
      // no-op
    } else if (arg === "--email") {
      email = argv[++i] ?? null;
    } else if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    }
  }
  return { email, delete: del };
}

function formatLine(dish: {
  id: string;
  currentTitle: string | null;
  createdAt: Date;
  sourceKind: string;
}): string {
  return [
    `  - "${dish.currentTitle ?? "(untitled)"}"`,
    `dishId=${dish.id}`,
    `createdAt=${dish.createdAt.toISOString()}`,
    `sourceKind=${dish.sourceKind}`,
  ].join("  ");
}

async function main() {
  const { email, delete: shouldDelete } = parseArgs(process.argv.slice(2));
  if (!email) {
    console.error(
      "[cleanup-recipes] --email <address> is required, e.g. pnpm cleanup:recipes:local --email user@example.com",
    );
    process.exit(1);
  }

  const { prisma } = await import("@/lib/db/prisma");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `[cleanup-recipes] No account found for email "${email}". No changes made.`,
    );
    process.exit(1);
  }

  // ownerId + kind: "RECIPE" is the only filter — covers every sourceKind
  // (CREATED, IMPORT, DUPLICATE, or received via ShareLink/DirectShare
  // acceptance all funnel into a Dish row owned by this account), and never
  // matches a Recipe merely shared/sent to or from this account but owned by
  // someone else. Parts (kind: "PART") are excluded entirely.
  const recipes = await prisma.dish.findMany({
    where: { ownerId: user.id, kind: "RECIPE" },
    select: { id: true, currentTitle: true, createdAt: true, sourceKind: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[cleanup-recipes] Account: ${email} (userId=${user.id})`);
  console.log(
    `[cleanup-recipes] Mode: ${shouldDelete ? "DELETE" : "DRY RUN"}\n`,
  );

  console.log("Will delete (all Recipes owned by this account):");
  if (recipes.length === 0) {
    console.log("  (none)");
  } else {
    for (const dish of recipes) console.log(formatLine(dish));
  }
  console.log(`Recipe count: ${recipes.length}\n`);

  if (recipes.length === 0) {
    console.log("[cleanup-recipes] No Recipes found for this account. Nothing to do.");
    return;
  }

  if (!shouldDelete) {
    console.log(
      "[cleanup-recipes] Dry run only — no changes made. Re-run with --delete to remove the Recipes above.",
    );
    return;
  }

  const { deleteDish } = await import("@/lib/dishes/service");

  let deletedCount = 0;
  const failures: Array<{ id: string; title: string | null; error: unknown }> =
    [];
  for (const dish of recipes) {
    try {
      // Reuses the product's own Recipe deletion path (share revocation +
      // orphaned-image cleanup inside one transaction, schema cascades for
      // Versions/CookingSessions, SetNull for MealPlanEntry references) so
      // this leaves the same consistent state a normal in-app delete would.
      await deleteDish(user.id, dish.id, "RECIPE");
      deletedCount++;
    } catch (error) {
      failures.push({ id: dish.id, title: dish.currentTitle, error });
    }
  }

  console.log(
    `[cleanup-recipes] Deleted ${deletedCount} of ${recipes.length} Recipe(s).`,
  );
  if (failures.length > 0) {
    console.error(`[cleanup-recipes] ${failures.length} deletion(s) failed:`);
    for (const failure of failures) {
      console.error(
        `  - dishId=${failure.id} "${failure.title ?? "(untitled)"}":`,
        failure.error,
      );
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[cleanup-recipes] FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
