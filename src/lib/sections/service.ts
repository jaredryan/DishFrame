import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  getOwnedDishOrThrow,
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { assertNoPartCycle } from "@/lib/cycles/service";
import { scaleIngredientQuantity } from "@/lib/units/scaling";
import { sortByPosition } from "@/lib/dishes/schema";
import type {
  SectionInput,
  PartLinkInput,
  IngredientInput,
  DishKindValue,
} from "@/lib/dishes/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) for
 * Part attach/detach validation and target-validity checks. Build Plan
 * Review Gate 3's propagation and deletion-materialization live in
 * `dishes/service.ts` (Build Plan's own module attribution: "`dishes/
 * actions.ts` gains `propagatePartUpdate`... `resolvePartUsageBeforeDelete`,
 * `deletePart`"). Part-creation (the "Create Part"/"Convert Section to
 * Part" flows) is deliberately NOT a function here — per the settled Gate 3
 * decision, both flows persist the new standalone Part via the existing,
 * ordinary `createDish(ownerId, "PART", ...)` (`dishes/service.ts`), and
 * only ever touch the parent container's *local draft* (a client-side
 * form-state change), never a second combined-transaction "create and
 * link" primitive — that pre-gate primitive (`promoteLocalContentToPart`)
 * saved the parent immediately, which is exactly the UX Gate 3 corrected
 * away from ("keep the user in the parent editor... the Recipe or parent
 * Version is created only when the user performs its normal Save action").
 */

export type PartLinkDisplayInfo = {
  title: string | null;
  majorVersion: number;
  minorVersion: number;
};

/**
 * PRODUCT_SPEC.md §68.5: a linked Part's *displayed name* is always a live
 * lookup against the target's current stable identity (`Dish.currentTitle`)
 * — never cached in form state or pinned at attach time — while its linked
 * *content* stays pinned to the exact `targetDishVersionId` (unaffected by
 * a later rename). Used by the editor to render each linked-Part row.
 */
export async function resolvePartLinkDisplayInfo(
  ownerId: string,
  targetDishId: string,
  targetDishVersionId: string,
): Promise<PartLinkDisplayInfo> {
  const targetDish = await prisma.dish.findFirst({
    where: { id: targetDishId, ownerId, kind: "PART" },
    select: { currentTitle: true },
  });
  if (!targetDish) {
    throw new NotFoundError("Part not found.");
  }
  const version = await prisma.dishVersion.findFirst({
    where: { id: targetDishVersionId, dishId: targetDishId },
    select: { majorVersion: true, minorVersion: true },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }
  return {
    title: targetDish.currentTitle,
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
  };
}

/**
 * PRODUCT_SPEC.md §68.1: the full Version history of a Part a caller may
 * attach — powers the picker's "choose a historical Version" option.
 */
export async function listAttachablePartVersions(
  ownerId: string,
  targetDishId: string,
) {
  await getOwnedDishOrThrow(ownerId, targetDishId, "PART");
  return prisma.dishVersion.findMany({
    where: { dishId: targetDishId },
    select: { id: true, majorVersion: true, minorVersion: true },
    orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
  });
}

export type PartAttachmentTarget = {
  targetDish: { id: string; currentTitle: string | null };
  targetVersion: { id: string; majorVersion: number; minorVersion: number };
};

/**
 * PRODUCT_SPEC.md §68.1/ARCHITECTURE_PROPOSAL.md §G.4: the attach-time
 * validation call — resolves the target Part and Version (defaulting to
 * current, per §68.1), confirms ownership, and runs the lightweight
 * single-target cycle check when attaching into an already-existing Part.
 * Never persists anything; the actual `PartLink` row is only ever written
 * as part of the container's own next `editDish` save.
 */
export async function validatePartAttachment(
  ownerId: string,
  container: { dishId: string | null; kind: DishKindValue },
  targetDishId: string,
  targetDishVersionId: string | undefined,
): Promise<PartAttachmentTarget> {
  const targetDish = await prisma.dish.findFirst({
    where: { id: targetDishId, ownerId, kind: "PART" },
  });
  if (!targetDish) {
    throw new NotFoundError("Part not found.");
  }

  // Cheap, immediate self-attach guard — the real identity-level cycle
  // check below (and editDish's authoritative re-check at save time) would
  // catch this too, but rejecting it before even querying the graph gives
  // faster feedback for the single most common mistake.
  if (container.dishId && container.dishId === targetDish.id) {
    throw new ValidationError(
      "A Part cannot contain itself, directly or indirectly.",
    );
  }

  const versionId = targetDishVersionId ?? targetDish.currentVersionId;
  if (!versionId) {
    throw new NotFoundError("This Part has no saved content to attach yet.");
  }

  const targetVersion = await prisma.dishVersion.findFirst({
    where: { id: versionId, dishId: targetDish.id },
    select: { id: true, majorVersion: true, minorVersion: true },
  });
  if (!targetVersion) {
    throw new NotFoundError("Version not found.");
  }

  // Only a Part being edited can ever contain a cycle (a Recipe can never
  // be a PartLink target, so it can never appear in anyone's reachable
  // set — ARCHITECTURE_PROPOSAL.md §D.6/§G.2). A brand-new, not-yet-saved
  // item (`container.dishId === null`) has no existing PartLinks anything
  // could form a cycle with yet.
  if (container.kind === "PART" && container.dishId) {
    await assertNoPartCycle(prisma, container.dishId, [
      { targetDishId: targetDish.id, targetDishVersionId: targetVersion.id },
    ]);
  }

  return {
    targetDish: { id: targetDish.id, currentTitle: targetDish.currentTitle },
    targetVersion,
  };
}

export type DetachedContent = {
  sections: SectionInput[];
  partLinks: PartLinkInput[];
};

function stripLineage(content: DetachedContent): DetachedContent {
  return {
    sections: content.sections.map((section) => ({
      ...section,
      lineageId: undefined,
      ingredients: section.ingredients.map((ingredient) => ({
        ...ingredient,
        lineageId: undefined,
        substitute: ingredient.substitute
          ? { ...ingredient.substitute, lineageId: undefined }
          : ingredient.substitute,
      })),
      instructions: section.instructions.map((instruction) => ({
        ...instruction,
        lineageId: undefined,
      })),
      partLinks: section.partLinks.map((link) => ({
        ...link,
        lineageId: undefined,
      })),
    })),
    partLinks: content.partLinks.map((link) => ({
      ...link,
      lineageId: undefined,
    })),
  };
}

/**
 * Slice 6 post-gate, PartLink multiplier requirements: "detachment applies
 * it to localized quantities" — scales every Ingredient/substitute quantity
 * in the resolved content by the occurrence's multiplier, via the existing
 * scaling utility (`scaleIngredientQuantity`), so the freshly-localized
 * content preserves the parent's actual cooking meaning (e.g. a multiplier
 * of 1.5 on "2 cups rice" localizes to "3 cups rice", not "2 cups").
 * `1` is a safe no-op multiplier — every other caller (this function's own
 * unit tests, any future non-multiplier detach path) is unaffected.
 */
function scaleIngredientInput<
  T extends {
    quantity?: number | null;
    quantityEnd?: number | null;
    isApproximate: boolean;
    displayText?: string | null;
  },
>(ingredient: T, multiplier: number): T {
  const scaled = scaleIngredientQuantity(
    {
      quantity: ingredient.quantity ?? null,
      quantityEnd: ingredient.quantityEnd ?? null,
      isApproximate: ingredient.isApproximate,
      displayText: ingredient.displayText ?? null,
    },
    multiplier,
  );
  return {
    ...ingredient,
    quantity: scaled.quantity,
    quantityEnd: scaled.quantityEnd,
  };
}

function applyMultiplier(
  content: DetachedContent,
  multiplier: number,
): DetachedContent {
  if (multiplier === 1) return content;
  return {
    sections: content.sections.map((section) => ({
      ...section,
      ingredients: section.ingredients.map((ingredient) => ({
        ...scaleIngredientInput(ingredient, multiplier),
        substitute: ingredient.substitute
          ? scaleIngredientInput(ingredient.substitute, multiplier)
          : ingredient.substitute,
      })),
    })),
    partLinks: content.partLinks,
  };
}

/**
 * PRODUCT_SPEC.md §70.1: "copies the exact linked Part Version's resolved
 * content." Resolves one level (shallow, matching ARCHITECTURE_PROPOSAL.md
 * §G.5's editor-facing access pattern) — the target Version's own Sections
 * (with their Ingredients/Instructions) and its own linked Parts (top-level
 * and nested), promoted up one level into the container. A linked Part
 * found inside the detached content remains a live link to its own further
 * target; only the one occurrence the user actually detached stops being
 * live — this is the settled "shallow detachment" decision: the nested
 * graph is never recursively detached automatically, and each nested link
 * remains separately detachable afterward. Every row's `lineageId` is
 * stripped so the editor always treats this as brand-new local content,
 * never confusable with the source Part's own lineage (§70.1's "ends
 * future Part-update suggestions for that occurrence"). `multiplier` is the
 * detached occurrence's own `PartLink.multiplier` (default 1 = no-op).
 */
export async function resolvePartVersionForDetach(
  ownerId: string,
  targetDishVersionId: string,
  multiplier = 1,
): Promise<DetachedContent> {
  const version = await prisma.dishVersion.findFirst({
    where: { id: targetDishVersionId, dish: { ownerId, kind: "PART" } },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }

  return applyMultiplier(
    stripLineage(versionContentToInput(version.sections, version.partLinks)),
    multiplier,
  );
}

/**
 * Slice 6 post-gate, settled Review Gate 3 decisions: the authoritative
 * server-side check that every proposed PartLink target (top-level and
 * Section-nested, across a whole proposed Version) is a real, owned Part —
 * "server-side validation rejects: a Recipe used as a PartLink target; a
 * target Version that does not belong to the supplied target Part." Called
 * from `dishes/service.ts`'s `createDish`/`editDish` before insert — the
 * attach-time picker (`validatePartAttachment`) already filters to
 * `kind: "PART"` for immediate feedback, but this is the save-time
 * authority a client cannot bypass, mirroring the cycle check's own
 * attach-time/save-time split (Arch §G.4).
 *
 * The database's own composite FK (`PartLinkTarget`, schema.prisma §D.6)
 * would also reject a version/dish mismatch at insert time — this check
 * exists to surface a clear domain error instead of a raw FK-violation
 * error reaching the user.
 */
export async function assertValidPartLinkTargets(
  client: Prisma.TransactionClient | typeof prisma,
  ownerId: string,
  edges: { targetDishId: string; targetDishVersionId: string }[],
): Promise<void> {
  if (edges.length === 0) return;

  const distinctDishIds = [...new Set(edges.map((edge) => edge.targetDishId))];
  const dishes = await client.dish.findMany({
    where: { id: { in: distinctDishIds } },
    select: { id: true, ownerId: true, kind: true },
  });
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

  for (const edge of edges) {
    const targetDish = dishById.get(edge.targetDishId);
    if (!targetDish || targetDish.ownerId !== ownerId) {
      throw new NotFoundError("A linked Part could not be found.");
    }
    if (targetDish.kind !== "PART") {
      throw new ValidationError("A Recipe cannot be used as a linked Part.");
    }
  }

  const distinctVersionIds = [
    ...new Set(edges.map((edge) => edge.targetDishVersionId)),
  ];
  const versions = await client.dishVersion.findMany({
    where: { id: { in: distinctVersionIds } },
    select: { id: true, dishId: true },
  });
  const dishIdByVersionId = new Map(
    versions.map((version) => [version.id, version.dishId]),
  );

  for (const edge of edges) {
    if (dishIdByVersionId.get(edge.targetDishVersionId) !== edge.targetDishId) {
      throw new ValidationError(
        "A linked Part's selected Version does not belong to that Part.",
      );
    }
  }
}

export type ResolvedIngredient = {
  name: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
  isOptional: boolean;
  substitute: ResolvedIngredient | null;
};

export type ResolvedSection = {
  name: string | null;
  guidanceNote: string | null;
  ingredients: ResolvedIngredient[];
  instructions: { text: string }[];
  partLinks: PartLinkTree[];
};

// PRODUCT_SPEC.md §67.4/§68.6 (Slice 6 post-gate): "a PartLink renders its
// pinned Version's full cooking content inline... nested Parts should also
// render inline with clear nesting." One recursive edge → resolved-tree
// resolver, shared by the Recipe/Part detail page (server-rendered, whole
// tree eager) and the editor's expand-on-demand preview (`getPartLinkPreview`
// action, one edge at a time). `title` is the target's *live*
// `Dish.currentTitle` (§68.5), not anything pinned at attach time.
export type PartLinkTree = {
  targetDishId: string;
  targetDishVersionId: string;
  multiplier: number;
  title: string | null;
  majorVersion: number;
  minorVersion: number;
  sections: ResolvedSection[];
  partLinks: PartLinkTree[];
};

function toResolvedIngredient(ingredient: IngredientInput): ResolvedIngredient {
  return {
    name: ingredient.name,
    quantity: ingredient.quantity ?? null,
    quantityEnd: ingredient.quantityEnd ?? null,
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit ?? null,
    displayText: ingredient.displayText ?? null,
    preparationNote: ingredient.preparationNote ?? null,
    isOptional: ingredient.isOptional,
    // A substitute is itself one Ingredient-shaped row but never carries its
    // own isOptional/substitute (§11.4: "one level only").
    substitute: ingredient.substitute
      ? {
          name: ingredient.substitute.name,
          quantity: ingredient.substitute.quantity ?? null,
          quantityEnd: ingredient.substitute.quantityEnd ?? null,
          isApproximate: ingredient.substitute.isApproximate,
          unit: ingredient.substitute.unit ?? null,
          displayText: ingredient.substitute.displayText ?? null,
          preparationNote: ingredient.substitute.preparationNote ?? null,
          isOptional: false,
          substitute: null,
        }
      : null,
  };
}

// Cycle prevention already rejects a real cycle at write time
// (`assertNoPartCycle`) — this is defense-in-depth so a rendering pass can
// never infinite-loop even against a row a bug somehow let through.
const MAX_PART_LINK_TREE_DEPTH = 12;

async function resolvePartLinkTreeInner(
  ownerId: string,
  edge: {
    targetDishId: string;
    targetDishVersionId: string;
    multiplier: number;
  },
  visited: Set<string>,
  depth: number,
): Promise<PartLinkTree | null> {
  if (depth >= MAX_PART_LINK_TREE_DEPTH || visited.has(edge.targetDishId)) {
    return null;
  }
  const targetDish = await prisma.dish.findFirst({
    where: { id: edge.targetDishId, ownerId, kind: "PART" },
    select: { currentTitle: true },
  });
  if (!targetDish) return null;

  const version = await prisma.dishVersion.findFirst({
    where: { id: edge.targetDishVersionId, dishId: edge.targetDishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!version) return null;

  const nextVisited = new Set(visited);
  nextVisited.add(edge.targetDishId);

  const { sections, partLinks } = versionContentToInput(
    version.sections,
    version.partLinks,
  );

  async function resolveLinks(links: PartLinkInput[]): Promise<PartLinkTree[]> {
    const resolved = await Promise.all(
      sortByPosition(links).map((link) =>
        resolvePartLinkTreeInner(
          ownerId,
          {
            targetDishId: link.targetDishId,
            targetDishVersionId: link.targetDishVersionId,
            multiplier: link.multiplier,
          },
          nextVisited,
          depth + 1,
        ),
      ),
    );
    return resolved.filter((tree): tree is PartLinkTree => tree !== null);
  }

  const resolvedSections: ResolvedSection[] = [];
  for (const section of sortByPosition(sections)) {
    resolvedSections.push({
      name: section.name ?? null,
      guidanceNote: section.guidanceNote ?? null,
      ingredients: section.ingredients.map(toResolvedIngredient),
      instructions: section.instructions.map((instruction) => ({
        text: instruction.text,
      })),
      partLinks: await resolveLinks(section.partLinks),
    });
  }

  return {
    targetDishId: edge.targetDishId,
    targetDishVersionId: edge.targetDishVersionId,
    multiplier: edge.multiplier,
    title: targetDish.currentTitle,
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
    sections: resolvedSections,
    partLinks: await resolveLinks(partLinks),
  };
}

/** Resolves one PartLink occurrence's full nested content — `null` if the
 * target no longer exists/isn't owned (a stale link renders as nothing
 * rather than throwing, since a detail page shouldn't 500 over one broken
 * nested reference). */
export async function resolvePartLinkTree(
  ownerId: string,
  edge: {
    targetDishId: string;
    targetDishVersionId: string;
    multiplier: number;
  },
): Promise<PartLinkTree | null> {
  return resolvePartLinkTreeInner(ownerId, edge, new Set(), 0);
}

/** Resolves several top-level edges, in the caller's given order. */
export async function resolvePartLinkTrees(
  ownerId: string,
  edges: {
    targetDishId: string;
    targetDishVersionId: string;
    multiplier: number;
  }[],
): Promise<PartLinkTree[]> {
  const resolved = await Promise.all(
    edges.map((edge) => resolvePartLinkTreeInner(ownerId, edge, new Set(), 0)),
  );
  return resolved.filter((tree): tree is PartLinkTree => tree !== null);
}
