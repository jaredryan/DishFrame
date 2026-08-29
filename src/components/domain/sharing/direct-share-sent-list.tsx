"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { cancelDirectShareCollection } from "@/lib/sharing/actions";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";
import { statusCounts, type SentItemView } from "@/lib/sharing/view-model";

const STATUS_LABEL: Record<DirectShareStatusValue, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELED: "Cancelled",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
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
  const { showToast } = useToast();

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelDirectShareCollection({
        collectionId: item.id,
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
          {item.dishTitleSnapshot}
        </p>
        {item.status === "PENDING" ? (
          <SemanticChip semantic="blue">
            {STATUS_LABEL[item.status]}
          </SemanticChip>
        ) : (
          <Badge variant="secondary">{STATUS_LABEL[item.status]}</Badge>
        )}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="min-w-0 break-words">
          To {item.recipientName ?? item.recipientLookup} ·{" "}
          {formatDate(item.createdAt)}
        </span>
        <NotJoinedBadge hasJoined={item.hasJoined} />
      </div>
      {item.note && <p className="text-sm italic">&ldquo;{item.note}&rdquo;</p>}
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
  const [expanded, setExpanded] = React.useState(false);
  const counts = statusCounts(item.children);
  const hasPending = (counts.PENDING ?? 0) > 0;
  const { showToast } = useToast();

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelDirectShareCollection({
        collectionId: item.id,
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
          {item.recipientName ?? item.recipientLookup}
        </p>
        <NotJoinedBadge hasJoined={item.hasJoined} />
      </div>
      <p className="text-muted-foreground text-sm break-words">
        {item.children.length} item{item.children.length === 1 ? "" : "s"} ·{" "}
        {formatDate(item.createdAt)}
      </p>
      <p className="text-muted-foreground text-sm">
        {(["PENDING", "ACCEPTED", "DECLINED", "CANCELED"] as const)
          .filter((status) => counts[status])
          .map((status) => `${counts[status]} ${status.toLowerCase()}`)
          .join(" · ")}
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
          {expanded ? "Hide items" : "Show items"}
        </Button>
        {hasPending && (
          <Button
            variant="destructive"
            size="sm"
            className="h-[1.875rem]"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel pending
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
              <span className="min-w-0 break-words">
                {child.dishTitleSnapshot}
              </span>
              {child.status === "PENDING" ? (
                <SemanticChip semantic="blue">
                  {STATUS_LABEL[child.status]}
                </SemanticChip>
              ) : (
                <Badge variant="secondary">{STATUS_LABEL[child.status]}</Badge>
              )}
            </li>
          ))}
        </ul>
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
