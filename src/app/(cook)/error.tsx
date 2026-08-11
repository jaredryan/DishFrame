"use client";

import { Wordmark } from "@/components/branding/wordmark";
import { ErrorRecovery } from "@/components/app/error-recovery";

export default function CookError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="bg-surface-subtle flex min-h-screen flex-col">
      <header className="flex items-center px-4 py-6 sm:px-6 lg:px-8">
        <Wordmark href="/home" />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-16 text-center">
        <ErrorRecovery
          error={error}
          retry={unstable_retry}
          returnHref="/home"
          returnLabel="Return to dashboard"
          description="Try again or return to your dashboard."
        />
      </main>
    </div>
  );
}
