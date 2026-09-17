"use client";

import Link from "next/link";
import { ChefHat } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import {
  DetailSectionHeading,
  DishCoverImage,
  DishMetaChips,
  DishDescriptionNote,
} from "@/components/domain/dish/dish-read-only-presentation";
import { NutritionSummary } from "@/components/domain/dish/nutrition-summary";
import { PromoteVersionButton } from "@/components/domain/dish/promote-version-button";
import { VersionPicker } from "@/components/domain/dish/version-picker";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { formatIngredientLine } from "@/lib/dishes/format";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";
import type { ReplicatedVersion } from "@/lib/dishes/version-history-snapshot";

/**
 * Offline rendering of one Version's read-only content, from the
 * replicated `DishSnapshotDoc.versions` (docs/OFFLINE_IMPLEMENTATION_PLAN.md
 * §2) — used by `VersionHistoryOfflineBoundary` in place of the full
 * `VersionHistoryView` Server Component. Deliberately simpler: a linked
 * Part renders as a plain, navigable reference rather than
 * `PartLinkTreeView`'s fully expanded nested content — see `version-
 * history-snapshot.ts`'s doc comment for why nested historical resolution
 * isn't replicated.
 */
export function VersionHistoryOfflineView({
  dishId,
  kind,
  displayTitle,
  stage,
  currentVersionId,
  versions,
  activeVersionId,
  onSelectVersionAction,
}: {
  dishId: string;
  kind: DishKindValue;
  displayTitle: string;
  stage: StageValue;
  currentVersionId: string | null;
  versions: ReplicatedVersion[];
  activeVersionId: string;
  onSelectVersionAction: (versionId: string) => void;
}) {
  const version = versions.find((v) => v.id === activeVersionId);
  const basePath = dishBasePath(kind);
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";

  if (!version) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <p className="text-muted-foreground">
          This version isn&apos;t available offline yet.
        </p>
      </div>
    );
  }

  const isCurrent = version.id === currentVersionId;
  const label = formatVersionLabel(version.majorVersion, version.minorVersion);
  const nutrition = version.nutrition;
  const hasOmittedPartLinks =
    version.topLevelPartLinks.length > 0 ||
    version.sections.some((s) => s.partLinks.length > 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: basePath },
          { label: displayTitle, href: `${basePath}/${dishId}` },
          { label },
        ]}
      />

      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {isCurrent
            ? "This is the current version."
            : "This is a historical version — only description, photo, and note can be updated. Other edits will create a new version."}
        </p>
        <VersionPicker
          versions={versions.map((v) => ({
            id: v.id,
            majorVersion: v.majorVersion,
            minorVersion: v.minorVersion,
            yieldQuantity: v.yieldQuantity,
            yieldUnit: v.yieldUnit,
          }))}
          currentVersionId={currentVersionId}
          value={activeVersionId}
          onChange={onSelectVersionAction}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h1 className="font-heading text-foreground min-w-0 text-2xl font-semibold text-balance">
            {displayTitle}
          </h1>
          <DishMetaChips
            stage={stage}
            versionLabel={label}
            yieldQuantity={version.yieldQuantity}
            yieldUnit={version.yieldUnit}
            prepTimeMinutes={version.prepTimeMinutes}
            cookTimeMinutes={version.cookTimeMinutes}
            difficulty={version.difficulty}
          />
          <DishDescriptionNote
            description={version.description}
            versionNote={version.versionNote}
          />
          <NutritionSummary nutrition={nutrition} />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={`${basePath}/${dishId}/cook?versionId=${version.id}`}>
                <ChefHat aria-hidden="true" />
                Cook this version
              </Link>
            </Button>
            {!isCurrent && (
              <PromoteVersionButton
                kind={kind}
                dishId={dishId}
                versionId={version.id}
                newMajorLabel={`V${Math.max(...versions.map((v) => v.majorVersion)) + 1}.0`}
              />
            )}
          </div>
        </div>
        <DishCoverImage imageAssetId={version.imageAssetId} />
      </div>

      <div className="flex flex-col gap-3">
        <DetailSectionHeading>Recipe</DetailSectionHeading>
        <div className="flex flex-col gap-4">
          {version.sections.map((section) => (
            <ContentCard key={section.id}>
              {section.name && (
                <h2 className={CONTENT_CARD_TITLE_CLASS}>{section.name}</h2>
              )}
              {section.guidanceNote && (
                <p className="text-muted-foreground text-sm italic">
                  {section.guidanceNote}
                </p>
              )}
              {section.ingredients.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {section.ingredients.map((ingredient) => (
                    <li key={ingredient.id} className="text-sm">
                      {formatIngredientLine(ingredient)}
                      {ingredient.isOptional && (
                        <span className="text-muted-foreground">
                          {" "}
                          (optional)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {section.instructions.length > 0 && (
                <ol className="flex flex-col gap-2">
                  {section.instructions.map((instruction, i) => (
                    <li key={instruction.id} className="flex gap-2 text-sm">
                      <span className="text-muted-foreground tabular-nums">
                        {i + 1}.
                      </span>
                      <span>{instruction.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </ContentCard>
          ))}
          {hasOmittedPartLinks && (
            <p className="text-muted-foreground text-sm">
              This version also links other Recipes/Parts — their content
              isn&apos;t available offline; reconnect to view it inline.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
