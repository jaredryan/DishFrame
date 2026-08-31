// Maintenance script: permanently deletes every Part owned by one account,
// so an account can be fully reset. Not a product feature — points at
// whatever DATABASE_URL is currently configured (see .env.local/.env), same
// convention as scripts/cleanup-recipes.ts. Never touches Recipes.
//
//   pnpm cleanup:parts:local --email user@example.com            (dry run, default)
//   pnpm cleanup:parts:local --email user@example.com --delete   (destructive)
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
      "[cleanup-parts] --email <address> is required, e.g. pnpm cleanup:parts:local --email user@example.com",
    );
    process.exit(1);
  }

  const { prisma } = await import("@/lib/db/prisma");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `[cleanup-parts] No account found for email "${email}". No changes made.`,
    );
    process.exit(1);
  }

  // ownerId + kind: "PART" is the only filter — covers every sourceKind, and
  // never matches a Part merely referenced by (rather than owned by) this
  // account. Recipes (kind: "RECIPE") are excluded entirely.
  const parts = await prisma.dish.findMany({
    where: { ownerId: user.id, kind: "PART" },
    select: { id: true, currentTitle: true, createdAt: true, sourceKind: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[cleanup-parts] Account: ${email} (userId=${user.id})`);
  console.log(`[cleanup-parts] Mode: ${shouldDelete ? "DELETE" : "DRY RUN"}\n`);

  console.log("Will delete (all Parts owned by this account):");
  if (parts.length === 0) {
    console.log("  (none)");
  } else {
    for (const dish of parts) console.log(formatLine(dish));
  }
  console.log(`Part count: ${parts.length}\n`);

  if (parts.length === 0) {
    console.log("[cleanup-parts] No Parts found for this account. Nothing to do.");
    return;
  }

  if (!shouldDelete) {
    console.log(
      "[cleanup-parts] Dry run only — no changes made. Re-run with --delete to remove the Parts above.",
    );
    return;
  }

  const { deleteDish } = await import("@/lib/dishes/service");

  let deletedCount = 0;
  const failures: Array<{ id: string; title: string | null; error: unknown }> =
    [];
  for (const dish of parts) {
    try {
      // Reuses the product's own Part deletion path (deleteDish dispatches
      // "PART" to the settled two-phase model: aborts if any current usage
      // remains, materializes historical references, then deletes inside one
      // transaction) rather than a raw prisma.dish.delete, so this leaves the
      // same consistent state — and the same safety guarantees for Recipes
      // that use this Part — a normal in-app delete would.
      await deleteDish(user.id, dish.id, "PART");
      deletedCount++;
    } catch (error) {
      failures.push({ id: dish.id, title: dish.currentTitle, error });
    }
  }

  console.log(
    `[cleanup-parts] Deleted ${deletedCount} of ${parts.length} Part(s).`,
  );
  if (failures.length > 0) {
    console.error(`[cleanup-parts] ${failures.length} deletion(s) failed:`);
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
    console.error("[cleanup-parts] FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
