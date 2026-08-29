"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Frontend interaction-architecture audit (2026-08-28): the app had ~15
 * hand-built confirmation dialogs sharing the same title/description/
 * Cancel/confirm shape. This covers that common shape only — a single
 * decision with an optional inline error, nothing else in the body. A
 * dialog with its own form fields, a list to review, or more than two
 * actions (e.g. the Restore-status picker, the usage-resolution list, the
 * Reuse-plan form) is a materially different interaction and stays a plain
 * `Dialog` composed by hand rather than being forced through this.
 */
export function ConfirmDialog({
  open,
  onOpenChangeAction,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  error,
  onConfirmAction,
}: {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Rendered between the description and the footer — the common
   * "confirm failed, dialog stays open" case. */
  error?: React.ReactNode;
  onConfirmAction: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChangeAction(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirmAction}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
