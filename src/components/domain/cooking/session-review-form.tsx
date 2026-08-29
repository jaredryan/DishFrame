"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Eye,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StarRatingInput } from "@/components/domain/cooking/star-rating-input";
import { CoachMark } from "@/components/onboarding/coach-mark";
import { saveSessionReview, deleteSessionReview } from "@/lib/reviews/actions";
import { createTaster } from "@/lib/tasters/actions";
import { initialCreateTasterActionState } from "@/lib/tasters/schema";
import { updateDishStage } from "@/lib/dishes/actions";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { STAGE_LABEL } from "@/components/domain/dish/stage-badge";
import {
  restorableStageValues,
  type RestorableStageValue,
  type StageValue,
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
  // Post-cook review redesign — the reviewer's own previously saved "This
  // session included" selection. Only present once a Review row already
  // exists; a brand new Review has no saved selection yet to reopen.
  includedUnitIds: string[];
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
  currentStage,
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
  // The stage-editor's neutral default (item 4 of the post-cook review
  // refinement pass) — the Dish's actual current Stage, not a suggestion.
  currentStage: StageValue | null;
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

  // Tasters started as a prop, but adding one in place (without leaving the
  // review) means the list has to live in state so a freshly created taster
  // can be appended and immediately rated — the rest of the review's own
  // state (text fields, ratings already entered) is untouched by this.
  const [tasters, setTasters] = React.useState<TasterOption[]>(tasterOptions);
  const [addingTaster, setAddingTaster] = React.useState(false);
  const [newTasterName, setNewTasterName] = React.useState("");
  const [addTasterError, setAddTasterError] = React.useState<string | null>(
    null,
  );
  const [isAddingTaster, startAddTasterTransition] = React.useTransition();

  function handleAddTaster(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newTasterName.trim();
    if (!name) return;

    setAddTasterError(null);
    startAddTasterTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);
      const result = await createTaster(
        initialCreateTasterActionState,
        formData,
      );
      if (result.status === "success" && result.taster) {
        setTasters((prev) => [
          ...prev,
          {
            id: result.taster!.id,
            name: result.taster!.name,
            isOwner: result.taster!.isOwner,
          },
        ]);
        setNewTasterName("");
        setAddingTaster(false);
      } else {
        setAddTasterError(result.message ?? "Could not add taster.");
      }
    });
  }

  // "This session included" real multi-select checkboxes (post-cook review
  // redesign item 1). Prefilled from the previously saved review selection
  // when reopening an existing Review; otherwise from the session's own
  // recorded completion state — either way, only the initial default: the
  // reviewer can freely check/uncheck from here, and that final selection
  // (not the session's own checklist data) is what gets persisted.
  const [includedUnitIds, setIncludedUnitIds] = React.useState<Set<string>>(
    () =>
      new Set(
        existingReview
          ? existingReview.includedUnitIds
          : contextUnits.filter((u) => u.completed).map((u) => u.id),
      ),
  );

  const [isPending, startTransition] = React.useTransition();
  const [justSaved, setJustSaved] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [isDeleting, startDeleteTransition] = React.useTransition();
  const defaultStage: RestorableStageValue =
    currentStage != null &&
    (restorableStageValues as readonly string[]).includes(currentStage)
      ? (currentStage as RestorableStageValue)
      : "EXPERIMENTAL";
  const [changingStage, setChangingStage] = React.useState(false);
  // Draft dropdown choice, kept separate from the actually-persisted Stage
  // (`persistedStage`) so changing the dropdown can never retroactively
  // change what a success toast reports (post-cook review refinement pass
  // item 4's save-state bug fix).
  const [selectedStage, setSelectedStage] =
    React.useState<RestorableStageValue>(defaultStage);
  const [persistedStage, setPersistedStage] =
    React.useState<RestorableStageValue>(defaultStage);
  const { showToast } = useToast();

  const hasExistingReview =
    existingReview != null || existingRatings.length > 0;

  function toggleIncludedUnit(unitId: string, checked: boolean) {
    setIncludedUnitIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(unitId);
      else next.delete(unitId);
      return next;
    });
  }

  function handleSave() {
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
        includedUnitIds: [...includedUnitIds],
      });
      if (result.status === "error") {
        showToast({ variant: "error", title: result.message });
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
    startDeleteTransition(async () => {
      const result = await deleteSessionReview({ sessionId });
      if (result.status === "error") {
        showToast({ variant: "error", title: result.message });
        return;
      }
      router.push(`/cook/${sessionId}`);
    });
  }

  function handleOpenStageEditor() {
    setSelectedStage(persistedStage);
    setChangingStage(true);
  }

  function handleConfirmStage(stage: RestorableStageValue) {
    startTransition(async () => {
      const result = await updateDishStage(
        dishKind === "PART" ? "PART" : "RECIPE",
        { dishId, stage },
      );
      if (result.status === "error") {
        showToast({
          variant: "error",
          title: result.message ?? "Could not update stage.",
        });
        return;
      }
      // `stage` is the value this exact call confirmed, closed over at call
      // time — never re-read from `selectedStage`, which the reviewer is
      // free to keep changing while this request is in flight.
      setPersistedStage(stage);
      setChangingStage(false);
      showToast({
        variant: "success",
        title: `Stage updated to ${STAGE_LABEL[stage]}.`,
      });
    });
  }

  function handleCancelStage() {
    setSelectedStage(persistedStage);
    setChangingStage(false);
  }

  if (justSaved) {
    const lowerLabel = label.toLowerCase();
    return (
      <div className="bg-background flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="bg-brand-green/10 text-brand-green flex size-12 items-center justify-center rounded-full">
            <Check className="size-6" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-foreground text-xl font-semibold">
            Review saved
          </h1>
          <p className="text-muted-foreground text-sm">
            Your notes and ratings for {dishTitle} are saved.
          </p>
          <p className="text-muted-foreground text-sm">
            Depending on how it went, you can update this {lowerLabel}&apos;s
            stage here.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          {changingStage ? (
            <div className="border-border flex flex-col gap-2 rounded-lg border p-3 text-left">
              <Label htmlFor="change-stage-select" className="text-sm">
                {label} stage
              </Label>
              <Select
                value={selectedStage}
                onValueChange={(v) =>
                  setSelectedStage(v as RestorableStageValue)
                }
              >
                <SelectTrigger
                  id="change-stage-select"
                  className="w-full"
                  aria-label={`${label} stage`}
                >
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCancelStage}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => handleConfirmStage(selectedStage)}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={handleOpenStageEditor}>
              <NotebookPen className="size-4" aria-hidden="true" />
              Change {lowerLabel} stage
            </Button>
          )}

          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href={`${basePath}/${dishId}`}>
                <Eye className="size-4" aria-hidden="true" />
                View {lowerLabel}
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link
                href={`${basePath}/${dishId}/edit?versionId=${dishVersionId}&sessionId=${sessionId}`}
              >
                <Pencil className="size-4" aria-hidden="true" />
                Edit {lowerLabel}
              </Link>
            </Button>
          </div>

          <Button asChild>
            <Link href={`${basePath}/${dishId}/history`}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Done
            </Link>
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

      <CoachMark guideKey="session-review" title="Session Reviews">
        Every field here is optional. What you record — what worked, what
        didn&apos;t, how much you actually used — feeds back into this Recipe or
        Part&apos;s history, so it&apos;s easier to judge next time.
      </CoachMark>

      {contextUnits.length > 0 && (
        <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            This session included
          </p>
          <ul className="flex flex-col gap-2">
            {contextUnits.map((unit) => {
              const checkboxId = `included-unit-${unit.id}`;
              return (
                <li key={unit.id} className="flex items-center gap-2">
                  <Checkbox
                    id={checkboxId}
                    checked={includedUnitIds.has(unit.id)}
                    onCheckedChange={(checked) =>
                      toggleIncludedUnit(unit.id, checked === true)
                    }
                    aria-label={unit.label}
                  />
                  <Label
                    htmlFor={checkboxId}
                    className="text-foreground cursor-pointer text-sm font-normal"
                  >
                    {unit.label}
                  </Label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Field label="What went well?">
          <Textarea
            value={whatWentWell}
            onChange={(e) => setWhatWentWell(e.target.value)}
            rows={2}
            className="bg-card dark:bg-card"
          />
        </Field>
        <Field label="What did not go well?">
          <Textarea
            value={whatDidNotGoWell}
            onChange={(e) => setWhatDidNotGoWell(e.target.value)}
            rows={2}
            className="bg-card dark:bg-card"
          />
        </Field>
        <Field label="Anything else?">
          <Textarea
            value={anythingElse}
            onChange={(e) => setAnythingElse(e.target.value)}
            rows={2}
            className="bg-card dark:bg-card"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-foreground text-sm font-medium">
          {dishKind === "PART"
            ? `How did ${dishTitle} turn out?`
            : `Would you like to rate ${dishTitle} as a whole?`}
        </p>
        {tasters.length > 0 && (
          <ul className="flex flex-col gap-1">
            {tasters.map((taster) => (
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
        )}

        {addingTaster ? (
          <form onSubmit={handleAddTaster} className="flex items-center gap-2">
            <Input
              autoFocus
              value={newTasterName}
              onChange={(e) => setNewTasterName(e.target.value)}
              placeholder="e.g. Mom"
              maxLength={60}
              className="bg-card dark:bg-card h-8 flex-1"
              disabled={isAddingTaster}
            />
            <Button type="submit" size="sm" loading={isAddingTaster}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isAddingTaster}
              onClick={() => {
                setAddingTaster(false);
                setNewTasterName("");
                setAddTasterError(null);
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setAddingTaster(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add a taster
          </Button>
        )}
        {addTasterError && (
          <p role="alert" className="text-destructive-text text-sm">
            {addTasterError}
          </p>
        )}
      </div>

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
                className="bg-card dark:bg-card"
              />
            </Field>
            <Field label="Unit" className="w-28">
              <Input
                value={amountUnit}
                onChange={(e) => setAmountUnit(e.target.value)}
                placeholder="servings"
                className="bg-card dark:bg-card"
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
              className="bg-card dark:bg-card"
            />
          </Field>
        </div>
      </details>

      <div className="flex flex-col gap-2">
        <Button onClick={handleSave} loading={isPending}>
          <Save className="size-4" aria-hidden="true" />
          Save review
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
              className="text-destructive-text hover:text-destructive-text"
              onClick={() => setDeleteOpen(true)}
              disabled={isPending}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChangeAction={setDeleteOpen}
        title="Delete this Review?"
        description={
          <>
            This removes the Review text and every rating you entered here —
            rating summaries for {dishTitle} will recalculate. The Cooking
            Session, checklist progress, timers, and Cooking notes are not
            affected.
          </>
        }
        confirmLabel="Delete Review"
        destructive
        loading={isDeleting}
        onConfirmAction={handleDelete}
      />
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
