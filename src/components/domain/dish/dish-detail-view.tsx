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
  listAttachableParts,
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
  // §74.2: replacement candidates for the delete-resolution flow, excluding
  // this Part itself.
  const attachableParts =
    kind === "PART" ? await listAttachableParts(dish.ownerId, dish.id) : [];

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

  const titleEl = (
    <h1 className="font-heading text-foreground text-2xl font-semibold [grid-area:title]">
      {displayTitle}
    </h1>
  );

  // Slice 6A: lifecycle Stage, Version, and cuisine all render as chips
  // together (never Version/cuisine as loose unrelated text) — Stage
  // keeps its own meaningful color treatment (`StageBadge`); Version/
  // cuisine are neutral outline chips beside it.
  const chipsEl = (
    <div className="flex flex-wrap items-center gap-1.5 [grid-area:chips]">
      <StageBadge stage={dish.stage} />
      <Badge variant="outline" className="tabular-nums">
        {versionLabel}
      </Badge>
      {dish.cuisine && <Badge variant="outline">{dish.cuisine}</Badge>}
    </div>
  );

  const actionsEl = (
    <div className="[grid-area:actions]">
      <DishDetailActions
        dishId={dish.id}
        kind={kind}
        stage={dish.stage}
        currentVersionId={version.id}
        attachableParts={attachableParts}
      />
    </div>
  );

  const descriptionEl = (version.description || version.versionNote) && (
    <div className="flex flex-col gap-2 [grid-area:description]">
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
    <div className="flex flex-wrap gap-1.5 [grid-area:metadata]">
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

  const imageEl = (
    <div className="border-border bg-muted aspect-[4/3] w-full overflow-hidden rounded-lg border [grid-area:image]">
      {version.imageAssetId ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
        <img
          src={`/api/images/${version.imageAssetId}`}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        <div className="text-muted-foreground/40 flex size-full items-center justify-center">
          <UtensilsCrossed className="size-10" aria-hidden="true" />
        </div>
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

      {/* Slice 6A fix: every hero piece renders exactly once, in a single
          grid — repositioned between narrow (stacked, spec order:
          title, chips, actions, description, metadata, image) and wide
          (title+actions share row 1, image as a right column) purely via
          `.dish-hero-grid`'s responsive `grid-template-areas`
          (globals.css). The previous lg:hidden/hidden-lg:grid pair
          duplicated every element — including the stateful
          `DishDetailActions` overflow menu/dialogs — in the DOM at once,
          which is both a real bug (two live copies of interactive state)
          and the cause of repeated Playwright strict-mode failures on
          this page (e.g. two "Idea" stage badges). */}
      <div className="dish-hero-grid">
        {titleEl}
        {chipsEl}
        {actionsEl}
        {descriptionEl}
        {metadataChipsEl}
        {imageEl}
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
