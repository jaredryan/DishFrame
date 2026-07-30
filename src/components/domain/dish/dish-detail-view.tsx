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

  // Design remediation pass: the saved default batch size (edited in the
  // consolidated editor now, PRODUCT_SPEC.md §51.4) is this view's one
  // static, readable yield — falling back to the authored Version yield
  // when no default is saved. `ScaledVersionView` derives the identical
  // scale factor from the same two Dish/Version fields, so the ingredient
  // quantities rendered below always match what this chip says.
  const effectiveYieldQuantity =
    decimalToNumber(dish.defaultBatchQuantity) ??
    decimalToNumber(version.yieldQuantity);
  const effectiveYieldUnit =
    (dish.defaultBatchQuantity != null ? dish.defaultBatchUnit : null) ??
    version.yieldUnit ??
    "servings";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: dishBasePath(kind) },
          { label: displayTitle },
        ]}
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-foreground text-2xl font-semibold">
              {displayTitle}
            </h1>
            <StageBadge stage={dish.stage} />
            <span className="text-muted-foreground text-xs tabular-nums">
              {versionLabel}
            </span>
          </div>
          {dish.cuisine && (
            <p className="text-muted-foreground text-sm">{dish.cuisine}</p>
          )}
          <DishDetailActions
            dishId={dish.id}
            kind={kind}
            stage={dish.stage}
            currentVersionId={version.id}
            attachableParts={attachableParts}
          />
        </div>

        {version.description && (
          <p className="text-foreground text-sm whitespace-pre-wrap">
            {version.description}
          </p>
        )}

        {version.imageAssetId && (
          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
          <img
            src={`/api/images/${version.imageAssetId}`}
            alt=""
            className="border-border max-h-80 w-full rounded-lg border object-cover"
          />
        )}

        {version.versionNote && (
          <p className="text-muted-foreground text-sm italic">
            {version.versionNote}
          </p>
        )}

        {(effectiveYieldQuantity != null ||
          version.prepTimeMinutes != null ||
          version.cookTimeMinutes != null ||
          version.difficulty) && (
          <div className="flex flex-wrap gap-1.5">
            {effectiveYieldQuantity != null && (
              <Badge variant="outline">
                Makes {effectiveYieldQuantity} {effectiveYieldUnit}
              </Badge>
            )}
            {version.prepTimeMinutes != null && (
              <Badge variant="outline">
                Prep {version.prepTimeMinutes} min
              </Badge>
            )}
            {version.cookTimeMinutes != null && (
              <Badge variant="outline">
                Cook {version.cookTimeMinutes} min
              </Badge>
            )}
            {version.difficulty && (
              <Badge variant="outline">{version.difficulty}</Badge>
            )}
          </div>
        )}

        {kind === "PART" && (
          <PartUsagePanel
            usages={usages ?? []}
            currentVersionId={dish.currentVersionId}
            partDishId={dish.id}
          />
        )}
      </div>

      <ScaledVersionView
        kind={kind}
        dishId={dish.id}
        sections={toDisplaySections(version.sections, sectionPartLinkTreeLists)}
        topLevelPartLinks={topLevelPartLinkTrees}
        yieldQuantity={decimalToNumber(version.yieldQuantity)}
        defaultBatchQuantity={decimalToNumber(dish.defaultBatchQuantity)}
        preferredUnitOverrides={dish.preferredUnitOverrides}
      />
    </div>
  );
}
