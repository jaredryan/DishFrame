import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedDishDetailOrThrow } from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { DishDetailView } from "@/components/domain/dish/dish-detail-view";

export const metadata: Metadata = {
  title: "Recipe",
};

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ dishId: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { dishId } = await params;

  let dish;
  try {
    dish = await getOwnedDishDetailOrThrow(session.user.id, dishId, "RECIPE");
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return <DishDetailView dish={dish} kind="RECIPE" />;
}
