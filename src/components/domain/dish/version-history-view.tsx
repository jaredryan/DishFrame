"use client";

import Link from "next/link";
import { ChefHat, Pencil, Printer } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VersionSectionsView } from "@/components/domain/dish/version-sections-view";
import { VersionSelector } from "@/components/domain/dish/version-selector";
import { PromoteVersionButton } from "@/components/domain/dish/promote-version-button";
import {
  DetailSectionHeading,
  DishCoverImage,
  DishMetaChips,
  DishDescriptionNote,
} from "@/components/domain/dish/dish-read-only-presentation";
import { NutritionSummary } from "@/components/domain/dish/nutrition-summary";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import type { VersionHistoryViewProps } from "@/lib/dishes/version-history-page-props";

/**
 * The Version History page's read-only presentation — shared by the
 * Recipe/Part route pages (`(app)/recipes/[dishId]/versions/[versionId]`,
 * `(app)/parts/[dishId]/versions/[versionId]`). Pure render of an
 * already-assembled `VersionHistoryViewProps` — the async data assembly
 * (PartLink tree resolution, tag/cuisine/Flavor-profile lookups, etc.)
 * lives in `lib/dishes/version-history-page-props.ts#buildVersionHistoryViewProps`,
 * the same "one shared prop-assembly function" pattern as
 * `lib/dishes/detail-view.ts` for `DishDetailView` — shared with
 * `VersionHistoryOfflineBoundary`'s "trust the server" branch. A Client
 * Component (not async) so it can be rendered directly by that boundary;
 * the boundary's replica-only fallback uses the deliberately simpler
 * `VersionHistoryOfflineView` instead of this component when the server
 * render can't be trusted (see that file's doc comment).
 */
export function VersionHistoryView(props: VersionHistoryViewProps) {
  const {
    dishId,
    kind,
    basePath,
    collectionLabel,
    displayTitle,
    versionId,
    versionLabel,
    isCurrent,
    stage,
    currentVersionId,
    highestMajor,
    versions,
    tagNames,
    flavorProfileNames,
    cuisineNames,
    description,
    versionNote,
    imageAssetId,
    yieldQuantity,
    yieldUnit,
    prepTimeMinutes,
    cookTimeMinutes,
    difficulty,
    nutrition,
    sections,
    sectionPartLinks,
    topLevelPartLinks,
  } = props;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: basePath },
          { label: displayTitle, href: `${basePath}/${dishId}` },
          { label: versionLabel },
        ]}
      />

      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {isCurrent
            ? "This is the current version."
            : "This is a historical version — only description, photo, and note can be updated. Other edits will create a new version."}
        </p>

        <VersionSelector
          kind={kind}
          dishId={dishId}
          currentVersionId={currentVersionId}
          versions={versions}
          activeVersionId={versionId}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-heading text-foreground min-w-0 text-2xl font-semibold text-balance">
              {displayTitle}
            </h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline" size="icon">
                    <Link
                      href={`${basePath}/${dishId}/edit?versionId=${versionId}`}
                      aria-label="Edit this version"
                    >
                      <Pencil aria-hidden="true" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit this version</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <DishMetaChips
            stage={stage}
            versionLabel={versionLabel}
            cuisineNames={cuisineNames}
            flavorProfileNames={flavorProfileNames}
            tagNames={tagNames}
            yieldQuantity={yieldQuantity}
            yieldUnit={yieldUnit}
            prepTimeMinutes={prepTimeMinutes}
            cookTimeMinutes={cookTimeMinutes}
            difficulty={difficulty}
          />
          <DishDescriptionNote
            description={description}
            versionNote={versionNote}
          />
          <NutritionSummary nutrition={nutrition} />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={`${basePath}/${dishId}/cook?versionId=${versionId}`}>
                <ChefHat aria-hidden="true" />
                {isCurrent ? "Cook" : "Cook this version"}
              </Link>
            </Button>
            {!isCurrent && (
              <PromoteVersionButton
                kind={kind}
                dishId={dishId}
                versionId={versionId}
                newMajorLabel={formatVersionLabel(highestMajor + 1, 0)}
              />
            )}
            <Button variant="outline" asChild>
              <Link
                href={`${basePath}/${dishId}/compare?from=${versionId}&to=${
                  currentVersionId ?? versionId
                }`}
              >
                Compare versions
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/print${basePath}/${dishId}?versionId=${versionId}`}>
                <Printer aria-hidden="true" />
                Print
              </Link>
            </Button>
          </div>
        </div>
        <DishCoverImage imageAssetId={imageAssetId} />
      </div>

      <div className="flex flex-col gap-3">
        <DetailSectionHeading>Recipe</DetailSectionHeading>
        <VersionSectionsView
          sections={sections}
          sectionPartLinks={sectionPartLinks}
          topLevelPartLinks={topLevelPartLinks}
        />
      </div>
    </div>
  );
}
