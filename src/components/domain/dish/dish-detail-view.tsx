import { ChefHat, Clock, Flame, Gauge, History, Soup } from "lucide-react";
import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { PlatePlaceholderIcon } from "@/components/domain/dish/plate-placeholder-icon";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";
import { RatingBadge } from "@/components/domain/dish/rating-badge";
import { RatingDetailDialog } from "@/components/domain/dish/rating-detail-dialog";
import {
  ScaledVersionView,
  type ScaledSectionRow,
} from "@/components/domain/dish/scaled-version-view";
import { PartUsagePanel } from "@/components/domain/dish/part-usage-panel";
import {
  NutritionSummary,
  toNutritionSummaryData,
} from "@/components/domain/dish/nutrition-summary";
import { CookingHistoryDialog } from "@/components/domain/dish/cooking-history-dialog";
import { FavoriteToggle } from "@/components/domain/dish/favorite-toggle";
import { DishTagFlavorEditor } from "@/components/domain/dish/dish-tag-flavor-editor";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import {
  listCurrentPartUsages,
  listDishVersionSummaries,
  type dishDetailInclude,
  type sectionContentInclude,
} from "@/lib/dishes/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import {
  resolvePartLinkTrees,
  type PartLinkTree,
} from "@/lib/sections/service";
import { getLastCookedAt, getPartCookingHistory } from "@/lib/cooking/queries";
import {
  getRatingSummary,
  computePrincipalRating,
} from "@/lib/reviews/queries";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { prisma } from "@/lib/db/prisma";

type DishDetail = Prisma.DishGetPayload<{ include: typeof dishDetailInclude }>;
type VersionSectionRow = Prisma.SectionGetPayload<{
  include: typeof sectionContentInclude.include;
}>;

/**
 * `ScaledVersionView` is a Client Component, so its `sections` prop must
 * be plain, serializable data — a raw `Prisma.Decimal` cannot cross the
 * Server→Client boundary (it arrives as a non-functional plain object,
 * not a real `Decimal` instance). This Server Component does the
 * Decimal→number conversion once, here, before handing sections down.
 */
// Restrained highlight distinguishing the secondary cooking-related metadata
// chips (Last cooked, Makes, Difficulty) from the neutral outline chips
// ahead of them in the unified chip list.
const COOKING_METADATA_CHIP_CLASS =
  "gap-1 border-transparent bg-brand-orange/10 text-brand-orange-text dark:bg-brand-orange/20";

function toDisplaySections(
  sections: VersionSectionRow[],
  sectionPartLinkTreeLists: PartLinkTree[][],
): ScaledSectionRow[] {
  return sections.map((section, index) => ({
    id: section.id,
    position: section.position,
    name: section.name,
    guidanceNote: section.guidanceNote,
    partLinks: sectionPartLinkTreeLists[index] ?? [],
    ingredients: section.ingredients.map((ingredient) => ({
      id: ingredient.id,
      lineageId: ingredient.lineageId,
      name: ingredient.name,
      quantity: decimalToNumber(ingredient.quantity),
      quantityEnd: decimalToNumber(ingredient.quantityEnd),
      isApproximate: ingredient.isApproximate,
      unit: ingredient.unit,
      displayText: ingredient.displayText,
      preparationNote: ingredient.preparationNote,
      isOptional: ingredient.isOptional,
      substituteForIngredientId: ingredient.substituteForIngredientId,
      substitute: ingredient.substitute
        ? {
            name: ingredient.substitute.name,
            quantity: decimalToNumber(ingredient.substitute.quantity),
            quantityEnd: decimalToNumber(ingredient.substitute.quantityEnd),
            isApproximate: ingredient.substitute.isApproximate,
            unit: ingredient.substitute.unit,
            displayText: ingredient.substitute.displayText,
            preparationNote: ingredient.substitute.preparationNote,
          }
        : null,
    })),
    instructions: section.instructions.map((instruction) => ({
      id: instruction.id,
      text: instruction.text,
      position: instruction.position,
    })),
  }));
}

export async function DishDetailView({
  dish,
  kind,
}: {
  dish: DishDetail;
  kind: DishKindValue;
}) {
  const version = dish.currentVersion;
  const label = kind === "PART" ? "Part" : "Recipe";
  // PRODUCT_SPEC.md §71: only meaningful for a Part — a Recipe is never a
  // PartLink target, so it can never have "usages" of its own.
  const usages =
    kind === "PART" ? await listCurrentPartUsages(dish.ownerId, dish.id) : null;

  // Slice 9: principal rating (§36.4/§49.1-49.3), Last cooked (§41), and the
  // "Starting point" inherited-context block for a duplicate (§19.4) — all
  // read-time aggregates, never cached. SLICE_9.md correction pass: cooking
  // history (§41.4/§41.5) is also only meaningful for a Part — a Recipe's
  // own session list isn't surfaced here.
  const [
    preference,
    ratingSummary,
    lastCookedAt,
    cookingHistory,
    tagOptions,
    flavorProfileOptions,
    versionSummaries,
  ] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: dish.ownerId },
      select: { primaryRatingDisplay: true },
    }),
    getRatingSummary(dish.id, dish.currentVersionId),
    getLastCookedAt(dish.ownerId, dish.id, kind),
    kind === "PART"
      ? getPartCookingHistory(dish.ownerId, dish.id)
      : Promise.resolve([]),
    listTags(dish.ownerId),
    listFlavorProfileValues(dish.ownerId),
    listDishVersionSummaries(dish.id),
  ]);
  const selectedTagIds = dish.tags.map((t) => t.tagId);
  const selectedFlavorProfileValueIds = dish.flavorProfiles.map(
    (f) => f.flavorProfileValueId,
  );
  const isFavorite = dish.tags.some((t) => t.tag.isFavorite);
  const nonFavoriteTagNames = dish.tags
    .filter((t) => !t.tag.isFavorite)
    .map((t) => t.tag.displayName);
  const flavorProfileNames = dish.flavorProfiles.map(
    (f) => f.flavorProfileValue.displayName,
  );
  const cookingHistoryEvents = cookingHistory.map((event) => ({
    ...event,
    endedAt: event.endedAt.toISOString(),
  }));
  const principalRating = computePrincipalRating(
    ratingSummary,
    dish.currentVersionId,
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
    {
      sourceKind: dish.sourceKind,
      sourceAggregateRating: decimalToNumber(dish.sourceAggregateRating),
      sourceRatingCount: dish.sourceRatingCount,
      sourceTitle: dish.sourceTitle,
      sourceDishVersionLabel: dish.sourceDishVersionLabel,
    },
  );
  const startingPoint =
    dish.sourceKind === "DUPLICATE" && dish.sourceTitle
      ? {
          title: dish.sourceTitle,
          versionLabel: dish.sourceDishVersionLabel ?? "—",
          aggregateRating: decimalToNumber(dish.sourceAggregateRating),
          ratingCount: dish.sourceRatingCount,
          sessionCount: dish.sourceSessionCount,
        }
      : null;

  if (!version) {
    return (
      <p className="text-muted-foreground">
        This {label.toLowerCase()} has no saved content yet.
      </p>
    );
  }

  // Slice 6 post-gate, §67.4: linked Parts (top-level and Section-nested)
  // render their full pinned content inline on the detail page — resolved
  // server-side here, once, rather than as client-side fetches.
  const { sections: sectionPartLinkInputs, partLinks: topLevelPartLinkInputs } =
    versionContentToInput(version.sections, version.partLinks);
  const [topLevelPartLinkTrees, ...sectionPartLinkTreeLists] =
    await Promise.all([
      resolvePartLinkTrees(dish.ownerId, topLevelPartLinkInputs),
      ...sectionPartLinkInputs.map((section) =>
        resolvePartLinkTrees(dish.ownerId, section.partLinks),
      ),
    ]);

  // Sections and top-level PartLinks share one interleaved persisted
  // ordering sequence (schema.prisma's `Section.position` comment) —
  // `resolvePartLinkTrees` can drop an unresolvable edge, so positions are
  // matched back onto the resolved trees by target identity rather than
  // index, matching `mergeLiveAndMaterializedTrees`'s existing pattern.
  const topLevelPartLinkPositionByTarget = new Map(
    topLevelPartLinkInputs.map((input) => [
      `${input.targetDishId}:${input.targetDishVersionId}`,
      input.position,
    ]),
  );
  const displayTopLevelPartLinks = topLevelPartLinkTrees.map((tree) => ({
    position:
      topLevelPartLinkPositionByTarget.get(
        `${tree.targetDishId}:${tree.targetDishVersionId}`,
      ) ?? 0,
    tree,
  }));

  const versionLabel = formatVersionLabel(
    version.majorVersion,
    version.minorVersion,
  );
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  // Version-trigger correction pass: title is stable Dish identity
  // (PRODUCT_SPEC.md §7.1), not Version content — `dish.currentTitle` is
  // the source of truth, not the current Version's own `title` column
  // (an inert historical mirror since title can now change independently).
  const displayTitle = dish.currentTitle || version.title;

  // Slice 6A: the saved default scale is a plain multiplier applied to the
  // authored yield — replaces the retired defaultBatchQuantity/Unit pair.
  // `ScaledVersionView` derives the identical scale factor from the same
  // field, so the ingredient quantities rendered below always match what
  // this chip says.
  const yieldQuantity = decimalToNumber(version.yieldQuantity);
  const defaultScale = decimalToNumber(dish.defaultScale);
  const effectiveScale =
    defaultScale != null && defaultScale > 0 ? defaultScale : 1;
  const effectiveYieldQuantity =
    yieldQuantity != null ? yieldQuantity * effectiveScale : null;

  // Slice 6A browser-review correction pass: title and actions always
  // share one ordinary flex row, at every breakpoint — never a separate
  // grid column/row, never pushed below the chips on mobile.
  const titleRowEl = (
    <div className="flex items-start justify-between gap-3">
      <h1 className="font-heading text-foreground min-w-0 text-2xl font-semibold text-balance">
        {displayTitle}
      </h1>
      <div className="flex shrink-0 items-center gap-2">
        <FavoriteToggle dishId={dish.id} kind={kind} isFavorite={isFavorite} />
        <DishDetailActions
          dishId={dish.id}
          dishTitle={displayTitle}
          kind={kind}
          stage={dish.stage}
          currentVersionId={version.id}
          versions={versionSummaries.map((v) => ({
            id: v.id,
            majorVersion: v.majorVersion,
            minorVersion: v.minorVersion,
          }))}
        />
      </div>
    </div>
  );

  // Mobile-responsiveness correction pass: the lifecycle/identity chips
  // (Stage, Version, Rating, Cuisine, tags/Flavor profiles) and the
  // secondary cooking-related chips (Last cooked, Makes, Prep, Cook,
  // Difficulty) now render as one chip list instead of two visually split
  // rows — the cooking-related ones stay last, in their existing order, and
  // get a restrained orange highlight so they read as a distinguishable
  // sub-group within the single list rather than blending into the neutral
  // outline chips ahead of them. View ratings/Tags & Flavors moved out of
  // this list into the primary action row with Cook (`cookRowEl`) — they're
  // actions, not descriptive metadata.
  const chipsEl = (
    <div className="flex flex-wrap items-center gap-1.5">
      <StageBadge stage={dish.stage} />
      <Badge variant="outline" className="tabular-nums">
        {versionLabel}
      </Badge>
      {principalRating.kind !== "none" && (
        <RatingBadge rating={principalRating} />
      )}
      {dish.cuisine && <Badge variant="outline">{dish.cuisine}</Badge>}
      {flavorProfileNames.map((name) => (
        <Badge key={`flavor-${name}`} variant="outline">
          {name}
        </Badge>
      ))}
      {nonFavoriteTagNames.map((name) => (
        <Badge key={`tag-${name}`} variant="outline">
          {name}
        </Badge>
      ))}
      {lastCookedAt && (
        <Badge variant="outline" className={COOKING_METADATA_CHIP_CLASS}>
          <History className="size-3" aria-hidden="true" />
          Last cooked {lastCookedAt.toLocaleDateString()}
        </Badge>
      )}
      {kind === "PART" && cookingHistoryEvents.length > 0 && (
        <CookingHistoryDialog events={cookingHistoryEvents} />
      )}
      {effectiveYieldQuantity != null && (
        <Badge variant="outline" className={COOKING_METADATA_CHIP_CLASS}>
          <Soup className="size-3" aria-hidden="true" />
          Makes {effectiveYieldQuantity} {version.yieldUnit ?? ""}
        </Badge>
      )}
      {version.prepTimeMinutes != null && (
        <Badge variant="outline" className="gap-1">
          <Clock className="size-3" aria-hidden="true" />
          Prep {version.prepTimeMinutes} min
        </Badge>
      )}
      {version.cookTimeMinutes != null && (
        <Badge variant="outline" className="gap-1">
          <Flame className="size-3" aria-hidden="true" />
          Cook {version.cookTimeMinutes} min
        </Badge>
      )}
      {version.difficulty && (
        <Badge variant="outline" className={COOKING_METADATA_CHIP_CLASS}>
          <Gauge className="size-3" aria-hidden="true" />
          {version.difficulty}
        </Badge>
      )}
    </div>
  );

  const descriptionEl = (version.description || version.versionNote) && (
    <div className="flex flex-col gap-2">
      {version.description && (
        <p className="text-foreground text-sm whitespace-pre-wrap">
          {version.description}
        </p>
      )}
      {version.versionNote && (
        <p className="text-muted-foreground text-sm italic">
          {version.versionNote}
        </p>
      )}
    </div>
  );

  // Slice 13 correction pass, PRODUCT_SPEC.md §54: the current Version's
  // own saved nutrition — never re-derived, never aggregated from
  // Ingredients/Parts.
  const nutritionEl = (
    <NutritionSummary nutrition={toNutritionSummaryData(version)} />
  );

  // Separated from the recipe-management action cluster (Edit/overflow
  // menu, `DishDetailActions`) — Cook is the action for *using* the
  // Recipe/Part, not for modifying it, so it renders as its own row at the
  // bottom of the details column instead of grouped with those controls.
  // One element placed once: the left column below is a plain `flex-col`
  // at every breakpoint (only the outer shell switches to `lg:flex-row`),
  // so this same row naturally lands at the bottom of the left column on
  // desktop and directly below the details/tags — above the narrow image
  // and the Section/Ingredient content that follows — on a single column.
  // Mobile-responsiveness correction pass: View ratings and Tags & Flavors
  // join this same primary action row (Cook, View ratings, Tags & Flavors)
  // instead of sitting inline among the metadata chips above.
  const cookRowEl = (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild>
        <Link href={`${dishBasePath(kind)}/${dish.id}/cook`}>
          <ChefHat aria-hidden="true" />
          Cook
        </Link>
      </Button>
      <RatingDetailDialog
        kindLabel={label as "Recipe" | "Part"}
        summary={ratingSummary}
        startingPoint={startingPoint}
      />
      <DishTagFlavorEditor
        dishId={dish.id}
        kind={kind}
        tagOptions={tagOptions}
        flavorProfileOptions={flavorProfileOptions}
        selectedTagIds={selectedTagIds}
        selectedFlavorProfileValueIds={selectedFlavorProfileValueIds}
      />
    </div>
  );

  const imagePlaceholder = (
    <div className="text-muted-foreground/80 flex size-full items-center justify-center">
      <PlatePlaceholderIcon className="size-24" aria-hidden="true" />
    </div>
  );

  // Slice 6A browser-review correction pass: the wide right-column image
  // is absolutely positioned inside a flex item with no in-flow height of
  // its own, so `items-stretch` on the row below sizes it off the left
  // column's own content height (never a fixed aspect ratio that could
  // make the hero far taller than its text) — `lg:min-h-40` only floors it
  // for a sparse Part with almost no left-column content.
  const wideImageEl = (
    <div className="border-border bg-muted relative hidden w-full overflow-hidden rounded-lg border lg:block lg:min-h-40 lg:w-[320px] lg:shrink-0">
      {version.imageAssetId ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
        <img
          src={`/api/images/${version.imageAssetId}`}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0">{imagePlaceholder}</div>
      )}
    </div>
  );

  // Narrow layout: a compact, capped-height image so it adds context
  // without delaying the authored content that follows — never a large
  // full-width poster.
  const narrowImageEl = (
    <div className="border-border bg-muted h-[200px] w-full overflow-hidden rounded-lg border lg:hidden">
      {version.imageAssetId ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
        <img
          src={`/api/images/${version.imageAssetId}`}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        imagePlaceholder
      )}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: dishBasePath(kind) },
          { label: displayTitle },
        ]}
      />

      {/* Slice 6A browser-review correction pass: an ordinary two-column
          flex shell — left column is a plain `flex-col` content flow
          (title+actions row, then chips/description/note/metadata),
          right column is the image, stretched to the left column's
          resulting height via `items-stretch` (the default). Narrow
          collapses to one column via `flex-col`, with its own compact
          capped-height image last in the flow, right before the
          authored content below. Replaces the previous `.dish-hero-grid`
          grid-template-areas scheme, which over-used grid placement and
          split Edit/overflow into their own column/row. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {titleRowEl}
          {chipsEl}
          {descriptionEl}
          {nutritionEl}
          {cookRowEl}
        </div>
        {wideImageEl}
        {narrowImageEl}
      </div>

      {kind === "PART" && (
        <PartUsagePanel
          usages={usages ?? []}
          currentVersionId={dish.currentVersionId}
          partDishId={dish.id}
        />
      )}

      <ScaledVersionView
        kind={kind}
        dishId={dish.id}
        sections={toDisplaySections(version.sections, sectionPartLinkTreeLists)}
        topLevelPartLinks={displayTopLevelPartLinks}
        defaultScale={defaultScale}
        preferredUnitOverrides={dish.preferredUnitOverrides}
      />
    </div>
  );
}
