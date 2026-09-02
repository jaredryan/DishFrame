import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { listCuisines } from "@/lib/cuisines/queries";

export const metadata: Metadata = {
  title: "New recipe",
};

export default async function NewRecipePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const cuisines = await listCuisines(session.user.id);

  return (
    <DishEditor
      kind="RECIPE"
      cuisineOptions={cuisines.map((cuisine) => ({
        id: cuisine.id,
        displayName: cuisine.displayName,
      }))}
      importHref="/recipes/import"
    />
  );
}
