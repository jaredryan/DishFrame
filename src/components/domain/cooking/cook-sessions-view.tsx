"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChefHat, CirclePlay, CircleStop, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { formatRelativeAge } from "@/lib/format/relative-time";
import { endCookingSession } from "@/lib/cooking/actions";
import {
  StaticPill,
  formatElapsedLabel,
} from "@/components/domain/cooking/session-card-primitives";
import {
  ActiveSessionCardShell,
  CompletedSessionCardShell,
} from "@/components/domain/cooking/session-card-shell";
import type { DishKindValue } from "@/lib/dishes/schema";
import type {
  CrossDishActiveSessionData,
  CrossDishCompletedSessionData,
} from "@/lib/cooking/queries";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function isStale(startedAt: Date): boolean {
  return Date.now() - startedAt.getTime() > STALE_THRESHOLD_MS;
}

export type SessionRowData = {
  id: string;
  dishTitle: string;
  dishKind: DishKindValue | null;
  startedAt: Date;
};

/**
 * Active Cooking Session row shared by the Home dashboard's "Continue
 * cooking" section — a compact badge-only presentation, distinct from the
 * `/cook` page's own richer `CookActiveSessionCard` below (Cooking session
 * cards + navigation/profile follow-up item 2). Play is the only way to
 * resume; no row-level click-through.
 */
export function ActiveCookSessionCard({
  session,
}: {
  session: SessionRowData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [endOpen, setEndOpen] = React.useState(false);

  function confirmEnd() {
    setError(null);
    startTransition(async () => {
      const result = await endCookingSession({
        sessionId: session.id,
        outcome: "COMPLETED",
      });
      setEndOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message ?? "Could not end this session.");
      }
    });
  }

  return (
    <li className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-medium">
          {session.dishTitle}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StaticPill
            className={
              isStale(session.startedAt)
                ? "border-brand-orange/40 text-brand-orange-text"
                : undefined
            }
          >
            <Clock className="size-3" aria-hidden="true" />
            {formatRelativeAge(session.startedAt)}
          </StaticPill>
          <StaticPill>
            <Clock className="size-3" aria-hidden="true" />
            {formatElapsedLabel(session.startedAt)}
          </StaticPill>
        </div>
        {error && (
          <p role="alert" className="text-destructive-text mt-1 text-xs">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <TooltipIconButton
          label={`Resume ${session.dishTitle}`}
          tooltip="Resume"
          icon={CirclePlay}
          onClick={() => router.push(`/cook/${session.id}`)}
        />
        <TooltipIconButton
          label={`End ${session.dishTitle}`}
          tooltip="End session"
          icon={CircleStop}
          onClick={() => setEndOpen(true)}
        />
      </div>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End &ldquo;{session.dishTitle}&rdquo;?</DialogTitle>
            <DialogDescription>
              This marks the session Completed and moves it to your Completed
              history. Its checked-off progress and timers stay recorded — this
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isPending} onClick={confirmEnd}>
              End session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * `/cook` page's own Active session card — cross-dish, so the Recipe/Part
 * name is the title (Cooking session cards + navigation/profile follow-up
 * item 2). Below it, a compact control row: relative "Started" time,
 * noninteractive elapsed-time chip, and a Notes disclosure reusing the same
 * dish-scoped Active Notes content (current Sections/Parts being cooked plus
 * Cooking notes — no post-review fields or Ratings, since the session is
 * still in progress).
 */
export function CookActiveSessionCard({
  session,
}: {
  session: CrossDishActiveSessionData;
}) {
  return (
    <ActiveSessionCardShell
      session={session}
      title={session.dishTitle}
      leadingPill={
        <StaticPill>
          <Clock className="size-3.5" aria-hidden="true" />
          {formatRelativeAge(session.startedAt)}
        </StaticPill>
      }
      actionSubject={session.dishTitle}
      dialogSubject={<>&ldquo;{session.dishTitle}&rdquo;</>}
    />
  );
}

/**
 * `/cook` page's own Completed session card — cross-dish title, View/Delete
 * actions, and a relative-time chip in place of the dish-scoped page's
 * absolute timestamp (Cooking session cards + navigation/profile follow-up
 * item 2). Ratings/Notes disclosures reuse the exact dish-scoped behavior:
 * independently expandable, same open-state styling and chevron.
 */
export function CookCompletedSessionCard({
  session,
}: {
  session: CrossDishCompletedSessionData;
}) {
  return (
    <CompletedSessionCardShell
      session={session}
      title={session.dishTitle}
      leadingPill={
        <StaticPill>
          <Clock className="size-3.5" aria-hidden="true" />
          {formatRelativeAge(session.endedAt ?? session.startedAt)}
        </StaticPill>
      }
      actionSubject={session.dishTitle}
      dialogSubject={<>&ldquo;{session.dishTitle}&rdquo;</>}
    />
  );
}

/**
 * Cook page — Active/Completed columns, each row a Card above.
 */
export function CookSessionsView({
  active,
  completed,
  emptyStateDishTitle,
}: {
  active: CrossDishActiveSessionData[];
  completed: CrossDishCompletedSessionData[];
  // Set when this view is scoped to one Dish's own history (Recipe detail's
  // "Cooking history" action) — swaps in a scope-aware empty state instead
  // of the generic "start your first session" copy.
  emptyStateDishTitle?: string;
}) {
  if (active.length === 0 && completed.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
        <ChefHat className="size-8" aria-hidden="true" />
        <p>
          {emptyStateDishTitle ? (
            <>No Cooking Sessions for {emptyStateDishTitle} yet.</>
          ) : (
            <>
              Open a Recipe or Part and choose{" "}
              <span className="text-foreground font-medium">Cook</span> to start
              your first Cooking Session.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 md:items-start">
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Active
        </h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Cooking Sessions in progress.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((s) => (
              <CookActiveSessionCard key={s.id} session={s} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Completed
        </h2>
        {completed.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No completed Cooking Sessions yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {completed.map((s) => (
              <CookCompletedSessionCard key={s.id} session={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
