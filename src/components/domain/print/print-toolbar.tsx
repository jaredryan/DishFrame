"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PRODUCT_SPEC.md §87: the only screen-visible chrome on a print route —
 * hidden via `print:hidden` so it never appears in the printed/PDF output.
 * `window.print()` only ever fires from this explicit click, never on load.
 */
export function PrintToolbar({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="border-border bg-background sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3 print:hidden">
      <Button variant="outline" asChild>
        <Link href={backHref}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </Link>
      </Button>
      <Button onClick={() => window.print()}>
        <Printer aria-hidden="true" />
        Print / Save as PDF
      </Button>
    </div>
  );
}
