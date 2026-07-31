"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PartHistoryEventView = {
  sessionId: string;
  state: "COMPLETED" | "ENDED_EARLY";
  endedAt: string;
  isStandalone: boolean;
  dishTitle: string;
  occurrences: Array<{
    partVersionLabelSnapshot: string;
    pathSnapshot: string | null;
    relation: "DIRECT" | "NESTED" | null;
  }>;
};

/**
 * PRODUCT_SPEC.md §41.4/§41.5 — a Part's own cooking history, not only its
 * Last-cooked timestamp: every standalone session plus every Completed
 * Recipe/parent-Part session it was used in, one event per Cooking Session
 * even when the same Part occurred more than once within it (multiple
 * relationship paths listed together rather than duplicated rows).
 */
export function CookingHistoryDialog({
  events,
}: {
  events: PartHistoryEventView[];
}) {
  const [open, setOpen] = React.useState(false);

  if (events.length === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-auto gap-1 px-0 hover:bg-transparent hover:underline"
        onClick={() => setOpen(true)}
      >
        View cooking history
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cooking history</DialogTitle>
            <DialogDescription>
              Every Cooking Session this Part was actually included in.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-3">
            {events.map((event) => {
              const paths = event.occurrences
                .map((o) => o.pathSnapshot)
                .filter((p): p is string => p != null);
              return (
                <li
                  key={event.sessionId}
                  className="border-border flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground font-medium">
                      {event.isStandalone ? "Standalone" : event.dishTitle}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(event.endedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {event.state === "ENDED_EARLY" && (
                      <Badge variant="outline" className="text-xs">
                        Ended early
                      </Badge>
                    )}
                    {event.occurrences.map((occurrence, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="text-xs tabular-nums"
                      >
                        {occurrence.partVersionLabelSnapshot}
                      </Badge>
                    ))}
                  </div>
                  {paths.length > 0 && (
                    <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
                      {paths.map((path, index) => (
                        <li key={index}>{path}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
