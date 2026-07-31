"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StarRatingInput } from "@/components/domain/cooking/star-rating-input";
import { saveSessionReview, deleteSessionReview } from "@/lib/reviews/actions";
import { updateDishStage } from "@/lib/dishes/actions";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { STAGE_LABEL } from "@/components/domain/dish/stage-badge";
import {
  restorableStageValues,
  type RestorableStageValue,
} from "@/lib/dishes/schema";

export type SessionContextUnit = {
  id: string;
  label: string;
  completed: boolean;
};

type TasterOption = { id: string; name: string; isOwner: boolean };

type ExistingReview = {
  whatWentWell: string | null;
  whatDidNotGoWell: string | null;
  anythingElse: string | null;
  actualAmountQuantity: number | null;
  actualAmountUnit: string | null;
  reviewAdjustedDurationSeconds: number | null;
} | null;

type StageSuggestion = {
  targetStage: RestorableStageValue;
  message: string;
} | null;

function formatMinutes(seconds: number | null): string {
  if (seconds == null) return "";
  return String(Math.round(seconds / 60));
}

/**
 * PRODUCT_SPEC.md §33: the post-cooking Review — every field optional, a
 * conversational tone (§33.2's prompts are questions, not form labels), and
 * enough session context (§35.4's checklist example) to make a whole-item
 * rating a deliberate judgment rather than a guess.
 */
export function SessionReviewForm({
  sessionId,
  dishId,
  dishVersionId,
  dishKind,
  dishTitle,
  outcome,
  contextUnits,
  tasterOptions,
  existingReview,
  existingRatings,
  rawElapsedSeconds,
  stageSuggestion,
}: {
  sessionId: string;
  dishId: string;
  // PRODUCT_SPEC.md §39.5 — the exact Version this session cooked, passed
  // through to Edit Recipe/Part so editing opens from what was actually
  // cooked rather than silently defaulting to the current Version.
  dishVersionId: string;
  dishKind: "RECIPE" | "PART" | null;
  dishTitle: string;
  outcome: "COMPLETED" | "ENDED_EARLY";
  contextUnits: SessionContextUnit[];
  tasterOptions: TasterOption[];
  existingReview: ExistingReview;
  existingRatings: Array<{ tasterId: string; value: number }>;
  rawElapsedSeconds: number | null;
  stageSuggestion: StageSuggestion;
}) {
  const router = useRouter();
  const basePath = dishBasePath(dishKind === "PART" ? "PART" : "RECIPE");
  const label = dishKind === "PART" ? "Part" : "Recipe";

  const [whatWentWell, setWhatWentWell] = React.useState(
    existingReview?.whatWentWell ?? "",
  );
  const [whatDidNotGoWell, setWhatDidNotGoWell] = React.useState(
    existingReview?.whatDidNotGoWell ?? "",
  );
  const [anythingElse, setAnythingElse] = React.useState(
    existingReview?.anythingElse ?? "",
  );
  const [amountQuantity, setAmountQuantity] = React.useState(
    existingReview?.actualAmountQuantity != null
      ? String(existingReview.actualAmountQuantity)
      : "",
  );
  const [amountUnit, setAmountUnit] = React.useState(
    existingReview?.actualAmountUnit ?? "",
  );
  const [adjustedMinutes, setAdjustedMinutes] = React.useState(
    existingReview?.reviewAdjustedDurationSeconds != null
      ? formatMinutes(existingReview.reviewAdjustedDurationSeconds)
      : "",
  );
  const [ratingValues, setRatingValues] = React.useState<
    Record<string, number | null>
  >(() =>
    Object.fromEntries(existingRatings.map((r) => [r.tasterId, r.value])),
  );

  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [isDeleting, startDeleteTransition] = React.useTransition();
  const [changingStage, setChangingStage] = React.useState(false);
  const [selectedStage, setSelectedStage] =
    React.useState<RestorableStageValue>(
      stageSuggestion?.targetStage ?? "EXPERIMENTAL",
    );
  const [stageSaved, setStageSaved] = React.useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = React.useState(false);

  const hasExistingReview =
    existingReview != null || existingRatings.length > 0;

  function handleSave() {
    setError(null);
    const ratings = Object.entries(ratingValues)
      .filter((entry): entry is [string, number] => entry[1] != null)
      .map(([tasterId, value]) => ({ tasterId, value }));
    const quantity = amountQuantity.trim() ? Number(amountQuantity) : null;
    const minutes = adjustedMinutes.trim() ? Number(adjustedMinutes) : null;

    startTransition(async () => {
      const result = await saveSessionReview({
        sessionId,
        whatWentWell: whatWentWell.trim() || null,
        whatDidNotGoWell: whatDidNotGoWell.trim() || null,
        anythingElse: anythingElse.trim() || null,
        actualAmountQuantity:
          quantity != null && Number.isFinite(quantity) && quantity > 0
            ? quantity
            : null,
        actualAmountUnit: quantity ? amountUnit.trim() || null : null,
        reviewAdjustedDurationSeconds:
          minutes != null && Number.isFinite(minutes) && minutes >= 0
            ? Math.round(minutes * 60)
            : null,
        ratings,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (result.deleted) {
        router.push(`/cook/${sessionId}`);
        return;
      }
      setJustSaved(true);
    });
  }

  function handleDelete() {
    setError(null);
    startDeleteTransition(async () => {
      const result = await deleteSessionReview({ sessionId });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.push(`/cook/${sessionId}`);
    });
  }

  function handleConfirmStage(stage: RestorableStageValue) {
    startTransition(async () => {
      const result = await updateDishStage(
        dishKind === "PART" ? "PART" : "RECIPE",
        { dishId, stage },
      );
      if (result.status === "error") {
        setError(result.message ?? null);
        return;
      }
      setStageSaved(true);
      setChangingStage(false);
      setSuggestionDismissed(true);
    });
  }

  if (justSaved) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="bg-brand-green/10 text-brand-green flex size-12 items-center justify-center rounded-full">
            <Check className="size-6" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-foreground text-xl font-semibold">
            Review saved
          </h1>
          <p className="text-muted-foreground text-sm">
            Your notes and ratings for {dishTitle} are saved.
          </p>
        </div>

        {stageSuggestion && !suggestionDismissed && !stageSaved && (
          <div className="border-brand-purple/30 bg-brand-purple/5 flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-foreground flex items-start gap-1.5 text-sm">
              <Sparkles
                className="text-brand-purple mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {stageSuggestion.message}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => handleConfirmStage(stageSuggestion.targetStage)}
              >
                Move to {STAGE_LABEL[stageSuggestion.targetStage]}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSuggestionDismissed(true)}
              >
                Not now
              </Button>
            </div>
          </div>
        )}

        {stageSaved && (
          <p className="text-muted-foreground text-center text-sm">
            Stage updated to {STAGE_LABEL[selectedStage]}.
          </p>
        )}

        {changingStage && (
          <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
            <Label htmlFor="change-stage-select" className="text-sm">
              Change Stage
            </Label>
            <div className="flex gap-2">
              <Select
                value={selectedStage}
                onValueChange={(v) =>
                  setSelectedStage(v as RestorableStageValue)
                }
              >
                <SelectTrigger id="change-stage-select" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {restorableStageValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {STAGE_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => handleConfirmStage(selectedStage)}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-destructive text-center text-sm">{error}</p>
        )}

        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <Link
              href={`${basePath}/${dishId}/edit?versionId=${dishVersionId}&sessionId=${sessionId}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit {label}
            </Link>
          </Button>
          {!changingStage && (
            <Button variant="outline" onClick={() => setChangingStage(true)}>
              Change Stage
            </Button>
          )}
          <Button asChild>
            <Link href={`${basePath}/${dishId}`}>Done</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-foreground text-xl font-semibold text-balance">
          How did {dishTitle} go?
        </h1>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">
            {outcome === "COMPLETED" ? "Completed" : "Ended early"}
          </Badge>
        </div>
      </div>

      {contextUnits.length > 0 && (
        <div className="border-border bg-muted/30 flex flex-col gap-1 rounded-lg border p-3 text-sm">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            This session included
          </p>
          <ul className="flex flex-col gap-1">
            {contextUnits.map((unit) => (
              <li
                key={unit.id}
                className={`flex items-center gap-2 ${unit.completed ? "text-foreground" : "text-muted-foreground"}`}
              >
                {unit.completed ? (
                  <Check
                    className="text-brand-green size-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle className="size-4 shrink-0" aria-hidden="true" />
                )}
                {unit.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Field label="What went well?">
          <Textarea
            value={whatWentWell}
            onChange={(e) => setWhatWentWell(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="What did not go well?">
          <Textarea
            value={whatDidNotGoWell}
            onChange={(e) => setWhatDidNotGoWell(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Anything else?">
          <Textarea
            value={anythingElse}
            onChange={(e) => setAnythingElse(e.target.value)}
            rows={2}
          />
        </Field>
      </div>

      {tasterOptions.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-foreground text-sm font-medium">
            {dishKind === "PART"
              ? `How did ${dishTitle} turn out?`
              : `Would you like to rate ${dishTitle} as a whole?`}
          </p>
          <ul className="flex flex-col gap-1">
            {tasterOptions.map((taster) => (
              <li
                key={taster.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-foreground text-sm">
                  {taster.isOwner ? "You" : taster.name}
                </span>
                <StarRatingInput
                  value={ratingValues[taster.id] ?? null}
                  onChange={(value) =>
                    setRatingValues((prev) => ({ ...prev, [taster.id]: value }))
                  }
                  aria-label={`Rate ${taster.isOwner ? "your own" : taster.name + "'s"} experience`}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group">
        <summary className="text-muted-foreground cursor-pointer text-sm select-none">
          Add how much it made or adjust the time
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex gap-2">
            <Field label="How much did it make?" className="flex-1">
              <Input
                inputMode="decimal"
                value={amountQuantity}
                onChange={(e) => setAmountQuantity(e.target.value)}
                placeholder="e.g. 5"
              />
            </Field>
            <Field label="Unit" className="w-28">
              <Input
                value={amountUnit}
                onChange={(e) => setAmountUnit(e.target.value)}
                placeholder="servings"
              />
            </Field>
          </div>
          <Field
            label={
              rawElapsedSeconds != null
                ? `Adjust time (recorded ${formatMinutes(rawElapsedSeconds)} min)`
                : "Adjust time (minutes)"
            }
          >
            <Input
              inputMode="decimal"
              value={adjustedMinutes}
              onChange={(e) => setAdjustedMinutes(e.target.value)}
              placeholder={formatMinutes(rawElapsedSeconds) || "minutes"}
            />
          </Field>
        </div>
      </details>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save Review"}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            asChild
            disabled={isPending}
          >
            <Link href={`/cook/${sessionId}`}>Not now</Link>
          </Button>
          {hasExistingReview && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={isPending}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Review?</DialogTitle>
            <DialogDescription>
              This removes the Review text and every rating you entered here —
              rating summaries for {dishTitle} will recalculate. The Cooking
              Session, checklist progress, timers, and Cooking notes are not
              affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-foreground text-sm font-normal">{label}</Label>
      {children}
    </div>
  );
}
