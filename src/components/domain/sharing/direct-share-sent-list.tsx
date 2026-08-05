"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelDirectShare } from "@/lib/sharing/actions";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";

export type SentDirectShareRow = {
  id: string;
  dishTitleSnapshot: string;
  recipientName: string | null;
  recipientLookup: string;
  note: string | null;
  status: DirectShareStatusValue;
  createdAt: string;
};

const STATUS_LABEL: Record<DirectShareStatusValue, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELED: "Cancelled",
};

function SentDirectShareCard({ share }: { share: SentDirectShareRow }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelDirectShare({ directShareId: share.id });
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
        <p className="font-medium">{share.dishTitleSnapshot}</p>
        <Badge variant={share.status === "PENDING" ? "outline" : "secondary"}>
          {STATUS_LABEL[share.status]}
        </Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        To {share.recipientName ?? share.recipientLookup} ·{" "}
        {new Date(share.createdAt).toLocaleDateString()}
      </p>
      {share.note && (
        <p className="text-sm italic">&ldquo;{share.note}&rdquo;</p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {share.status === "PENDING" && (
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

export function DirectShareSentList({
  shares,
}: {
  shares: SentDirectShareRow[];
}) {
  if (shares.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You haven&apos;t sent anything directly yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {shares.map((share) => (
        <SentDirectShareCard key={share.id} share={share} />
      ))}
    </ul>
  );
}
