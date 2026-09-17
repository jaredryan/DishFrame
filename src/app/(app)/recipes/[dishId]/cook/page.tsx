import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { buildCookableUnits } from "@/lib/cooking/queries";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  listDishVersionSummaries,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { toSetupUnits } from "@/lib/cooking/setup-units";
import { CookingSetupOfflineBoundary } from "@/components/domain/cooking/cooking-setup-offline-boundary";
import { versionLabel } from "@/lib/dishes/version-note";
import { decimalToNumber } from "@/lib/dishes/format";
import { OFFLINE_SHELL_SENTINEL } from "@/lib/offline/shell-sentinel";

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
    return { title: `${dish.currentTitle ?? "Recipe"} — Cooking setup` };
  } catch {
    return {};
  }
}

export default async function RecipeCookingSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ versionId?: string; from?: string }>;
}) {
  const { dishId } = await params;

  if (dishId === OFFLINE_SHELL_SENTINEL) {
    return <CookingSetupOfflineBoundary serverProps={null} />;
  }

  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { versionId, from } = await searchParams;
  const cancelHref =
    from === "home"
      ? "/home"
      : from === "cook"
        ? "/cook"
        : `/recipes/${dishId}`;

  let dish, version;
  try {
    dish = await getOwnedDishOrThrow(session.user.id, dishId, "RECIPE");
    const targetVersionId = versionId || dish.currentVersionId;
    if (!targetVersionId) throw new NotFoundError("Recipe not found.");
    // Ownership of `dishId` is already established above — scope directly
    // by dishId instead of re-fetching the Dish row a second time.
    version = await getDishScopedVersionContentOrThrow(dishId, targetVersionId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [cookableUnits, versions] = await Promise.all([
    buildCookableUnits(session.user.id, dish, version),
    listDishVersionSummaries(dishId),
  ]);

  return (
    <CookingSetupOfflineBoundary
      serverProps={{
        dishId: dish.id,
        dishKind: "RECIPE",
        dishVersionId: version.id,
        dishTitle: dish.currentTitle || "Untitled",
        versionLabel: versionLabel(version.majorVersion, version.minorVersion),
        isCurrent: version.id === dish.currentVersionId,
        currentVersionId: dish.currentVersionId,
        versions,
        units: toSetupUnits(cookableUnits),
        sourceOutputQuantity: decimalToNumber(version.yieldQuantity),
        sourceOutputUnit: version.yieldUnit,
        cancelHref,
      }}
    />
  );
}
