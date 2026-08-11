"use client";

import { ErrorRecovery } from "@/components/app/error-recovery";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <ErrorRecovery
        error={error}
        retry={unstable_retry}
        returnHref="/home"
        returnLabel="Return to dashboard"
        description="Try again or return to your dashboard."
      />
    </div>
  );
}
