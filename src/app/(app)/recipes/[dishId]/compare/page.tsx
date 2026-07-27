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
} from "@/lib/dishes/compare";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { decimalToNumber } from "@/lib/dishes/format";
import { dishBasePath } from "@/components/domain/dish/dish-card";

export const metadata: Metadata = {
  title: "Compare versions",
};

async function toCompareInput(
  dishId: string,
  versionId: string,
): Promise<{
  input: VersionCompareInput;
  majorVersion: number;
  minorVersion: number;
}> {
  const version = await getDishScopedVersionContentOrThrow(dishId, versionId);
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
      sections: versionContentToInput(version.sections, version.partLinks)
        .sections,
    },
  };
}

export default async function RecipeComparePage({
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
    dish = await getOwnedDishOrThrow(session.user.id, dishId, "RECIPE");
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const versions = await listDishVersionSummaries(dish.id);
  const basePath = dishBasePath("RECIPE");
  const breadcrumbItems = [
    { label: "Recipes", href: basePath },
    {
      label: dish.currentTitle ?? "Untitled recipe",
      href: `${basePath}/${dish.id}`,
    },
    { label: "Compare versions" },
  ];

  if (versions.length < 2) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Breadcrumbs items={breadcrumbItems} />
        <p className="text-muted-foreground">
          Nothing to compare yet — this recipe only has one version.
        </p>
      </div>
    );
  }

  // Explicitly-given ids must belong to this Dish or the URL is invalid;
  // absent ids fall back to a sensible default (current vs. the version
  // immediately before it), not a silent substitution of the user's choice.
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
  const fromLabel = `V${fromVersion.majorVersion}.${fromVersion.minorVersion}`;
  const toLabel = `V${toVersion.majorVersion}.${toVersion.minorVersion}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Compare versions
        </h1>
        <VersionComparePicker
          kind="RECIPE"
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
      />
    </div>
  );
}
