"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy as CopyIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  revokeShareLink,
  regenerateShareLink,
  updateShareLinkSettings,
} from "@/lib/sharing/actions";
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

function ShareLinkRow({ link }: { link: ShareLinkSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [url, setUrl] = React.useState(link.url);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isRevoked = link.revokedAt !== null;
  const isExpired =
    link.expiresAt !== null && new Date(link.expiresAt) < new Date();

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeShareLink({ shareLinkId: link.id });
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateShareLink({ shareLinkId: link.id });
      if (result.status === "success") {
        setUrl(result.url);
        setCopied(false);
      } else {
        setError(result.message);
      }
    });
  }

  function handleToggleAttribution(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await updateShareLinkSettings({
        shareLinkId: link.id,
        showCreatorName: next,
      });
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <li className="border-border space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{link.dishTitleSnapshot}</p>
        <div className="flex gap-1">
          <Badge variant="outline">
            {link.mode === "FIXED_SNAPSHOT" ? "Fixed" : "Current"}
          </Badge>
          {isRevoked && <Badge variant="secondary">Revoked</Badge>}
          {!isRevoked && isExpired && (
            <Badge variant="secondary">Expired</Badge>
          )}
        </div>
      </div>

      {!isRevoked && (
        <div className="border-border bg-muted flex items-center gap-2 rounded-md border px-3 py-2">
          <code className="flex-1 truncate text-sm">{url}</code>
          <Button variant="outline" size="icon" onClick={handleCopy}>
            <CopyIcon aria-hidden="true" />
          </Button>
        </div>
      )}
      {copied && <p className="text-muted-foreground text-sm">Copied.</p>}

      {!isRevoked && (
        <div className="flex items-center justify-between">
          <span className="text-sm">Show my name</span>
          <Switch
            checked={link.showCreatorName}
            disabled={isPending}
            onCheckedChange={handleToggleAttribution}
          />
        </div>
      )}

      {error && <p className="text-destructive-text text-sm">{error}</p>}

      {!isRevoked && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isPending}
          >
            Regenerate
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRevoke}
            disabled={isPending}
          >
            Revoke
          </Button>
        </div>
      )}
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
        You haven&apos;t shared anything yet.
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
