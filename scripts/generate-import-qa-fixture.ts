import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRecipeMetadataBplist,
  buildRgrBuffer,
  buildZipArchive,
} from "@/lib/importExport/__fixtures__/recipe-gallery-fixtures";

/**
 * Import QA polish pass §13: a deterministic `.rga` fixture for manually
 * exercising the "Failed to import" results experience — see this file's
 * own generated output, `prisma/seed-assets/import-qa/README.md`, for how
 * to use it.
 *
 * Reuses the exact synthetic `.rga`/`.rgr`/bplist builders
 * `recipe-gallery-import.test.ts` already uses (`__fixtures__/
 * recipe-gallery-fixtures.ts`) rather than a second encoder — nothing here
 * is copied real Recipe Gallery data, and the fixture is regenerable by
 * re-running this script (`tsx scripts/generate-import-qa-fixture.ts`).
 *
 * Two records:
 * - "QA Fixture — Imports Successfully": ordinary ingredients/instructions
 *   text, parses to real content, persists normally.
 * - "QA Fixture — Fails To Import": its body is a single bare heading line
 *   ("Notes:"), which the paste-parser (`paste-parser.ts#buildSections`)
 *   recognizes as a heading, not ingredient/instruction content — so this
 *   record parses to zero ingredients/instructions/sections (schema-valid:
 *   `dishContentSchema` doesn't enforce a minimum), passing both parsing
 *   and the batch-import client-side preflight check
 *   (`validateDishContentForPersistence`, which only runs that same Zod
 *   schema). It only fails at the real server round trip, where
 *   `dishes/service.ts`'s `hasMinimumContent` rule — enforced at
 *   persistence, not in the schema — rejects it. That's a real,
 *   network-independent, deterministic failure through the actual
 *   `confirmImportBatch` path, not a simulated one.
 */

const GOOD_RECORD = buildRecipeMetadataBplist({
  title: "QA Fixture — Imports Successfully",
  categories: ["QA Fixture"],
  text: [
    "Ingredients:",
    "2 cups flour",
    "1 cup sugar",
    "2 eggs",
    "",
    "Instructions:",
    "1. Mix the dry ingredients.",
    "2. Add the eggs and stir until combined.",
    "3. Bake at 350F for 20 minutes.",
  ].join("\n"),
});

const FAILING_RECORD = buildRecipeMetadataBplist({
  title: "QA Fixture — Fails To Import",
  categories: ["QA Fixture"],
  // A bare heading line only — no ingredient/instruction content survives
  // parsing, so this record reaches the batch review list as "ok" and
  // preflight-clean, but has nothing `hasMinimumContent` will accept at
  // persistence time. See the module doc comment above.
  text: "Notes:",
});

async function main() {
  const archive = buildZipArchive([
    { name: "good-fixture.rgr", data: buildRgrBuffer(GOOD_RECORD) },
    { name: "failing-fixture.rgr", data: buildRgrBuffer(FAILING_RECORD) },
  ]);

  const outDir = path.join(process.cwd(), "prisma", "seed-assets", "import-qa");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "failed-import-fixture.rga");
  await writeFile(outPath, archive);
  console.log(`Wrote ${outPath} (${archive.length} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
