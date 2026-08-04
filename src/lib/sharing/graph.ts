import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { toIngredientInput } from "@/lib/dishes/mappers";
import { sectionContentInclude } from "@/lib/dishes/queries";
import type {
  SectionInput,
  DishKindValue,
  VersionContentInput,
} from "@/lib/dishes/schema";
import type { $Enums, Prisma } from "@/generated/prisma/client";

/**
 * ARCHITECTURE_PROPOSAL.md §G.5's "fully resolved" access pattern, built for
 * sharing (Gate 7 §2.6): deliberately **not** owner-scoped, unlike
 * `sections/service.ts`'s `resolvePartLinkTrees` — reading another account's
 * content by exact `(dishId, dishVersionId)` is precisely what a share is,
 * whether the reader is an anonymous public viewer or the copy engine
 * building a recipient's independent graph. Authorization for *which*
 * root to resolve happens one layer up (a verified share token or an
 * accepted `DirectShare`), never here.
 *
 * Nodes are keyed by `versionId` in a plain `Map`, so a version referenced
 * more than once anywhere in the graph is fetched and resolved exactly
 * once (Gate 7 §2.6's "one copied Part identity per stable source Part" /
 * "every distinct referenced Version copied once" both fall out of this for
 * free). `order` is the post-order visitation sequence (every child fully
 * resolved before the node that references it), which is exactly the order
 * the copy engine needs to create recipient rows bottom-up.
 *
 * Correction pass: a container's direct `PartLink`s can be `LIVE` (points
 * at a real, still-existing Part Version — the ordinary case) or
 * `MATERIALIZED` (the Part was later deleted while this occurrence was
 * historical, ARCHITECTURE_PROPOSAL.md §H's materialization table,
 * `dishes/service.ts`'s `deletePart` Phase 2) — a frozen, in-place-rewritten
 * snapshot of the exact content the container displayed at that moment. A
 * `FIXED_SNAPSHOT` share of a historical Version can absolutely reach a
 * MATERIALIZED occurrence (Product Spec §83.3 — "works for current or
 * historical Versions"); `CURRENT` never can (`deletePart` refuses to
 * materialize a still-*current* usage — Phase 1 must resolve it first — so
 * a Dish's `currentVersionId` can never carry a MATERIALIZED link). Both
 * kinds are represented explicitly (`ShareGraphPartLinkRef`) rather than
 * silently dropping MATERIALIZED ones the way the pre-correction version of
 * this file did (inheriting `dishes/queries.ts`'s `partLinkContentInclude`,
 * which filters to `LIVE` only for its own, unrelated callers).
 */

export type ShareGraphLivePartLinkRef = {
  kind: "LIVE";
  targetDishId: string;
  targetDishVersionId: string;
  position: number;
  multiplier: number;
};

export type ShareGraphMaterializedPartLinkRef = {
  kind: "MATERIALIZED";
  position: number;
  multiplier: number;
  materializedTitle: string | null;
  materializedVersionLabel: string | null;
  /** Same frozen `VersionContentInput` shape `resolveMaterializedSnapshot`
   * writes (`dishes/service.ts`) — this snapshot's own nested PartLinks are
   * always LIVE-shaped pointers at still-existing rows (only the root of a
   * materialized occurrence is itself frozen; materialization never
   * recurses), so they're walked into this same graph like any other child
   * reference. */
  materializedContent: VersionContentInput;
};

export type ShareGraphPartLinkRef =
  ShareGraphLivePartLinkRef | ShareGraphMaterializedPartLinkRef;

export type ShareGraphSection = Omit<SectionInput, "partLinks"> & {
  partLinks: ShareGraphPartLinkRef[];
};

export type ShareGraphNode = {
  dishId: string;
  dishKind: DishKindValue;
  dishCuisine: string | null;
  dishTitle: string;
  versionId: string;
  majorVersion: number;
  minorVersion: number;
  description: string | null;
  imageAssetId: string | null;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nutritionBasis: $Enums.NutritionBasis | null;
  nutritionBasisQuantity: number | null;
  nutritionBasisUnit: string | null;
  moreNutrients: Prisma.JsonValue | null;
  nutritionSourceProvider: string | null;
  nutritionSourceId: string | null;
  nutritionSourceName: string | null;
  sections: ShareGraphSection[];
  topLevelPartLinks: ShareGraphPartLinkRef[];
};

export type ShareGraph = {
  nodes: Map<string, ShareGraphNode>;
  /** Post-order: every node's children appear before it. */
  order: string[];
  rootVersionId: string;
};

// Defense-in-depth only (ARCHITECTURE_PROPOSAL.md §G.2/§G.6) — authored
// Part cycles are already rejected at write time, and a version-level DAG
// cannot loop by construction, so this can only ever fire against a latent
// bug, never a legitimate composition.
const MAX_SHARE_GRAPH_DEPTH = 50;

type RawPartLinkRow = {
  sectionId: string | null;
  position: number;
  multiplier: Prisma.Decimal;
  linkState: $Enums.PartLinkState;
  targetDishId: string | null;
  targetDishVersionId: string | null;
  materializedTitle: string | null;
  materializedVersionLabel: string | null;
  materializedContent: Prisma.JsonValue | null;
};

function toPartLinkRef(row: RawPartLinkRow): ShareGraphPartLinkRef {
  const multiplier = decimalToNumber(row.multiplier) ?? 1;
  if (row.linkState === "MATERIALIZED") {
    return {
      kind: "MATERIALIZED",
      position: row.position,
      multiplier,
      materializedTitle: row.materializedTitle,
      materializedVersionLabel: row.materializedVersionLabel,
      // Same cast `sections/service.ts`'s `resolveMaterializedPartLinkTree`
      // already relies on — every MATERIALIZED row is written with a
      // snapshot in the same transaction (`dishes/service.ts`'s
      // `deletePart`), so this is never actually null in practice.
      materializedContent: row.materializedContent as VersionContentInput,
    };
  }
  if (!row.targetDishId || !row.targetDishVersionId) {
    throw new Error(
      "A LIVE PartLink row must have both targetDishId and targetDishVersionId set.",
    );
  }
  return {
    kind: "LIVE",
    targetDishId: row.targetDishId,
    targetDishVersionId: row.targetDishVersionId,
    position: row.position,
    multiplier,
  };
}

function bucketPartLinkRefs(rows: RawPartLinkRow[]): {
  topLevel: ShareGraphPartLinkRef[];
  bySectionId: Map<string, ShareGraphPartLinkRef[]>;
} {
  const topLevel: ShareGraphPartLinkRef[] = [];
  const bySectionId = new Map<string, ShareGraphPartLinkRef[]>();
  for (const row of rows) {
    const ref = toPartLinkRef(row);
    if (row.sectionId === null) {
      topLevel.push(ref);
    } else {
      const list = bySectionId.get(row.sectionId) ?? [];
      list.push(ref);
      bySectionId.set(row.sectionId, list);
    }
  }
  return { topLevel, bySectionId };
}

/** Every LIVE target reachable from a list of refs — top-level container
 * refs, or a MATERIALIZED occurrence's own embedded (always-LIVE-shaped)
 * nested refs. */
function collectLiveTargets(
  refs: Array<{
    kind?: undefined;
    targetDishId: string;
    targetDishVersionId: string;
  }>,
): Array<{ targetDishId: string; targetDishVersionId: string }> {
  return refs.map((ref) => ({
    targetDishId: ref.targetDishId,
    targetDishVersionId: ref.targetDishVersionId,
  }));
}

function collectChildRefs(
  sections: ShareGraphSection[],
  topLevelPartLinks: ShareGraphPartLinkRef[],
): Array<{ targetDishId: string; targetDishVersionId: string }> {
  const refs: Array<{ targetDishId: string; targetDishVersionId: string }> = [];
  for (const ref of [
    ...topLevelPartLinks,
    ...sections.flatMap((section) => section.partLinks),
  ]) {
    if (ref.kind === "LIVE") {
      refs.push({
        targetDishId: ref.targetDishId,
        targetDishVersionId: ref.targetDishVersionId,
      });
    } else {
      refs.push(
        ...collectLiveTargets(ref.materializedContent.partLinks),
        ...ref.materializedContent.sections.flatMap((section) =>
          collectLiveTargets(section.partLinks),
        ),
      );
    }
  }
  return refs;
}

export async function buildShareGraph(
  rootDishId: string,
  rootVersionId: string,
): Promise<ShareGraph> {
  const nodes = new Map<string, ShareGraphNode>();
  const order: string[] = [];

  async function visit(
    dishId: string,
    versionId: string,
    depth: number,
  ): Promise<void> {
    if (nodes.has(versionId)) return;
    if (depth > MAX_SHARE_GRAPH_DEPTH) {
      throw new ValidationError(
        "This item's nested Parts are too deeply structured to share.",
      );
    }

    const [dish, version, partLinkRows] = await Promise.all([
      prisma.dish.findUnique({
        where: { id: dishId },
        select: { kind: true, cuisine: true, currentTitle: true },
      }),
      prisma.dishVersion.findFirst({
        where: { id: versionId, dishId },
        include: { sections: sectionContentInclude },
      }),
      // Deliberately not `dishes/queries.ts`'s `partLinkContentInclude` —
      // that select filters to `linkState: "LIVE"` for its own callers
      // (the owner-scoped editor/detail-view resolvers). Sharing needs
      // both kinds (see module doc comment above).
      prisma.partLink.findMany({
        where: { containerVersionId: versionId },
        orderBy: { position: "asc" },
        select: {
          sectionId: true,
          position: true,
          multiplier: true,
          linkState: true,
          targetDishId: true,
          targetDishVersionId: true,
          materializedTitle: true,
          materializedVersionLabel: true,
          materializedContent: true,
        },
      }),
    ]);
    if (!dish) throw new NotFoundError("A linked Part is no longer available.");
    if (!version)
      throw new NotFoundError("A linked Part Version is no longer available.");

    const { topLevel: topLevelPartLinks, bySectionId } =
      bucketPartLinkRefs(partLinkRows);
    const sections: ShareGraphSection[] = version.sections.map((section) => ({
      lineageId: section.lineageId,
      name: section.name,
      guidanceNote: section.guidanceNote,
      position: section.position,
      ingredients: section.ingredients
        .filter((ingredient) => ingredient.substituteForIngredientId === null)
        .map(toIngredientInput),
      instructions: section.instructions.map((instruction) => ({
        lineageId: instruction.lineageId,
        text: instruction.text,
      })),
      partLinks: bySectionId.get(section.id) ?? [],
    }));

    for (const ref of collectChildRefs(sections, topLevelPartLinks)) {
      await visit(ref.targetDishId, ref.targetDishVersionId, depth + 1);
    }

    nodes.set(versionId, {
      dishId,
      dishKind: dish.kind,
      dishCuisine: dish.cuisine,
      dishTitle: dish.currentTitle ?? version.title,
      versionId: version.id,
      majorVersion: version.majorVersion,
      minorVersion: version.minorVersion,
      description: version.description,
      imageAssetId: version.imageAssetId,
      yieldQuantity: decimalToNumber(version.yieldQuantity),
      yieldUnit: version.yieldUnit,
      prepTimeMinutes: version.prepTimeMinutes,
      cookTimeMinutes: version.cookTimeMinutes,
      difficulty: version.difficulty,
      calories: decimalToNumber(version.calories),
      protein: decimalToNumber(version.protein),
      carbs: decimalToNumber(version.carbs),
      fat: decimalToNumber(version.fat),
      nutritionBasis: version.nutritionBasis,
      nutritionBasisQuantity: decimalToNumber(version.nutritionBasisQuantity),
      nutritionBasisUnit: version.nutritionBasisUnit,
      moreNutrients: version.moreNutrients,
      nutritionSourceProvider: version.nutritionSourceProvider,
      nutritionSourceId: version.nutritionSourceId,
      nutritionSourceName: version.nutritionSourceName,
      sections,
      topLevelPartLinks,
    });
    order.push(versionId);
  }

  await visit(rootDishId, rootVersionId, 0);

  return { nodes, order, rootVersionId };
}

/** Every distinct `ImageAsset` id reachable anywhere in the graph — used
 * both to embed in a fixed snapshot (Gate 7 §2.5) and to authorize the
 * public image route for a current-mode link. */
export function collectGraphImageAssetIds(graph: ShareGraph): string[] {
  const ids = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.imageAssetId) ids.add(node.imageAssetId);
  }
  return [...ids];
}
