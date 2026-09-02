"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { QuantityInput } from "@/components/domain/dish/number-field";
import { remainingServings } from "@/lib/mealplans/allocation";

/**
 * The Meal Plan Schedule's Add/Edit Plan modal (Meal Plan QA redesign §4) —
 * one scheduled meal per submission, replacing the former multi-plan
 * in-modal list/"Plan meals" batch workflow. Shared by Create and Edit via
 * `MealPlanEditor`; Meal Plan Details has no Add/Edit path (it's read-only
 * execution, §5), so this only ever lives on the editor.
 */

export type PlanMealOption = {
  key: string;
  title: string;
  versionLabel: string;
  targetYieldQuantity: number | null;
};

export type PlanFormValues = {
  label: string;
  mealKey: string;
  date: string;
  servings: number;
};

export type PlanScheduleItem = PlanFormValues & { localId: string };

export function PlanModal({
  mode,
  initialValues,
  initialDate,
  mealOptions,
  schedule,
  planStartDate,
  planEndDate,
  onOpenChangeAction,
  onSubmitAction,
}: {
  mode: "add" | "edit";
  /** Present in "edit" mode; also carries the schedule item's own `localId`
   * so it can be excluded from the already-scheduled-servings total below. */
  initialValues: PlanScheduleItem | null;
  /** "add" mode only — prepopulates Date when opened from a day card's own
   * `+ Add meal` action (§4) rather than the section-level `Add plan`. */
  initialDate?: string;
  mealOptions: PlanMealOption[];
  /** The Schedule section's live draft, used only to compute "servings
   * already scheduled for this Meal" (excluding `initialValues` itself). */
  schedule: PlanScheduleItem[];
  planStartDate: string;
  planEndDate: string;
  onOpenChangeAction: (open: boolean) => void;
  onSubmitAction: (values: PlanFormValues) => void;
}) {
  const [label, setLabel] = React.useState(initialValues?.label ?? "");
  const [mealKey, setMealKey] = React.useState<string | null>(
    initialValues?.mealKey ?? mealOptions[0]?.key ?? null,
  );
  const [date, setDate] = React.useState(
    initialValues?.date ?? initialDate ?? planStartDate,
  );
  const [servings, setServings] = React.useState<number | null>(
    initialValues?.servings ?? null,
  );
  const [formError, setFormError] = React.useState<string | null>(null);

  const selectedMeal = mealOptions.find((option) => option.key === mealKey);
  const alreadyScheduled = schedule
    .filter(
      (item) =>
        item.mealKey === mealKey && item.localId !== initialValues?.localId,
    )
    .reduce((sum, item) => sum + item.servings, 0);
  const remaining = selectedMeal
    ? remainingServings(selectedMeal.targetYieldQuantity, alreadyScheduled)
    : null;

  function close() {
    onOpenChangeAction(false);
  }

  function handleSubmit() {
    if (!label.trim()) {
      setFormError("Enter a meal name.");
      return;
    }
    if (!mealKey || !selectedMeal) {
      setFormError("Choose a Dish from this Meal Plan.");
      return;
    }
    if (!date || date < planStartDate || date > planEndDate) {
      setFormError("Choose a date within this Meal Plan's range.");
      return;
    }
    if (servings == null || servings <= 0) {
      setFormError("Enter the servings for this plan.");
      return;
    }
    if (remaining != null && servings > remaining) {
      setFormError(
        `Only ${remaining} serving${remaining === 1 ? "" : "s"} left for this Dish.`,
      );
      return;
    }
    onSubmitAction({ label: label.trim(), mealKey, date, servings });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden px-0"
      >
        <DialogHeader className="bg-muted/50 -mt-4 flex shrink-0 flex-row items-center justify-between gap-2 rounded-t-xl border-b p-4">
          <DialogTitle>
            {mode === "edit" ? "Edit plan" : "Add plan"}
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="-my-1.5">
              <X />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="plan-modal-label">Meal name</FieldLabel>
              <Input
                id="plan-modal-label"
                placeholder="e.g. Monday lunch"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-modal-dish">Dish</FieldLabel>
              <Select
                value={mealKey ?? undefined}
                onValueChange={setMealKey}
                disabled={mealOptions.length === 0}
              >
                <SelectTrigger
                  id="plan-modal-dish"
                  className="w-full max-w-full"
                >
                  <SelectValue
                    placeholder="Choose a Dish"
                    className="truncate"
                  />
                </SelectTrigger>
                <SelectContent className="max-w-[min(24rem,90vw)]">
                  {mealOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      <span className="truncate">
                        {option.title} {option.versionLabel}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="plan-modal-date">Date</FieldLabel>
              <DatePickerField
                id="plan-modal-date"
                value={date}
                onChange={setDate}
                min={planStartDate}
                max={planEndDate}
                ariaLabel="Plan date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-modal-servings">Servings</FieldLabel>
              <QuantityInput
                id="plan-modal-servings"
                className="w-20"
                value={servings}
                onValueChange={setServings}
              />
              {remaining != null && (
                <p className="text-muted-foreground text-xs">
                  {remaining} serving{remaining === 1 ? "" : "s"} left for this
                  Dish.
                </p>
              )}
            </Field>
          </div>

          <FieldError>{formError}</FieldError>
        </div>

        <DialogFooter className="mx-0 shrink-0">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {mode === "edit" ? "Edit plan" : "Add plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
