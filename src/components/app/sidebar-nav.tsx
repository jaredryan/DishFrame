"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/branding/wordmark";
import { APP_NAV_ITEMS } from "@/components/app/nav-items";
import { AccountMenu } from "@/components/app/account-menu";
import { cn } from "@/lib/utils";

type AccountUser = {
  name: string;
  email: string;
  image?: string | null;
};

export function SidebarNav({ user }: { user: AccountUser }) {
  const pathname = usePathname();

  return (
    <aside className="border-sidebar-border bg-sidebar hidden w-60 shrink-0 flex-col border-r px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start">
      <div className="px-2 pb-6">
        <Wordmark href="/home" />
      </div>
      <nav
        aria-label="Primary"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
      >
        {APP_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4.5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex shrink-0 flex-col gap-2 pt-4">
        <div className="border-sidebar-border border-t" />
        <AccountMenu user={user} variant="sidebar" />
      </div>
    </aside>
  );
}
