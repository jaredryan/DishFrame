export type PositionedItem<T> = { position: number; value: T };

export type OrderedSectionOrPartLink<TSection, TPartLink> =
  | { type: "section"; position: number; section: TSection }
  | { type: "partLink"; position: number; partLink: TPartLink };

/**
 * Sections and top-level PartLinks share one interleaved persisted
 * `position` sequence within a DishVersion (schema.prisma's
 * `Section.position` comment: "shares one interleaved top-level ordering
 * sequence with this same DishVersion's top-level PartLink rows") — every
 * read-only renderer of that content (current-Version detail, Version
 * History, print/public share) merges the two back into that single order
 * by each item's own carried `position`, never by array/insertion index.
 * One shared merge, reused by every renderer rather than each
 * re-implementing its own sort.
 */
export function orderSectionsAndTopLevelPartLinks<TSection, TPartLink>(
  sections: PositionedItem<TSection>[],
  topLevelPartLinks: PositionedItem<TPartLink>[],
): OrderedSectionOrPartLink<TSection, TPartLink>[] {
  const items: OrderedSectionOrPartLink<TSection, TPartLink>[] = [
    ...sections.map(({ position, value }) => ({
      type: "section" as const,
      position,
      section: value,
    })),
    ...topLevelPartLinks.map(({ position, value }) => ({
      type: "partLink" as const,
      position,
      partLink: value,
    })),
  ];
  return items.sort((a, b) => a.position - b.position);
}

export type OrderedInstructionOrPartLink<TInstruction, TPartLink> =
  | { type: "instruction"; position: number; instruction: TInstruction }
  | { type: "partLink"; position: number; partLink: TPartLink };

/**
 * Section-editor refinement pass: the nested-level counterpart of
 * `orderSectionsAndTopLevelPartLinks` above, for a single Section's own
 * `instructions` and nested `partLinks` — same "one shared `position`
 * sequence, two separate arrays" shape one level down (see
 * `sectionContentSequence`'s doc comment, `src/lib/dishes/schema.ts`), so
 * every read-only renderer merges the two the same way rather than always
 * rendering every Instruction before every attached Part.
 */
export function orderInstructionsAndPartLinks<TInstruction, TPartLink>(
  instructions: PositionedItem<TInstruction>[],
  partLinks: PositionedItem<TPartLink>[],
): OrderedInstructionOrPartLink<TInstruction, TPartLink>[] {
  const items: OrderedInstructionOrPartLink<TInstruction, TPartLink>[] = [
    ...instructions.map(({ position, value }) => ({
      type: "instruction" as const,
      position,
      instruction: value,
    })),
    ...partLinks.map(({ position, value }) => ({
      type: "partLink" as const,
      position,
      partLink: value,
    })),
  ];
  return items.sort((a, b) => a.position - b.position);
}
