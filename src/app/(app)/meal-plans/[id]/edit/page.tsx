import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedMealPlanOrThrow,
  loadMealPlanEditorOptions,
  toMealPlanDetailDto,
} from "@/lib/mealplans/queries";
import { NotFoundError } from "@/lib/errors";
import { MealPlanEditorOfflineBoundary } from "@/components/domain/mealplans/meal-plan-editor-offline-boundary";
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
    return { title: `${mealPlan.title} — Edit` };
  } catch {
    return {};
  }
}

export default async function EditMealPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === OFFLINE_SHELL_SENTINEL) {
    return (
      <MealPlanEditorOfflineBoundary
        mode="edit"
        mealPlanId={id}
        serverMealPlan={null}
        serverOptions={{
          candidates: [],
          tagOptions: [],
          cuisineOptions: [],
          flavorProfileOptions: [],
        }}
      />
    );
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

  const { candidates, tagOptions, cuisineOptions, flavorProfileOptions } =
    await loadMealPlanEditorOptions(session.user.id);

  return (
    <MealPlanEditorOfflineBoundary
      mode="edit"
      mealPlanId={id}
      serverMealPlan={toMealPlanDetailDto(mealPlan)}
      serverOptions={{
        candidates,
        tagOptions,
        cuisineOptions,
        flavorProfileOptions,
      }}
    />
  );
}
