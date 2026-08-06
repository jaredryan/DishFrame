import { getServerSession } from "@/lib/auth/session";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";

/**
 * ARCHITECTURE_PROPOSAL.md §C.9: a genuinely public route group, unrelated
 * to the authenticated `(app)` shell — content resolution never assumes a
 * session; the session read below only decides the header's own CTA copy.
 */
export default async function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader signedIn={Boolean(session)} />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
