import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** `percent` is honest, real progress (0-100) — chunk boundaries, or
 * completed/total items — never a fabricated estimate. `label` is optional
 * caller copy under the bar (e.g. "3 / 10 recipes"). `null` renders an
 * indeterminate pulse for a caller with only a single pending state, rather
 * than a fake percentage. */
export type BatchProgressValue = { percent: number; label?: string } | null;

/**
 * The one shared batch-operation waiting/progress treatment (toast/Send/
 * Publish QA batch item 6): built for batch Import, reused as-is for batch
 * receive/accept and any other multi-item operation that takes long enough
 * for a plain disabled-button spinner to feel stalled.
 */
export function BatchProgressIndicator({
  progress,
  className,
}: {
  progress: BatchProgressValue;
  className?: string;
}) {
  return (
    <div className="space-y-2">
      <div
        role="progressbar"
        aria-valuenow={progress ? Math.round(progress.percent) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          "bg-muted h-2 w-full overflow-hidden rounded-full",
          className,
        )}
      >
        <div
          className={cn(
            "bg-primary h-full rounded-full",
            progress
              ? "transition-[width] duration-150 ease-linear"
              : "w-full animate-pulse",
          )}
          style={progress ? { width: `${progress.percent}%` } : undefined}
        />
      </div>
      {progress?.label && (
        <p className="text-muted-foreground text-sm">{progress.label}</p>
      )}
    </div>
  );
}

/**
 * Standalone non-dismissible modal wrapper around `BatchProgressIndicator`
 * for a caller not already inside its own open Dialog (e.g. batch Import,
 * which isn't itself a modal flow). A caller whose progress needs to render
 * inside an already-open Dialog (e.g. the batch-receive Review dialog)
 * should use `BatchProgressIndicator` directly instead of nesting a second
 * Dialog.
 */
export function BatchProgressDialog({
  open,
  title,
  description = "This may take a moment. Keep this page open.",
  progress,
}: {
  open: boolean;
  title: string;
  description?: string;
  progress: BatchProgressValue;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <BatchProgressIndicator progress={progress} />
      </DialogContent>
    </Dialog>
  );
}
