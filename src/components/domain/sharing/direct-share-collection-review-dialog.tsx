import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DirectSharePreview } from "@/components/domain/sharing/direct-share-preview";
import {
  getDirectShareCollectionDetail,
  acceptDirectShare,
  declineDirectShare,
} from "@/lib/sharing/actions";
import type { DirectShareCollectionDetail } from "@/lib/sharing/collections";

/**
 * The recipient review flow for a multi-item Send: Accept all, select a
 * subset (unselected items are declined as part of the same final
 * action — made explicit in the button copy so this is never ambiguous),
 * or Decline all. Defaults every pending item to selected so the common
 * "accept everything" action is one click.
 */
export function DirectShareCollectionReviewDialog({
  open,
  onOpenChange,
  collectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
}) {
  const router = useRouter();
  const [detail, setDetail] =
    React.useState<DirectShareCollectionDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [, startLoadTransition] = React.useTransition();
  const [isPending, startTransition] = React.useTransition();
  // Real per-recipe progress (not a timer): each accepted item is its own
  // sequential `acceptDirectShare` call (the same copy-heavy action a
  // single-item accept uses, idempotent/retry-safe per its own doc
  // comment), so this only advances once a recipe has actually finished
  // copying. `null` outside of an accept-bearing submission — a
  // decline-only submission has no copying to report progress on.
  const [progress, setProgress] = React.useState<{
    completed: number;
    total: number;
  } | null>(null);

  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    startLoadTransition(async () => {
      const result = await getDirectShareCollectionDetail({ collectionId });
      if (result.status === "error") {
        setLoadError(result.message);
        return;
      }
      setDetail(result.detail);
      setSelected(
        new Set(
          result.detail.children
            .filter((child) => child.status === "PENDING")
            .map((child) => child.id),
        ),
      );
    });
  }, [open, collectionId]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      // A bulk accept in progress is mid-way through creating independent
      // copies — closing partway through would strand the dialog's own
      // progress state without stopping the still-running submission.
      if (!nextOpen && isPending) return;
      if (!nextOpen) {
        loadedRef.current = false;
        setDetail(null);
        setLoadError(null);
        setSubmitError(null);
        setDone(false);
        setProgress(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, isPending],
  );

  const pendingChildren = React.useMemo(
    () => detail?.children.filter((child) => child.status === "PENDING") ?? [],
    [detail],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(acceptedShareIds: string[]) {
    setSubmitError(null);
    const acceptedSet = new Set(acceptedShareIds);
    const declinedShareIds = pendingChildren
      .map((child) => child.id)
      .filter((id) => !acceptedSet.has(id));
    const total = acceptedShareIds.length + declinedShareIds.length;
    setProgress(acceptedShareIds.length > 0 ? { completed: 0, total } : null);

    startTransition(async () => {
      let completed = 0;
      const failures: string[] = [];

      for (const directShareId of acceptedShareIds) {
        const result = await acceptDirectShare({ directShareId });
        if (result.status === "error") failures.push(result.message);
        completed += 1;
        setProgress({ completed, total });
      }
      for (const directShareId of declinedShareIds) {
        const result = await declineDirectShare({ directShareId });
        if (result.status === "error") failures.push(result.message);
        completed += 1;
        setProgress({ completed, total });
      }

      if (failures.length > 0) {
        setProgress(null);
        setSubmitError(
          failures.length === 1
            ? failures[0]
            : `${failures.length} items couldn't be processed — the rest were saved. Try again for the rest.`,
        );
      } else {
        setDone(true);
      }
      router.refresh();
    });
  }

  const unselectedCount = pendingChildren.length - selected.size;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Review shared items</DialogTitle>
          <DialogDescription>
            {detail
              ? `From ${detail.senderName}${detail.note ? ` — "${detail.note}"` : ""}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <p role="alert" className="text-destructive-text text-sm">
            {loadError}
          </p>
        )}

        {done ? (
          <p className="text-sm">Saved your decision for this collection.</p>
        ) : progress ? (
          <div className="space-y-2">
            <p className="text-sm">
              Accepting shared recipes — {progress.completed} /{" "}
              {progress.total} recipes
            </p>
            <div
              role="progressbar"
              aria-valuenow={progress.completed}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        ) : (
          detail && (
            <div className="space-y-3">
              {pendingChildren.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing left pending in this collection.
                </p>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {pendingChildren.map((child) => (
                    <li
                      key={child.id}
                      className="border-border space-y-2 rounded-md border p-3"
                    >
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={selected.has(child.id)}
                          onCheckedChange={() => toggle(child.id)}
                          aria-label={child.dishTitleSnapshot}
                        />
                        <span className="font-medium">
                          {child.dishTitleSnapshot}
                        </span>
                      </label>
                      <DirectSharePreview directShareId={child.id} />
                    </li>
                  ))}
                </ul>
              )}
              {pendingChildren.length > 0 && (
                <p className="text-muted-foreground text-sm">
                  {selected.size} selected to accept
                  {unselectedCount > 0
                    ? ` — the other ${unselectedCount} will be declined when you submit.`
                    : "."}
                </p>
              )}
              {submitError && (
                <p role="alert" className="text-destructive-text text-sm">
                  {submitError}
                </p>
              )}
              {detail.children.some((child) => child.status !== "PENDING") && (
                <div className="border-border space-y-1 rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground">Already resolved</p>
                  {detail.children
                    .filter((child) => child.status !== "PENDING")
                    .map((child) => (
                      <div
                        key={child.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>{child.dishTitleSnapshot}</span>
                        <Badge variant="secondary">{child.status}</Badge>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )
        )}

        <DialogFooter>
          {done || pendingChildren.length === 0 ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : !progress ? (
            <>
              <Button
                variant="outline"
                onClick={() => submit([])}
                loading={isPending}
              >
                Decline all
              </Button>
              <Button
                onClick={() => submit([...selected])}
                loading={isPending}
              >
                {unselectedCount > 0
                  ? "Accept selected, decline rest"
                  : "Accept all"}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
