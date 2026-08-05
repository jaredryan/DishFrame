import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedDishDetailOrThrow } from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { DishDetailView } from "@/components/domain/dish/dish-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dishId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { dishId } = await params;
  try {
    const dish = await getOwnedDishDetailOrThrow(
      session.user.id,
      dishId,
      "PART",
    );
    return { title: dish.currentTitle ?? "Part" };
  } catch {
    return {};
  }
}

export default async function PartDetailPage({
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

  return <DishDetailView dish={dish} kind="PART" />;
}
