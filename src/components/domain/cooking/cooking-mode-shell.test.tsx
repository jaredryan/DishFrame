import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CookingModeShell,
  type CookingModeUnit,
} from "@/components/domain/cooking/cooking-mode-shell";
import { toggleChecklistItem } from "@/lib/cooking/actions";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/cooking/actions", () => ({
  toggleChecklistItem: vi.fn(async () => ({ status: "success" })),
  setUnitCompletion: vi.fn(async () => ({ status: "success" })),
  updateSessionScale: vi.fn(async () => ({ status: "success" })),
  updateUnitScale: vi.fn(async () => ({ status: "success" })),
  createTimer: vi.fn(async () => ({ status: "success" })),
  renameTimer: vi.fn(async () => ({ status: "success" })),
  startTimer: vi.fn(async () => ({ status: "success" })),
  pauseTimer: vi.fn(async () => ({ status: "success" })),
  resetTimer: vi.fn(async () => ({ status: "success" })),
  adjustTimer: vi.fn(async () => ({ status: "success" })),
  dismissTimer: vi.fn(async () => ({ status: "success" })),
  endCookingSession: vi.fn(async () => ({ status: "success" })),
  addSessionUnits: vi.fn(async () => ({ status: "success" })),
  removeSessionUnit: vi.fn(async () => ({ status: "success" })),
  restoreSessionUnit: vi.fn(async () => ({ status: "success" })),
  reorderSessionUnits: vi.fn(async () => ({ status: "success" })),
  deleteCookingSession: vi.fn(async () => ({ status: "success" })),
}));

const mockedToggle = vi.mocked(toggleChecklistItem);

function unit(overrides: Partial<CookingModeUnit>): CookingModeUnit {
  return {
    id: "unit-1",
    label: "Prep",
    sourceDishTitle: "Test Bowl",
    sourceDishVersionLabel: "V1",
    removedAt: null,
    removedAfterProgress: false,
    completedAt: null,
    scaleFactor: 1,
    outputQuantity: null,
    outputUnit: null,
    checklistItems: [],
    timers: [],
    ...overrides,
  };
}

const baseProps = {
  sessionId: "session-1",
  state: "IN_PROGRESS" as const,
  isActive: true,
  startedAt: new Date().toISOString(),
  endedAt: null,
  dishId: "dish-1",
  dishTitle: "Test Bowl",
  dishKind: "RECIPE" as const,
  versionLabel: "V1",
  addableUnits: [],
  sessionScaleFactor: 1,
  sourceOutputQuantity: null,
  sourceOutputUnit: null,
  timerSoundEnabled: true,
};

/**
 * PRODUCT_SPEC.md §28.4 — quick unit-focus switching within one or two
 * actions, and §28.1's optional persisted checkoffs.
 */
describe("CookingModeShell", () => {
  it("switches the focused unit in one tap, showing only that unit's checklist", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        id: "unit-1",
        label: "Prep",
        checklistItems: [
          {
            id: "item-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
      unit({
        id: "unit-2",
        label: "Sauce",
        checklistItems: [
          {
            id: "item-2",
            kind: "INGREDIENT",
            displayText: "Soy sauce",
            displayQuantity: "1",
            displayUnit: "tbsp",
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];

    render(<CookingModeShell {...baseProps} units={units} />);

    expect(screen.getByRole("heading", { name: "Prep" })).toBeInTheDocument();
    expect(screen.getByText(/Rice/)).toBeInTheDocument();
    expect(screen.queryByText(/Soy sauce/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sauce/ }));

    expect(screen.getByRole("heading", { name: "Sauce" })).toBeInTheDocument();
    expect(screen.getByText(/Soy sauce/)).toBeInTheDocument();
    expect(screen.queryByText(/^Rice/)).not.toBeInTheDocument();
  });

  it("persists a checkoff via toggleChecklistItem when an ingredient is checked", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        checklistItems: [
          {
            id: "item-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];

    render(<CookingModeShell {...baseProps} units={units} />);

    await user.click(screen.getByRole("checkbox"));

    expect(mockedToggle).toHaveBeenCalledWith({
      sessionId: "session-1",
      itemId: "item-1",
      checked: true,
    });
  });

  it("disables checkoffs once the session has ended", () => {
    const units: CookingModeUnit[] = [
      unit({
        checklistItems: [
          {
            id: "item-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: new Date().toISOString(),
            conflict: null,
          },
        ],
      }),
    ];

    render(
      <CookingModeShell
        {...baseProps}
        state="COMPLETED"
        isActive={false}
        units={units}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
