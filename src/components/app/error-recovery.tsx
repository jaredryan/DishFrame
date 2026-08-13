import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ErrorRecovery({
  error,
  retry,
  returnHref,
  returnLabel,
  description,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  returnHref: string;
  returnLabel: string;
  description: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <h1 className="font-heading text-foreground text-2xl font-semibold">
        Something went wrong.
      </h1>
      <p className="text-muted-foreground max-w-sm">{description}</p>
      <div className="mt-3 flex gap-3">
        <Button variant="outline" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild>
          <Link href={returnHref}>{returnLabel}</Link>
        </Button>
      </div>
    </>
  );
}
