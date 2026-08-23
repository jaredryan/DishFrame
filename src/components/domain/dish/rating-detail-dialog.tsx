"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RatingSummary } from "@/lib/reviews/queries";

export type StartingPoint = {
  title: string;
  versionLabel: string;
  aggregateRating: number | null;
  ratingCount: number | null;
  sessionCount: number | null;
};

/**
 * PRODUCT_SPEC.md §36.4: the deliberate deeper view behind the compact card
 * badge — every canonical summary from §36.3, plus the "Starting point"
 * inherited-context block from §19.4, kept visually distinct from the
 * item's own history rather than blended into one average.
 */
export function RatingDetailDialog({
  kindLabel,
  summary,
  startingPoint,
}: {
  kindLabel: "Recipe" | "Part";
  summary: RatingSummary;
  startingPoint: StartingPoint | null;
}) {
  const [open, setOpen] = React.useState(false);

  if (summary.ratingCount === 0 && !startingPoint) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Star className="size-3.5" aria-hidden="true" />
        View ratings
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ratings</DialogTitle>
            <DialogDescription>
              How this {kindLabel.toLowerCase()} has scored across every Cooking
              Session.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {summary.ratingCount > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-foreground text-sm font-medium">
                  This {kindLabel}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <StatChip
                    label="All-time average"
                    value={summary.allTimeAverage}
                  />
                  <StatChip
                    label="Current Version"
                    value={summary.currentVersionGroupAverage}
                    count={summary.currentVersionRatingCount}
                  />
                  <StatChip
                    label="Latest rated session"
                    value={summary.latestRatedSessionAverage}
                  />
                </div>
                <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span>{summary.ratingCount} rating(s)</span>
                  <span>{summary.ratedSessionCount} rated session(s)</span>
                  <span>{summary.distinctTasterCount} Taster(s)</span>
                  {summary.min != null && summary.max != null && (
                    <span>
                      Range {summary.min}–{summary.max}
                    </span>
                  )}
                </div>
              </section>
            ) : (
              <p className="text-muted-foreground text-sm">
                No ratings yet for this {kindLabel.toLowerCase()}.
              </p>
            )}

            {summary.perTaster.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-foreground text-sm font-medium">
                  By Taster
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {summary.perTaster.map((t) => (
                    <li
                      key={t.tasterId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-foreground">{t.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {t.average.toFixed(1)}/5 · {t.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {summary.historyByVersion.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-foreground text-sm font-medium">
                  Rating history by Version
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {summary.historyByVersion.map((v) => (
                    <li
                      key={v.dishVersionId}
                      className="flex items-center justify-between text-sm"
                    >
                      <Badge variant="outline" className="tabular-nums">
                        {v.versionLabel}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums">
                        {v.average.toFixed(1)}/5 · {v.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {startingPoint && (
              <section className="border-border flex flex-col gap-1 border-t pt-4">
                <h3 className="text-foreground text-sm font-medium">
                  Starting point
                </h3>
                <p className="text-muted-foreground text-sm">
                  Based on {startingPoint.title} {startingPoint.versionLabel}
                </p>
                {startingPoint.aggregateRating != null && (
                  <p className="text-muted-foreground flex items-center gap-1 text-sm">
                    <Star className="size-3.5" aria-hidden="true" />~
                    {startingPoint.aggregateRating.toFixed(1)}/5
                    {startingPoint.ratingCount
                      ? ` across ${startingPoint.ratingCount} rating(s)`
                      : ""}
                  </p>
                )}
                {startingPoint.sessionCount != null && (
                  <p className="text-muted-foreground text-xs">
                    {startingPoint.sessionCount} source Cooking Session(s)
                  </p>
                )}
                <p className="text-muted-foreground text-xs italic">
                  This inherited evidence never counts toward this{" "}
                  {kindLabel.toLowerCase()}&apos;s own average.
                </p>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatChip({
  label,
  value,
  count,
}: {
  label: string;
  value: number | null;
  count?: number;
}) {
  if (value == null) return null;
  return (
    <div className="border-border flex flex-col rounded-lg border px-3 py-1.5">
      <span className="text-foreground font-semibold tabular-nums">
        {value.toFixed(1)}/5
      </span>
      <span className="text-muted-foreground text-xs">
        {label}
        {count != null ? ` (${count})` : ""}
      </span>
    </div>
  );
}
