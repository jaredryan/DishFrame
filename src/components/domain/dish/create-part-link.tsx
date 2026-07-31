import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Slice 6A browser-review correction pass §4: Create Part now opens the
 * complete standalone `/parts/new` flow in a new tab — the previous
 * embedded dialog duplicated that page's form while omitting supported
 * Part fields (image, stage, cuisine, yield, etc.). The parent draft is
 * never touched; the user attaches the finished Part back via Attach Part.
 */
export function CreatePartLink() {
  return (
    <Button type="button" variant="outline" size="sm" asChild>
      <Link href="/parts/new" target="_blank" rel="noopener noreferrer">
        <PackagePlus /> Create Part
      </Link>
    </Button>
  );
}
