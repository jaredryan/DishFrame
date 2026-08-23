"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Wordmark } from "@/components/branding/wordmark";
import { APP_NAV_ITEMS } from "@/components/app/nav-items";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function MobileTopbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="border-border bg-background flex h-14 items-center justify-between border-b px-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle>
              <Wordmark href="/home" />
            </SheetTitle>
          </SheetHeader>
          <nav aria-label="Primary" className="flex flex-col gap-1 px-4 pb-4">
            {APP_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <SheetClose asChild key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {label}
                  </Link>
                </SheetClose>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <Wordmark className="lg:hidden" />

      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
