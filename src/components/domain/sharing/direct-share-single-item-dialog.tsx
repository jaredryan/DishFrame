import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { sendDirectShareCollection } from "@/lib/sharing/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

type Step = "compose" | "review" | "sent";

/**
 * Contextual "Send" from a Recipe/Part detail page: sends this specific
 * item only. No searchable item selector — the current dish is the only
 * item in the collection, never editable to add others. Still uses the
 * same `DirectShareCollection`/`sendDirectShareCollection` backend as the
 * generalized `/share` Send flow (`DirectShareCollectionDialog`), just
 * with exactly one child item.
 */
export function DirectShareSingleItemDialog({
  open,
  onOpenChange,
  dishId,
  dishVersionId,
  dishKind,
  dishTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dishId: string;
  dishVersionId: string;
  dishKind: DishKindValue;
  dishTitle: string;
}) {
  const [step, setStep] = React.useState<Step>("compose");
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function close() {
    onOpenChange(false);
    setStep("compose");
    setEmail("");
    setNote("");
    setSendError(null);
  }

  const canReview = /\S+@\S+\.\S+/.test(email.trim());

  function handleSend() {
    setSendError(null);
    startTransition(async () => {
      const result = await sendDirectShareCollection({
        recipientEmail: email,
        items: [{ dishId, dishVersionId }],
        note: note.trim().length > 0 ? note.trim() : null,
      });
      if (result.status === "error") {
        setSendError(result.message);
        return;
      }
      setStep("sent");
    });
  }

  const label = dishKind === "PART" ? "part" : "recipe";
  const title = `Send this ${label}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === "sent"
              ? "Sent."
              : "Choose who to send it to, then review before sending."}
          </DialogDescription>
        </DialogHeader>

        {step === "sent" ? (
          <p className="text-sm">
            Sent &ldquo;{dishTitle}&rdquo; to {email.trim()}.
          </p>
        ) : step === "review" ? (
          <div className="space-y-4">
            <div className="border-border rounded-lg border p-3 text-sm">
              <p>
                Sending to <span className="font-medium">{email.trim()}</span>
              </p>
              <p className="mt-1">&ldquo;{dishTitle}&rdquo;</p>
            </div>
            {note.trim().length > 0 && (
              <p className="text-sm italic">&ldquo;{note.trim()}&rdquo;</p>
            )}
            {sendError && (
              <p role="alert" className="text-destructive-text text-sm">
                {sendError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-border bg-muted rounded-md border px-3 py-2 text-sm">
              {dishTitle}
            </div>

            <div className="space-y-2">
              <Label htmlFor="single-share-email">Recipient&apos;s email</Label>
              <Input
                id="single-share-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
              <p className="text-muted-foreground text-sm">
                They&apos;ll see this in DishFrame if they have an account with
                this email, or after signing in with it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="single-share-note">Note (optional)</Label>
              <Textarea
                id="single-share-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>

            {sendError && (
              <p role="alert" className="text-destructive-text text-sm">
                {sendError}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "sent" ? (
            <Button onClick={close}>Done</Button>
          ) : step === "review" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("compose")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button onClick={handleSend} loading={isPending}>
                Send
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("review")}
                disabled={!canReview || isPending}
              >
                Review
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
