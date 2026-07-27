import { Prisma } from "@/generated/prisma/client";
import type {
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import { normalizeDifficultyValue } from "@/lib/dishes/schema";
import type { DishContentInput, StageValue } from "@/lib/dishes/schema";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionContentToInput } from "@/lib/dishes/mappers";

// Deliberately not a "use client" module: Server Component edit pages call
// `dishToFormValues` directly (a Client Component's exports cannot be
// invoked from a Server Component, even for a plain, side-effect-free
// function), while `dish-editor.tsx` (itself "use client") re-exports
// these for any client-side callers.
export type DishFormValues = DishContentInput;

// Any single Version's full content — the current Version (Slice 3) or,
// as of Slice 4, an arbitrary historical Version loaded as the editor's
// base (PRODUCT_SPEC.md §13.4/§13.7).
type VersionDetail = Prisma.DishVersionGetPayload<{
  include: {
    sections: typeof sectionContentInclude;
    partLinks: typeof partLinkContentInclude;
  };
}>;

/**
 * Maps a loaded Version's content into the editor's form shape, preserving
 * each row's `lineageId` so `editDish` carries lineage identity forward for
 * unchanged content (ARCHITECTURE_PROPOSAL.md §D.-1) instead of treating
 * every row as brand new on every edit. Stage/cuisine/title all come from
 * the Dish, not the loaded Version (§13.9 / Version-trigger correction pass
 * §7.1 — they belong to the stable Dish, so they're always the Dish's
 * *current* stable values regardless of which historical Version's content
 * is loaded here). `version.title` is only a fallback for the rare case a
 * pre-correction Dish somehow has no `currentTitle` yet.
 */
export function dishToFormValues(input: {
  stage: StageValue;
  cuisine: string | null;
  currentTitle: string | null;
  version: VersionDetail;
}): DishFormValues {
  const { stage, cuisine, currentTitle, version } = input;
  // Slice 6: one shared mapping (also used by `editDish`'s content-diffing,
  // duplication, and promotion, and the Version-comparison route) — the
  // editor's loaded Sections and top-level linked Parts must never drift
  // from what the server treats as this Version's own content.
  const { sections, partLinks } = versionContentToInput(
    version.sections,
    version.partLinks,
  );

  return {
    title: currentTitle || version.title,
    stage,
    cuisine,
    description: version.description,
    yieldQuantity: decimalToNumber(version.yieldQuantity),
    yieldUnit: version.yieldUnit,
    prepTimeMinutes: version.prepTimeMinutes,
    cookTimeMinutes: version.cookTimeMinutes,
    // Gate 2 final correction pass: maps a Dish saved under the retired
    // Easy/Medium/Hard set forward to Easy/Moderate/Challenging so it
    // still loads with a matching Select option.
    difficulty: normalizeDifficultyValue(version.difficulty),
    // Slice 5, PRODUCT_SPEC.md §12.2: loading any Version's own
    // `imageAssetId` as the form's starting value is exactly how "a new
    // Version inherits the current Version's image by default" is
    // satisfied — an untouched form re-saves the same id unchanged.
    imageAssetId: version.imageAssetId,
    sections,
    partLinks,
  };
}

export function blankDishFormValues(): DishFormValues {
  return {
    title: "",
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: null,
        guidanceNote: null,
        ingredients: [],
        instructions: [],
        partLinks: [],
      },
    ],
    partLinks: [],
  };
}
