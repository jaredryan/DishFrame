"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, Copy, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  archiveDish,
  duplicateDish,
  deleteDish,
  restoreDish,
} from "@/lib/dishes/actions";
import {
  restorableStageValues,
  type DishKindValue,
  type RestorableStageValue,
  type StageValue,
} from "@/lib/dishes/schema";
import { PartUsageResolutionDialog } from "@/components/domain/dish/part-usage-resolution-dialog";
import type { AttachablePartOption } from "@/components/domain/dish/part-attach-picker";

const STAGE_LABEL: Record<RestorableStageValue, string> = {
  IDEA: "Idea",
  EXPERIMENTAL: "Experimental",
  PROVEN: "Proven",
  ACTIVE: "Active",
};

type DialogKind = "archive" | "restore" | "duplicate" | "delete" | null;

export function DishDetailActions({
  dishId,
  kind,
  stage,
  attachableParts = [],
}: {
  dishId: string;
  kind: DishKindValue;
  stage: StageValue;
  attachableParts?: AttachablePartOption[];
}) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = React.useState<DialogKind>(null);
  const [restoreStage, setRestoreStage] =
    React.useState<RestorableStageValue>("ACTIVE");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [resolutionOpen, setResolutionOpen] = React.useState(false);

  const basePath = kind === "PART" ? "/parts" : "/recipes";
  const label = kind === "PART" ? "part" : "recipe";

  function close() {
    setOpenDialog(null);
    setError(null);
  }

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveDish(kind, dishId);
      if (result.status === "success") {
        close();
        router.refresh();
      } else {
        setError(result.message ?? "Could not archive.");
      }
    });
  }

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreDish(kind, {
        dishId,
        stage: restoreStage,
      });
      if (result.status === "success") {
        close();
        router.refresh();
      } else {
        setError(result.message ?? "Could not restore.");
      }
    });
  }

  function handleDuplicate() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateDish(kind, { dishId });
      if (result.status === "success" && result.dishId) {
        close();
        router.push(`${basePath}/${result.dishId}`);
      } else {
        setError(result.message ?? "Could not duplicate.");
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDish(kind, dishId);
      if (result.status === "success") {
        router.push(basePath);
      } else if (result.code === "PART_HAS_LIVE_USAGES") {
        close();
        setResolutionOpen(true);
      } else {
        setError(result.message ?? "Could not delete.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <Link href={`${basePath}/${dishId}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
        {stage === "ARCHIVED" ? (
          <Button variant="outline" onClick={() => setOpenDialog("restore")}>
            <RotateCcw /> Restore
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setOpenDialog("archive")}>
            <Archive /> Archive
          </Button>
        )}
        <Button variant="outline" onClick={() => setOpenDialog("duplicate")}>
          <Copy /> Duplicate
        </Button>
        <Button variant="destructive" onClick={() => setOpenDialog("delete")}>
          <Trash2 /> Delete
        </Button>
      </div>

      <Dialog
        open={openDialog === "archive"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this {label}?</DialogTitle>
            <DialogDescription>
              Archiving hides this {label} from your library and cooking
              choices, but keeps every Version, Cooking Session, and rating. You
              can restore it later.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleArchive} disabled={isPending}>
              {isPending ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "restore"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this {label}?</DialogTitle>
            <DialogDescription>
              Choose the status to restore it to.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={restoreStage}
            onValueChange={(value) =>
              setRestoreStage(value as RestorableStageValue)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {restorableStageValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {STAGE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleRestore} disabled={isPending}>
              {isPending ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "duplicate"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate this {label}?</DialogTitle>
            <DialogDescription>
              Creates a separate {label} starting from this one&apos;s current
              content, at V1.0. Its own Version history, Cooking Sessions, and
              ratings start empty.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={isPending}>
              {isPending ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openDialog === "delete"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete this {label}?</DialogTitle>
            <DialogDescription>
              This removes the {label}, every Version, Cooking Session, Session
              Review, rating, and its other owned relationships. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {kind === "PART" && (
        <PartUsageResolutionDialog
          open={resolutionOpen}
          onOpenChange={setResolutionOpen}
          partDishId={dishId}
          attachableParts={attachableParts}
          onDeleted={() => {
            setResolutionOpen(false);
            router.push(basePath);
          }}
        />
      )}
    </>
  );
}
