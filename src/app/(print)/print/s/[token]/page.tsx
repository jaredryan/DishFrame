import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolvePublicShare } from "@/lib/sharing/service";
import { PrintToolbar } from "@/components/domain/print/print-toolbar";
import { PrintDocument } from "@/components/domain/print/print-document";

/**
 * Unauthenticated, token-only route (ARCHITECTURE_PROPOSAL.md §C.9 pattern,
 * matching `(share)/s/[token]/page.tsx`): `resolvePublicShare` is the one
 * public-content resolver, reused here rather than a second one — a
 * revoked/expired/malformed token throws `NotFoundError` and this route
 * 404s exactly like the ordinary share page does.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  try {
    const resolved = await resolvePublicShare(token);
    return {
      title: `${resolved.content.title} — ${resolved.content.versionLabel}`,
    };
  } catch {
    return {};
  }
}

export default async function PublicSharePrintPage({
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

  return (
    <>
      <PrintToolbar backHref={`/s/${token}`} backLabel="Back to share" />
      <PrintDocument
        content={resolved.content}
        kindLabel={resolved.content.dishKind === "PART" ? "Part" : "Recipe"}
        badgeLabel={
          resolved.mode === "FIXED_SNAPSHOT"
            ? "Fixed snapshot"
            : "Live · follows current version"
        }
        creatorName={resolved.creatorName}
        imageSrc={(assetId) =>
          `/api/images/${assetId}?shareToken=${encodeURIComponent(token)}`
        }
      />
    </>
  );
}
