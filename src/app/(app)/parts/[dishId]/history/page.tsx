import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { listSessionsForOwner } from "@/lib/cooking/queries";
import { NotFoundError } from "@/lib/errors";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { CookSessionsView } from "@/components/domain/cooking/cook-sessions-view";

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
 * the Part itself, reusing `listSessionsForOwner`'s existing `dishId`
 * scope and `CookSessionsView` rather than a second session model/list UI.
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

  const { active, recentEnded } = await listSessionsForOwner(
    session.user.id,
    { dishId: dish.id },
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Parts", href: basePath },
          { label: displayTitle, href: `${basePath}/${dish.id}` },
          { label: "Cooking history" },
        ]}
      />

      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Cooking history
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Every Cooking Session for {displayTitle}, newest first.
        </p>
      </div>

      <CookSessionsView
        active={active}
        completed={recentEnded.map((s) => ({
          ...s,
          state: s.state as "COMPLETED" | "ENDED_EARLY",
        }))}
        emptyStateDishTitle={displayTitle}
      />
    </div>
  );
}
