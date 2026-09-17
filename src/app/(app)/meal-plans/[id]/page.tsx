import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedMealPlanOrThrow,
  toMealPlanDetailDto,
} from "@/lib/mealplans/queries";
import { NotFoundError } from "@/lib/errors";
import { MealPlanOfflineBoundary } from "@/components/domain/mealplans/meal-plan-offline-boundary";
import { OFFLINE_SHELL_SENTINEL } from "@/lib/offline/shell-sentinel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { id } = await params;
  try {
    const mealPlan = await getOwnedMealPlanOrThrow(session.user.id, id);
    return { title: mealPlan.title };
  } catch {
    return {};
  }
}

export default async function MealPlanViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === OFFLINE_SHELL_SENTINEL) {
    return <MealPlanOfflineBoundary serverMealPlan={null} />;
  }

  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  let mealPlan;
  try {
    mealPlan = await getOwnedMealPlanOrThrow(session.user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <MealPlanOfflineBoundary serverMealPlan={toMealPlanDetailDto(mealPlan)} />
  );
}
