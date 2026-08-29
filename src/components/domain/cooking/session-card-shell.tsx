"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CirclePlay, CircleStop, Clock, Eye, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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

/**
 * Shared Active/Completed Cooking Session card bodies (code audit
 * "worthwhile follow-up": `cook-sessions-view.tsx`'s cross-dish
 * `Cook*SessionCard` pair and `dish-cook-sessions-view.tsx`'s
 * dish-scoped `Dish*SessionCard` pair were ~90% identical — same
 * confirm-dialog structure, disclosure wiring, and `confirmEnd`/
 * `confirmDelete` logic). Both surfaces render through the shells below;
 * only presentation that genuinely differs between them — title content,
 * an optional leading relative-time chip, and the subject phrase used in
 * action labels/confirm dialogs — is passed in as props. `session` is
 * typed against the dish-scoped shape since the cross-dish types are that
 * same shape plus `dishId`/`dishTitle`/`dishKind` (`CrossDishActiveSessionData`/
 * `CrossDishCompletedSessionData`, `lib/cooking/queries.ts`).
 */
export function ActiveSessionCardShell({
  session,
  title,
  leadingPill,
  actionSubject,
  dialogSubject,
}: {
  session: DishActiveSessionData;
  title: React.ReactNode;
  leadingPill?: React.ReactNode;
  actionSubject: string;
  dialogSubject: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [endOpen, setEndOpen] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const { showToast } = useToast();

  function confirmEnd() {
    startTransition(async () => {
      const result = await endCookingSession({
        sessionId: session.id,
        outcome: "COMPLETED",
      });
      setEndOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not end this session.",
        });
      }
    });
  }

  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            {title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {leadingPill}
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
            label={`Resume ${actionSubject}`}
            tooltip="Resume"
            icon={CirclePlay}
            onClick={() => router.push(`/cook/${session.id}`)}
          />
          <TooltipIconButton
            label={`End ${actionSubject}`}
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

      <ConfirmDialog
        open={endOpen}
        onOpenChangeAction={setEndOpen}
        title={<>End {dialogSubject}?</>}
        description="This marks the session Completed and moves it to your Completed history. Its checked-off progress and timers stay recorded — this can't be undone."
        confirmLabel="End session"
        loading={isPending}
        onConfirmAction={confirmEnd}
      />
    </li>
  );
}

export function CompletedSessionCardShell({
  session,
  title,
  leadingPill,
  actionSubject,
  dialogSubject,
}: {
  session: DishCompletedSessionData;
  title: React.ReactNode;
  leadingPill?: React.ReactNode;
  actionSubject: string;
  dialogSubject: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [ratingsOpen, setRatingsOpen] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const { showToast } = useToast();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteCookingSession({ sessionId: session.id });
      setDeleteOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not delete this session.",
        });
      }
    });
  }

  return (
    <li className="border-border bg-card relative flex flex-col gap-3 rounded-lg border px-4 py-3">
      <Link
        href={`/cook/${session.id}`}
        aria-label={`Open ${actionSubject}`}
        className="absolute inset-0 z-0 rounded-lg"
      />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            {title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {leadingPill}
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
            label={`View ${actionSubject}`}
            tooltip="View"
            icon={Eye}
            onClick={() => router.push(`/cook/${session.id}`)}
          />
          <TooltipIconButton
            label={`Delete ${actionSubject}`}
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

      <ConfirmDialog
        open={deleteOpen}
        onOpenChangeAction={setDeleteOpen}
        title={<>Delete {dialogSubject}?</>}
        description="This permanently discards the session record, including its cooking history. This can't be undone."
        confirmLabel="Delete"
        destructive
        loading={isPending}
        onConfirmAction={confirmDelete}
      />
    </li>
  );
}
