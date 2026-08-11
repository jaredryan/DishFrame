"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ChefHat,
  Copy,
  Download,
  GitCompareArrows,
  History,
  MoreHorizontal,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ShareDialog } from "@/components/domain/sharing/share-dialog";
import { DirectShareDialog } from "@/components/domain/sharing/direct-share-dialog";
import { DirectShareCollectionDialog } from "@/components/domain/sharing/direct-share-collection-dialog";
import { versionLabel } from "@/lib/dishes/version-note";

const ALL_VERSIONS_VALUE = "__ALL__";

type ExportableVersion = {
  id: string;
  majorVersion: number;
  minorVersion: number;
};

const STAGE_LABEL: Record<RestorableStageValue, string> = {
  IDEA: "Idea",
  EXPERIMENTAL: "Experimental",
  PROVEN: "Proven",
  ACTIVE: "Active",
};

type DialogKind =
  | "archive"
  | "restore"
  | "duplicate"
  | "delete"
  | "export"
  | "share"
  | "send"
  | null;

export function DishDetailActions({
  dishId,
  kind,
  stage,
  currentVersionId,
  versions,
}: {
  dishId: string;
  kind: DishKindValue;
  stage: StageValue;
  // Design remediation pass: Version history now opens from this overflow
  // menu (moved off the detail page's own separate links row) — needs the
  // current Version's id to build that route.
  currentVersionId: string;
  // Slice 11 correction pass: the export dialog's Version-selection control.
  versions: ExportableVersion[];
}) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = React.useState<DialogKind>(null);
  const [restoreStage, setRestoreStage] =
    React.useState<RestorableStageValue>("ACTIVE");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [resolutionOpen, setResolutionOpen] = React.useState(false);
  // Defaults to the current Version each time the dialog opens (PRODUCT_SPEC.md
  // §55.2, Slice 11 correction pass) — reset in `close()` below.
  const [exportVersionValue, setExportVersionValue] =
    React.useState<string>(currentVersionId);
  const exportVersionQuery =
    exportVersionValue === ALL_VERSIONS_VALUE
      ? "versionMode=ALL"
      : `versionMode=SINGLE&versionId=${encodeURIComponent(exportVersionValue)}`;

  const basePath = kind === "PART" ? "/parts" : "/recipes";
  const label = kind === "PART" ? "part" : "recipe";
  const kindLabel = kind === "PART" ? "Part" : "Recipe";

  function close() {
    setOpenDialog(null);
    setError(null);
    setExportVersionValue(currentVersionId);
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
      {/* Slice 6A: the primary Edit action is icon-only (a pencil, with a
          styled Tooltip) so it fits beside the title in the responsive
          hero's top-right — everything else moved into this overflow menu,
          widened so its longer labels (Version history, Compare versions)
          never wrap. Slice 7: Prepare to cook (PRODUCT_SPEC.md §21.1) joins
          this same row as its own prominent button — cooking is the
          primary reason to open a Recipe/Part, not an overflow action. */}
      <div className="flex items-center gap-1">
        <Button asChild>
          <Link href={`${basePath}/${dishId}/cook`}>
            <ChefHat aria-hidden="true" />
            Cook
          </Link>
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" size="icon">
                <Link
                  href={`${basePath}/${dishId}/edit`}
                  aria-label={`Edit ${kindLabel}`}
                >
                  <Pencil aria-hidden="true" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit {kindLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href={`${basePath}/${dishId}/versions/${currentVersionId}`}>
                <History /> Version history
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${basePath}/${dishId}/compare`}>
                <GitCompareArrows /> Compare versions
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenDialog("duplicate")}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenDialog("share")}>
              <Share2 /> Share
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenDialog("send")}>
              <Send /> Send to user
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenDialog("export")}>
              <Download /> Export
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/print${basePath}/${dishId}`}>
                <Printer /> Print
              </Link>
            </DropdownMenuItem>
            {stage === "ARCHIVED" ? (
              <DropdownMenuItem onSelect={() => setOpenDialog("restore")}>
                <RotateCcw /> Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setOpenDialog("archive")}>
                <Archive /> Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setOpenDialog("delete")}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
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
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
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
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
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
        open={openDialog === "export"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export this {label}</DialogTitle>
            <DialogDescription>
              Choose a Version and how much evidence to include.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="export-version-select"
              className="text-foreground text-sm font-medium"
            >
              Version
            </label>
            <Select
              value={exportVersionValue}
              onValueChange={setExportVersionValue}
            >
              <SelectTrigger id="export-version-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {versionLabel(v.majorVersion, v.minorVersion)}
                    {v.id === currentVersionId ? " (current)" : ""}
                  </SelectItem>
                ))}
                <SelectItem value={ALL_VERSIONS_VALUE}>
                  Include all Versions
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-3">
            <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-foreground text-sm font-medium">Standard</p>
                <p className="text-muted-foreground text-sm">
                  Content and aggregate rating only — no Taster names,
                  individual ratings, Cooking notes, or session history.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/export/dish/${dishId}?kind=${kind}&tier=STANDARD&${exportVersionQuery}`}
                  download
                >
                  Download
                </a>
              </Button>
            </div>
            <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-foreground text-sm font-medium">
                  Detailed evidence
                </p>
                <p className="text-muted-foreground text-sm">
                  Adds per-Version and per-session rating breakdowns. Taster
                  names stay anonymized.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/export/dish/${dishId}?kind=${kind}&tier=DETAILED&${exportVersionQuery}`}
                  download
                >
                  Download
                </a>
              </Button>
            </div>
            <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-foreground text-sm font-medium">
                  Full private history
                </p>
                <p className="text-muted-foreground text-sm">
                  Adds real Taster names, Cooking notes, Session Reviews, and
                  full Cooking Session history. This file contains private
                  information — only share it with someone you trust.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/export/dish/${dishId}?kind=${kind}&tier=FULL_PRIVATE_HISTORY&${exportVersionQuery}`}
                  download
                >
                  Download
                </a>
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Close
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
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
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
          onDeleted={() => {
            setResolutionOpen(false);
            router.push(basePath);
          }}
        />
      )}

      <ShareDialog
        open={openDialog === "share"}
        onOpenChange={(open) => !open && close()}
        dishId={dishId}
        kind={kind}
      />

      {kind === "PART" ? (
        <DirectShareDialog
          open={openDialog === "send"}
          onOpenChange={(open) => !open && close()}
          dishId={dishId}
          kind={kind}
        />
      ) : (
        <DirectShareCollectionDialog
          open={openDialog === "send"}
          onOpenChange={(open) => !open && close()}
          preselectedDishId={dishId}
        />
      )}
    </>
  );
}
