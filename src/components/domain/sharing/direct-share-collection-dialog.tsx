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
import { SelectableDishRow } from "@/components/domain/dish/selectable-dish-row";
import { RichDishVersionPicker } from "@/components/domain/dish/version-picker-field";
import {
  listShareableItemsForSender,
  sendDirectShareCollection,
  getDirectShareRecipientHistory,
} from "@/lib/sharing/actions";
import { DIRECT_SHARE_MAX_ITEMS } from "@/lib/sharing/schema";
import type { ShareableItemSummary } from "@/lib/sharing/collections";

type Step = "select" | "configure" | "sent";

type ShareHistoryStatus = "ACCEPTED" | "PENDING";

const RECIPIENT_HISTORY_DEBOUNCE_MS = 400;

const SHARE_HISTORY_LABEL: Record<ShareHistoryStatus, string> = {
  ACCEPTED: "Already shared",
  PENDING: "Pending",
};

/**
 * PRODUCT_SPEC.md §85 extension: the generalized Send flow — any mix of
 * Recipes and Parts, one item or many, to an existing DishFrame account or
 * a not-yet-registered email alike, the sender never shown which case
 * applies. This is the `/share` page's "Share → Send" entry point only —
 * nothing is preselected. A Recipe/Part detail page's own "Send" opens
 * `DirectShareSingleItemDialog` instead, locked to that one item (design
 * pass: the old preselect-into-this-selector behavior didn't actually
 * express "send this specific item").
 *
 * Two-step design pass: item selection (who + what) stays free of
 * per-item Version configuration, which moves to its own step so it isn't
 * mixed into the picker list. Send happens from that second step — there's
 * no separate review step anymore.
 */
export function DirectShareCollectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = React.useState<Step>("select");
  const [email, setEmail] = React.useState("");
  const [items, setItems] = React.useState<ShareableItemSummary[] | null>(null);
  const [itemsError, setItemsError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [recipientHistory, setRecipientHistory] = React.useState<Record<
    string,
    ShareHistoryStatus
  > | null>(null);
  const [selectedVersionByDishId, setSelectedVersionByDishId] = React.useState<
    Record<string, string>
  >({});
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

  const isValidEmail = /\S+@\S+\.\S+/.test(email.trim());

  // Guards both the debounced fetch below and a same-render invalidation:
  // bumping it makes any in-flight or already-queued response for a
  // superseded email a no-op when it eventually resolves.
  const historyRequestRef = React.useRef(0);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (!/\S+@\S+\.\S+/.test(value.trim())) {
      historyRequestRef.current++;
      setRecipientHistory(null);
    }
  }

  // Resend-prevention: re-fetch this sender's ACCEPTED/PENDING DirectShare
  // history against the entered recipient whenever it changes to a valid
  // address, debounced since it re-fires on every keystroke. The eligibility
  // response and the resulting prune of `selected` both land together in the
  // fetch's own callback (never a synchronous setState in the effect body
  // itself) — a stale response (superseded by a newer email edit, including
  // one that went invalid in between) is discarded via `historyRequestRef`.
  React.useEffect(() => {
    if (!open || !isValidEmail) return;
    const requestId = ++historyRequestRef.current;
    const timeout = setTimeout(() => {
      void getDirectShareRecipientHistory({
        recipientEmail: email.trim(),
      }).then((result) => {
        if (historyRequestRef.current !== requestId) return;
        const history = result.status === "success" ? result.history : null;
        setRecipientHistory(history);
        if (history) {
          setSelected((prev) => {
            const next = new Set([...prev].filter((id) => !history[id]));
            return next.size === prev.size ? prev : next;
          });
        }
      });
    }, RECIPIENT_HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [open, isValidEmail, email]);

  function close() {
    onOpenChange(false);
    setStep("select");
    setEmail("");
    setItems(null);
    setItemsError(null);
    setSearch("");
    setSelected(new Set());
    setRecipientHistory(null);
    setSelectedVersionByDishId({});
    setNote("");
    setSendError(null);
  }

  const canConfigure = isValidEmail && selected.size > 0;
  const canSend =
    selected.size > 0 &&
    [...selected].every((id) => selectedVersionByDishId[id]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const eligibleItems = React.useMemo(
    () => items?.filter((item) => !recipientHistory?.[item.id]) ?? [],
    [items, recipientHistory],
  );

  const itemStatusLabels = React.useMemo(() => {
    if (!recipientHistory) return undefined;
    const labels: Record<string, string> = {};
    for (const [dishId, status] of Object.entries(recipientHistory)) {
      labels[dishId] = SHARE_HISTORY_LABEL[status];
    }
    return labels;
  }, [recipientHistory]);

  const selectAllLabel =
    items && recipientHistory && eligibleItems.length < items.length
      ? `Select all (${eligibleItems.length} eligible)`
      : "Select all";

  function selectAll() {
    setSelected(
      new Set(
        eligibleItems.slice(0, DIRECT_SHARE_MAX_ITEMS).map((item) => item.id),
      ),
    );
  }

  function handleSend() {
    setSendError(null);
    startTransition(async () => {
      const result = await sendDirectShareCollection({
        recipientEmail: email,
        items: [...selected].map((dishId) => ({
          dishId,
          dishVersionId: selectedVersionByDishId[dishId],
        })),
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
              : step === "configure"
                ? "Choose a Version to send for each selected item."
                : "Choose who to send to and which items to include."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
          {step === "sent" ? (
            <p className="text-sm">
              Sent {selected.size} item{selected.size === 1 ? "" : "s"} to{" "}
              {email.trim()}.
            </p>
          ) : step === "configure" ? (
            <div className="space-y-4">
              <div className="border-border rounded-lg border p-3 text-sm">
                <p>
                  Sending to <span className="font-medium">{email.trim()}</span>
                </p>
                <p className="mt-1">
                  {selected.size} item{selected.size === 1 ? "" : "s"} selected
                </p>
              </div>

              <div className="space-y-3">
                {[...selected].map((dishId) => {
                  const item = items?.find((i) => i.id === dishId);
                  if (!item) return null;
                  return (
                    <div key={dishId} className="flex flex-col gap-2">
                      <SelectableDishRow
                        item={item}
                        selectionControl="remove"
                        onRemove={() => toggleSelected(dishId)}
                      />
                      <RichDishVersionPicker
                        id={`send-version-${dishId}`}
                        kind={item.kind}
                        dishId={dishId}
                        value={selectedVersionByDishId[dishId] ?? null}
                        onChangeAction={(versionId) =>
                          setSelectedVersionByDishId((prev) => ({
                            ...prev,
                            [dishId]: versionId,
                          }))
                        }
                        className="pl-2"
                      />
                    </div>
                  );
                })}
              </div>

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
                  onChange={(event) => handleEmailChange(event.target.value)}
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
                selectAllLabel={selectAllLabel}
                maxItems={DIRECT_SHARE_MAX_ITEMS}
                itemStatusLabels={itemStatusLabels}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "sent" ? (
            <Button onClick={close}>Done</Button>
          ) : step === "configure" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={!canSend}
                loading={isPending}
              >
                Send
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("configure")}
                disabled={!canConfigure || isPending}
              >
                Next
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
