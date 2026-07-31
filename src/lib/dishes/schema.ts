import { z } from "zod";

// Mirrors Dish.stage (prisma/schema.prisma) — PRODUCT_SPEC.md §5.3.
export const stageValues = [
  "IDEA",
  "EXPERIMENTAL",
  "PROVEN",
  "ACTIVE",
  "ARCHIVED",
] as const;
export type StageValue = (typeof stageValues)[number];

export const dishKindValues = ["RECIPE", "PART"] as const;
export type DishKindValue = (typeof dishKindValues)[number];

// Gate 2 remediation: a concise, approved Difficulty set for the editor's
// dropdown, replacing the old arbitrary free-text input. `Dish.difficulty`
// stays a plain string column (no migration) — this constrains new entries
// at the UI layer rather than the Zod schema, so a Dish already carrying an
// older free-text value (from before this pass) still loads and displays
// without failing validation on an unrelated field's edit.
//
// Final correction pass: the set changed from Easy/Medium/Hard to
// Easy/Moderate/Challenging. `legacyDifficultyMap`/`normalizeDifficultyValue`
// keep a Dish already saved under the old set editable — the old value
// maps forward to its new equivalent instead of silently failing to match
// any Select option (which would otherwise look like "Not set" and risk
// being overwritten with `null` on the next save without the user
// intending to clear it).
export const difficultyValues = ["Easy", "Moderate", "Challenging"] as const;
export type DifficultyValue = (typeof difficultyValues)[number];

export const legacyDifficultyMap: Record<string, DifficultyValue> = {
  Medium: "Moderate",
  Hard: "Challenging",
};

export function normalizeDifficultyValue(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return legacyDifficultyMap[value] ?? value;
}

// Ingredient.quantity/quantityEnd are `Decimal @db.Decimal(12, 3)`
// (prisma/schema.prisma) — the database itself can only ever hold 3 places
// after the decimal point, rounding anything finer on write. Normalizing to
// that same precision before persistence (rather than letting Postgres be
// the only thing that ever rounds) turns an unbounded parsed value like
// `1/3` → `0.3333333333333333` into a deliberate `0.333` up front, so the
// same value flows through diffing (`diffVersionContent`), any pre-save
// display, and the eventual DB write without surprise. One shared pure
// helper — used by the client's fraction/mixed-number parser
// (number-field.tsx) and the server-side sanitization path
// (`sanitizedSectionsOrThrow` in service.ts) — so there is exactly one
// rounding rule, not two implementations that could drift apart. See
// PRODUCT_SPEC.md §10.6a.
export const QUANTITY_DECIMAL_PLACES = 3;

export function normalizeQuantity(value: number): number {
  return Number(value.toFixed(QUANTITY_DECIMAL_PLACES));
}

// §16.4: restoring requires selecting a non-Archived Stage.
export const restorableStageValues = [
  "IDEA",
  "EXPERIMENTAL",
  "PROVEN",
  "ACTIVE",
] as const;
export type RestorableStageValue = (typeof restorableStageValues)[number];

// A substitute is itself an Ingredient row (schema.prisma's
// `substituteForIngredientId`) — one level only, per PRODUCT_SPEC.md §11.4
// ("a substitute cannot contain another substitute"), so this is
// deliberately not recursive.
export const substituteInputSchema = z.object({
  lineageId: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Enter a name for the substitute."),
  quantity: z.number().min(0).nullable().optional(),
  quantityEnd: z.number().min(0).nullable().optional(),
  isApproximate: z.boolean().default(false),
  unit: z.string().trim().max(40).nullable().optional(),
  displayText: z.string().trim().max(120).nullable().optional(),
  preparationNote: z.string().trim().max(200).nullable().optional(),
});
export type SubstituteInput = z.infer<typeof substituteInputSchema>;

/**
 * A substitute row with no meaningful content at all — the shape left
 * behind by clicking "Add substitute" and then never filling anything in.
 * Loosely typed (`unknown`-ish field access) because this also runs as a
 * Zod `preprocess` step, ahead of the real schema, on a value that hasn't
 * been validated yet (Gate 2 correction: this used to reach
 * `substituteInputSchema`'s `name` check as a hard failure — see
 * `docs/GATE_2_REMEDIATION.md`).
 */
export function isBlankSubstitute(
  substitute: Partial<SubstituteInput> | null | undefined,
): boolean {
  if (!substitute) return false;
  return (
    !substitute.name?.trim() &&
    substitute.quantity == null &&
    substitute.quantityEnd == null &&
    !substitute.unit?.trim() &&
    !substitute.displayText?.trim() &&
    !substitute.preparationNote?.trim() &&
    !substitute.isApproximate
  );
}

// Strips a fully-blank substitute object down to `null` before the real
// schema ever sees it, so an abandoned "Add substitute" click can never by
// itself fail validation — only a *partially* filled-in substitute (some
// field set, but no name) still fails, with `substituteInputSchema`'s own
// "Enter a name for the substitute." message surfacing that clearly rather
// than being swallowed as a generic error.
const nullableSubstituteSchema = z.preprocess(
  (value) =>
    isBlankSubstitute(value as Partial<SubstituteInput> | null | undefined)
      ? null
      : value,
  substituteInputSchema.nullable().optional(),
);

export const ingredientInputSchema = z.object({
  // Present when this row was loaded from an existing Version and should
  // carry its lineage identity forward (ARCHITECTURE_PROPOSAL.md §D.-1);
  // absent for a row the editor just added, which gets a fresh lineageId
  // at save time.
  lineageId: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Enter an ingredient name.").max(200),
  quantity: z.number().min(0).nullable().optional(),
  quantityEnd: z.number().min(0).nullable().optional(),
  isApproximate: z.boolean().default(false),
  unit: z.string().trim().max(40).nullable().optional(),
  displayText: z.string().trim().max(120).nullable().optional(),
  preparationNote: z.string().trim().max(200).nullable().optional(),
  isOptional: z.boolean().default(false),
  substitute: nullableSubstituteSchema,
  // §10.1's "original imported text, optional" — the raw source line the
  // deterministic paste parser (Slice 11, `src/lib/importExport/`) read
  // this ingredient from, preserved as read-only provenance so a reviewer
  // can cross-check a structured guess against its source even after
  // editing the structured fields. Never set by the ordinary editor UI.
  originalImportedText: z.string().trim().max(500).nullable().optional(),
});
export type IngredientInput = z.infer<typeof ingredientInputSchema>;

export const instructionInputSchema = z.object({
  lineageId: z.string().min(1).optional(),
  text: z.string().trim().min(1, "Enter an instruction.").max(2000),
});
export type InstructionInput = z.infer<typeof instructionInputSchema>;

// Slice 6, PRODUCT_SPEC.md §67.1/§68.1: a linked Part occurrence — an exact
// selected Part Version, either top-level (on `dishContentSchema.partLinks`)
// or nested inside a Section (`sectionInputSchema.partLinks`). `lineageId`
// is the stable identity of this specific *occurrence* (ARCHITECTURE_
// PROPOSAL.md §D.-1/§D.6), independent of which Part Version it currently
// targets — present when loaded from an existing Version, absent for a
// freshly attached occurrence, exactly like every other lineage-keyed row.
//
// Slice 6 post-gate (Review Gate 3):
// - `position`: for a TOP-LEVEL occurrence (on `dishContentSchema.partLinks`),
//   this is its slot in the one shared ordering sequence with top-level
//   Sections (see `sectionInputSchema.position`'s doc comment) — the
//   authoritative value, not the array's own iteration order. For a
//   Section-nested occurrence, this is simply its position within that
//   Section's own `partLinks` array (unaffected by the unified top-level
//   sequence), the same convention ingredients/instructions already use.
// - `multiplier`: the parent-specific quantity multiplier for this
//   occurrence (default 1, must be positive) — composes with whole-item
//   scaling via the existing scaling utilities (`src/lib/units/scaling.ts`),
//   never a second arithmetic implementation.
export const partLinkInputSchema = z.object({
  lineageId: z.string().min(1).optional(),
  targetDishId: z.string().min(1),
  targetDishVersionId: z.string().min(1),
  position: z.number().int().min(0),
  multiplier: z
    .number()
    .gt(0, "Multiplier must be greater than zero.")
    .default(1),
});
export type PartLinkInput = z.infer<typeof partLinkInputSchema>;

export const sectionInputSchema = z.object({
  lineageId: z.string().min(1).optional(),
  // null/empty = unnamed default Section, hidden in display per §9.1.
  name: z.string().trim().max(80).nullable().optional(),
  guidanceNote: z.string().trim().max(500).nullable().optional(),
  ingredients: z.array(ingredientInputSchema),
  instructions: z.array(instructionInputSchema),
  partLinks: z.array(partLinkInputSchema),
  // Slice 6 post-gate: this Section's slot in the one shared top-level
  // ordering sequence with top-level linked Parts (`dishContentSchema.
  // partLinks`) — Build Plan Review Gate 3's "unified authored order."
  // Both this Section's own position and every top-level PartLink's
  // position are drawn from one shared counter per container Version,
  // enforced by application convention (`insertSections`/the editor), not a
  // DB constraint — see schema.prisma's own comment on `Section.position`.
  position: z.number().int().min(0),
});
export type SectionInput = z.infer<typeof sectionInputSchema>;

export const dishContentSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  stage: z.enum(stageValues),
  cuisine: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  yieldQuantity: z.number().gt(0).nullable().optional(),
  yieldUnit: z.string().trim().max(40).nullable().optional(),
  prepTimeMinutes: z.number().int().min(0).nullable().optional(),
  cookTimeMinutes: z.number().int().min(0).nullable().optional(),
  difficulty: z.string().trim().max(40).nullable().optional(),
  // Slice 5, PRODUCT_SPEC.md §12: always explicit, never `undefined` — the
  // editor's form state always carries the current value forward (loaded
  // from the base Version by `dishToFormValues`), so "the user didn't
  // touch it" and "inherit the base Version's image" are the same thing
  // (§12.2) without needing a separate undefined-vs-null distinction.
  imageAssetId: z.string().nullable().default(null),
  sections: z.array(sectionInputSchema),
  // Slice 6, PRODUCT_SPEC.md §67.1: top-level linked Parts, attached
  // directly to this Recipe/Part Version rather than nested in a Section.
  partLinks: z.array(partLinkInputSchema),
});
export type DishContentInput = z.infer<typeof dishContentSchema>;

/**
 * §9.5: empty Sections (no ingredients, no instructions, and — Slice 6 —
 * no linked Parts) are automatically removed at save time, regardless of
 * what the client sends.
 */
export function removeEmptySections(sections: SectionInput[]): SectionInput[] {
  return sections.filter(
    (section) =>
      section.ingredients.length > 0 ||
      section.instructions.length > 0 ||
      section.partLinks.length > 0,
  );
}

/**
 * §8.3's minimum-save rule: at least one meaningful local ingredient or
 * instruction, or (Slice 6) linked Part — top-level or nested in a
 * surviving Section — must remain after empty-Section removal.
 */
export function hasMinimumContent(
  sections: SectionInput[],
  topLevelPartLinks: PartLinkInput[] = [],
): boolean {
  return (
    topLevelPartLinks.length > 0 ||
    sections.some(
      (section) =>
        section.ingredients.length > 0 ||
        section.instructions.length > 0 ||
        section.partLinks.length > 0,
    )
  );
}

// Gate 2 correction (docs/SLICE_3.md): a Ingredient/Instruction content
// change requires the user to explicitly choose between staying in the
// current major line (a minor bump) or starting a new major Version.
export const versionChoiceValues = ["MINOR", "MAJOR"] as const;
export type VersionChoiceValue = (typeof versionChoiceValues)[number];
export const versionChoiceSchema = z.enum(versionChoiceValues);

// Exported so `compare.ts` can use the exact same "what counts as a
// content change" rule `diffVersionContent` already uses (one shared
// definition, not a second one that could silently drift from it) — the
// classification dialog and the comparison view must never disagree about
// whether two Ingredient/Instruction rows are the same content.
export function ingredientContentSignature(
  ingredient: IngredientInput,
): string {
  const substitute = ingredient.substitute
    ? {
        name: ingredient.substitute.name,
        quantity: ingredient.substitute.quantity ?? null,
        quantityEnd: ingredient.substitute.quantityEnd ?? null,
        isApproximate: ingredient.substitute.isApproximate,
        unit: ingredient.substitute.unit || null,
        displayText: ingredient.substitute.displayText || null,
        preparationNote: ingredient.substitute.preparationNote || null,
      }
    : null;
  return JSON.stringify({
    name: ingredient.name,
    quantity: ingredient.quantity ?? null,
    quantityEnd: ingredient.quantityEnd ?? null,
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit || null,
    displayText: ingredient.displayText || null,
    preparationNote: ingredient.preparationNote || null,
    isOptional: ingredient.isOptional,
    substitute,
  });
}

export function instructionContentSignature(
  instruction: InstructionInput,
): string {
  return JSON.stringify({ text: instruction.text });
}

// Slice 6: a linked Part occurrence's own content-signature — which exact
// Part Version it targets, and (Slice 6 post-gate) its multiplier, matter
// for "did this occurrence change," matching the ingredient/instruction
// pattern above. Position is deliberately excluded here — a pure move is
// tracked separately (see `diffVersionContent`'s position comparison) so a
// reorder and a real content change stay distinguishable in principle, even
// though both currently land in the same `cookingChanged` bucket.
export function partLinkContentSignature(partLink: PartLinkInput): string {
  return JSON.stringify({
    targetDishId: partLink.targetDishId,
    targetDishVersionId: partLink.targetDishVersionId,
    multiplier: partLink.multiplier,
  });
}

/**
 * Slice 6 post-gate, settled Review Gate 3 decision: "A parent DishVersion
 * may not directly link the same stable Part more than once, whether those
 * direct links are top-level or Section-nested." Only DIRECT occurrences on
 * this Version are considered — deliberately not a scan of the complete
 * transitive nested graph (nested duplication through separate branches is
 * accepted, not an attach-time error, per the settled decision). Returns
 * every `targetDishId` that appears more than once among this Version's own
 * direct links.
 */
export function findDuplicatePartTargets(
  sections: SectionInput[],
  topLevelPartLinks: PartLinkInput[],
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  function visit(links: PartLinkInput[]) {
    for (const link of links) {
      if (seen.has(link.targetDishId)) duplicates.add(link.targetDishId);
      seen.add(link.targetDishId);
    }
  }
  visit(topLevelPartLinks);
  for (const section of sections) visit(section.partLinks);
  return [...duplicates];
}

/**
 * Slice 6 post-gate: Sections and top-level PartLinks share one ordering
 * sequence (see `sectionInputSchema.position`'s doc comment) but are still
 * stored as two separate arrays/tables — this sorts either list back into
 * true sequence order by its own explicit `position` field, since the
 * arrays' own iteration order is no longer assumed to already match it
 * (unlike ingredients/instructions, whose array order remains the ordering
 * source of truth).
 */
export function sortByPosition<T extends { position: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export type VersionContentChange = {
  // Any Ingredient/Instruction add, remove, edit, or reorder — or (Slice 6)
  // any linked-Part attach, detach, target-Version change, or move — all
  // require the explicit minor/major choice (PRODUCT_SPEC.md's settled
  // Gate 2 rule). A linked Part is exactly as "cooking-adjacent" as an
  // Ingredient/Instruction — it changes what's actually made — so it folds
  // into the same bucket rather than inventing a fifth classification.
  cookingChanged: boolean;
  // Section add/remove/rename/reorder that does NOT touch any Ingredient,
  // Instruction, or linked Part — still Version-owned, but auto-minor, no
  // choice.
  sectionOrganizationChanged: boolean;
};

// A sentinel distinct from any real Section lineageId (a cuid) and from
// `undefined` (a brand-new, not-yet-lineaged Section) — used to key
// top-level linked Parts in the same lookup maps as Section-nested ones
// without any risk of collision.
const TOP_LEVEL_PART_LINK_KEY = " top-level";

export type VersionContentInput = {
  sections: SectionInput[];
  partLinks: PartLinkInput[];
};

/**
 * Classifies a proposed edit against the currently-saved content (both
 * already in `SectionInput`/`PartLinkInput` shape — the caller is
 * responsible for mapping DB rows first, e.g. via `versionContentToInput`).
 * Rows are matched by `lineageId`; a row with no matching `lineageId` in
 * `base` is always treated as a genuine addition. Framework- and
 * DB-agnostic on purpose so both the client (to decide whether to show the
 * minor/major choice dialog) and the server (the actual authority) can run
 * the identical classification — see docs/SLICE_3.md's Gate 2 section.
 */
export function diffVersionContent(
  base: VersionContentInput,
  edited: VersionContentInput,
): VersionContentChange {
  type Keyed = {
    sectionLineageId: string | undefined;
    position: number;
    signature: string;
  };

  const baseIngredients = new Map<string, Keyed>();
  const baseInstructions = new Map<string, Keyed>();
  const basePartLinks = new Map<string, Keyed>();
  const baseSectionMeta = new Map<
    string,
    { name: string | null | undefined; guidanceNote: string | null | undefined }
  >();
  const baseSectionOrder: string[] = [];

  function indexPartLinks(
    sectionLineageId: string | undefined,
    links: PartLinkInput[],
  ) {
    // Slice 6 post-gate: uses each link's own explicit `position` field,
    // not array iteration order — for a top-level occurrence this is its
    // real slot in the unified Section/PartLink sequence; for a
    // Section-nested one it's equivalent to array index anyway (the only
    // value ever assigned there), so one code path covers both.
    links.forEach((link) => {
      if (!link.lineageId) return;
      basePartLinks.set(link.lineageId, {
        sectionLineageId,
        position: link.position,
        signature: partLinkContentSignature(link),
      });
    });
  }

  indexPartLinks(TOP_LEVEL_PART_LINK_KEY, base.partLinks);

  // Slice 6 post-gate: sorted by explicit position, not assumed to already
  // arrive in sequence order (unlike ingredients/instructions, whose array
  // order remains the ordering source of truth).
  for (const section of sortByPosition(base.sections)) {
    if (!section.lineageId) continue; // every persisted Section has one
    baseSectionOrder.push(section.lineageId);
    baseSectionMeta.set(section.lineageId, {
      name: section.name,
      guidanceNote: section.guidanceNote,
    });
    section.ingredients.forEach((ingredient, index) => {
      if (!ingredient.lineageId) return;
      baseIngredients.set(ingredient.lineageId, {
        sectionLineageId: section.lineageId!,
        position: index,
        signature: ingredientContentSignature(ingredient),
      });
    });
    section.instructions.forEach((instruction, index) => {
      if (!instruction.lineageId) return;
      baseInstructions.set(instruction.lineageId, {
        sectionLineageId: section.lineageId!,
        position: index,
        signature: instructionContentSignature(instruction),
      });
    });
    indexPartLinks(section.lineageId, section.partLinks);
  }

  let cookingChanged = false;
  let sectionOrganizationChanged = false;
  const seenIngredientLineageIds = new Set<string>();
  const seenInstructionLineageIds = new Set<string>();
  const seenPartLinkLineageIds = new Set<string>();
  const editedSectionOrder: string[] = [];

  function diffPartLinks(
    sectionLineageId: string | undefined,
    links: PartLinkInput[],
  ) {
    links.forEach((link) => {
      if (!link.lineageId) {
        cookingChanged = true; // newly attached occurrence
        return;
      }
      seenPartLinkLineageIds.add(link.lineageId);
      const before = basePartLinks.get(link.lineageId);
      if (
        !before ||
        before.sectionLineageId !== sectionLineageId ||
        before.position !== link.position ||
        before.signature !== partLinkContentSignature(link)
      ) {
        cookingChanged = true;
      }
    });
  }

  diffPartLinks(TOP_LEVEL_PART_LINK_KEY, edited.partLinks);

  for (const section of sortByPosition(edited.sections)) {
    if (section.lineageId) {
      editedSectionOrder.push(section.lineageId);
      const meta = baseSectionMeta.get(section.lineageId);
      if (
        !meta ||
        (meta.name || null) !== (section.name || null) ||
        (meta.guidanceNote || null) !== (section.guidanceNote || null)
      ) {
        sectionOrganizationChanged = true;
      }
    }

    section.ingredients.forEach((ingredient, index) => {
      if (!ingredient.lineageId) {
        cookingChanged = true; // newly added row
        return;
      }
      seenIngredientLineageIds.add(ingredient.lineageId);
      const before = baseIngredients.get(ingredient.lineageId);
      if (
        !before ||
        before.sectionLineageId !== section.lineageId ||
        before.position !== index ||
        before.signature !== ingredientContentSignature(ingredient)
      ) {
        cookingChanged = true;
      }
    });

    section.instructions.forEach((instruction, index) => {
      if (!instruction.lineageId) {
        cookingChanged = true;
        return;
      }
      seenInstructionLineageIds.add(instruction.lineageId);
      const before = baseInstructions.get(instruction.lineageId);
      if (
        !before ||
        before.sectionLineageId !== section.lineageId ||
        before.position !== index ||
        before.signature !== instructionContentSignature(instruction)
      ) {
        cookingChanged = true;
      }
    });

    diffPartLinks(section.lineageId, section.partLinks);
  }

  for (const id of baseIngredients.keys()) {
    if (!seenIngredientLineageIds.has(id)) cookingChanged = true; // removed
  }
  for (const id of baseInstructions.keys()) {
    if (!seenInstructionLineageIds.has(id)) cookingChanged = true; // removed
  }
  for (const id of basePartLinks.keys()) {
    if (!seenPartLinkLineageIds.has(id)) cookingChanged = true; // detached
  }

  if (baseSectionOrder.length !== editedSectionOrder.length) {
    sectionOrganizationChanged = true;
  } else {
    const filteredBaseOrder = baseSectionOrder.filter((id) =>
      editedSectionOrder.includes(id),
    );
    if (
      JSON.stringify(filteredBaseOrder) !== JSON.stringify(editedSectionOrder)
    ) {
      sectionOrganizationChanged = true;
    }
  }

  return { cookingChanged, sectionOrganizationChanged };
}

// Slice 6 correction pass §2: the direct-duplicate invariant guarantees a
// given Part is directly linked at most once per parent Version (top-level
// or Section-nested, never both) — one parent has exactly one direct
// occurrence to target, identified by its stable `lineageId`.
export const propagationSelectionSchema = z.object({
  containerDishId: z.string().min(1),
  lineageId: z.string().min(1),
});

export const propagatePartUpdateSchema = z.object({
  partDishId: z.string().min(1),
  newTargetVersionId: z.string().min(1),
  selections: z.array(propagationSelectionSchema),
  // §73.2/§73.3: defaults to MINOR ("Save small update") regardless of
  // whether the incoming Part change was itself minor or major; the caller
  // retains classification authority to override to MAJOR.
  bump: versionChoiceSchema.optional(),
});

// PRODUCT_SPEC.md §74.2: the three approved per-occurrence resolutions
// offered before a referenced Part can be permanently deleted.
export const partUsageResolutionValues = [
  "DETACH",
  "REPLACE",
  "REMOVE",
] as const;
export type PartUsageResolutionValue =
  (typeof partUsageResolutionValues)[number];

export const resolvePartUsageOccurrenceSchema = z.object({
  partDishId: z.string().min(1),
  containerDishId: z.string().min(1),
  lineageId: z.string().min(1),
  resolution: z.enum(partUsageResolutionValues),
  // Slice 6 correction pass §1: Detach/Replace/Remove is always a material
  // change to the affected parent — the same explicit minor/major choice
  // `editDish` requires for any cooking change, never an automatic MINOR.
  versionChoice: versionChoiceSchema,
  replacement: z
    .object({
      targetDishId: z.string().min(1),
      targetDishVersionId: z.string().min(1),
    })
    .optional(),
});

export const duplicateDishSchema = z.object({
  dishId: z.string().min(1),
  sourceVersionId: z.string().min(1).optional(),
});

export const restoreDishSchema = z.object({
  dishId: z.string().min(1),
  stage: z.enum(restorableStageValues),
});

export const promoteHistoricalVersionSchema = z.object({
  dishId: z.string().min(1),
  versionId: z.string().min(1),
});

// Version-trigger correction pass: description/image are Version-associated
// but mutable — this schema backs `updateVersionMetadata`, which edits
// either field in place on any selected (current or historical) Version
// without creating a new one. `imageAssetId: null` means "no image."
export const updateVersionMetadataSchema = z.object({
  dishId: z.string().min(1),
  versionId: z.string().min(1),
  description: z.string().trim().max(4000).nullable(),
  imageAssetId: z.string().nullable(),
});

export const updateVersionNoteSchema = z.object({
  dishId: z.string().min(1),
  versionId: z.string().min(1),
  // §14.1: the note is optional — an empty string clears it back to unset.
  note: z.string().trim().max(500).nullable(),
});

// PRODUCT_SPEC.md §51.4: "Save as default" persists a temporary scale as
// the stable Dish's default batch presentation — a `null` quantity clears
// it back to the authored Version yield (§51.4's "remains resettable").
export const setDefaultScaleSchema = z.object({
  dishId: z.string().min(1),
  defaultScale: z.number().gt(0, "Scale must be greater than zero.").nullable(),
});

// PRODUCT_SPEC.md §53.6, Build Plan Correction 6: targets one specific
// ingredient lineage, never a blanket per-Dish setting — matches
// `PreferredUnitOverride`'s `@@unique([dishId, ingredientLineageId])`.
export const savePreferredUnitOverrideSchema = z.object({
  dishId: z.string().min(1),
  ingredientLineageId: z.string().min(1),
  unit: z.string().min(1),
});

export const clearPreferredUnitOverrideSchema = z.object({
  dishId: z.string().min(1),
  ingredientLineageId: z.string().min(1),
});

// Slice 10, PRODUCT_SPEC.md §45.2/§79.2: tags/Flavor profiles are stable
// Dish metadata, always submitted as a complete replacement set (same
// "submit the whole thing" shape as `reorderTastersSchema`), never a
// single add/remove — simpler than diffing partial toggles client-side.
export const setDishTagsSchema = z.object({
  dishId: z.string().min(1),
  tagIds: z.array(z.string().min(1)),
});

export const setDishFlavorProfilesSchema = z.object({
  dishId: z.string().min(1),
  flavorProfileValueIds: z.array(z.string().min(1)),
});

export const toggleFavoriteSchema = z.object({
  dishId: z.string().min(1),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialActionState: ActionState = { status: "idle" };

export type DishActionState = ActionState & { dishId?: string };
export const initialDishActionState: DishActionState = { status: "idle" };
