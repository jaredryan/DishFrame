"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  lookupDirectShareRecipient,
  sendDirectShare,
} from "@/lib/sharing/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

type LookupState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "not_found" }
  | { phase: "found"; id: string; name: string; email: string }
  | { phase: "error"; message: string };

/**
 * PRODUCT_SPEC.md §85: the per-Dish "Send to another DishFrame user"
 * action — a recipient must be identified by exact email before the note
 * and Send controls appear at all, so the sender always confirms exactly
 * who they're sending to.
 */
export function DirectShareDialog({
  open,
  onOpenChange,
  dishId,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dishId: string;
  kind: DishKindValue;
}) {
  const [email, setEmail] = React.useState("");
  const [lookup, setLookup] = React.useState<LookupState>({ phase: "idle" });
  const [note, setNote] = React.useState("");
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  function close() {
    onOpenChange(false);
    setEmail("");
    setLookup({ phase: "idle" });
    setNote("");
    setSendError(null);
    setSent(false);
  }

  function handleLookup() {
    setSendError(null);
    setLookup({ phase: "pending" });
    startTransition(async () => {
      const result = await lookupDirectShareRecipient({ email });
      if (result.status === "error") {
        setLookup({ phase: "error", message: result.message });
        return;
      }
      setLookup(
        result.recipient
          ? {
              phase: "found",
              id: result.recipient.id,
              name: result.recipient.name,
              email,
            }
          : { phase: "not_found" },
      );
    });
  }

  function handleSend() {
    if (lookup.phase !== "found") return;
    setSendError(null);
    startTransition(async () => {
      const result = await sendDirectShare({
        dishId,
        recipientEmail: lookup.email,
        note: note.trim().length > 0 ? note.trim() : null,
      });
      if (result.status === "error") {
        setSendError(result.message);
        return;
      }
      setSent(true);
    });
  }

  const label = kind === "PART" ? "Part" : "Recipe";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send this {label} to a DishFrame user</DialogTitle>
          <DialogDescription>
            They&apos;ll see your name, a preview, and can accept or decline.
            Accepting saves them an independent copy — there&apos;s no ongoing
            sync with your own.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <p className="text-sm">
            Sent to {lookup.phase === "found" ? lookup.name : "the recipient"}.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="direct-share-email">Recipient&apos;s email</Label>
              <div className="flex gap-2">
                <input
                  id="direct-share-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setLookup({ phase: "idle" });
                  }}
                  placeholder="name@example.com"
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookup}
                  disabled={isPending || email.trim().length === 0}
                >
                  Find
                </Button>
              </div>
              {lookup.phase === "not_found" && (
                <p className="text-muted-foreground text-sm">
                  No DishFrame account found for that email.
                </p>
              )}
              {lookup.phase === "error" && (
                <p className="text-destructive-text text-sm">
                  {lookup.message}
                </p>
              )}
              {lookup.phase === "found" && (
                <p className="text-sm">
                  Sending to <span className="font-medium">{lookup.name}</span>{" "}
                  ({lookup.email}).
                </p>
              )}
            </div>

            {lookup.phase === "found" && (
              <div className="space-y-2">
                <Label htmlFor="direct-share-note">Note (optional)</Label>
                <Textarea
                  id="direct-share-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  rows={3}
                />
              </div>
            )}

            {sendError && (
              <p className="text-destructive-text text-sm">{sendError}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {sent ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={isPending || lookup.phase !== "found"}
              >
                {isPending ? "Sending…" : "Send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
