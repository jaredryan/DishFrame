import { describe, expect, it } from "vitest";
import {
  removeEmptySections,
  hasMinimumContent,
  isBlankSubstitute,
  ingredientInputSchema,
  diffVersionContent,
  normalizeDifficultyValue,
  type SectionInput,
  type PartLinkInput,
  type VersionContentInput,
} from "@/lib/dishes/schema";

function section(overrides: Partial<SectionInput> = {}): SectionInput {
  return {
    name: null,
    guidanceNote: null,
    ingredients: [],
    instructions: [],
    partLinks: [],
    ...overrides,
  };
}

function ingredient(name = "Salt") {
  return {
    name,
    quantity: null,
    quantityEnd: null,
    isApproximate: false,
    unit: null,
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
  };
}

function instruction(text = "Stir.") {
  return { text };
}

function partLink(overrides: Partial<PartLinkInput> = {}): PartLinkInput {
  return {
    targetDishId: "part-1",
    targetDishVersionId: "part-1-v1",
    ...overrides,
  };
}

// diffVersionContent takes the whole proposed content (Sections + top-level
// linked Parts) on each side — this wraps a bare Sections array with no
// top-level links, the common case most of these tests exercise.
function content(
  sections: SectionInput[],
  partLinks: PartLinkInput[] = [],
): VersionContentInput {
  return { sections, partLinks };
}

describe("removeEmptySections", () => {
  it("drops a Section with no ingredients and no instructions", () => {
    const sections = [
      section({ name: "Sauce", ingredients: [ingredient()] }),
      section({ name: "Empty" }),
    ];

    const result = removeEmptySections(sections);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sauce");
  });

  it("keeps a Section that has only an instruction and no ingredients", () => {
    const sections = [section({ instructions: [instruction()] })];

    expect(removeEmptySections(sections)).toHaveLength(1);
  });

  it("returns an empty array when every Section is empty", () => {
    expect(removeEmptySections([section(), section()])).toEqual([]);
  });

  it("keeps a Section that has only a linked Part (Slice 6, §67.1)", () => {
    const sections = [section({ partLinks: [partLink()] })];
    expect(removeEmptySections(sections)).toHaveLength(1);
  });
});

describe("isBlankSubstitute", () => {
  it("is false for null/undefined (no substitute present at all, not an empty one)", () => {
    expect(isBlankSubstitute(null)).toBe(false);
    expect(isBlankSubstitute(undefined)).toBe(false);
  });

  it("is true for a substitute with every field empty/default", () => {
    expect(
      isBlankSubstitute({
        name: "",
        quantity: null,
        quantityEnd: null,
        isApproximate: false,
        unit: null,
        displayText: null,
        preparationNote: null,
      }),
    ).toBe(true);
  });

  it("is true when only whitespace was typed into text fields", () => {
    expect(
      isBlankSubstitute({
        name: "   ",
        quantity: null,
        quantityEnd: null,
        isApproximate: false,
        unit: "  ",
        displayText: null,
        preparationNote: null,
      }),
    ).toBe(true);
  });

  it("is false when a name is present", () => {
    expect(
      isBlankSubstitute({
        name: "Honey",
        quantity: null,
        quantityEnd: null,
        isApproximate: false,
        unit: null,
        displayText: null,
        preparationNote: null,
      }),
    ).toBe(false);
  });

  it("is false when any other field is set, even with no name", () => {
    expect(
      isBlankSubstitute({
        name: "",
        quantity: 1,
        quantityEnd: null,
        isApproximate: false,
        unit: null,
        displayText: null,
        preparationNote: null,
      }),
    ).toBe(false);
    expect(
      isBlankSubstitute({
        name: "",
        quantity: null,
        quantityEnd: null,
        isApproximate: true,
        unit: null,
        displayText: null,
        preparationNote: null,
      }),
    ).toBe(false);
  });
});

describe("ingredientInputSchema's substitute preprocessing", () => {
  function ingredientPayload(substitute: unknown) {
    return {
      name: "Soy sauce",
      quantity: null,
      quantityEnd: null,
      isApproximate: false,
      unit: null,
      displayText: null,
      preparationNote: null,
      isOptional: false,
      substitute,
    };
  }

  it("strips a fully-blank substitute to null instead of failing validation", () => {
    const parsed = ingredientInputSchema.parse(
      ingredientPayload({
        name: "",
        quantity: null,
        quantityEnd: null,
        isApproximate: false,
        unit: null,
        displayText: null,
        preparationNote: null,
      }),
    );
    expect(parsed.substitute).toBeNull();
  });

  it("rejects a partially completed substitute (no name) with a clear message", () => {
    expect(() =>
      ingredientInputSchema.parse(
        ingredientPayload({
          name: "",
          quantity: null,
          quantityEnd: null,
          isApproximate: false,
          unit: "tbsp",
          displayText: null,
          preparationNote: null,
        }),
      ),
    ).toThrow(/Enter a name for the substitute\./);
  });

  it("keeps a fully completed substitute", () => {
    const parsed = ingredientInputSchema.parse(
      ingredientPayload({
        name: "Tamari",
        quantity: 1,
        quantityEnd: null,
        isApproximate: false,
        unit: "tbsp",
        displayText: null,
        preparationNote: null,
      }),
    );
    expect(parsed.substitute).toMatchObject({ name: "Tamari" });
  });
});

describe("hasMinimumContent", () => {
  it("is true when at least one Section has an ingredient", () => {
    const sections = [section({ ingredients: [ingredient()] })];
    expect(hasMinimumContent(sections)).toBe(true);
  });

  it("is true when at least one Section has an instruction", () => {
    const sections = [section({ instructions: [instruction()] })];
    expect(hasMinimumContent(sections)).toBe(true);
  });

  it("is true when a Section has only a linked Part (Slice 6)", () => {
    const sections = [section({ partLinks: [partLink()] })];
    expect(hasMinimumContent(sections)).toBe(true);
  });

  it("is true for a top-level linked Part with no local Section content (Slice 6, §67.1)", () => {
    expect(hasMinimumContent([section()], [partLink()])).toBe(true);
  });

  it("is false for a single unnamed empty default Section", () => {
    expect(hasMinimumContent([section()])).toBe(false);
  });

  it("is false for no Sections at all", () => {
    expect(hasMinimumContent([])).toBe(false);
  });
});

// Final Gate 2 correction pass: Section/Ingredient/Instruction reordering
// moved from Move up/down buttons to drag-and-drop, but both mechanisms
// produce the exact same result — a reordered array, rows matched by
// `lineageId` — so `diffVersionContent`'s classification rule (settled in
// docs/SLICE_3.md's Gate 2 pass) needs no change and is still the right
// thing to test directly, without simulating a drag gesture.
describe("diffVersionContent after a reorder (drag or otherwise)", () => {
  it("classifies a same-Section Ingredient reorder as a cooking change", () => {
    const base: SectionInput[] = [
      {
        lineageId: "section-1",
        name: null,
        guidanceNote: null,
        partLinks: [],
        ingredients: [
          { lineageId: "ing-1", ...ingredient("Salt") },
          { lineageId: "ing-2", ...ingredient("Pepper") },
        ],
        instructions: [],
      },
    ];
    // The two Ingredients swapped positions — same rows, same content,
    // different order (exactly what dragging Pepper above Salt produces).
    const edited: SectionInput[] = [
      {
        lineageId: "section-1",
        name: null,
        guidanceNote: null,
        partLinks: [],
        ingredients: [
          { lineageId: "ing-2", ...ingredient("Pepper") },
          { lineageId: "ing-1", ...ingredient("Salt") },
        ],
        instructions: [],
      },
    ];

    const { cookingChanged, sectionOrganizationChanged } = diffVersionContent(
      content(base),
      content(edited),
    );
    expect(cookingChanged).toBe(true);
    expect(sectionOrganizationChanged).toBe(false);
  });

  it("classifies a same-Section Instruction reorder as a cooking change", () => {
    const base: SectionInput[] = [
      {
        lineageId: "section-1",
        name: null,
        guidanceNote: null,
        partLinks: [],
        ingredients: [{ lineageId: "ing-1", ...ingredient("Salt") }],
        instructions: [
          { lineageId: "step-1", ...instruction("Boil water.") },
          { lineageId: "step-2", ...instruction("Add salt.") },
        ],
      },
    ];
    const edited: SectionInput[] = [
      {
        lineageId: "section-1",
        name: null,
        guidanceNote: null,
        partLinks: [],
        ingredients: [{ lineageId: "ing-1", ...ingredient("Salt") }],
        instructions: [
          { lineageId: "step-2", ...instruction("Add salt.") },
          { lineageId: "step-1", ...instruction("Boil water.") },
        ],
      },
    ];

    const { cookingChanged } = diffVersionContent(
      content(base),
      content(edited),
    );
    expect(cookingChanged).toBe(true);
  });

  it("classifies a Section-only reorder (Ingredient/Instruction content and position within their Section untouched) as automatic-refinement, not a cooking change", () => {
    const base: SectionInput[] = [
      {
        lineageId: "section-1",
        name: "Sauce",
        guidanceNote: null,
        partLinks: [],
        ingredients: [{ lineageId: "ing-1", ...ingredient("Soy sauce") }],
        instructions: [],
      },
      {
        lineageId: "section-2",
        name: "Rice",
        guidanceNote: null,
        partLinks: [],
        ingredients: [{ lineageId: "ing-2", ...ingredient("Rice") }],
        instructions: [],
      },
    ];
    // The two Sections swapped positions; each Section's own Ingredient
    // content and position within it is untouched.
    const edited: SectionInput[] = [
      {
        lineageId: "section-2",
        name: "Rice",
        guidanceNote: null,
        partLinks: [],
        ingredients: [{ lineageId: "ing-2", ...ingredient("Rice") }],
        instructions: [],
      },
      {
        lineageId: "section-1",
        name: "Sauce",
        guidanceNote: null,
        partLinks: [],
        ingredients: [{ lineageId: "ing-1", ...ingredient("Soy sauce") }],
        instructions: [],
      },
    ];

    const { cookingChanged, sectionOrganizationChanged } = diffVersionContent(
      content(base),
      content(edited),
    );
    expect(cookingChanged).toBe(false);
    expect(sectionOrganizationChanged).toBe(true);
  });
});

// Slice 6, PRODUCT_SPEC.md §67-70: a linked Part is exactly as
// "cooking-adjacent" as an Ingredient/Instruction — attaching, detaching,
// re-targeting, or moving one is a genuine content change, not automatic
// Section organization.
describe("diffVersionContent with linked Parts", () => {
  it("classifies a newly attached top-level Part as a cooking change", () => {
    const result = diffVersionContent(
      content([section()], []),
      content([section()], [partLink()]),
    );
    expect(result.cookingChanged).toBe(true);
  });

  it("classifies a detached (removed) linked Part as a cooking change", () => {
    const result = diffVersionContent(
      content([section()], [{ lineageId: "link-1", ...partLink() }]),
      content([section()], []),
    );
    expect(result.cookingChanged).toBe(true);
  });

  it("classifies choosing a different target Version for the same occurrence as a cooking change", () => {
    const result = diffVersionContent(
      content(
        [section()],
        [
          {
            lineageId: "link-1",
            ...partLink({ targetDishVersionId: "part-1-v1" }),
          },
        ],
      ),
      content(
        [section()],
        [
          {
            lineageId: "link-1",
            ...partLink({ targetDishVersionId: "part-1-v2" }),
          },
        ],
      ),
    );
    expect(result.cookingChanged).toBe(true);
  });

  it("classifies moving an occurrence from top-level into a Section as a cooking change", () => {
    const result = diffVersionContent(
      content(
        [section({ lineageId: "section-1" })],
        [{ lineageId: "link-1", ...partLink() }],
      ),
      content(
        [
          section({
            lineageId: "section-1",
            partLinks: [{ lineageId: "link-1", ...partLink() }],
          }),
        ],
        [],
      ),
    );
    expect(result.cookingChanged).toBe(true);
  });

  it("does not report a change when an unchanged linked Part survives untouched", () => {
    const unchanged = content(
      [section()],
      [{ lineageId: "link-1", ...partLink() }],
    );
    const result = diffVersionContent(unchanged, unchanged);
    expect(result.cookingChanged).toBe(false);
  });

  it("does not misclassify an unrelated Section rename as a cooking change merely because a linked Part is also present (§O-style false-positive check)", () => {
    const base = content([
      section({
        lineageId: "section-1",
        name: "Marinade",
        partLinks: [{ lineageId: "link-1", ...partLink() }],
      }),
    ]);
    const edited = content([
      section({
        lineageId: "section-1",
        name: "Marinade (updated)",
        partLinks: [{ lineageId: "link-1", ...partLink() }],
      }),
    ]);
    const result = diffVersionContent(base, edited);
    expect(result.cookingChanged).toBe(false);
    expect(result.sectionOrganizationChanged).toBe(true);
  });
});

describe("normalizeDifficultyValue", () => {
  it("maps the retired Medium/Hard values forward to Moderate/Challenging", () => {
    expect(normalizeDifficultyValue("Medium")).toBe("Moderate");
    expect(normalizeDifficultyValue("Hard")).toBe("Challenging");
  });

  it("leaves an already-current value unchanged", () => {
    expect(normalizeDifficultyValue("Easy")).toBe("Easy");
    expect(normalizeDifficultyValue("Moderate")).toBe("Moderate");
    expect(normalizeDifficultyValue("Challenging")).toBe("Challenging");
  });

  it("passes through an arbitrary older free-text value unchanged", () => {
    expect(normalizeDifficultyValue("Pretty involved")).toBe("Pretty involved");
  });

  it("returns null for null/undefined/empty", () => {
    expect(normalizeDifficultyValue(null)).toBeNull();
    expect(normalizeDifficultyValue(undefined)).toBeNull();
    expect(normalizeDifficultyValue("")).toBeNull();
  });
});
