"use client";

import * as React from "react";
import { UtensilsCrossed } from "lucide-react";
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
  lookupDirectShareRecipient,
  listShareableRecipesForSender,
  sendDirectShareCollection,
} from "@/lib/sharing/actions";
import { DIRECT_SHARE_COLLECTION_MAX_RECIPES } from "@/lib/sharing/schema";
import type { ShareableRecipeSummary } from "@/lib/sharing/collections";

type RecipientState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "not_found"; email: string }
  | { phase: "found"; id: string; name: string; email: string }
  | { phase: "error"; message: string };

type Step = "compose" | "review" | "sent";

/**
 * PRODUCT_SPEC.md §85 extension (Slice 22): the one unified Recipe direct-
 * share flow — a plain "Send to user" from a Recipe's detail page opens this
 * with that Recipe preselected (still a one-Recipe collection, per the
 * product decision that every Recipe send, including single-item, uses the
 * same grouped model); the `/share` entry point opens it with nothing
 * preselected. Part sharing is unaffected — it keeps the older single-item
 * `DirectShareDialog`.
 */
export function DirectShareCollectionDialog({
  open,
  onOpenChange,
  preselectedDishId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedDishId?: string;
}) {
  const [step, setStep] = React.useState<Step>("compose");
  const [email, setEmail] = React.useState("");
  const [recipient, setRecipient] = React.useState<RecipientState>({
    phase: "idle",
  });
  const [confirmedUnregistered, setConfirmedUnregistered] =
    React.useState(false);
  const [recipes, setRecipes] = React.useState<ShareableRecipeSummary[] | null>(
    null,
  );
  const [recipesError, setRecipesError] = React.useState<string | null>(null);
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
      const result = await listShareableRecipesForSender();
      if (result.status === "error") {
        setRecipesError(result.message);
        return;
      }
      setRecipes(result.recipes);
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
    setRecipient({ phase: "idle" });
    setConfirmedUnregistered(false);
    setRecipes(null);
    setRecipesError(null);
    setSearch("");
    setSelected(new Set());
    setNote("");
    setSendError(null);
  }

  function handleLookup() {
    setSendError(null);
    setConfirmedUnregistered(false);
    setRecipient({ phase: "pending" });
    startTransition(async () => {
      const result = await lookupDirectShareRecipient({ email });
      if (result.status === "error") {
        setRecipient({ phase: "error", message: result.message });
        return;
      }
      setRecipient(
        result.recipient
          ? {
              phase: "found",
              id: result.recipient.id,
              name: result.recipient.name,
              email,
            }
          : { phase: "not_found", email },
      );
    });
  }

  const filteredRecipes = React.useMemo(() => {
    if (!recipes) return [];
    const query = search.trim().toLowerCase();
    if (!query) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(query));
  }, [recipes, search]);

  const canReview =
    (recipient.phase === "found" ||
      (recipient.phase === "not_found" && confirmedUnregistered)) &&
    selected.size > 0;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!recipes) return;
    setSelected(
      new Set(
        recipes.slice(0, DIRECT_SHARE_COLLECTION_MAX_RECIPES).map((r) => r.id),
      ),
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

  const recipientEmail =
    recipient.phase === "found"
      ? recipient.email
      : recipient.phase === "not_found"
        ? recipient.email
        : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send Recipes to a DishFrame user</DialogTitle>
          <DialogDescription>
            {step === "sent"
              ? "Sent."
              : "Choose who to send to and which Recipes to include, then review before sending."}
          </DialogDescription>
        </DialogHeader>

        {step === "sent" ? (
          <p className="text-sm">
            Sent {selected.size} Recipe{selected.size === 1 ? "" : "s"} to{" "}
            {recipient.phase === "found" ? recipient.name : recipientEmail}.
            {recipient.phase === "not_found" && (
              <>
                {" "}
                They&apos;ll receive this after signing in to DishFrame with
                this Google email.
              </>
            )}
          </p>
        ) : step === "review" ? (
          <div className="space-y-4">
            <div className="border-border rounded-lg border p-3 text-sm">
              <p>
                Sending to{" "}
                <span className="font-medium">
                  {recipient.phase === "found"
                    ? recipient.name
                    : recipientEmail}
                </span>{" "}
                {recipient.phase === "found" && `(${recipient.email})`}
              </p>
              {recipient.phase === "not_found" && (
                <p className="text-muted-foreground mt-1">
                  No DishFrame account yet — they&apos;ll receive this after
                  signing in with this Google email.
                </p>
              )}
              <p className="mt-1">
                {selected.size} Recipe{selected.size === 1 ? "" : "s"} selected
              </p>
            </div>
            {note.trim().length > 0 && (
              <p className="text-sm italic">&ldquo;{note.trim()}&rdquo;</p>
            )}
            {sendError && (
              <p className="text-destructive text-sm">{sendError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="collection-share-email">
                Recipient&apos;s email
              </Label>
              <div className="flex gap-2">
                <Input
                  id="collection-share-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setRecipient({ phase: "idle" });
                    setConfirmedUnregistered(false);
                  }}
                  placeholder="name@example.com"
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
              {recipient.phase === "error" && (
                <p className="text-destructive text-sm">{recipient.message}</p>
              )}
              {recipient.phase === "found" && (
                <p className="text-sm">
                  Sending to{" "}
                  <span className="font-medium">{recipient.name}</span> (
                  {recipient.email}).
                </p>
              )}
              {recipient.phase === "not_found" && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    No DishFrame account found for that email yet.
                  </p>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={confirmedUnregistered}
                      onCheckedChange={(checked) =>
                        setConfirmedUnregistered(checked === true)
                      }
                    />
                    <span>
                      Send anyway to{" "}
                      <span className="font-medium">{recipient.email}</span>.
                      They&apos;ll receive this after signing in to DishFrame
                      with this Google email.
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Recipes</Label>
                {recipes && recipes.length > 0 && (
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
                placeholder="Search your Recipes…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {recipesError && (
                <p className="text-destructive text-sm">{recipesError}</p>
              )}
              {!recipes && !recipesError && (
                <p className="text-muted-foreground text-sm">Loading…</p>
              )}
              {recipes && recipes.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  You don&apos;t have any shareable Recipes yet.
                </p>
              )}
              {recipes && recipes.length > 0 && (
                <ul className="border-border max-h-64 overflow-y-auto rounded-md border">
                  {filteredRecipes.length === 0 && (
                    <li className="text-muted-foreground p-3 text-sm">
                      No Recipes match &ldquo;{search}&rdquo;.
                    </li>
                  )}
                  {filteredRecipes.map((r) => (
                    <li
                      key={r.id}
                      className="border-border flex items-center gap-3 border-b p-2 last:border-b-0"
                    >
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleSelected(r.id)}
                        aria-label={`Select ${r.title}`}
                      />
                      <div className="bg-muted flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
                        {r.imageAssetId ? (
                          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route
                          <img
                            src={`/api/images/${r.imageAssetId}`}
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
                        {r.title}
                      </span>
                      <StageBadge stage={r.stage} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground text-sm">
                {selected.size} selected (max{" "}
                {DIRECT_SHARE_COLLECTION_MAX_RECIPES})
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
              <p className="text-destructive text-sm">{sendError}</p>
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
