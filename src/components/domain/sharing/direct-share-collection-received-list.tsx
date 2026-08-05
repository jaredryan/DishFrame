"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DirectShareCollectionReviewDialog } from "@/components/domain/sharing/direct-share-collection-review-dialog";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";

export type ReceivedDirectShareCollectionRow = {
  id: string;
  senderName: string;
  note: string | null;
  createdAt: string;
  children: {
    id: string;
    dishTitleSnapshot: string;
    status: DirectShareStatusValue;
  }[];
};

function ReceivedCollectionCard({
  collection,
}: {
  collection: ReceivedDirectShareCollectionRow;
}) {
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const pendingCount = collection.children.filter(
    (child) => child.status === "PENDING",
  ).length;

  return (
    <li className="border-border space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{collection.senderName}</p>
        <Badge variant={pendingCount > 0 ? "outline" : "secondary"}>
          {pendingCount > 0 ? `${pendingCount} pending` : "Resolved"}
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
      {pendingCount > 0 && (
        <Button size="sm" onClick={() => setReviewOpen(true)}>
          Review
        </Button>
      )}
      <DirectShareCollectionReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        collectionId={collection.id}
      />
    </li>
  );
}

export function DirectShareCollectionReceivedList({
  collections,
}: {
  collections: ReceivedDirectShareCollectionRow[];
}) {
  if (collections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No Recipe collections sent to you yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {collections.map((collection) => (
        <ReceivedCollectionCard key={collection.id} collection={collection} />
      ))}
    </ul>
  );
}
