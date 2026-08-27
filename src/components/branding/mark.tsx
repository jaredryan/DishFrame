import Image from "next/image";
import { cn } from "@/lib/utils";

export function DishFrameMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/dishframe-mark.webp"
      alt=""
      aria-hidden="true"
      width={128}
      height={128}
      className={cn("shrink-0", className)}
    />
  );
}
