import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listSessionsForOwner } from "@/lib/cooking/queries";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { CookSessionsView } from "@/components/domain/cooking/cook-sessions-view";
import { StartCookingButton } from "@/components/domain/cooking/start-cooking-button";

export const metadata: Metadata = { title: "Cooking sessions" };

export default async function CookingSessionsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ dishId?: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { dishId } = await searchParams;

  // Recipe/Part detail's "Cooking history" overflow action scopes this same
  // page to one Dish's own sessions rather than duplicating the list UI on
  // a separate page. An unowned/deleted dishId is treated as no filter,
  // not a 404 — the page still has a useful unscoped fallback to show.
  let scopedDish: { id: string; currentTitle: string } | null = null;
  if (dishId) {
    try {
      const dish = await getOwnedDishOrThrow(session.user.id, dishId);
      scopedDish = {
        id: dish.id,
        currentTitle: dish.currentTitle ?? "Untitled",
      };
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }

  const { active, recentEnded } = await listSessionsForOwner(session.user.id, {
    dishId: scopedDish?.id,
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {scopedDish
              ? `Cooking history — ${scopedDish.currentTitle}`
              : "Cooking sessions"}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            {scopedDish ? (
              <>
                Every Cooking Session for {scopedDish.currentTitle}.{" "}
                <Link href="/cook" className="text-primary hover:underline">
                  View all Cooking Sessions
                </Link>
              </>
            ) : (
              <>
                Track your active and completed Cooking Sessions — start one
                from any Recipe or Part&apos;s own page, then follow along here
                until it&apos;s done.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StartCookingButton />
        </div>
      </div>

      <CookSessionsView
        active={active}
        completed={recentEnded}
        emptyStateDishTitle={scopedDish?.currentTitle}
      />
    </div>
  );
}
