import { ChefHat } from "lucide-react";
import {
  ActiveSessionCardShell,
  CompletedSessionCardShell,
} from "@/components/domain/cooking/session-card-shell";
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
  return (
    <ActiveSessionCardShell
      session={session}
      title={`Started ${formatAbsoluteTimestamp(session.startedAt)}`}
      actionSubject="this session"
      dialogSubject="this Cooking Session"
    />
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
  return (
    <CompletedSessionCardShell
      session={session}
      title={formatAbsoluteTimestamp(session.endedAt ?? session.startedAt)}
      actionSubject="this session"
      dialogSubject="this Cooking Session"
    />
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
