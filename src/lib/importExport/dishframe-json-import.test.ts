import { describe, expect, it } from "vitest";
import { normalizeDishExportJson } from "@/lib/importExport/dishframe-json-import";

// A minimal but representative shape of `export-dto.ts#buildDishExportDto`'s
// output for a "SINGLE" version-mode Recipe export — only the fields
// `dishframe-json-import.ts` actually reads.
function dishExportJson(overrides: Record<string, unknown> = {}) {
  return {
    format: "dishframe.dish-export",
    formatVersion: 2,
    exportedAt: "2026-08-01T00:00:00.000Z",
    scope: { exportType: "RECIPE", tier: "STANDARD", versionMode: "SINGLE" },
    kind: "RECIPE",
    title: "Weeknight Tacos",
    stage: "PROVEN",
    cuisine: "Mexican",
    tags: ["Quick", "Family favorite"],
    flavorProfiles: ["Spicy"],
    versions: [
      {
        versionLabel: "1.0",
        title: "Weeknight Tacos",
        description: "A fast weeknight dinner.",
        yieldQuantity: 4,
        yieldUnit: "servings",
        prepTimeMinutes: 10,
        cookTimeMinutes: 15,
        difficulty: "Easy",
        nutrition: {
          calories: 400,
          protein: 25,
          carbs: 30,
          fat: 15,
          basis: "PER_OUTPUT_UNIT",
          basisQuantity: 1,
          basisUnit: "serving",
          moreNutrients: [],
          sourceProvider: null,
          sourceId: null,
          sourceName: null,
        },
        imageAssetId: "asset-1",
        versionNote: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        sections: [
          {
            name: null,
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                name: "Ground beef",
                quantity: 1,
                quantityEnd: null,
                isApproximate: false,
                unit: "lb",
                displayText: null,
                preparationNote: null,
                isOptional: false,
                originalImportedText: null,
                substitute: null,
              },
            ],
            instructions: [{ text: "Brown the beef.", position: 0 }],
            linkedParts: [],
          },
        ],
        topLevelLinkedParts: [],
      },
    ],
    aggregateRating: null,
    ratingCount: 0,
    activePublications: [],
    ...overrides,
  };
}

describe("normalizeDishExportJson", () => {
  it("normalizes a DishFrame dish export into one ok ArchiveImportDraft", () => {
    const result = normalizeDishExportJson(dishExportJson());
    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;

    expect(draft.sourceDishKind).toBe("RECIPE");
    expect(draft.presetTags).toEqual(["Quick", "Family favorite"]);
    expect(draft.presetFlavorProfiles).toEqual(["Spicy"]);
    expect(draft.droppedLinkedPartsCount).toBe(0);
    expect(draft.result.values).toMatchObject({
      title: "Weeknight Tacos",
      stage: "PROVEN",
      cuisine: "Mexican",
      yieldQuantity: 4,
      yieldUnit: "servings",
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      difficulty: "Easy",
    });
    expect(draft.result.values.sections).toHaveLength(1);
    expect(draft.result.values.sections[0].ingredients).toEqual([
      expect.objectContaining({ name: "Ground beef", unit: "lb" }),
    ]);
    expect(draft.result.values.sections[0].instructions).toEqual([
      { text: "Brown the beef." },
    ]);
    // partLinks/linkedParts are deliberately dropped — not safely
    // representable without live account-side validation.
    expect(draft.result.values.sections[0].partLinks).toEqual([]);
    expect(draft.result.values.partLinks).toEqual([]);
  });

  it("recognizes a Part export and preserves its kind", () => {
    const result = normalizeDishExportJson(
      dishExportJson({ kind: "PART", title: "Marinara Sauce" }),
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.sourceDishKind).toBe("PART");
  });

  it("rejects an account backup with a specific message, not a generic parse error", () => {
    const result = normalizeDishExportJson({
      format: "dishframe.account-export",
      dishes: [],
    });
    expect(result).toEqual({
      status: "error",
      message: expect.stringContaining("account backup"),
    });
  });

  it("rejects a file with no recognizable format", () => {
    const result = normalizeDishExportJson({ hello: "world" });
    expect(result.status).toBe("error");
  });

  it("rejects malformed input (not an object)", () => {
    expect(normalizeDishExportJson(null).status).toBe("error");
    expect(normalizeDishExportJson("just a string").status).toBe("error");
    expect(normalizeDishExportJson([1, 2, 3]).status).toBe("error");
  });

  it("rejects a dish export with no version content", () => {
    const result = normalizeDishExportJson(dishExportJson({ versions: [] }));
    expect(result.status).toBe("error");
  });

  it("falls back to the placeholder empty section when a version has no real content", () => {
    const result = normalizeDishExportJson(
      dishExportJson({
        versions: [
          {
            title: "Empty Recipe",
            sections: [],
          },
        ],
      }),
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.result.values.sections).toHaveLength(1);
    expect(draft.result.values.sections[0].ingredients).toEqual([]);
    expect(draft.result.values.sections[0].instructions).toEqual([]);
  });

  it("picks the most recent version for a versionMode ALL export (no version id to correlate by)", () => {
    const result = normalizeDishExportJson(
      dishExportJson({
        versions: [
          {
            title: "Weeknight Tacos v1",
            sections: [
              {
                ingredients: [{ name: "Old ingredient" }],
                instructions: [],
              },
            ],
          },
          {
            title: "Weeknight Tacos v2",
            sections: [
              {
                ingredients: [{ name: "New ingredient" }],
                instructions: [],
              },
            ],
          },
        ],
      }),
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.result.values.title).toBe("Weeknight Tacos v2");
    expect(draft.result.values.sections[0].ingredients[0].name).toBe(
      "New ingredient",
    );
  });

  // Follow-up: linked Parts reference another Dish/Version by id — not
  // safely restorable without live account validation, so they're dropped,
  // but the draft must still report how many were dropped so the review UI
  // can surface that loss before the user commits the import.
  it("counts dropped linked Parts (top-level and Section-nested) without restoring them", () => {
    const result = normalizeDishExportJson(
      dishExportJson({
        versions: [
          {
            title: "Weeknight Tacos",
            sections: [
              {
                ingredients: [{ name: "Ground beef" }],
                instructions: [],
                linkedParts: [
                  { targetDishId: "part-1", targetDishVersionId: "v1" },
                ],
              },
            ],
            topLevelLinkedParts: [
              { targetDishId: "part-2", targetDishVersionId: "v1" },
              { targetDishId: "part-3", targetDishVersionId: "v1" },
            ],
          },
        ],
      }),
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.droppedLinkedPartsCount).toBe(3);
    // Never restored as a real partLink, regardless of the dropped count.
    expect(draft.result.values.sections[0].partLinks).toEqual([]);
    expect(draft.result.values.partLinks).toEqual([]);
  });
});
