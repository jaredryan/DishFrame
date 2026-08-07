"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { acceptDirectShare, declineDirectShare } from "@/lib/sharing/actions";
import {
  useDirectSharePreview,
  DirectSharePreviewPanel,
} from "@/components/domain/sharing/direct-share-preview";
import { DirectShareCollectionReviewDialog } from "@/components/domain/sharing/direct-share-collection-review-dialog";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";
import type { DishKindValue } from "@/lib/dishes/schema";
import type {
  ReceivedItemView,
  ReceivedShareChild,
} from "@/lib/sharing/view-model";

const STATUS_LABEL: Record<DirectShareStatusValue, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELED: "No longer available",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function ViewCopyLink({
  dishKind,
  dishId,
}: {
  dishKind: DishKindValue;
  dishId: string;
}) {
  return (
    <p className="text-sm">
      <Link
        href={`${dishBasePath(dishKind)}/${dishId}`}
        className="text-primary underline"
      >
        View your copy
      </Link>
    </p>
  );
}

function ReceivedSingleCard({
  item,
}: {
  item: Extract<ReceivedItemView, { kind: "single" }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [copyLink, setCopyLink] = React.useState<{
    dishId: string;
    dishKind: DishKindValue;
  } | null>(
    item.createdDishId && item.dishKind
      ? { dishId: item.createdDishId, dishKind: item.dishKind }
      : null,
  );
  const preview = useDirectSharePreview(item.id);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptDirectShare({ directShareId: item.id });
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
      const result = await declineDirectShare({ directShareId: item.id });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="border-border bg-card space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{item.dishTitleSnapshot}</p>
        <Badge variant={item.status === "PENDING" ? "outline" : "secondary"}>
          {STATUS_LABEL[item.status]}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        From {item.senderName} · {formatDate(item.createdAt)}
      </p>
      {item.note && <p className="text-sm italic">&ldquo;{item.note}&rdquo;</p>}

      {error && <p className="text-destructive-text text-sm">{error}</p>}

      {item.status === "PENDING" && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={preview.toggle}
          >
            {preview.expanded ? "Hide preview" : "Preview"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-[1.875rem]"
            onClick={handleDecline}
            disabled={isPending}
          >
            Decline
          </Button>
          <Button
            size="sm"
            className="h-[1.875rem]"
            onClick={handleAccept}
            disabled={isPending}
          >
            Accept
          </Button>
        </div>
      )}

      {item.status === "PENDING" && preview.expanded && (
        <DirectSharePreviewPanel
          directShareId={item.id}
          data={preview.data}
          error={preview.error}
          isPending={preview.isPending}
        />
      )}

      {copyLink && (
        <ViewCopyLink dishKind={copyLink.dishKind} dishId={copyLink.dishId} />
      )}
    </li>
  );
}

function statusCounts(
  children: ReceivedShareChild[],
): Partial<Record<DirectShareStatusValue, number>> {
  const counts: Partial<Record<DirectShareStatusValue, number>> = {};
  for (const child of children) {
    counts[child.status] = (counts[child.status] ?? 0) + 1;
  }
  return counts;
}

function ReceivedGroupCard({
  item,
}: {
  item: Extract<ReceivedItemView, { kind: "group" }>;
}) {
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const counts = statusCounts(item.children);
  const pendingCount = counts.PENDING ?? 0;

  return (
    <li className="border-border bg-card space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{item.senderName}</p>
        <Badge variant={pendingCount > 0 ? "outline" : "secondary"}>
          {pendingCount > 0 ? `${pendingCount} pending` : "Resolved"}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        {item.children.length} recipe{item.children.length === 1 ? "" : "s"} ·{" "}
        {formatDate(item.createdAt)}
      </p>
      {item.note && <p className="text-sm italic">&ldquo;{item.note}&rdquo;</p>}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
          {expanded ? "Hide recipes" : "Show recipes"}
        </Button>
        {pendingCount > 0 && (
          <Button
            size="sm"
            className="h-[1.875rem]"
            onClick={() => setReviewOpen(true)}
          >
            Review
          </Button>
        )}
      </div>

      {expanded && (
        <ul className="border-border divide-border rounded-md border">
          {item.children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between gap-2 border-b p-2 text-sm last:border-b-0"
            >
              <span>{child.dishTitleSnapshot}</span>
              <div className="flex items-center gap-2">
                {child.status === "ACCEPTED" &&
                  child.createdDishId &&
                  child.dishKind && (
                    <ViewCopyLink
                      dishKind={child.dishKind}
                      dishId={child.createdDishId}
                    />
                  )}
                <Badge
                  variant={child.status === "PENDING" ? "outline" : "secondary"}
                >
                  {STATUS_LABEL[child.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DirectShareCollectionReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        collectionId={item.id}
      />
    </li>
  );
}

export function DirectShareReceivedList({
  items,
}: {
  items: ReceivedItemView[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Nothing sent to you yet.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) =>
        item.kind === "single" ? (
          <ReceivedSingleCard key={item.id} item={item} />
        ) : (
          <ReceivedGroupCard key={item.id} item={item} />
        ),
      )}
    </ul>
  );
}
