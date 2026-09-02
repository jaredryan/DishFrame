"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  Soup,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import {
  SemanticChip,
  type ChipSemantic,
} from "@/components/domain/dish/semantic-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CLICKABLE_ROW_CLASS } from "@/components/ui/clickable-row";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { DateRangePickerField } from "@/components/ui/date-range-picker-field";
import { useStepScrollReset } from "@/components/ui/use-step-scroll-reset";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { STAGE_LABEL } from "@/components/domain/dish/stage-badge";
import { FilterPopover } from "@/components/domain/dish/filter-popover";
import {
  SortSelect,
  type SortSelectOption,
} from "@/components/domain/dish/sort-select";
import {
  SelectableDishRow,
  type DishSelectionItem,
} from "@/components/domain/dish/selectable-dish-row";
import { RichVersionPickerField } from "@/components/domain/dish/version-picker-field";
import { QuantityInput } from "@/components/domain/dish/number-field";
import {
  EditableScheduleDayCard,
  groupScheduleByDate,
} from "@/components/domain/mealplans/schedule-shared";
import {
  PlanModal,
  type PlanFormValues,
  type PlanMealOption,
  type PlanScheduleItem,
} from "@/components/domain/mealplans/plan-modal";
import {
  listDishVersionOptions,
  type DishVersionOption,
} from "@/lib/dishes/actions";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import {
  createMealPlan,
  updateMealPlan,
  saveMealPlanEntryChanges,
} from "@/lib/mealplans/actions";
import { formatDateOnly, toIsoDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useUnsavedChangesGuard } from "@/components/domain/dish/use-unsaved-changes-guard";
import {
  matchesRatingFilter,
  ratingFilterValues,
  type RatingFilterValue,
} from "@/lib/dishes/library-filters";
import type {
  MealPlanDetailDto,
  MealPlanEntryDto,
} from "@/lib/mealplans/schema";
import type { MealPlanEntryCandidate } from "@/lib/mealplans/queries";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";
import type {
  TagFilterOption,
  FlavorProfileFilterOption,
  CuisineFilterOption,
} from "@/components/domain/dish/library-filter-bar";

/**
 * Meal Plan create/edit — a single reusable form (Slice 22/23 redesign,
 * Schedule redesign) for both `/meal-plans/new` and `/meal-plans/[id]/edit`.
 * Three sections: Details, Meals (what's being prepared), and Schedule
 * (when/how each Meal's servings are allocated — the former inline
 * `+ Planned meal` UI on each Meal card, now a dedicated section + modal). A
 * new MealPlan record is created only by the final Save action at the
 * bottom; nothing in any section — Details, Meals composition, or the
 * Schedule — reaches the server before that same Save. Every one of those is
 * a local draft, reconciled against `mealPlan` (edit mode) and sent as one
 * batch via `saveMealPlanEntryChanges` at Save time.
 */

const SECTION_HEADING_CLASS = "font-heading text-lg font-medium";

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COOKED: "Cooked",
  SKIPPED: "Skipped",
};

const STATUS_SEMANTIC: Record<string, ChipSemantic> = {
  PLANNED: "blue",
  IN_PROGRESS: "orange",
  COOKED: "green",
  SKIPPED: "neutral",
};

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toIsoDateOnly(start), end: toIsoDateOnly(end) };
}

function formatScale(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function yieldChipLabel(quantity: number | null, unit: string | null): string {
  return quantity != null
    ? `Makes ${quantity} ${unit ?? ""}`.trim()
    : "No specified yield";
}

type DraftEntry = {
  localId: string;
  dishId: string;
  dishVersionId: string;
  title: string;
  versionLabel: string;
  cookDate: string;
  targetYieldQuantity: number | null;
  targetYieldUnit: string | null;
  note: string | null;
};

type MealValues = {
  dishId: string | null;
  dishVersionId: string | null;
  /** Display label for `dishVersionId` — resolved by the picker, since it
   * may be a historical Version, not just the Dish's current one. */
  versionLabel: string;
  cookDate: string;
  targetYieldQuantity: number | null;
  targetYieldUnit: string | null;
  note: string | null;
};

type MealModalState =
  | { key: string; mode: "add" }
  | {
      key: string;
      mode: "edit-draft";
      localId: string;
      initialValues: MealValues;
    }
  | {
      key: string;
      mode: "edit-entry";
      entryId: string;
      initialValues: MealValues;
    };

// Schedule redesign — one-plan-per-modal state for the Add/Edit Plan
// modal (plan-modal.tsx).
type PlanModalState =
  | { key: string; mode: "add"; initialDate?: string }
  | { key: string; mode: "edit"; item: ScheduleItem };

// Schedule redesign — one Schedule-section entry. `mealKey` addresses the
// Meal it's scheduled against: a saved entry's `entry.id`, or (an
// as-yet-unsaved Meal) a `DraftEntry.localId` — resolved to a real entryId
// server-side at Save time (`saveMealPlanEntryChanges`'s `localKey`). Same
// shape as `PlanScheduleItem` (plan-modal.tsx) — reused directly rather
// than duplicated.
type ScheduleItem = PlanScheduleItem;

// The Plan modal's "Dish from this Meal Plan" picker options — every
// current Meal, saved or still-drafted, in whichever form the page's own
// edits currently show it (title/target yield included). Same shape as
// `PlanMealOption` (plan-modal.tsx).
type MealOption = PlanMealOption;

type StoredDraft = {
  title: string;
  startDate: string;
  endDate: string;
  draftEntries: DraftEntry[];
  removedEntryIds: string[];
  versionUpdateEntryIds: string[];
  entryEdits: Record<string, MealValues>;
  schedule: ScheduleItem[];
};

// A queued edit for an already-saved entry may also change which Recipe/
// Part — or which of its Versions — it points to; `updateMealPlanEntry` has
// no way to repoint an entry, so either kind of change is applied at Save
// time as remove-then-add (a new entry) instead. Everything else about the
// edit reaches the server as an ordinary `updateMealPlanEntry` patch.
function mergeEntryEdit(
  entry: MealPlanEntryDto,
  edit: MealValues | undefined,
  candidates: MealPlanEntryCandidate[],
): MealPlanEntryDto {
  if (!edit) return entry;
  const dishChanged = edit.dishId !== entry.dishId;
  const candidate = dishChanged
    ? candidates.find((c) => c.dishId === edit.dishId)
    : null;
  return {
    ...entry,
    dishId: edit.dishId,
    dishVersionId: edit.dishVersionId,
    dishKind: candidate?.kind ?? entry.dishKind,
    title: candidate?.title ?? entry.title,
    versionLabel: edit.versionLabel || entry.versionLabel,
    cookDate: edit.cookDate,
    targetYieldQuantity: edit.targetYieldQuantity,
    targetYieldUnit: edit.targetYieldUnit,
    note: edit.note,
  };
}

// Schedule redesign — groups the Schedule section's flat `schedule` draft by
// Meal for the batch save call, sending one assignment (possibly empty) per
// `mealKey` in `mealKeys` so a Meal whose schedule was cleared to nothing
// still reaches the server as an explicit "no entries" rather than being
// silently skipped.
// Client-side mirror of `setScheduleForEntry`'s server-side yield check
// (service.ts) — catches a Meal whose target yield was edited down below
// what's already scheduled for it *before* Save, rather than letting the
// batch call reject it server-side and surface only the generic "some meal
// changes could not be applied" message. The server-side check stays as the
// final integrity guard regardless.
function findScheduleYieldConflict(
  mealOptions: MealOption[],
  schedule: ScheduleItem[],
): { option: MealOption; totalServings: number } | null {
  for (const option of mealOptions) {
    if (option.targetYieldQuantity == null) continue;
    const totalServings = schedule
      .filter((item) => item.mealKey === option.key)
      .reduce((sum, item) => sum + item.servings, 0);
    if (totalServings > option.targetYieldQuantity) {
      return { option, totalServings };
    }
  }
  return null;
}

// Every scheduled meal's position within its own calendar date (§4's
// per-day drag order) is derived from `schedule`'s current array order —
// not stored as a separate field on `ScheduleItem` — computed once here
// over the *whole* draft so it's correct across Meals/entries sharing a
// date, then attached per-item when each Meal's own slice is built below.
function sortOrderByLocalId(schedule: ScheduleItem[]): Map<string, number> {
  const nextIndexByDate = new Map<string, number>();
  const result = new Map<string, number>();
  for (const item of schedule) {
    const index = nextIndexByDate.get(item.date) ?? 0;
    result.set(item.localId, index);
    nextIndexByDate.set(item.date, index + 1);
  }
  return result;
}

function buildScheduleAssignments(
  mealKeys: string[],
  schedule: ScheduleItem[],
) {
  const sortOrders = sortOrderByLocalId(schedule);
  return mealKeys.map((mealKey) => ({
    mealKey,
    meals: schedule
      .filter((item) => item.mealKey === mealKey)
      .map((item) => ({
        label: item.label,
        date: item.date,
        servings: item.servings,
        sortOrder: sortOrders.get(item.localId) ?? 0,
      })),
  }));
}

export function MealPlanEditor(
  props: (
    { mode: "create" } | { mode: "edit"; mealPlan: MealPlanDetailDto }
  ) & {
    candidates: MealPlanEntryCandidate[];
    tagOptions: TagFilterOption[];
    cuisineOptions: CuisineFilterOption[];
    flavorProfileOptions: FlavorProfileFilterOption[];
  },
) {
  const router = useRouter();
  const mealPlan = props.mode === "edit" ? props.mealPlan : null;
  const { candidates, tagOptions, cuisineOptions, flavorProfileOptions } =
    props;
  const storageKey = mealPlan
    ? `dishframe:mealplan-draft:edit:${mealPlan.id}`
    : "dishframe:mealplan-draft:new";

  const initial = mealPlan
    ? {
        title: mealPlan.title,
        start: dateOnly(mealPlan.startDate),
        end: dateOnly(mealPlan.endDate),
      }
    : { title: "This week", ...defaultRange() };

  const [title, setTitle] = React.useState(initial.title);
  const [startDate, setStartDate] = React.useState(initial.start);
  const [endDate, setEndDate] = React.useState(initial.end);
  // Create keeps the Details form expanded inline; Edit shows the compact
  // summary and opens the same fields in an `Edit details` modal instead
  // (§1 — a small interaction change, not a form redesign).
  const [detailsExpanded, setDetailsExpanded] = React.useState(
    props.mode === "create",
  );
  const [detailsModalOpen, setDetailsModalOpen] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const detailsSnapshotRef = React.useRef({ title, startDate, endDate });

  // Draft-only additions (either mode) plus, in edit mode, queued removals,
  // edits, and Version-adoptions for already-saved entries — none of these
  // reach the server until the final Save below.
  const [draftEntries, setDraftEntries] = React.useState<DraftEntry[]>([]);
  const [removedEntryIds, setRemovedEntryIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [versionUpdateEntryIds, setVersionUpdateEntryIds] = React.useState<
    Set<string>
  >(new Set());
  const [entryEdits, setEntryEdits] = React.useState<
    Record<string, MealValues>
  >({});
  const [mealModal, setMealModal] = React.useState<MealModalState | null>(null);

  // Schedule redesign — the whole Schedule section's draft, seeded (edit
  // mode) from every existing entry's `plannedMeals`, keyed back to that
  // entry's id. `initialScheduleRef` is that starting snapshot, used to
  // detect a schedule-only change (see `isDirty`/`hasEntryChanges` below).
  const [schedule, setSchedule] = React.useState<ScheduleItem[]>(() =>
    mealPlan
      ? mealPlan.entries
          .flatMap((entry) =>
            entry.plannedMeals.map((meal) => ({
              item: {
                localId: meal.id,
                mealKey: entry.id,
                label: meal.label,
                date: dateOnly(meal.date),
                servings: meal.servings,
              },
              // Sort key only, used to reconstruct the correct cross-entry
              // day order below — `ScheduleItem` itself carries no
              // `sortOrder` field (see `sortOrderByLocalId` above).
              sortOrder: meal.sortOrder,
            })),
          )
          .sort(
            (a, b) =>
              a.item.date.localeCompare(b.item.date) ||
              a.sortOrder - b.sortOrder,
          )
          .map(({ item }) => item)
      : [],
  );
  const [initialScheduleSnapshot] = React.useState(() =>
    JSON.stringify(schedule),
  );
  const [planModal, setPlanModal] = React.useState<PlanModalState | null>(null);

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Hydrate a locally-stored draft (accidental-refresh recovery) after
  // mount only — reading localStorage during the initial render would
  // diverge from the server-rendered HTML and trip a hydration mismatch.
  const [hydrated, setHydrated] = React.useState(false);

  // One-time post-mount hydration from localStorage (see comment above) —
  // necessarily setState-in-effect since it must run after the SSR'd
  // render to avoid a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<StoredDraft>;
        if (typeof stored.title === "string") setTitle(stored.title);
        if (typeof stored.startDate === "string")
          setStartDate(stored.startDate);
        if (typeof stored.endDate === "string") setEndDate(stored.endDate);
        if (Array.isArray(stored.draftEntries))
          setDraftEntries(stored.draftEntries);
        if (Array.isArray(stored.removedEntryIds))
          setRemovedEntryIds(new Set(stored.removedEntryIds));
        if (Array.isArray(stored.versionUpdateEntryIds))
          setVersionUpdateEntryIds(new Set(stored.versionUpdateEntryIds));
        if (
          stored.entryEdits &&
          typeof stored.entryEdits === "object" &&
          !Array.isArray(stored.entryEdits)
        )
          setEntryEdits(stored.entryEdits);
        if (Array.isArray(stored.schedule)) setSchedule(stored.schedule);
      }
    } catch {
      // Corrupt/incompatible stored draft — ignore, keep defaults.
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    if (!hydrated) return;
    const stored: StoredDraft = {
      title,
      startDate,
      endDate,
      draftEntries,
      removedEntryIds: [...removedEntryIds],
      versionUpdateEntryIds: [...versionUpdateEntryIds],
      entryEdits,
      schedule,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      // Storage unavailable/full — draft simply won't survive a refresh.
    }
  }, [
    hydrated,
    title,
    startDate,
    endDate,
    draftEntries,
    removedEntryIds,
    versionUpdateEntryIds,
    entryEdits,
    schedule,
    storageKey,
  ]);

  function clearDraftStorage() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing to clean up if storage isn't available.
    }
  }

  const scheduleChanged = JSON.stringify(schedule) !== initialScheduleSnapshot;

  const isDirty =
    title !== initial.title ||
    startDate !== initial.start ||
    endDate !== initial.end ||
    draftEntries.length > 0 ||
    removedEntryIds.size > 0 ||
    versionUpdateEntryIds.size > 0 ||
    Object.keys(entryEdits).length > 0 ||
    scheduleChanged;

  const guard = useUnsavedChangesGuard(isDirty && !isSubmitting);

  function discardDraftAndLeave() {
    clearDraftStorage();
    guard.discardChanges();
  }

  function openDetails() {
    detailsSnapshotRef.current = { title, startDate, endDate };
    setDetailsError(null);
    if (props.mode === "edit") {
      setDetailsModalOpen(true);
    } else {
      setDetailsExpanded(true);
    }
  }

  function cancelDetails() {
    const snapshot = detailsSnapshotRef.current;
    setTitle(snapshot.title);
    setStartDate(snapshot.startDate);
    setEndDate(snapshot.endDate);
    setDetailsError(null);
    setDetailsExpanded(false);
    setDetailsModalOpen(false);
  }

  function finishDetails() {
    if (!title.trim()) {
      setDetailsError("Enter a title for this Meal Plan.");
      return;
    }
    if (endDate < startDate) {
      setDetailsError("The end date must be on or after the start date.");
      return;
    }
    setDetailsError(null);
    setDetailsExpanded(false);
    setDetailsModalOpen(false);
  }

  function openAddMeal() {
    setMealModal({ key: crypto.randomUUID(), mode: "add" });
  }

  function openAddPlan(initialDate?: string) {
    setPlanModal({ key: crypto.randomUUID(), mode: "add", initialDate });
  }

  function openEditPlan(item: ScheduleItem) {
    setPlanModal({ key: crypto.randomUUID(), mode: "edit", item });
  }

  function handlePlanSubmit(values: PlanFormValues) {
    if (!planModal) return;
    if (planModal.mode === "add") {
      setSchedule((prev) => [
        ...prev,
        { localId: crypto.randomUUID(), ...values },
      ]);
    } else {
      const editedLocalId = planModal.item.localId;
      setSchedule((prev) =>
        prev.map((item) =>
          item.localId === editedLocalId ? { ...item, ...values } : item,
        ),
      );
    }
    setPlanModal(null);
  }

  function deletePlanItem(localId: string) {
    setSchedule((prev) => prev.filter((item) => item.localId !== localId));
  }

  function reorderScheduleDay(dateIso: string, orderedLocalIds: string[]) {
    setSchedule((prev) => {
      const byId = new Map(prev.map((item) => [item.localId, item]));
      const reordered = orderedLocalIds.map((id) => byId.get(id)!);
      let cursor = 0;
      return prev.map((item) =>
        item.date === dateIso ? reordered[cursor++] : item,
      );
    });
  }

  function openEditDraft(entry: DraftEntry) {
    setMealModal({
      key: crypto.randomUUID(),
      mode: "edit-draft",
      localId: entry.localId,
      initialValues: {
        dishId: entry.dishId,
        dishVersionId: entry.dishVersionId,
        versionLabel: entry.versionLabel,
        cookDate: entry.cookDate,
        targetYieldQuantity: entry.targetYieldQuantity,
        targetYieldUnit: entry.targetYieldUnit,
        note: entry.note,
      },
    });
  }

  function openEditEntry(entry: MealPlanEntryDto) {
    setMealModal({
      key: crypto.randomUUID(),
      mode: "edit-entry",
      entryId: entry.id,
      initialValues: {
        dishId: entry.dishId,
        dishVersionId: entry.dishVersionId,
        versionLabel: entry.versionLabel,
        cookDate: dateOnly(entry.cookDate),
        targetYieldQuantity: entry.targetYieldQuantity,
        targetYieldUnit: entry.targetYieldUnit,
        note: entry.note,
      },
    });
  }

  function handleMealModalSubmit(values: MealValues) {
    if (!mealModal || !values.dishId || !values.dishVersionId) return;
    const candidate = candidates.find((c) => c.dishId === values.dishId);

    if (mealModal.mode === "add") {
      setDraftEntries((prev) => [
        ...prev,
        {
          localId: crypto.randomUUID(),
          dishId: values.dishId!,
          dishVersionId: values.dishVersionId!,
          title: candidate?.title ?? "Untitled",
          versionLabel: values.versionLabel,
          cookDate: values.cookDate,
          targetYieldQuantity: values.targetYieldQuantity,
          targetYieldUnit: values.targetYieldUnit,
          note: values.note,
        },
      ]);
    } else if (mealModal.mode === "edit-draft") {
      setDraftEntries((prev) =>
        prev.map((entry) =>
          entry.localId === mealModal.localId
            ? {
                ...entry,
                dishId: values.dishId!,
                dishVersionId: values.dishVersionId!,
                title: candidate?.title ?? entry.title,
                versionLabel: values.versionLabel,
                cookDate: values.cookDate,
                targetYieldQuantity: values.targetYieldQuantity,
                targetYieldUnit: values.targetYieldUnit,
                note: values.note,
              }
            : entry,
        ),
      );
    } else {
      setEntryEdits((prev) => ({ ...prev, [mealModal.entryId]: values }));
    }
    setMealModal(null);
  }

  function removeDraft(localId: string) {
    setDraftEntries((prev) => prev.filter((e) => e.localId !== localId));
  }

  function queueRemove(entryId: string) {
    setRemovedEntryIds((prev) => new Set(prev).add(entryId));
  }

  function queueVersionUpdate(entryId: string) {
    setVersionUpdateEntryIds((prev) => new Set(prev).add(entryId));
  }

  async function handleFinalSave() {
    setServerError(null);
    if (!title.trim()) {
      setServerError("Enter a title for this Meal Plan.");
      setDetailsExpanded(true);
      return;
    }
    if (endDate < startDate) {
      setServerError("The end date must be on or after the start date.");
      setDetailsExpanded(true);
      return;
    }
    const yieldConflict = findScheduleYieldConflict(mealOptions, schedule);
    if (yieldConflict) {
      const { option, totalServings } = yieldConflict;
      setServerError(
        `Scheduled servings for "${option.title}" (${totalServings}) exceed its target yield of ${option.targetYieldQuantity}. Edit its schedule before saving.`,
      );
      return;
    }

    setIsSubmitting(true);

    if (props.mode === "create") {
      const result = await createMealPlan({ title, startDate, endDate });
      if (result.status !== "success") {
        setServerError(result.message ?? "Could not create this Meal Plan.");
        setIsSubmitting(false);
        return;
      }
      const { mealPlanId } = result;
      // F10 (docs/performance-architecture-audit.md): every draft entry in
      // one request instead of one `addMealPlanEntry` call per entry. Every
      // Meal here is a fresh draft, so every schedule assignment addresses
      // one by its `localId` (resolved server-side to the real entryId it's
      // created with in this same batch).
      if (draftEntries.length > 0) {
        const entriesResult = await saveMealPlanEntryChanges({
          mealPlanId,
          removedEntryIds: [],
          replacedEntries: [],
          updatedEntries: [],
          versionAdoptedEntryIds: [],
          newEntries: draftEntries.map((entry) => ({
            dishId: entry.dishId,
            dishVersionId: entry.dishVersionId,
            cookDate: entry.cookDate,
            targetYieldQuantity: entry.targetYieldQuantity,
            targetYieldUnit: entry.targetYieldUnit,
            note: entry.note,
            localKey: entry.localId,
          })),
          scheduleAssignments: buildScheduleAssignments(
            draftEntries.map((entry) => entry.localId),
            schedule,
          ),
        });
        if (entriesResult.status !== "success" || entriesResult.hadEntryError) {
          setServerError(
            entriesResult.status === "error"
              ? entriesResult.message
              : "The Meal Plan saved, but one meal could not be added.",
          );
        }
      }
      clearDraftStorage();
      router.push(`/meal-plans/${mealPlanId}`);
      router.refresh();
      return;
    }

    if (mealPlan) {
      const detailsChanged =
        title !== initial.title ||
        startDate !== initial.start ||
        endDate !== initial.end;
      if (detailsChanged) {
        const result = await updateMealPlan({
          mealPlanId: mealPlan.id,
          title,
          startDate,
          endDate,
        });
        if (result.status !== "success") {
          setServerError(result.message ?? "Could not save changes.");
          setIsSubmitting(false);
          return;
        }
      }

      // A queued edit that changed the entry's Recipe/Part — or which of its
      // Versions it points to — is applied as remove-then-add
      // (`updateMealPlanEntry` can't repoint an entry or its Version); the
      // server-side batch (`saveMealPlanEntryChanges`) uses
      // `replacedEntries` the same way to skip a Version-adoption for an
      // entry that no longer exists by the time that pass would run.
      const replacedEntries: {
        entryId: string;
        dishId: string;
        dishVersionId: string;
        cookDate: string;
        targetYieldQuantity: number | null;
        targetYieldUnit: string | null;
        note: string | null;
      }[] = [];
      const updatedEntries: {
        entryId: string;
        cookDate: Date;
        targetYieldQuantity: number | null;
        targetYieldUnit: string | null;
        note: string | null;
      }[] = [];
      for (const [entryId, edit] of Object.entries(entryEdits)) {
        if (removedEntryIds.has(entryId) || !edit.dishId || !edit.dishVersionId)
          continue;
        const original = mealPlan.entries.find((e) => e.id === entryId);
        if (!original) continue;
        if (
          edit.dishId !== original.dishId ||
          edit.dishVersionId !== original.dishVersionId
        ) {
          replacedEntries.push({
            entryId,
            dishId: edit.dishId,
            dishVersionId: edit.dishVersionId,
            cookDate: edit.cookDate,
            targetYieldQuantity: edit.targetYieldQuantity,
            targetYieldUnit: edit.targetYieldUnit,
            note: edit.note,
          });
        } else {
          updatedEntries.push({
            entryId,
            cookDate: new Date(edit.cookDate),
            targetYieldQuantity: edit.targetYieldQuantity,
            targetYieldUnit: edit.targetYieldUnit,
            note: edit.note,
          });
        }
      }

      const hasEntryChanges =
        removedEntryIds.size > 0 ||
        replacedEntries.length > 0 ||
        updatedEntries.length > 0 ||
        versionUpdateEntryIds.size > 0 ||
        draftEntries.length > 0 ||
        scheduleChanged;

      // F10: every queued remove/replace/update/adopt-newer-Version/add in
      // one request instead of one server-action call per changed entry.
      // Schedule redesign: the Schedule section's current draft rides along
      // too — one assignment per still-visible Meal (saved or newly drafted)
      // — whenever anything in this batch changed, schedule included.
      if (hasEntryChanges) {
        const visibleMealKeys = [
          ...visibleEntries.map((entry) => entry.id),
          ...draftEntries.map((entry) => entry.localId),
        ];
        const entriesResult = await saveMealPlanEntryChanges({
          mealPlanId: mealPlan.id,
          removedEntryIds: [...removedEntryIds],
          replacedEntries,
          updatedEntries,
          versionAdoptedEntryIds: [...versionUpdateEntryIds],
          newEntries: draftEntries.map((entry) => ({
            dishId: entry.dishId,
            dishVersionId: entry.dishVersionId,
            cookDate: entry.cookDate,
            targetYieldQuantity: entry.targetYieldQuantity,
            targetYieldUnit: entry.targetYieldUnit,
            note: entry.note,
            localKey: entry.localId,
          })),
          scheduleAssignments: buildScheduleAssignments(
            visibleMealKeys,
            schedule,
          ),
        });
        if (entriesResult.status !== "success" || entriesResult.hadEntryError) {
          setServerError(
            entriesResult.status === "error"
              ? entriesResult.message
              : "The Meal Plan saved, but some meal changes could not be applied.",
          );
        }
      }

      clearDraftStorage();
      router.push(`/meal-plans/${mealPlan.id}`);
      router.refresh();
    }
  }

  const cancelHref = mealPlan ? `/meal-plans/${mealPlan.id}` : "/meal-plans";
  const heading =
    props.mode === "create" ? "Create meal plan" : "Edit meal plan";
  const breadcrumbItems = mealPlan
    ? [
        { label: "Meal Plans", href: "/meal-plans" },
        { label: mealPlan.title, href: `/meal-plans/${mealPlan.id}` },
        { label: "Edit" },
      ]
    : [
        { label: "Meal Plans", href: "/meal-plans" },
        { label: "Create meal plan" },
      ];

  const visibleEntries = mealPlan
    ? [...mealPlan.entries]
        .filter((e) => !removedEntryIds.has(e.id))
        .map((e) => mergeEntryEdit(e, entryEdits[e.id], candidates))
        .sort((a, b) => a.cookDate.localeCompare(b.cookDate))
    : [];
  const hasNoMeals = visibleEntries.length === 0 && draftEntries.length === 0;

  // Schedule redesign — every current Meal, saved or still-drafted, as the
  // Schedule modal's "Meal from this Meal Plan" options.
  const mealOptions: MealOption[] = [
    ...visibleEntries.map((entry) => ({
      key: entry.id,
      title: entry.title,
      versionLabel: entry.versionLabel,
      targetYieldQuantity: entry.targetYieldQuantity,
    })),
    ...draftEntries.map((entry) => ({
      key: entry.localId,
      title: entry.title,
      versionLabel: entry.versionLabel,
      targetYieldQuantity: entry.targetYieldQuantity,
    })),
  ];
  const mealTitleByKey = new Map(
    mealOptions.map((option) => [
      option.key,
      `${option.title} ${option.versionLabel}`.trim(),
    ]),
  );
  const scheduleDayGroups = groupScheduleByDate(
    schedule.map((item) => ({
      id: item.localId,
      label: item.label,
      mealTitle: mealTitleByKey.get(item.mealKey) ?? "—",
      servings: item.servings,
      dateIso: item.date,
    })),
  );

  function queueRemoveMeal(entryId: string) {
    queueRemove(entryId);
    setSchedule((prev) => prev.filter((item) => item.mealKey !== entryId));
  }

  function removeDraftMeal(localId: string) {
    removeDraft(localId);
    setSchedule((prev) => prev.filter((item) => item.mealKey !== localId));
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-24">
      <Breadcrumbs items={breadcrumbItems} />
      <h1 className="font-heading text-foreground text-2xl font-semibold">
        {heading}
      </h1>

      <div className="flex flex-col gap-4">
        <h2 className={SECTION_HEADING_CLASS}>Details</h2>
        {props.mode === "create" && detailsExpanded ? (
          <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4">
            <DetailsFormFields
              title={title}
              startDate={startDate}
              endDate={endDate}
              onTitleChange={setTitle}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
            <FieldError>{detailsError}</FieldError>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={finishDetails}>
                Finish details
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelDetails}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-border bg-card flex items-center justify-between gap-4 rounded-xl border p-4">
            <div>
              <p className="text-foreground text-sm font-medium">
                {title || "Untitled Meal Plan"}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatDateOnly(startDate)} – {formatDateOnly(endDate)}
              </p>
            </div>
            <TooltipIconButton
              label="Edit details"
              icon={Pencil}
              onClick={openDetails}
            />
          </div>
        )}

        {props.mode === "edit" && (
          <Dialog
            open={detailsModalOpen}
            onOpenChange={(next) => !next && cancelDetails()}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit details</DialogTitle>
              </DialogHeader>
              <DetailsFormFields
                title={title}
                startDate={startDate}
                endDate={endDate}
                onTitleChange={setTitle}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <FieldError>{detailsError}</FieldError>
              <DialogFooter>
                <Button variant="outline" onClick={cancelDetails}>
                  Cancel
                </Button>
                <Button type="button" onClick={finishDetails}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className={SECTION_HEADING_CLASS}>Meals to cook</h2>
          <Button type="button" size="sm" onClick={openAddMeal}>
            <Plus /> Add meal
          </Button>
        </div>

        {hasNoMeals ? (
          <p className="text-muted-foreground text-sm">
            No meals yet — add one above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 md:items-start xl:grid-cols-3">
            {visibleEntries.map((entry) => (
              <EditEntryCard
                key={entry.id}
                entry={entry}
                versionUpdateQueued={versionUpdateEntryIds.has(entry.id)}
                onQueueRemove={() => queueRemoveMeal(entry.id)}
                onQueueVersionUpdate={() => queueVersionUpdate(entry.id)}
                onEdit={() => openEditEntry(entry)}
              />
            ))}
            {draftEntries.map((entry) => (
              <DraftEntryCard
                key={entry.localId}
                entry={entry}
                showDraftBadge={props.mode === "edit"}
                onRemove={() => removeDraftMeal(entry.localId)}
                onEdit={() => openEditDraft(entry)}
              />
            ))}
          </ul>
        )}

        <MealPickerModal
          key={mealModal?.key ?? "closed"}
          open={mealModal !== null}
          mode={mealModal?.mode === "add" || !mealModal ? "add" : "edit"}
          candidates={candidates}
          tagOptions={tagOptions}
          cuisineOptions={cuisineOptions}
          flavorProfileOptions={flavorProfileOptions}
          initialValues={
            mealModal && mealModal.mode !== "add"
              ? mealModal.initialValues
              : null
          }
          onOpenChange={(next) => {
            if (!next) setMealModal(null);
          }}
          onSubmit={handleMealModalSubmit}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className={SECTION_HEADING_CLASS}>Schedule</h2>
          <Button
            type="button"
            size="sm"
            disabled={mealOptions.length === 0}
            onClick={() => openAddPlan()}
          >
            <Plus /> Add plan
          </Button>
        </div>

        {scheduleDayGroups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            There is no schedule for this meal plan.
          </p>
        ) : (
          <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {scheduleDayGroups.map((group) => (
              <EditableScheduleDayCard
                key={group.dateIso}
                dateIso={group.dateIso}
                items={group.items}
                onAddMealAction={() => openAddPlan(group.dateIso)}
                onEditItemAction={(id) => {
                  const item = schedule.find((s) => s.localId === id);
                  if (item) openEditPlan(item);
                }}
                onDeleteItemAction={deletePlanItem}
                onReorderAction={(orderedIds) =>
                  reorderScheduleDay(group.dateIso, orderedIds)
                }
              />
            ))}
          </ul>
        )}

        {planModal && (
          <PlanModal
            key={planModal.key}
            mode={planModal.mode}
            initialValues={planModal.mode === "edit" ? planModal.item : null}
            initialDate={
              planModal.mode === "add" ? planModal.initialDate : undefined
            }
            mealOptions={mealOptions}
            schedule={schedule}
            planStartDate={startDate}
            planEndDate={endDate}
            onOpenChangeAction={(next) => {
              if (!next) setPlanModal(null);
            }}
            onSubmitAction={handlePlanSubmit}
          />
        )}
      </div>

      <div className="bg-background/95 sticky bottom-0 flex items-center justify-between gap-4 border-t py-4 backdrop-blur-sm">
        {serverError ? (
          <p
            role="alert"
            className="text-destructive-text flex items-center gap-2 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" className="min-w-fit" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
          <Button
            type="button"
            className="min-w-fit"
            onClick={handleFinalSave}
            loading={isSubmitting}
          >
            {props.mode === "create" ? "Create meal plan" : "Save"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={guard.isPromptOpen}
        onOpenChangeAction={(open) => !open && guard.keepEditing()}
        title="Discard unsaved changes?"
        description="You have unsaved changes to this Meal Plan. If you leave now, they will be lost."
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        destructive
        onConfirmAction={discardDraftAndLeave}
      />
    </div>
  );
}

/** Shared Details form body (§1) — the same fields/order/validation in
 * both Create's inline treatment and Edit's `Edit details` modal. */
function DetailsFormFields({
  title,
  startDate,
  endDate,
  onTitleChange,
  onStartDateChange,
  onEndDateChange,
}: {
  title: string;
  startDate: string;
  endDate: string;
  onTitleChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="meal-plan-title">Title</FieldLabel>
        <Input
          id="meal-plan-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          maxLength={120}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="meal-plan-start">Start date – End date</FieldLabel>
        <DateRangePickerField
          startId="meal-plan-start"
          endId="meal-plan-end"
          startValue={startDate}
          endValue={endDate}
          onStartChangeAction={onStartDateChange}
          onEndChangeAction={onEndDateChange}
        />
      </Field>
    </div>
  );
}

/**
 * The chosen-meal card's right-side actions (Slice 24 redesign) — the
 * standard vertically centered icon-action group, replacing the former
 * large text-action row.
 */
function MealCardActions({
  showSync,
  syncQueued,
  onSync,
  onEdit,
  onRemove,
}: {
  showSync: boolean;
  syncQueued: boolean;
  onSync: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <TooltipIconButton label="Edit meal" icon={Pencil} onClick={onEdit} />
      {showSync && (
        <TooltipIconButton
          label="Sync to latest version"
          tooltip={syncQueued ? "Sync queued" : "Sync to latest version"}
          icon={RefreshCw}
          disabled={syncQueued}
          onClick={onSync}
        />
      )}
      <TooltipIconButton
        label="Remove meal"
        icon={Trash2}
        onClick={onRemove}
        className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
      />
    </div>
  );
}

function DraftEntryCard({
  entry,
  showDraftBadge,
  onRemove,
  onEdit,
}: {
  entry: DraftEntry;
  showDraftBadge?: boolean;
  onRemove: () => void;
  onEdit: () => void;
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Edit ${entry.title}`}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-4",
        CLICKABLE_ROW_CLASS,
        "cursor-pointer",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-foreground text-sm font-medium">
          {entry.title}{" "}
          <span className="text-muted-foreground font-normal">
            {entry.versionLabel}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1">
            <CalendarDays className="size-3" aria-hidden="true" />
            {formatDateOnly(entry.cookDate)}
          </Badge>
          <SemanticChip semantic="orange">
            <Soup className="size-3" aria-hidden="true" />
            {yieldChipLabel(entry.targetYieldQuantity, entry.targetYieldUnit)}
          </SemanticChip>
          {showDraftBadge && <Badge variant="outline">Not yet saved</Badge>}
        </div>
        {entry.note && (
          <p className="text-muted-foreground text-xs">{entry.note}</p>
        )}
      </div>
      <MealCardActions
        showSync={false}
        syncQueued={false}
        onSync={() => {}}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </li>
  );
}

/**
 * A persisted Meal (Slice 24 chosen-meal card redesign; Schedule redesign
 * removed the inline `+ Planned meal`/allocation UI this card used to carry
 * — that's now the dedicated Schedule section below, driven off the same
 * data). Every lifecycle/status action (Start cooking, Mark cooked/skipped,
 * Resume session) lives on the read-only View page instead; Sync/Edit/
 * Remove only queue a draft change here, applied at the page's own final
 * Save.
 */
function EditEntryCard({
  entry,
  versionUpdateQueued,
  onQueueRemove,
  onQueueVersionUpdate,
  onEdit,
}: {
  entry: MealPlanEntryDto;
  versionUpdateQueued: boolean;
  onQueueRemove: () => void;
  onQueueVersionUpdate: () => void;
  onEdit: () => void;
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Edit ${entry.title}`}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-4",
        CLICKABLE_ROW_CLASS,
        "cursor-pointer",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-foreground text-sm font-medium">
          {entry.title}{" "}
          <span className="text-muted-foreground font-normal">
            {entry.versionLabel}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <SemanticChip semantic={STATUS_SEMANTIC[entry.status] ?? "neutral"}>
            {STATUS_LABEL[entry.status] ?? entry.status}
          </SemanticChip>
          <Badge variant="outline" className="gap-1">
            <CalendarDays className="size-3" aria-hidden="true" />
            {formatDateOnly(entry.cookDate)}
          </Badge>
          <SemanticChip semantic="orange">
            <Soup className="size-3" aria-hidden="true" />
            {yieldChipLabel(entry.targetYieldQuantity, entry.targetYieldUnit)}
          </SemanticChip>
        </div>
        {entry.dishId == null && (
          <p className="text-destructive-text text-xs">
            Source deleted — kept for history.
          </p>
        )}
      </div>

      <MealCardActions
        showSync={entry.dishId != null}
        syncQueued={versionUpdateQueued}
        onSync={onQueueVersionUpdate}
        onEdit={onEdit}
        onRemove={onQueueRemove}
      />
    </li>
  );
}

type SortProperty = "recentlyCooked" | "rating" | "dateUpdated";
type SortDirectionValue = "asc" | "desc";

const MEAL_SORT_OPTIONS: SortSelectOption<SortProperty>[] = [
  {
    value: "recentlyCooked",
    label: "Recently cooked",
    defaultDirection: "desc",
  },
  { value: "rating", label: "Rating", defaultDirection: "desc" },
  { value: "dateUpdated", label: "Date updated", defaultDirection: "desc" },
];

// The four Recipe-stage options offered by the modal's filter — Archived
// dishes are never candidates for a Meal Plan entry at all (excluded at the
// query level), so there's nothing to filter there.
const MEAL_PICKER_STAGES: StageValue[] = [
  "IDEA",
  "EXPERIMENTAL",
  "PROVEN",
  "ACTIVE",
];

const MEAL_PICKER_KINDS: { value: DishKindValue; label: string }[] = [
  { value: "RECIPE", label: "Recipe" },
  { value: "PART", label: "Part" },
];

const MEAL_PICKER_RATING_LABEL: Record<RatingFilterValue, string> = {
  UNRATED: "Unrated",
  THREE_PLUS: "3★ and up",
  FOUR_PLUS: "4★ and up",
  FIVE: "5★ only",
};

function toggledSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * Rating filter, restyled onto the same Button/Popover trigger-and-menu
 * system as the other Add/Edit Meal filter controls (mobile-responsiveness
 * correction pass) — it previously used a plain `Select`, which looked
 * inconsistent alongside `FilterPopover`'s Button triggers for no real
 * reason. Single-select (one active rating, or "Any rating"), so it isn't
 * built on `FilterPopover`'s multi-select checkbox list.
 */
function RatingFilterPopover({
  value,
  onChange,
}: {
  value: RatingFilterValue | null;
  onChange: (value: RatingFilterValue | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const activeLabel = value ? MEAL_PICKER_RATING_LABEL[value] : "Any rating";

  function pick(next: RatingFilterValue | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label="Rating filter"
        >
          {activeLabel}
          <ChevronDown
            className="text-muted-foreground size-3.5"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 max-w-none" align="start">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              "hover:bg-muted rounded-md px-2 py-1.5 text-left text-sm",
              value == null && "bg-muted font-medium",
            )}
          >
            Any rating
          </button>
          {ratingFilterValues.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => pick(option)}
              className={cn(
                "hover:bg-muted rounded-md px-2 py-1.5 text-left text-sm",
                value === option && "bg-muted font-medium",
              )}
            >
              {MEAL_PICKER_RATING_LABEL[option]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function compareBySortProperty(
  a: MealPlanEntryCandidate,
  b: MealPlanEntryCandidate,
  property: SortProperty,
): number {
  if (property === "recentlyCooked") {
    const aTime = a.lastCookedAt ? a.lastCookedAt.getTime() : -Infinity;
    const bTime = b.lastCookedAt ? b.lastCookedAt.getTime() : -Infinity;
    return aTime - bTime;
  }
  if (property === "rating") {
    return (a.ratingValue ?? -1) - (b.ratingValue ?? -1);
  }
  return a.updatedAt.getTime() - b.updatedAt.getTime();
}

function candidateToSelectionItem(
  candidate: MealPlanEntryCandidate,
): DishSelectionItem {
  return {
    id: candidate.dishId,
    kind: candidate.kind,
    title: candidate.title,
    versionLabel: candidate.versionLabel,
    stage: candidate.stage,
    cuisineNames: candidate.cuisineNames,
    imageAssetId: candidate.imageAssetId,
    tagNames: candidate.tagNames,
    rating:
      candidate.ratingValue == null
        ? { kind: "none" }
        : { kind: "actual", value: candidate.ratingValue, count: 0 },
  };
}

/**
 * `/meal-plans/new` and `/meal-plans/[id]/edit` share this modal for
 * adding a Meal and (Slice 24) for editing one already on the draft —
 * reusing the Add-Section modal's large-modal structure (sticky header,
 * scrollable middle, sticky footer; `section-editor-dialog.tsx`) since this
 * modal's content can grow just as tall (a full result list plus filters).
 * Submitting only ever hands values back to the caller (`MealPlanEditor`),
 * which decides whether that becomes a new draft entry, an edited draft
 * entry, or a queued edit on an already-saved one.
 *
 * Slice 25 redesign: a compact version of the Recipes/Parts library browser
 * rather than a separate recommendations system — one candidate list, with
 * search/filters/sort all acting directly on it (no second "recommended"
 * list to reconcile). Selecting a row collapses the list down to just that
 * selection, with the shared rich row's × control in place of its usual
 * radio.
 */
function MealPickerModal({
  open,
  mode,
  candidates,
  tagOptions,
  cuisineOptions,
  flavorProfileOptions,
  initialValues,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "add" | "edit";
  candidates: MealPlanEntryCandidate[];
  tagOptions: TagFilterOption[];
  cuisineOptions: CuisineFilterOption[];
  flavorProfileOptions: FlavorProfileFilterOption[];
  initialValues: MealValues | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MealValues) => void;
}) {
  const [cookDate, setCookDate] = React.useState(
    () => initialValues?.cookDate ?? toIsoDateOnly(new Date()),
  );
  const [search, setSearch] = React.useState("");
  const [selectedDishId, setSelectedDishId] = React.useState<string | null>(
    initialValues?.dishId ?? null,
  );
  const [selectedVersionId, setSelectedVersionId] = React.useState<
    string | null
  >(initialValues?.dishVersionId ?? null);
  const [dishVersions, setDishVersions] = React.useState<
    DishVersionOption[] | null
  >(null);
  const [currentVersionId, setCurrentVersionId] = React.useState<string | null>(
    null,
  );
  const [dishVersionsError, setDishVersionsError] = React.useState<
    string | null
  >(null);
  const [targetYieldQuantity, setTargetYieldQuantity] = React.useState<
    number | null
  >(initialValues?.targetYieldQuantity ?? null);
  // Whether the user has actually edited the target-yield field away from
  // its auto-filled default. `computeTargetYieldScaleFactor` (grocery
  // generation) treats a `null` targetYieldQuantity as "always track the
  // source's current authored yield" and an explicit number as a permanent
  // pin — so submitting the auto-filled default as if it were an explicit
  // choice would silently pin every un-scaled Meal to today's yield instead
  // of following later authored-yield edits. A prefilled edit already has
  // an explicit (or explicitly absent) target yield, so it starts "touched".
  const [targetYieldTouched, setTargetYieldTouched] = React.useState(
    initialValues != null,
  );
  const [note, setNote] = React.useState(initialValues?.note ?? "");

  const [favorites, setFavorites] = React.useState(false);
  const [stageFilter, setStageFilter] = React.useState<Set<StageValue>>(
    () => new Set<StageValue>(["ACTIVE"]),
  );
  const [kindFilter, setKindFilter] = React.useState<Set<DishKindValue>>(
    () => new Set<DishKindValue>(["RECIPE"]),
  );
  const [tagIdFilter, setTagIdFilter] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [cuisineFilter, setCuisineFilter] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [flavorProfileFilter, setFlavorProfileFilter] = React.useState<
    Set<string>
  >(() => new Set());
  const [ratingFilter, setRatingFilter] =
    React.useState<RatingFilterValue | null>(null);
  const [sort, setSort] = React.useState<{
    property: SortProperty;
    direction: SortDirectionValue;
  }>({ property: "recentlyCooked", direction: "asc" });

  const scrollRef = useStepScrollReset(selectedDishId != null);
  const selectedCandidate = candidates.find((c) => c.dishId === selectedDishId);
  // The only piece of `candidates` the version-fetch effect below needs — a
  // stable primitive, so it can react to the selected candidate's kind
  // actually changing without re-running on every unrelated `candidates`
  // array identity change (e.g. a parent re-render).
  const selectedCandidateKind = selectedCandidate?.kind ?? null;
  const selectedVersion = dishVersions?.find((v) => v.id === selectedVersionId);
  // The selected Version's own yield once loaded; falls back to the
  // candidate's (current-Version) yield while versions are still loading.
  const effectiveYieldQuantity =
    selectedVersion?.yieldQuantity ?? selectedCandidate?.yieldQuantity ?? null;
  const effectiveYieldUnit =
    selectedVersion?.yieldUnit ?? selectedCandidate?.yieldUnit ?? null;

  // Fetches the full Version list (each with its own yield) for whichever
  // Recipe/Part is selected — necessarily an effect, since it reacts to
  // `selectedDishId` changing rather than a render-time value.
  React.useEffect(() => {
    // `selectDish` below already clears version state synchronously before
    // `selectedDishId` becomes null, so this effect only needs to fetch.
    if (!selectedDishId || !selectedCandidateKind) return;
    let cancelled = false;
    listDishVersionOptions(selectedCandidateKind, selectedDishId).then(
      (result) => {
        if (cancelled) return;
        if (result.status === "success") {
          setDishVersions(result.versions);
          setCurrentVersionId(result.currentVersionId);
          setSelectedVersionId((prev) => prev ?? result.currentVersionId);
        } else {
          setDishVersionsError(result.message);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedDishId, selectedCandidateKind]);

  function close() {
    onOpenChange(false);
  }

  function selectDish(dishId: string | null) {
    setSelectedDishId(dishId);
    setSelectedVersionId(null);
    setDishVersions(null);
    setCurrentVersionId(null);
    setDishVersionsError(null);
    if (dishId == null) return;
    const candidate = candidates.find((c) => c.dishId === dishId);
    setTargetYieldQuantity(candidate?.yieldQuantity ?? null);
    setTargetYieldTouched(false);
  }

  function selectVersion(versionId: string) {
    setSelectedVersionId(versionId);
    // Untouched (still following "whatever the selected Version yields")
    // tracks the newly selected Version's own yield. A user-set target is
    // preserved as-is — only the derived scale factor below (computed from
    // `effectiveYieldQuantity`, itself derived from `selectedVersionId`)
    // recalculates against the newly selected Version's yield.
    if (!targetYieldTouched) {
      const version = dishVersions?.find((v) => v.id === versionId);
      setTargetYieldQuantity(version?.yieldQuantity ?? null);
    }
  }

  function toggleStage(value: string) {
    const stage = value as StageValue;
    setStageFilter((prev) => toggledSet(prev, stage));
  }

  function toggleKind(value: string) {
    const kind = value as DishKindValue;
    setKindFilter((prev) => toggledSet(prev, kind));
  }

  function toggleTag(value: string) {
    setTagIdFilter((prev) => toggledSet(prev, value));
  }

  function toggleCuisine(value: string) {
    setCuisineFilter((prev) => toggledSet(prev, value));
  }

  function toggleFlavorProfile(value: string) {
    setFlavorProfileFilter((prev) => toggledSet(prev, value));
  }

  function clearFilters() {
    setSearch("");
    setFavorites(false);
    setStageFilter(new Set());
    setKindFilter(new Set());
    setTagIdFilter(new Set());
    setCuisineFilter(new Set());
    setFlavorProfileFilter(new Set());
    setRatingFilter(null);
  }

  const visibleCandidates = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = candidates.filter((candidate) => {
      if (query && !candidate.title.toLowerCase().includes(query)) {
        return false;
      }
      if (stageFilter.size > 0 && !stageFilter.has(candidate.stage)) {
        return false;
      }
      if (kindFilter.size > 0 && !kindFilter.has(candidate.kind)) {
        return false;
      }
      if (favorites && !candidate.isFavorite) return false;
      if (
        cuisineFilter.size > 0 &&
        !candidate.cuisineIds.some((id) => cuisineFilter.has(id))
      ) {
        return false;
      }
      // Tags/Flavor profiles use match-all (AND), mirroring the Recipes/
      // Parts library's own multi-select semantics (§47.6/47.7) — a
      // candidate must carry every selected tag/Flavor profile, not just one.
      if (
        tagIdFilter.size > 0 &&
        ![...tagIdFilter].every((id) => candidate.tagIds.includes(id))
      ) {
        return false;
      }
      if (
        flavorProfileFilter.size > 0 &&
        ![...flavorProfileFilter].every((id) =>
          candidate.flavorProfileValueIds.includes(id),
        )
      ) {
        return false;
      }
      if (
        !matchesRatingFilter(
          candidate.ratingValue == null
            ? { kind: "none" }
            : { kind: "actual", value: candidate.ratingValue, count: 0 },
          ratingFilter,
        )
      ) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const cmp = compareBySortProperty(a, b, sort.property);
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [
    candidates,
    search,
    stageFilter,
    kindFilter,
    favorites,
    cuisineFilter,
    tagIdFilter,
    flavorProfileFilter,
    ratingFilter,
    sort,
  ]);

  const activeFilterChips: {
    key: string;
    label: string;
    onRemove: () => void;
  }[] = [];
  if (search) {
    activeFilterChips.push({
      key: "search",
      label: `“${search}”`,
      onRemove: () => setSearch(""),
    });
  }
  if (favorites) {
    activeFilterChips.push({
      key: "favorites",
      label: "Favorites",
      onRemove: () => setFavorites(false),
    });
  }
  for (const stage of stageFilter) {
    activeFilterChips.push({
      key: `stage-${stage}`,
      label: STAGE_LABEL[stage],
      onRemove: () => toggleStage(stage),
    });
  }
  for (const kind of kindFilter) {
    activeFilterChips.push({
      key: `kind-${kind}`,
      label: kind === "PART" ? "Part" : "Recipe",
      onRemove: () => toggleKind(kind),
    });
  }
  const cuisineNameById = new Map(
    cuisineOptions.map((c) => [c.id, c.displayName]),
  );
  for (const cuisineId of cuisineFilter) {
    activeFilterChips.push({
      key: `cuisine-${cuisineId}`,
      label: cuisineNameById.get(cuisineId) ?? "Cuisine",
      onRemove: () => toggleCuisine(cuisineId),
    });
  }
  const tagNameById = new Map(tagOptions.map((t) => [t.id, t.displayName]));
  for (const tagId of tagIdFilter) {
    activeFilterChips.push({
      key: `tag-${tagId}`,
      label: tagNameById.get(tagId) ?? "Tag",
      onRemove: () => toggleTag(tagId),
    });
  }
  const flavorProfileNameById = new Map(
    flavorProfileOptions.map((v) => [v.id, v.displayName]),
  );
  for (const flavorProfileId of flavorProfileFilter) {
    activeFilterChips.push({
      key: `flavor-${flavorProfileId}`,
      label: flavorProfileNameById.get(flavorProfileId) ?? "Flavor profile",
      onRemove: () => toggleFlavorProfile(flavorProfileId),
    });
  }
  if (ratingFilter) {
    activeFilterChips.push({
      key: "rating",
      label: MEAL_PICKER_RATING_LABEL[ratingFilter],
      onRemove: () => setRatingFilter(null),
    });
  }

  function handleSubmit() {
    if (!selectedDishId || !selectedVersionId) return;
    onSubmit({
      dishId: selectedDishId,
      dishVersionId: selectedVersionId,
      versionLabel: selectedVersion
        ? formatVersionLabel(
            selectedVersion.majorVersion,
            selectedVersion.minorVersion,
          )
        : (initialValues?.versionLabel ??
          selectedCandidate?.versionLabel ??
          ""),
      cookDate,
      // Only send an explicit target yield if the user actually changed it
      // — leaving the auto-filled default alone means "always follow the
      // source's current authored yield," matching how a scaling-untouched
      // entry has always behaved (see `targetYieldTouched`'s note above).
      targetYieldQuantity: targetYieldTouched ? targetYieldQuantity : null,
      targetYieldUnit: effectiveYieldUnit,
      note: note.trim() || null,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden px-0 sm:max-w-3xl"
      >
        <DialogHeader className="bg-muted/50 -mt-4 flex shrink-0 flex-row items-center justify-between gap-2 rounded-t-xl border-b p-4">
          <DialogTitle>
            {mode === "edit" ? "Edit meal" : "Add meal"}
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="-my-1.5">
              <X />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-4"
        >
          <Field>
            <FieldLabel htmlFor="meal-modal-cook-date">Cook date</FieldLabel>
            <DatePickerField
              id="meal-modal-cook-date"
              value={cookDate}
              onChange={setCookDate}
              ariaLabel="Cook date"
            />
          </Field>

          {selectedDishId && selectedCandidate ? (
            <div className="flex flex-col gap-4">
              <SelectableDishRow
                item={candidateToSelectionItem(selectedCandidate)}
                selectionControl="remove"
                onRemove={() => selectDish(null)}
              />

              <p className="text-muted-foreground text-sm">
                {effectiveYieldQuantity != null
                  ? `Makes ${effectiveYieldQuantity} ${effectiveYieldUnit ?? ""}`.trim()
                  : "No specified yield for this Recipe/Part."}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {dishVersionsError ? (
                  <p className="text-destructive-text text-sm">
                    {dishVersionsError}
                  </p>
                ) : (
                  <RichVersionPickerField
                    id="meal-modal-version"
                    versions={dishVersions ?? []}
                    currentVersionId={currentVersionId}
                    value={selectedVersionId ?? undefined}
                    onChangeAction={selectVersion}
                    disabled={!dishVersions}
                  />
                )}

                <Field>
                  <FieldLabel htmlFor="meal-modal-target-yield">
                    Target yield
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <QuantityInput
                      id="meal-modal-target-yield"
                      className="w-13"
                      value={targetYieldQuantity}
                      onValueChange={(value) => {
                        setTargetYieldTouched(true);
                        setTargetYieldQuantity(value);
                      }}
                    />
                    {effectiveYieldUnit && (
                      <span className="text-muted-foreground text-sm">
                        {effectiveYieldUnit}
                        {effectiveYieldQuantity != null &&
                          effectiveYieldQuantity > 0 &&
                          targetYieldQuantity != null && (
                            <>
                              {" "}
                              · Scale recipe by{" "}
                              {formatScale(
                                targetYieldQuantity / effectiveYieldQuantity,
                              )}
                              ×
                            </>
                          )}
                      </span>
                    )}
                  </div>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="meal-modal-note">Note</FieldLabel>
                <Input
                  id="meal-modal-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="bg-popover sticky top-0 z-10 flex flex-col gap-3 pb-2">
                <Field>
                  <FieldLabel htmlFor="meal-modal-search">Search</FieldLabel>
                  <SearchInput
                    id="meal-modal-search"
                    placeholder="Search your Recipes and Parts…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <FilterPopover
                    label="Recipe stage"
                    options={MEAL_PICKER_STAGES.map((stage) => ({
                      value: stage,
                      label: STAGE_LABEL[stage],
                    }))}
                    selected={stageFilter}
                    onToggleAction={toggleStage}
                    onClearAction={() => setStageFilter(new Set())}
                  />
                  <FilterPopover
                    label="Recipe / Part"
                    options={MEAL_PICKER_KINDS}
                    selected={kindFilter}
                    onToggleAction={toggleKind}
                  />
                  <FilterPopover
                    label="Tags"
                    options={tagOptions.map((tag) => ({
                      value: tag.id,
                      label: tag.displayName,
                    }))}
                    selected={tagIdFilter}
                    onToggleAction={toggleTag}
                    emptyMessage="No tags yet."
                    specialOption={{
                      label: "Favorites",
                      checked: favorites,
                      onToggle: () => setFavorites((prev) => !prev),
                    }}
                  />
                  <FilterPopover
                    label="Cuisine"
                    options={cuisineOptions.map((cuisine) => ({
                      value: cuisine.id,
                      label: cuisine.displayName,
                    }))}
                    selected={cuisineFilter}
                    onToggleAction={toggleCuisine}
                    emptyMessage="No Cuisines yet."
                  />
                  <FilterPopover
                    label="Flavor profiles"
                    options={flavorProfileOptions.map((value) => ({
                      value: value.id,
                      label: value.displayName,
                    }))}
                    selected={flavorProfileFilter}
                    onToggleAction={toggleFlavorProfile}
                    emptyMessage="No Flavor profiles yet."
                  />
                  <RatingFilterPopover
                    value={ratingFilter}
                    onChange={setRatingFilter}
                  />
                </div>

                <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeFilterChips.length > 0 ? (
                      <>
                        {activeFilterChips.map((chip) => (
                          <Badge
                            key={chip.key}
                            variant="outline"
                            className="bg-primary/15 text-brand-blue-text gap-1 border-transparent pr-1 text-xs"
                          >
                            {chip.label}
                            <button
                              type="button"
                              onClick={chip.onRemove}
                              aria-label={`Remove ${chip.label} filter`}
                              className="hover:bg-primary/20 cursor-pointer rounded-full p-0.5"
                            >
                              <X className="size-3" aria-hidden="true" />
                            </button>
                          </Badge>
                        ))}
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-muted-foreground text-xs hover:underline"
                        >
                          Clear
                        </button>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        No filters applied
                      </span>
                    )}
                  </div>
                  <SortSelect
                    id="meal-modal-sort"
                    property={sort.property}
                    direction={sort.direction}
                    options={MEAL_SORT_OPTIONS}
                    onChangeAction={setSort}
                    triggerClassName="w-44"
                  />
                </div>
              </div>

              {visibleCandidates.length === 0 ? (
                candidates.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    You don&apos;t have any Recipes or Parts yet.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No matches — try adjusting the filters above.
                  </p>
                )
              ) : (
                <ul className="flex flex-col gap-1">
                  {visibleCandidates.slice(0, 20).map((candidate) => (
                    <li key={candidate.dishId}>
                      <SelectableDishRow
                        item={candidateToSelectionItem(candidate)}
                        selectionControl="radio"
                        selected={false}
                        onSelect={() => selectDish(candidate.dishId)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 shrink-0">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedDishId || !selectedVersionId}
            onClick={handleSubmit}
          >
            {mode === "edit" ? "Save changes" : "Add meal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
