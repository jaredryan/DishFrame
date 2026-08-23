"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { signOut } from "@/lib/auth/client";
import { deleteAccountAction } from "@/lib/account/actions";
import { ReauthenticatePrompt } from "@/components/app/reauthenticate-prompt";

/**
 * PRODUCT_SPEC.md §91: explicit destructive confirmation (typing the exact
 * account email, re-checked server-side against the session), a clear
 * explanation of what's removed, an explicit opportunity to export first,
 * and recent-authentication enforcement (`deleteAccountAction` returns
 * `needs_reauth` instead of deleting when the session is stale).
 */
export function DeleteAccountDialog({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  function close() {
    setOpen(false);
    setConfirmEmail("");
    setError(null);
    setNeedsReauth(false);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmEmail });
      if (result.status === "success") {
        await signOut();
        router.push("/");
        router.refresh();
      } else if (result.status === "needs_reauth") {
        setNeedsReauth(true);
      } else {
        setError(result.message);
      }
    });
  }

  const canDelete = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">
          Delete account
        </h2>
        <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Permanently removes your Recipes, Parts, Cooking Sessions, Reviews,
            and sharing history. This cannot be undone.
          </p>
          <Button
            variant="destructive"
            onClick={() => setOpen(true)}
            className="self-start sm:self-auto"
          >
            Delete account
          </Button>
        </div>
      </section>

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your Recipes, Parts, Versions, Cooking
              Sessions, Reviews, Tasters, ratings, grocery lists, Meal Plans,
              images, and every share link or pending share you sent. Copies
              other people already accepted from you are theirs to keep —
              they&apos;ll just stop showing you as the source. Export your data
              first if you want a copy.
            </DialogDescription>
          </DialogHeader>

          {needsReauth ? (
            <ReauthenticatePrompt reason="Come back here to finish deleting your account." />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-email">
                  Type <span className="font-medium">{email}</span> to confirm
                </Label>
                <Input
                  id="confirm-email"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  autoComplete="off"
                />
              </div>
              {error && (
                <p role="alert" className="text-destructive-text text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!canDelete || isPending}
                  onClick={handleDelete}
                >
                  {isPending ? "Deleting…" : "Delete my account"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
