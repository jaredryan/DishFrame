// Maintenance script: deletes untouched imported Recipes for one account, so
// a sample/test account can be reset after bulk import testing without
// touching imports that have since been edited (which have grown a second
// DishVersion). Not a product feature — points at whatever DATABASE_URL is
// currently configured (see .env.local/.env), same convention as
// scripts/backfill-cooking-session-part-usage.ts.
//
//   pnpm cleanup:imports --email user@example.com            (dry run, default)
//   pnpm cleanup:imports --email user@example.com --delete   (destructive)
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
    if (arg === "--delete") {
      del = true;
    } else if (arg === "--email") {
      email = argv[++i] ?? null;
    } else if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    }
  }
  return { email, delete: del };
}

// Recipe Gallery imports (paste-import-flow.tsx#archiveDraftSourceLabel) are
// the only import source that stamps a reliably-parseable prefix onto
// sourceTitle ("Recipe Gallery: <title>") — paste/URL/file imports instead
// store free-form text (a URL, "Pasted text", "Uploaded file: <name>") that
// can't be safely pattern-matched. Used only to label the report; it is not
// part of the deletion criteria, which already covers every IMPORT source.
const RECIPE_GALLERY_PREFIX = "Recipe Gallery: ";

function describeSource(dish: {
  sourceKind: string;
  sourceTitle: string | null;
}): string {
  if (dish.sourceTitle?.startsWith(RECIPE_GALLERY_PREFIX)) {
    return `Recipe Gallery — ${dish.sourceTitle.slice(RECIPE_GALLERY_PREFIX.length)}`;
  }
  return dish.sourceTitle
    ? `${dish.sourceKind} — ${dish.sourceTitle}`
    : dish.sourceKind;
}

function formatLine(dish: {
  id: string;
  currentTitle: string | null;
  createdAt: Date;
  sourceKind: string;
  sourceTitle: string | null;
  _count: { versions: number };
}): string {
  return [
    `  - "${dish.currentTitle ?? "(untitled)"}"`,
    `dishId=${dish.id}`,
    `createdAt=${dish.createdAt.toISOString()}`,
    `source=[${describeSource(dish)}]`,
    `versions=${dish._count.versions}`,
  ].join("  ");
}

async function main() {
  const { email, delete: shouldDelete } = parseArgs(process.argv.slice(2));
  if (!email) {
    console.error(
      "[cleanup-imports] --email <address> is required, e.g. pnpm cleanup:imports --email user@example.com",
    );
    process.exit(1);
  }

  const { prisma } = await import("@/lib/db/prisma");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `[cleanup-imports] No account found for email "${email}". No changes made.`,
    );
    process.exit(1);
  }

  // sourceKind = IMPORT covers every import channel (paste, URL, uploaded
  // file, Recipe Gallery archive) — they all funnel through the same
  // importExport/service.ts#confirmImport, which is the only place that
  // stamps sourceKind: "IMPORT" (ARCHITECTURE_PROPOSAL.md §L).
  const importedRecipes = await prisma.dish.findMany({
    where: { ownerId: user.id, kind: "RECIPE", sourceKind: "IMPORT" },
    select: {
      id: true,
      currentTitle: true,
      createdAt: true,
      sourceKind: true,
      sourceTitle: true,
      _count: { select: { versions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // The version-count split is read straight off the persisted DishVersion
  // relation (Prisma's relation _count), never a denormalized field, so a
  // Recipe that has actually accrued a second Version can't be
  // misclassified as untouched.
  const candidates = importedRecipes.filter(
    (dish) => dish._count.versions === 1,
  );
  const preserved = importedRecipes.filter((dish) => dish._count.versions > 1);

  console.log(`[cleanup-imports] Account: ${email} (userId=${user.id})`);
  console.log(
    `[cleanup-imports] Mode: ${shouldDelete ? "DELETE" : "DRY RUN"}\n`,
  );

  console.log(
    "Will delete (untouched imported Recipes — exactly 1 DishVersion):",
  );
  if (candidates.length === 0) {
    console.log("  (none)");
  } else {
    for (const dish of candidates) console.log(formatLine(dish));
  }
  console.log(`Candidate count: ${candidates.length}\n`);

  console.log(
    "Will keep (imported Recipes edited since import — more than 1 DishVersion):",
  );
  if (preserved.length === 0) {
    console.log("  (none)");
  } else {
    for (const dish of preserved) console.log(formatLine(dish));
  }
  console.log(`Preserved count: ${preserved.length}\n`);

  if (importedRecipes.length === 0) {
    console.log(
      "[cleanup-imports] No imported Recipes found for this account. Nothing to do.",
    );
    return;
  }

  if (!shouldDelete) {
    console.log(
      "[cleanup-imports] Dry run only — no changes made. Re-run with --delete to remove the candidates above.",
    );
    return;
  }

  if (candidates.length === 0) {
    console.log(
      "[cleanup-imports] No untouched imported Recipes to delete. Nothing to do.",
    );
    return;
  }

  const { deleteDish } = await import("@/lib/dishes/service");

  let deletedCount = 0;
  const failures: Array<{ id: string; title: string | null; error: unknown }> =
    [];
  for (const dish of candidates) {
    try {
      // Reuses the product's own Recipe deletion path (share revocation +
      // orphaned-image cleanup inside one transaction) rather than a raw
      // prisma.dish.delete, so this leaves the same consistent state a
      // normal in-app delete would.
      await deleteDish(user.id, dish.id, "RECIPE");
      deletedCount++;
    } catch (error) {
      failures.push({ id: dish.id, title: dish.currentTitle, error });
    }
  }

  console.log(
    `[cleanup-imports] Deleted ${deletedCount} of ${candidates.length} candidate Recipe(s).`,
  );
  if (failures.length > 0) {
    console.error(`[cleanup-imports] ${failures.length} deletion(s) failed:`);
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
    console.error("[cleanup-imports] FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
