import { notFound } from "next/navigation";
import Link from "next/link";
import { Printer } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { resolvePublicShare } from "@/lib/sharing/service";
import { prisma } from "@/lib/db/prisma";
import { parseShareToken } from "@/lib/sharing/tokens";
import { PublicShareView } from "@/components/domain/sharing/public-share-view";
import { SaveSharedCopyButton } from "@/components/domain/sharing/save-shared-copy-button";
import { Button } from "@/components/ui/button";
import { dishBasePath } from "@/components/domain/dish/dish-card";

/**
 * ARCHITECTURE_PROPOSAL.md §C.9: unauthenticated Server Component — zero
 * session-based authorization on the content itself (PRODUCT_SPEC.md
 * §83.1), only token verification inside `resolvePublicShare`.
 */
export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let resolved;
  try {
    resolved = await resolvePublicShare(token);
  } catch {
    notFound();
  }

  const session = await getServerSession();

  // Gate 7 §2.8: one acceptance per recipient per share, durably — a
  // recipient can be in one of three states here, not two. Correction
  // pass: `acceptance.createdDishId` can be null (the acceptance ROW
  // survives deleting the copied Dish, `onDelete: SetNull` — schema.prisma's
  // own doc comment on `ShareLinkAcceptance`) — that must show the truthful
  // "you saved this, but deleted it" state, never fall through to a second
  // Save action.
  type ShareState = "SAVE" | "ALREADY_SAVED" | "PREVIOUSLY_ACCEPTED_DELETED";
  let shareState: ShareState = "SAVE";
  let alreadyAcceptedDishId: string | null = null;
  if (session) {
    const tokenId = parseShareToken(token);
    if (tokenId) {
      const shareLink = await prisma.shareLink.findUnique({
        where: { tokenId },
        select: { id: true },
      });
      if (shareLink) {
        const acceptance = await prisma.shareLinkAcceptance.findUnique({
          where: {
            shareLinkId_recipientId: {
              shareLinkId: shareLink.id,
              recipientId: session.user.id,
            },
          },
          select: { createdDishId: true },
        });
        if (acceptance?.createdDishId) {
          shareState = "ALREADY_SAVED";
          alreadyAcceptedDishId = acceptance.createdDishId;
        } else if (acceptance) {
          shareState = "PREVIOUSLY_ACCEPTED_DELETED";
        }
      }
    }
  }

  return (
    <>
      <PublicShareView
        content={resolved.content}
        mode={resolved.mode}
        creatorName={resolved.creatorName}
        imageSrc={(assetId) =>
          `/api/images/${assetId}?shareToken=${encodeURIComponent(token)}`
        }
      />
      <div className="mx-auto max-w-3xl px-4 pb-12 sm:px-6 lg:px-8">
        {/* Slice 18, PRODUCT_SPEC.md §87: only shown once `resolvePublicShare`
            above has already succeeded — an active public ShareLink page
            whose content is currently resolvable. */}
        <Button variant="outline" asChild className="mb-4">
          <Link href={`/print/s/${token}`}>
            <Printer aria-hidden="true" />
            Print
          </Link>
        </Button>
        {shareState === "ALREADY_SAVED" ? (
          <p className="text-muted-foreground text-sm">
            You already saved this.{" "}
            <Link
              href={`${dishBasePath(resolved.content.dishKind)}/${alreadyAcceptedDishId}`}
              className="text-primary underline"
            >
              View your copy
            </Link>
            .
          </p>
        ) : shareState === "PREVIOUSLY_ACCEPTED_DELETED" ? (
          <p className="text-muted-foreground text-sm">
            You previously saved this share, but that copy was deleted.
          </p>
        ) : (
          <SaveSharedCopyButton
            token={token}
            dishKind={resolved.content.dishKind}
            isSignedIn={!!session}
          />
        )}
      </div>
    </>
  );
}
