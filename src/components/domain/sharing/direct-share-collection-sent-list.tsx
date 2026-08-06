"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelDirectShareCollection } from "@/lib/sharing/actions";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";

export type SentDirectShareCollectionRow = {
  id: string;
  recipientName: string | null;
  recipientLookup: string;
  hasJoined: boolean;
  note: string | null;
  createdAt: string;
  children: {
    id: string;
    dishTitleSnapshot: string;
    status: DirectShareStatusValue;
  }[];
};

function statusCounts(
  children: SentDirectShareCollectionRow["children"],
): Partial<Record<DirectShareStatusValue, number>> {
  const counts: Partial<Record<DirectShareStatusValue, number>> = {};
  for (const child of children) {
    counts[child.status] = (counts[child.status] ?? 0) + 1;
  }
  return counts;
}

function SentCollectionCard({
  collection,
}: {
  collection: SentDirectShareCollectionRow;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const counts = statusCounts(collection.children);
  const hasPending = (counts.PENDING ?? 0) > 0;

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelDirectShareCollection({
        collectionId: collection.id,
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
        <p className="font-medium">
          {collection.recipientName ?? collection.recipientLookup}
        </p>
        <Badge variant={collection.hasJoined ? "secondary" : "outline"}>
          {collection.hasJoined ? "Joined" : "Not yet joined"}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        {collection.children.length} Recipe
        {collection.children.length === 1 ? "" : "s"} ·{" "}
        {new Date(collection.createdAt).toLocaleDateString()}
      </p>
      {collection.note && (
        <p className="text-sm italic">&ldquo;{collection.note}&rdquo;</p>
      )}
      <p className="text-muted-foreground text-sm">
        {(["PENDING", "ACCEPTED", "DECLINED", "CANCELED"] as const)
          .filter((status) => counts[status])
          .map((status) => `${counts[status]} ${status.toLowerCase()}`)
          .join(" · ")}
      </p>
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

export function DirectShareCollectionSentList({
  collections,
}: {
  collections: SentDirectShareCollectionRow[];
}) {
  if (collections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You haven&apos;t sent any Recipe collections yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {collections.map((collection) => (
        <SentCollectionCard key={collection.id} collection={collection} />
      ))}
    </ul>
  );
}
