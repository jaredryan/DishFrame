"use client";

import * as React from "react";
import { UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StageBadge } from "@/components/domain/dish/stage-badge";
import {
  listShareableItemsForSender,
  sendDirectShareCollection,
} from "@/lib/sharing/actions";
import { DIRECT_SHARE_MAX_ITEMS } from "@/lib/sharing/schema";
import type { ShareableItemSummary } from "@/lib/sharing/collections";
import type { DishKindValue } from "@/lib/dishes/schema";

type Step = "compose" | "review" | "sent";

/**
 * PRODUCT_SPEC.md §85 extension: the one canonical Send flow, for any mix of
 * Recipes and Parts, one item or many, to an existing DishFrame account or a
 * not-yet-registered email alike — the sender is never shown which case
 * applies. A Recipe or Part detail page's "Send" opens this with that item
 * preselected (still a one-item collection, per the product decision that
 * every send, including single-item, uses the same grouped model); the
 * `/share` entry point opens it with nothing preselected.
 */
export function DirectShareCollectionDialog({
  open,
  onOpenChange,
  preselectedDishId,
  preselectedDishKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedDishId?: string;
  preselectedDishKind?: DishKindValue;
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
      if (preselectedDishId) {
        setSelected(new Set([preselectedDishId]));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
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

  const filteredItems = React.useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.title.toLowerCase().includes(query));
  }, [items, search]);

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

  const title = preselectedDishKind
    ? `Send this ${preselectedDishKind === "PART" ? "part" : "recipe"}`
    : "Send";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === "sent"
              ? "Sent."
              : "Choose who to send to and which items to include, then review before sending."}
          </DialogDescription>
        </DialogHeader>

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
                They&apos;ll see this in DishFrame if they have an account with
                this email, or after signing in with it.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Items</Label>
                {items && items.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                  >
                    Select all
                  </Button>
                )}
              </div>
              <Input
                placeholder="Search your items…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {itemsError && (
                <p role="alert" className="text-destructive-text text-sm">
                  {itemsError}
                </p>
              )}
              {!items && !itemsError && (
                <p className="text-muted-foreground text-sm">Loading…</p>
              )}
              {items && items.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  You don&apos;t have any shareable items yet.
                </p>
              )}
              {items && items.length > 0 && (
                <ul className="border-border max-h-64 overflow-y-auto rounded-md border">
                  {filteredItems.length === 0 && (
                    <li className="text-muted-foreground p-3 text-sm">
                      No items match &ldquo;{search}&rdquo;.
                    </li>
                  )}
                  {filteredItems.map((item) => (
                    <li
                      key={item.id}
                      className="border-border flex items-center gap-3 border-b p-2 last:border-b-0"
                    >
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${item.title}`}
                      />
                      <div className="bg-muted flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
                        {item.imageAssetId ? (
                          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route
                          <img
                            src={`/api/images/${item.imageAssetId}`}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <UtensilsCrossed
                            className="text-muted-foreground/40 size-4"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.title}
                      </span>
                      <Badge variant="outline">
                        {item.kind === "PART" ? "Part" : "Recipe"}
                      </Badge>
                      <StageBadge stage={item.stage} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground text-sm">
                {selected.size} selected (max {DIRECT_SHARE_MAX_ITEMS})
              </p>
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
