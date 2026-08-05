import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  getDishVersionMajorMinor,
  getHighestMajorVersion,
  getHighestMinorVersion,
  listDistinctCuisines,
} from "@/lib/dishes/queries";
import { getSessionEvidenceForEditor } from "@/lib/reviews/queries";
import { NotFoundError } from "@/lib/errors";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { dishToFormValues } from "@/components/domain/dish/dish-form-values";
import { decimalToNumber } from "@/lib/dishes/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dishId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { dishId } = await params;
  try {
    const dish = await getOwnedDishOrThrow(session.user.id, dishId, "RECIPE");
    return { title: `${dish.currentTitle ?? "Recipe"} — Edit` };
  } catch {
    return {};
  }
}

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ versionId?: string; sessionId?: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { dishId } = await params;
  const { versionId, sessionId } = await searchParams;

  let dish, version, highestMajorVersion, highestMinorInBaseLine;
  try {
    dish = await getOwnedDishOrThrow(session.user.id, dishId, "RECIPE");
    const targetVersionId = versionId || dish.currentVersionId;
    if (!targetVersionId) {
      throw new NotFoundError("Recipe not found.");
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

  const isCurrent = version.id === dish.currentVersionId;
  const cuisineOptions = await listDistinctCuisines(session.user.id, "RECIPE");
  const currentVersion = isCurrent
    ? null
    : await getDishVersionMajorMinor(dish.id, dish.currentVersionId);
  // PRODUCT_SPEC.md §39.5: only trust a `sessionId` deep-link when it
  // actually belongs to this Dish — otherwise silently drop it rather than
  // surface another item's evidence.
  const evidenceRaw = sessionId
    ? await getSessionEvidenceForEditor(session.user.id, sessionId)
    : null;
  const evidence = evidenceRaw?.dishId === dish.id ? evidenceRaw : null;

  return (
    <DishEditor
      kind="RECIPE"
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
        isCurrent,
        currentMajorVersion: currentVersion?.majorVersion ?? null,
        currentMinorVersion: currentVersion?.minorVersion ?? null,
        note: version.versionNote,
        defaultScale: decimalToNumber(dish.defaultScale),
        values: dishToFormValues({
          stage: dish.stage,
          cuisine: dish.cuisine,
          currentTitle: dish.currentTitle,
          version,
        }),
        evidence,
      }}
    />
  );
}
