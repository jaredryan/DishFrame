import { get } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "@/lib/auth/session";

/**
 * ARCHITECTURE_PROPOSAL.md §L/§M: the one place private image data is
 * exposed to a requester. The Blob store (`dishframe-images`) is private —
 * there is no bare public Blob URL anywhere in the app — so every read
 * goes through this authenticated route, which resolves `storageKey` and
 * streams it back rather than redirecting to a fetchable Blob URL.
 *
 * Authorization is derived entirely from the requester's access to SOME
 * `DishVersion` that references this `ImageAsset` (they own that Version's
 * Dish) — never from `ImageAsset.uploadedByUserId`, which is attribution
 * only (§D.2a).
 *
 * Deliberately no `ShareLink`-token branch yet: the architecture doc
 * describes a dual owner-session-OR-share-token authorization path so a
 * logged-out public share viewer can also see an image, but sharing has no
 * creation service or UI in this codebase at all yet (Tier 2, Slices
 * 16-17) — writing a share-token check against a token nothing can ever
 * issue would be a fake implementation, not a real one. Deliberately
 * omitted rather than faked, the same way Slice 4 omitted a linked-Parts
 * comparison group rather than adding a placeholder for it. Flagged in the
 * Slice 5 report so the sharing slice knows to add this branch, not
 * discover it's missing.
 */
export async function GET(
  _request: Request,
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
