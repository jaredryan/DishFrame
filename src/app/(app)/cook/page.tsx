import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listSessionsForOwner } from "@/lib/cooking/queries";
import { CookSessionsView } from "@/components/domain/cooking/cook-sessions-view";
import { StartCookingButton } from "@/components/domain/cooking/start-cooking-button";

export const metadata: Metadata = { title: "Cooking sessions" };

export default async function CookingSessionsIndexPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { active, recentEnded } = await listSessionsForOwner(session.user.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            Cooking sessions
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Track your active and completed Cooking Sessions — start one from
            any Recipe or Part&apos;s own page, then follow along here until
            it&apos;s done.
          </p>
        </div>
        <StartCookingButton />
      </div>

      <CookSessionsView
        active={active}
        completed={recentEnded.map((s) => ({
          ...s,
          state: s.state as "COMPLETED" | "ENDED_EARLY",
        }))}
      />
    </div>
  );
}
