"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { signIn } from "@/lib/auth/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.54 5.54 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.83Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.62l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

export function SignInCard({
  googleConfigured,
  initialError,
}: {
  googleConfigured: boolean;
  initialError?: string;
}) {
  const [error, setError] = React.useState<string | undefined>(initialError);
  const [pending, setPending] = React.useState(false);

  async function handleGoogleSignIn() {
    setError(undefined);
    setPending(true);
    try {
      const { error: signInError } = await signIn.social({
        provider: "google",
        callbackURL: "/home",
      });
      if (signInError) {
        setError(
          signInError.message ??
            "Couldn't sign in with Google. Please try again.",
        );
        setPending(false);
      }
    } catch {
      setError("Couldn't reach the sign-in service. Please try again.");
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Welcome to DishFrame
        </h1>
        <p className="text-muted-foreground text-sm">
          Sign in to keep your recipes, reusable parts, and cooking history in
          one place.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!googleConfigured && (
          <div className="border-border bg-muted text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Google sign-in isn&apos;t configured yet. Add GOOGLE_CLIENT_ID and
              GOOGLE_CLIENT_SECRET to enable it — see the README.
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={!googleConfigured || pending}
          onClick={handleGoogleSignIn}
        >
          <GoogleIcon />
          {pending ? "Redirecting…" : "Continue with Google"}
        </Button>

        <p className="text-muted-foreground text-center text-xs">
          Your recipes stay private unless you choose to share them.
        </p>
      </CardContent>
    </Card>
  );
}
