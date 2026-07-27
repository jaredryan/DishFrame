import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listDistinctCuisines } from "@/lib/dishes/queries";
import { DishEditor } from "@/components/domain/dish/dish-editor";

export const metadata: Metadata = {
  title: "New recipe",
};

export default async function NewRecipePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const cuisineOptions = await listDistinctCuisines(session.user.id, "RECIPE");

  return <DishEditor kind="RECIPE" cuisineOptions={cuisineOptions} />;
}
