import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  listOwnedShareLinks,
  listSentDirectShares,
  listReceivedDirectShares,
} from "@/lib/sharing/service";
import {
  listSentDirectShareCollections,
  listReceivedDirectShareCollections,
  reconcilePendingDirectShareCollectionsForViewer,
} from "@/lib/sharing/collections";
import { buildShareToken } from "@/lib/sharing/tokens";
import { ShareLinkList } from "@/components/domain/sharing/share-link-list";
import { DirectShareSentList } from "@/components/domain/sharing/direct-share-sent-list";
import { DirectShareReceivedList } from "@/components/domain/sharing/direct-share-received-list";
import { DirectShareCollectionSentList } from "@/components/domain/sharing/direct-share-collection-sent-list";
import { DirectShareCollectionReceivedList } from "@/components/domain/sharing/direct-share-collection-received-list";
import { SendRecipesButton } from "@/components/domain/sharing/send-recipes-button";
import { Badge } from "@/components/ui/badge";
import { CoachMark } from "@/components/onboarding/coach-mark";

export const metadata: Metadata = {
  title: "Sharing",
};

export default async function SharePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in?redirectTo=/share");
  }

  // Slice 22 race repair: binds any pending collection invitation addressed
  // to this account's verified email that the one-shot account-init claim
  // window missed. Awaited before the Sent/Received reads below (not
  // alongside them in the Promise.all) so a newly claimed collection is
  // guaranteed visible to this same request rather than racing its own
  // read.
  await reconcilePendingDirectShareCollectionsForViewer(session.user.id);

  const [
    shareLinks,
    sentShares,
    receivedShares,
    sentCollections,
    receivedCollections,
  ] = await Promise.all([
    listOwnedShareLinks(session.user.id),
    listSentDirectShares(session.user.id),
    listReceivedDirectShares(session.user.id),
    listSentDirectShareCollections(session.user.id),
    listReceivedDirectShareCollections(session.user.id),
  ]);

  const pendingReceivedCount = receivedCollections.reduce(
    (sum, collection) =>
      sum +
      collection.children.filter((child) => child.status === "PENDING").length,
    0,
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            Sharing
          </h1>
          <p className="text-muted-foreground mt-2">
            Unlisted links and direct sends for your Recipes and Parts. Create a
            new one from the Share or Send to user action on any Recipe or Part.
          </p>
        </div>
        <SendRecipesButton />
      </div>

      <CoachMark
        guideKey="sharing-intro"
        title="Links, direct sends, and copies"
      >
        A <strong className="text-foreground">Link</strong> is a read-only URL —
        no account needed to view — either frozen to the Version you shared, or
        set to keep following your current Version.{" "}
        <strong className="text-foreground">Sending directly</strong> instead
        goes to one specific DishFrame account, who can accept or decline.
        Either way, saving a copy is a separate, explicit choice — the result is
        the recipient&apos;s own independent copy, which never syncs back to
        your original (or your later edits) again.
      </CoachMark>

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
        <h2 className="text-foreground text-lg font-semibold">
          Sent Recipe collections
        </h2>
        <DirectShareCollectionSentList
          collections={sentCollections.map((collection) => ({
            id: collection.id,
            recipientName: collection.recipientName,
            recipientLookup: collection.recipientLookup,
            hasJoined: collection.hasJoined,
            note: collection.note,
            createdAt: collection.createdAt.toISOString(),
            children: collection.children.map((child) => ({
              id: child.id,
              dishTitleSnapshot: child.dishTitleSnapshot,
              status: child.status,
            })),
          }))}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-foreground text-lg font-semibold">
            Received Recipe collections
          </h2>
          {pendingReceivedCount > 0 && (
            <Badge variant="outline">{pendingReceivedCount} pending</Badge>
          )}
        </div>
        <DirectShareCollectionReceivedList
          collections={receivedCollections.map((collection) => ({
            id: collection.id,
            senderName: collection.senderName,
            note: collection.note,
            createdAt: collection.createdAt.toISOString(),
            children: collection.children.map((child) => ({
              id: child.id,
              dishTitleSnapshot: child.dishTitleSnapshot,
              status: child.status,
            })),
          }))}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-foreground text-lg font-semibold">
          Individual sends
        </h2>
        <p className="text-muted-foreground text-sm">
          Single-item Part sends, and Recipe sends from before collections
          existed.
        </p>
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
        <h2 className="text-foreground text-lg font-semibold">
          Individual received
        </h2>
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
