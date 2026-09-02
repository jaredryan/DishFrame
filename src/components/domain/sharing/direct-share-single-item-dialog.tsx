import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { EmailChipInput } from "@/components/ui/email-chip-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { RichDishVersionPicker } from "@/components/domain/dish/version-picker-field";
import { sendDirectShareCollection } from "@/lib/sharing/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * Contextual "Send" from a Recipe/Part detail page: sends this specific
 * item only. No searchable item selector — the current dish is the only
 * item in the collection, never editable to add others. Still uses the
 * same `DirectShareCollection`/`sendDirectShareCollection` backend as the
 * generalized `/share` Send flow (`DirectShareCollectionDialog`), just
 * with exactly one child item.
 *
 * Toast/Send/Publish QA batch item 3: a direct single-modal action — no
 * Review step, no dedicated Sent screen. Version, Recipients, Send, in
 * that order; the shared Version picker preselects the current Version.
 * Recipients now accepts one or many addresses via the shared chip input
 * (item 4) — every recipient resolves independently, so a partial failure
 * removes the already-sent chips and leaves only the failed ones to retry.
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
  const [versionId, setVersionId] = React.useState<string | null>(
    dishVersionId,
  );
  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [note, setNote] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const { showToast } = useToast();

  function close() {
    onOpenChange(false);
    setVersionId(dishVersionId);
    setRecipients([]);
    setNote("");
  }

  const canSend = recipients.length > 0 && Boolean(versionId) && !isPending;

  function handleSend() {
    if (!versionId) return;
    startTransition(async () => {
      const result = await sendDirectShareCollection({
        recipientEmails: recipients,
        items: [{ dishId, dishVersionId: versionId }],
        note: note.trim().length > 0 ? note.trim() : null,
      });
      if (result.status === "error") {
        showToast({ variant: "error", title: result.message });
        return;
      }
      const failures = result.results.filter((r) => r.status === "error");
      const successes = result.results.filter((r) => r.status === "success");
      if (failures.length === 0) {
        showToast({
          variant: "success",
          title:
            successes.length === 1
              ? `Sent "${dishTitle}" to ${successes[0].recipientEmail}.`
              : `Sent "${dishTitle}" to ${successes.length} recipients.`,
        });
        close();
        return;
      }
      // Partial (or total) failure: never resend to a recipient who already
      // succeeded — only the still-failing addresses remain in the input.
      setRecipients(failures.map((f) => f.recipientEmail));
      showToast({
        variant: "error",
        title:
          failures.length === 1
            ? failures[0].message
            : `Couldn't send to ${failures.length} of ${result.results.length} recipients.`,
      });
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
            Choose a Version and who to send &ldquo;{dishTitle}&rdquo; to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RichDishVersionPicker
            id="single-share-version"
            kind={dishKind}
            dishId={dishId}
            value={versionId}
            onChangeAction={setVersionId}
          />

          <Field>
            <FieldLabel htmlFor="single-share-recipients">
              Recipients
            </FieldLabel>
            <EmailChipInput
              id="single-share-recipients"
              value={recipients}
              onChangeAction={setRecipients}
              ariaLabel="Recipients"
              autoFocus
            />
            <p className="text-muted-foreground text-sm">
              They&apos;ll see this in DishFrame if they have an account with
              this email, or after signing in with it.
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="single-share-note">Note (optional)</FieldLabel>
            <Textarea
              id="single-share-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              rows={3}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend} loading={isPending}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
