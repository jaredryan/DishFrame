import Link from "next/link";
import { ChefHat, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import {
  getOwnedVersionDetailOrThrow,
  listDishVersionSummaries,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { VersionSectionsView } from "@/components/domain/dish/version-sections-view";
import { VersionSelector } from "@/components/domain/dish/version-selector";
import { PromoteVersionButton } from "@/components/domain/dish/promote-version-button";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import {
  DetailSectionHeading,
  DishCoverImage,
  DishMetaChips,
  DishDescriptionNote,
} from "@/components/domain/dish/dish-read-only-presentation";
import {
  NutritionSummary,
  toNutritionSummaryData,
} from "@/components/domain/dish/nutrition-summary";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import {
  resolvePartLinkTrees,
  resolveMaterializedPartLinkTreesForVersion,
  mergeLiveAndMaterializedTrees,
} from "@/lib/sections/service";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * The Version History page's read-only presentation — shared by the
 * Recipe/Part route pages (`(app)/recipes/[dishId]/versions/[versionId]`,
 * `(app)/parts/[dishId]/versions/[versionId]`), which reduce to a thin
 * `kind`-parameterized wrapper. History-specific controls (searchable
 * Version picker, Cook/Edit/Promote/Compare/Print) render above; below that,
 * the same read-only cover-photo/chips/description/nutrition presentation
 * `DishDetailView` renders for the current Version (nav/details QA batch
 * item 7) — Edit/Favorite/the overflow action menu are never shown here,
 * since this is historical viewing, not management.
 */
export async function VersionHistoryView({
  ownerId,
  dishId,
  versionId,
  kind,
}: {
  ownerId: string;
  dishId: string;
  versionId: string;
  kind: DishKindValue;
}) {
  let dish, version;
  try {
    const result = await getOwnedVersionDetailOrThrow(
      ownerId,
      dishId,
      versionId,
      kind,
    );
    dish = result.dish;
    version = result.version;
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const [versions, tagSelections] = await Promise.all([
    listDishVersionSummaries(dish.id),
    prisma.dish.findUnique({
      where: { id: dish.id },
      select: {
        tags: {
          select: { tag: { select: { displayName: true, isFavorite: true } } },
        },
        flavorProfiles: {
          select: { flavorProfileValue: { select: { displayName: true } } },
        },
      },
    }),
  ]);
  const tagNames = (tagSelections?.tags ?? [])
    .filter((t) => !t.tag.isFavorite)
    .map((t) => t.tag.displayName);
  const flavorProfileNames = (tagSelections?.flavorProfiles ?? []).map(
    (f) => f.flavorProfileValue.displayName,
  );

  const highestMajor = versions.reduce(
    (max, v) => Math.max(max, v.majorVersion),
    0,
  );
  const isCurrent = version.id === dish.currentVersionId;

  const { sections: sectionPartLinkInputs, partLinks: topLevelPartLinkInputs } =
    versionContentToInput(version.sections, version.partLinks);
  const [[topLevelLiveTrees, ...sectionLiveTreeLists], materializedTrees] =
    await Promise.all([
      Promise.all([
        resolvePartLinkTrees(dish.ownerId, topLevelPartLinkInputs),
        ...sectionPartLinkInputs.map((section) =>
          resolvePartLinkTrees(dish.ownerId, section.partLinks),
        ),
      ]),
      // A historical Version may still carry MATERIALIZED PartLinks (their
      // target Part was since deleted) — `getDishScopedVersionContentOrThrow`'s
      // own content load stays LIVE-only, so these are a separate, additive
      // fetch merged in purely for read-only display.
      resolveMaterializedPartLinkTreesForVersion(dish.ownerId, version.id),
    ]);
  const topLevelPartLinkTrees = mergeLiveAndMaterializedTrees(
    topLevelPartLinkInputs,
    topLevelLiveTrees,
    materializedTrees.topLevel,
  );
  const sectionPartLinkTreeLists = sectionPartLinkInputs.map(
    (section, sectionIndex) =>
      // Section-nested PartLinks don't interleave with anything else
      // (schema.prisma's `Section.position` comment) — only the `.tree` is
      // needed here, unlike `topLevelPartLinkTrees` above.
      mergeLiveAndMaterializedTrees(
        section.partLinks,
        sectionLiveTreeLists[sectionIndex],
        materializedTrees.bySectionId.get(version.sections[sectionIndex].id) ??
          [],
      ).map((entry) => entry.tree),
  );

  const basePath = dishBasePath(kind);
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  const versionLabel = formatVersionLabel(
    version.majorVersion,
    version.minorVersion,
  );
  // Version-trigger correction pass: title is stable Dish identity
  // (PRODUCT_SPEC.md §7.1), not Version content — every historical Version
  // page shows the Dish's one current title, not a per-Version snapshot.
  const displayTitle = dish.currentTitle || version.title;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: basePath },
          { label: displayTitle, href: `${basePath}/${dish.id}` },
          { label: versionLabel },
        ]}
      />

      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          {displayTitle}
        </h1>

        <p className="text-muted-foreground text-sm">
          {isCurrent
            ? "This is the current version."
            : "This is a historical version — only description, photo, and note can be updated. Other edits will create a new version."}
        </p>

        <VersionSelector
          kind={kind}
          dishId={dish.id}
          currentVersionId={dish.currentVersionId}
          versions={versions}
          activeVersionId={version.id}
        />

        <div className="flex flex-wrap items-center gap-2">
          {/* Cooking a historical Version never makes it current, changes
              Stage, or restores it — just opens Cooking Setup pinned to this
              exact Version (PRODUCT_SPEC.md §22.3). */}
          <Button asChild>
            <Link href={`${basePath}/${dish.id}/cook?versionId=${version.id}`}>
              <ChefHat aria-hidden="true" />
              {isCurrent ? "Cook" : "Cook this version"}
            </Link>
          </Button>
          {/* Any saved Version may be an editing base or a promotion source —
              not only a major line's latest minor. */}
          <Button variant="outline" asChild>
            <Link href={`${basePath}/${dish.id}/edit?versionId=${version.id}`}>
              Edit this version
            </Link>
          </Button>
          {!isCurrent && (
            <PromoteVersionButton
              kind={kind}
              dishId={dish.id}
              versionId={version.id}
              newMajorLabel={formatVersionLabel(highestMajor + 1, 0)}
            />
          )}
          <Button variant="outline" asChild>
            <Link
              href={`${basePath}/${dish.id}/compare?from=${version.id}&to=${
                dish.currentVersionId ?? version.id
              }`}
            >
              Compare versions
            </Link>
          </Button>
          {/* Pinned to this exact Version via `?versionId=`, mirroring "Cook
              this version" above — never the current Version, even from
              here (PRODUCT_SPEC.md §87). */}
          <Button variant="outline" asChild>
            <Link href={`/print${basePath}/${dish.id}?versionId=${version.id}`}>
              <Printer aria-hidden="true" />
              Print
            </Link>
          </Button>
        </div>
      </div>

      {/* Read-only presentation shared with the normal Details page (never
          Edit/Favorite/the overflow action menu — historical viewing, not
          management). */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <DishMetaChips
            stage={dish.stage}
            versionLabel={versionLabel}
            cuisine={dish.cuisine}
            flavorProfileNames={flavorProfileNames}
            tagNames={tagNames}
            yieldQuantity={decimalToNumber(version.yieldQuantity)}
            yieldUnit={version.yieldUnit}
            prepTimeMinutes={version.prepTimeMinutes}
            cookTimeMinutes={version.cookTimeMinutes}
            difficulty={version.difficulty}
          />
          <DishDescriptionNote
            description={version.description}
            versionNote={version.versionNote}
          />
          <NutritionSummary nutrition={toNutritionSummaryData(version)} />
        </div>
        <DishCoverImage imageAssetId={version.imageAssetId} />
      </div>

      <div className="flex flex-col gap-3">
        <DetailSectionHeading>Recipe</DetailSectionHeading>
        <VersionSectionsView
          sections={version.sections}
          sectionPartLinks={sectionPartLinkTreeLists}
          topLevelPartLinks={topLevelPartLinkTrees}
        />
      </div>
    </div>
  );
}
