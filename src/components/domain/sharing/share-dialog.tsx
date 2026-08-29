import * as React from "react";
import { Copy as CopyIcon } from "lucide-react";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dishId: string;
  kind: DishKindValue;
}) {
  const [mode, setMode] = React.useState<ShareLinkModeValue>("FIXED_SNAPSHOT");
  const [showCreatorName, setShowCreatorName] = React.useState(false);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<{ url: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { showToast } = useToast();

  function close() {
    onOpenChange(false);
    setResult(null);
    setCopied(false);
    setMode("FIXED_SNAPSHOT");
    setShowCreatorName(false);
    setExpiresAt("");
  }

  function handleCreate() {
    startTransition(async () => {
      const response = await createShareLink({
        dishId,
        mode,
        showCreatorName,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      if (response.status === "success") {
        setResult({ url: response.url });
      } else {
        showToast({ variant: "error", title: response.message });
      }
    });
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
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

        {result ? (
          <div className="space-y-3">
            <div className="border-border bg-muted flex items-center gap-2 rounded-md border px-3 py-2">
              <code className="flex-1 truncate text-sm">{result.url}</code>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                <CopyIcon aria-hidden="true" />
              </Button>
            </div>
            {copied && <p className="text-muted-foreground text-sm">Copied.</p>}
          </div>
        ) : (
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
                  <SelectItem value="FIXED_SNAPSHOT">
                    Share a fixed version
                  </SelectItem>
                  <SelectItem value="CURRENT">Share latest version</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={handleCreate} loading={isPending}>
                Create link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
