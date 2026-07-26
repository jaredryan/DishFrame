#!/usr/bin/env tsx
/**
 * Static migration-safety scanner (Slice 2 follow-up).
 *
 * DishFrame's migrations contain hand-authored raw SQL (CHECK constraints,
 * composite foreign keys, partial unique indexes, trigram indexes) with no
 * Prisma Schema Language representation — see
 * docs/PRISMA_SCHEMA_PROPOSAL.md §1/§4 and the CLAUDE.md migration rule.
 * Because `prisma migrate dev --create-only`'s shadow-database diffing
 * replays every prior migration.sql file verbatim, it can propose spurious
 * DROP statements for these unmanaged objects (a real issue hit and
 * documented in docs/SLICE_2.md §5.2). This script is a second, independent
 * line of defense: it scans every migration.sql file for a DROP targeting
 * one of these protected names and fails the build if one slips through
 * uninspected — run via `pnpm db:scan-migrations`, wired into CI.
 *
 * This never connects to a database — pure static text analysis. See
 * scripts/verify-db-objects.ts for the runtime counterpart that confirms
 * these objects actually exist after migrations are applied.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

// Every hand-added constraint/index name from
// docs/PRISMA_SCHEMA_PROPOSAL.md §4, plus the Slice 2 follow-up's fallback
// Grocery Category index. Keep this list in sync whenever a new protected
// raw-SQL object is added to the schema.
const PROTECTED_OBJECT_NAMES = [
  "part_link_state_consistency",
  "part_link_section_container_consistency",
  "ingredient_section_version_consistency",
  "instruction_section_version_consistency",
  "dish_archived_state_consistency",
  "dish_current_version_ownership",
  "nutrition_basis_consistency",
  "rating_value_range",
  "rating_dish_pair_consistency",
  "grocery_list_source_dish_pair_consistency",
  "meal_plan_entry_dish_pair_consistency",
  "direct_share_dish_pair_consistency",
  "grocery_list_mode_consistency",
  "meal_plan_date_order",
  "share_link_mode_consistency",
  "one_favorite_tag_per_user",
  "one_owner_taster_per_user",
  "one_active_session_per_dish",
  "dish_current_title_trgm_idx",
  "dish_current_structural_search_text_trgm_idx",
  "dish_cuisine_trgm_idx",
  "one_fallback_category_per_user",
] as const;

// Explicit, documented allowlist mechanism for a future intentionally
// approved removal (e.g., a schema redesign that genuinely drops one of
// these). Add a line anywhere in the migration.sql file, e.g.:
//   -- migration-safety-allow-drop: one_favorite_tag_per_user
// A bare "DROP" is never silently ignored otherwise.
const ALLOW_DROP_PATTERN =
  /^--\s*migration-safety-allow-drop:\s*([A-Za-z0-9_]+)\s*$/;

// Matches both standalone `DROP CONSTRAINT "name"` / `DROP INDEX "name"`
// and the `ALTER TABLE ... DROP CONSTRAINT "name"` form Prisma generates —
// this pattern only cares about the DROP clause itself, not what precedes
// it on the line.
const DROP_PATTERN =
  /DROP\s+(?:CONSTRAINT|INDEX)\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi;

type Finding = {
  file: string;
  line: number;
  name: string;
  statement: string;
};

function findAllowedDrops(content: string): Set<string> {
  const allowed = new Set<string>();
  for (const line of content.split("\n")) {
    const match = ALLOW_DROP_PATTERN.exec(line.trim());
    if (match) allowed.add(match[1]);
  }
  return allowed;
}

function scanFile(filePath: string): Finding[] {
  const content = readFileSync(filePath, "utf-8");
  const allowed = findAllowedDrops(content);
  const findings: Finding[] = [];

  content.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(DROP_PATTERN)) {
      const name = match[1];
      if (
        (PROTECTED_OBJECT_NAMES as readonly string[]).includes(name) &&
        !allowed.has(name)
      ) {
        findings.push({
          file: filePath,
          line: index + 1,
          name,
          statement: line.trim(),
        });
      }
    }
  });

  return findings;
}

function main() {
  const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(MIGRATIONS_DIR, entry.name, "migration.sql"));

  const allFindings = migrationDirs.flatMap((file) => scanFile(file));

  if (allFindings.length === 0) {
    console.log(
      `[scan-migrations] OK — no unallowed removal of a protected object ` +
        `across ${migrationDirs.length} migration file(s).`,
    );
    return;
  }

  console.error(
    "[scan-migrations] FAILED — found removal of protected DishFrame database object(s):\n",
  );
  for (const finding of allFindings) {
    console.error(
      `  ${path.relative(process.cwd(), finding.file)}:${finding.line} — drops "${finding.name}"\n` +
        `    ${finding.statement}\n`,
    );
  }
  console.error(
    "If this removal is genuinely intentional, add a line to the migration " +
      "file to explicitly allow it:\n" +
      "  -- migration-safety-allow-drop: <name>\n",
  );
  process.exit(1);
}

main();
