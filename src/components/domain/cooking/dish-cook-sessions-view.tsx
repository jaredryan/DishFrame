"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat,
  CirclePlay,
  CircleStop,
  Clock,
  Eye,
  Trash2,
} from "lucide-react";
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
import { endCookingSession, deleteCookingSession } from "@/lib/cooking/actions";
import {
  DisclosureDetail,
  DisclosurePill,
  NoteSection,
  RatingsBreakdown,
  RatingsSummaryPill,
  StaticPill,
  formatElapsedLabel,
} from "@/components/domain/cooking/session-card-primitives";
import type {
  DishActiveSessionData,
  DishCompletedSessionData,
} from "@/lib/cooking/queries";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function formatAbsoluteTimestamp(date: Date): string {
  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`;
}

/**
 * Active session card for a Recipe/Part's own scoped Cooking history page
 * — a session-start timestamp title, Resume/End actions, and a
 * noninteractive elapsed-time chip alongside a Notes disclosure (no
 * Ratings disclosure yet, since an active session has no saved review).
 */
export function DishActiveSessionCard({
  session,
}: {
  session: DishActiveSessionData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [endOpen, setEndOpen] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);

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
    <li className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            Started {formatAbsoluteTimestamp(session.startedAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StaticPill>
              <Clock className="size-3.5" aria-hidden="true" />
              {formatElapsedLabel(session.startedAt)}
            </StaticPill>
            <DisclosurePill
              open={notesOpen}
              onClick={() => setNotesOpen((v) => !v)}
            >
              Notes
            </DisclosurePill>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TooltipIconButton
            label="Resume this session"
            tooltip="Resume"
            icon={CirclePlay}
            onClick={() => router.push(`/cook/${session.id}`)}
          />
          <TooltipIconButton
            label="End this session"
            tooltip="End session"
            icon={CircleStop}
            onClick={() => setEndOpen(true)}
          />
        </div>
      </div>

      {notesOpen && (
        <DisclosureDetail>
          <p className="text-foreground text-sm font-medium">
            Cooking: {session.unitLabels.join(", ")}
          </p>
          <NoteSection label="Cooking notes" value={session.cookingNotes} />
        </DisclosureDetail>
      )}

      {error && (
        <p role="alert" className="text-destructive-text text-xs">
          {error}
        </p>
      )}

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this Cooking Session?</DialogTitle>
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
 * Completed session card for a Recipe/Part's own scoped Cooking history
 * page — an absolute timestamp title, View/Delete actions, and
 * independently-expandable Ratings/Notes disclosures (dish-specific
 * Cooking history redesign).
 */
export function DishCompletedSessionCard({
  session,
}: {
  session: DishCompletedSessionData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [ratingsOpen, setRatingsOpen] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCookingSession({ sessionId: session.id });
      setDeleteOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message ?? "Could not delete this session.");
      }
    });
  }

  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            {formatAbsoluteTimestamp(session.endedAt ?? session.startedAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RatingsSummaryPill
              ratings={session.ratings}
              open={ratingsOpen}
              onClick={() => setRatingsOpen((v) => !v)}
            />
            <DisclosurePill
              open={notesOpen}
              onClick={() => setNotesOpen((v) => !v)}
            >
              Notes
            </DisclosurePill>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TooltipIconButton
            label="View this session"
            tooltip="View"
            icon={Eye}
            onClick={() => router.push(`/cook/${session.id}`)}
          />
          <TooltipIconButton
            label="Delete this session"
            tooltip="Delete session"
            icon={Trash2}
            onClick={() => setDeleteOpen(true)}
            className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
          />
        </div>
      </div>

      {ratingsOpen && session.ratings.length > 0 && (
        <RatingsBreakdown ratings={session.ratings} />
      )}

      {notesOpen && (
        <DisclosureDetail>
          <p className="text-foreground text-sm font-medium">
            {session.isFullRecipe
              ? "Full recipe"
              : `Cooked: ${session.includedUnitLabels.join(", ")}`}
          </p>
          <NoteSection label="Cooking notes" value={session.cookingNotes} />
          <NoteSection label="What went well" value={session.whatWentWell} />
          <NoteSection
            label="What did not go well"
            value={session.whatDidNotGoWell}
          />
          <NoteSection label="Anything else" value={session.anythingElse} />
        </DisclosureDetail>
      )}

      {error && (
        <p role="alert" className="text-destructive-text text-xs">
          {error}
        </p>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Cooking Session?</DialogTitle>
            <DialogDescription>
              This permanently discards the session record, including its
              cooking history. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * Recipe/Part-scoped Cooking history page — Active/Completed sections kept
 * (PRODUCT_SPEC.md §41.5), but with cards tailored to a single already-known
 * dish rather than the generic `/cook` feed's cross-dish presentation
 * (`CookSessionsView`).
 */
export function DishCookSessionsView({
  active,
  completed,
  emptyStateDishTitle,
}: {
  active: DishActiveSessionData[];
  completed: DishCompletedSessionData[];
  emptyStateDishTitle: string;
}) {
  if (active.length === 0 && completed.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
        <ChefHat className="size-8" aria-hidden="true" />
        <p>No Cooking Sessions for {emptyStateDishTitle} yet.</p>
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
              <DishActiveSessionCard key={s.id} session={s} />
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
              <DishCompletedSessionCard key={s.id} session={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
