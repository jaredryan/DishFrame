import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedDishDetailOrThrow } from "@/lib/dishes/queries";
import { buildDishDetailViewProps } from "@/lib/dishes/detail-view";
import { NotFoundError } from "@/lib/errors";
import { DishOfflineBoundary } from "@/components/domain/dish/dish-offline-boundary";
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
    const dish = await getOwnedDishDetailOrThrow(
      session.user.id,
      dishId,
      "RECIPE",
    );
    return { title: dish.currentTitle ?? "Recipe" };
  } catch {
    return {};
  }
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ dishId: string }>;
}) {
  const { dishId } = await params;

  // Proactively-precached neutral shell (public/sw.js) for a genuinely
  // first-ever offline visit to this route pattern — checked before any
  // auth/data dependency so precaching succeeds regardless of session
  // state (docs/OFFLINE_IMPLEMENTATION_PLAN.md §1).
  if (dishId === OFFLINE_SHELL_SENTINEL) {
    return <DishOfflineBoundary serverProps={null} />;
  }

  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  let props;
  try {
    props = await buildDishDetailViewProps(session.user.id, dishId, "RECIPE");
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return <DishOfflineBoundary serverProps={props} />;
}
