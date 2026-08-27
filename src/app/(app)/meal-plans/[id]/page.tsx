import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedMealPlanOrThrow,
  toMealPlanDetailDto,
} from "@/lib/mealplans/queries";
import { NotFoundError } from "@/lib/errors";
import { MealPlanView } from "@/components/domain/mealplans/meal-plan-view";

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
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { id } = await params;

  let mealPlan;
  try {
    mealPlan = await getOwnedMealPlanOrThrow(session.user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return <MealPlanView mealPlan={toMealPlanDetailDto(mealPlan)} />;
}
