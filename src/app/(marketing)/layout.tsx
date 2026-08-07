import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <PublicFooter />
    </div>
  );
}
