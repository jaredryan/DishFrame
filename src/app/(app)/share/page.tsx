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
import { buildShareUrl } from "@/lib/sharing/tokens";
import { buildSentItems, buildReceivedItems } from "@/lib/sharing/view-model";
import { ShareLinkList } from "@/components/domain/sharing/share-link-list";
import { DirectShareSentList } from "@/components/domain/sharing/direct-share-sent-list";
import { DirectShareReceivedList } from "@/components/domain/sharing/direct-share-received-list";
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

  const sentItems = buildSentItems(sentShares, sentCollections);
  const receivedItems = buildReceivedItems(receivedShares, receivedCollections);

  const pendingReceivedCount = receivedItems.reduce((sum, item) => {
    if (item.kind === "single") {
      return item.status === "PENDING" ? sum + 1 : sum;
    }
    return (
      sum + item.children.filter((child) => child.status === "PENDING").length
    );
  }, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            Sharing
          </h1>
          <p className="text-muted-foreground mt-2">
            Exchange recipes and parts directly with other DishFrame users, or
            create public links anyone can view without an account.
          </p>
        </div>
        <SendRecipesButton />
      </div>

      <CoachMark guideKey="sharing-intro" title="Direct sends and public links">
        <strong className="text-foreground">Sending directly</strong> goes to
        one specific DishFrame account, who can accept or decline. A{" "}
        <strong className="text-foreground">public link</strong> is a read-only
        URL instead — no account needed to view — either always up to date with
        your current Version, or a snapshot frozen to the Version you shared.
        Either way, saving a copy is a separate, explicit choice — the result is
        the recipient&apos;s own independent copy, which never syncs back to
        your original (or your later edits) again.
      </CoachMark>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-foreground text-lg font-semibold">Received</h2>
          {pendingReceivedCount > 0 && (
            <Badge variant="outline">{pendingReceivedCount} pending</Badge>
          )}
        </div>
        <DirectShareReceivedList items={receivedItems} />
      </section>

      <section className="space-y-4">
        <h2 className="text-foreground text-lg font-semibold">Sent</h2>
        <DirectShareSentList items={sentItems} />
      </section>

      <section className="space-y-4">
        <h2 className="text-foreground text-lg font-semibold">Public links</h2>
        <ShareLinkList
          shareLinks={shareLinks.map((link) => ({
            id: link.id,
            mode: link.mode,
            dishTitleSnapshot: link.dishTitleSnapshot,
            url: buildShareUrl(link.tokenId),
            revokedAt: link.revokedAt?.toISOString() ?? null,
            expiresAt: link.expiresAt?.toISOString() ?? null,
            showCreatorName: link.showCreatorName,
            createdAt: link.createdAt.toISOString(),
          }))}
        />
      </section>
    </div>
  );
}
