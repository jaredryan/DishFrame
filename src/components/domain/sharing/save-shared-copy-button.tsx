"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { saveSharedCopy } from "@/lib/sharing/actions";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §84.1: "Save to My Recipes"/"Save to My Parts" — the
 * label reflects the shared item's own kind, since there's no separate
 * choice to make (a Recipe saves as a Recipe, a Part as a Part). A
 * logged-out viewer is redirected to sign in and back, not shown a dead
 * button or a silent failure.
 */
export function SaveSharedCopyButton({
  token,
  dishKind,
  isSignedIn,
}: {
  token: string;
  dishKind: DishKindValue;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const label = dishKind === "PART" ? "Save to My Parts" : "Save to My Recipes";

  function handleClick() {
    if (!isSignedIn) {
      router.push(`/sign-in?redirectTo=${encodeURIComponent(`/s/${token}`)}`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveSharedCopy({ token });
      if (result.status === "previously_accepted_deleted") {
        // Defensive fallback only — the page normally never renders this
        // button once it already knows the recipient's copy was deleted
        // (`(share)/s/[token]/page.tsx`). Gate 7 §2.8's one-time rule still
        // applies: no new copy, no retry action, just the truthful state.
        setError("You previously saved this share, but that copy was deleted.");
        return;
      }
      if (result.status === "error") {
        if (result.requiresSignIn) {
          router.push(
            `/sign-in?redirectTo=${encodeURIComponent(`/s/${token}`)}`,
          );
          return;
        }
        setError(result.message);
        return;
      }
      router.push(`${dishBasePath(result.dishKind)}/${result.dishId}`);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? "Saving…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
