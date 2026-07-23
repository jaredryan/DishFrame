"use client";

import "./globals.css";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong.</h1>
        <p className="text-muted-foreground max-w-sm">
          Try again or return home.
        </p>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="border-border rounded-lg border px-3 py-1.5 text-sm font-medium"
          >
            Try again
          </button>
          {/* Plain <a>, not next/link: global-error replaces the root
              layout when the app itself failed to render, so router
              context isn't guaranteed to be available here. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            Return home
          </a>
        </div>
      </body>
    </html>
  );
}
