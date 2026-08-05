import { get } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "@/lib/auth/session";
import {
  isImageAssetVisibleViaShareLink,
  isImageAssetVisibleViaDirectShare,
} from "@/lib/sharing/service";

/**
 * ARCHITECTURE_PROPOSAL.md §L/§M: the one place private image data is
 * exposed to a requester. The Blob store (`dishframe-images`) is private —
 * there is no bare public Blob URL anywhere in the app — so every read
 * goes through this authenticated route, which resolves `storageKey` and
 * streams it back rather than redirecting to a fetchable Blob URL.
 *
 * Three independent authorization paths, any one sufficient:
 * - session-based: the requester owns some `DishVersion` that references
 *   this `ImageAsset` (never `ImageAsset.uploadedByUserId`, which is
 *   attribution only, §D.2a);
 * - Slice 16's `ShareLink`-token branch: a `?shareToken=` query param
 *   naming an active, unrevoked, unexpired `ShareLink` whose (frozen or
 *   live-current) content actually reaches this asset — the one place a
 *   logged-out public share viewer can see an image, per §D.2a/§90.2's
 *   explicitly-deferred "public ShareLink-token read path."
 * - Slice 17's `DirectShare` branch: a `?directShareId=` query param naming
 *   a `DirectShare` the signed-in requester is the sender or intended
 *   recipient of, letting a recipient preview an image before accepting —
 *   session-based (not token-based), since a direct share is never a
 *   public/logged-out surface.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;

  const asset = await prisma.imageAsset.findUnique({
    where: { id: assetId },
    select: { storageKey: true },
  });
  if (!asset) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const shareToken = url.searchParams.get("shareToken");
  const directShareId = url.searchParams.get("directShareId");

  if (shareToken) {
    const visible = await isImageAssetVisibleViaShareLink(shareToken, assetId);
    if (!visible) {
      return Response.json({ message: "Not found." }, { status: 404 });
    }
  } else if (directShareId) {
    const session = await getServerSession();
    if (!session) {
      return Response.json({ message: "Sign in required." }, { status: 401 });
    }
    const visible = await isImageAssetVisibleViaDirectShare(
      session.user.id,
      directShareId,
      assetId,
    );
    if (!visible) {
      return Response.json({ message: "Not found." }, { status: 404 });
    }
  } else {
    const session = await getServerSession();
    if (!session) {
      return Response.json({ message: "Sign in required." }, { status: 401 });
    }

    const ownsReferencingVersion = await prisma.dishVersion.findFirst({
      where: { imageAssetId: assetId, dish: { ownerId: session.user.id } },
      select: { id: true },
    });
    if (!ownsReferencingVersion) {
      return Response.json({ message: "Not found." }, { status: 404 });
    }
  }

  const blob = await get(asset.storageKey, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return Response.json({ message: "Image unavailable." }, { status: 404 });
  }

  return new Response(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
