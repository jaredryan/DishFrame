"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/branding/wordmark";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="bg-surface-subtle flex min-h-screen flex-col">
      <header className="flex items-center px-4 py-6 sm:px-6 lg:px-8">
        <Wordmark />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-16 text-center">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Something went wrong.
        </h1>
        <p className="text-muted-foreground max-w-sm">
          Try again or return home.
        </p>
        <div className="mt-3 flex gap-3">
          <Button variant="outline" onClick={() => unstable_retry()}>
            Try again
          </Button>
          <Button asChild>
            <Link href="/">Return home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
