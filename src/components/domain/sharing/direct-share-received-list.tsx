"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { acceptDirectShare, declineDirectShare } from "@/lib/sharing/actions";
import { DirectSharePreview } from "@/components/domain/sharing/direct-share-preview";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";
import type { DishKindValue } from "@/lib/dishes/schema";

export type ReceivedDirectShareRow = {
  id: string;
  dishKind: DishKindValue | null;
  dishTitleSnapshot: string;
  senderName: string;
  note: string | null;
  status: DirectShareStatusValue;
  createdAt: string;
  createdDishId: string | null;
};

const STATUS_LABEL: Record<DirectShareStatusValue, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELED: "No longer available",
};

function ReceivedDirectShareCard({ share }: { share: ReceivedDirectShareRow }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [copyLink, setCopyLink] = React.useState<{
    dishId: string;
    dishKind: DishKindValue;
  } | null>(
    share.createdDishId && share.dishKind
      ? { dishId: share.createdDishId, dishKind: share.dishKind }
      : null,
  );

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptDirectShare({ directShareId: share.id });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (result.outcome === "accepted") {
        setCopyLink({ dishId: result.dishId, dishKind: result.dishKind });
      } else if (result.outcome === "accepted_copy_deleted") {
        setError("You previously accepted this, but that copy was deleted.");
      }
      router.refresh();
    });
  }

  function handleDecline() {
    setError(null);
    startTransition(async () => {
      const result = await declineDirectShare({ directShareId: share.id });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="border-border space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{share.dishTitleSnapshot}</p>
        <Badge variant={share.status === "PENDING" ? "outline" : "secondary"}>
          {STATUS_LABEL[share.status]}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        From {share.senderName} ·{" "}
        {new Date(share.createdAt).toLocaleDateString()}
      </p>
      {share.note && (
        <p className="text-sm italic">&ldquo;{share.note}&rdquo;</p>
      )}

      {share.status === "PENDING" && (
        <DirectSharePreview directShareId={share.id} />
      )}

      {error && <p className="text-destructive-text text-sm">{error}</p>}

      {share.status === "PENDING" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleAccept} disabled={isPending}>
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDecline}
            disabled={isPending}
          >
            Decline
          </Button>
        </div>
      )}

      {copyLink && (
        <p className="text-sm">
          <Link
            href={`${dishBasePath(copyLink.dishKind)}/${copyLink.dishId}`}
            className="text-primary underline"
          >
            View your copy
          </Link>
        </p>
      )}
    </li>
  );
}

export function DirectShareReceivedList({
  shares,
}: {
  shares: ReceivedDirectShareRow[];
}) {
  if (shares.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Nothing sent to you yet.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {shares.map((share) => (
        <ReceivedDirectShareCard key={share.id} share={share} />
      ))}
    </ul>
  );
}
