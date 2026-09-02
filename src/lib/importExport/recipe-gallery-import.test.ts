import { describe, expect, it } from "vitest";
import { extractRecipesFromArchive } from "@/lib/importExport/recipe-gallery-import";
import {
  buildRecipeMetadataBplist,
  buildRgrBuffer,
  buildZipArchive,
} from "@/lib/importExport/__fixtures__/recipe-gallery-fixtures";

/**
 * Exercises the `.rga`/`.rgr` adapter against synthetic archives built at
 * test time (recipe-gallery-fixtures.ts) — never a real or committed
 * Recipe Gallery export.
 */

function makeValidRgr(opts: {
  title: string;
  categories?: string[];
  text: string;
  webUrl?: string;
  viaFastPath?: boolean;
}): Buffer {
  const metadata = buildRecipeMetadataBplist({
    title: opts.title,
    categories: opts.categories ?? [],
    text: opts.text,
    webUrl: opts.webUrl,
  });
  return buildRgrBuffer(metadata, { declaredLength: opts.viaFastPath });
}

const SIMPLE_RECIPE_TEXT =
  "INGREDIENTS:\n\n1 cup flour\n1 egg\n\nINSTRUCTIONS:\n\nMix everything.\nBake it.";

describe("extractRecipesFromArchive", () => {
  it("rejects a non-ZIP buffer as a corrupted export", async () => {
    const result = extractRecipesFromArchive(
      Buffer.from("this is not a zip file at all"),
    );
    expect(result.status).toBe("error");
  });

  it("rejects an empty buffer", async () => {
    const result = extractRecipesFromArchive(Buffer.alloc(0));
    expect(result.status).toBe("error");
  });

  it("extracts title, ingredients, and instructions from one recipe", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({
          title: "Test Recipe",
          categories: ["Soups"],
          text: SIMPLE_RECIPE_TEXT,
        }),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;

    expect(draft.result.values.title).toBe("Test Recipe");
    // Recipe Gallery Categories are organizational tags, not cuisines —
    // never mapped into `cuisineGuess`; surfaced only as non-persisted
    // `sourceCategory` metadata.
    expect(draft.result.cuisineGuess).toBeNull();
    expect(draft.sourceCategory).toBe("Soups");
    const section = draft.result.values.sections[0];
    expect(section.ingredients.map((i) => i.name)).toEqual(["flour", "egg"]);
    expect(section.instructions.map((i) => i.text)).toEqual([
      "Mix everything.",
      "Bake it.",
    ]);
  });

  it("never maps a Category to cuisine, and treats 'Uncategorized' as no source category", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({
          title: "Plain Recipe",
          categories: ["Uncategorized"],
          text: SIMPLE_RECIPE_TEXT,
        }),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.result.cuisineGuess).toBeNull();
    expect(draft.sourceCategory).toBeNull();
  });

  it("extracts multiple contained recipes from one archive", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({ title: "Recipe One", text: SIMPLE_RECIPE_TEXT }),
      },
      {
        name: "BBBB.rgr",
        data: makeValidRgr({ title: "Recipe Two", text: SIMPLE_RECIPE_TEXT }),
      },
      {
        name: "CCCC.rgr",
        data: makeValidRgr({
          title: "Recipe Three",
          text: SIMPLE_RECIPE_TEXT,
        }),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.drafts).toHaveLength(3);
    expect(result.drafts.every((d) => d.status === "ok")).toBe(true);
    expect(
      result.drafts.map((d) =>
        d.status === "ok" ? d.result.values.title : null,
      ),
    ).toEqual(["Recipe One", "Recipe Two", "Recipe Three"]);
  });

  it("recovers the correct metadata length via the trailer-scan fallback when no declared length precedes it", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({
          title: "Fallback Path Recipe",
          text: SIMPLE_RECIPE_TEXT,
          viaFastPath: false,
        }),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.result.values.title).toBe("Fallback Path Recipe");
  });

  it("isolates one malformed recipe record without failing the rest of the batch", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({ title: "Good Recipe", text: SIMPLE_RECIPE_TEXT }),
      },
      {
        name: "BBBB.rgr",
        data: Buffer.from("not a real .rgr package at all"),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0].status).toBe("ok");
    expect(result.drafts[1].status).toBe("error");
  });

  it("flags a recipe with no ingredients/instructions text as an error draft", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({ title: "Empty Recipe", text: "   " }),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.drafts[0].status).toBe("error");
  });

  it("ignores an entry whose name isn't a flat <name>.rgr file (traversal/nesting)", async () => {
    const archive = buildZipArchive([
      {
        name: "../evil.rgr",
        data: makeValidRgr({ title: "Sneaky", text: SIMPLE_RECIPE_TEXT }),
      },
      {
        name: "nested/dir/recipe.rgr",
        data: makeValidRgr({ title: "Nested", text: SIMPLE_RECIPE_TEXT }),
      },
      {
        name: "readme.txt",
        data: Buffer.from("not a recipe"),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toMatch(/no recipe gallery recipes/i);
  });

  it("rejects a single entry declared larger than the per-entry size cap", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({ title: "Huge", text: SIMPLE_RECIPE_TEXT }),
        declaredSize: 40 * 1024 * 1024,
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].status).toBe("error");
  });

  it("rejects an archive with too many entries", async () => {
    const entries = Array.from({ length: 2001 }, (_, i) => ({
      name: `f${i}.rgr`,
      data: Buffer.from("x"),
    }));
    const archive = buildZipArchive(entries);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toMatch(/too many entries/i);
  });

  // Task §13's deterministic failed-import QA fixture
  // (scripts/generate-import-qa-fixture.ts) relies on a bare-heading-only
  // body ("Notes:") parsing to zero ingredients/instructions — schema-valid
  // (so it reaches "ok"/reviewable, not a parse-time "error" draft) but
  // empty enough that `dishes/service.ts`'s `hasMinimumContent` rejects it
  // at the real persistence step. This protects that exact assumption from
  // silently breaking if the paste-parser's heading/separator handling ever
  // changes.
  it("parses a bare-heading-only body to an 'ok' draft with zero ingredients/instructions", async () => {
    const archive = buildZipArchive([
      {
        name: "AAAA.rgr",
        data: makeValidRgr({
          title: "QA Fixture — Fails To Import",
          text: "Notes:",
        }),
      },
    ]);

    const result = extractRecipesFromArchive(archive);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.result.needsReviewCount).toBe(0);
    const totalIngredients = draft.result.values.sections.reduce(
      (sum, section) => sum + section.ingredients.length,
      0,
    );
    const totalInstructions = draft.result.values.sections.reduce(
      (sum, section) => sum + section.instructions.length,
      0,
    );
    expect(totalIngredients).toBe(0);
    expect(totalInstructions).toBe(0);
    expect(draft.result.values.partLinks).toHaveLength(0);
  });
});
