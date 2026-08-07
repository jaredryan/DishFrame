"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import { createMealPlan } from "@/lib/mealplans/actions";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Defaults to a one-week range starting today (§76.1's "one week" preset). */
function defaultRange(): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

type OpenState = [boolean, React.Dispatch<React.SetStateAction<boolean>>];

const MealPlanCreateContext = React.createContext<OpenState | null>(null);

/**
 * Shares open/closed state between `MealPlanCreateTrigger` (rendered in the
 * page header, top-right) and `MealPlanCreatePanel` (rendered below, in the
 * page body) so the two can live in different parts of the page layout.
 */
export function MealPlanCreateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = React.useState(false);
  return (
    <MealPlanCreateContext.Provider value={state}>
      {children}
    </MealPlanCreateContext.Provider>
  );
}

function useMealPlanCreateState(): OpenState {
  const context = React.useContext(MealPlanCreateContext);
  if (!context) {
    throw new Error(
      "MealPlanCreateTrigger/Panel must be used within a MealPlanCreateProvider",
    );
  }
  return context;
}

export function MealPlanCreateTrigger() {
  const [, setOpen] = useMealPlanCreateState();
  return (
    <Button onClick={() => setOpen(true)}>
      <CalendarDays />
      Plan meals
    </Button>
  );
}

export function MealPlanCreatePanel() {
  const router = useRouter();
  const [open, setOpen] = useMealPlanCreateState();
  const [title, setTitle] = React.useState("This week");
  const [startDate, setStartDate] = React.useState(() => defaultRange().start);
  const [endDate, setEndDate] = React.useState(() => defaultRange().end);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (!open) {
    return null;
  }

  return (
    <ContentCard className="gap-4">
      <div className="flex items-center justify-between">
        <h2 className={CONTENT_CARD_TITLE_CLASS}>New Meal Plan</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createMealPlan({ title, startDate, endDate });
            if (result.status === "success") {
              router.push(`/meal-plans/${result.mealPlanId}`);
            } else {
              setError(result.message);
            }
          });
        }}
        className="flex flex-col gap-4"
      >
        <Field>
          <FieldLabel htmlFor="meal-plan-title">Title</FieldLabel>
          <Input
            id="meal-plan-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </Field>
        <div className="flex gap-3">
          <Field className="flex-1">
            <FieldLabel htmlFor="meal-plan-start">Start date</FieldLabel>
            <Input
              id="meal-plan-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field className="flex-1">
            <FieldLabel htmlFor="meal-plan-end">End date</FieldLabel>
            <Input
              id="meal-plan-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="text-destructive-text text-sm">{error}</p>}
        <div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create Meal Plan"}
          </Button>
        </div>
      </form>
    </ContentCard>
  );
}
