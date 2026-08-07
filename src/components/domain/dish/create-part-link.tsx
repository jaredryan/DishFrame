import Link from "next/link";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Slice 6A browser-review correction pass §4: Create part now opens the
 * complete standalone `/parts/new` flow in a new tab — the previous
 * embedded dialog duplicated that page's form while omitting supported
 * Part fields (image, stage, cuisine, yield, etc.). The parent draft is
 * never touched; the user attaches the finished Part back via Attach a part.
 * Slice 23: same `Layers` icon as `/parts` and the Home Create menu's own
 * Create part action, for one consistent glyph across every Create part
 * entry point.
 */
export function CreatePartLink() {
  return (
    <Button type="button" variant="outline" size="sm" asChild>
      <Link href="/parts/new" target="_blank" rel="noopener noreferrer">
        <Layers /> Create part
      </Link>
    </Button>
  );
}
