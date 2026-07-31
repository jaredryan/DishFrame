import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel } from "@/lib/dishes/version-note";
import {
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import type {
  VersionSectionRow,
  VersionPartLinkRow,
} from "@/lib/dishes/mappers";

/**
 * Cooking Setup/Session queries (PRODUCT_SPEC.md §21-27, Gate 4). Ownership
 * guard pattern matches `dishes/queries.ts`'s `getOwnedDishOrThrow`
 * (ARCHITECTURE_PROPOSAL.md §K.6): every lookup is scoped by ownerId in the
 * same query, not fetched then checked after the fact.
 */

export async function getOwnedDishVersionOrThrow(
  ownerId: string,
  dishId: string,
  dishVersionId: string,
) {
  const dish = await prisma.dish.findFirst({ where: { id: dishId, ownerId } });
  if (!dish) throw new NotFoundError("Recipe or Part not found.");

  const version = await prisma.dishVersion.findFirst({
    where: { id: dishVersionId, dishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!version) throw new NotFoundError("Version not found.");

  return { dish, version };
}

/**
 * The container Dish/Version's own current title and pinned Version label —
 * fetched directly rather than read off any one `CookingSessionUnit`
 * snapshot, since a Recipe made entirely of top-level Parts (§23.2: "a
 * Recipe may contain only reusable Parts") has no SECTION-kind unit at all,
 * and every PART-kind unit snapshots the *Part's own* title, not the
 * container's.
 */
export async function getSessionSourceSummary(
  dishId: string,
  dishVersionId: string,
) {
  const [dish, version] = await Promise.all([
    prisma.dish.findFirst({
      where: { id: dishId },
      select: { currentTitle: true, kind: true },
    }),
    prisma.dishVersion.findFirst({
      where: { id: dishVersionId, dishId },
      select: { majorVersion: true, minorVersion: true },
    }),
  ]);
  return {
    dishTitle: dish?.currentTitle ?? "Deleted item",
    dishKind: dish?.kind ?? null,
    versionLabel: version
      ? versionLabel(version.majorVersion, version.minorVersion)
      : "—",
  };
}

export async function getOwnedSessionOrThrow(
  ownerId: string,
  sessionId: string,
) {
  const session = await prisma.cookingSession.findFirst({
    where: { id: sessionId, ownerId },
    include: {
      units: {
        orderBy: { position: "asc" },
        include: { checklistItems: true, timers: true },
      },
    },
  });
  if (!session) throw new NotFoundError("Cooking Session not found.");
  return session;
}
export type OwnedCookingSession = Awaited<
  ReturnType<typeof getOwnedSessionOrThrow>
>;

// PRODUCT_SPEC.md §26.2/§26.3 — one active session per stable Dish. Used
// only to enrich a conflict response with the existing session's id for the
// Resume link (never as the concurrency guard itself — the partial unique
// index is authoritative, see service.ts's startCookingSession).
export function findActiveSessionForDish(ownerId: string, dishId: string) {
  return prisma.cookingSession.findFirst({
    where: { ownerId, dishId, state: "IN_PROGRESS" },
    select: { id: true },
  });
}

const RECENT_ENDED_SESSION_LIMIT = 10;

// PRODUCT_SPEC.md §26.6 — `/cook` index: active sessions plus a bounded
// window of recently-ended ones.
export async function listSessionsForOwner(ownerId: string) {
  const [active, recentEnded] = await Promise.all([
    prisma.cookingSession.findMany({
      where: { ownerId, state: "IN_PROGRESS" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        dishId: true,
        state: true,
        startedAt: true,
        updatedAt: true,
      },
    }),
    prisma.cookingSession.findMany({
      where: { ownerId, state: { in: ["COMPLETED", "ENDED_EARLY"] } },
      orderBy: { endedAt: "desc" },
      take: RECENT_ENDED_SESSION_LIMIT,
      select: {
        id: true,
        dishId: true,
        state: true,
        startedAt: true,
        endedAt: true,
      },
    }),
  ]);

  const dishIds = [
    ...new Set([...active, ...recentEnded].map((s) => s.dishId)),
  ];
  const dishes = dishIds.length
    ? await prisma.dish.findMany({
        where: { id: { in: dishIds } },
        select: { id: true, currentTitle: true, kind: true },
      })
    : [];
  const dishById = new Map(dishes.map((d) => [d.id, d]));

  const withDish = <T extends { dishId: string }>(rows: T[]) =>
    rows.map((row) => ({
      ...row,
      dishTitle: dishById.get(row.dishId)?.currentTitle ?? "Deleted item",
      dishKind: dishById.get(row.dishId)?.kind ?? null,
    }));

  return { active: withDish(active), recentEnded: withDish(recentEnded) };
}

// Unscaled, authored values a checklist item needs to compute its eventual
// display fields from — scaling is applied at start/edit time (service.ts).
export type CookableChecklistRaw =
  | {
      kind: "INGREDIENT";
      sourceLineageId: string;
      name: string;
      quantity: number | null;
      quantityEnd: number | null;
      isApproximate: boolean;
      unit: string | null;
      freeText: string | null;
      preparationNote: string | null;
    }
  | { kind: "INSTRUCTION"; sourceLineageId: string; text: string };

export type CookableUnit = {
  unitKey: string;
  kind: "SECTION" | "PART";
  label: string;
  sourceDishTitle: string;
  sourceDishVersionLabel: string;
  sourceSectionLineageId: string | null;
  sourcePartLinkLineageId: string | null;
  estimatedDurationMinutes: number | null;
  authoredIndex: number;
  checklist: CookableChecklistRaw[];
};

const MAX_PART_FLATTEN_DEPTH = 12;

function ingredientToRaw(
  ingredient: VersionSectionRow["ingredients"][number],
): CookableChecklistRaw {
  return {
    kind: "INGREDIENT",
    sourceLineageId: ingredient.lineageId,
    name: ingredient.name,
    quantity: decimalToNumber(ingredient.quantity),
    quantityEnd: decimalToNumber(ingredient.quantityEnd),
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit,
    freeText: ingredient.displayText,
    preparationNote: ingredient.preparationNote,
  };
}

function scaleRaw(
  raw: CookableChecklistRaw,
  multiplier: number,
): CookableChecklistRaw {
  if (raw.kind !== "INGREDIENT" || raw.quantity == null) return raw;
  return {
    ...raw,
    quantity: raw.quantity * multiplier,
    quantityEnd: raw.quantityEnd == null ? null : raw.quantityEnd * multiplier,
  };
}

/**
 * Flattens one Part Version's own cooking content — including any further
 * Parts nested inside *it* — into one flat checklist for a single cookable
 * unit (PRODUCT_SPEC.md §23.1/§23.4: only a Recipe's direct local Sections
 * and directly-linked Parts are independently selectable; a Part's own
 * nested Parts are not promoted a further level and simply contribute their
 * content to the containing Part unit). Re-checks ownerId at every level,
 * mirroring `sections/service.ts`'s `resolvePartLinkTreeInner`.
 */
async function flattenPartChecklist(
  ownerId: string,
  targetDishId: string,
  targetDishVersionId: string,
  cumulativeMultiplier: number,
  visited: Set<string>,
  depth: number,
): Promise<CookableChecklistRaw[]> {
  if (depth >= MAX_PART_FLATTEN_DEPTH || visited.has(targetDishId)) return [];

  const targetDish = await prisma.dish.findFirst({
    where: { id: targetDishId, ownerId, kind: "PART" },
    select: { id: true },
  });
  if (!targetDish) return [];

  const version = await prisma.dishVersion.findFirst({
    where: { id: targetDishVersionId, dishId: targetDishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!version) return [];

  const nextVisited = new Set(visited);
  nextVisited.add(targetDishId);

  const items: CookableChecklistRaw[] = [];
  for (const section of version.sections) {
    for (const ingredient of section.ingredients) {
      if (ingredient.substituteForIngredientId) continue;
      items.push(scaleRaw(ingredientToRaw(ingredient), cumulativeMultiplier));
    }
    for (const instruction of section.instructions) {
      items.push({
        kind: "INSTRUCTION",
        sourceLineageId: instruction.lineageId,
        text: instruction.text,
      });
    }
  }

  for (const link of version.partLinks) {
    if (!link.targetDishId || !link.targetDishVersionId) continue;
    items.push(
      ...(await flattenPartChecklist(
        ownerId,
        link.targetDishId,
        link.targetDishVersionId,
        cumulativeMultiplier * (decimalToNumber(link.multiplier) ?? 1),
        nextVisited,
        depth + 1,
      )),
    );
  }

  return items;
}

async function buildPartUnit(
  ownerId: string,
  link: VersionPartLinkRow,
  authoredIndex: number,
): Promise<CookableUnit | null> {
  if (!link.targetDishId || !link.targetDishVersionId) return null;

  const targetDish = await prisma.dish.findFirst({
    where: { id: link.targetDishId, ownerId, kind: "PART" },
    select: { currentTitle: true },
  });
  if (!targetDish) return null;

  const targetVersion = await prisma.dishVersion.findFirst({
    where: { id: link.targetDishVersionId, dishId: link.targetDishId },
    select: {
      majorVersion: true,
      minorVersion: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
    },
  });
  if (!targetVersion) return null;

  const multiplier = decimalToNumber(link.multiplier) ?? 1;
  const checklist = await flattenPartChecklist(
    ownerId,
    link.targetDishId,
    link.targetDishVersionId,
    multiplier,
    new Set(),
    0,
  );
  const label = targetDish.currentTitle ?? "Untitled Part";
  const estimatedDurationMinutes =
    targetVersion.prepTimeMinutes != null ||
    targetVersion.cookTimeMinutes != null
      ? (targetVersion.prepTimeMinutes ?? 0) +
        (targetVersion.cookTimeMinutes ?? 0)
      : null;

  return {
    unitKey: `part:${link.lineageId}`,
    kind: "PART",
    label,
    sourceDishTitle: label,
    sourceDishVersionLabel: versionLabel(
      targetVersion.majorVersion,
      targetVersion.minorVersion,
    ),
    sourceSectionLineageId: null,
    sourcePartLinkLineageId: link.lineageId,
    estimatedDurationMinutes,
    authoredIndex,
    checklist,
  };
}

/**
 * Builds the full set of cookable units a given, owner-verified Dish
 * Version offers (PRODUCT_SPEC.md §23) — local Sections and directly
 * linked Parts (top-level or Section-nested) as independent units, each
 * with its own flattened checklist and estimated duration for the §23.5
 * suggested-order rule. Called fresh by both the Setup screen (to render
 * the picker) and every session-mutating service function (to validate a
 * client-supplied `unitKey` and re-derive its real content) — never cached
 * or trusted from client input (PRODUCT_SPEC.md §22.4/Gate 4 authorization
 * requirements).
 */
export async function buildCookableUnits(
  ownerId: string,
  dish: { currentTitle: string | null },
  version: {
    majorVersion: number;
    minorVersion: number;
    sections: VersionSectionRow[];
    partLinks: VersionPartLinkRow[];
  },
): Promise<CookableUnit[]> {
  const dishTitle = dish.currentTitle ?? "Untitled";
  const sourceDishVersionLabel = versionLabel(
    version.majorVersion,
    version.minorVersion,
  );

  const partLinksBySection = new Map<string, VersionPartLinkRow[]>();
  const topLevelPartLinks: VersionPartLinkRow[] = [];
  for (const link of version.partLinks) {
    if (link.sectionId === null) {
      topLevelPartLinks.push(link);
    } else {
      const list = partLinksBySection.get(link.sectionId) ?? [];
      list.push(link);
      partLinksBySection.set(link.sectionId, list);
    }
  }

  // §23.5: Sections and top-level Parts already share one authored position
  // sequence (schema.prisma comment on Section.position); interleave them by
  // that shared value to get one true top-level authored order.
  type TopLevelEntry =
    | { type: "section"; position: number; value: VersionSectionRow }
    | { type: "partLink"; position: number; value: VersionPartLinkRow };
  const topLevelEntries: TopLevelEntry[] = [
    ...version.sections.map((value) => ({
      type: "section" as const,
      position: value.position,
      value,
    })),
    ...topLevelPartLinks.map((value) => ({
      type: "partLink" as const,
      position: value.position,
      value,
    })),
  ].sort((a, b) => a.position - b.position);

  const units: CookableUnit[] = [];
  let authoredCursor = 0;

  for (const entry of topLevelEntries) {
    const authoredIndex = authoredCursor++;

    if (entry.type === "section") {
      const section = entry.value;
      const localIngredients = section.ingredients.filter(
        (i) => !i.substituteForIngredientId,
      );
      if (localIngredients.length > 0 || section.instructions.length > 0) {
        units.push({
          unitKey: `section:${section.lineageId}`,
          kind: "SECTION",
          label: section.name?.trim() || dishTitle,
          sourceDishTitle: dishTitle,
          sourceDishVersionLabel,
          sourceSectionLineageId: section.lineageId,
          sourcePartLinkLineageId: null,
          estimatedDurationMinutes: null,
          authoredIndex,
          checklist: [
            ...localIngredients.map(ingredientToRaw),
            ...section.instructions.map((instruction) => ({
              kind: "INSTRUCTION" as const,
              sourceLineageId: instruction.lineageId,
              text: instruction.text,
            })),
          ],
        });
      }

      const nestedLinks = partLinksBySection.get(section.id) ?? [];
      for (const [nestedOffset, link] of nestedLinks.entries()) {
        const unit = await buildPartUnit(
          ownerId,
          link,
          authoredIndex + (nestedOffset + 1) / (nestedLinks.length + 1),
        );
        if (unit) units.push(unit);
      }
    } else {
      const unit = await buildPartUnit(ownerId, entry.value, authoredIndex);
      if (unit) units.push(unit);
    }
  }

  // §23.5: longest estimated duration first; authored order when durations
  // are missing or equal (local Sections carry no duration data at all, so
  // they always sort by authored order relative to one another and to any
  // duration-less Part).
  return units.sort((a, b) => {
    if (
      a.estimatedDurationMinutes != null &&
      b.estimatedDurationMinutes != null
    ) {
      if (a.estimatedDurationMinutes !== b.estimatedDurationMinutes) {
        return b.estimatedDurationMinutes - a.estimatedDurationMinutes;
      }
    } else if (a.estimatedDurationMinutes != null) {
      return -1;
    } else if (b.estimatedDurationMinutes != null) {
      return 1;
    }
    return a.authoredIndex - b.authoredIndex;
  });
}
