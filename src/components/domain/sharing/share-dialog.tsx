import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { RichDishVersionPicker } from "@/components/domain/dish/version-picker-field";
import { createShareLink } from "@/lib/sharing/actions";
import { useToast } from "@/components/ui/toast";
import type { ShareLinkModeValue } from "@/lib/sharing/schema";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §83: the per-Dish "Share" action — creates one new
 * unlisted link. Separate from `/share`'s management list, which shows
 * every link already created (revoke/regenerate/settings).
 */
export function ShareDialog({
  open,
  onOpenChange,
  dishId,
  kind,
  currentVersionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dishId: string;
  kind: DishKindValue;
  currentVersionId: string;
}) {
  const [mode, setMode] = React.useState<ShareLinkModeValue>("CURRENT");
  const [versionId, setVersionId] = React.useState<string | null>(
    currentVersionId,
  );
  const [showCreatorName, setShowCreatorName] = React.useState(false);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const { showToast } = useToast();

  function close() {
    onOpenChange(false);
    setMode("CURRENT");
    setVersionId(currentVersionId);
    setShowCreatorName(false);
    setExpiresAt("");
  }

  function handleCreate() {
    startTransition(async () => {
      const response = await createShareLink({
        dishId,
        mode,
        versionId:
          mode === "FIXED_SNAPSHOT" ? (versionId ?? undefined) : undefined,
        showCreatorName,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      if (response.status === "success") {
        close();
        // Never the underlying token — the actual public URL, with a copy
        // affordance, kept on screen until explicitly dismissed since it's
        // actionable information the user came here for.
        showToast({
          variant: "success",
          title: "Published",
          description: response.url,
          durationMs: null,
          actions: [
            {
              label: "Copy link",
              onClick: () => {
                void navigator.clipboard.writeText(response.url);
              },
            },
            {
              label: "Open",
              onClick: () => {
                window.open(response.url, "_blank", "noopener,noreferrer");
              },
            },
          ],
        });
      } else {
        showToast({ variant: "error", title: response.message });
      }
    });
  }

  const label = kind === "PART" ? "part" : "recipe";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Publish this ${label}`}</DialogTitle>
          <DialogDescription>
            Anyone with the link can view a read-only page — no DishFrame
            account required. Saving a copy does require signing in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as ShareLinkModeValue)}
            >
              <SelectTrigger className="w-full" aria-label="Mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CURRENT">Share latest version</SelectItem>
                <SelectItem value="FIXED_SNAPSHOT">
                  Share a fixed version
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "FIXED_SNAPSHOT" && (
            <RichDishVersionPicker
              id="share-version"
              kind={kind}
              dishId={dishId}
              value={versionId}
              onChangeAction={setVersionId}
            />
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="share-show-name">Show my name</Label>
            <Switch
              id="share-show-name"
              checked={showCreatorName}
              onCheckedChange={setShowCreatorName}
              aria-label="Show my name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-expires">Expires (optional)</Label>
            <input
              id="share-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={isPending}>
            Create link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
