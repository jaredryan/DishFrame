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
import { ShareItemSelector } from "@/components/domain/sharing/share-item-selector";
import {
  listShareableItemsForSender,
  sendDirectShareCollection,
} from "@/lib/sharing/actions";
import { DIRECT_SHARE_MAX_ITEMS } from "@/lib/sharing/schema";
import type { ShareableItemSummary } from "@/lib/sharing/collections";

type Step = "compose" | "review" | "sent";

/**
 * PRODUCT_SPEC.md §85 extension: the generalized Send flow — any mix of
 * Recipes and Parts, one item or many, to an existing DishFrame account or
 * a not-yet-registered email alike, the sender never shown which case
 * applies. This is the `/share` page's "Share → Send" entry point only —
 * nothing is preselected. A Recipe/Part detail page's own "Send" opens
 * `DirectShareSingleItemDialog` instead, locked to that one item (design
 * pass: the old preselect-into-this-selector behavior didn't actually
 * express "send this specific item").
 */
export function DirectShareCollectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = React.useState<Step>("compose");
  const [email, setEmail] = React.useState("");
  const [items, setItems] = React.useState<ShareableItemSummary[] | null>(null);
  const [itemsError, setItemsError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [note, setNote] = React.useState("");
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      loadedRef.current = false;
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    startTransition(async () => {
      const result = await listShareableItemsForSender();
      if (result.status === "error") {
        setItemsError(result.message);
        return;
      }
      setItems(result.items);
    });
  }, [open]);

  function close() {
    onOpenChange(false);
    setStep("compose");
    setEmail("");
    setItems(null);
    setItemsError(null);
    setSearch("");
    setSelected(new Set());
    setNote("");
    setSendError(null);
  }

  const canReview = /\S+@\S+\.\S+/.test(email.trim()) && selected.size > 0;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!items) return;
    setSelected(
      new Set(items.slice(0, DIRECT_SHARE_MAX_ITEMS).map((item) => item.id)),
    );
  }

  function handleSend() {
    setSendError(null);
    startTransition(async () => {
      const result = await sendDirectShareCollection({
        recipientEmail: email,
        dishIds: [...selected],
        note: note.trim().length > 0 ? note.trim() : null,
      });
      if (result.status === "error") {
        setSendError(result.message);
        return;
      }
      setStep("sent");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send</DialogTitle>
          <DialogDescription>
            {step === "sent"
              ? "Sent."
              : "Choose who to send to and which items to include, then review before sending."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {step === "sent" ? (
            <p className="text-sm">
              Sent {selected.size} item{selected.size === 1 ? "" : "s"} to{" "}
              {email.trim()}.
            </p>
          ) : step === "review" ? (
            <div className="space-y-4">
              <div className="border-border rounded-lg border p-3 text-sm">
                <p>
                  Sending to <span className="font-medium">{email.trim()}</span>
                </p>
                <p className="mt-1">
                  {selected.size} item{selected.size === 1 ? "" : "s"} selected
                </p>
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
              <div className="space-y-2">
                <Label htmlFor="collection-share-email">
                  Recipient&apos;s email
                </Label>
                <Input
                  id="collection-share-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
                <p className="text-muted-foreground text-sm">
                  They&apos;ll see this in DishFrame if they have an account
                  with this email, or after signing in with it.
                </p>
              </div>

              <ShareItemSelector
                items={items}
                itemsError={itemsError}
                search={search}
                onSearchChange={setSearch}
                selected={selected}
                onToggle={toggleSelected}
                onSelectAll={selectAll}
                maxItems={DIRECT_SHARE_MAX_ITEMS}
              />

              <div className="space-y-2">
                <Label htmlFor="collection-share-note">Note (optional)</Label>
                <Textarea
                  id="collection-share-note"
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
        </div>

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
              <Button onClick={handleSend} disabled={isPending}>
                {isPending ? "Sending…" : "Send"}
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
