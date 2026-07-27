import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  getHighestMajorVersion,
  getHighestMinorVersion,
  listDistinctCuisines,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { dishToFormValues } from "@/components/domain/dish/dish-form-values";

export const metadata: Metadata = {
  title: "Edit part",
};

export default async function EditPartPage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ versionId?: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { dishId } = await params;
  const { versionId } = await searchParams;

  let dish, version, highestMajorVersion, highestMinorInBaseLine;
  try {
    dish = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
    const targetVersionId = versionId || dish.currentVersionId;
    if (!targetVersionId) {
      throw new NotFoundError("Part not found.");
    }
    version = await getDishScopedVersionContentOrThrow(
      dish.id,
      targetVersionId,
    );
    highestMajorVersion = await getHighestMajorVersion(dish.id);
    highestMinorInBaseLine = await getHighestMinorVersion(
      dish.id,
      version.majorVersion,
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const cuisineOptions = await listDistinctCuisines(session.user.id, "PART");

  return (
    <DishEditor
      kind="PART"
      cuisineOptions={cuisineOptions}
      dish={{
        id: dish.id,
        baseVersionId: version.id,
        baseMajorVersion: version.majorVersion,
        baseMinorVersion: version.minorVersion,
        highestMajorVersion,
        // Slice 4 correction pass §1: the next minor is MAX(minorVersion)
        // in the base's own major line + 1 — not `baseMinorVersion + 1` —
        // since the base may be an older saved minor with later ones
        // already existing in the same line.
        nextMinorVersion: highestMinorInBaseLine + 1,
        isCurrent: version.id === dish.currentVersionId,
        values: dishToFormValues({
          stage: dish.stage,
          cuisine: dish.cuisine,
          currentTitle: dish.currentTitle,
          version,
        }),
      }}
    />
  );
}
