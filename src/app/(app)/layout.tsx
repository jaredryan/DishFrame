import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { MobileTopbar } from "@/components/app/mobile-topbar";
import { AccountMenu } from "@/components/app/account-menu";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in");
  }

  const accountUser = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };

  return (
    <div className="flex min-h-screen">
      <SidebarNav />
      <div className="flex flex-1 flex-col">
        <MobileTopbar>
          <AccountMenu user={accountUser} />
        </MobileTopbar>
        <header className="border-border hidden items-center justify-end border-b px-6 py-3 md:flex">
          <AccountMenu user={accountUser} />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
