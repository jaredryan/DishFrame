import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { listDishSessionHistory } from "@/lib/cooking/queries";
import { NotFoundError } from "@/lib/errors";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { DishCookSessionsView } from "@/components/domain/cooking/dish-cook-sessions-view";
import { AppPageLayout } from "@/components/app/app-page-layout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dishId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { dishId } = await params;
  try {
    const dish = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
    return { title: `${dish.currentTitle ?? "Part"} — Cooking history` };
  } catch {
    return {};
  }
}

/**
 * PRODUCT_SPEC.md §41.5 — one Part's own complete cooking history: every
 * ended Cooking Session, newest first, with no cutoff/cap (unlike the
 * global `/cook` page's bounded recent-history window). Distinct from the
 * Part's own composition/version history and the read-only "cooking
 * history" badge on its detail page (both cover how the Part is *used*
 * inside other Recipes/Parts) — this page is standalone sessions cooking
 * the Part itself, using `listDishSessionHistory`/`DishCookSessionsView` —
 * this dish-scoped page's own richer cards, not the generic `/cook` feed's
 * presentation.
 */
export default async function PartCookingHistoryPage({
  params,
}: {
  params: Promise<{ dishId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { dishId } = await params;

  let dish;
  try {
    dish = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const basePath = dishBasePath("PART");
  const displayTitle = dish.currentTitle ?? "Untitled part";

  const { active, completed } = await listDishSessionHistory(
    session.user.id,
    dish.id,
  );

  return (
    <AppPageLayout
      beforeHeader={
        <Breadcrumbs
          items={[
            { label: "Parts", href: basePath },
            { label: displayTitle, href: `${basePath}/${dish.id}` },
            { label: "Cooking history" },
          ]}
        />
      }
      title="Cooking history"
      description={`Every Cooking Session for ${displayTitle}, newest first.`}
    >
      <DishCookSessionsView
        active={active}
        completed={completed}
        emptyStateDishTitle={displayTitle}
      />
    </AppPageLayout>
  );
}
