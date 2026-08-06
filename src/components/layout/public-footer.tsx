import Link from "next/link";
import { Wordmark } from "@/components/branding/wordmark";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-surface-subtle border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1.5">
            <Wordmark />
            <p className="text-muted-foreground text-sm">
              Cook. Refine. Repeat.
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-6 gap-y-2"
          >
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-muted-foreground text-sm">
          © {year} DishFrame. A personal cooking framework for building,
          cooking, and improving the Recipes you actually make.
        </p>
      </div>
    </footer>
  );
}
