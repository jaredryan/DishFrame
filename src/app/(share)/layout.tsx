import type { Metadata } from "next";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";

/**
 * Reachable without a link, but not intended as publicly discoverable
 * search content — `noindex` (rather than a `robots.txt` disallow) so
 * crawlers can still see this tag and drop any already-indexed URL, per
 * standard `noindex`-over-`disallow` guidance for pages meant to stay out
 * of the index entirely.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * ARCHITECTURE_PROPOSAL.md §C.9: a genuinely public route group, unrelated
 * to the authenticated `(app)` shell — content resolution never assumes a
 * session.
 */
export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
