import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listSessionsForOwner } from "@/lib/cooking/queries";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { CookSessionsView } from "@/components/domain/cooking/cook-sessions-view";
import { StartCookingButton } from "@/components/domain/cooking/start-cooking-button";
import { AppPageLayout } from "@/components/app/app-page-layout";

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
    <AppPageLayout
      title={
        scopedDish
          ? `Cooking history — ${scopedDish.currentTitle}`
          : "Cooking sessions"
      }
      description={
        scopedDish ? (
          <>
            Every Cooking Session for {scopedDish.currentTitle}.{" "}
            <Link href="/cook" className="text-primary hover:underline">
              View all Cooking Sessions
            </Link>
          </>
        ) : (
          <>
            Track your active and completed Cooking Sessions — start one from
            any Recipe or Part&apos;s own page, then follow along here until
            it&apos;s done.
          </>
        )
      }
      action={<StartCookingButton />}
    >
      <CookSessionsView
        active={active}
        completed={recentEnded}
        emptyStateDishTitle={scopedDish?.currentTitle}
      />
    </AppPageLayout>
  );
}
