"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export type JumpToSectionLink = { label: string; href: string };

/**
 * Shared "Jump to" section-anchor nav for Settings and Help. Built on the
 * shared `Button` primitive (size="sm") so fine-pointer desktop stays
 * visually compact while coarse-pointer/touch automatically gets a 44px
 * hit area via Button's own `pointer-coarse:h-11` variant — no
 * Settings/Help-local touch-sizing patch needed.
 */
export function JumpToSection({
  links,
  className,
}: {
  links: JumpToSectionLink[];
  className?: string;
}) {
  function handleClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    const target = document.getElementById(href.slice(1));
    if (!target) return;

    event.preventDefault();
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    window.history.pushState(null, "", href);
  }

  return (
    <div className={className}>
      <h2 className="font-heading text-foreground text-lg font-semibold">
        Jump to
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map(({ label, href }) => (
          <li key={href}>
            <Button asChild variant="outline" size="sm" className="bg-card">
              <a href={href} onClick={(event) => handleClick(event, href)}>
                {label}
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
