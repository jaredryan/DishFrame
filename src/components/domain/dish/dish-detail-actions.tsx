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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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
  listExportableDishVersions,
} from "@/lib/dishes/actions";
import {
  restorableStageValues,
  type DishKindValue,
  type RestorableStageValue,
  type StageValue,
} from "@/lib/dishes/schema";
import { PartUsageResolutionDialog } from "@/components/domain/dish/part-usage-resolution-dialog";
import { ShareDialog } from "@/components/domain/sharing/share-dialog";
import { DirectShareSingleItemDialog } from "@/components/domain/sharing/direct-share-single-item-dialog";
import { VersionPicker } from "@/components/domain/dish/version-picker";
import type { ExportTierValue } from "@/lib/importExport/export-dto";

type ExportScope = "SINGLE" | "ALL";

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
  dishTitle,
  kind,
  stage,
  currentVersionId,
}: {
  dishId: string;
  // The contextual single-item Send dialog shows this locked item's title.
  dishTitle: string;
  kind: DishKindValue;
  stage: StageValue;
  // Design remediation pass: Version history now opens from this overflow
  // menu (moved off the detail page's own separate links row) — needs the
  // current Version's id to build that route.
  currentVersionId: string;
}) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = React.useState<DialogKind>(null);
  const [restoreStage, setRestoreStage] =
    React.useState<RestorableStageValue>("ACTIVE");
  const [isPending, startTransition] = React.useTransition();
  const [resolutionOpen, setResolutionOpen] = React.useState(false);
  const { showToast } = useToast();
  // Defaults to the current Version each time the dialog opens (PRODUCT_SPEC.md
  // §55.2, Slice 11 correction pass) — reset in `close()` below.
  const [exportScope, setExportScope] = React.useState<ExportScope>("SINGLE");
  const [exportVersionValue, setExportVersionValue] =
    React.useState<string>(currentVersionId);
  const [downloadingTier, setDownloadingTier] =
    React.useState<ExportTierValue | null>(null);
  const exportVersionQuery =
    exportScope === "ALL"
      ? "versionMode=ALL"
      : `versionMode=SINGLE&versionId=${encodeURIComponent(exportVersionValue)}`;

  // Code-audit fix (2026-08-27, second follow-up): the Export dialog's
  // Version dropdown used to receive every Version this Dish has ever had,
  // eagerly fetched on every detail-page load — a heavily-edited Dish paid
  // that cost even when Export was never opened. Loaded lazily, one bounded
  // page at a time, only once the dialog actually opens
  // (`listExportableDishVersions`/`listExportableVersionsPage`); older
  // Versions stay reachable via the "Show earlier versions" entry rather
  // than a hard cutoff.
  const [versionOptions, setVersionOptions] = React.useState<
    ExportableVersion[]
  >([]);
  const [hasMoreVersions, setHasMoreVersions] = React.useState(false);
  const [versionsLoading, setVersionsLoading] = React.useState(false);
  const [versionsError, setVersionsError] = React.useState<string | null>(null);

  async function loadVersionsPage(cursor?: string) {
    setVersionsLoading(true);
    setVersionsError(null);
    const result = await listExportableDishVersions(kind, dishId, cursor);
    setVersionsLoading(false);
    if (result.status === "error") {
      setVersionsError(result.message ?? "Could not load Versions.");
      return;
    }
    setHasMoreVersions(result.hasMore);
    setVersionOptions((existing) =>
      cursor ? [...result.versions, ...existing] : result.versions,
    );
  }

  function openExportDialog() {
    setOpenDialog("export");
    setExportScope("SINGLE");
    setVersionOptions([]);
    setHasMoreVersions(false);
    void loadVersionsPage();
  }

  const basePath = kind === "PART" ? "/parts" : "/recipes";
  const label = kind === "PART" ? "part" : "recipe";
  const kindLabel = kind === "PART" ? "Part" : "Recipe";

  function close() {
    setOpenDialog(null);
    setExportScope("SINGLE");
    setExportVersionValue(currentVersionId);
  }

  // Fetches the file directly (rather than a plain `<a download>`) so a
  // failed export shows the normal error toast instead of a silently broken
  // download, and a successful one can close the modal + confirm the
  // filename (nav/details QA batch item 10).
  async function handleExportDownload(tier: ExportTierValue) {
    if (downloadingTier) return;
    setDownloadingTier(tier);
    try {
      const response = await fetch(
        `/api/export/dish/${dishId}?kind=${kind}&tier=${tier}&${exportVersionQuery}`,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast({
          variant: "error",
          title: body?.message ?? "Could not export.",
        });
        return;
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? `${dishTitle}.json`;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
      close();
      showToast({
        variant: "success",
        title: "Export downloaded",
        description: filename,
      });
    } catch {
      showToast({ variant: "error", title: "Could not export." });
    } finally {
      setDownloadingTier(null);
    }
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveDish(kind, dishId);
      if (result.status === "success") {
        close();
        router.refresh();
        showToast({ variant: "success", title: `Archived "${dishTitle}".` });
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not archive.",
        });
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreDish(kind, {
        dishId,
        stage: restoreStage,
      });
      if (result.status === "success") {
        close();
        router.refresh();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not restore.",
        });
      }
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateDish(kind, { dishId });
      if (result.status === "success" && result.dishId) {
        close();
        router.push(`${basePath}/${result.dishId}`);
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not duplicate.",
        });
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDish(kind, dishId);
      if (result.status === "success") {
        router.push(basePath);
      } else if (result.code === "PART_HAS_LIVE_USAGES") {
        close();
        setResolutionOpen(true);
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not delete.",
        });
      }
    });
  }

  return (
    <>
      {/* Slice 6A: the primary Edit action is icon-only (a pencil, with a
          styled Tooltip) so it fits beside the title in the responsive
          hero's top-right — everything else moved into this overflow menu,
          widened so its longer labels (Version history, Compare versions)
          never wrap. Cook is no longer grouped here — it's a "use this
          recipe" action, not a management one, and now renders as its own
          row at the bottom of the details column (`dish-detail-view.tsx`). */}
      <div className="flex items-center gap-1">
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
            <DropdownMenuItem asChild>
              <Link href={`${basePath}/${dishId}/history`}>
                <ChefHat /> Cooking history
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setOpenDialog("duplicate")}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenDialog("share")}>
              <Share2 /> Publish
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenDialog("send")}>
              <Send /> Send
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openExportDialog}>
              <Download /> Export
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/print${basePath}/${dishId}`}>
                <Printer /> Print
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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

      <ConfirmDialog
        open={openDialog === "archive"}
        onOpenChangeAction={(open) => !open && close()}
        title={<>Archive this {label}?</>}
        description={
          <>
            Archiving hides this {label} from your library and cooking choices,
            but keeps every Version, Cooking Session, and rating. You can
            restore it later.
          </>
        }
        confirmLabel="Archive"
        loading={isPending}
        onConfirmAction={handleArchive}
      />

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
            <SelectTrigger className="w-full" aria-label={`${label} status`}>
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
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleRestore} loading={isPending}>
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDialog === "duplicate"}
        onOpenChangeAction={(open) => !open && close()}
        title={<>Duplicate this {label}?</>}
        description={
          <>
            Creates a separate {label} starting from this one&apos;s current
            content, at V1.0. Its own Version history, Cooking Sessions, and
            ratings start empty.
          </>
        }
        confirmLabel="Duplicate"
        loading={isPending}
        onConfirmAction={handleDuplicate}
      />

      <Dialog
        open={openDialog === "export"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Export this {label}</DialogTitle>
            <DialogDescription>
              Choose a Version and how much evidence to include.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="export-scope-select"
              className="text-foreground text-sm font-medium"
            >
              Version
            </label>
            <Select
              value={exportScope}
              onValueChange={(value) => setExportScope(value as ExportScope)}
            >
              <SelectTrigger
                id="export-scope-select"
                className="w-full"
                aria-label="Version scope"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SINGLE">One version</SelectItem>
                <SelectItem value="ALL">Include all Versions</SelectItem>
              </SelectContent>
            </Select>
            {exportScope === "SINGLE" && (
              <VersionPicker
                versions={versionOptions}
                currentVersionId={currentVersionId}
                value={exportVersionValue}
                onChangeAction={setExportVersionValue}
                disabled={versionsLoading && versionOptions.length === 0}
                footer={
                  hasMoreVersions && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center"
                      loading={versionsLoading}
                      onClick={() =>
                        void loadVersionsPage(versionOptions[0]?.id)
                      }
                    >
                      Show earlier versions…
                    </Button>
                  )
                }
              />
            )}
            {versionsError && (
              <p role="alert" className="text-destructive-text text-xs">
                {versionsError}
              </p>
            )}
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
              <Button
                variant="outline"
                size="sm"
                loading={downloadingTier === "STANDARD"}
                disabled={downloadingTier !== null}
                onClick={() => void handleExportDownload("STANDARD")}
              >
                Download
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
              <Button
                variant="outline"
                size="sm"
                loading={downloadingTier === "DETAILED"}
                disabled={downloadingTier !== null}
                onClick={() => void handleExportDownload("DETAILED")}
              >
                Download
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
              <Button
                variant="outline"
                size="sm"
                loading={downloadingTier === "FULL_PRIVATE_HISTORY"}
                disabled={downloadingTier !== null}
                onClick={() =>
                  void handleExportDownload("FULL_PRIVATE_HISTORY")
                }
              >
                Download
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

      <ConfirmDialog
        open={openDialog === "delete"}
        onOpenChangeAction={(open) => !open && close()}
        title={<>Permanently delete this {label}?</>}
        description={
          <>
            This removes the {label}, every Version, Cooking Session, Session
            Review, rating, and its other owned relationships. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete permanently"
        destructive
        loading={isPending}
        onConfirmAction={handleDelete}
      />

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
        currentVersionId={currentVersionId}
      />

      <DirectShareSingleItemDialog
        open={openDialog === "send"}
        onOpenChange={(open) => !open && close()}
        dishId={dishId}
        dishVersionId={currentVersionId}
        dishKind={kind}
        dishTitle={dishTitle}
      />
    </>
  );
}
