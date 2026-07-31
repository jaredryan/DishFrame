#!/usr/bin/env tsx
/**
 * Runtime protected-object verification (Slice 2 follow-up).
 *
 * Confirms every hand-authored raw-SQL CHECK constraint, composite foreign
 * key, and partial unique/trigram index (docs/PRISMA_SCHEMA_PROPOSAL.md §4)
 * actually exists in the connected database's system catalogs — a
 * complement to scripts/scan-migrations.ts, which only checks the
 * migration *files* themselves. Run this after applying migrations to a
 * fresh database, both in CI (after `prisma migrate deploy`) and locally
 * (`pnpm db:verify:local`).
 *
 * Refuses to run against anything but the disposable local/CI Postgres —
 * never Neon — same guard rationale as tests/e2e/seed-session.ts.
 */

import { Client } from "pg";

if (process.env.DATABASE_DRIVER !== "pg") {
  console.error(
    "[verify-db-objects] Refusing to run: DATABASE_DRIVER is not 'pg'. " +
      "This script inspects a disposable local/CI Postgres only, never Neon. " +
      "Use `pnpm db:verify:local` or the CI job, which set this explicitly.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[verify-db-objects] DATABASE_URL is not set.");
  process.exit(1);
}

// CHECK constraints and composite foreign keys, verified via pg_constraint.
const PROTECTED_CONSTRAINTS = [
  "part_link_state_consistency",
  "part_link_section_container_consistency",
  "ingredient_section_version_consistency",
  "instruction_section_version_consistency",
  "dish_archived_state_consistency",
  "dish_current_version_ownership",
  "nutrition_basis_consistency",
  "rating_value_range",
  "rating_dish_pair_consistency",
  "cooking_session_part_usage_pair_consistency",
  "grocery_list_mode_consistency",
  "meal_plan_date_order",
  "grocery_list_source_dish_pair_consistency",
  "meal_plan_entry_dish_pair_consistency",
  "share_link_mode_consistency",
  "direct_share_dish_pair_consistency",
] as const;

// Partial unique indexes and trigram GIN indexes, verified via pg_indexes.
const PROTECTED_INDEXES = [
  "dish_current_title_trgm_idx",
  "dish_current_structural_search_text_trgm_idx",
  "dish_cuisine_trgm_idx",
  "one_favorite_tag_per_user",
  "one_owner_taster_per_user",
  "one_active_session_per_dish",
  "one_fallback_category_per_user",
] as const;

async function main() {
  // Never logged — the client only ever uses this to connect, nothing here
  // prints the connection string or any other credential.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: constraintRows } = await client.query<{
      conname: string;
    }>("SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])", [
      PROTECTED_CONSTRAINTS,
    ]);
    const foundConstraints = new Set(constraintRows.map((r) => r.conname));
    const missingConstraints = PROTECTED_CONSTRAINTS.filter(
      (name) => !foundConstraints.has(name),
    );

    const { rows: indexRows } = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])",
      [PROTECTED_INDEXES],
    );
    const foundIndexes = new Set(indexRows.map((r) => r.indexname));
    const missingIndexes = PROTECTED_INDEXES.filter(
      (name) => !foundIndexes.has(name),
    );

    if (missingConstraints.length === 0 && missingIndexes.length === 0) {
      console.log(
        `[verify-db-objects] OK — all ${PROTECTED_CONSTRAINTS.length} protected ` +
          `constraints and ${PROTECTED_INDEXES.length} protected indexes are present.`,
      );
      return;
    }

    console.error(
      "[verify-db-objects] FAILED — missing protected database object(s):",
    );
    for (const name of missingConstraints) {
      console.error(`  constraint missing: ${name}`);
    }
    for (const name of missingIndexes) {
      console.error(`  index missing: ${name}`);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    "[verify-db-objects] Error:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
