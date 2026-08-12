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
