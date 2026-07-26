import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { DishEditor } from "@/components/domain/dish/dish-editor";

export const metadata: Metadata = {
  title: "New recipe",
};

export default async function NewRecipePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div>
      <h1 className="font-heading text-foreground mb-6 text-2xl font-semibold">
        New recipe
      </h1>
      <DishEditor kind="RECIPE" />
    </div>
  );
}
