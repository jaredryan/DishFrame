import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getDuplicationRatingSnapshot } from "@/lib/reviews/queries";
import type {
  ShareGraph,
  ShareGraphNode,
  ShareGraphPartLinkRef,
  ShareGraphMaterializedPartLinkRef,
} from "@/lib/sharing/graph";
import type {
  DishKindValue,
  SectionInput,
  InstructionInput,
  PartLinkInput,
} from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §83.5: the one explicit whitelist every public share
 * renders through — never a raw Dish/DishVersion serialization with fields
 * removed after the fact (Slice 16's own "poison field" discipline, same as
 * the Slice 11 export DTOs). Anything not named here (Taster identities,
 * individual ratings, Cooking notes, Session Reviews, Cooking Session
 * history, private Version history, active sessions, grocery lists, Meal
 * Plans, Stage) is excluded by construction, not by a removal step.
 *
 * This same shape is used two ways: built once and stored verbatim in
 * `ShareLink.frozenSnapshot` for a `FIXED_SNAPSHOT` link (never rebuilt
 * afterward — Arch §H's "denormalized JSON captured once at link-creation
 * time"), or rebuilt fresh on every view for a `CURRENT` link. Attribution
 * (`creatorName`) is deliberately kept OUTSIDE this shape (see
 * `queries.ts`'s `resolvePublicShare`) — it's a live, owner-toggleable
 * setting (`ShareLink.showCreatorName`), not frozen content.
 */
export type PublicIngredient = {
  name: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
  isOptional: boolean;
  substitute: Omit<PublicIngredient, "isOptional" | "substitute"> | null;
};

export type PublicSection = {
  // Shares one interleaved top-level ordering sequence with this same
  // container's own `partLinks`/`topLevelPartLinks` (schema.prisma's
  // `Section.position` comment) — carried here so a renderer can merge the
  // two back into that persisted order via
  // `orderSectionsAndTopLevelPartLinks` (`lib/dishes/display-order.ts`).
  position: number;
  name: string | null;
  guidanceNote: string | null;
  ingredients: PublicIngredient[];
  instructions: { text: string }[];
  partLinks: PublicPartLinkNode[];
};

export type PublicPartLinkNode = {
  // See `PublicSection.position` — this node's own position among its
  // container's top-level Sections/PartLinks (root `PublicShareContent` or
  // an ancestor `PublicPartLinkNode`), not a property of the linked Part
  // itself.
  position: number;
  title: string;
  versionLabel: string;
  multiplier: number;
  description: string | null;
  imageAssetId: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: string | null;
  sections: PublicSection[];
  partLinks: PublicPartLinkNode[];
};

export type PublicShareContent = {
  dishKind: DishKindValue;
  title: string;
  versionLabel: string;
  description: string | null;
  imageAssetId: string | null;
  cuisine: string | null;
  tags: string[];
  flavorProfiles: string[];
  yieldQuantity: number | null;
  yieldUnit: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: string | null;
  nutrition: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    basis: string | null;
    basisQuantity: number | null;
    basisUnit: string | null;
    sourceName: string | null;
  } | null;
  aggregateRating: number | null;
  ratingCount: number | null;
  sections: PublicSection[];
  topLevelPartLinks: PublicPartLinkNode[];
};

function hasNutritionContent(node: ShareGraphNode): boolean {
  return (
    node.calories !== null ||
    node.protein !== null ||
    node.carbs !== null ||
    node.fat !== null
  );
}

/** Renders both LIVE (a real, still-existing linked Part) and MATERIALIZED
 * (the Part was later deleted — a frozen snapshot survives, ARCHITECTURE_
 * PROPOSAL.md §H's materialization table) direct occurrences to the same
 * `PublicPartLinkNode` shape, so a public share faithfully shows whatever
 * content the container actually displayed — never silently dropping a
 * MATERIALIZED occurrence's Ingredients/Instructions/Sections. */
function toPublicPartLinkRef(
  graph: ShareGraph,
  ref: ShareGraphPartLinkRef,
): PublicPartLinkNode {
  return ref.kind === "MATERIALIZED"
    ? toPublicMaterializedPartLinkNode(graph, ref)
    : toPublicPartLinkNode(
        graph,
        ref.targetDishVersionId,
        ref.position,
        ref.multiplier,
      );
}

function toPublicSections(
  graph: ShareGraph,
  node: ShareGraphNode,
): PublicSection[] {
  return node.sections.map((section) => ({
    position: section.position,
    name: section.name ?? null,
    guidanceNote: section.guidanceNote ?? null,
    ingredients: section.ingredients.map(toPublicIngredient),
    instructions: section.instructions.map((instruction) => ({
      text: instruction.text,
    })),
    partLinks: section.partLinks.map((ref) => toPublicPartLinkRef(graph, ref)),
  }));
}

/** A MATERIALIZED occurrence's frozen `materializedContent` only ever
 * captured Sections/Ingredients/Instructions/nested-PartLinks
 * (`dishes/service.ts`'s `resolveMaterializedSnapshot`) — never
 * description/image/prep-time/cook-time/difficulty, so those stay `null`
 * here, matching the same fields `sections/service.ts`'s `PartLinkTree`
 * (the app's own historical-Version renderer) already leaves out for a
 * materialized occurrence. Its own nested PartLinks are always LIVE-shaped
 * (materialization never recurses) and already resolved into `graph.nodes`
 * by `buildShareGraph`. */
function toPublicMaterializedPartLinkNode(
  graph: ShareGraph,
  ref: ShareGraphMaterializedPartLinkRef,
): PublicPartLinkNode {
  const content = ref.materializedContent;
  return {
    position: ref.position,
    title: ref.materializedTitle ?? "Deleted Part",
    versionLabel: ref.materializedVersionLabel ?? "",
    multiplier: ref.multiplier,
    description: null,
    imageAssetId: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    sections: content.sections.map((section: SectionInput) => ({
      position: section.position,
      name: section.name ?? null,
      guidanceNote: section.guidanceNote ?? null,
      ingredients: section.ingredients.map(toPublicIngredient),
      instructions: section.instructions.map(
        (instruction: InstructionInput) => ({
          text: instruction.text,
        }),
      ),
      partLinks: section.partLinks.map((link: PartLinkInput) =>
        toPublicPartLinkNode(
          graph,
          link.targetDishVersionId,
          link.position,
          link.multiplier,
        ),
      ),
    })),
    partLinks: content.partLinks.map((link: PartLinkInput) =>
      toPublicPartLinkNode(
        graph,
        link.targetDishVersionId,
        link.position,
        link.multiplier,
      ),
    ),
  };
}

function toPublicIngredient(ingredient: {
  name: string;
  quantity?: number | null;
  quantityEnd?: number | null;
  isApproximate: boolean;
  unit?: string | null;
  displayText?: string | null;
  preparationNote?: string | null;
  isOptional: boolean;
  substitute?: {
    name: string;
    quantity?: number | null;
    quantityEnd?: number | null;
    isApproximate: boolean;
    unit?: string | null;
    displayText?: string | null;
    preparationNote?: string | null;
  } | null;
}): PublicIngredient {
  return {
    name: ingredient.name,
    quantity: ingredient.quantity ?? null,
    quantityEnd: ingredient.quantityEnd ?? null,
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit ?? null,
    displayText: ingredient.displayText ?? null,
    preparationNote: ingredient.preparationNote ?? null,
    isOptional: ingredient.isOptional,
    substitute: ingredient.substitute
      ? {
          name: ingredient.substitute.name,
          quantity: ingredient.substitute.quantity ?? null,
          quantityEnd: ingredient.substitute.quantityEnd ?? null,
          isApproximate: ingredient.substitute.isApproximate,
          unit: ingredient.substitute.unit ?? null,
          displayText: ingredient.substitute.displayText ?? null,
          preparationNote: ingredient.substitute.preparationNote ?? null,
        }
      : null,
  };
}

function toPublicPartLinkNode(
  graph: ShareGraph,
  targetVersionId: string,
  position: number,
  multiplier: number,
): PublicPartLinkNode {
  const node = graph.nodes.get(targetVersionId);
  if (!node) {
    // Defensive only — every reference `buildShareGraph` followed was
    // already resolved into `graph.nodes` before this ever runs.
    throw new Error(
      `Share graph is missing resolved node for version ${targetVersionId}.`,
    );
  }
  return {
    position,
    title: node.dishTitle,
    versionLabel: `V${node.majorVersion}.${node.minorVersion}`,
    multiplier,
    description: node.description,
    imageAssetId: node.imageAssetId,
    prepTimeMinutes: node.prepTimeMinutes,
    cookTimeMinutes: node.cookTimeMinutes,
    difficulty: node.difficulty,
    sections: toPublicSections(graph, node),
    partLinks: node.topLevelPartLinks.map((ref) =>
      toPublicPartLinkRef(graph, ref),
    ),
  };
}

/**
 * Assembles the full public whitelist shape for the graph's root item.
 * `tags`/`flavorProfiles` are read live from the root `Dish` here (they are
 * not part of `ShareGraph`, which only resolves Version-owned content) —
 * for a `FIXED_SNAPSHOT` link this only ever runs once, at creation time,
 * so the result is frozen into `frozenSnapshot` exactly like everything
 * else; a `CURRENT` link calls this fresh on every view.
 */
export async function buildPublicShareContent(
  graph: ShareGraph,
): Promise<PublicShareContent> {
  const root = graph.nodes.get(graph.rootVersionId)!;

  const [dish, ratingSnapshot] = await Promise.all([
    prisma.dish.findUnique({
      where: { id: root.dishId },
      select: {
        tags: { select: { tag: { select: { displayName: true } } } },
        flavorProfiles: {
          select: { flavorProfileValue: { select: { displayName: true } } },
        },
      },
    }),
    getDuplicationRatingSnapshot(root.dishId),
  ]);

  return {
    dishKind: root.dishKind,
    title: root.dishTitle,
    versionLabel: `V${root.majorVersion}.${root.minorVersion}`,
    description: root.description,
    imageAssetId: root.imageAssetId,
    cuisine: root.dishCuisine,
    tags: dish?.tags.map((t) => t.tag.displayName) ?? [],
    flavorProfiles:
      dish?.flavorProfiles.map((f) => f.flavorProfileValue.displayName) ?? [],
    yieldQuantity: root.yieldQuantity,
    yieldUnit: root.yieldUnit,
    prepTimeMinutes: root.prepTimeMinutes,
    cookTimeMinutes: root.cookTimeMinutes,
    difficulty: root.difficulty,
    nutrition: hasNutritionContent(root)
      ? {
          calories: root.calories,
          protein: root.protein,
          carbs: root.carbs,
          fat: root.fat,
          basis: root.nutritionBasis,
          basisQuantity: root.nutritionBasisQuantity,
          basisUnit: root.nutritionBasisUnit,
          sourceName: root.nutritionSourceName,
        }
      : null,
    aggregateRating: ratingSnapshot.aggregateRating,
    ratingCount: ratingSnapshot.ratingCount,
    sections: toPublicSections(graph, root),
    topLevelPartLinks: root.topLevelPartLinks.map((ref) =>
      toPublicPartLinkRef(graph, ref),
    ),
  };
}

/** Every distinct `ImageAsset` id embedded anywhere in an already-built
 * public content tree — stored alongside `frozenSnapshot` so the image
 * route's share-token branch never has to re-parse the whole nested tree
 * on every image request. */
export function collectPublicContentImageAssetIds(
  content: PublicShareContent,
): string[] {
  const ids = new Set<string>();
  function visitPartLink(node: PublicPartLinkNode) {
    if (node.imageAssetId) ids.add(node.imageAssetId);
    for (const section of node.sections) {
      for (const link of section.partLinks) visitPartLink(link);
    }
    for (const link of node.partLinks) visitPartLink(link);
  }
  if (content.imageAssetId) ids.add(content.imageAssetId);
  for (const section of content.sections) {
    for (const link of section.partLinks) visitPartLink(link);
  }
  for (const link of content.topLevelPartLinks) visitPartLink(link);
  return [...ids];
}
