import type { Metadata } from "next";

/**
 * ARCHITECTURE_PROPOSAL.md-style dedicated shell (Slice 18, PRODUCT_SPEC.md
 * §87): deliberately outside `(app)`/`(share)` so print routes never inherit
 * `SidebarNav`/`MobileTopbar`/`PublicHeader`/`PublicFooter` — just the print
 * toolbar and document each page renders itself. Not gated by session here:
 * `/print/s/[token]` is a public route (token-authorized), while
 * `/print/recipes|parts/[dishId]` check ownership themselves, mirroring how
 * `(share)`'s layout has no blanket auth check either.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-white">{children}</div>;
}
