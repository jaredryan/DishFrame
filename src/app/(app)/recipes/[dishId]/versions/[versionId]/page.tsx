import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedVersionDetailOrThrow,
  listDishVersionSummaries,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { VersionSectionsView } from "@/components/domain/dish/version-sections-view";
import { VersionNoteEditor } from "@/components/domain/dish/version-note-editor";
import { VersionMetadataEditor } from "@/components/domain/dish/version-metadata-editor";
import { VersionSelector } from "@/components/domain/dish/version-selector";
import { PromoteVersionButton } from "@/components/domain/dish/promote-version-button";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { versionContentToInput } from "@/lib/dishes/mappers";
import {
  resolvePartLinkTrees,
  resolveMaterializedPartLinkTreesForVersion,
  mergeLiveAndMaterializedTrees,
} from "@/lib/sections/service";

export const metadata: Metadata = {
  title: "Version history",
};

export default async function RecipeVersionPage({
  params,
}: {
  params: Promise<{ dishId: string; versionId: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { dishId, versionId } = await params;

  let dish, version;
  try {
    const result = await getOwnedVersionDetailOrThrow(
      session.user.id,
      dishId,
      versionId,
      "RECIPE",
    );
    dish = result.dish;
    version = result.version;
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const versions = await listDishVersionSummaries(dish.id);
  const highestMajor = versions.reduce(
    (max, v) => Math.max(max, v.majorVersion),
    0,
  );
  const isCurrent = version.id === dish.currentVersionId;
  const sourceVersion = version.sourceVersionId
    ? versions.find((v) => v.id === version.sourceVersionId)
    : null;

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
      // Slice 6 correction pass, §H: a historical Version may still carry
      // MATERIALIZED PartLinks (their target Part was since deleted) —
      // `getDishScopedVersionContentOrThrow`'s own content load stays
      // LIVE-only, so these are a separate, additive fetch merged in
      // purely for read-only display.
      resolveMaterializedPartLinkTreesForVersion(dish.ownerId, version.id),
    ]);
  const topLevelPartLinkTrees = mergeLiveAndMaterializedTrees(
    topLevelPartLinkInputs,
    topLevelLiveTrees,
    materializedTrees.topLevel,
  );
  const sectionPartLinkTreeLists = sectionPartLinkInputs.map(
    (section, sectionIndex) =>
      mergeLiveAndMaterializedTrees(
        section.partLinks,
        sectionLiveTreeLists[sectionIndex],
        materializedTrees.bySectionId.get(version.sections[sectionIndex].id) ??
          [],
      ),
  );

  const basePath = dishBasePath("RECIPE");
  const versionLabel = `V${version.majorVersion}.${version.minorVersion}`;
  // Version-trigger correction pass: title is stable Dish identity
  // (PRODUCT_SPEC.md §7.1), not Version content — every historical Version
  // page shows the Dish's one current title, not a per-Version snapshot.
  const displayTitle = dish.currentTitle || version.title;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Recipes", href: basePath },
          { label: displayTitle, href: `${basePath}/${dish.id}` },
          { label: versionLabel },
        ]}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {displayTitle}
          </h1>
          <span className="text-muted-foreground text-xs tabular-nums">
            {versionLabel}
          </span>
        </div>

        <p className="text-muted-foreground text-sm">
          {isCurrent
            ? "This is the current version."
            : "This is a historical version — its content never changes, but its description and photo can still be edited (PRODUCT_SPEC.md §7.2)."}
        </p>

        {/* PRODUCT_SPEC.md §7.2/§12.2: description and image are
            Version-associated but mutable — editable in place on any
            selected Version, current or historical, without creating a
            refinement. */}
        <VersionMetadataEditor
          key={`metadata-${version.id}`}
          kind="RECIPE"
          dishId={dish.id}
          versionId={version.id}
          description={version.description}
          imageAssetId={version.imageAssetId}
        />

        {sourceVersion && (
          <p className="text-muted-foreground text-sm">
            Based on{" "}
            <Link
              href={`${basePath}/${dish.id}/versions/${sourceVersion.id}`}
              className="text-primary hover:underline"
            >
              V{sourceVersion.majorVersion}.{sourceVersion.minorVersion}
            </Link>
          </p>
        )}

        {/* Slice 4 correction pass §6: Stage/cuisine belong to the stable
            Dish, not to this immutable Version snapshot (PRODUCT_SPEC.md
            §13.9) — kept in its own labeled block so it never reads as
            though this historical Version stored these values itself. */}
        <div className="border-border bg-muted/40 flex flex-col gap-1 rounded-lg border px-3 py-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Current recipe details
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={dish.stage} />
            {dish.cuisine && (
              <span className="text-muted-foreground text-sm">
                {dish.cuisine}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Reflects the recipe now, not this version&apos;s snapshot.
          </p>
        </div>

        <VersionSelector
          kind="RECIPE"
          dishId={dish.id}
          currentVersionId={dish.currentVersionId}
          versions={versions}
          activeVersionId={version.id}
        />

        <VersionNoteEditor
          key={`note-${version.id}`}
          kind="RECIPE"
          dishId={dish.id}
          versionId={version.id}
          note={version.versionNote}
        />

        <div className="flex flex-wrap items-center gap-2">
          {/* Slice 4 correction pass §1: any saved Version may be an
              editing base or a promotion source — not only a major line's
              latest minor. */}
          <Button variant="outline" asChild>
            <Link href={`${basePath}/${dish.id}/edit?versionId=${version.id}`}>
              Edit this version
            </Link>
          </Button>
          {!isCurrent && (
            <PromoteVersionButton
              kind="RECIPE"
              dishId={dish.id}
              versionId={version.id}
              newMajorLabel={`V${highestMajor + 1}.0`}
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
        </div>
      </div>

      <VersionSectionsView
        sections={version.sections}
        sectionPartLinks={sectionPartLinkTreeLists}
        topLevelPartLinks={topLevelPartLinkTrees}
      />
    </div>
  );
}
