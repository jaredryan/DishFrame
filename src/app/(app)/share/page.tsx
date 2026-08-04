import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listOwnedShareLinks } from "@/lib/sharing/service";
import { buildShareToken } from "@/lib/sharing/tokens";
import { ShareLinkList } from "@/components/domain/sharing/share-link-list";

export const metadata: Metadata = {
  title: "Sharing",
};

export default async function SharePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in?redirectTo=/share");
  }

  const shareLinks = await listOwnedShareLinks(session.user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Sharing
        </h1>
        <p className="text-muted-foreground mt-2">
          Unlisted links you&apos;ve created for Recipes and Parts. Create a new
          one from the Share action on any Recipe or Part.
        </p>
      </div>

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
    </div>
  );
}
