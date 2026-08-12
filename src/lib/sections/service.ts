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
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import { sortByPosition } from "@/lib/dishes/schema";
import type {
  SectionInput,
  PartLinkInput,
  IngredientInput,
  DishKindValue,
  VersionContentInput,
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
  // Design remediation pass: the editor's linked-Part card shows the
  // pinned Version's own description directly below its header, when set.
  description: string | null;
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
    select: { majorVersion: true, minorVersion: true, description: true },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }
  return {
    title: targetDish.currentTitle,
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
    description: version.description,
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
  // This Section's slot in its container's one shared interleaved
  // Section/top-level-PartLink ordering sequence (schema.prisma's
  // `Section.position` comment) — needed so a nested Part's own content
  // (`PartLinkTreeContent`, `part-link-tree-view.tsx`) can merge it back
  // against that same container's `partLinks` via
  // `orderSectionsAndTopLevelPartLinks` (`lib/dishes/display-order.ts`).
  position: number;
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
//
// Slice 6 correction pass, §H's materialization table: a `MATERIALIZED`
// PartLink (Part deleted while still historically referenced) has no live
// target to look up — `kind` discriminates the two so a renderer can omit
// navigation/actions for a snapshot, and `targetDishId`/`targetDishVersionId`
// are nullable rather than asserted non-null for that case. `versionLabel` is
// a pre-formatted "VX.Y" for both — for `LIVE` it's computed from the live
// target's actual major/minor; for `MATERIALIZED` it's the frozen string
// captured at deletion time (`materializedVersionLabel`).
export type PartLinkTree = {
  kind: "LIVE" | "MATERIALIZED";
  targetDishId: string | null;
  targetDishVersionId: string | null;
  multiplier: number;
  title: string | null;
  versionLabel: string;
  // This tree's own slot in its container's shared interleaved
  // Section/top-level-PartLink ordering sequence, when known — populated
  // for every nested occurrence (resolved via `resolveNestedPartLinks`,
  // which always has a real persisted `position` to attach). `0` for a
  // root tree resolved directly via `resolvePartLinkTree`/
  // `resolvePartLinkTrees`/`getPartLinkPreview`, where a root's own
  // position is tracked externally by the caller (`dish-detail-view.tsx`,
  // `mergeLiveAndMaterializedTrees`) instead — nothing reads a root tree's
  // own `position` field.
  position: number;
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

// Shared by both LIVE resolution (`resolvePartLinkTreeInner`, below) and a
// `MATERIALIZED` snapshot's own nested links (`resolveMaterializedPartLinkTree`)
// — a nested link is always a live pointer at render time (only the ROOT of a
// materialized snapshot is itself frozen; what it links to may still exist),
// so both cases resolve nested occurrences identically.
async function resolveNestedPartLinks(
  ownerId: string,
  links: PartLinkInput[],
  visited: Set<string>,
  depth: number,
): Promise<PartLinkTree[]> {
  const resolved = await Promise.all(
    sortByPosition(links).map((link) =>
      resolvePartLinkTreeInner(
        ownerId,
        {
          targetDishId: link.targetDishId,
          targetDishVersionId: link.targetDishVersionId,
          multiplier: link.multiplier,
          position: link.position,
        },
        visited,
        depth + 1,
      ),
    ),
  );
  return resolved.filter((tree): tree is PartLinkTree => tree !== null);
}

async function resolvePartLinkTreeInner(
  ownerId: string,
  edge: {
    targetDishId: string;
    targetDishVersionId: string;
    multiplier: number;
    // Only known when resolved via `resolveNestedPartLinks` (a nested
    // occurrence, whose `PartLinkInput` carries a real persisted
    // position) — absent for a root edge resolved directly via
    // `resolvePartLinkTree`/`resolvePartLinkTrees`/`getPartLinkPreview`,
    // whose own position (if any) is tracked externally by the caller.
    position?: number;
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

  const resolvedSections: ResolvedSection[] = [];
  for (const section of sortByPosition(sections)) {
    resolvedSections.push({
      position: section.position,
      name: section.name ?? null,
      guidanceNote: section.guidanceNote ?? null,
      ingredients: section.ingredients.map(toResolvedIngredient),
      instructions: section.instructions.map((instruction) => ({
        text: instruction.text,
      })),
      partLinks: await resolveNestedPartLinks(
        ownerId,
        section.partLinks,
        nextVisited,
        depth,
      ),
    });
  }

  return {
    kind: "LIVE",
    targetDishId: edge.targetDishId,
    targetDishVersionId: edge.targetDishVersionId,
    multiplier: edge.multiplier,
    // Only a nested occurrence (resolved via `resolveNestedPartLinks`) has
    // a real position here — a root edge (`resolvePartLinkTree`/
    // `resolvePartLinkTrees`/`getPartLinkPreview`) has none to give, so
    // this stays an unused placeholder for those callers (see
    // `PartLinkTree.position`'s own doc comment).
    position: edge.position ?? 0,
    title: targetDish.currentTitle,
    versionLabel: formatVersionLabel(
      version.majorVersion,
      version.minorVersion,
    ),
    sections: resolvedSections,
    partLinks: await resolveNestedPartLinks(
      ownerId,
      partLinks,
      nextVisited,
      depth,
    ),
  };
}

/**
 * Resolves one `MATERIALIZED` PartLink row (Part-deletion history, §H's
 * materialization table) into the same `PartLinkTree` shape a LIVE
 * occurrence resolves to, so the read-only Version-history views can render
 * both uniformly. The snapshot's own content (`materializedContent`, frozen
 * at deletion time) is used directly — never re-fetched — but any PartLink
 * it itself contains is still a live pointer at render time (only the
 * snapshot's root Part was deleted), so those resolve through the normal
 * live path. Returns `null` only if the stored snapshot is somehow missing
 * (defensive — every MATERIALIZED row is written with a snapshot in the same
 * transaction, `dishes/service.ts`'s `deletePart`).
 */
async function resolveMaterializedPartLinkTree(
  ownerId: string,
  row: {
    multiplier: number;
    materializedTitle: string | null;
    materializedVersionLabel: string | null;
    materializedContent: unknown;
  },
): Promise<PartLinkTree | null> {
  const snapshot = row.materializedContent as VersionContentInput | null;
  if (!snapshot) return null;

  const resolvedSections: ResolvedSection[] = [];
  for (const section of sortByPosition(snapshot.sections)) {
    resolvedSections.push({
      position: section.position,
      name: section.name ?? null,
      guidanceNote: section.guidanceNote ?? null,
      ingredients: section.ingredients.map(toResolvedIngredient),
      instructions: section.instructions.map((instruction) => ({
        text: instruction.text,
      })),
      partLinks: await resolveNestedPartLinks(
        ownerId,
        section.partLinks,
        new Set(),
        0,
      ),
    });
  }

  return {
    kind: "MATERIALIZED",
    targetDishId: null,
    targetDishVersionId: null,
    multiplier: row.multiplier,
    // This root snapshot's own position (among its container's top-level
    // Sections/PartLinks) is tracked externally by the caller
    // (`resolveMaterializedPartLinkTreesForVersion`'s `{position, tree}`
    // wrapper) — unused placeholder here, same as a LIVE root tree.
    position: 0,
    title: row.materializedTitle,
    versionLabel: row.materializedVersionLabel ?? "",
    sections: resolvedSections,
    partLinks: await resolveNestedPartLinks(
      ownerId,
      snapshot.partLinks,
      new Set(),
      0,
    ),
  };
}

export type MaterializedPartLinkTrees = {
  topLevel: { position: number; tree: PartLinkTree }[];
  bySectionId: Map<string, { position: number; tree: PartLinkTree }[]>;
};

/**
 * Resolves every `MATERIALIZED` PartLink pinned to one specific
 * `DishVersion` — a historical Version-history page's one additional query
 * beyond its normal `LIVE`-only content load (`getDishScopedVersionContentOrThrow`
 * stays LIVE-only everywhere else: editing/diffing/current-Version display
 * must never see a snapshot with a null target). Grouped by `position`/
 * `sectionId` so the caller can merge them positionally alongside the LIVE
 * trees `resolvePartLinkTrees` already resolves for the same Version
 * (`mergeLiveAndMaterializedTrees`, below).
 */
export async function resolveMaterializedPartLinkTreesForVersion(
  ownerId: string,
  containerVersionId: string,
): Promise<MaterializedPartLinkTrees> {
  const rows = await prisma.partLink.findMany({
    where: { containerVersionId, linkState: "MATERIALIZED" },
    select: {
      sectionId: true,
      position: true,
      multiplier: true,
      materializedTitle: true,
      materializedVersionLabel: true,
      materializedContent: true,
    },
  });

  const topLevel: { position: number; tree: PartLinkTree }[] = [];
  const bySectionId = new Map<
    string,
    { position: number; tree: PartLinkTree }[]
  >();

  for (const row of rows) {
    const tree = await resolveMaterializedPartLinkTree(ownerId, {
      multiplier: decimalToNumber(row.multiplier) ?? 1,
      materializedTitle: row.materializedTitle,
      materializedVersionLabel: row.materializedVersionLabel,
      materializedContent: row.materializedContent,
    });
    if (!tree) continue;
    const entry = { position: row.position, tree };
    if (row.sectionId === null) {
      topLevel.push(entry);
    } else {
      const list = bySectionId.get(row.sectionId) ?? [];
      list.push(entry);
      bySectionId.set(row.sectionId, list);
    }
  }

  return { topLevel, bySectionId };
}

/**
 * Combines a bucket's (top-level, or one Section's) already-resolved LIVE
 * trees with any `MATERIALIZED` trees pinned to the same bucket into one
 * position-ordered list — so a Part deleted after being linked keeps its
 * original authored position among its surviving siblings on the read-only
 * Version-history pages. `liveEdges` supplies each LIVE tree's position
 * (matched by target identity, since `resolvePartLinkTrees` itself drops
 * stale/unresolvable entries and so can't be zipped by index).
 *
 * Returns each tree alongside its resolved `position` (rather than
 * discarding it) — for a *top-level* bucket, the caller needs it to merge
 * back against that same Version's top-level Sections via
 * `orderSectionsAndTopLevelPartLinks` (`lib/dishes/display-order.ts`), the
 * one shared merge every read-only Section/PartLink renderer uses. A
 * Section-nested bucket's caller is free to ignore `position` and just
 * read `.tree` — nested PartLinks don't interleave with anything else.
 */
export function mergeLiveAndMaterializedTrees(
  liveEdges: PartLinkInput[],
  liveTrees: PartLinkTree[],
  materialized: { position: number; tree: PartLinkTree }[],
): { position: number; tree: PartLinkTree }[] {
  const positionByTarget = new Map(
    liveEdges.map((edge) => [
      `${edge.targetDishId}:${edge.targetDishVersionId}`,
      edge.position,
    ]),
  );
  const combined = [
    ...liveTrees.map((tree) => ({
      position:
        positionByTarget.get(
          `${tree.targetDishId}:${tree.targetDishVersionId}`,
        ) ?? 0,
      tree,
    })),
    ...materialized,
  ];
  return combined.sort((a, b) => a.position - b.position);
}

/**
 * Design remediation pass, §H's materialization table: every MATERIALIZED
 * PartLink pinned to one specific Version, in the flat
 * `{lineageId, multiplier, materializedTitle, materializedVersionLabel}`
 * shape `dishes/compare.ts`'s diff needs — a much smaller sibling of
 * `resolveMaterializedPartLinkTreesForVersion` (above), which additionally
 * resolves each snapshot's full nested content for display; comparison
 * only ever diffs identity/multiplier, never nested content, so that work
 * would be wasted here.
 */
export async function listMaterializedPartLinkSnapshots(
  containerVersionId: string,
): Promise<
  {
    lineageId: string;
    multiplier: number;
    materializedTitle: string | null;
    materializedVersionLabel: string | null;
  }[]
> {
  const rows = await prisma.partLink.findMany({
    where: { containerVersionId, linkState: "MATERIALIZED" },
    select: {
      lineageId: true,
      multiplier: true,
      materializedTitle: true,
      materializedVersionLabel: true,
    },
  });
  return rows.map((row) => ({
    lineageId: row.lineageId,
    multiplier: decimalToNumber(row.multiplier) ?? 1,
    materializedTitle: row.materializedTitle,
    materializedVersionLabel: row.materializedVersionLabel,
  }));
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
