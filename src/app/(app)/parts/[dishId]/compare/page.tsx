import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  listDishVersionSummaries,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { VersionComparePicker } from "@/components/domain/dish/version-compare-picker";
import { VersionCompareView } from "@/components/domain/dish/version-compare-view";
import {
  compareDishVersions,
  pickDefaultComparisonPair,
  type VersionCompareInput,
  type VersionComparisonResult,
} from "@/lib/dishes/compare";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import {
  resolvePartLinkDisplayInfo,
  listMaterializedPartLinkSnapshots,
} from "@/lib/sections/service";
import type { PartLinkLabelMap } from "@/components/domain/dish/version-compare-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dishId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { dishId } = await params;
  try {
    const dish = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
    return { title: `${dish.currentTitle ?? "Part"} — Compare versions` };
  } catch {
    return {};
  }
}

async function toCompareInput(
  dishId: string,
  versionId: string,
): Promise<{
  input: VersionCompareInput;
  majorVersion: number;
  minorVersion: number;
}> {
  const version = await getDishScopedVersionContentOrThrow(dishId, versionId);
  const content = versionContentToInput(version.sections, version.partLinks);
  // Design remediation pass, §H: a historical Version's own PartLink rows
  // may have been materialized since it was saved (its target Part
  // deleted) — `partLinkContentInclude` stays LIVE-only, so these are a
  // separate, additive fetch, merged in purely for comparison.
  const materializedPartLinks = await listMaterializedPartLinkSnapshots(
    version.id,
  );
  return {
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
    input: {
      metadata: {
        description: version.description,
        yieldQuantity: decimalToNumber(version.yieldQuantity),
        yieldUnit: version.yieldUnit,
        prepTimeMinutes: version.prepTimeMinutes,
        cookTimeMinutes: version.cookTimeMinutes,
        difficulty: version.difficulty,
      },
      nutrition: {
        calories: decimalToNumber(version.calories),
        protein: decimalToNumber(version.protein),
        carbs: decimalToNumber(version.carbs),
        fat: decimalToNumber(version.fat),
      },
      sections: content.sections,
      partLinks: content.partLinks,
      materializedPartLinks,
    },
  };
}

/** §68.5: a linked Part's displayed title/Version label is always a live
 * lookup, never anything pinned at attach time — resolved once here for
 * every distinct LIVE occurrence the comparison touches, gracefully falling
 * back for a Part deleted since without a preserved historical identity
 * (genuinely unresolvable — not the design-remediation-pass MATERIALIZED
 * case below, which already carries its own frozen title/Version label and
 * is rendered directly by `version-compare-view.tsx`, no live lookup at
 * all). */
async function resolvePartLinkLabels(
  ownerId: string,
  result: VersionComparisonResult,
): Promise<PartLinkLabelMap> {
  const pairs = new Map<
    string,
    { targetDishId: string; targetDishVersionId: string }
  >();
  function collect(
    entries: {
      targetDishId: string | null;
      targetDishVersionId: string | null;
    }[],
  ) {
    for (const entry of entries) {
      // A `null` targetDishId means MATERIALIZED — no live target to look
      // up; its label comes from the snapshot's own preserved identity
      // instead (see `PartLinkSnapshot`'s doc comment, dishes/compare.ts).
      if (!entry.targetDishId || !entry.targetDishVersionId) continue;
      pairs.set(`${entry.targetDishId}:${entry.targetDishVersionId}`, {
        targetDishId: entry.targetDishId,
        targetDishVersionId: entry.targetDishVersionId,
      });
    }
  }
  collect(result.partLinks.added);
  collect(result.partLinks.removed);
  collect(result.partLinks.changed.map((change) => change.before));
  collect(result.partLinks.changed.map((change) => change.after));

  const labels: PartLinkLabelMap = {};
  await Promise.all(
    [...pairs.entries()].map(
      async ([key, { targetDishId, targetDishVersionId }]) => {
        try {
          const info = await resolvePartLinkDisplayInfo(
            ownerId,
            targetDishId,
            targetDishVersionId,
          );
          labels[key] = {
            title: info.title,
            versionLabel: formatVersionLabel(
              info.majorVersion,
              info.minorVersion,
            ),
          };
        } catch (error) {
          if (error instanceof NotFoundError) {
            labels[key] = { title: null, versionLabel: "" };
          } else {
            throw error;
          }
        }
      },
    ),
  );
  return labels;
}

export default async function PartComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { dishId } = await params;
  const { from, to } = await searchParams;

  let dish;
  try {
    dish = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const versions = await listDishVersionSummaries(dish.id);
  const basePath = dishBasePath("PART");
  const breadcrumbItems = [
    { label: "Parts", href: basePath },
    {
      label: dish.currentTitle ?? "Untitled part",
      href: `${basePath}/${dish.id}`,
    },
    { label: "Compare versions" },
  ];

  if (versions.length < 2) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Breadcrumbs items={breadcrumbItems} />
        <p className="text-muted-foreground">
          Nothing to compare yet — this part only has one version.
        </p>
      </div>
    );
  }

  if (from && !versions.some((v) => v.id === from)) notFound();
  if (to && !versions.some((v) => v.id === to)) notFound();

  const defaultPair = pickDefaultComparisonPair(
    versions,
    dish.currentVersionId,
  );
  const fromId = from || defaultPair.fromId;
  const toId = to || defaultPair.toId;

  const [fromVersion, toVersion] = await Promise.all([
    toCompareInput(dish.id, fromId),
    toCompareInput(dish.id, toId),
  ]);
  const result = compareDishVersions(fromVersion.input, toVersion.input);
  const partLinkLabels = await resolvePartLinkLabels(session.user.id, result);
  const fromLabel = formatVersionLabel(
    fromVersion.majorVersion,
    fromVersion.minorVersion,
  );
  const toLabel = formatVersionLabel(
    toVersion.majorVersion,
    toVersion.minorVersion,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Compare versions
        </h1>
        <VersionComparePicker
          kind="PART"
          dishId={dish.id}
          versions={versions}
          fromId={fromId}
          toId={toId}
        />
      </div>
      <VersionCompareView
        result={result}
        fromLabel={fromLabel}
        toLabel={toLabel}
        partLinkLabels={partLinkLabels}
      />
    </div>
  );
}
