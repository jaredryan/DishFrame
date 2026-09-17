import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { buildVersionCompareViewProps } from "@/lib/dishes/version-compare-page-props";
import { VersionCompareOfflineBoundary } from "@/components/domain/dish/version-compare-offline-boundary";
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
    return { title: `${dish.currentTitle ?? "Recipe"} — Compare versions` };
  } catch {
    return {};
  }
}

export default async function RecipeComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { dishId } = await params;

  if (dishId === OFFLINE_SHELL_SENTINEL) {
    return <VersionCompareOfflineBoundary serverProps={null} />;
  }

  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { from, to } = await searchParams;
  const props = await buildVersionCompareViewProps(
    session.user.id,
    dishId,
    "RECIPE",
    from,
    to,
  );

  return <VersionCompareOfflineBoundary serverProps={props} />;
}
