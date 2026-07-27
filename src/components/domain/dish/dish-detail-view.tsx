import { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";
import {
  ScaledVersionView,
  type ScaledSectionRow,
} from "@/components/domain/dish/scaled-version-view";
import { VersionNoteEditor } from "@/components/domain/dish/version-note-editor";
import { VersionMetadataEditor } from "@/components/domain/dish/version-metadata-editor";
import { PartUsagePanel } from "@/components/domain/dish/part-usage-panel";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import {
  listCurrentPartUsages,
  type dishDetailInclude,
  type sectionContentInclude,
} from "@/lib/dishes/queries";
import { decimalToNumber } from "@/lib/dishes/format";

type DishDetail = Prisma.DishGetPayload<{ include: typeof dishDetailInclude }>;
type VersionSectionRow = Prisma.SectionGetPayload<{
  include: typeof sectionContentInclude.include;
}>;

function formatQuantity(value: Prisma.Decimal | null): string | null {
  const number = decimalToNumber(value);
  return number == null ? null : String(number);
}

/**
 * `ScaledVersionView` is a Client Component, so its `sections` prop must
 * be plain, serializable data — a raw `Prisma.Decimal` cannot cross the
 * Server→Client boundary (it arrives as a non-functional plain object,
 * not a real `Decimal` instance). This Server Component does the
 * Decimal→number conversion once, here, before handing sections down.
 */
function toDisplaySections(sections: VersionSectionRow[]): ScaledSectionRow[] {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    guidanceNote: section.guidanceNote,
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

  const versionLabel = `V${version.majorVersion}.${version.minorVersion}`;
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  // Version-trigger correction pass: title is stable Dish identity
  // (PRODUCT_SPEC.md §7.1), not Version content — `dish.currentTitle` is
  // the source of truth, not the current Version's own `title` column
  // (an inert historical mirror since title can now change independently).
  const displayTitle = dish.currentTitle || version.title;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: dishBasePath(kind) },
          { label: displayTitle },
        ]}
      />
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

        <VersionMetadataEditor
          key={`metadata-${version.id}`}
          kind={kind}
          dishId={dish.id}
          versionId={version.id}
          description={version.description}
          imageAssetId={version.imageAssetId}
        />

        <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
          {version.yieldQuantity && (
            <span>
              Makes {formatQuantity(version.yieldQuantity)}{" "}
              {version.yieldUnit ?? ""}
            </span>
          )}
          {version.prepTimeMinutes != null && (
            <span>Prep {version.prepTimeMinutes} min</span>
          )}
          {version.cookTimeMinutes != null && (
            <span>Cook {version.cookTimeMinutes} min</span>
          )}
          {version.difficulty && <span>{version.difficulty}</span>}
        </div>

        <DishDetailActions dishId={dish.id} kind={kind} stage={dish.stage} />

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`${dishBasePath(kind)}/${dish.id}/versions/${version.id}`}
            className="text-primary hover:underline"
          >
            Version history
          </Link>
          <Link
            href={`${dishBasePath(kind)}/${dish.id}/compare`}
            className="text-primary hover:underline"
          >
            Compare versions
          </Link>
        </div>

        <VersionNoteEditor
          key={`note-${version.id}`}
          kind={kind}
          dishId={dish.id}
          versionId={version.id}
          note={version.versionNote}
        />

        {kind === "PART" && (
          <PartUsagePanel
            usages={usages ?? []}
            currentVersionId={dish.currentVersionId}
          />
        )}
      </div>

      <ScaledVersionView
        kind={kind}
        dishId={dish.id}
        sections={toDisplaySections(version.sections)}
        yieldQuantity={decimalToNumber(version.yieldQuantity)}
        yieldUnit={version.yieldUnit}
        defaultBatchQuantity={decimalToNumber(dish.defaultBatchQuantity)}
        defaultBatchUnit={dish.defaultBatchUnit}
        preferredUnitOverrides={dish.preferredUnitOverrides}
      />
    </div>
  );
}
