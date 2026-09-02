"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";

/**
 * The only genuine reauthentication path this app's Google-only sign-in
 * supports: there's no password/OTP to re-verify in place, and `/sign-in`
 * immediately redirects a still-signed-in visitor away
 * (`app/(auth)/sign-in/page.tsx`), so the session must actually end before
 * Google's flow can mint a fresh one. Used for account deletion (this
 * app's own freshness check, `isSessionFresh`).
 */
export function ReauthenticatePrompt({ reason }: { reason: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleReauthenticate() {
    setPending(true);
    await signOut();
    router.push("/sign-in?redirectTo=/profile");
  }

  return (
    <div className="border-border bg-muted/40 flex flex-col items-start gap-2 rounded-lg border p-4">
      <p className="text-foreground text-sm font-medium">
        Sign in again to continue
      </p>
      <p className="text-muted-foreground text-sm">
        For your security, this needs a recent sign-in. {reason}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={handleReauthenticate}
      >
        {pending ? "Signing out…" : "Sign in again"}
      </Button>
    </div>
  );
}
