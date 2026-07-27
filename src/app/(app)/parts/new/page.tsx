import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  listDistinctCuisines,
  listAttachableParts,
} from "@/lib/dishes/queries";
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
  // No `excludeDishId` yet — a brand-new Part has no id to exclude itself
  // with; a self-attach is still safely rejected by `validatePartAttachment`
  // once it has one.
  const attachableParts = await listAttachableParts(session.user.id);

  return (
    <DishEditor
      kind="PART"
      cuisineOptions={cuisineOptions}
      attachableParts={attachableParts}
    />
  );
}
