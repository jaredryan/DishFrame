import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { scaleQuantity } from "@/lib/units/scaling";
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
// Wrapped in React's `cache()`: the Cooking Mode page's `generateMetadata`
// and page component both call this with identical args in one request.
export const getSessionSourceSummary = cache(
  async function getSessionSourceSummary(
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
  },
);

// Wrapped in React's `cache()`: the Cooking Mode page's `generateMetadata`
// and page component both call this with identical args in one request.
export const getOwnedSessionOrThrow = cache(
  async function getOwnedSessionOrThrow(ownerId: string, sessionId: string) {
    const session = await prisma.cookingSession.findFirst({
      where: { id: sessionId, ownerId },
      include: {
        units: {
          orderBy: { position: "asc" },
          include: {
            checklistItems: { orderBy: { id: "asc" } },
            timers: true,
          },
        },
      },
    });
    if (!session) throw new NotFoundError("Cooking Session not found.");
    return session;
  },
);
export type OwnedCookingSession = Awaited<
  ReturnType<typeof getOwnedSessionOrThrow>
>;

/** Derives a persisted `CookingSessionUnit`'s own `CookableUnit.unitKey`,
 * shared by the service layer (validating add/exclude) and any caller that
 * needs to join a session's units back against a fresh `buildCookableUnits`
 * result (e.g. matching each unit's own output basis for scaling). */
export function sessionUnitKey(unit: {
  sourceSectionLineageId: string | null;
  sourcePartLinkLineageId: string | null;
}): string {
  return unit.sourceSectionLineageId
    ? `section:${unit.sourceSectionLineageId}`
    : `part:${unit.sourcePartLinkLineageId}`;
}

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
// window of recently-ended ones. An optional `dishId` scopes both lists to
// one Recipe/Part's own history (Recipe detail's "Cooking history" action) —
// scoped, the recently-ended window is uncapped, since a single Dish's own
// history is never as large as the cross-Dish feed this cap exists for.
export async function listSessionsForOwner(
  ownerId: string,
  options?: { dishId?: string },
) {
  const dishId = options?.dishId;
  const [active, recentEnded] = await Promise.all([
    prisma.cookingSession.findMany({
      where: { ownerId, state: "IN_PROGRESS", ...(dishId ? { dishId } : {}) },
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
      where: {
        ownerId,
        state: { in: ["COMPLETED", "ENDED_EARLY"] },
        ...(dishId ? { dishId } : {}),
      },
      orderBy: { endedAt: "desc" },
      ...(dishId ? {} : { take: RECENT_ENDED_SESSION_LIMIT }),
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
  // Slice 8 §24.1/§24.2 — the unit's own authored "Makes" basis, used for
  // natural target-output scaling instead of a plain multiplier. Only a PART
  // unit has its own yield (a Section has no independent "Makes" of its
  // own — the containing Recipe Version's yield is the whole-session basis,
  // read directly off that Version by the caller, not per-unit here).
  outputQuantity: number | null;
  outputUnit: string | null;
  // SLICE_9.md correction pass — the unit's own direct PartLink target,
  // null for a SECTION unit. Lets the service layer persist a
  // `CookingSessionPartUsage` row straight from this unit's own fields,
  // without a second PartLink lookup at session-creation/plan-edit time.
  targetDishId: string | null;
  targetDishVersionId: string | null;
  // SLICE_9.md refinement pass (2026-07-31) — this unit's place in the
  // authored Part-nesting graph relative to the Recipe/Part actually being
  // cooked. Null for a SECTION unit. "DIRECT" is a Part linked straight
  // into the cooked Recipe/Part (top-level or Section-nested); "NESTED" is
  // a Part reached only by linking through another Part, which is itself
  // its own independently selectable unit, not a sub-item of its container
  // (see `buildPartUnitTree`).
  partRelation: PartUsageOccurrenceRelation | null;
  partViaTitleSnapshot: string | null;
  partPathSnapshot: string | null;
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

export type PartUsageOccurrenceRelation = "DIRECT" | "NESTED";

/**
 * SLICE_9.md refinement pass (2026-07-31) — builds one linked Part's own
 * cookable unit, plus a further `CookableUnit` for every Part linked inside
 * *it* at any depth (recursively). This generalizes the Section→Part split
 * immediately below (PRODUCT_SPEC.md §23.4) to Part→Part nesting: a Part's
 * own checklist is only its own directly-authored ingredients/instructions
 * (never a further-nested Part's content folded in), and every Part it
 * itself links to becomes its own independent, independently selectable
 * sibling unit — never invisibly bundled into a parent's inclusion/exclusion.
 * Each unit carries its own authored path/relation/via-title so
 * `createPartUsageRows` can persist one `CookingSessionPartUsage` row
 * straight from the exact unit a Cooking Session actually included, never by
 * re-walking the source graph at session-creation time. Re-checks ownerId at
 * every level, mirroring `sections/service.ts`'s `resolvePartLinkTreeInner`.
 */
async function buildPartUnitTree(
  ownerId: string,
  link: VersionPartLinkRow,
  authoredIndex: number,
  relation: PartUsageOccurrenceRelation,
  viaPartTitleSnapshot: string | null,
  pathPrefix: string[],
  visited: Set<string>,
  depth: number,
): Promise<CookableUnit[]> {
  if (!link.targetDishId || !link.targetDishVersionId) return [];
  if (depth >= MAX_PART_FLATTEN_DEPTH || visited.has(link.targetDishId)) {
    return [];
  }

  const targetDish = await prisma.dish.findFirst({
    where: { id: link.targetDishId, ownerId, kind: "PART" },
    select: { currentTitle: true },
  });
  if (!targetDish) return [];

  const targetVersion = await prisma.dishVersion.findFirst({
    where: { id: link.targetDishVersionId, dishId: link.targetDishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!targetVersion) return [];

  const label = targetDish.currentTitle ?? "Untitled Part";
  const multiplier = decimalToNumber(link.multiplier) ?? 1;
  const pathSnapshot = [...pathPrefix, label].join(" → ");

  const checklist: CookableChecklistRaw[] = [];
  for (const section of targetVersion.sections) {
    for (const ingredient of section.ingredients) {
      if (ingredient.substituteForIngredientId) continue;
      checklist.push(scaleRaw(ingredientToRaw(ingredient), multiplier));
    }
    for (const instruction of section.instructions) {
      checklist.push({
        kind: "INSTRUCTION",
        sourceLineageId: instruction.lineageId,
        text: instruction.text,
      });
    }
  }

  const estimatedDurationMinutes =
    targetVersion.prepTimeMinutes != null ||
    targetVersion.cookTimeMinutes != null
      ? (targetVersion.prepTimeMinutes ?? 0) +
        (targetVersion.cookTimeMinutes ?? 0)
      : null;

  const unit: CookableUnit = {
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
    outputQuantity: decimalToNumber(targetVersion.yieldQuantity),
    outputUnit: targetVersion.yieldUnit,
    targetDishId: link.targetDishId,
    targetDishVersionId: link.targetDishVersionId,
    partRelation: relation,
    partViaTitleSnapshot: viaPartTitleSnapshot,
    partPathSnapshot: pathSnapshot,
  };

  const nextVisited = new Set(visited);
  nextVisited.add(link.targetDishId);
  const nextPathPrefix = [...pathPrefix, label];

  const nestedLinks = [...targetVersion.partLinks].sort(
    (a, b) => a.position - b.position,
  );
  const nested: CookableUnit[] = [];
  for (const [offset, nestedLink] of nestedLinks.entries()) {
    nested.push(
      ...(await buildPartUnitTree(
        ownerId,
        nestedLink,
        authoredIndex + (offset + 1) / (nestedLinks.length + 1),
        "NESTED",
        label,
        nextPathPrefix,
        nextVisited,
        depth + 1,
      )),
    );
  }

  return [unit, ...nested];
}

/**
 * Builds the full set of cookable units a given, owner-verified Dish
 * Version offers (PRODUCT_SPEC.md §23) — local Sections and every linked
 * Part as an independent unit, at any nesting depth (SLICE_9.md refinement
 * pass generalizes §23.4's Section→Part split to Part→Part, see
 * `buildPartUnitTree`), each with its own flattened checklist and estimated
 * duration for the §23.5 suggested-order rule. Called fresh by both the
 * Setup screen (to render the picker) and every session-mutating service
 * function (to validate a client-supplied `unitKey` and re-derive its real
 * content) — never cached or trusted from client input (PRODUCT_SPEC.md
 * §22.4/Gate 4 authorization requirements).
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
          outputQuantity: null,
          outputUnit: null,
          targetDishId: null,
          targetDishVersionId: null,
          partRelation: null,
          partViaTitleSnapshot: null,
          partPathSnapshot: null,
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
        units.push(
          ...(await buildPartUnitTree(
            ownerId,
            link,
            authoredIndex + (nestedOffset + 1) / (nestedLinks.length + 1),
            "DIRECT",
            null,
            [dishTitle],
            new Set(),
            0,
          )),
        );
      }
    } else {
      units.push(
        ...(await buildPartUnitTree(
          ownerId,
          entry.value,
          authoredIndex,
          "DIRECT",
          null,
          [dishTitle],
          new Set(),
          0,
        )),
      );
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

/**
 * PRODUCT_SPEC.md §41.1/§41.3/§41.4 — Last cooked, computed at read time
 * from stored session evidence. A Recipe's value comes only from its own
 * Completed sessions (full or partial; Ended-early never counts, §41.2). A
 * Part's value additionally considers every persisted `CookingSessionPartUsage`
 * row for this exact Part whose owning unit is still active in a Completed
 * session (SLICE_9.md correction pass — previously reconstructed by a
 * read-time recursive `PartLink` walk, which broke once an intermediate Part
 * was permanently deleted; now a plain join against durable rows written
 * once at session-creation/plan-edit time). No duplicate standalone Part
 * session is ever created for this usage (§41.4), so this join is the only
 * way to surface it.
 */
export async function getLastCookedAt(
  ownerId: string,
  dishId: string,
  kind: "RECIPE" | "PART",
): Promise<Date | null> {
  const standalone = await prisma.cookingSession.findFirst({
    where: { dishId, state: "COMPLETED" },
    orderBy: { endedAt: "desc" },
    select: { endedAt: true },
  });

  if (kind === "RECIPE") {
    return standalone?.endedAt ?? null;
  }

  // Only a unit still active (not removed from the plan before the session
  // ended) counts as actually cooked.
  const usage = await prisma.cookingSessionPartUsage.findFirst({
    where: {
      partDishId: dishId,
      unit: { removedAt: null },
      session: { ownerId, state: "COMPLETED" },
    },
    orderBy: { session: { endedAt: "desc" } },
    select: { session: { select: { endedAt: true } } },
  });

  const candidates = [standalone?.endedAt, usage?.session.endedAt].filter(
    (d): d is Date => d != null,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a > b ? a : b));
}

/**
 * Batched sibling of `getLastCookedAt` for the library's "Recently cooked"/
 * "Least recently cooked" sorts (BUILD_PLAN.md Slice 10) — one pair of
 * queries for every candidate Dish rather than N round trips. Same rules as
 * the single-item version: only a `COMPLETED` session counts, and a Part
 * usage only counts while its owning unit is still active in the plan.
 */
export async function getLastCookedAtForDishes(
  ownerId: string,
  dishIds: string[],
  kind: "RECIPE" | "PART",
): Promise<Map<string, Date | null>> {
  const result = new Map<string, Date | null>();
  if (dishIds.length === 0) return result;

  function considerCandidate(dishId: string | null, endedAt: Date | null) {
    if (!dishId || !endedAt) return;
    const existing = result.get(dishId);
    if (!existing || endedAt > existing) result.set(dishId, endedAt);
  }

  const standaloneRows = await prisma.cookingSession.findMany({
    where: { dishId: { in: dishIds }, state: "COMPLETED" },
    select: { dishId: true, endedAt: true },
  });
  for (const row of standaloneRows) considerCandidate(row.dishId, row.endedAt);

  if (kind === "PART") {
    const usageRows = await prisma.cookingSessionPartUsage.findMany({
      where: {
        partDishId: { in: dishIds },
        unit: { removedAt: null },
        session: { ownerId, state: "COMPLETED" },
      },
      select: { partDishId: true, session: { select: { endedAt: true } } },
    });
    for (const row of usageRows) {
      considerCandidate(row.partDishId, row.session.endedAt);
    }
  }

  for (const dishId of dishIds) {
    if (!result.has(dishId)) result.set(dishId, null);
  }
  return result;
}

export type PartHistoryOccurrenceView = {
  partVersionLabelSnapshot: string;
  pathSnapshot: string | null;
  relation: PartUsageOccurrenceRelation | null;
};

export type PartHistoryEvent = {
  sessionId: string;
  state: "COMPLETED" | "ENDED_EARLY";
  endedAt: Date;
  isStandalone: boolean;
  dishTitle: string;
  occurrences: PartHistoryOccurrenceView[];
};

/**
 * PRODUCT_SPEC.md §41.4/§41.5 — a Part's own cooking history, not only its
 * Last-cooked timestamp: standalone sessions for the Part itself (both
 * outcomes, matching §41.5's general "both remain visible in history"), plus
 * every Completed Recipe/parent-Part session that used this exact Part
 * Version through a still-active unit. Multiple occurrences of the same
 * Part within one session (e.g. used both directly and nested) collapse
 * into a single event with a summarized occurrence list, never duplicate
 * history rows for the same session.
 */
export async function getPartCookingHistory(
  ownerId: string,
  partDishId: string,
): Promise<PartHistoryEvent[]> {
  const standaloneSessions = await prisma.cookingSession.findMany({
    where: {
      ownerId,
      dishId: partDishId,
      state: { in: ["COMPLETED", "ENDED_EARLY"] },
    },
    orderBy: { endedAt: "desc" },
    select: { id: true, state: true, endedAt: true, dishVersionId: true },
  });
  const standaloneVersionIds = [
    ...new Set(standaloneSessions.map((s) => s.dishVersionId)),
  ];
  const standaloneVersions = standaloneVersionIds.length
    ? await prisma.dishVersion.findMany({
        where: { id: { in: standaloneVersionIds } },
        select: { id: true, majorVersion: true, minorVersion: true },
      })
    : [];
  const versionById = new Map(standaloneVersions.map((v) => [v.id, v]));

  const usageRows = await prisma.cookingSessionPartUsage.findMany({
    where: {
      partDishId,
      unit: { removedAt: null },
      session: { ownerId, state: "COMPLETED" },
    },
    select: {
      sessionId: true,
      partVersionLabelSnapshot: true,
      pathSnapshot: true,
      relation: true,
      session: { select: { endedAt: true, dishId: true } },
    },
  });
  const rootDishIds = [...new Set(usageRows.map((r) => r.session.dishId))];
  const rootDishes = rootDishIds.length
    ? await prisma.dish.findMany({
        where: { id: { in: rootDishIds } },
        select: { id: true, currentTitle: true },
      })
    : [];
  const rootDishTitleById = new Map(
    rootDishes.map((d) => [d.id, d.currentTitle ?? "Deleted item"]),
  );

  const usageBySession = new Map<string, typeof usageRows>();
  for (const row of usageRows) {
    const list = usageBySession.get(row.sessionId) ?? [];
    list.push(row);
    usageBySession.set(row.sessionId, list);
  }

  const events: PartHistoryEvent[] = [];

  for (const session of standaloneSessions) {
    if (!session.endedAt) continue;
    const version = versionById.get(session.dishVersionId);
    events.push({
      sessionId: session.id,
      state: session.state as "COMPLETED" | "ENDED_EARLY",
      endedAt: session.endedAt,
      isStandalone: true,
      dishTitle: "This Part",
      occurrences: [
        {
          partVersionLabelSnapshot: version
            ? versionLabel(version.majorVersion, version.minorVersion)
            : "—",
          pathSnapshot: null,
          relation: null,
        },
      ],
    });
  }

  for (const [sessionId, rows] of usageBySession) {
    const endedAt = rows[0]!.session.endedAt;
    if (!endedAt) continue;
    events.push({
      sessionId,
      state: "COMPLETED",
      endedAt,
      isStandalone: false,
      dishTitle:
        rootDishTitleById.get(rows[0]!.session.dishId) ?? "Deleted item",
      occurrences: rows.map((r) => ({
        partVersionLabelSnapshot: r.partVersionLabelSnapshot,
        pathSnapshot: r.pathSnapshot,
        relation: r.relation,
      })),
    });
  }

  return events.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
}

const QUANTITY_CONFLICT_TOLERANCE = 0.01;

export type ChecklistItemConflict =
  | { type: "needs-more"; amount: number }
  | { type: "exceeds"; amount: number }
  | null;

/**
 * PRODUCT_SPEC.md §24.5 — purely derived, never persisted: compares a
 * checked item's snapshotted `checkedQuantity` (the amount in effect when it
 * was checked) against what the *current* scale now requires. Scaling up
 * flags "needs more" (checked amount is now short); scaling down flags
 * "exceeds" (checked amount now exceeds the target) without ever implying
 * the excess can or should be removed (§24.5's own wording). Returns null
 * for unchecked items, free-text/quantity-less items, and negligible
 * floating-point noise within tolerance.
 */
export function computeChecklistItemConflict(
  baseQuantity: number | null,
  checkedQuantity: number | null,
  effectiveMultiplier: number,
): ChecklistItemConflict {
  if (baseQuantity == null || checkedQuantity == null) return null;
  const currentQuantity = scaleQuantity(baseQuantity, effectiveMultiplier);
  const delta = currentQuantity - checkedQuantity;
  if (delta > QUANTITY_CONFLICT_TOLERANCE) {
    return { type: "needs-more", amount: delta };
  }
  if (delta < -QUANTITY_CONFLICT_TOLERANCE) {
    return { type: "exceeds", amount: -delta };
  }
  return null;
}
