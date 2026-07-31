import { Clock, Flame, Gauge, Soup, UtensilsCrossed } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";
import {
  ScaledVersionView,
  type ScaledSectionRow,
} from "@/components/domain/dish/scaled-version-view";
import { PartUsagePanel } from "@/components/domain/dish/part-usage-panel";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import {
  listCurrentPartUsages,
  type dishDetailInclude,
  type sectionContentInclude,
} from "@/lib/dishes/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionContentToInput } from "@/lib/dishes/mappers";
import {
  resolvePartLinkTrees,
  type PartLinkTree,
} from "@/lib/sections/service";

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
function toDisplaySections(
  sections: VersionSectionRow[],
  sectionPartLinkTreeLists: PartLinkTree[][],
): ScaledSectionRow[] {
  return sections.map((section, index) => ({
    id: section.id,
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

  const versionLabel = `V${version.majorVersion}.${version.minorVersion}`;
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
      <div className="shrink-0">
        <DishDetailActions
          dishId={dish.id}
          kind={kind}
          stage={dish.stage}
          currentVersionId={version.id}
        />
      </div>
    </div>
  );

  // Slice 6A: lifecycle Stage, Version, and cuisine all render as chips
  // together (never Version/cuisine as loose unrelated text) — Stage
  // keeps its own meaningful color treatment (`StageBadge`); Version/
  // cuisine are neutral outline chips beside it.
  const chipsEl = (
    <div className="flex flex-wrap items-center gap-1.5">
      <StageBadge stage={dish.stage} />
      <Badge variant="outline" className="tabular-nums">
        {versionLabel}
      </Badge>
      {dish.cuisine && <Badge variant="outline">{dish.cuisine}</Badge>}
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

  // Slice 6A: restrained per-kind icons give these factual chips a scan-
  // able identity without four competing saturated colors — lifecycle
  // Stage (above) stays the only chip carrying real color meaning.
  const metadataChipsEl = (effectiveYieldQuantity != null ||
    version.prepTimeMinutes != null ||
    version.cookTimeMinutes != null ||
    version.difficulty) && (
    <div className="flex flex-wrap gap-1.5">
      {effectiveYieldQuantity != null && (
        <Badge variant="outline" className="gap-1">
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
        <Badge variant="outline" className="gap-1">
          <Gauge className="size-3" aria-hidden="true" />
          {version.difficulty}
        </Badge>
      )}
    </div>
  );

  const imagePlaceholder = (
    <div className="text-muted-foreground/40 flex size-full items-center justify-center">
      <UtensilsCrossed className="size-10" aria-hidden="true" />
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
          {metadataChipsEl}
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
        topLevelPartLinks={topLevelPartLinkTrees}
        defaultScale={defaultScale}
        preferredUnitOverrides={dish.preferredUnitOverrides}
      />
    </div>
  );
}
