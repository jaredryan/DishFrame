import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";

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
