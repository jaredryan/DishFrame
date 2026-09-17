"use client";

import { ChefHat } from "lucide-react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";
import { RatingDetailDialog } from "@/components/domain/dish/rating-detail-dialog";
import {
  DetailSectionHeading,
  DishCoverImage,
  DishMetaChips,
  DishDescriptionNote,
} from "@/components/domain/dish/dish-read-only-presentation";
import { ScaledVersionView } from "@/components/domain/dish/scaled-version-view";
import { PartUsagePanel } from "@/components/domain/dish/part-usage-panel";
import { NutritionSummary } from "@/components/domain/dish/nutrition-summary";
import { FavoriteToggle } from "@/components/domain/dish/favorite-toggle";
import { DishTagFlavorEditor } from "@/components/domain/dish/dish-tag-flavor-editor";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";

/**
 * Pure render of an already-assembled `DishDetailViewProps` — the async
 * data assembly (ratings, PartLink resolution, tag/cuisine/flavor option
 * lists, etc.) lives in `lib/dishes/detail-view.ts#buildDishDetailViewProps`,
 * shared with the offline snapshot builder (`offline-sync/dishes.ts`) the
 * same way `lib/cooking/session-view.ts` is shared with Cooking Mode's
 * offline boundary. A Client Component (not async) so it can be rendered
 * directly by `DishOfflineBoundary`.
 */
export function DishDetailView(props: DishDetailViewProps) {
  const { kind, label, collectionLabel, displayTitle, dishId } = props;

  if (!props.hasVersion) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Breadcrumbs
          items={[
            { label: collectionLabel, href: dishBasePath(kind) },
            { label: displayTitle || label },
          ]}
        />
        <p className="text-muted-foreground">
          This {label.toLowerCase()} has no saved content yet.
        </p>
      </div>
    );
  }

  const titleRowEl = (
    <div className="flex items-start justify-between gap-3">
      <h1 className="font-heading text-foreground min-w-0 text-2xl font-semibold text-balance">
        {displayTitle}
      </h1>
      <div className="flex shrink-0 items-center gap-2">
        <FavoriteToggle
          dishId={dishId}
          kind={kind}
          isFavorite={props.isFavorite}
        />
        <DishDetailActions
          dishId={dishId}
          dishTitle={displayTitle}
          kind={kind}
          stage={props.stage}
          currentVersionId={props.currentVersionId}
        />
      </div>
    </div>
  );

  const chipsEl = (
    <DishMetaChips
      stage={props.stage}
      versionLabel={props.versionLabel}
      cuisineNames={props.cuisineNames}
      flavorProfileNames={props.flavorProfileNames}
      tagNames={props.tagNames}
      rating={props.principalRating}
      lastCookedAt={props.lastCookedAt ? new Date(props.lastCookedAt) : null}
      yieldQuantity={props.yieldQuantity}
      yieldUnit={props.yieldUnit}
      prepTimeMinutes={props.prepTimeMinutes}
      cookTimeMinutes={props.cookTimeMinutes}
      difficulty={props.difficulty}
    />
  );

  const descriptionEl = (
    <DishDescriptionNote
      description={props.description}
      versionNote={props.versionNote}
    />
  );

  const nutritionEl = <NutritionSummary nutrition={props.nutrition} />;

  const cookRowEl = (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild>
        <Link href={`${dishBasePath(kind)}/${dishId}/cook`}>
          <ChefHat aria-hidden="true" />
          Cook
        </Link>
      </Button>
      <RatingDetailDialog
        kindLabel={label as "Recipe" | "Part"}
        summary={props.ratingSummary}
        startingPoint={props.startingPoint}
      />
      <DishTagFlavorEditor
        dishId={dishId}
        kind={kind}
        tagOptions={props.tagOptions}
        flavorProfileOptions={props.flavorProfileOptions}
        cuisineOptions={props.cuisineOptions}
        selectedTagIds={props.selectedTagIds}
        selectedFlavorProfileValueIds={props.selectedFlavorProfileValueIds}
        selectedCuisineIds={props.selectedCuisineIds}
      />
    </div>
  );

  const coverImageEl = <DishCoverImage imageAssetId={props.imageAssetId} />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: dishBasePath(kind) },
          { label: displayTitle },
        ]}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {titleRowEl}
          {chipsEl}
          {descriptionEl}
          {nutritionEl}
          {cookRowEl}
        </div>
        {coverImageEl}
      </div>

      {kind === "PART" && (
        <PartUsagePanel
          usages={props.usages ?? []}
          currentVersionId={props.currentVersionId}
          partDishId={dishId}
        />
      )}

      <div className="flex flex-col gap-3">
        <DetailSectionHeading>Recipe</DetailSectionHeading>
        <ScaledVersionView
          kind={kind}
          dishId={dishId}
          sections={props.sections}
          topLevelPartLinks={props.topLevelPartLinks}
          defaultScale={props.defaultScale}
          preferredUnitOverrides={props.preferredUnitOverrides}
        />
      </div>
    </div>
  );
}
