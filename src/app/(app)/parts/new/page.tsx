import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listDistinctCuisines } from "@/lib/dishes/queries";
import { DishEditor } from "@/components/domain/dish/dish-editor";

export const metadata: Metadata = {
  title: "New part",
};

export default async function NewPartPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const cuisineOptions = await listDistinctCuisines(session.user.id, "PART");

  return <DishEditor kind="PART" cuisineOptions={cuisineOptions} />;
}
