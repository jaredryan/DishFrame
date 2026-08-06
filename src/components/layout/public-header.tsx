"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Wordmark } from "@/components/branding/wordmark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="border-border bg-surface-subtle/95 supports-backdrop-filter:bg-surface-subtle/85 sticky top-0 z-40 border-b shadow-sm backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Wordmark />

        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 min-[950px]:flex"
        >
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 min-[950px]:flex">
          <ThemeToggle />
          {signedIn ? (
            <Button asChild>
              <Link href="/home">Open DishFrame</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/sign-in">Create your first Recipe</Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="min-[950px]:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>
                <Wordmark />
              </SheetTitle>
            </SheetHeader>
            <nav aria-label="Mobile" className="flex flex-col gap-1 px-4 pb-4">
              {NAV_LINKS.map((link) => (
                <SheetClose asChild key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "rounded-md px-3 py-2.5 text-base font-medium transition-colors",
                      pathname === link.href
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
              <div className="border-border mt-3 flex flex-col gap-3 border-t pt-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-muted-foreground text-sm">Theme</span>
                  <ThemeToggle />
                </div>
                {signedIn ? (
                  <SheetClose asChild>
                    <Button asChild>
                      <Link href="/home">Open DishFrame</Link>
                    </Button>
                  </SheetClose>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Button variant="outline" asChild>
                        <Link href="/sign-in">Sign in</Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild>
                        <Link href="/sign-in">Create your first Recipe</Link>
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
