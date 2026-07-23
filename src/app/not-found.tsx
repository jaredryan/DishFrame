import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/branding/wordmark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="bg-surface-subtle flex min-h-screen flex-col">
      <header className="flex items-center px-4 py-6 sm:px-6 lg:px-8">
        <Wordmark />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-16 text-center">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          This page could not be found.
        </h1>
        <p className="text-muted-foreground max-w-sm">
          Try again or return home.
        </p>
        <Button asChild className="mt-3">
          <Link href="/">Return home</Link>
        </Button>
      </main>
    </div>
  );
}
