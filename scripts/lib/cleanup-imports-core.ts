// Shared core for the "untouched import" cleanup scripts
// (scripts/cleanup-imports.ts, scripts/cleanup-imports-parts.ts) — same
// eligibility logic (sourceKind: "IMPORT" + exactly 1 DishVersion, i.e.
// never edited since import) for both, differing only in which Dish `kind`
// is targeted. Extracted so the two entry points can never drift on what
// counts as an eligible import.

export type ImportCleanupKind = "RECIPE" | "PART";

export interface ImportCleanupArgs {
  email: string | null;
  delete: boolean;
}

export function parseImportCleanupArgs(argv: string[]): ImportCleanupArgs {
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

export interface ImportCleanupConfig {
  /** Which Dish kind this entry point targets. */
  kind: ImportCleanupKind;
  /** Log/error prefix, e.g. "cleanup-imports" or "cleanup-imports-parts". */
  logTag: string;
  /** pnpm command name shown in usage/error text, e.g. "cleanup:imports". */
  commandName: string;
  /** Singular noun for messages, e.g. "Recipe" or "Part". */
  noun: string;
  /** Plural noun for messages, e.g. "Recipes" or "Parts". */
  nounPlural: string;
}

export async function runImportCleanup(
  argv: string[],
  config: ImportCleanupConfig,
): Promise<void> {
  const { logTag, commandName, kind, noun, nounPlural } = config;
  const { email, delete: shouldDelete } = parseImportCleanupArgs(argv);
  if (!email) {
    console.error(
      `[${logTag}] --email <address> is required, e.g. pnpm ${commandName} --email user@example.com`,
    );
    process.exit(1);
  }

  const { prisma } = await import("@/lib/db/prisma");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `[${logTag}] No account found for email "${email}". No changes made.`,
    );
    process.exit(1);
  }

  // sourceKind = IMPORT covers every import channel (paste, URL, uploaded
  // file, Recipe Gallery archive) — they all funnel through the same
  // importExport/service.ts#confirmImport, which is the only place that
  // stamps sourceKind: "IMPORT" (ARCHITECTURE_PROPOSAL.md §L).
  const imported = await prisma.dish.findMany({
    where: { ownerId: user.id, kind, sourceKind: "IMPORT" },
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
  // relation (Prisma's relation _count), never a denormalized field, so an
  // item that has actually accrued a second Version can't be misclassified
  // as untouched.
  const candidates = imported.filter((dish) => dish._count.versions === 1);
  const preserved = imported.filter((dish) => dish._count.versions > 1);

  console.log(`[${logTag}] Account: ${email} (userId=${user.id})`);
  console.log(`[${logTag}] Mode: ${shouldDelete ? "DELETE" : "DRY RUN"}\n`);

  console.log(
    `Will delete (untouched imported ${nounPlural} — exactly 1 DishVersion):`,
  );
  if (candidates.length === 0) {
    console.log("  (none)");
  } else {
    for (const dish of candidates) console.log(formatLine(dish));
  }
  console.log(`Candidate count: ${candidates.length}\n`);

  console.log(
    `Will keep (imported ${nounPlural} edited since import — more than 1 DishVersion):`,
  );
  if (preserved.length === 0) {
    console.log("  (none)");
  } else {
    for (const dish of preserved) console.log(formatLine(dish));
  }
  console.log(`Preserved count: ${preserved.length}\n`);

  if (imported.length === 0) {
    console.log(
      `[${logTag}] No imported ${nounPlural} found for this account. Nothing to do.`,
    );
    return;
  }

  if (!shouldDelete) {
    console.log(
      `[${logTag}] Dry run only — no changes made. Re-run with --delete to remove the candidates above.`,
    );
    return;
  }

  if (candidates.length === 0) {
    console.log(
      `[${logTag}] No untouched imported ${nounPlural} to delete. Nothing to do.`,
    );
    return;
  }

  const { deleteDish } = await import("@/lib/dishes/service");

  let deletedCount = 0;
  const failures: Array<{ id: string; title: string | null; error: unknown }> =
    [];
  for (const dish of candidates) {
    try {
      // Reuses the product's own deletion path (deleteDish dispatches by
      // kind — Recipe: share revocation + orphaned-image cleanup in one
      // transaction; Part: the settled two-phase usage-resolution model)
      // rather than a raw prisma.dish.delete, so this leaves the same
      // consistent state a normal in-app delete would.
      await deleteDish(user.id, dish.id, kind);
      deletedCount++;
    } catch (error) {
      failures.push({ id: dish.id, title: dish.currentTitle, error });
    }
  }

  console.log(
    `[${logTag}] Deleted ${deletedCount} of ${candidates.length} candidate ${noun}(s).`,
  );
  if (failures.length > 0) {
    console.error(`[${logTag}] ${failures.length} deletion(s) failed:`);
    for (const failure of failures) {
      console.error(
        `  - dishId=${failure.id} "${failure.title ?? "(untitled)"}":`,
        failure.error,
      );
    }
    process.exitCode = 1;
  }
}

export async function main(
  argv: string[],
  config: ImportCleanupConfig,
): Promise<void> {
  await runImportCleanup(argv, config)
    .catch((error) => {
      console.error(`[${config.logTag}] FAILED:`, error);
      process.exit(1);
    })
    .finally(async () => {
      const { prisma } = await import("@/lib/db/prisma");
      await prisma.$disconnect();
    });
}
