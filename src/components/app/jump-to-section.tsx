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
  return (
    <div className={className}>
      <h2 className="font-heading text-foreground text-lg font-semibold">
        Jump to
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map(({ label, href }) => (
          <li key={href}>
            <Button asChild variant="outline" size="sm">
              <a href={href}>{label}</a>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
