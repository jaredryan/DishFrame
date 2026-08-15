import * as React from "react";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared collapsed/expanded trigger for a Cooking Session card's Ratings/
 * Notes disclosures (dish-specific Cooking history redesign, reused by the
 * general `/cook` cards) — a "subtle selected/open visual state" plus a
 * rotating chevron. `disabled` renders the same chevron treatment,
 * non-interactively, for the "No ratings" state.
 */
export function DisclosurePill({
  children,
  open,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  open: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={disabled ? undefined : open}
      onClick={onClick}
      className={cn(
        "border-border inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        disabled
          ? "text-muted-foreground cursor-default"
          : cn(
              "cursor-pointer",
              open
                ? "bg-accent text-accent-foreground border-accent"
                : "text-foreground hover:bg-muted",
            ),
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "size-3.5 transition-transform",
          !disabled && open && "rotate-180",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Noninteractive pill matching `DisclosurePill`'s size/padding/border
 * treatment but with no chevron — used for the elapsed/relative-time chips,
 * which aren't disclosures.
 */
export function StaticPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium">
      {children}
    </span>
  );
}

/** Shared bordered-top panel a disclosure's expanded content sits in. */
export function DisclosureDetail({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border flex flex-col gap-3 border-t pt-3">
      {children}
    </div>
  );
}

export function StarRow({ value }: { value: number }) {
  return (
    <span className="flex items-center" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= value
              ? "size-3.5 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
              : "text-muted-foreground/30 size-3.5"
          }
        />
      ))}
    </span>
  );
}

export function NoteSection({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-foreground text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export type SessionRatingView = {
  tasterId: string;
  tasterName: string;
  isOwner: boolean;
  value: number;
};

/** The Ratings disclosure's collapsed trigger — an average/count summary,
 * or a disabled "No ratings" state when the session has none. */
export function RatingsSummaryPill({
  ratings,
  open,
  onClick,
}: {
  ratings: SessionRatingView[];
  open: boolean;
  onClick: () => void;
}) {
  const count = ratings.length;
  if (count === 0) {
    return (
      <DisclosurePill open={false} disabled>
        No ratings
      </DisclosurePill>
    );
  }
  const average = ratings.reduce((sum, r) => sum + r.value, 0) / count;
  return (
    <DisclosurePill open={open} onClick={onClick}>
      <span className="flex items-center gap-1">
        Ratings ·
        <Star
          className="size-3 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
          aria-hidden="true"
        />
        {average.toFixed(1)} ({count})
      </span>
    </DisclosurePill>
  );
}

/** The Ratings disclosure's expanded per-Taster breakdown. */
export function RatingsBreakdown({
  ratings,
}: {
  ratings: SessionRatingView[];
}) {
  return (
    <DisclosureDetail>
      <ul className="flex flex-col gap-1.5">
        {ratings.map((r) => (
          <li
            key={r.tasterId}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-foreground">
              {r.isOwner ? "You" : r.tasterName}
            </span>
            <span className="flex items-center gap-1.5">
              <StarRow value={r.value} />
              <span className="text-muted-foreground text-xs tabular-nums">
                {r.value}/5
              </span>
            </span>
          </li>
        ))}
      </ul>
    </DisclosureDetail>
  );
}

/** Non-live "N min elapsed" / "N hr M min elapsed" label — same computation
 * shared by the dish-scoped and general `/cook` Active cards. */
export function formatElapsedLabel(startedAt: Date): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? `${hours} hr ${minutes} min elapsed`
    : `${minutes} min elapsed`;
}
