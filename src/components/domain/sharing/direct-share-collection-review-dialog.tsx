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
  finalizeDirectShareCollection,
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
      if (!nextOpen) {
        loadedRef.current = false;
        setDetail(null);
        setLoadError(null);
        setSubmitError(null);
        setDone(false);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
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
    startTransition(async () => {
      const result = await finalizeDirectShareCollection({
        collectionId,
        acceptedShareIds,
      });
      if (result.status === "error") {
        setSubmitError(result.message);
        return;
      }
      setDone(true);
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
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => submit([])}
                disabled={isPending}
              >
                Decline all
              </Button>
              <Button
                onClick={() => submit([...selected])}
                disabled={isPending}
              >
                {isPending
                  ? "Saving…"
                  : unselectedCount > 0
                    ? "Accept selected, decline rest"
                    : "Accept all"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
