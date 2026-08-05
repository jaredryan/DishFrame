import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  listOwnedShareLinks,
  listSentDirectShares,
  listReceivedDirectShares,
} from "@/lib/sharing/service";
import { buildShareToken } from "@/lib/sharing/tokens";
import { ShareLinkList } from "@/components/domain/sharing/share-link-list";
import { DirectShareSentList } from "@/components/domain/sharing/direct-share-sent-list";
import { DirectShareReceivedList } from "@/components/domain/sharing/direct-share-received-list";

export const metadata: Metadata = {
  title: "Sharing",
};

export default async function SharePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in?redirectTo=/share");
  }

  const [shareLinks, sentShares, receivedShares] = await Promise.all([
    listOwnedShareLinks(session.user.id),
    listSentDirectShares(session.user.id),
    listReceivedDirectShares(session.user.id),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Sharing
        </h1>
        <p className="text-muted-foreground mt-2">
          Unlisted links and direct sends for your Recipes and Parts. Create a
          new one from the Share or Send to user action on any Recipe or Part.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-foreground text-lg font-semibold">Links</h2>
        <ShareLinkList
          shareLinks={shareLinks.map((link) => ({
            id: link.id,
            mode: link.mode,
            dishTitleSnapshot: link.dishTitleSnapshot,
            url: buildShareToken(link.tokenId),
            revokedAt: link.revokedAt?.toISOString() ?? null,
            expiresAt: link.expiresAt?.toISOString() ?? null,
            showCreatorName: link.showCreatorName,
            createdAt: link.createdAt.toISOString(),
          }))}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-foreground text-lg font-semibold">Sent</h2>
        <DirectShareSentList
          shares={sentShares.map((share) => ({
            id: share.id,
            dishTitleSnapshot: share.dishTitleSnapshot,
            recipientName: share.recipientName,
            recipientLookup: share.recipientLookup,
            note: share.note,
            status: share.status,
            createdAt: share.createdAt.toISOString(),
          }))}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-foreground text-lg font-semibold">Received</h2>
        <DirectShareReceivedList
          shares={receivedShares.map((share) => ({
            id: share.id,
            dishKind: share.dishKind,
            dishTitleSnapshot: share.dishTitleSnapshot,
            senderName: share.senderName,
            note: share.note,
            status: share.status,
            createdAt: share.createdAt.toISOString(),
            createdDishId: share.createdDishId,
          }))}
        />
      </section>
    </div>
  );
}
