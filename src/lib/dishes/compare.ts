import {
  ingredientContentSignature,
  instructionContentSignature,
  type IngredientInput,
  type SectionInput,
} from "@/lib/dishes/schema";
import { formatIngredientLine } from "@/lib/dishes/format";

/**
 * Pure, framework- and DB-agnostic Version comparison
 * (ARCHITECTURE_PROPOSAL.md §F.7 — "computed on demand by diffing two
 * DishVersion rows at read time, no comparison-specific storage"; both
 * sides are immutable, so this is a pure, cacheable read function). Rows
 * are matched by `lineageId`, never by content similarity
 * (ARCHITECTURE_PROPOSAL.md §D.-1): a row present in both sides is a
 * genuine edit only if its content signature (or owning Section) actually
 * differs — a pure position/order change is reported separately, never as
 * a false content "change". A row with no match in `before` is always an
 * addition; a `before` row absent from `after` is always a removal.
 *
 * No linked-Parts group exists here (BUILD_PLAN.md's Slice 4 note):
 * `PartLink` isn't wired up until Slice 6, so there is nothing to diff yet
 * — this file intentionally has no placeholder for it.
 */

export type VersionMetadataSnapshot = {
  title: string;
  description: string | null;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: string | null;
  imageAssetId: string | null;
};

export type VersionNutritionSnapshot = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type VersionCompareInput = {
  metadata: VersionMetadataSnapshot;
  nutrition: VersionNutritionSnapshot;
  sections: SectionInput[];
};

export type FieldChange = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

export type AddedOrRemovedItem = {
  lineageId: string;
  label: string;
};

export type ChangedIngredient = {
  lineageId: string;
  name: string;
  before: string;
  after: string;
};

export type ChangedInstruction = {
  lineageId: string;
  before: string;
  after: string;
};

export type VersionComparisonResult = {
  metadata: FieldChange[];
  sections: {
    added: AddedOrRemovedItem[];
    removed: AddedOrRemovedItem[];
    reordered: boolean;
  };
  ingredients: {
    added: AddedOrRemovedItem[];
    removed: AddedOrRemovedItem[];
    changed: ChangedIngredient[];
    reordered: boolean;
  };
  instructions: {
    added: AddedOrRemovedItem[];
    removed: AddedOrRemovedItem[];
    changed: ChangedInstruction[];
    reordered: boolean;
  };
  nutrition: FieldChange[];
  hasChanges: boolean;
};

function formatYield(
  quantity: number | null,
  unit: string | null,
): string | null {
  if (quantity == null) return null;
  return unit ? `${quantity} ${unit}` : String(quantity);
}

function formatMinutes(value: number | null): string | null {
  return value == null ? null : `${value} min`;
}

function formatNumber(value: number | null): string | null {
  return value == null ? null : String(value);
}

function pushIfChanged(
  changes: FieldChange[],
  field: string,
  label: string,
  before: string | null,
  after: string | null,
) {
  if (before !== after) changes.push({ field, label, before, after });
}

function metadataChanges(
  before: VersionMetadataSnapshot,
  after: VersionMetadataSnapshot,
): FieldChange[] {
  const changes: FieldChange[] = [];
  pushIfChanged(changes, "title", "Title", before.title, after.title);
  pushIfChanged(
    changes,
    "description",
    "Description",
    before.description,
    after.description,
  );
  pushIfChanged(
    changes,
    "yield",
    "Yield",
    formatYield(before.yieldQuantity, before.yieldUnit),
    formatYield(after.yieldQuantity, after.yieldUnit),
  );
  pushIfChanged(
    changes,
    "prepTimeMinutes",
    "Prep time",
    formatMinutes(before.prepTimeMinutes),
    formatMinutes(after.prepTimeMinutes),
  );
  pushIfChanged(
    changes,
    "cookTimeMinutes",
    "Cook time",
    formatMinutes(before.cookTimeMinutes),
    formatMinutes(after.cookTimeMinutes),
  );
  pushIfChanged(
    changes,
    "difficulty",
    "Difficulty",
    before.difficulty,
    after.difficulty,
  );
  pushIfChanged(
    changes,
    "image",
    "Image",
    before.imageAssetId ? "Has an image" : null,
    after.imageAssetId ? "Has an image" : null,
  );
  return changes;
}

function nutritionChanges(
  before: VersionNutritionSnapshot,
  after: VersionNutritionSnapshot,
): FieldChange[] {
  const changes: FieldChange[] = [];
  pushIfChanged(
    changes,
    "calories",
    "Calories",
    formatNumber(before.calories),
    formatNumber(after.calories),
  );
  pushIfChanged(
    changes,
    "protein",
    "Protein",
    formatNumber(before.protein),
    formatNumber(after.protein),
  );
  pushIfChanged(
    changes,
    "carbs",
    "Carbs",
    formatNumber(before.carbs),
    formatNumber(after.carbs),
  );
  pushIfChanged(
    changes,
    "fat",
    "Fat",
    formatNumber(before.fat),
    formatNumber(after.fat),
  );
  return changes;
}

function sectionLabel(section: SectionInput): string {
  return section.name?.trim() || "Unnamed section";
}

function sectionChanges(before: SectionInput[], after: SectionInput[]) {
  const beforeById = new Map(
    before.filter((s) => s.lineageId).map((s) => [s.lineageId as string, s]),
  );
  const afterById = new Map(
    after.filter((s) => s.lineageId).map((s) => [s.lineageId as string, s]),
  );
  const beforeIds = [...beforeById.keys()];
  const afterIds = [...afterById.keys()];

  const added = afterIds
    .filter((id) => !beforeById.has(id))
    .map((id) => ({ lineageId: id, label: sectionLabel(afterById.get(id)!) }));
  const removed = beforeIds
    .filter((id) => !afterById.has(id))
    .map((id) => ({ lineageId: id, label: sectionLabel(beforeById.get(id)!) }));

  return {
    added,
    removed,
    reordered: relativeOrderChanged(beforeIds, afterIds),
  };
}

type FlatIngredient = {
  sectionLineageId: string;
  sectionName: string | null;
  ingredient: IngredientInput;
};

function flattenIngredients(
  sections: SectionInput[],
): Map<string, FlatIngredient> {
  const map = new Map<string, FlatIngredient>();
  for (const section of sections) {
    for (const ingredient of section.ingredients) {
      if (!ingredient.lineageId) continue;
      map.set(ingredient.lineageId, {
        sectionLineageId: section.lineageId ?? "",
        sectionName: section.name ?? null,
        ingredient,
      });
    }
  }
  return map;
}

function describeIngredient(ingredient: IngredientInput): string {
  let line = formatIngredientLine(ingredient);
  if (ingredient.isOptional) line += " (optional)";
  if (ingredient.substitute) {
    line += ` — substitute: ${formatIngredientLine(ingredient.substitute)}`;
  }
  return line;
}

// Slice 4 correction pass §3: reorder is judged by relative order among
// lineage IDs present on *both* sides, not by absolute index — filtering
// each side's key order down to the ids the other side also has turns an
// incidental index shift (from an unrelated addition/removal elsewhere)
// into an identical filtered sequence, while a genuine swap still produces
// two different sequences. The same algorithm already backs
// `sectionChanges`/`instructionChanges`'s `reordered` flag below.
function relativeOrderChanged(beforeOrder: string[], afterOrder: string[]) {
  const beforeSet = new Set(beforeOrder);
  const afterSet = new Set(afterOrder);
  const commonBeforeOrder = beforeOrder.filter((id) => afterSet.has(id));
  const commonAfterOrder = afterOrder.filter((id) => beforeSet.has(id));
  return JSON.stringify(commonBeforeOrder) !== JSON.stringify(commonAfterOrder);
}

function ingredientChanges(before: SectionInput[], after: SectionInput[]) {
  const beforeFlat = flattenIngredients(before);
  const afterFlat = flattenIngredients(after);

  const added: AddedOrRemovedItem[] = [];
  const removed: AddedOrRemovedItem[] = [];
  const changed: ChangedIngredient[] = [];

  for (const [lineageId, entry] of afterFlat) {
    const prior = beforeFlat.get(lineageId);
    if (!prior) {
      added.push({ lineageId, label: describeIngredient(entry.ingredient) });
      continue;
    }
    const movedSection = prior.sectionLineageId !== entry.sectionLineageId;
    const contentChanged =
      ingredientContentSignature(prior.ingredient) !==
      ingredientContentSignature(entry.ingredient);
    if (contentChanged || movedSection) {
      const beforeLabel = movedSection
        ? `${describeIngredient(prior.ingredient)} (in ${prior.sectionName?.trim() || "Unnamed section"})`
        : describeIngredient(prior.ingredient);
      const afterLabel = movedSection
        ? `${describeIngredient(entry.ingredient)} (in ${entry.sectionName?.trim() || "Unnamed section"})`
        : describeIngredient(entry.ingredient);
      changed.push({
        lineageId,
        name: entry.ingredient.name,
        before: beforeLabel,
        after: afterLabel,
      });
    }
  }
  for (const [lineageId, entry] of beforeFlat) {
    if (!afterFlat.has(lineageId)) {
      removed.push({ lineageId, label: describeIngredient(entry.ingredient) });
    }
  }

  const reordered = relativeOrderChanged(
    [...beforeFlat.keys()],
    [...afterFlat.keys()],
  );

  return { added, removed, changed, reordered };
}

type FlatInstruction = { text: string; signature: string };

function flattenInstructions(
  sections: SectionInput[],
): Map<string, FlatInstruction> {
  const map = new Map<string, FlatInstruction>();
  for (const section of sections) {
    for (const instruction of section.instructions) {
      if (!instruction.lineageId) continue;
      map.set(instruction.lineageId, {
        text: instruction.text,
        signature: instructionContentSignature(instruction),
      });
    }
  }
  return map;
}

function instructionChanges(before: SectionInput[], after: SectionInput[]) {
  const beforeFlat = flattenInstructions(before);
  const afterFlat = flattenInstructions(after);

  const added: AddedOrRemovedItem[] = [];
  const removed: AddedOrRemovedItem[] = [];
  const changed: ChangedInstruction[] = [];

  for (const [lineageId, entry] of afterFlat) {
    const prior = beforeFlat.get(lineageId);
    if (!prior) {
      added.push({ lineageId, label: entry.text });
      continue;
    }
    if (prior.signature !== entry.signature) {
      changed.push({ lineageId, before: prior.text, after: entry.text });
    }
  }
  for (const [lineageId, entry] of beforeFlat) {
    if (!afterFlat.has(lineageId)) {
      removed.push({ lineageId, label: entry.text });
    }
  }

  const reordered = relativeOrderChanged(
    [...beforeFlat.keys()],
    [...afterFlat.keys()],
  );

  return { added, removed, changed, reordered };
}

export function compareDishVersions(
  before: VersionCompareInput,
  after: VersionCompareInput,
): VersionComparisonResult {
  const metadata = metadataChanges(before.metadata, after.metadata);
  const nutrition = nutritionChanges(before.nutrition, after.nutrition);
  const sections = sectionChanges(before.sections, after.sections);
  const ingredients = ingredientChanges(before.sections, after.sections);
  const instructions = instructionChanges(before.sections, after.sections);

  const hasChanges =
    metadata.length > 0 ||
    nutrition.length > 0 ||
    sections.added.length > 0 ||
    sections.removed.length > 0 ||
    sections.reordered ||
    ingredients.added.length > 0 ||
    ingredients.removed.length > 0 ||
    ingredients.changed.length > 0 ||
    ingredients.reordered ||
    instructions.added.length > 0 ||
    instructions.removed.length > 0 ||
    instructions.changed.length > 0 ||
    instructions.reordered;

  return {
    metadata,
    sections,
    ingredients,
    instructions,
    nutrition,
    hasChanges,
  };
}

export type ComparisonVersionRef = {
  id: string;
  sourceVersionId: string | null;
};

/**
 * Slice 4 correction pass §5: when the compare page opens with no explicit
 * `?from=&to=`, `to` is always the current Version (or the highest saved
 * Version, if the Dish somehow has no current pointer). `from` prefers the
 * current Version's own recorded `sourceVersionId` — the actual direction
 * DishFrame revived or branched from (a historical revival, a promotion, or
 * a non-sequential minor branch) — over "whichever Version happens to sort
 * immediately before it," which is only a coincidence of numbering, not a
 * real relationship. Falls back to the preceding-Version default when the
 * current Version has no source, or when a recorded source doesn't resolve
 * against this list (defensive: a missing/invalid source must never crash
 * the page). `versions` must be ordered ascending, exactly as
 * `listDishVersionSummaries` returns them, and must contain at least one
 * entry.
 */
export function pickDefaultComparisonPair(
  versions: ComparisonVersionRef[],
  currentVersionId: string | null,
): { fromId: string; toId: string } {
  const toId = currentVersionId ?? versions[versions.length - 1].id;
  const toIndex = versions.findIndex((v) => v.id === toId);
  const sourceId = toIndex >= 0 ? versions[toIndex].sourceVersionId : null;

  if (sourceId && versions.some((v) => v.id === sourceId)) {
    return { fromId: sourceId, toId };
  }

  const fromId = toIndex > 0 ? versions[toIndex - 1].id : versions[0].id;
  return { fromId, toId };
}
