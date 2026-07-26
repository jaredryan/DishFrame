import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedDishDetailOrThrow } from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { dishToFormValues } from "@/components/domain/dish/dish-form-values";

export const metadata: Metadata = {
  title: "Edit part",
};

export default async function EditPartPage({
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
    dish = await getOwnedDishDetailOrThrow(session.user.id, dishId, "PART");
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div>
      <h1 className="font-heading text-foreground mb-6 text-2xl font-semibold">
        Edit part
      </h1>
      <DishEditor
        kind="PART"
        dish={{
          id: dish.id,
          currentVersionId: dish.currentVersionId!,
          currentMajorVersion: dish.currentVersion!.majorVersion,
          currentMinorVersion: dish.currentVersion!.minorVersion,
          values: dishToFormValues(dish),
        }}
      />
    </div>
  );
}
