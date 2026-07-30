import { describe, it, expect } from "vitest";
import {
  compareDishVersions,
  pickDefaultComparisonPair,
  type ComparisonVersionRef,
  type VersionCompareInput,
} from "@/lib/dishes/compare";
import type {
  IngredientInput,
  InstructionInput,
  PartLinkInput,
  SectionInput,
} from "@/lib/dishes/schema";

function ingredient(overrides: Partial<IngredientInput> = {}): IngredientInput {
  return {
    lineageId: "ing-1",
    name: "Rice vinegar",
    quantity: 4,
    quantityEnd: null,
    isApproximate: false,
    unit: "tbsp",
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
    ...overrides,
  };
}

function instruction(
  overrides: Partial<InstructionInput> = {},
): InstructionInput {
  return {
    lineageId: "step-1",
    text: "Whisk everything together.",
    ...overrides,
  };
}

function section(overrides: Partial<SectionInput> = {}): SectionInput {
  return {
    lineageId: "section-1",
    name: null,
    guidanceNote: null,
    ingredients: [],
    instructions: [],
    partLinks: [],
    position: 0,
    ...overrides,
  };
}

function partLink(overrides: Partial<PartLinkInput> = {}): PartLinkInput {
  return {
    lineageId: "link-1",
    targetDishId: "part-1",
    targetDishVersionId: "part-1-v1",
    position: 0,
    multiplier: 1,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<VersionCompareInput> = {},
): VersionCompareInput {
  return {
    metadata: {
      description: null,
      yieldQuantity: 4,
      yieldUnit: "servings",
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      difficulty: "Easy",
    },
    nutrition: { calories: null, protein: null, carbs: null, fat: null },
    sections: [],
    partLinks: [],
    materializedPartLinks: [],
    ...overrides,
  };
}

describe("compareDishVersions", () => {
  it("reports no changes for two identical snapshots", () => {
    const s = snapshot({
      sections: [section({ ingredients: [ingredient()] })],
    });
    const result = compareDishVersions(s, s);
    expect(result.hasChanges).toBe(false);
    expect(result.metadata).toEqual([]);
    expect(result.ingredients).toEqual({
      added: [],
      removed: [],
      changed: [],
      reordered: false,
    });
  });

  // Slice 4 correction pass §3: a pure lineage-preserved reorder is a real
  // difference (reported via `reordered`), but must never be conflated with
  // a content "change", and incidental index shifting caused by an
  // unrelated addition/removal elsewhere must never be misreported as one.
  it("reports a pure ingredient reorder via `reordered`, not as a false content change", () => {
    const before = snapshot({
      sections: [
        section({
          ingredients: [
            ingredient({ lineageId: "a", name: "Rice" }),
            ingredient({ lineageId: "b", name: "Chicken" }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const after = snapshot({
      sections: [
        section({
          // Same three ingredients, Rice and Chicken swapped, same content.
          ingredients: [
            ingredient({ lineageId: "b", name: "Chicken" }),
            ingredient({ lineageId: "a", name: "Rice" }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.changed).toEqual([]);
    expect(result.ingredients.added).toEqual([]);
    expect(result.ingredients.removed).toEqual([]);
    expect(result.ingredients.reordered).toBe(true);
    expect(result.hasChanges).toBe(true);
  });

  it("does not report a reorder when an insertion merely shifts indexes", () => {
    const before = snapshot({
      sections: [
        section({
          ingredients: [
            ingredient({ lineageId: "a", name: "Rice" }),
            ingredient({ lineageId: "b", name: "Chicken" }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const after = snapshot({
      sections: [
        section({
          // A new ingredient inserted at the front shifts every existing
          // ingredient's absolute index, but their relative order is
          // unchanged — this must not be reported as a reorder.
          ingredients: [
            ingredient({ lineageId: "d", name: "Salt" }),
            ingredient({ lineageId: "a", name: "Rice" }),
            ingredient({ lineageId: "b", name: "Chicken" }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.added).toEqual([
      { lineageId: "d", label: "4 tbsp Salt" },
    ]);
    expect(result.ingredients.removed).toEqual([]);
    expect(result.ingredients.changed).toEqual([]);
    expect(result.ingredients.reordered).toBe(false);
  });

  it("does not report a reorder when a removal merely shifts indexes", () => {
    const before = snapshot({
      sections: [
        section({
          ingredients: [
            ingredient({ lineageId: "a", name: "Rice" }),
            ingredient({ lineageId: "b", name: "Chicken" }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const after = snapshot({
      sections: [
        section({
          // Chicken removed — Rice and Scallions shift index, but their
          // relative order to each other is unchanged.
          ingredients: [
            ingredient({ lineageId: "a", name: "Rice" }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.removed).toEqual([
      { lineageId: "b", label: "4 tbsp Chicken" },
    ]);
    expect(result.ingredients.added).toEqual([]);
    expect(result.ingredients.changed).toEqual([]);
    expect(result.ingredients.reordered).toBe(false);
  });

  it("reports both a reorder and a content edit when both occur", () => {
    const before = snapshot({
      sections: [
        section({
          ingredients: [
            ingredient({ lineageId: "a", name: "Rice", quantity: 1 }),
            ingredient({ lineageId: "b", name: "Chicken" }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const after = snapshot({
      sections: [
        section({
          ingredients: [
            ingredient({ lineageId: "b", name: "Chicken" }),
            ingredient({ lineageId: "a", name: "Rice", quantity: 2 }),
            ingredient({ lineageId: "c", name: "Scallions" }),
          ],
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.reordered).toBe(true);
    expect(result.ingredients.changed).toHaveLength(1);
    expect(result.ingredients.changed[0].lineageId).toBe("a");
  });

  it("reports a lineageId absent from the new Version as a removal, not a silent disappearance", () => {
    const before = snapshot({
      sections: [
        section({
          ingredients: [ingredient({ lineageId: "a", name: "Salt" })],
        }),
      ],
    });
    const after = snapshot({ sections: [section({ ingredients: [] })] });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.removed).toHaveLength(1);
    expect(result.ingredients.removed[0].lineageId).toBe("a");
    expect(result.ingredients.added).toEqual([]);
    expect(result.ingredients.changed).toEqual([]);
  });

  it("reports a lineageId with no predecessor as an addition, never a changed row", () => {
    const before = snapshot({ sections: [section({ ingredients: [] })] });
    const after = snapshot({
      sections: [
        section({
          ingredients: [ingredient({ lineageId: "a", name: "Salt" })],
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.added).toHaveLength(1);
    expect(result.ingredients.added[0].lineageId).toBe("a");
    expect(result.ingredients.removed).toEqual([]);
    expect(result.ingredients.changed).toEqual([]);
  });

  it("reports a changed quantity as a changed row with formatted before/after text", () => {
    const before = snapshot({
      sections: [section({ ingredients: [ingredient({ quantity: 4 })] })],
    });
    const after = snapshot({
      sections: [section({ ingredients: [ingredient({ quantity: 3 })] })],
    });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.changed).toEqual([
      {
        lineageId: "ing-1",
        name: "Rice vinegar",
        before: "4 tbsp Rice vinegar",
        after: "3 tbsp Rice vinegar",
      },
    ]);
  });

  it("distinguishes a genuine edit from an ingredient that only moved sections", () => {
    const before = snapshot({
      sections: [
        section({
          lineageId: "s1",
          name: "Sauce",
          ingredients: [ingredient()],
        }),
        section({ lineageId: "s2", name: "Rice", ingredients: [] }),
      ],
    });
    const after = snapshot({
      sections: [
        section({ lineageId: "s1", name: "Sauce", ingredients: [] }),
        section({ lineageId: "s2", name: "Rice", ingredients: [ingredient()] }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.ingredients.changed).toHaveLength(1);
    expect(result.ingredients.changed[0].before).toContain("in Sauce");
    expect(result.ingredients.changed[0].after).toContain("in Rice");
  });

  it("reports Section additions, removals, and reordering", () => {
    const before = snapshot({
      sections: [
        section({ lineageId: "s1", name: "Sauce" }),
        section({ lineageId: "s2", name: "Rice" }),
      ],
    });
    const after = snapshot({
      sections: [
        section({ lineageId: "s2", name: "Rice" }),
        section({ lineageId: "s3", name: "Vegetables" }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.sections.removed).toEqual([
      { lineageId: "s1", label: "Sauce" },
    ]);
    expect(result.sections.added).toEqual([
      { lineageId: "s3", label: "Vegetables" },
    ]);
    // Only one Section (s2) survives in both — a single surviving item can't
    // be "reordered" relative to itself.
    expect(result.sections.reordered).toBe(false);
  });

  it("reports Instruction additions, removals, changes, and reordering", () => {
    const before = snapshot({
      sections: [
        section({
          instructions: [
            instruction({ lineageId: "i1", text: "Boil water." }),
            instruction({ lineageId: "i2", text: "Add rice." }),
          ],
        }),
      ],
    });
    const after = snapshot({
      sections: [
        section({
          instructions: [
            instruction({ lineageId: "i2", text: "Add rice." }),
            instruction({ lineageId: "i1", text: "Boil salted water." }),
            instruction({ lineageId: "i3", text: "Simmer 15 minutes." }),
          ],
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.instructions.changed).toEqual([
      { lineageId: "i1", before: "Boil water.", after: "Boil salted water." },
    ]);
    expect(result.instructions.added).toEqual([
      { lineageId: "i3", label: "Simmer 15 minutes." },
    ]);
    expect(result.instructions.removed).toEqual([]);
    expect(result.instructions.reordered).toBe(true);
  });

  it("reports metadata field changes with human-readable before/after text", () => {
    const before = snapshot();
    const after = snapshot({
      metadata: {
        ...before.metadata,
        description: "Weeknight-friendly version.",
        yieldQuantity: 6,
      },
    });
    const result = compareDishVersions(before, after);
    expect(result.metadata).toEqual([
      {
        field: "description",
        label: "Description",
        before: null,
        after: "Weeknight-friendly version.",
      },
      {
        field: "yield",
        label: "Yield",
        before: "4 servings",
        after: "6 servings",
      },
    ]);
  });

  // Version-trigger and Slice 5 image correction pass §3: image is
  // Version-associated but mutable metadata (editable in place after a
  // Version is saved), not material recipe content — comparison must not
  // report it, unlike description (which stays included).
  it("does not include title or image in VersionMetadataSnapshot at all — nothing to accidentally diff", () => {
    const before = snapshot();
    const after = snapshot();
    const keys = Object.keys(before.metadata);
    expect(keys).not.toContain("title");
    expect(keys).not.toContain("imageAssetId");
    const result = compareDishVersions(before, after);
    expect(result.metadata).toEqual([]);
  });

  // Slice 6 post-gate, PRODUCT_SPEC.md §67-70: linked Parts (top-level and
  // Section-nested) compare the same way ingredients/instructions do —
  // matched by lineageId, spanning both `partLinks` and `section.partLinks`.
  it("reports a PartLink present only in after as added", () => {
    const before = snapshot({ partLinks: [] });
    const after = snapshot({ partLinks: [partLink({ lineageId: "link-1" })] });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.added).toEqual([
      {
        lineageId: "link-1",
        targetDishId: "part-1",
        targetDishVersionId: "part-1-v1",
        multiplier: 1,
      },
    ]);
  });

  it("reports a PartLink present only in before as removed", () => {
    const before = snapshot({ partLinks: [partLink({ lineageId: "link-1" })] });
    const after = snapshot({ partLinks: [] });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.removed).toEqual([
      {
        lineageId: "link-1",
        targetDishId: "part-1",
        targetDishVersionId: "part-1-v1",
        multiplier: 1,
      },
    ]);
  });

  it("reports a retargeted PartLink (same Part, different Version) as changed", () => {
    const before = snapshot({
      partLinks: [
        partLink({ lineageId: "link-1", targetDishVersionId: "part-1-v1" }),
      ],
    });
    const after = snapshot({
      partLinks: [
        partLink({ lineageId: "link-1", targetDishVersionId: "part-1-v2" }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.changed).toHaveLength(1);
    expect(result.partLinks.changed[0].lineageId).toBe("link-1");
    expect(result.partLinks.changed[0].retargeted).toBe(true);
    expect(result.partLinks.changed[0].multiplierChanged).toBe(false);
  });

  it("reports a PartLink retargeted to an entirely different Part as changed", () => {
    const before = snapshot({
      partLinks: [partLink({ lineageId: "link-1", targetDishId: "part-1" })],
    });
    const after = snapshot({
      partLinks: [
        partLink({
          lineageId: "link-1",
          targetDishId: "part-2",
          targetDishVersionId: "part-2-v1",
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.changed).toHaveLength(1);
    expect(result.partLinks.changed[0].retargeted).toBe(true);
  });

  it("reports a multiplier-only change as changed, with multiplierChanged true and retargeted false", () => {
    const before = snapshot({
      partLinks: [partLink({ lineageId: "link-1", multiplier: 1 })],
    });
    const after = snapshot({
      partLinks: [partLink({ lineageId: "link-1", multiplier: 2 })],
    });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.changed).toHaveLength(1);
    expect(result.partLinks.changed[0].retargeted).toBe(false);
    expect(result.partLinks.changed[0].multiplierChanged).toBe(true);
  });

  it("does not report a change for an unchanged PartLink (no false positive)", () => {
    const before = snapshot({ partLinks: [partLink({ lineageId: "link-1" })] });
    const after = snapshot({ partLinks: [partLink({ lineageId: "link-1" })] });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.added).toEqual([]);
    expect(result.partLinks.removed).toEqual([]);
    expect(result.partLinks.changed).toEqual([]);
    expect(result.partLinks.reordered).toBe(false);
  });

  it("reports a PartLink reorder via `reordered`", () => {
    const before = snapshot({
      partLinks: [
        partLink({ lineageId: "link-1", targetDishId: "part-1" }),
        partLink({
          lineageId: "link-2",
          targetDishId: "part-2",
          targetDishVersionId: "part-2-v1",
        }),
      ],
    });
    const after = snapshot({
      partLinks: [
        partLink({
          lineageId: "link-2",
          targetDishId: "part-2",
          targetDishVersionId: "part-2-v1",
        }),
        partLink({ lineageId: "link-1", targetDishId: "part-1" }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.changed).toEqual([]);
    expect(result.partLinks.reordered).toBe(true);
  });

  // Design remediation pass, §H: a historical Version's own PartLink row
  // may have been materialized since it was saved (its target Part
  // deleted) — carried on `materializedPartLinks`, additive to the
  // LIVE-only `partLinks`/`section.partLinks`. It must still be visible to
  // comparison, using its preserved former identity, never silently
  // dropped and never "Unknown Part".
  it("reports a materialized (deleted-Part) occurrence present only in before as removed, using its preserved identity", () => {
    const before = snapshot({
      partLinks: [],
      materializedPartLinks: [
        {
          lineageId: "link-1",
          multiplier: 1,
          materializedTitle: "Nuoc Cham",
          materializedVersionLabel: "V1.0",
        },
      ],
    });
    const after = snapshot({ partLinks: [], materializedPartLinks: [] });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.removed).toEqual([
      {
        lineageId: "link-1",
        targetDishId: null,
        targetDishVersionId: null,
        multiplier: 1,
        materializedTitle: "Nuoc Cham",
        materializedVersionLabel: "V1.0",
      },
    ]);
  });

  it("does not report a change for the same materialized occurrence on both sides", () => {
    const materialized = {
      lineageId: "link-1",
      multiplier: 1,
      materializedTitle: "Nuoc Cham",
      materializedVersionLabel: "V1.0",
    };
    const before = snapshot({ materializedPartLinks: [materialized] });
    const after = snapshot({ materializedPartLinks: [materialized] });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.added).toEqual([]);
    expect(result.partLinks.removed).toEqual([]);
    expect(result.partLinks.changed).toEqual([]);
  });

  it("detects a Section-nested PartLink the same way as a top-level one", () => {
    const before = snapshot({
      sections: [
        section({
          partLinks: [partLink({ lineageId: "link-1", multiplier: 1 })],
        }),
      ],
    });
    const after = snapshot({
      sections: [
        section({
          partLinks: [partLink({ lineageId: "link-1", multiplier: 2 })],
        }),
      ],
    });
    const result = compareDishVersions(before, after);
    expect(result.partLinks.changed).toHaveLength(1);
    expect(result.partLinks.changed[0].multiplierChanged).toBe(true);
  });

  it("sets hasChanges true when only a partLinks-group change exists", () => {
    const before = snapshot({ partLinks: [] });
    const after = snapshot({ partLinks: [partLink({ lineageId: "link-1" })] });
    const result = compareDishVersions(before, after);
    expect(result.hasChanges).toBe(true);
    expect(result.metadata).toEqual([]);
    expect(result.nutrition).toEqual([]);
    expect(result.sections).toEqual({
      added: [],
      removed: [],
      reordered: false,
    });
    expect(result.ingredients).toEqual({
      added: [],
      removed: [],
      changed: [],
      reordered: false,
    });
    expect(result.instructions).toEqual({
      added: [],
      removed: [],
      changed: [],
      reordered: false,
    });
  });
});

function ref(
  id: string,
  sourceVersionId: string | null = null,
): ComparisonVersionRef {
  return { id, sourceVersionId };
}

describe("pickDefaultComparisonPair", () => {
  it("defaults to the current Version's recorded source when it has one", () => {
    const versions = [
      ref("v1"),
      ref("v1.4", "v1"), // a non-sequential minor branch
      ref("v2", "v1.4"), // a major revived from that branch
    ];
    const result = pickDefaultComparisonPair(versions, "v2");
    expect(result).toEqual({ fromId: "v1.4", toId: "v2" });
  });

  it("falls back to the immediately preceding Version when the current Version has no source", () => {
    const versions = [ref("v1"), ref("v1.1"), ref("v1.2")];
    const result = pickDefaultComparisonPair(versions, "v1.2");
    expect(result).toEqual({ fromId: "v1.1", toId: "v1.2" });
  });

  it("falls back safely when the recorded source doesn't resolve against this list", () => {
    const versions = [ref("v1"), ref("v1.1"), ref("v2", "missing-id")];
    const result = pickDefaultComparisonPair(versions, "v2");
    expect(result).toEqual({ fromId: "v1.1", toId: "v2" });
  });

  it("defaults to the highest Version when there is no current pointer", () => {
    const versions = [ref("v1"), ref("v1.1")];
    const result = pickDefaultComparisonPair(versions, null);
    expect(result).toEqual({ fromId: "v1", toId: "v1.1" });
  });
});
