"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy as CopyIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePendingAction } from "@/components/ui/use-pending-action";
import { useToast } from "@/components/ui/toast";
import {
  revokeShareLink,
  regenerateShareLink,
  updateShareLinkSettings,
} from "@/lib/sharing/actions";
import { shareLinkLifecycle } from "@/lib/sharing/view-model";
import type { ShareLinkModeValue } from "@/lib/sharing/schema";

export type ShareLinkSummary = {
  id: string;
  mode: ShareLinkModeValue;
  dishTitleSnapshot: string;
  url: string;
  revokedAt: string | null;
  expiresAt: string | null;
  showCreatorName: boolean;
  createdAt: string;
};

const MODE_LABEL: Record<ShareLinkModeValue, string> = {
  CURRENT: "Always up to date",
  FIXED_SNAPSHOT: "Snapshot",
};

const MODE_DESCRIPTION: Record<ShareLinkModeValue, string> = {
  CURRENT: "Follows your recipe or part as you keep editing it.",
  FIXED_SNAPSHOT: "Stays exactly as it looked when you shared it.",
};

function ShareLinkRow({ link }: { link: ShareLinkSummary }) {
  const router = useRouter();
  const { pendingAction, isPending, run } = usePendingAction<
    "replace" | "disable" | "toggle-attribution"
  >();
  const [url, setUrl] = React.useState(link.url);
  const [copied, setCopied] = React.useState(false);
  const [disableOpen, setDisableOpen] = React.useState(false);
  const { showToast } = useToast();

  const lifecycle = shareLinkLifecycle(link);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  function handleDisable() {
    run("disable", async () => {
      const result = await revokeShareLink({ shareLinkId: link.id });
      if (result.status === "success") {
        setDisableOpen(false);
        router.refresh();
      } else {
        showToast({ variant: "error", title: result.message });
      }
    });
  }

  function handleReplace() {
    run("replace", async () => {
      const result = await regenerateShareLink({ shareLinkId: link.id });
      if (result.status === "success") {
        setUrl(result.url);
        setCopied(false);
        router.refresh();
      } else {
        showToast({ variant: "error", title: result.message });
      }
    });
  }

  function handleToggleAttribution(next: boolean) {
    run("toggle-attribution", async () => {
      const result = await updateShareLinkSettings({
        shareLinkId: link.id,
        showCreatorName: next,
      });
      if (result.status === "success") {
        router.refresh();
      } else {
        showToast({ variant: "error", title: result.message });
      }
    });
  }

  return (
    <li className="border-border bg-card space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 font-medium break-words">
          {link.dishTitleSnapshot}
        </p>
        <div className="flex shrink-0 gap-1">
          <Badge variant="outline">{MODE_LABEL[link.mode]}</Badge>
          {lifecycle === "disabled" && (
            <Badge variant="secondary">Disabled</Badge>
          )}
          {lifecycle === "expired" && (
            <Badge variant="destructive">Expired</Badge>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        {MODE_DESCRIPTION[link.mode]}
      </p>

      {lifecycle === "active" && (
        <div className="border-border bg-muted flex items-center gap-2 rounded-md border px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy link"
            onClick={handleCopy}
          >
            <CopyIcon aria-hidden="true" />
          </Button>
        </div>
      )}
      {lifecycle === "expired" && (
        <p className="text-muted-foreground text-sm">
          This link stopped working. Replace it to share a working link again.
        </p>
      )}
      {copied && <p className="text-muted-foreground text-sm">Copied.</p>}

      {lifecycle === "active" && (
        <div className="flex items-center justify-between">
          <span className="text-sm">Show my name on shared page</span>
          <Switch
            checked={link.showCreatorName}
            disabled={isPending}
            onCheckedChange={handleToggleAttribution}
            aria-label="Show my name on shared page"
          />
        </div>
      )}

      {lifecycle !== "disabled" && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReplace}
            disabled={isPending}
            loading={pendingAction === "replace"}
          >
            Replace link
          </Button>
          {lifecycle === "active" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDisableOpen(true)}
              disabled={isPending}
            >
              Disable link
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={disableOpen}
        onOpenChangeAction={setDisableOpen}
        title="Disable this link?"
        description="Anyone who already has this link will no longer be able to view it. This can't be undone."
        confirmLabel="Disable link"
        destructive
        loading={pendingAction === "disable"}
        onConfirmAction={handleDisable}
      />
    </li>
  );
}

export function ShareLinkList({
  shareLinks,
}: {
  shareLinks: ShareLinkSummary[];
}) {
  if (shareLinks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You haven&apos;t shared any links yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {shareLinks.map((link) => (
        <ShareLinkRow key={link.id} link={link} />
      ))}
    </ul>
  );
}
