"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  cancelDirectShare,
  cancelDirectShareCollection,
} from "@/lib/sharing/actions";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";
import type { SentItemView, SentShareChild } from "@/lib/sharing/view-model";

const STATUS_LABEL: Record<DirectShareStatusValue, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELED: "Cancelled",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function statusCounts(
  children: SentShareChild[],
): Partial<Record<DirectShareStatusValue, number>> {
  const counts: Partial<Record<DirectShareStatusValue, number>> = {};
  for (const child of children) {
    counts[child.status] = (counts[child.status] ?? 0) + 1;
  }
  return counts;
}

function NotJoinedBadge({ hasJoined }: { hasJoined: boolean }) {
  if (hasJoined) return null;
  return <Badge variant="outline">Hasn&apos;t joined DishFrame yet</Badge>;
}

function SentSingleCard({
  item,
}: {
  item: Extract<SentItemView, { kind: "single" }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelDirectShare({ directShareId: item.id });
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message);
      }
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
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span>
          To {item.recipientName ?? item.recipientLookup} ·{" "}
          {formatDate(item.createdAt)}
        </span>
        <NotJoinedBadge hasJoined={item.hasJoined} />
      </div>
      {item.note && <p className="text-sm italic">&ldquo;{item.note}&rdquo;</p>}
      {error && <p className="text-destructive-text text-sm">{error}</p>}
      {item.status === "PENDING" && (
        <Button
          variant="destructive"
          size="sm"
          onClick={handleCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      )}
    </li>
  );
}

function SentGroupCard({
  item,
}: {
  item: Extract<SentItemView, { kind: "group" }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const counts = statusCounts(item.children);
  const hasPending = (counts.PENDING ?? 0) > 0;

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelDirectShareCollection({
        collectionId: item.id,
      });
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <li className="border-border bg-card space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">
          {item.recipientName ?? item.recipientLookup}
        </p>
        <NotJoinedBadge hasJoined={item.hasJoined} />
      </div>
      <p className="text-muted-foreground text-sm">
        {item.children.length} recipe{item.children.length === 1 ? "" : "s"} ·{" "}
        {formatDate(item.createdAt)}
      </p>
      <p className="text-muted-foreground text-sm">
        {(["PENDING", "ACCEPTED", "DECLINED", "CANCELED"] as const)
          .filter((status) => counts[status])
          .map((status) => `${counts[status]} ${status.toLowerCase()}`)
          .join(" · ")}
      </p>
      {item.note && <p className="text-sm italic">&ldquo;{item.note}&rdquo;</p>}

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

      {expanded && (
        <ul className="border-border divide-border rounded-md border">
          {item.children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between gap-2 border-b p-2 text-sm last:border-b-0"
            >
              <span>{child.dishTitleSnapshot}</span>
              <Badge
                variant={child.status === "PENDING" ? "outline" : "secondary"}
              >
                {STATUS_LABEL[child.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive-text text-sm">{error}</p>}
      {hasPending && (
        <Button
          variant="destructive"
          size="sm"
          onClick={handleCancel}
          disabled={isPending}
        >
          Cancel pending
        </Button>
      )}
    </li>
  );
}

export function DirectShareSentList({ items }: { items: SentItemView[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You haven&apos;t sent anything yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) =>
        item.kind === "single" ? (
          <SentSingleCard key={item.id} item={item} />
        ) : (
          <SentGroupCard key={item.id} item={item} />
        ),
      )}
    </ul>
  );
}
