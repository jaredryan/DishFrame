import { getServerSession } from "@/lib/auth/session";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";

export default async function MarketingLayout({
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
